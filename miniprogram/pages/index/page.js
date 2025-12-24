const { getAccessToken, setAccessToken, clearAccessToken } = require('../../services/tokenService')
const { ensureRecordPermission } = require('../../services/permissionService')
const { uploadAudioFile } = require('../../services/uploadService')
const { formatTime } = require('../../utils/time')

module.exports = {
  data: {
    status: 'idle', // 'idle', 'recording', 'review', 'playing', 'uploading'
    duration: 0,
    timeDisplay: '00:00',
    tempFilePath: '',
    toast: null,

    // Auth related
    hasApiKey: false,
    accessToken: '',
    tempTokenInput: '' // 用户正在输入的 token
  },

  onLoad() {
    this.checkLocalToken()

    this._recordTimer = null
    this.recorderManager = wx.getRecorderManager()
    this.innerAudioContext = wx.createInnerAudioContext()

    this.recorderManager.onStart(() => {
      this.setData({
        status: 'recording',
        duration: 0,
        timeDisplay: '00:00',
        tempFilePath: ''
      })
      this._startTime = Date.now()
      this._startRecordTimer()
    })

    this.recorderManager.onStop((res) => {
      this._stopRecordTimer()
      const tempFilePath = res && res.tempFilePath ? res.tempFilePath : ''

      if (Date.now() - this._startTime < 500) {
        this.resetState()
        this.showToast('说话时间太短', 'warn')
        return
      }

      if (tempFilePath) {
        this.setData({
          status: 'review',
          tempFilePath
        })
      } else {
        this.resetState()
        this.showToast('录音失败', 'warn')
      }
    })

    this.recorderManager.onError(() => {
      this._stopRecordTimer()
      this.resetState()
      this.showToast('录音权限或设备错误', 'warn')
    })

    this.innerAudioContext.onPlay(() => {
      this.setData({ status: 'playing' })
    })

    this.innerAudioContext.onEnded(() => {
      this.setData({ status: 'review' })
    })

    this.innerAudioContext.onStop(() => {
      this.setData({ status: 'review' })
    })

    this.innerAudioContext.onError(() => {
      this.showToast('播放失败', 'warn')
      this.setData({ status: 'review' })
    })
  },

  onUnload() {
    this._stopRecordTimer()
    try {
      if (this.recorderManager) this.recorderManager.stop()
      if (this.innerAudioContext) this.innerAudioContext.destroy()
    } catch (e) {}
  },

  checkLocalToken() {
    const token = getAccessToken()
    if (token) {
      this.setData({
        hasApiKey: true,
        accessToken: token
      })
    } else {
      this.setData({ hasApiKey: false })
    }
  },

  onTokenInput(e) {
    this.setData({ tempTokenInput: e.detail.value.trim() })
  },

  saveToken() {
    const token = this.data.tempTokenInput
    if (!token) {
      this.showToast('Token 不能为空', 'warn')
      return
    }

    setAccessToken(token)

    this.setData({
      hasApiKey: true,
      accessToken: token
    })
    this.showToast('登录成功', 'success')
  },

  clearToken() {
    wx.showModal({
      title: '退出登录',
      content: '确定要清除本地保存的 Key 吗？',
      success: (res) => {
        if (res.confirm) {
          clearAccessToken()
          this.setData({
            hasApiKey: false,
            accessToken: '',
            tempTokenInput: ''
          })
          this.resetState()
        }
      }
    })
  },

  showToast(message, type = 'normal') {
    this.setData({ toast: { message, type } })
    setTimeout(() => {
      this.setData({ toast: null })
    }, 2000)
  },

  resetState() {
    if (this.data.tempFilePath) {
      this._clearTempFile(this.data.tempFilePath)
    }
    this.setData({
      status: 'idle',
      duration: 0,
      timeDisplay: '00:00',
      tempFilePath: ''
    })
    this._stopRecordTimer()
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
    if (this.data.status !== 'idle') return
    this._ensureRecordPermission()
      .then(() => {
        this.startRecord()
      })
      .catch(() => {})
  },

  handleTouchEnd() {
    if (this.data.status === 'recording') {
      this.stopRecord()
    }
  },

  startRecord() {
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
    this.recorderManager.stop()
  },

  handlePlay() {
    if (this.data.status === 'playing') {
      this.innerAudioContext.stop()
    } else if (this.data.tempFilePath) {
      this.innerAudioContext.src = this.data.tempFilePath
      this.innerAudioContext.play()
    }
  },

  handleDelete() {
    this.resetState()
    this.showToast('录音已删除')
  },

  handleUpload() {
    const { tempFilePath, status, accessToken } = this.data
    if (!tempFilePath || status === 'uploading') return

    if (!accessToken) {
      this.showToast('Token 丢失，请重新登录', 'warn')
      this.setData({ hasApiKey: false })
      return
    }

    this.setData({ status: 'uploading' })

    uploadAudioFile(tempFilePath, accessToken)
      .then(({ fileId }) => {
        this.setData({ status: 'review' })

        if (fileId) {
          wx.showModal({
            title: '上传成功',
            content: `File ID:\n${fileId}`,
            showCancel: false,
            confirmText: '复制并返回',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.setClipboardData({
                  data: fileId,
                  success: () => {
                    this.showToast('已复制 ID', 'success')
                  }
                })
              }
              this.resetState()
            }
          })
        } else {
          wx.showModal({
            title: '上传成功',
            content: '文件已上传，但未能解析返回的 File ID。请检查控制台日志。',
            showCancel: false,
            confirmText: '确定',
            success: () => {
              this.resetState()
            }
          })
        }
      })
      .catch((err) => {
        this.setData({ status: 'review' })
        this.showToast(err && err.message ? err.message : '网络请求失败', 'warn')
      })
  },

  formatTime(seconds) {
    return formatTime(seconds)
  },

  _startRecordTimer() {
    this._stopRecordTimer()
    this._recordTimer = setInterval(() => {
      const duration = this.data.duration + 1
      this.setData({
        duration,
        timeDisplay: this.formatTime(duration)
      })
    }, 1000)
  },

  _stopRecordTimer() {
    if (this._recordTimer) {
      clearInterval(this._recordTimer)
      this._recordTimer = null
    }
  },

  _ensureRecordPermission() {
    return ensureRecordPermission()
  }
}
