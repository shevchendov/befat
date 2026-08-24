const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')
const logger = require('./common/logger')
const FN = 'parseFoodLog'

const VISION_API_URL_DEFAULT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const NUTRITION_API_URL_DEFAULT = 'https://api.deepseek.com/chat/completions'
const GLM_TIMEOUT = 12000
const DEEPSEEK_TIMEOUT = 15000
// base64 字符串长度上限：约 3MB 字符（对应约 2.36MB 原始字节）
const IMAGE_BASE64_MAX = 3145728
// imgSecCheck 原始图上限 2MB
const IMAGE_BUFFER_MAX = 2 * 1024 * 1024
const VALID_MEALS = ['breakfast', 'lunch', 'dinner', 'snack']

function stripCodeFence(content) {
  let clean = content.trim()
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }
  return clean
}

function buildNutritionPrompt(desc) {
  return `你是一个中国食物营养分析专家。分析用户描述的食物，返回JSON数组。
用户描述："${desc}"
要求：
1. 列出每种食物的名称、估算份量
2. 使用中国常见食物的营养成分数据估算热量(kcal)和蛋白质(g)
3. 份量用中文描述，如"1碗(约200g)"、"1个(约50g)"
4. 如果描述模糊，按常见份量估算

必须返回格式：
{"items":[{"name":"食物名","portion":"份量描述","calorie":数值,"protein_g":数值}],"total_calorie":数值,"total_protein_g":数值}

只返回JSON，不要任何解释文字。`
}

const VISION_NUTRITION_PROMPT = '你是一个中国食物营养分析专家。请看图片中的食物，直接估算每种食物的名称、份量、热量(kcal)和蛋白质(g)。要求：1. 份量用中文描述，如"1碗(约200g)"、"1个(约50g)"；2. 热量和蛋白质依据中国常见食物营养成分数据估算；3. 图片不清晰时按常见份量估算。必须只返回严格的JSON，不要任何解释文字、不要Markdown代码块：{"items":[{"name":"食物名","portion":"份量描述","calorie":数值,"protein_g":数值}],"total_calorie":数值,"total_protein_g":数值}'

function parseNutritionJson(content) {
  const cleanContent = stripCodeFence(content)
  const result = JSON.parse(cleanContent)
  if (!result.items || !Array.isArray(result.items)) {
    throw new Error('Unexpected response format')
  }
  const parsedItems = result.items.map(item => ({
    name: item.name || '未知食物',
    portion: item.portion || '1份',
    calorie: Math.round(Number(item.calorie) || 0),
    protein_g: Math.round((Number(item.protein_g) || 0) * 10) / 10
  }))
  const totalCalorie = result.total_calorie || parsedItems.reduce((s, i) => s + i.calorie, 0)
  const totalProteinG = result.total_protein_g || parsedItems.reduce((s, i) => s + i.protein_g, 0)
  return { items: parsedItems, total_calorie: totalCalorie, total_protein_g: totalProteinG }
}

async function runVisionNutrition(imageBase64) {
  const apiKey = process.env.VISION_API_KEY || process.env.ZHIPU_API_KEY
  if (!apiKey) throw new Error('VISION_API_KEY not configured')
  const visionModel = process.env.VISION_MODEL || process.env.ZHIPU_VISION_MODEL || 'glm-4v-flash'
  const apiUrl = process.env.VISION_API_URL || VISION_API_URL_DEFAULT

  const resp = await axios.post(apiUrl, {
    model: visionModel,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: VISION_NUTRITION_PROMPT },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64 } }
      ]
    }],
    temperature: 0.1,
    max_tokens: 1024
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    timeout: GLM_TIMEOUT
  })

  const content = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
  if (!content) throw new Error('Vision empty response')
  return parseNutritionJson(content)
}

