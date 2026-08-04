const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const logger = require('./common/logger')
const FN = 'getShareCard'

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const m = new Date(now)
  m.setDate(now.getDate() - diff)
  return fmt(m)
}

function dateBefore(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return fmt(d)
}

async function countConsecutive(openid) {
  const startDate = dateBefore(365)
  const [fRes, wRes] = await Promise.all([
    db.collection('food_logs').where({ _openid: openid, date: _.gte(startDate) }).get(),
    db.collection('weight_logs').where({ _openid: openid, date: _.gte(startDate) }).get()
  ])
  const set = new Set()
  fRes.data.forEach(d => { if (d.date) set.add(d.date) })
  wRes.data.forEach(d => { if (d.date) set.add(d.date) })
  const sorted = Array.from(set).sort().reverse()
  if (sorted.length === 0) return 0
  const today = fmt(new Date())
  let count = 0
  let exp = today
  for (const date of sorted) {
    if (date === exp) { count++; const d = new Date(exp); d.setDate(d.getDate() - 1); exp = fmt(d) }
    else if (date < exp) break
  }
  return count
}

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { hasOpenid: !!openid })
  const t0 = Date.now() - start

  try {
    const today = fmt(new Date())
    const ws = weekStart()

    const [foodLogs, userRes, wLogs, latestW] = await Promise.all([
      db.collection('food_logs').where({ _openid: openid, date: today }).get(),
      db.collection('users').where({ _openid: openid }).get(),
      db.collection('weight_logs').where({ _openid: openid, date: _.gte(ws).lte(today) }).orderBy('date', 'asc').get(),
      db.collection('weight_logs').where({ _openid: openid }).orderBy('date', 'desc').limit(1).get()
    ])
    const t1 = Date.now() - start
    logger.info(FN, 'batch1', {
      t0,
      t1,
      dbBatch1: t1 - t0,
      logCount: foodLogs.data.length,
      weekLogCount: wLogs.data.length,
      latestLogCount: latestW.data.length,
      hasUser: userRes.data.length > 0
    })
    let totalCal = 0; let totalPro = 0
    foodLogs.data.forEach(l => { totalCal += l.total_calorie || 0; totalPro += l.total_protein_g || 0 })
    const user = userRes.data[0] || null
    const lw = latestW.data.length > 0 ? latestW.data[0].weight_kg : null
    let weekChange = 0
    if (wLogs.data.length >= 2) {
      weekChange = Math.round((wLogs.data[wLogs.data.length - 1].weight_kg - wLogs.data[0].weight_kg) * 100) / 100
    }

    let remain = null
    if (user && user.target_weight_kg != null && lw !== null) remain = Math.round((user.target_weight_kg - lw) * 100) / 100

    const consDays = await countConsecutive(openid)
    const t2 = Date.now() - start

    const result = {
      code: 0, message: 'ok',
      data: {
        date: today,
        total_calorie: totalCal,
        total_protein_g: Math.round(totalPro * 10) / 10,
        target_calorie: user ? user.daily_calorie_target : 0,
        target_protein: user ? user.daily_protein_target_g : 0,
        target_weight_kg: user ? user.target_weight_kg : null,
        latest_weight_kg: lw,
        remaining_kg: remain,
        week_weight_change_kg: weekChange,
        consecutive_days: consDays
      }
    }
    logger.info(FN, 'success', {
      duration: Date.now() - start,
      t0,
      t1,
      t2,
      dbBatch1: t1 - t0,
      dbBatch2: t2 - t1,
      postBatch2: Date.now() - start - t2
    })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '服务器内部错误' }
  }
}
