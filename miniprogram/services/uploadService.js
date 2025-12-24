const UPLOAD_URL = 'https://api.coze.cn/v1/files/upload'

function uploadAudioFile(filePath, accessToken) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: UPLOAD_URL,
      filePath: filePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${accessToken}`
      },
      success: (res) => {
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
            resolve({ fileId })
          } else {
            console.warn('未解析到 File ID')
            resolve({ fileId: '', rawResponse: res.data })
          }
        } else {
          console.error('[Upload Error]', res)
          reject({ statusCode: res.statusCode, message: '上传失败: ' + res.statusCode })
        }
      },
      fail: (err) => {
        console.error('[Network Error]', err)
        reject({ message: '网络请求失败', error: err })
      }
    })
  })
}

module.exports = {
  uploadAudioFile
}
