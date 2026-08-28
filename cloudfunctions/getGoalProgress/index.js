const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const logger = require('./common/logger')
const FN = 'getGoalProgress'

// 目标方向归一化：仅 'lose' 视为减重，其余（含 undefined/null/''/老用户缺失）一律兜底为 'gain'
function normalizeGoalType(v) {
  return v === 'lose' ? 'lose' : 'gain'
}

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
      db.collection('weight_logs').where({ _openid: openid }).orderBy('date', 'desc').limit(100).get()
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

    // desc 查询取最新 100 条记录，reverse 回升序供后续逻辑使用；
    // 避免单次 get 默认 100 条上限把趋势数据截断成最旧的 100 条
    const logs = (wLogsRes.data || []).slice().reverse()
    const currentWeight = logs.length > 0 ? logs[logs.length - 1].weight_kg : initialWeight

    // 目标方向判定：优先依据 normalizeGoalType(user.goal_type)；
    // lose 明确为减重（isGain=false）；gain 或老用户无字段时回退「目标体重 >= 初始体重」推断（保持旧口径）
    const goalType = normalizeGoalType(user.goal_type)
    const isGain = goalType === 'lose' ? false : (targetWeight >= initialWeight)

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

    // 剩余差距（带方向）：未达成时为正（还差多少），达成后为 0 或负数（超出）
    // gain：target - current（还需增重多少）
    // lose：current - target（还需减重多少）
    const remainingKg = Math.round(((isGain ? targetWeight - currentWeight : currentWeight - targetWeight)) * 100) / 100

    // 计划周期（周）：仅当为 1~104 的合法整数时视为已设置
    const hasPlan = user.target_weeks != null && Number.isInteger(user.target_weeks) && user.target_weeks >= 1 && user.target_weeks <= 104

    // 计划日期：锚定到"设置计划当天"（target_weeks_set_at）+ 周期×7，而非当前日期。
    // 只有固定锚点，"计划是否已到期"才有意义（到期=今天已过计划期限）；
    // 锚点缺失（历史数据/防御）时回退到今天。
    let plannedDate = null
    let planExpired = null
    if (hasPlan) {
      const anchorRaw = user.target_weeks_set_at ? new Date(user.target_weeks_set_at) : null
      const anchor = anchorRaw && !isNaN(anchorRaw.getTime()) ? anchorRaw : new Date()
      plannedDate = fmt(addDays(anchor, user.target_weeks * 7))
      // 今天已过或等于计划期限视为到期（对应"剩余天数<=0"）
      planExpired = fmt(new Date()) >= plannedDate
    }

    // 预计达成日期：速率方向与目标方向一致且未达成时才按实测速率计算
    let estimatedDate = null
    // 预计日期依据：'measured' 实测节奏 / 'planned' 计划周期推算 / null 无预估
    let estimateBasis = null
    const rate = recentRate(logs)
    const rateAvailable = rate !== null && !achieved
    if (rateAvailable) {
      const directionOk = isGain ? rate > 0 : rate < 0
      if (directionOk) {
        const gap = Math.abs(initialWeight === targetWeight ? 0 : targetWeight - currentWeight)
        const days = Math.ceil((gap / Math.abs(rate)) - 1e-9)
        if (days > 0 && days < 3650) {
          estimatedDate = fmt(addDays(new Date(), days))
          estimateBasis = 'measured'
        }
      }
    }

    // 数据不足兜底：仅当"无速率数据"（记录不足）而非"方向相反"时才用计划推算；
    // 方向相反必须保持 estimated_date=null 的安全设计（不显示与目标方向相反的误导性预估），
    // 不能被计划值覆盖
    if (!rateAvailable && !achieved && hasPlan && isGain) {
      // 用"计划隐含的期望周速率"推算，使日期能响应目标体重变化；
      // 期望速率取用户固定快照（onboarding/重算时冻结），缺失时退化为按当前目标/周期现场估算
      const planRate = user.expected_weekly_rate != null && user.expected_weekly_rate > 0
        ? user.expected_weekly_rate
        : (targetWeight - initialWeight) / user.target_weeks
      if (planRate > 0) {
        const remainingWeeks = Math.abs(targetWeight - currentWeight) / planRate
        const days = Math.ceil(remainingWeeks * 7 - 1e-9)
        if (days > 0 && days < 3650) {
          estimatedDate = fmt(addDays(new Date(), days))
          estimateBasis = 'planned'
        }
      }
    }

    // 节奏对比：仅当 estimated_date 与 planned_date 都存在时计算
    let paceStatus = null
    if (estimatedDate && plannedDate) {
      // 14 天容差阈值：避免 estimated_date 与 planned_date 在临界附近因微小数值变化
      // 而抖动、导致状态来回跳变——与 X 轴标签抽样"临界抖动 bug"同性质；
      // 容差内一律判为 on_track，请勿删减该容差
      const diffDays = Math.abs(dayDiff(estimatedDate, plannedDate))
      if (diffDays <= 14) {
        paceStatus = 'on_track'
      } else if (estimatedDate < plannedDate) {
        paceStatus = 'ahead'
      } else {
        paceStatus = 'behind'
      }
    }

    const result = {
      code: 0,
      message: 'ok',
      data: {
        goal_type: goalType,
        initial_weight: Math.round(initialWeight * 100) / 100,
        target_weight: Math.round(targetWeight * 100) / 100,
        current_weight: Math.round(currentWeight * 100) / 100,
        progress_percent: progressPercent,
        remaining_kg: remainingKg,
        achieved,
        estimated_date: estimatedDate,
        estimate_basis: estimateBasis,
        planned_date: plannedDate,
        pace_status: paceStatus,
        plan_expired: planExpired,
        trend_data: logs.map(r => ({ date: r.date, weight_kg: r.weight_kg }))
      }
    }
    logger.info(FN, 'success', { duration: Date.now() - start, logCount: logs.length, achieved, hasEstimate: !!estimatedDate, estimateBasis, hasPlan, hasPace: !!paceStatus })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
