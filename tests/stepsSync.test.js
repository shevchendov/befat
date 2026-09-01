let mockStepInfoList = []

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'env-mock'
}))

const stepsSync = require('../cloudfunctions/stepsSync/index')

beforeEach(() => {
  mockStepInfoList = []
})

describe('stepsSync - CloudID 自动解密', () => {
  test('空 stepInfoList 返回 0 步', async () => {
    const res = await stepsSync.main({ stepCloud: { data: { stepInfoList: [] } } })
    expect(res.code).toBe(0)
    expect(res.data.steps).toBe(0)
    expect(res.data.calorie).toBe(0)
  })

  test('取最新步数并换算消耗（*0.04）', async () => {
    const res = await stepsSync.main({ stepCloud: { data: { stepInfoList: [
      { timestamp: 1, step: 5000 },
      { timestamp: 2, step: 8000 }
    ] } } })
    expect(res.code).toBe(0)
    expect(res.data.steps).toBe(8000)
    expect(res.data.calorie).toBe(320)
  })

  test('参数缺失/结构异常降级返回 0 不抛错', async () => {
    const res = await stepsSync.main({ stepCloud: null })
    expect(res.code).toBe(0)
    expect(res.data.steps).toBe(0)
  })

  test('step 为非数字时按 0 处理', async () => {
    const res = await stepsSync.main({ stepCloud: { data: { stepInfoList: [{ step: 'abc' }] } } })
    expect(res.code).toBe(0)
    expect(res.data.steps).toBe(0)
  })
})