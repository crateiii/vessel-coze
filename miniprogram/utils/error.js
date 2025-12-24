function normalizeError(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  if (err.errMsg) return err.errMsg
  try {
    return JSON.stringify(err)
  } catch (e) {
    return String(err)
  }
}

module.exports = {
  normalizeError
}
