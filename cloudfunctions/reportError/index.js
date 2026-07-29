const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { message, stack, page, action, extra } = event

  const safeMessage = typeof message === 'string' ? message.slice(0, 500) : String(message || 'unknown error')
  const safeStack = typeof stack === 'string' ? stack.slice(0, 2000) : ''

  await db.collection('error_logs').add({
    data: {
      _openid: openid,
      message: safeMessage,
      stack: safeStack,
      page: page || '',
      action: action || '',
      extra: extra || null,
      created_at: db.serverDate()
    }
  })

  return { code: 0, message: 'ok' }
}
