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
    status: 'idle', // 'idle', 'recording', 'review', 'playing', 'uploading'
    duration: 0,
    timeDisplay: '00:00',
    tempFilePath: '',
    fileId: '',
    toast: null,
    statusText: '', // for accessibility or sub-status
  },

  onLoad() {
    this._recordTimer = null
    this.recorderManager = wx.getRecorderManager()
    this.innerAudioContext = wx.createInnerAudioContext()

    this.recorderManager.onStart(() => {
      this.setData({
        status: 'recording',
        duration: 0,
        timeDisplay: '00:00',
        tempFilePath: '',
        fileId: ''
      })
      this._startTime = Date.now()
      this._startRecordTimer()
    })

    this.recorderManager.onStop((res) => {
      this._stopRecordTimer()
      const tempFilePath = res && res.tempFilePath ? res.tempFilePath : ''
      
      // 如果录音时间太短 (防止误触)
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

    this.recorderManager.onError((err) => {
      this._stopRecordTimer()
      this.resetState()
      this.showToast(`录音错误: ${normalizeError(err)}`, 'warn')
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

    this.innerAudioContext.onError((err) => {
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

  onAccessTokenInput(e) {
    this.setData({ accessToken: (e.detail.value || '').trim() })
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
      tempFilePath: '',
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
      .catch((err) => {
        // Permission modal already shown in _ensureRecordPermission
      })
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
    const { tempFilePath, accessToken, status } = this.data
    if (!tempFilePath || status === 'uploading') return

    if (!accessToken) {
      this.showToast('请输入 Access Token', 'warn')
      return
    }

    this.setData({ status: 'uploading' })

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
          this.showToast('上传成功', 'success')
          let parsed
          try {
            parsed = JSON.parse(res.data)
          } catch (e) {}
          const fileId = parsed && parsed.data && parsed.data.id ? parsed.data.id : ''
          this.setData({ fileId })
          
          setTimeout(() => {
            this.resetState()
          }, 1500)
        } else {
          this.showToast('上传失败', 'warn')
          this.setData({ status: 'review' })
        }
      },
      fail: (err) => {
        this.showToast('上传失败', 'warn')
        this.setData({ status: 'review' })
      }
    })
  },

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
