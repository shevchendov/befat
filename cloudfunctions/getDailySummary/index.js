const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'getDailySummary'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { date } = event
  logger.info(FN, 'invoke', { date, hasOpenid: !!openid })

  try {
    if (!date) {
      const result = { code: 1, message: '缺少日期参数' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    const [foodLogs, userRes] = await Promise.all([
      db.collection('food_logs').where({ _openid: openid, date: date }).orderBy('created_at', 'asc').get(),
      db.collection('users').where({ _openid: openid }).get()
    ])
    const user = userRes.data[0] || null

    const meals = { breakfast: [], lunch: [], dinner: [], snack: [] }
    let totalCalorie = 0
    let totalProteinG = 0

    foodLogs.data.forEach(log => {
      const type = log.meal_type
      if (meals[type]) {
        meals[type].push(log)
      }
      totalCalorie += log.total_calorie || 0
      totalProteinG += log.total_protein_g || 0
    })

    const result = {
      code: 0,
      message: 'ok',
      data: {
        date,
        meals,
        total_calorie: totalCalorie,
        total_protein_g: Math.round(totalProteinG * 10) / 10,
        target_calorie: user ? user.daily_calorie_target : 0,
        target_protein: user ? user.daily_protein_target_g : 0
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start, logCount: foodLogs.data.length, hasUser: !!user })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
