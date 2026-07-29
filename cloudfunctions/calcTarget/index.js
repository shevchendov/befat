const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'calcTarget'

function calcTDEE(gender, weightKg, heightCm, age, activityLevel) {
  let bmr
  if (gender === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161
  }

  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725
  }
  const tdee = bmr * (multipliers[activityLevel] || 1.2)
  return Math.round(tdee)
}

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

    const bmi = current_weight_kg / ((height_cm / 100) ** 2)

    if (bmi < 16) {
      const result = {
        code: 2,
        message: '您的 BMI 偏低（' + bmi.toFixed(1) + '），建议先咨询医生或营养师，再制定增重计划。',
        data: { bmi: Math.round(bmi * 10) / 10 }
      }
      logger.info(FN, 'return', { code: 2, bmi: result.data.bmi, duration: Date.now() - start })
      return result
    }

    const weeklyGain = (target_weight_kg - current_weight_kg) / 4
    if (weeklyGain > 1) {
      const result = {
        code: 3,
        message: '您设定的目标体重增长过快（每周约' + weeklyGain.toFixed(1) + 'kg），建议将每周增重目标控制在 0.5~1kg。请调整目标体重。',
        data: { bmi: Math.round(bmi * 10) / 10 }
      }
      logger.info(FN, 'return', { code: 3, weeklyGain: Math.round(weeklyGain * 10) / 10, duration: Date.now() - start })
      return result
    }

    const tdee = calcTDEE(gender, current_weight_kg, height_cm, age, activity_level)
    const dailyCalorieTarget = tdee + 350
    const dailyProteinTargetG = Math.round(current_weight_kg * 1.8)

    const userData = {
      height_cm,
      current_weight_kg,
      target_weight_kg,
      gender,
      activity_level,
      age,
      daily_calorie_target: dailyCalorieTarget,
      daily_protein_target_g: dailyProteinTargetG,
      bmi: Math.round(bmi * 10) / 10,
      updated_at: db.serverDate()
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
        tdee,
        daily_calorie_target: dailyCalorieTarget,
        daily_protein_target_g: dailyProteinTargetG,
        bmi: Math.round(bmi * 10) / 10
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start, isNewUser: existing.data.length === 0 })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
