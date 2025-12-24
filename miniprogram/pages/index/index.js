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
    statusText: '等待录音',
    isRecording: false,
    recordSeconds: 0,
    tempFilePath: '',
    uploading: false,
    fileId: ''
  },

  onLoad() {
    this._recordTimer = null
    this.recorderManager = wx.getRecorderManager()
    this.innerAudioContext = wx.createInnerAudioContext()

    this.recorderManager.onStart(() => {
      this.setData({
        statusText: '正在录音',
        isRecording: true,
        recordSeconds: 0,
        tempFilePath: '',
        fileId: ''
      })
      this._startRecordTimer()
    })

    this.recorderManager.onStop((res) => {
      this._stopRecordTimer()
      const tempFilePath = res && res.tempFilePath ? res.tempFilePath : ''
      if (tempFilePath) {
        this.setData({
          statusText: '录音已完成',
          isRecording: false,
          tempFilePath
        })
      } else {
        this.resetState('录音失败')
      }
    })

    this.recorderManager.onError((err) => {
      this._stopRecordTimer()
      this.resetState(`录音错误: ${normalizeError(err)}`)
      wx.showToast({
        title: '录音失败',
        icon: 'none'
      })
    })

    this.innerAudioContext.onEnded(() => {
      this.setData({ statusText: '播放结束' })
    })

    this.innerAudioContext.onError((err) => {
      wx.showToast({
        title: `播放失败`,
        icon: 'none'
      })
    })
  },

  onUnload() {
    this._stopRecordTimer()
    try {
      if (this.recorderManager) this.recorderManager.stop()
      if (this.innerAudioContext) this.innerAudioContext.destroy()
    } catch (e) {}
  },

  onAccessTokenInput(e) {
    this.setData({ accessToken: (e.detail.value || '').trim() })
  },

  resetState(statusText = '等待录音') {
    if (this.data.tempFilePath) {
      this._clearTempFile(this.data.tempFilePath)
    }
    this.setData({
      statusText,
      isRecording: false,
      recordSeconds: 0,
      tempFilePath: '',
      uploading: false
    })
  },

  _clearTempFile(filePath) {
    if (!filePath) return
    try {
      wx.getFileSystemManager().unlink({
        filePath,
        fail: () => {}
      })
    } catch (e) {}
  },

  handleTouchStart() {
    this._ensureRecordPermission()
      .then(() => {
        this.startRecord()
      })
      .catch((err) => {
        // Permission modal already shown in _ensureRecordPermission
      })
  },

  handleTouchEnd() {
    if (this.data.isRecording) {
      this.stopRecord()
    }
  },

  startRecord() {
    if (this.data.isRecording) return
    try {
      this.innerAudioContext.stop()
    } catch (e) {}

    this.recorderManager.start({
      duration: 600000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: 'mp3'
    })
  },

  stopRecord() {
    if (!this.data.isRecording) return
    this.recorderManager.stop()
  },

  playRecord() {
    if (!this.data.tempFilePath) return
    this.innerAudioContext.src = this.data.tempFilePath
    this.innerAudioContext.play()
    this.setData({ statusText: '正在播放' })
  },

  deleteRecord() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这段录音吗？',
      success: (res) => {
        if (res.confirm) {
          this.resetState()
        }
      }
    })
  },

  uploadRecord() {
    const { tempFilePath, accessToken, uploading } = this.data
    if (!tempFilePath || !accessToken || uploading) {
      if (!accessToken) {
        wx.showToast({
          title: '请输入 Access Token',
          icon: 'none'
        })
      }
      return
    }

    this.setData({ uploading: true, statusText: '正在上传' })

    wx.uploadFile({
      url: UPLOAD_URL,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${accessToken}`
      },
      success: (res) => {
        const statusOk = res.statusCode >= 200 && res.statusCode < 300
        if (statusOk) {
          wx.showToast({
            title: '上传成功',
            icon: 'success'
          })
          let parsed
          try {
            parsed = JSON.parse(res.data)
          } catch (e) {}
          const fileId = parsed && parsed.data && parsed.data.id ? parsed.data.id : ''
          this.setData({ fileId })
          
          // Successfully uploaded, reset state after a short delay
          setTimeout(() => {
            this.resetState('上传成功')
          }, 1500)
        } else {
          wx.showToast({
            title: '上传失败',
            icon: 'none'
          })
          this.setData({ uploading: false, statusText: '上传失败' })
        }
      },
      fail: (err) => {
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        })
        this.setData({ uploading: false, statusText: '上传错误' })
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
          if (res.authSetting['scope.record']) return resolve()
          wx.authorize({
            scope: 'scope.record',
            success: () => resolve(),
            fail: () => {
              wx.showModal({
                title: '需要录音权限',
                content: '请在设置中开启麦克风权限',
                confirmText: '去设置',
                success: (res) => {
                  if (res.confirm) wx.openSetting()
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
})
