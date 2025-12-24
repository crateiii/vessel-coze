const UPLOAD_URL = 'https://api.coze.cn/v1/files/upload'

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

Page({
  data: {
    accessToken: '',
    statusText: '未开始',
    isRecording: false,
    recordSeconds: 0,
    tempFilePath: '',
    uploading: false,
    uploadMessage: '',
    fileId: ''
  },

  onLoad() {
    this._recordTimer = null

    this.recorderManager = wx.getRecorderManager()
    this.innerAudioContext = wx.createInnerAudioContext()

    this.recorderManager.onStart(() => {
      this.setData({
        statusText: '录音中...',
        isRecording: true,
        recordSeconds: 0,
        tempFilePath: '',
        uploadMessage: '',
        fileId: ''
      })

      this._startRecordTimer()
    })

    this.recorderManager.onStop((res) => {
      this._stopRecordTimer()

      const tempFilePath = res && res.tempFilePath ? res.tempFilePath : ''

      this.setData({
        statusText: tempFilePath ? '已录制' : '录音结束（未获取到文件）',
        isRecording: false,
        tempFilePath
      })
    })

    this.recorderManager.onError((err) => {
      this._stopRecordTimer()
      this.setData({
        statusText: `录音失败：${normalizeError(err)}`,
        isRecording: false
      })
      wx.showToast({
        title: '录音失败',
        icon: 'none'
      })
    })

    this.innerAudioContext.onError((err) => {
      wx.showToast({
        title: `播放失败：${normalizeError(err)}`,
        icon: 'none'
      })
    })

    this.innerAudioContext.onEnded(() => {
      this.setData({ statusText: '播放结束' })
    })
  },

  onUnload() {
    this._stopRecordTimer()

    try {
      if (this.recorderManager && this.recorderManager.stop) this.recorderManager.stop()
    } catch (e) {}

    try {
      if (this.innerAudioContext) {
        if (this.innerAudioContext.stop) this.innerAudioContext.stop()
        if (this.innerAudioContext.destroy) this.innerAudioContext.destroy()
      }
    } catch (e) {}
  },

  onAccessTokenInput(e) {
    const accessToken = (e.detail.value || '').trim()
    this.setData({ accessToken })
  },

  startRecord() {
    if (this.data.isRecording) return

    this._ensureRecordPermission()
      .then(() => {
        try {
          if (this.innerAudioContext && this.innerAudioContext.stop) this.innerAudioContext.stop()
        } catch (e) {}

        this.recorderManager.start({
          duration: 10 * 60 * 1000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 96000,
          format: 'mp3'
        })
      })
      .catch((err) => {
        this.setData({ statusText: `未授权录音：${normalizeError(err)}` })
      })
  },

  stopRecord() {
    if (!this.data.isRecording) return
    try {
      this.recorderManager.stop()
    } catch (e) {
      this._stopRecordTimer()
      this.setData({
        statusText: `停止失败：${normalizeError(e)}`,
        isRecording: false
      })
    }
  },

  playRecord() {
    const { tempFilePath } = this.data
    if (!tempFilePath) return

    try {
      this.innerAudioContext.stop()
    } catch (e) {}

    this.innerAudioContext.src = tempFilePath
    this.innerAudioContext.play()
    this.setData({ statusText: '播放中...' })
  },

  uploadRecord() {
    const { tempFilePath, accessToken, uploading } = this.data
    if (!tempFilePath || !accessToken || uploading) return

    this.setData({
      uploading: true,
      uploadMessage: '',
      fileId: ''
    })

    wx.uploadFile({
      url: UPLOAD_URL,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${accessToken}`
      },
      success: (res) => {
        const statusOk = res.statusCode >= 200 && res.statusCode < 300

        let parsed
        try {
          parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        } catch (e) {
          parsed = null
        }

        const fileId = parsed && parsed.data && parsed.data.id ? parsed.data.id : ''
        const uploadMessage = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)

        this.setData({
          uploadMessage: statusOk ? uploadMessage : `HTTP ${res.statusCode}: ${uploadMessage}`,
          fileId
        })

        wx.showToast({
          title: statusOk ? '上传完成' : '上传失败',
          icon: statusOk ? 'success' : 'none'
        })
      },
      fail: (err) => {
        this.setData({ uploadMessage: `上传失败：${normalizeError(err)}` })
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        })
      },
      complete: () => {
        this.setData({ uploading: false })
      }
    })
  },

  _startRecordTimer() {
    this._stopRecordTimer()

    this._recordTimer = setInterval(() => {
      this.setData({ recordSeconds: this.data.recordSeconds + 1 })
    }, 1000)
  },

  _stopRecordTimer() {
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
  },

  _ensureRecordPermission() {
    return new Promise((resolve, reject) => {
      wx.getSetting({
        success: (res) => {
          const authorized = !!res.authSetting['scope.record']
          if (authorized) return resolve()

          wx.authorize({
            scope: 'scope.record',
            success: () => resolve(),
            fail: () => {
              wx.showModal({
                title: '需要录音权限',
                content: '请允许使用麦克风权限后再录音。',
                confirmText: '去设置',
                cancelText: '取消',
                success: (modalRes) => {
                  if (!modalRes.confirm) return reject(new Error('用户拒绝授权'))
                  wx.openSetting({
                    success: (settingRes) => {
                      if (settingRes.authSetting['scope.record']) resolve()
                      else reject(new Error('未开启录音权限'))
                    },
                    fail: (err) => reject(err)
                  })
                },
                fail: (err) => reject(err)
              })
            }
          })
        },
        fail: (err) => reject(err)
      })
    })
  }
})
