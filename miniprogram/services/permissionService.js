function ensureRecordPermission() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.record']) return resolve()
        wx.authorize({
          scope: 'scope.record',
          success: () => resolve(),
          fail: () => {
            wx.showModal({
              title: '需要录音权限',
              content: '请在设置中开启麦克风权限',
              confirmText: '去设置',
              success: (modalRes) => {
                if (modalRes.confirm) wx.openSetting()
              }
            })
            reject(new Error('no permission'))
          }
        })
      },
      fail: reject
    })
  })
}

module.exports = {
  ensureRecordPermission
}
