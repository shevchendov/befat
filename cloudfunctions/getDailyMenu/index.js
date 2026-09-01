const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')
const logger = require('./common/logger')
const { getConfig, renderPrompt, SYSTEM_PROMPT, SYSTEM_PROMPT_LOSE_TIPS, DAILY_MENU_TIPS_PROMPT_LOSE, DAILY_COACH_PROMPT_LOSE, LOCAL_FALLBACK_CONFIG } = require('./common/config')
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

const AI_IDENTITY_RE = /AI|人工智能|智能|大模型/i
function assertNoAiIdentity(tips) {
  for (const t of tips || []) {
    if (AI_IDENTITY_RE.test((t.title || '') + ' ' + (t.content || ''))) {
      throw new Error('tip contains AI identity word')
    }
  }
  return tips
}

function pickFallback(menus) {
  return MEAL_ORDER.map(type => {
    const candidates = (menus || []).filter(m => m && m.meal_type === type)
    return candidates[Math.floor(Math.random() * candidates.length)] || {
      meal_type: type, title: '推荐餐', calorie: 400, protein_g: 20, ingredients: [], steps: []
    }
  })
}

// 减重模式兜底：返回 tips 数组（3 条），缺省回退本地 fallback_tips_lose
function pickFallbackTips(config) {
  const tips = config && config.fallback_tips_lose && config.fallback_tips_lose.length === 3
    ? config.fallback_tips_lose
    : LOCAL_FALLBACK_CONFIG.fallback_tips_lose
  return tips.map(t => ({ title: t.title, content: t.content }))
}

// AI 减脂教练：实时诊断，不入 daily_menus 缓存、不落库（行为数据每日/每次变化）
async function generateCoachAdvice(date, config, behaviors) {
  const raw = await callGlmMenu(date, config, 'lose', behaviors)
  let tips
  try {
    tips = parseAndValidate(raw, 'lose')
  } catch (e) {
    logger.warn(FN, 'coach parse fail, use fallback', { error: e.message })
    tips = pickFallbackTips(config)
  }
  // 安全网检查
  try {
    blockingChecks(tips.map(t => ({ title: t.title, ingredients: [], steps: [t.content] })), config.blocking_checks)
    assertNoAiIdentity(tips)
  } catch (e) {
    tips = pickFallbackTips(config)
  }
  return tips
}

