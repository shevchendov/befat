const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { validateWeights, computeTargets } = require('./common/targetCalc')
const FN = 'recalcTarget'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    const currentWeightKg = Number(event.current_weight_kg)
    const targetWeightKg = Number(event.target_weight_kg)

    if (!currentWeightKg || !targetWeightKg) {
      const result = { code: 1, message: '缺少必要参数' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    // 精简重算：身高/性别/年龄/活动强度等基础档案从 users 表已有记录复用，不重新填写
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const user = userRes.data[0] || null
    if (!user) {
      const result = { code: -1, message: '用户不存在，请先完成初始化' }
      logger.info(FN, 'return', { code: -1, duration: Date.now() - start })
      return result
    }

    const { height_cm, gender, age, activity_level } = user
    if (!height_cm || !gender || !age || !activity_level) {
      const result = { code: 1, message: '用户档案不完整，请重新初始化' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    if (currentWeightKg <= 0 || currentWeightKg > 500 || targetWeightKg <= 0 || targetWeightKg > 500) {
      const result = { code: 1, message: '参数数值不合法' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    // 复用 calcTarget 的安全校验（BMI 过低拦截、增重速率过快拦截），校验不通过不写库
    const guard = validateWeights(currentWeightKg, targetWeightKg, height_cm)
    if (!guard.ok) {
      logger.info(FN, 'return', { code: guard.code, bmi: guard.data.bmi, duration: Date.now() - start })
      return { code: guard.code, message: guard.message, data: guard.data }
    }
    const bmi = Math.round(guard.bmi * 10) / 10

    const targets = computeTargets(gender, currentWeightKg, height_cm, age, activity_level)

    const updateData = {
      target_weight_kg: Math.round(targetWeightKg * 10) / 10,
      daily_calorie_target: targets.daily_calorie_target,
      daily_protein_target_g: targets.daily_protein_target_g,
      bmi,
      updated_at: db.serverDate()
    }
    await db.collection('users').doc(user._id).update({ data: updateData })

    const result = {
      code: 0,
      message: 'ok',
      data: {
        tdee: targets.tdee,
        daily_calorie_target: targets.daily_calorie_target,
        daily_protein_target_g: targets.daily_protein_target_g,
        bmi
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
