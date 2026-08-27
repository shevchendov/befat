const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')
const logger = require('./common/logger')
const { getConfig, renderPrompt, SYSTEM_PROMPT, SYSTEM_PROMPT_LOSE, DAILY_MENU_PROMPT_LOSE } = require('./common/config')
const FN = 'getDailyMenu'

// 目标方向归一化：仅 'lose' 视为减重，其余（含 undefined/null/''/老用户缺失）一律兜底为 'gain'
function normalizeGoalType(v) {
  return v === 'lose' ? 'lose' : 'gain'
}

const MENU_API_URL_DEFAULT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MENU_TIMEOUT = 30000
const POLL_INTERVAL = 800
const POLL_MAX = 5
const ZOMBIE_MS = 120000
const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner']
const REFRESH_LIMIT_PER_DAY = 10

function fmtBeijingDate(d = new Date()) {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000)
  return bj.toISOString().slice(0, 10)
}

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

function blockingChecks(meals, patterns) {
  const regex = new RegExp((patterns || []).join('|'), 'i')
  for (const m of meals) {
    const blob = [m.title, ...(m.ingredients || []), ...(m.steps || [])].join(' ')
    if (regex.test(blob)) {
      throw new Error('unsafe ingredient/step detected')
    }
  }
  return meals
}

function pickFallback(menus) {
  return MEAL_ORDER.map(type => {
    const candidates = (menus || []).filter(m => m && m.meal_type === type)
    return candidates[Math.floor(Math.random() * candidates.length)] || {
      meal_type: type, title: '推荐餐', calorie: 400, protein_g: 20, ingredients: [], steps: []
    }
  })
}

async function callGlmMenu(date, config, goalType) {
  const apiKey = process.env.MENU_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) throw new Error('MENU_API_KEY not configured')
  const model = process.env.MENU_MODEL || 'glm-4-flash'
  const apiUrl = process.env.MENU_API_URL || MENU_API_URL_DEFAULT
  const isLose = goalType === 'lose'
  // 减重走本地 lose 常量；增重保留 config.prompts.daily_menu（system_config 动态配置）原逻辑
  const promptTemplate = isLose ? DAILY_MENU_PROMPT_LOSE : config.prompts.daily_menu
  const systemPrompt = isLose ? SYSTEM_PROMPT_LOSE : SYSTEM_PROMPT
  const user = renderPrompt(promptTemplate, {
    date,
    ingredients: config.ingredient_whitelist.join('、')
  })

  const resp = await axios.post(apiUrl, {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: user }
    ],
    temperature: 0.7,
    max_tokens: 350
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    timeout: MENU_TIMEOUT
  })

  const content = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
  if (!content) throw new Error('Empty GLM response')
  return content
}

function parseAndValidate(raw, goalType) {
  const clean = sanitizeJson(stripCodeFence(raw))
  const obj = JSON.parse(clean)
  const meals = obj.meals
  if (!Array.isArray(meals) || meals.length !== 4) throw new Error('meals 须为 4 餐')
  const isLose = goalType === 'lose'

  return MEAL_ORDER.map((type, i) => {
    const m = meals.find(x => x.meal_type === type) || meals[i]
    if (!m) throw new Error('缺少 ' + type)
    const calorie = Math.round(Number(m.calorie) || 0)
    const protein = Math.round((Number(m.protein_g) || 0) * 10) / 10
    // 减重：热量下限更宽（低卡导向），上限 600；增重：原口径（正餐 150~900，加餐 80~900）
    const calMin = isLose ? (type === 'snack' ? 60 : 120) : (type === 'snack' ? 80 : 150)
    const calMax = isLose ? 600 : 900
    if (!(calorie >= calMin && calorie <= calMax)) throw new Error('calorie 越界')
    if (!(protein >= 0 && protein <= 80)) throw new Error('protein 越界')
    return {
      meal_type: type,
      title: m.title || '推荐餐',
      calorie,
      protein_g: protein,
      ingredients: [],
      steps: []
    }
  })
}

function toDto(doc, fromFallback) {
  return {
    date: doc.date,
    meals: doc.meals,
    total_calorie: doc.total_calorie,
    total_protein_g: doc.total_protein_g,
    generated_by: doc.generated_by,
    refresh_count: doc.refresh_count || 0,
    from_fallback: !!fromFallback
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function readDoc(date) {
  try {
    const res = await db.collection('daily_menus').doc(date).get()
    return res.data || null
  } catch (e) {
    if (e && e.message && e.message.indexOf('does not exist') !== -1) {
      return null
    }
    throw e
  }
}

async function waitAndRead(date) {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_INTERVAL)
    const doc = await readDoc(date)
    if (doc && doc.status === 'READY') return toDto(doc, false)
  }
  throw new Error('poll timeout')
}

