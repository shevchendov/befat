const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('../common/logger')
const FN = 'checkMealReminder'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const today = event.date || new Date().toISOString().slice(0, 10)
  logger.info(FN, 'invoke', { hasDate: !!event.date, today })

  try {
    const mealLogs = await db.collection('food_logs').where({
      _openid: openid,
      date: today
    }).orderBy('created_at', 'desc').limit(1).get()

    if (mealLogs.data.length === 0) {
      const now = new Date()
      const hour = now.getHours()

      if (hour >= 10 && hour < 11) {
        const result = { code: 0, shouldRemind: true, message: '今天还没记录早餐，记得吃早餐哦！', mealType: 'breakfast' }
        logger.info(FN, 'remind', { mealType: 'breakfast', duration: Date.now() - start })
        return result
      }
      if (hour >= 14 && hour < 15) {
        const result = { code: 0, shouldRemind: true, message: '午餐时间已过，别忘了吃午饭！', mealType: 'lunch' }
        logger.info(FN, 'remind', { mealType: 'lunch', duration: Date.now() - start })
        return result
      }
      if (hour >= 20 && hour < 21) {
        const result = { code: 0, shouldRemind: true, message: '该吃晚餐了，今天有好好吃饭吗？', mealType: 'dinner' }
        logger.info(FN, 'remind', { mealType: 'dinner', duration: Date.now() - start })
        return result
      }
    } else {
      const lastMeal = mealLogs.data[0]
      const lastMealTime = new Date(lastMeal.created_at)
      const hoursSinceLastMeal = (Date.now() - lastMealTime.getTime()) / (1000 * 60 * 60)

      if (hoursSinceLastMeal >= 5) {
        const result = { code: 0, shouldRemind: true, message: '距离上一餐已经超过5小时了，该吃点东西了！', mealType: 'snack' }
        logger.info(FN, 'remind', { mealType: 'snack', hoursSinceLastMeal: Math.round(hoursSinceLastMeal * 10) / 10, duration: Date.now() - start })
        return result
      }
    }

    const result = { code: 0, shouldRemind: false, message: '' }
    logger.info(FN, 'no-remind', { duration: Date.now() - start, hadMeals: mealLogs.data.length > 0 })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, shouldRemind: false, message: '' }
  }
}
