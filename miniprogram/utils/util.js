function formatDate(date) {
  const d = date || new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeGoalType(v) {
  return v === 'lose' ? 'lose' : 'gain'
}

function getMealTypeLabel(type) {
  const map = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
  return map[type] || type
}

function getActivityLevelLabel(level) {
  const map = { sedentary: '久坐不动', light: '轻度活动', moderate: '中度活动', active: '高度活动', very_active: '极高强度活动' }
  return map[level] || level
}

function calcBMI(weightKg, heightCm) {
  const h = heightCm / 100
  return weightKg / (h * h)
}

function getHealthWarning(bmi, goalType) {
  const gt = normalizeGoalType(goalType)
  if (bmi < 16) return { level: 'danger', text: 'BMI 低于 16，建议先咨询医生或营养师' }
  if (bmi < 18.5) return { level: 'warning', text: gt === 'lose' ? '体重偏轻，不建议减重计划' : '体重偏轻，适合增重计划' }
  if (bmi < 24) return { level: 'normal', text: '体重正常' }
  return { level: 'info', text: gt === 'lose' ? '体重偏高，适合减重计划' : '体重偏高' }
}

// 步数 → 消耗热量估算（减重模式）：steps × 0.04，四舍五入取整
function calcCalorieBySteps(steps) {
  const n = Number(steps)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 0.04)
}

// 16:8 轻断食状态：基于 UNIX 绝对时间戳 + 跨夜分支，进食窗口默认 12:00–20:00（可 offsetMin 偏移）
// 返回 { isEating, remainMs, elapsedFastingMs, phase }
function calcFastingStatus(nowMs, offsetMin) {
  const off = Number(offsetMin) || 0
  const now = new Date(nowMs)
  const DAY = 24 * 3600 * 1000
  const EAT = 8 * 3600 * 1000
  // 当日进食窗口起点（本地时区当日 12:00 + 偏移）
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, off, 0, 0).getTime()
  const endToday = startToday + EAT

  let isEating
  let remainMs
  let elapsedFastingMs

  if (nowMs >= startToday && nowMs < endToday) {
    // 进食窗口内
    isEating = true
    remainMs = endToday - nowMs
    elapsedFastingMs = 0
  } else if (nowMs >= endToday) {
    // 当日窗口已结束 → 进入夜间断食，下次进食是明日窗口
    isEating = false
    remainMs = startToday + DAY - nowMs
    elapsedFastingMs = nowMs - endToday
  } else {
    // nowMs < startToday（凌晨至当日 12 点前）→ 昨日窗口结束后的断食延续
    const prevEnd = endToday - DAY
    isEating = false
    remainMs = startToday - nowMs
    elapsedFastingMs = nowMs - prevEnd
  }

  return {
    isEating,
    remainMs,
    elapsedFastingMs,
    phase: formatFastingPhase(elapsedFastingMs / 3600000)
  }
}

// 断食生理阶段映射（hour 为已断食小时数）
function formatFastingPhase(hours) {
  const h = Number(hours)
  if (!Number.isFinite(h) || h < 8) return { title: '消化期', desc: '食物正在消化，胰岛素平缓' }
  if (h >= 8 && h < 12) return { title: '动用脂肪', desc: '糖原渐耗，身体开始转向脂肪供能' }
  if (h >= 12 && h < 14) return { title: '深度燃脂', desc: '进入深度燃脂窗口，坚持住！' }
  return { title: '细胞自噬', desc: '细胞自噬启动，清理与修复进行中' }
}

module.exports = {
  formatDate,
  normalizeGoalType,
  getMealTypeLabel,
  getActivityLevelLabel,
  calcBMI,
  getHealthWarning,
  calcCalorieBySteps,
  calcFastingStatus,
  formatFastingPhase
}