async function fetchOrGenerate(date, forceRefresh, goalType) {
  let doc = await readDoc(date)

  if (!forceRefresh && doc && doc.status === 'READY') return toDto(doc, false)

  if (forceRefresh) {
    const cnt = (doc && doc.refresh_count) || 0
    if (cnt >= REFRESH_LIMIT_PER_DAY) {
      const e = new Error('refresh limit exceeded')
      e.code = 94
      throw e
    }
  }

  if (!doc) {
    try {
      await db.collection('daily_menus').add({
        data: { _id: date, date, status: 'GENERATING', created_at: db.serverDate(), refresh_count: 0 }
      })
    } catch (e) {
      return await waitAndRead(date)
    }
  } else if (doc.status === 'GENERATING') {
    if (Date.now() - new Date(doc.created_at).getTime() > ZOMBIE_MS) {
      await db.collection('daily_menus').doc(date).remove()
      return await fetchOrGenerate(date, forceRefresh, goalType)
    }
    return await waitAndRead(date)
  }

  try {
    const config = await getConfig(db)
    const raw = await callGlmMenu(date, config, goalType)
    const meals = parseAndValidate(raw, goalType)
    blockingChecks(meals, config.blocking_checks)
    const total_calorie = meals.reduce((s, m) => s + m.calorie, 0)
    const total_protein_g = Math.round(meals.reduce((s, m) => s + m.protein_g, 0) * 10) / 10
    const generatedBy = process.env.MENU_MODEL || 'glm-4-flash'
    const refreshCount = ((doc && doc.refresh_count) || 0) + (forceRefresh ? 1 : 0)

    await db.collection('daily_menus').doc(date).update({
      data: {
        status: 'READY',
        meals,
        total_calorie,
        total_protein_g,
        goal_type: goalType,
        generated_by: generatedBy,
        generated_at: db.serverDate(),
        updated_at: db.serverDate(),
        refresh_count: refreshCount,
        refreshed_at: forceRefresh ? db.serverDate() : null
      }
    })

    return { date, meals, total_calorie, total_protein_g, goal_type: goalType, generated_by: generatedBy, refresh_count: refreshCount, from_fallback: false }
  } catch (e) {
    if (e.code === 94) throw e
    await db.collection('daily_menus').doc(date).remove().catch(() => {})
    throw e
  }
}

exports.main = async (event, context) => {
  const start = Date.now()
  const date = event.date || fmtBeijingDate()
  const forceRefresh = event.forceRefresh === true
  logger.info(FN, 'invoke', { date, forceRefresh })

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const result = { code: 1, message: '日期格式非法' }
    logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
    return result
  }

  // 读取用户目标方向：缺失/老用户兜底 gain
  let goalType = 'gain'
  try {
    const wxContext = cloud.getWXContext()
    const userRes = await db.collection('users').where({ _openid: wxContext.OPENID }).get()
    goalType = normalizeGoalType(userRes.data[0] ? userRes.data[0].goal_type : undefined)
  } catch (err) {
    logger.warn(FN, 'read user goal_type failed, fallback gain', { error: err.message })
  }

  try {
    const data = await fetchOrGenerate(date, forceRefresh, goalType)
    const result = { code: 0, message: 'ok', data }
    logger.info(FN, 'success', { date, forceRefresh, goalType, from_fallback: data.from_fallback, duration: Date.now() - start })
    return result
  } catch (err) {
    if (err.code === 94) {
      const result = { code: 94, message: '今日换一换次数已用完，请明天再来' }
      logger.info(FN, 'return', { code: 94, date, duration: Date.now() - start })
      return result
    }
    logger.warn(FN, 'generate failed, use fallback', { error: err.message, duration: Date.now() - start })
    const config = await getConfig(db)
    const fallbackMenus = goalType === 'lose' ? (config.fallback_menus_lose || config.fallback_menus) : config.fallback_menus
    const meals = pickFallback(fallbackMenus)
    const data = toDto({
      date,
      meals,
      total_calorie: meals.reduce((s, m) => s + m.calorie, 0),
      total_protein_g: Math.round(meals.reduce((s, m) => s + m.protein_g, 0) * 10) / 10,
      generated_by: 'fallback'
    }, true)
    return { code: 93, message: '今日食谱暂不可用，已返回备用食谱', data }
  }
}

exports.fmtBeijingDate = fmtBeijingDate
exports.parseAndValidate = parseAndValidate
exports.blockingChecks = blockingChecks
exports.pickFallback = pickFallback