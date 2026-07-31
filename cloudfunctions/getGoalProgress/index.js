const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'getGoalProgress'

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d, n) {
  const nd = new Date(d)
  nd.setDate(nd.getDate() + n)
  return nd
}

function dayDiff(d1, d2) {
  return (new Date(d2) - new Date(d1)) / 86400000
}

// 近期体重变化速率：最近7天内的首尾差 ÷ 间隔天数；
// 7天内不足2条时退回最近3条记录的首尾差；不足3条返回 null
function recentRate(logs) {
  if (logs.length < 3) return null
  const sevenDaysAgo = fmt(addDays(new Date(), -7))
  const recent = logs.filter(r => r.date >= sevenDaysAgo)
  let window = recent
  if (window.length < 2) window = logs.slice(-3)
  if (window.length < 2) return null
  const first = window[0]
  const last = window[window.length - 1]
  const days = dayDiff(first.date, last.date)
  if (days <= 0) return null
  return (last.weight_kg - first.weight_kg) / days
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { hasOpenid: !!openid })

  try {
    // weight_logs 查询依赖 _openid + date 复合索引，
    // 若控制台尚未建立，请手动创建以提高查询效率
    logger.warn(FN, 'index_check', { collection: 'weight_logs', note: '建议建立 _openid + date 复合索引，确认已有可忽略本提示' })

    const [userRes, wLogsRes] = await Promise.all([
      db.collection('users').where({ _openid: openid }).get(),
      db.collection('weight_logs').where({ _openid: openid }).orderBy('date', 'asc').get()
    ])

    const user = userRes.data[0] || null
    if (!user) {
      const result = { code: -1, message: '用户不存在，请先完成初始化' }
      logger.info(FN, 'return', { code: -1, duration: Date.now() - start })
      return result
    }

    // 初始体重：优先取 initial_weight，缺失时回退到 onboarding 存的 current_weight_kg
    const initialWeight = user.initial_weight != null ? user.initial_weight : user.current_weight_kg
    const targetWeight = user.target_weight_kg

    if (initialWeight == null || targetWeight == null) {
      const result = { code: -1, message: '目标数据不完整' }
      logger.info(FN, 'return', { code: -1, duration: Date.now() - start })
      return result
    }

    const logs = (wLogsRes.data || []).slice()
    const currentWeight = logs.length > 0 ? logs[logs.length - 1].weight_kg : initialWeight

    // 增重目标判定：目标体重 >= 初始体重视为增重方向
    const isGain = targetWeight >= initialWeight

    // 已达成判断：增重目标下当前体重 >= 目标体重视为达成；减重目标相反
    const achieved = isGain ? currentWeight >= targetWeight : currentWeight <= targetWeight

    // 进度% = (initial - current) / (initial - target) * 100，对增/减重双向都成立
    let progressPercent = 0
    if (initialWeight === targetWeight) {
      // 除零保护：初始即目标，无进度可算，达成与否直接给 0/100
      progressPercent = achieved ? 100 : 0
    } else {
      progressPercent = (initialWeight - currentWeight) / (initialWeight - targetWeight) * 100
    }
    progressPercent = Math.round(progressPercent * 10) / 10 || 0

    // 剩余差距（带方向）：target - current，未达成时为正（还差多少），达成后为 0 或负数（超出）
    const remainingKg = Math.round((targetWeight - currentWeight) * 100) / 100

    // 预计达成日期：速率方向与目标方向一致且未达成时才计算
    let estimatedDate = null
    const rate = recentRate(logs)
    if (rate !== null && !achieved) {
      const directionOk = isGain ? rate > 0 : rate < 0
      if (directionOk) {
        const gap = Math.abs(initialWeight === targetWeight ? 0 : targetWeight - currentWeight)
        const days = Math.ceil((gap / Math.abs(rate)) - 1e-9)
        if (days > 0 && days < 3650) {
          estimatedDate = fmt(addDays(new Date(), days))
        }
      }
    }

    const result = {
      code: 0,
      message: 'ok',
      data: {
        initial_weight: Math.round(initialWeight * 100) / 100,
        target_weight: Math.round(targetWeight * 100) / 100,
        current_weight: Math.round(currentWeight * 100) / 100,
        progress_percent: progressPercent,
        remaining_kg: remainingKg,
        achieved,
        estimated_date: estimatedDate,
        trend_data: logs.map(r => ({ date: r.date, weight_kg: r.weight_kg }))
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start, logCount: logs.length, achieved, hasEstimate: !!estimatedDate })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
