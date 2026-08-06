const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { validateWeights, computeTargets, parseTargetWeeks, fmtDate, calcExpectedWeeklyRate } = require('./common/targetCalc')
const FN = 'calcTarget'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    const { height_cm, current_weight_kg, target_weight_kg, gender, activity_level, age } = event

    if (!height_cm || !current_weight_kg || !target_weight_kg || !gender || !activity_level || !age) {
      const result = { code: 1, message: '缺少必要参数' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    if (height_cm <= 0 || height_cm > 250 || current_weight_kg <= 0 || current_weight_kg > 500 || target_weight_kg <= 0 || age <= 0 || age > 120) {
      const result = { code: 1, message: '参数数值不合法' }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    // 计划周期（周）：1~104；缺省允许（未填则不定周期，速率校验回退到默认 4 周）
    const weeks = parseTargetWeeks(event.target_weeks)
    if (!weeks.ok) {
      const result = { code: 1, message: weeks.message }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    const guard = validateWeights(current_weight_kg, target_weight_kg, height_cm, weeks.value)
    if (!guard.ok) {
      logger.info(FN, 'return', { code: guard.code, bmi: guard.data.bmi, duration: Date.now() - start })
      return { code: guard.code, message: guard.message, data: guard.data }
    }
    const bmi = Math.round(guard.bmi * 10) / 10

    const targets = computeTargets(gender, current_weight_kg, height_cm, age, activity_level)
    const dailyCalorieTarget = targets.daily_calorie_target
    const dailyProteinTargetG = targets.daily_protein_target_g

    const userData = {
      height_cm,
      current_weight_kg,
      target_weight_kg,
      gender,
      activity_level,
      age,
      daily_calorie_target: dailyCalorieTarget,
      daily_protein_target_g: dailyProteinTargetG,
      bmi,
      updated_at: db.serverDate()
    }

    // 填写了计划周期则连同设置日期、期望周速率一并入库；未填写不落这些字段
    if (weeks.value !== null) {
      userData.target_weeks = weeks.value
      userData.target_weeks_set_at = fmtDate(new Date())
      // 期望周速率 = onboarding 隐含计划节奏（目标-起始）/周期，作为 branch C 固定基准
      const planRate = calcExpectedWeeklyRate(target_weight_kg, current_weight_kg, weeks.value)
      if (planRate !== null) userData.expected_weekly_rate = planRate
    }

    const existing = await db.collection('users').where({ _openid: openid }).get()
    if (existing.data.length > 0) {
      await db.collection('users').doc(existing.data[0]._id).update({ data: userData })
    } else {
      userData._openid = openid
      userData.created_at = db.serverDate()
      await db.collection('users').add({ data: userData })
    }

    const result = {
      code: 0,
      message: 'ok',
      data: {
        tdee: targets.tdee,
        daily_calorie_target: dailyCalorieTarget,
        daily_protein_target_g: dailyProteinTargetG,
        bmi
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start, isNewUser: existing.data.length === 0 })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
