const location = require('../../miniprogram/utils/location')

beforeEach(() => {
  global.wx = {
    getLocation: jest.fn(),
    showModal: jest.fn(),
    openSetting: jest.fn(),
    chooseLocation: jest.fn()
  }
})

describe('getUserLocation', () => {
  test('直接定位成功返回 auto 坐标', async () => {
    wx.getLocation.mockImplementation(({ success }) => success({ latitude: 22.5, longitude: 113.9 }))
    const res = await location.getUserLocation()
    expect(res.latitude).toBe(22.5)
    expect(res.longitude).toBe(113.9)
    expect(res.source).toBe('auto')
  })

  test('首次拒绝后引导授权成功，再次定位', async () => {
    wx.getLocation
      .mockImplementationOnce(({ fail }) => fail({ errMsg: 'auth deny' }))
      .mockImplementationOnce(({ success }) => success({ latitude: 22.5, longitude: 113.9 }))
    wx.showModal.mockImplementation(({ success }) => success({ confirm: true }))
    wx.openSetting.mockImplementation(({ success }) => success({ authSetting: { 'scope.userLocation': true } }))

    const res = await location.getUserLocation()
    expect(res.source).toBe('auto')
    expect(wx.getLocation).toHaveBeenCalledTimes(2)
    expect(wx.openSetting).toHaveBeenCalled()
  })

  test('二次拒绝后手动选点兜底', async () => {
    wx.getLocation.mockImplementation(({ fail }) => fail({}))
    wx.showModal.mockImplementation(({ success }) => success({ confirm: true }))
    wx.openSetting.mockImplementation(({ success }) => success({ authSetting: { 'scope.userLocation': false } }))
    wx.chooseLocation.mockImplementation(({ success }) => success({ latitude: 23, longitude: 114 }))

    const res = await location.getUserLocation()
    expect(res.source).toBe('manual')
    expect(res.latitude).toBe(23)
  })

  test('用户取消授权引导也走手动兜底', async () => {
    wx.getLocation.mockImplementation(({ fail }) => fail({}))
    wx.showModal.mockImplementation(({ success }) => success({ confirm: false }))
    wx.chooseLocation.mockImplementation(({ success }) => success({ latitude: 23, longitude: 114 }))

    const res = await location.getUserLocation()
    expect(res.source).toBe('manual')
  })

  test('手动选点也失败抛 NO_LOCATION', async () => {
    wx.getLocation.mockImplementation(({ fail }) => fail({}))
    wx.showModal.mockImplementation(({ success }) => success({ confirm: false }))
    wx.chooseLocation.mockImplementation(({ fail }) => fail({}))

    await expect(location.getUserLocation()).rejects.toThrow('NO_LOCATION')
  })
})