jest.mock('wx-server-sdk')

beforeEach(() => {
  require('wx-server-sdk').__resetDB()
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key'
})
