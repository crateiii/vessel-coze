// 工具函数：格式化错误信息
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

const STORAGE_KEY = 'coze_access_token'
const UPLOAD_URL = 'https://api.coze.cn/v1/files/upload'

Page({
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
    // 1. 检查本地存储
    this.checkLocalToken()

    this._recordTimer = null
    this.recorderManager = wx.getRecorderManager()
    this.innerAudioContext = wx.createInnerAudioContext()

    // --- 录音监听 ---
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

      // 防止误触：如果录音时间太短(<500ms)，直接重置
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
      this.showToast('录音权限或设备错误', 'warn')
    })

    // --- 播放监听 ---
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

  // --- Auth Logic ---

  checkLocalToken() {
    const token = wx.getStorageSync(STORAGE_KEY)
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

    // 保存到本地
    wx.setStorageSync(STORAGE_KEY, token)

    this.setData({
      hasApiKey: true,
      accessToken: token
    })
    this.showToast('登录成功', 'success')
  },

  // 清除 Token (用于测试，点击标题触发)
  clearToken() {
    wx.showModal({
      title: '退出登录',
      content: '确定要清除本地保存的 Key 吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync(STORAGE_KEY)
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

  // --- UI Helpers ---

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

  // --- 交互事件处理 ---

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

  // 上传逻辑 (使用 Access Token)
  handleUpload() {
    const { tempFilePath, status, accessToken } = this.data
    if (!tempFilePath || status === 'uploading') return

    if (!accessToken) {
      this.showToast('Token 丢失，请重新登录', 'warn')
      this.setData({ hasApiKey: false })
      return
    }

    this.setData({ status: 'uploading' })

    // 发起真实上传
    wx.uploadFile({
      url: UPLOAD_URL,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${accessToken}`
      },
      success: (res) => {
        // 【重要】第一时间停止 loading，避免 UI 卡死
        this.setData({ status: 'review' })

        // 兼容处理 200-299 状态码
        const statusOk = res.statusCode >= 200 && res.statusCode < 300

        if (statusOk) {
          let fileId = ''
          try {
            let data = res.data
            console.log('API原始响应:', data)

            // wx.uploadFile 返回的 data 是字符串，需要解析
            if (typeof data === 'string') {
              data = JSON.parse(data)
            }

            // 针对您提供的结构: {"code":0,"data":{"id":"..."},...}
            if (data && data.data && data.data.id) {
              fileId = data.data.id
            } else if (data && data.id) {
              fileId = data.id // 兼容其他可能格式
            }
          } catch (e) {
            console.error('JSON 解析失败:', e)
            // 【保底方案】如果 JSON 解析失败，尝试用正则直接从字符串提取 ID
            // 匹配模式： "id":"12345..." 或 "id": "12345..."
            try {
              const strData = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
              const match = strData.match(/"id"\s*:\s*"([^"]+)"/)
              if (match && match[1]) {
                fileId = match[1]
                console.log('正则提取到的ID:', fileId)
              }
            } catch (err) {}
          }

          console.log("fieldId is: ", fileId)

          if (fileId) {
            // 弹窗展示 File ID
            wx.showModal({
              title: '上传成功',
              content: `File ID:\n${fileId}`,
              showCancel: false,
              confirmText: '复制并返回',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  // 复制到剪贴板
                  wx.setClipboardData({
                    data: fileId,
                    success: () => {
                      this.showToast('已复制 ID', 'success')
                    }
                  })
                }
                // 关闭弹窗后重置状态
                this.resetState()
              }
            })
          } else {
            console.warn('未解析到 File ID')
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
        } else {
          console.error('[Upload Error]', res)
          this.showToast('上传失败: ' + res.statusCode, 'warn')
        }
      },
      fail: (err) => {
        console.error('[Network Error]', err)
        this.showToast('网络请求失败', 'warn')
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