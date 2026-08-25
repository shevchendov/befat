// utils/location.js
// 定位 + 授权引导 + 手动选点兜底

function getLocation() {
  return new Promise((resolve, reject) => {
    wx.getLocation({ type: 'gcj02', success: resolve, fail: reject })
  })
}

function showAuthGuide() {
  return new Promise(resolve => {
    wx.showModal({
      title: '需要位置权限',
      content: '开启定位后，为你推荐附近的特色餐厅',
      confirmText: '去开启',
      cancelText: '算了',
      success: res => resolve(!!res.confirm)
    })
  })
}

function openSetting() {
  return new Promise(resolve => {
    wx.openSetting({
      success: res => resolve(!!(res && res.authSetting && res.authSetting['scope.userLocation']))
    })
  })
}

function chooseLocation() {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({ success: resolve, fail: reject })
  })
}

async function manualFallback() {
  try {
    const res = await chooseLocation()
    return { latitude: res.latitude, longitude: res.longitude, source: 'manual' }
  } catch (err) {
    throw new Error('NO_LOCATION')
  }
}

async function getUserLocation() {
  try {
    const res = await getLocation()
    return { latitude: res.latitude, longitude: res.longitude, source: 'auto' }
  } catch (err) {
    const confirm = await showAuthGuide()
    if (confirm) {
      const granted = await openSetting()
      if (granted) {
        try {
          const res = await getLocation()
          return { latitude: res.latitude, longitude: res.longitude, source: 'auto' }
        } catch (e2) {
          return manualFallback()
        }
      }
    }
    return manualFallback()
  }
}

module.exports = { getUserLocation, getLocation, manualFallback }