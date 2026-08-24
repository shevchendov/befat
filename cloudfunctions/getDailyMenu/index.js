const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')
const logger = require('./common/logger')
const FN = 'getDailyMenu'

const MENU_API_URL_DEFAULT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MENU_TIMEOUT = 15000
const POLL_INTERVAL = 800
const POLL_MAX = 5
const ZOMBIE_MS = 120000
const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner']
const REFRESH_LIMIT_PER_DAY = 10

const FALLBACK_MENUS = [
  { meal_type: 'breakfast', title: '花生酱香蕉全麦吐司', calorie: 480, protein_g: 18, ingredients: ['全麦吐司 2片', '花生酱 1勺', '香蕉 1根'], steps: ['吐司烤至微黄', '抹花生酱', '摆香蕉片'] },
  { meal_type: 'lunch', title: '鸡腿肉蛋炒饭', calorie: 650, protein_g: 32, ingredients: ['鸡腿肉 150g', '米饭 250g', '鸡蛋 2个', '时蔬 1份'], steps: ['鸡腿肉切丁炒熟', '加米饭鸡蛋翻炒', '调味出锅'] },
  { meal_type: 'snack', title: '牛奶坚果燕麦杯', calorie: 180, protein_g: 8, ingredients: ['燕麦 40g', '全脂牛奶 250ml', '坚果 15g'], steps: ['燕麦加牛奶冲泡', '撒坚果'] },
  { meal_type: 'dinner', title: '红烧牛肉面', calorie: 620, protein_g: 28, ingredients: ['牛腩 150g', '面条 200g', '青菜 1把'], steps: ['牛肉炖软', '煮面', '浇牛肉汤'] }
]

// 云函数 Node.js 默认 UTC+0，显式 +8 小时生成北京时间日期
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

function buildPrompt(date) {
  const system = '你是一位专业的中国增重营养师。你的任务是为「吃不胖、想增重」的用户设计安全、可落地的一日三餐。你只输出严格 JSON，不输出任何解释、标题、Markdown 代码块或多余文字。你推荐的每一道菜都必须使用常规熟食烹饪方法，杜绝任何食品安全风险。'
  const user = `今天是 ${date}。请为增重人群设计一日增肥食谱，包含 4 餐：早餐(breakfast)、午餐(lunch)、加餐(snack)、晚餐(dinner)。

【安全食材池】你只能从以下食材中组合菜品，严禁使用池外任何食材：
- 主食：米饭、糙米、全麦面包、燕麦、面条、馒头、红薯、土豆、玉米、小米
- 蛋白：鸡蛋、鸡胸肉、鸡腿肉、猪瘦肉、牛瘦肉、鲈鱼、草鱼、虾、豆腐、牛奶、无糖酸奶、原味奶酪
- 蔬菜：番茄、青菜、西兰花、胡萝卜、菠菜、生菜、青椒、黄瓜、蘑菇、南瓜
- 水果：香蕉、苹果、橙子、梨、蓝莓、牛油果
- 油脂坚果调味：花生、花生酱、核桃、橄榄油、黄油、芝麻、蜂蜜、盐、酱油、黑胡椒、姜、蒜、葱花

【强约束】
1. 每一道菜的食材必须全部来自上述食材池，禁止使用生僻食材、野生动物、河豚、野菌等
2. 严禁任何生食肉类/生食水产（如生肉、刺身、生鱼片），所有肉类鱼类必须完全煮熟
3. 只能采用常规熟食烹饪（炒/煮/蒸/炖/烤/煎）
4. 绝不出现"相克""解毒""治疗"等无科学依据的说法

每一餐必须包含以下字段：
- title: 菜品名称（中文，有辨识度的修饰，避免裸词如"水煮蛋"）
- calorie: 该餐热量估算值(kcal，整数)
- protein_g: 该餐蛋白质估算值(g，可含 1 位小数)
- ingredients: 食材数组，每项格式"食材名 + 份量"，如"全麦吐司 2片"
- steps: 烹饪步骤字符串数组，2~4 步，简洁

严格输出以下 JSON 结构，不要计算 total_calorie 或 total_protein_g：

{"meals":[{"meal_type":"breakfast","title":"...","calorie":0,"protein_g":0,"ingredients":["..."],"steps":["..."]},{"meal_type":"lunch","title":"...","calorie":0,"protein_g":0,"ingredients":["..."],"steps":["..."]},{"meal_type":"snack","title":"...","calorie":0,"protein_g":0,"ingredients":["..."],"steps":["..."]},{"meal_type":"dinner","title":"...","calorie":0,"protein_g":0,"ingredients":["..."],"steps":["..."]}]}

约束：
1. 4 餐必须齐全，meal_type 依次为 breakfast/lunch/snack/dinner
2. 每餐 calorie 在 150~900 之间（加餐 snack 可放宽至 80~900），protein_g 在 0~80 之间
3. 高热量、高蛋白，偏增重导向，但食材常见、可落地
4. 不要输出任何数学总和，总和由后端计算
只返回 JSON 本体。`
  return { system, user }
}

