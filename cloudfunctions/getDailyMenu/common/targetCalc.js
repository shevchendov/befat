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

// 本地日期 YYYY-MM-DD（与 getGoalProgress 的 fmt 口径一致），用于记录计划设置日期锚点
function fmtDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 解析并校验计划周期（周）：合法为 1~104 的整数；
// 未设置返回 { ok: true, value: null }（走默认 4 周校验）；非法值返回 { ok: false, message }
function parseTargetWeeks(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null }
  }
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 104) {
    return { ok: false, message: '计划周期需为 1~104 周的整数' }
  }
  return { ok: true, value: n }
}

// 期望周速率：用户计划隐含的增重速度（kg/周）= (目标 - 起始) / 周期
// 返回正数快照（不取整，避免累计精度损失）；周期非法或速率非正（如减重方向）时返回 null
function calcExpectedWeeklyRate(targetWeightKg, startWeightKg, targetWeeks) {
  if (!targetWeeks || targetWeeks <= 0) return null
  const rate = (targetWeightKg - startWeightKg) / targetWeeks
  return rate > 0 ? rate : null
}

// 安全校验（合规红线，不可绕过）：BMI 过低拦截 + 增重速率过快拦截
// 返回 { ok: true, bmi } 或 { ok: false, code, message, data }
// targetWeeks 为用户计划达成周期（周），决定"每周增重"的基准周数；
// 不传或非正整数时回退到默认 4 周（保持旧调用方行为不变）
function validateWeights(currentWeightKg, targetWeightKg, heightCm, targetWeeks) {
  const bmi = calcBmi(currentWeightKg, heightCm)

  if (bmi < 16) {
    return {
      ok: false,
      code: 2,
      message: '您的 BMI 偏低（' + bmi.toFixed(1) + '），建议先咨询医生或营养师，再制定增重计划。',
      data: { bmi: Math.round(bmi * 10) / 10 }
    }
  }

  const weeks = targetWeeks && targetWeeks > 0 ? targetWeeks : 4
  const weeklyGain = (targetWeightKg - currentWeightKg) / weeks
  if (weeklyGain > 1) {
    return {
      ok: false,
      code: 3,
      message: '您设定的目标体重增长过快（每周约' + weeklyGain.toFixed(1) + 'kg），建议将每周增重目标控制在 0.5~1kg。请调整目标体重或延长计划周期。',
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
  fmtDate,
  parseTargetWeeks,
  calcExpectedWeeklyRate,
  validateWeights,
  computeTargets
}
