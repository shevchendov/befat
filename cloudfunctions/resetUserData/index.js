const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { batchDeleteByOpenid } = require('./common/deleteHelper')
const FN = 'resetUserData'

// 重置为新用户：保留账号身份（users 文档的 _id/_openid/created_at），
// 清空全部业务数据并回到"未 onboarding"状态
exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { hasOpenid: !!openid })

  try {
    // 二次确认：必须显式传 confirm === true，否则拒绝执行，防止误触发
    if (event.confirm !== true) {
      const result = { code: 1, message: '缺少确认参数，操作已取消' }
      logger.info(FN, 'blocked', { reason: 'no_confirm', duration: Date.now() - start })
      return result
    }

    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const user = userRes.data[0]
    if (!user) {
      const result = { code: 1, message: '用户不存在，无需重置' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    // 清空业务字段（置 null 保留字段结构，供 getGoalProgress/onboarding 判定为未初始化），
    // 身份字段 _id/_openid/created_at 原样保留
    const cleared = {
      height_cm: null,
      current_weight_kg: null,
      target_weight_kg: null,
      gender: null,
      activity_level: null,
      age: null,
      daily_calorie_target: null,
      daily_protein_target_g: null,
      bmi: null,
      target_weeks: null,
      target_weeks_set_at: null,
      expected_weekly_rate: null,
      initial_weight: null,
      updated_at: db.serverDate()
    }
    await db.collection('users').doc(user._id).update({ data: cleared })

    const [foodDeleted, weightDeleted, favDeleted] = await Promise.all([
      batchDeleteByOpenid(db, 'food_logs', openid),
      batchDeleteByOpenid(db, 'weight_logs', openid),
      batchDeleteByOpenid(db, 'user_favorites', openid)
    ])

    // 操作审计：写入 error_logs，action 用 'reset_user' 与普通报错区分；
    // error_logs 不在清空范围内，审计记录得以留存
    await db.collection('error_logs').add({
      data: {
        _openid: openid,
        message: '用户执行数据重置',
        stack: '',
        page: '',
        action: 'reset_user',
        extra: { deleted: { food_logs: foodDeleted, weight_logs: weightDeleted, user_favorites: favDeleted } },
        created_at: db.serverDate()
      }
    })

    const result = { code: 0, message: '已重置为新用户' }
    logger.info(FN, 'success', { duration: Date.now() - start, deleted: { food_logs: foodDeleted, weight_logs: weightDeleted, user_favorites: favDeleted } })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