async function callGlmMenu(date) {
  const apiKey = process.env.MENU_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) throw new Error('MENU_API_KEY not configured')
  const model = process.env.MENU_MODEL || 'glm-4-flash'
  const apiUrl = process.env.MENU_API_URL || MENU_API_URL_DEFAULT
  const { system, user } = buildPrompt(date)

  const resp = await axios.post(apiUrl, {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.25,
    max_tokens: 1500
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

function parseAndValidate(raw) {
  const clean = stripCodeFence(raw)
  const obj = JSON.parse(clean)
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
      ingredients: Array.isArray(m.ingredients) ? m.ingredients : [],
      steps: Array.isArray(m.steps) ? m.steps : []
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

// 高危食材/烹饪方式正则黑名单：命中即拒绝落库，走 code 93 安全兜底
const BLOCKED_REGEX = /生肉|刺身|生吃|生食|生鱼|毒|相克|解药|治疗|野生|河豚|野菌|霉变|变质|发芽土豆/i

function blockingChecks(meals) {
  for (const m of meals) {
    const blob = [m.title, ...(m.ingredients || []), ...(m.steps || [])].join(' ')
    if (BLOCKED_REGEX.test(blob)) {
      throw new Error('unsafe ingredient/step detected')
    }
  }
  return meals
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function readDoc(date) {
  const res = await db.collection('daily_menus').doc(date).get()
  return res.data
}

async function waitAndRead(date) {
  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_INTERVAL)
    const doc = await readDoc(date)
    if (doc && doc.status === 'READY') return toDto(doc, false)
  }
  throw new Error('poll timeout')
}

async function fetchOrGenerate(date, forceRefresh) {
  let doc = await readDoc(date)

  // 非强制刷新：READY 命中直接返缓存
  if (!forceRefresh && doc && doc.status === 'READY') return toDto(doc, false)

  // 强制刷新：单日次数限流（防恶意高频刷掉 AI 配额）
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
      // winner → 落到下方生成逻辑
    } catch (e) {
      // 主键冲突 → 并发 loser → 轮询等待 winner 写完
      return await waitAndRead(date)
    }
  } else if (doc.status === 'GENERATING') {
    if (Date.now() - new Date(doc.created_at).getTime() > ZOMBIE_MS) {
      await db.collection('daily_menus').doc(date).remove()
      return await fetchOrGenerate(date, forceRefresh)
    }
    return await waitAndRead(date)
  }

  // winner：调 GLM 生成 + 结构校验 + 正则安全网 + 重算总和
  try {
    const raw = await callGlmMenu(date)
    const meals = parseAndValidate(raw)
    blockingChecks(meals)
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
        generated_by: generatedBy,
        generated_at: db.serverDate(),
        updated_at: db.serverDate(),
        refresh_count: refreshCount,
        refreshed_at: forceRefresh ? db.serverDate() : null
      }
    })

    return { date, meals, total_calorie, total_protein_g, generated_by: generatedBy, refresh_count: refreshCount, from_fallback: false }
  } catch (e) {
    if (e.code === 94) throw e
    // 生成失败回滚占位，避免卡在 GENERATING 120s，让后续请求可立即重试
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

  try {
    const data = await fetchOrGenerate(date, forceRefresh)
    const result = { code: 0, message: 'ok', data }
    logger.info(FN, 'success', { date, forceRefresh, from_fallback: data.from_fallback, duration: Date.now() - start })
    return result
  } catch (err) {
    if (err.code === 94) {
      const result = { code: 94, message: '今日换一换次数已用完，请明天再来' }
      logger.info(FN, 'return', { code: 94, date, duration: Date.now() - start })
      return result
    }
    logger.warn(FN, 'generate failed, use fallback', { error: err.message, duration: Date.now() - start })
    const data = toDto({
      date,
      meals: FALLBACK_MENUS,
      total_calorie: FALLBACK_MENUS.reduce((s, m) => s + m.calorie, 0),
      total_protein_g: Math.round(FALLBACK_MENUS.reduce((s, m) => s + m.protein_g, 0) * 10) / 10,
      generated_by: 'fallback'
    }, true)
    return { code: 93, message: '今日食谱暂不可用，已返回备用食谱', data }
  }
}

exports.fmtBeijingDate = fmtBeijingDate
exports.parseAndValidate = parseAndValidate
exports.blockingChecks = blockingChecks