const STORAGE_KEY = 'coze_access_token'

function getAccessToken() {
  return wx.getStorageSync(STORAGE_KEY) || ''
}

function setAccessToken(token) {
  wx.setStorageSync(STORAGE_KEY, token)
}

function clearAccessToken() {
  wx.removeStorageSync(STORAGE_KEY)
}

module.exports = {
  STORAGE_KEY,
  getAccessToken,
  setAccessToken,
  clearAccessToken
}
