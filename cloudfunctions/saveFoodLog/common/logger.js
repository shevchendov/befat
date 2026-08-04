function safeStringify(obj) {
  try { return JSON.stringify(obj) } catch (e) { return String(obj) }
}

function sanitize(event) {
  const safe = { ...event }
  if (safe.raw_text && safe.raw_text.length > 100) {
    safe.raw_text = safe.raw_text.slice(0, 100) + '...'
  }
  return safe
}

function log(level, fn, msg, extra) {
  const entry = { level, time: new Date().toISOString(), fn, msg, ...extra }
  const line = JSON.stringify(entry)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

module.exports = {
  info(fn, msg, extra) { log('info', fn, msg, extra) },
  warn(fn, msg, extra) { log('warn', fn, msg, extra) },
  error(fn, msg, extra) { log('error', fn, msg, extra) },
  sanitize
}