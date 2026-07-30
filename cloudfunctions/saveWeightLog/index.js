const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'saveWeightLog'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { date, weight_kg } = event
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    if (!date || !weight_kg) {
      const result = { code: 1, message: '缺少必要参数' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    const w = Number(weight_kg)
    if (isNaN(w) || w < 20 || w > 300) {
      const result = { code: 2, message: '体重数值不合法' }
      logger.info(FN, 'return', { code: 2, weight: weight_kg, duration: Date.now() - start })
      return result
    }

    const existing = await db.collection('weight_logs').where({
      _openid: openid,
      date: date
    }).get()

    const isUpdate = existing.data.length > 0
    const record = {
      weight_kg: Math.round(weight_kg * 100) / 100,
      updated_at: db.serverDate()
    }

    if (isUpdate) {
      await db.collection('weight_logs').doc(existing.data[0]._id).update({ data: record })
    } else {
      record._openid = openid
      record.date = date
      record.created_at = db.serverDate()
      await db.collection('weight_logs').add({ data: record })
    }

    const allRecords = await db.collection('weight_logs').where({
      _openid: openid
    }).orderBy('date', 'asc').limit(100).get()

    const result = {
      code: 0,
      message: 'ok',
      data: {
        records: allRecords.data.map(r => ({
          date: r.date,
          weight_kg: r.weight_kg
        }))
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start, isUpdate, totalRecords: allRecords.data.length })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
