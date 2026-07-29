function formatDate(date) {
  const d = date || new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMealTypeLabel(type) {
  const map = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
  return map[type] || type
}

function getActivityLevelLabel(level) {
  const map = { sedentary: '久坐不动', light: '轻度活动', moderate: '中度活动', active: '高度活动' }
  return map[level] || level
}

function calcBMI(weightKg, heightCm) {
  const h = heightCm / 100
  return weightKg / (h * h)
}

function getHealthWarning(bmi) {
  if (bmi < 16) return { level: 'danger', text: 'BMI 低于 16，建议先咨询医生或营养师' }
  if (bmi < 18.5) return { level: 'warning', text: '体重偏轻，适合增重计划' }
  if (bmi < 24) return { level: 'normal', text: '体重正常' }
  return { level: 'info', text: '体重偏高' }
}

module.exports = {
  formatDate,
  getMealTypeLabel,
  getActivityLevelLabel,
  calcBMI,
  getHealthWarning
}
