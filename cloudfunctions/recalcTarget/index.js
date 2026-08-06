const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { validateWeights, computeTargets, parseTargetWeeks, fmtDate, calcExpectedWeeklyRate } = require('./common/targetCalc')
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

    // 计划周期（周）：1~104；未重新填写时沿用库中原有 target_weeks（不覆盖不清除）
    const weeks = parseTargetWeeks(event.target_weeks)
    if (!weeks.ok) {
      const result = { code: 1, message: weeks.message }
      logger.info(FN, 'return', { code: 1, duration: Date.now() - start })
      return result
    }

    // 速率校验基准周数：优先用本次填写的周期；未填写则回退到库中已存周期；都没有才默认 4 周
    const storedWeeksOk = user.target_weeks != null && Number.isInteger(user.target_weeks) && user.target_weeks >= 1 && user.target_weeks <= 104
    const effectiveWeeks = weeks.value !== null ? weeks.value : (storedWeeksOk ? user.target_weeks : null)

    // 复用 calcTarget 的安全校验（BMI 过低拦截、增重速率过快拦截），校验不通过不写库
    const guard = validateWeights(currentWeightKg, targetWeightKg, height_cm, effectiveWeeks)
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

    // 重算时填写了计划周期则连同设置日期一起更新；未填写保持库中原值不变
    if (weeks.value !== null) {
      updateData.target_weeks = weeks.value
      updateData.target_weeks_set_at = fmtDate(new Date())

      // 期望周速率冻结策略：
      // - 周期变化（用户重新规划节奏）或速率缺失（老用户兼容引导）时重算，覆盖/补写
      // - 仅改目标体重、周期未变时沿用冻结速率，避免日期频繁抖动
      const startKg = user.initial_weight != null ? user.initial_weight : user.current_weight_kg
      const weeksChanged = user.target_weeks == null || Number(user.target_weeks) !== weeks.value
      const rateMissing = user.expected_weekly_rate == null
      if (weeksChanged || rateMissing) {
        const planRate = calcExpectedWeeklyRate(targetWeightKg, startKg, weeks.value)
        if (planRate !== null) updateData.expected_weekly_rate = planRate
      }
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