async function runDeepSeekNutrition(desc) {
  const apiKey = process.env.NUTRITION_API_KEY || process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('NUTRITION_API_KEY not configured')
  const model = process.env.NUTRITION_MODEL || 'deepseek-v4-flash'
  const apiUrl = process.env.NUTRITION_API_URL || NUTRITION_API_URL_DEFAULT

  const resp = await axios.post(apiUrl, {
    model,
    messages: [
      { role: 'system', content: '你是一个中国食物营养分析专家。只返回JSON，不要任何解释文字。' },
      { role: 'user', content: buildNutritionPrompt(desc) }
    ],
    temperature: 0.1,
    max_tokens: 1024
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    timeout: DEEPSEEK_TIMEOUT
  })

  const content = resp.data && resp.data.choices && resp.data.choices[0] && resp.data.choices[0].message && resp.data.choices[0].message.content
  if (!content) throw new Error('Empty response from nutrition model')
  return parseNutritionJson(content)
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { raw_text, image_base64, meal_type, date } = event
  const isImageMode = !!image_base64

  logger.info(FN, 'invoke', isImageMode
    ? { mode: 'image', meal_type, date, image_size: image_base64.length }
    : logger.sanitize({ raw_text, meal_type, date }))

  if (!meal_type || !date || (!isImageMode && !raw_text)) {
    const result = { code: 1, message: '缺少必要参数' }
    logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
    return result
  }

  if (!VALID_MEALS.includes(meal_type)) {
    const result = { code: 2, message: '无效的餐次类型' }
    logger.info(FN, 'return', { code: 2, meal_type, duration: Date.now() - start })
    return result
  }

  try {
    if (isImageMode) {
      // 大小防御：base64 字符长度与解码后字节双重校验
      if (image_base64.length > IMAGE_BASE64_MAX) {
        const result = { code: 90, message: '图片过大，请压缩后重试' }
        logger.info(FN, 'return', { code: 90, duration: Date.now() - start })
        return result
      }
      const buf = Buffer.from(image_base64, 'base64')
      if (buf.length > IMAGE_BUFFER_MAX) {
        const result = { code: 90, message: '图片过大，请压缩后重试' }
        logger.info(FN, 'return', { code: 90, duration: Date.now() - start })
        return result
      }

      // 图片内容安全检测
      try {
        const sec = await cloud.openapi.security.imgSecCheck({
          media: { contentType: 'image/jpeg', value: buf }
        })
        if (sec.errCode !== 0) {
          const result = { code: 91, message: '图片包含违规内容' }
          logger.info(FN, 'return', { code: 91, duration: Date.now() - start })
          return result
        }
      } catch (secErr) {
        logger.warn(FN, 'image security check unavailable', { error: secErr.message, duration: Date.now() - start })
        const result = { code: 89, message: '内容安全检测服务暂不可用，请稍后再试' }
        logger.info(FN, 'return', { code: 89, duration: Date.now() - start })
        return result
      }

      // 单次多模态调用：视觉模型直接看图输出营养 JSON，跳过第二棒
      let parsed
      try {
        parsed = await runVisionNutrition(image_base64)
      } catch (visionErr) {
        logger.warn(FN, 'vision nutrition failed', { error: visionErr.message, duration: Date.now() - start })
        const result = { code: 92, message: '图片分析失败，请改用文字描述' }
        logger.info(FN, 'return', { code: 92, duration: Date.now() - start })
        return result
      }

      const result = {
        code: 0,
        message: 'ok',
        data: {
          raw_text: parsed.items.map(i => i.name + ' ' + i.portion).join('；').slice(0, 50),
          meal_type,
          date,
          items: parsed.items,
          total_calorie: parsed.total_calorie,
          total_protein_g: parsed.total_protein_g
        }
      }
      logger.info(FN, 'success', { mode: 'image', duration: Date.now() - start, itemCount: parsed.items.length })
      return result
    }

    // 文本模式：内容安全检测
    try {
      const securityResult = await cloud.openapi.security.msgSecCheck({ content: raw_text })
      if (securityResult.errCode !== 0) {
        const result = { code: 88, message: '输入内容包含违规信息，请重新输入' }
        logger.info(FN, 'return', { code: 88, duration: Date.now() - start })
        return result
      }
    } catch (securityErr) {
      logger.warn(FN, 'security check unavailable', { error: securityErr.message, duration: Date.now() - start })
      const result = { code: 89, message: '内容安全检测服务暂不可用，请稍后再试' }
      logger.info(FN, 'return', { code: 89, duration: Date.now() - start })
      return result
    }

    // 文本模式：纯文本营养计算
    let parsed
    try {
      parsed = await runDeepSeekNutrition(raw_text)
    } catch (err) {
      logger.warn(FN, 'parse failed', { error: err.message, duration: Date.now() - start })
      return {
        code: 3,
        message: '解析失败，请手动输入',
        data: {
          raw_text: raw_text.slice(0, 50),
          items: [],
          total_calorie: 0,
          total_protein_g: 0,
          parse_error: err.message
        }
      }
    }

    const result = {
      code: 0,
      message: 'ok',
      data: {
        raw_text: raw_text.slice(0, 50),
        meal_type,
        date,
        items: parsed.items,
        total_calorie: parsed.total_calorie,
        total_protein_g: parsed.total_protein_g
      }
    }
    logger.info(FN, 'success', { mode: 'text', duration: Date.now() - start, itemCount: parsed.items.length })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}