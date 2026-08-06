function calcBmi(weightKg, heightCm) {
  return weightKg / ((heightCm / 100) ** 2)
}

// 前端轻量预校验，与云函数 common/targetCalc.js 的 validateWeights 保持同一判定口径。
// 在用户提交表单前提前拦截，避免白填到最后一页才被云函数打回。
// 返回 { ok: true }；
// 纯范围问题（目标体重 > 300）返回 { ok: false, toast: true, message }，用 wx.showToast 提示；
// BMI 过低 / 增重速率过快（对应云函数 code 2 / 3）返回 { ok: false, code, message }，用 wx.showModal 提示。
function validateTargetInput({ height_cm, current_weight_kg, target_weight_kg, target_weeks }) {
  if (target_weight_kg > 300) {
    return { ok: false, toast: true, message: '目标体重不能超过300kg' }
  }

  if (height_cm && current_weight_kg) {
    const bmi = calcBmi(current_weight_kg, height_cm)
    if (bmi < 16) {
      return {
        ok: false,
        code: 2,
        message: '您的 BMI 偏低（' + bmi.toFixed(1) + '），建议先咨询医生或营养师，再制定增重计划。'
      }
    }
  }

  const weeks = target_weeks && target_weeks > 0 ? target_weeks : 4
  const weeklyGain = (target_weight_kg - current_weight_kg) / weeks
  if (weeklyGain > 1) {
    return {
      ok: false,
      code: 3,
      message: '您设定的目标体重增长过快（每周约' + weeklyGain.toFixed(1) + 'kg），建议将每周增重目标控制在 0.5~1kg。请调整目标体重或延长计划周期。'
    }
  }

  return { ok: true }
}

module.exports = {
  validateTargetInput
}
