const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const logger = require('./common/logger')
const FN = 'getStats'

const PAGE_SIZE = 100
const MAX_DAYS = 365
const DEFAULT_DAYS = 90
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDate(s) {
  const p = String(s).split('-')
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + n)
  return fmt(d)
}

function genDates(startDate, endDate) {
  const list = []
  let cur = startDate
  while (cur <= endDate) {
    list.push(cur)
    cur = addDays(cur, 1)
  }
  return list
}

async function fetchAll(baseQuery) {
  const all = []
  let skip = 0
  for (;;) {
    const res = await baseQuery.skip(skip).limit(PAGE_SIZE).get()
    all.push(...res.data)
    if (res.data.length < PAGE_SIZE) break
    skip += PAGE_SIZE
  }
  return all
}

function pct(ok, recorded) {
  if (!recorded) return null
  return Math.round((ok / recorded) * 100)
}

function judgeNutr(rec, targetCal, targetPro) {
  if (!rec) return 'none'
  const hasCal = targetCal > 0
  const hasPro = targetPro > 0
  if (!hasCal && !hasPro) return 'none'
  const calOk = hasCal ? rec.cal >= targetCal : true
  const proOk = hasPro ? rec.pro >= targetPro : true
  return calOk && proOk ? 'ok' : 'fail'
}

function summarizeWindow(dates, dayMap, targetCal, targetPro, n) {
  const windowDates = dates.slice(-n)
  let recorded = 0
  let calOk = 0
  let proOk = 0
  windowDates.forEach(d => {
    const rec = dayMap[d]
    if (!rec) return
    recorded += 1
    if (targetCal > 0 && rec.cal >= targetCal) calOk += 1
    if (targetPro > 0 && rec.pro >= targetPro) proOk += 1
  })
  return {
    recorded,
    calorie_rate: targetCal > 0 ? pct(calOk, recorded) : null,
    protein_rate: targetPro > 0 ? pct(proOk, recorded) : null
  }
}

function mondayOf(dateStr) {
  const d = parseDate(dateStr)
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return fmt(d)
}

function weekLabel(startDate, endDate) {
  const s = `${Number(startDate.slice(5, 7))}/${Number(startDate.slice(8, 10))}`
  const e = `${Number(endDate.slice(5, 7))}/${Number(endDate.slice(8, 10))}`
  return `${s}-${e}`
}

function buildWeeks(dates, dayMap, weightsByDate, targetCal, targetPro) {
  const weeks = []
  let start = null
  let bucket = []
  const flush = () => {
    if (!start) return
    const first = bucket[0]
    const last = bucket[bucket.length - 1]
    let recorded = 0
    let calOk = 0
    let proOk = 0
    bucket.forEach(d => {
      const rec = dayMap[d]
      if (!rec) return
      recorded += 1
      if (targetCal > 0 && rec.cal >= targetCal) calOk += 1
      if (targetPro > 0 && rec.pro >= targetPro) proOk += 1
    })
    const wDates = bucket.filter(d => weightsByDate[d] != null)
    let weightDelta = null
    if (wDates.length >= 2) {
      weightDelta = Math.round((weightsByDate[wDates[wDates.length - 1]] - weightsByDate[wDates[0]]) * 100) / 100
    }
    weeks.push({
      label: weekLabel(first, last),
      recorded,
      calorie_rate: targetCal > 0 ? pct(calOk, recorded) : null,
      protein_rate: targetPro > 0 ? pct(proOk, recorded) : null,
      weight_delta: weightDelta
    })
  }
  dates.forEach(d => {
    const ms = mondayOf(d)
    if (ms !== start) {
      flush()
      start = ms
      bucket = []
    }
    bucket.push(d)
  })
  flush()
  return weeks
}

exports.main = async (event, context) => {
  const startTime = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const ev = event || {}

  let days = DEFAULT_DAYS
  if (typeof ev.days === 'number' && Number.isFinite(ev.days)) {
    days = Math.min(MAX_DAYS, Math.max(1, Math.floor(ev.days)))
  }
  const endDate = ev.endDate && DATE_RE.test(String(ev.endDate)) ? String(ev.endDate) : fmt(new Date())
  const startDate = addDays(endDate, -(days - 1))

  logger.info(FN, 'invoke', { days, endDate, hasOpenid: !!openid })

  try {
    const foodBase = db.collection('food_logs').where({ _openid: openid, date: _.gte(startDate).lte(endDate) }).orderBy('date', 'asc')
    const weightBase = db.collection('weight_logs').where({ _openid: openid, date: _.gte(startDate).lte(endDate) }).orderBy('date', 'asc')

    const [foodLogs, weightLogs, userRes] = await Promise.all([
      fetchAll(foodBase),
      fetchAll(weightBase),
      db.collection('users').where({ _openid: openid }).get()
    ])
    const user = userRes.data[0] || null
    const targetCal = Number(user && user.daily_calorie_target) || 0
    const targetPro = Number(user && user.daily_protein_target_g) || 0

    const dayMap = {}
    foodLogs.forEach(l => {
      if (!l.date) return
      const key = l.date
      if (!dayMap[key]) dayMap[key] = { cal: 0, pro: 0 }
      dayMap[key].cal += l.total_calorie || 0
      dayMap[key].pro += l.total_protein_g || 0
    })

    const weightsByDate = {}
    weightLogs.forEach(w => {
      if (!w.date) return
      weightsByDate[w.date] = Number(w.weight_kg)
    })
    const weights = weightLogs.map(w => ({
      date: w.date,
      weight_kg: w.weight_kg,
      nutr: judgeNutr(dayMap[w.date], targetCal, targetPro)
    }))

    const dates = genDates(startDate, endDate)
    const summary = {
      recorded_days: Object.keys(dayMap).length,
      week: summarizeWindow(dates, dayMap, targetCal, targetPro, 7),
      month: summarizeWindow(dates, dayMap, targetCal, targetPro, 30)
    }
    const weeks = buildWeeks(dates, dayMap, weightsByDate, targetCal, targetPro)

    const result = {
      code: 0,
      message: 'ok',
      data: {
        start_date: startDate,
        end_date: endDate,
        days,
        target: { calorie: targetCal, protein_g: targetPro },
        weights,
        summary,
        weeks
      }
    }
    logger.info(FN, 'success', {
      duration: Date.now() - startTime,
      foodCount: foodLogs.length,
      weightCount: weightLogs.length,
      recordedDays: summary.recorded_days,
      hasUser: !!user
    })
    return result
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - startTime })
    return { code: -1, message: '服务器内部错误' }
  }
}
