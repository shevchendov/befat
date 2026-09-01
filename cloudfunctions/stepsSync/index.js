// cloudfunctions/stepsSync/index.js
// 微信运动步数同步：前端传 wx.cloud.CloudID(res.cloudID)，由微信云开发底层自动解密为明文，
// 无需自建 session_key AES 解密，避免密钥失效风险。

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  try {
    // CloudID 已在入参处被前端经 wx.cloud.CloudID() 包裹，云函数侧取值即自动完成静默解密
    const werun = event.stepCloud

    // 明文结构：werun.data.stepInfoList 为最近 30 天步数列表（按时间升序）
    const stepInfoList = werun && werun.data && Array.isArray(werun.data.stepInfoList)
      ? werun.data.stepInfoList
      : []

    let steps = 0
    if (stepInfoList.length > 0) {
      const latest = stepInfoList[stepInfoList.length - 1]
      steps = Number(latest.step) || 0
    }

    return {
      code: 0,
      message: 'ok',
      data: {
        steps,
        calorie: Math.round(steps * 0.04)  // 步数 × 0.04 = 消耗 kcal
      }
    }
  } catch (err) {
    return { code: -1, message: '步数解密失败', data: { steps: 0, calorie: 0 } }
  }
}