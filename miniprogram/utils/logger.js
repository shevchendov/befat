const PAGE = ''

function getPage() {
  const pages = getCurrentPages()
  return pages.length > 0 ? pages[pages.length - 1].route || '' : ''
}

function formatTime() {
  return new Date().toISOString()
}

function info(msg, data) {
  const entry = { level: 'info', time: formatTime(), msg, page: getPage(), ...data }
  console.log(JSON.stringify(entry))
}

function warn(msg, data) {
  const entry = { level: 'warn', time: formatTime(), msg, page: getPage(), ...data }
  console.warn(JSON.stringify(entry))
}

function error(msg, err, extra) {
  const entry = {
    level: 'error',
    time: formatTime(),
    msg,
    page: getPage(),
    errMsg: err ? (err.message || String(err)).slice(0, 500) : '',
    ...extra
  }
  console.error(JSON.stringify(entry))

  wx.cloud.callFunction({
    name: 'reportError',
    data: {
      message: entry.errMsg,
      stack: err ? (err.stack || '').slice(0, 2000) : '',
      page: entry.page,
      action: msg,
      extra
    }
  }).catch(() => {})
}

module.exports = { info, warn, error }
