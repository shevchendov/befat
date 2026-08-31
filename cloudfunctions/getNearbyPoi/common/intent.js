// getNearbyPoi/common/intent.js
// GLM 意图转译：把抽象口味/场景转译为地图检索关键词 + 贴心推荐理由 reason
// 含 1.5s 超时控制、文本清洗、解析失败回退 ABSTRACT_MAP 离线映射

const axios = require('axios')
const logger = require('./logger')
const config = require('../config')

const FN = 'intent'

const INTENT_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

// 增益：餐饮品类转译
const INTENT_SYSTEM_GAIN = '你是一个地图 POI 品类转译器。必须把用户的抽象口味/场景（如"清淡"、"聚餐"）转译为腾讯/百度/高德地图能精准查到的【具体餐饮品类名词】。严禁输出形容词或抽象非实体词。只输出严格 JSON，不要任何解释文字或 Markdown。'

// 减重：运动场所转译，严禁输出餐饮词
const INTENT_SYSTEM_LOSE = '你是一个地图 POI 运动场所转译器。必须把用户的运动/休闲需求（如"想跑步"、"想游泳"、"找个公园"）转译为地图能精准查到的【具体运动或休闲场所名词】。严禁输出形容词、抽象词，严禁输出任何餐饮/美食类关键词（小吃、餐厅、饭店、快餐、美食、茶楼）。只输出严格 JSON，不要任何解释文字或 Markdown。'

function buildIntentPrompt(query, isLose) {
  const target = isLose ? '用户想去运动/休闲的场所' : '用户想吃的偏好'
  const example = isLose
    ? '输入"想跑步" → 输出 {"keywords":"公园|绿道|体育场","orderby":"_distance","reason":"帮你圈定几处轻卡易坚持的运动地"}'
    : '输入"清淡" → 输出 {"keywords":"粤菜|粥粉面|茶楼","orderby":"_distance","reason":"给你找几家实惠清淡的粤式小馆"}'
  return `${target}："${query}"

请转译为地图 POI 搜索参数，只返回 JSON：
{"keywords":"关键词用竖线分隔","orderby":"_distance","reason":"推荐语"}

示例：
${example}

reason 要求：
1. 不超过 20 字
2. 结合目标方向与口感/场景需求，生成有烟火气、贴心的短句
3. 严禁广告词、严禁医疗/功效宣称
4. 严禁出现"AI""人工智能""智能""大模型"等字眼

约束：keywords 必须为地图高频实体品类名词，用"|"分隔；只返回 JSON 本体。`
}

// 意图解析内存缓存：key = goalType:query，value = {ts, data}
const intentCache = new Map()

function cacheGet(key) {
  const e = intentCache.get(key)
  if (!e) return null
  if (Date.now() - e.ts >= config.INTENT_CACHE_TTL) {
    intentCache.delete(key)
    return null
  }
  return e.data
}

function cacheSet(key, data) {
  if (intentCache.size >= config.INTENT_CACHE_MAX) {
    const first = intentCache.keys().next().value
    intentCache.delete(first)
  }
  intentCache.set(key, { ts: Date.now(), data })
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('INTENT_TIMEOUT')), ms))
  ])
}

// 清洗：去除换行、回车、Markdown 代码围栏，防止 JSON.parse 失败
function cleanContent(content) {
  let s = String(content || '').replace(/[\r\n]/g, '')
  s = s.replace(/^\uFEFF/, '')
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?/i, '').replace(/```$/,'')
  return s.trim()
}

function parseIntent(content) {
  const cleaned = cleanContent(content)
  const parsed = JSON.parse(cleaned)
  if (!parsed || typeof parsed.keywords !== 'string' || !parsed.keywords.trim()) return null
  return {
    keywords: parsed.keywords.trim(),
    orderby: parsed.orderby || '_distance',
    reason: (typeof parsed.reason === 'string' ? parsed.reason.trim() : '').slice(0, 20)  // 兜底截断 20 字
  }
}

/**
 * 解析用户意图 → 地图检索关键词 + 推荐语
 * @param {string} query 用户输入，已 trim
 * @param {string} goalType gain|lose
 * @returns {Promise<{keywords:string,orderby:string,reason:string}|null>} null 表示需走离线兜底
 */
async function resolveIntent(query, goalType) {
  const isLose = goalType === 'lose'
  const cacheKey = (isLose ? 'lose:' : 'gain:') + query
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const apiKey = process.env.MENU_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) return null

  try {
    const resp = await withTimeout(axios.post(INTENT_API, {
      model: process.env.MENU_MODEL || 'glm-4-flash',
      messages: [
        { role: 'system', content: isLose ? INTENT_SYSTEM_LOSE : INTENT_SYSTEM_GAIN },
        { role: 'user', content: buildIntentPrompt(query, isLose) }
      ],
      temperature: 0.1,
      max_tokens: 150
    }, {
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      timeout: config.INTENT_TIMEOUT
    }), config.INTENT_TIMEOUT)

    const content = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
    if (!content) return null

    const result = parseIntent(content)
    if (result) cacheSet(cacheKey, result)
    return result
  } catch (err) {
    logger.warn(FN, 'intent resolve fail, fallback to abstract map', { error: err.message })
    return null
  }
}

/**
 * 离线兜底：增益走 ABSTRACT_MAP，减重回退原文
 * @returns {{keywords:string, reason:string}}
 */
function fallbackKeyword(query, goalType) {
  if (goalType === 'lose') {
    return { keywords: query, reason: config.FALLBACK_REASON.lose }
  }
  if (config.ABSTRACT_MAP[query]) {
    return { keywords: config.ABSTRACT_MAP[query], reason: '按你的口味偏好为你筛选' }
  }
  return { keywords: query, reason: config.FALLBACK_REASON.gain }
}

module.exports = { resolveIntent, fallbackKeyword, parseIntent }