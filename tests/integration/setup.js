const sdk = require('wx-server-sdk')

beforeEach(() => {
  sdk.__resetDB()
})

module.exports = { sdk }
