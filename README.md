# 微信小程序：语音录制并上传示例

本项目提供一个最小可运行的微信小程序页面：

1. 使用微信小程序原生录音 API（`wx.getRecorderManager`）录制语音（测试号可用，无需企业认证等额外权限）。
2. 将录音得到的临时文件（`tempFilePath`）通过 `wx.uploadFile` 上传到后端（示例为 `https://api.coze.cn/v1/files/upload`）。

## 使用方式

1. 用微信开发者工具打开项目根目录（包含 `project.config.json`）。
2. 进入首页，粘贴你的 `Access Token`（用于请求头 `Authorization: Bearer ...`）。
3. 点击「开始录音」→「停止」→「上传」。

## 关键目录结构

为了让 `pages/index/index.js` 不承载业务逻辑，项目将业务能力抽离为独立模块：

- `miniprogram/pages/index/index.js`：仅作为页面入口（`Page(require('./page'))`）
- `miniprogram/pages/index/page.js`：页面状态与交互逻辑
- `miniprogram/services/uploadService.js`：调用 Coze 上传 API 的逻辑
- `miniprogram/services/tokenService.js`：Access Token 的本地存取

## 关键上传代码

上传逻辑位于 `miniprogram/services/uploadService.js`，页面侧只调用服务方法：

```js
const { uploadAudioFile } = require('../../services/uploadService')

uploadAudioFile(tempFilePath, accessToken)
  .then(({ fileId }) => {
    console.log('上传成功, file_id:', fileId)
  })
  .catch((err) => {
    console.error('上传失败:', err)
  })
```
