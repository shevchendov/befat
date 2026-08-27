const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const { normalizeGoalType } = require('./common/targetCalc')
const FN = 'updateTargetManual'

// 手动微调模式：允许直接写入具体数值，跳过自动计算。
// 此处为宽松版边界校验（区别于 calcTarget 的严格安全拦截）：
// - 热量目标不得低于基础代谢率（Mifflin-St Jeor 的 BMR 分量），否则明显不合理
//   （摄入低于基础代谢无法支持增重，且对健康有害，属明显异常值）
// - 热量上限 10000 kcal：正常增重方案通常在 2000~4000 区间，超过 10000 视为明显输入错误
// - 蛋白质目标上限 500g：按 1.8g/kg 估算，对应约 278kg 体重，超过视为明显异常
// - 目标体重上限 500kg：与 calcTarget 数值校验保持一致
function validateManualInput(user, input) {
  const { daily_calorie_target, daily_protein_target_g, target_weight_kg } = input

  if (daily_calorie_target == null && daily_protein_target_g == null && target_weight_kg == null) {
    return { ok: false, code: 1, message: '缺少必要参数' }
  }

  if (target_weight_kg != null) {
    if (target_weight_kg <= 0 || target_weight_kg > 500) {
      return { ok: false, code: 1, message: '目标体重数值不合法' }
    }
  }

  if (daily_protein_target_g != null) {
    if (daily_protein_target_g <= 0 || daily_protein_target_g > 500) {
      return { ok: false, code: 1, message: '蛋白质目标数值不合法' }
    }
  }

  if (daily_calorie_target != null) {
    if (daily_calorie_target <= 0 || daily_calorie_target > 10000) {
      return { ok: false, code: 1, message: '热量目标数值不合法' }
    }

    // 基础代谢率下限校验：依据 Mifflin-St Jeor BMR 公式（不含活动系数）
    if (user && user.gender && user.height_cm && user.age && user.current_weight_kg) {
      const bmr = bmrFor(user)
      if (bmr != null && daily_calorie_target < bmr) {
        return { ok: false, code: 4, message: '热量目标不应低于基础代谢率，请调整后重试。' }
      }
    }
  }

  return { ok: true }
}

function bmrFor(user) {
  const w = user.current_weight_kg
  const h = user.height_cm
  const a = user.age
  if (user.gender === 'male') {
    return 10 * w + 6.25 * h - 5 * a + 5
  }
  return 10 * w + 6.25 * h - 5 * a - 161
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', logger.sanitize(event))

  try {
    const dailyCalorieTarget = event.daily_calorie_target != null ? Number(event.daily_calorie_target) : null
    const dailyProteinTargetG = event.daily_protein_target_g != null ? Number(event.daily_protein_target_g) : null
    const targetWeightKg = event.target_weight_kg != null ? Number(event.target_weight_kg) : null

    if (dailyCalorieTarget != null && isNaN(dailyCalorieTarget)) {
      return { code: 1, message: '参数数值不合法' }
    }
    if (dailyProteinTargetG != null && isNaN(dailyProteinTargetG)) {
      return { code: 1, message: '参数数值不合法' }
    }
    if (targetWeightKg != null && isNaN(targetWeightKg)) {
      return { code: 1, message: '参数数值不合法' }
    }

    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const user = userRes.data[0] || null
    if (!user) {
      const result = { code: -1, message: '用户不存在，请先完成初始化' }
      logger.info(FN, 'return', { code: -1, duration: Date.now() - start })
      return result
    }

    // 目标方向：优先本次透传，缺失回退库中原值，再兜底 gain（老用户无感）
    const goalType = normalizeGoalType(event.goal_type != null ? event.goal_type : user.goal_type)

    const check = validateManualInput(user, {
      daily_calorie_target: dailyCalorieTarget,
      daily_protein_target_g: dailyProteinTargetG,
      target_weight_kg: targetWeightKg
    })
    if (!check.ok) {
      const result = { code: check.code, message: check.message }
      logger.info(FN, 'return', { code: check.code, duration: Date.now() - start })
      return result
    }

    const updateData = { updated_at: db.serverDate() }
    if (targetWeightKg != null) updateData.target_weight_kg = Math.round(targetWeightKg * 10) / 10
    if (dailyCalorieTarget != null) updateData.daily_calorie_target = dailyCalorieTarget
    if (dailyProteinTargetG != null) updateData.daily_protein_target_g = dailyProteinTargetG
    // 仅当显式透传 goal_type 时才落库切换方向，避免手动微调无意覆盖既有方向
    if (event.goal_type != null) updateData.goal_type = goalType

    await db.collection('users').doc(user._id).update({ data: updateData })

    const result = { code: 0, message: 'ok', data: updateData }
    logger.info(FN, 'success', { duration: Date.now() - start })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
