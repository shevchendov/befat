const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const axios = require('axios')
const logger = require('./common/logger')
const FN = 'parseFoodLog'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { raw_text, meal_type, date } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  if (!raw_text || !meal_type || !date) {
    const result = { code: 1, message: '缺少必要参数' }
    logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
    return result
  }

  const validMeals = ['breakfast', 'lunch', 'dinner', 'snack']
  if (!validMeals.includes(meal_type)) {
    const result = { code: 2, message: '无效的餐次类型' }
    logger.info(FN, 'return', { code: 2, meal_type, duration: Date.now() - start })
    return result
  }

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

  let parsedItems = []
  let totalCalorie = 0
  let totalProteinG = 0
  let parseError = null

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      throw new Error('DeepSeek API key not configured')
    }

    const prompt = `你是一个中国食物营养分析专家。分析用户描述的食物，返回JSON数组。
用户描述："${raw_text}"
要求：
1. 识别每种食物的名称、估算份量
2. 使用中国常见食物的营养成分数据估算热量(kcal)和蛋白质(g)
3. 份量用中文描述，如"1碗(约200g)"、"1个(约50g)"
4. 如果描述模糊，按常见份量估算

必须返回格式：
{"items":[{"name":"食物名","portion":"份量描述","calorie":数值,"protein_g":数值}],"total_calorie":数值,"total_protein_g":数值}

只返回JSON，不要任何解释文字。`

    const resp = await axios.post('https://api.deepseek.com/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一个中国食物营养分析专家。只返回JSON，不要任何解释文字。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1024
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      timeout: 30000
    })

    const content = resp.data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Empty response from DeepSeek')
    }

    let cleanContent = content.trim()
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    const result = JSON.parse(cleanContent)

    if (result.items && Array.isArray(result.items)) {
      parsedItems = result.items.map(item => ({
        name: item.name || '未知食物',
        portion: item.portion || '1份',
        calorie: Math.round(Number(item.calorie) || 0),
        protein_g: Math.round((Number(item.protein_g) || 0) * 10) / 10
      }))
      totalCalorie = result.total_calorie || parsedItems.reduce((s, i) => s + i.calorie, 0)
      totalProteinG = result.total_protein_g || parsedItems.reduce((s, i) => s + i.protein_g, 0)
    } else {
      throw new Error('Unexpected response format')
    }
  } catch (err) {
    parseError = err.message
    logger.warn(FN, 'AI parse failed', { error: err.message, duration: Date.now() - start })
  }

  if (parseError) {
    return {
      code: 3,
      message: 'AI 解析失败，请手动输入',
      data: {
        raw_text: raw_text.slice(0, 50),
        items: [],
        total_calorie: 0,
        total_protein_g: 0,
        parse_error: parseError
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
      items: parsedItems,
      total_calorie: totalCalorie,
      total_protein_g: totalProteinG
    }
  }
  logger.info(FN, 'success', { duration: Date.now() - start, itemCount: parsedItems.length })
  return result
}
