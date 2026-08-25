const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')
const logger = require('./common/logger')
const { getConfig, renderPrompt } = require('./common/config')
const FN = 'getMealDetail'

const MENU_API_URL_DEFAULT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const DETAIL_TIMEOUT = 30000
const VALID_MEALS = ['breakfast', 'lunch', 'snack', 'dinner']

const DETAIL_SYSTEM_PROMPT = '你是一位专业的中国增重营养师。根据给定菜品的名称和营养数值，反推合理的食材比例与极简烹饪步骤。你只输出严格 JSON，不输出任何解释或 Markdown。'

function stripCodeFence(content) {
  let clean = content.trim()
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  return clean
}

function sanitizeJson(content) {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
}

function blockingCheck(items, patterns) {
  const regex = new RegExp((patterns || []).join('|'), 'i')
  const blob = (items || []).join(' ')
  if (regex.test(blob)) {
    throw new Error('unsafe ingredient/step detected')
  }
}

async function callGlmDetail(title, calorie, protein, config) {
  const apiKey = process.env.MENU_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) throw new Error('MENU_API_KEY not configured')
  const model = process.env.MENU_MODEL || 'glm-4-flash'
  const apiUrl = process.env.MENU_API_URL || MENU_API_URL_DEFAULT
  const user = renderPrompt(config.prompts.meal_detail, {
    title,
    calorie,
    protein,
    ingredients: config.ingredient_whitelist.join('、')
  })

  const resp = await axios.post(apiUrl, {
    model,
    messages: [
      { role: 'system', content: DETAIL_SYSTEM_PROMPT },
      { role: 'user', content: user }
    ],
    temperature: 0.4,
    max_tokens: 500
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    timeout: DETAIL_TIMEOUT
  })

  const content = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
  if (!content) throw new Error('Empty GLM response')
  return content
}

function parseDetail(raw) {
  const clean = sanitizeJson(stripCodeFence(raw))
  const obj = JSON.parse(clean)
  const ingredients = Array.isArray(obj.ingredients) ? obj.ingredients.filter(x => typeof x === 'string' && x.trim()) : []
  const steps = Array.isArray(obj.steps) ? obj.steps.filter(x => typeof x === 'string' && x.trim()) : []
  if (ingredients.length === 0 || steps.length === 0) throw new Error('详情字段缺失')
  return { ingredients, steps }
}

async function readDoc(date) {
  try {
    const res = await db.collection('daily_menus').doc(date).get()
    return res.data || null
  } catch (e) {
    if (e && e.message && e.message.indexOf('does not exist') !== -1) return null
    throw e
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const { date, meal_type, title, calorie, protein_g } = event
  logger.info(FN, 'invoke', { date, meal_type, title })

  if (!date || !meal_type || !title) {
    const result = { code: 1, message: '缺少必要参数（date/meal_type/title）' }
    logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
    return result
  }
  if (!VALID_MEALS.includes(meal_type)) {
    const result = { code: 2, message: '无效的餐次类型' }
    logger.info(FN, 'return', { code: 2, meal_type, duration: Date.now() - start })
    return result
  }

  try {
    const doc = await readDoc(date)
    if (!doc || !Array.isArray(doc.meals)) {
      const result = { code: 3, message: '当日食谱不存在' }
      logger.info(FN, 'return', { code: 3, duration: Date.now() - start })
      return result
    }

    const idx = doc.meals.findIndex(m => m.meal_type === meal_type && m.title === title)
    if (idx === -1) {
      const result = { code: 4, message: '该菜品不存在于当日食谱' }
      logger.info(FN, 'return', { code: 4, duration: Date.now() - start })
      return result
    }

    const meal = doc.meals[idx]

    if (Array.isArray(meal.ingredients) && meal.ingredients.length > 0 && Array.isArray(meal.steps) && meal.steps.length > 0) {
      const result = { code: 0, message: 'ok', data: { meal_type: meal.meal_type, title: meal.title, calorie: meal.calorie, protein_g: meal.protein_g, ingredients: meal.ingredients, steps: meal.steps, cached: true } }
      logger.info(FN, 'success', { date, meal_type, title, cached: true, duration: Date.now() - start })
      return result
    }

    const calorieNum = Number(calorie) || meal.calorie || 0
    const proteinNum = Number(protein_g) || meal.protein_g || 0
    const config = await getConfig(db)
    const raw = await callGlmDetail(meal.title, calorieNum, proteinNum, config)
    const detail = parseDetail(raw)
    blockingCheck(detail.ingredients, config.blocking_checks)
    blockingCheck(detail.steps, config.blocking_checks)

    const meals = doc.meals.map((m, i) => {
      if (i === idx) return { ...m, ingredients: detail.ingredients, steps: detail.steps }
      return m
    })
    await db.collection('daily_menus').doc(date).update({ data: { meals, updated_at: db.serverDate() } })

    const result = { code: 0, message: 'ok', data: { meal_type, title: meal.title, calorie: meal.calorie, protein_g: meal.protein_g, ingredients: detail.ingredients, steps: detail.steps, cached: false } }
    logger.info(FN, 'success', { date, meal_type, title, cached: false, duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '详情生成失败：' + (err.message || '未知错误') }
  }
}