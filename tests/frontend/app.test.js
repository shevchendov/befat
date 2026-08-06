require('./setup')
const { getColRef } = require('./setup')

let appConfig

beforeAll(() => {
  global.App = jest.fn(cfg => { appConfig = cfg })
  require('../../miniprogram/app')
})

beforeEach(() => {
  getColRef('users')._docs.length = 0
})

function buildApp() {
  const app = { ...appConfig, globalData: { userInfo: null, dailyTargets: null } }
  app.checkUserStatus = appConfig.checkUserStatus.bind(app)
  return app
}

describe('app.checkUserStatus - initialization gate', () => {
  test('无文档时不设置 userInfo', async () => {
    const app = buildApp()
    await app.checkUserStatus()
    expect(app.globalData.userInfo).toBeNull()
  })

  test('文档已初始化（target_weight_kg 有值）时设置 userInfo 与 dailyTargets', async () => {
    getColRef('users')._docs.push({
      _id: 'u1', _openid: 'openid-mock',
      target_weight_kg: 70, daily_calorie_target: 2600, daily_protein_target_g: 108
    })
    const app = buildApp()
    await app.checkUserStatus()
    expect(app.globalData.userInfo.target_weight_kg).toBe(70)
    expect(app.globalData.dailyTargets).toEqual({ calorie: 2600, protein: 108 })
  })

  test('文档存在但 target_weight_kg 为空（重置后）不设置 userInfo', async () => {
    getColRef('users')._docs.push({
      _id: 'u1', _openid: 'openid-mock',
      target_weight_kg: null, daily_calorie_target: null, daily_protein_target_g: null
    })
    const app = buildApp()
    await app.checkUserStatus()
    expect(app.globalData.userInfo).toBeNull()
    expect(app.globalData.dailyTargets).toBeNull()
  })
})
