const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725
}

// Mifflin-St Jeor 公式计算 TDEE，与 calcTarget 原逻辑保持一致
function calcTDEE(gender, weightKg, heightCm, age, activityLevel) {
  let bmr
  if (gender === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161
  }

  const tdee = bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.2)
  return Math.round(tdee)
}

function calcBmi(weightKg, heightCm) {
  return weightKg / ((heightCm / 100) ** 2)
}

// 安全校验（合规红线，不可绕过）：BMI 过低拦截 + 增重速率过快拦截
// 返回 { ok: true, bmi } 或 { ok: false, code, message, data }
function validateWeights(currentWeightKg, targetWeightKg, heightCm) {
  const bmi = calcBmi(currentWeightKg, heightCm)

  if (bmi < 16) {
    return {
      ok: false,
      code: 2,
      message: '您的 BMI 偏低（' + bmi.toFixed(1) + '），建议先咨询医生或营养师，再制定增重计划。',
      data: { bmi: Math.round(bmi * 10) / 10 }
    }
  }

  const weeklyGain = (targetWeightKg - currentWeightKg) / 4
  if (weeklyGain > 1) {
    return {
      ok: false,
      code: 3,
      message: '您设定的目标体重增长过快（每周约' + weeklyGain.toFixed(1) + 'kg），建议将每周增重目标控制在 0.5~1kg。请调整目标体重。',
      data: { bmi: Math.round(bmi * 10) / 10 }
    }
  }

  return { ok: true, bmi }
}

// 由完整用户档案计算每日目标
function computeTargets(gender, currentWeightKg, heightCm, age, activityLevel) {
  const tdee = calcTDEE(gender, currentWeightKg, heightCm, age, activityLevel)
  const dailyCalorieTarget = tdee + 350
  const dailyProteinTargetG = Math.round(currentWeightKg * 1.8)
  return { tdee, daily_calorie_target: dailyCalorieTarget, daily_protein_target_g: dailyProteinTargetG }
}

module.exports = {
  ACTIVITY_MULTIPLIERS,
  calcTDEE,
  calcBmi,
  validateWeights,
  computeTargets
}
