const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const logger = require('./common/logger')
const FN = 'getWxacode'

exports.main = async (event, context) => {
  const start = Date.now()
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  logger.info(FN, 'invoke', { hasOpenid: !!openid })

  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: openid,
      page: 'pages/index/index',
      checkPath: false,
      envVersion: 'release'
    })

    const fs = require('fs')
    const path = require('path')
    const tmp = path.join('/tmp', `wxacode_${openid}.png`)
    fs.writeFileSync(tmp, result.buffer)

    const upload = await cloud.uploadFile({
      cloudPath: `wxacode/${openid}.png`,
      fileContent: fs.createReadStream(tmp)
    })

    const ret = { code: 0, message: 'ok', data: { fileID: upload.fileID } }
    logger.info(FN, 'success', { fileID: upload.fileID, duration: Date.now() - start })
    return ret
  } catch (err) {
    logger.error(FN, 'crash', { error: err.message, duration: Date.now() - start })
    return { code: -1, message: '生成小程序码失败' }
  }
}
