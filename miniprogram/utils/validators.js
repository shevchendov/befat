function clampNumber(value, min, max) {
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  if (num < min) return min
  if (num > max) return max
  return String(num)
}

function sanitizeDigit(value) {
  return value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
}

function sanitizeNumber(value) {
  return value.replace(/[^0-9]/g, '')
}

function validateHeight(value) {
  return clampNumber(value, 50, 250)
}

function validateWeight(value) {
  return clampNumber(value, 20, 300)
}

function validateAge(value) {
  return clampNumber(value, 1, 150)
}

module.exports = {
  clampNumber,
  sanitizeDigit,
  sanitizeNumber,
  validateHeight,
  validateWeight,
  validateAge
}