async function callGlmMenu(date, config, goalType, behaviors) {
  const apiKey = process.env.MENU_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) throw new Error('MENU_API_KEY not configured')
  const model = process.env.MENU_MODEL || 'glm-4-flash'
  const apiUrl = process.env.MENU_API_URL || MENU_API_URL_DEFAULT
  const isLose = goalType === 'lose'
  // 减重：有行为数据走「AI 减脂教练」动态诊断 Prompt，否则走通用 tips Prompt；
  // 增重保留 config.prompts.daily_menu（system_config 动态配置）原逻辑
  let promptTemplate
  let systemPrompt
  if (!isLose) {
    promptTemplate = config.prompts.daily_menu
    systemPrompt = SYSTEM_PROMPT
  } else if (behaviors) {
    promptTemplate = DAILY_COACH_PROMPT_LOSE
    systemPrompt = SYSTEM_PROMPT_LOSE_TIPS
  } else {
    promptTemplate = DAILY_MENU_TIPS_PROMPT_LOSE
    systemPrompt = SYSTEM_PROMPT_LOSE_TIPS
  }
  const user = renderPrompt(promptTemplate, {
    date,
    ingredients: config.ingredient_whitelist.join('、'),
    behaviors: behaviors || ''
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
  const isLose = goalType === 'lose'

  // 减重：解析 tips 数组（3 条，title/content 非空），不查热量区间
  if (isLose) {
    const tips = obj.tips
    if (!Array.isArray(tips) || tips.length !== 3) throw new Error('tips 须为 3 条')
    return tips.map(t => {
      const title = (t.title || '').trim()
      const content = (t.content || '').trim()
      if (!title || !content) throw new Error('tip title/content 不能为空')
      return { title, content }
    })
  }

  // 增重：原 4 餐解析与热量/蛋白校验，逐字节保留
  const meals = obj.meals
  if (!Array.isArray(meals) || meals.length !== 4) throw new Error('meals 须为 4 餐')

  return MEAL_ORDER.map((type, i) => {
    const m = meals.find(x => x.meal_type === type) || meals[i]
    if (!m) throw new Error('缺少 ' + type)
    const calorie = Math.round(Number(m.calorie) || 0)
    const protein = Math.round((Number(m.protein_g) || 0) * 10) / 10
    const calMin = type === 'snack' ? 80 : 150
    if (!(calorie >= calMin && calorie <= 900)) throw new Error('calorie 越界')
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
    goal_type: doc.goal_type || 'gain',
    tips: doc.tips,
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

async function waitAndRead(date, goalType) {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_INTERVAL)
    const doc = await readDoc(date)
    if (doc && doc.status === 'READY' && normalizeGoalType(doc.goal_type) === goalType) return toDto(doc, false)
  }
  throw new Error('poll timeout')
}

async function fetchOrGenerate(date, forceRefresh, goalType) {
  let doc = await readDoc(date)

  // 缓存命中必须校验 direction：跨目标模式的旧文档视为未命中，重新生成，杜绝 gain/lose 串味
  if (!forceRefresh && doc && doc.status === 'READY' && normalizeGoalType(doc.goal_type) === goalType) {
    return toDto(doc, false)
  }

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
      return await waitAndRead(date, goalType)
    }
  } else if (doc.status === 'GENERATING') {
    if (Date.now() - new Date(doc.created_at).getTime() > ZOMBIE_MS) {
      await db.collection('daily_menus').doc(date).remove()
      return await fetchOrGenerate(date, forceRefresh, goalType)
    }
    return await waitAndRead(date, goalType)
  }

  try {
    const config = await getConfig(db)
    const raw = await callGlmMenu(date, config, goalType)
    const generatedBy = process.env.MENU_MODEL || 'glm-4-flash'
    const refreshCount = ((doc && doc.refresh_count) || 0) + (forceRefresh ? 1 : 0)
    const isLose = goalType === 'lose'

    // 减重：解析 tips，安全网检查 title/content；增重：解析 4 餐并做热量/蛋白校验（原逻辑不变）
    let updatePayload
    if (isLose) {
      const tips = parseAndValidate(raw, goalType)
      // 安全网：复用 blockingChecks，将 content 并入 steps 供其检查
      blockingChecks(tips.map(t => ({ title: t.title, ingredients: [], steps: [t.content] })), config.blocking_checks)
      assertNoAiIdentity(tips)
      updatePayload = { tips }
    } else {
      const meals = parseAndValidate(raw, goalType)
      blockingChecks(meals, config.blocking_checks)
      const total_calorie = meals.reduce((s, m) => s + m.calorie, 0)
      const total_protein_g = Math.round(meals.reduce((s, m) => s + m.protein_g, 0) * 10) / 10
      updatePayload = { meals, total_calorie, total_protein_g }
    }

    await db.collection('daily_menus').doc(date).update({
      data: {
        status: 'READY',
        goal_type: goalType,
        generated_by: generatedBy,
        generated_at: db.serverDate(),
        updated_at: db.serverDate(),
        refresh_count: refreshCount,
        refreshed_at: forceRefresh ? db.serverDate() : null,
        ...updatePayload
      }
    })

    return {
      date,
      goal_type: goalType,
      generated_by: generatedBy,
      refresh_count: refreshCount,
      from_fallback: false,
      ...updatePayload
    }
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
  const behaviors = event.behaviors
  logger.info(FN, 'invoke', { date, forceRefresh, hasBehaviors: !!behaviors })

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

  // AI 减脂教练：实时动态诊断（带 behaviors），不落缓存直接返回
  if (goalType === 'lose' && behaviors) {
    try {
      const config = await getConfig(db)
      const tips = await generateCoachAdvice(date, config, behaviors)
      return { code: 0, message: 'ok', data: { date, goal_type: 'lose', tips, generated_by: 'coach' } }
    } catch (err) {
      logger.warn(FN, 'coach generate fail, fallback', { error: err.message })
      const config = await getConfig(db)
      const tips = pickFallbackTips(config)
      return { code: 93, message: '今日减脂建议暂不可用，已返回备用建议', data: { date, goal_type: 'lose', tips, generated_by: 'fallback' } }
    }
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
    let data
    if (goalType === 'lose') {
      const tips = pickFallbackTips(config)
      data = toDto({ date, tips, goal_type: 'lose', generated_by: 'fallback' }, true)
    } else {
      const meals = pickFallback(config.fallback_menus)
      data = toDto({
        date,
        meals,
        total_calorie: meals.reduce((s, m) => s + m.calorie, 0),
        total_protein_g: Math.round(meals.reduce((s, m) => s + m.protein_g, 0) * 10) / 10,
        generated_by: 'fallback'
      }, true)
    }
    const message = goalType === 'lose' ? '今日减脂建议暂不可用，已返回备用建议' : '今日食谱暂不可用，已返回备用食谱'
    return { code: 93, message, data }
  }
}

exports.fmtBeijingDate = fmtBeijingDate
exports.parseAndValidate = parseAndValidate
exports.blockingChecks = blockingChecks
exports.pickFallback = pickFallback
exports.pickFallbackTips = pickFallbackTips
exports.assertNoAiIdentity = assertNoAiIdentity