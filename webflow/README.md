# 本轮 Webflow 代码快照

| 文件 | 位置 |
|---|---|
| `group-head.html` | `/booking/group` 页面 Head custom code |
| `group-footer.html` | `/booking/group` 页面 Footer custom code |
| `staff-embed.html` | `/staff/bookings` 原有 HTML Embed |

保留了原有样式、attribution、presence 和页面修正代码。新增的团体套餐和 PDF 从同一份 Xano 套餐数据读取；员工重发请求携带后台登录时输入的 ADMIN_KEY。

GitHub 连接及开发机凭据本轮均无仓库写权限，因此这三份前端代码以压缩后的内联脚本保存到 Webflow；可读源码分别是根目录的 `koko-group-booking.js`、`koko-group-print-quote.js` 和 `koko-admin.js`。

2026-11-13 悉尼时间 18:10 曾完成一次整站发布。随后用户明确要求停止发布，后续没有再进行 Webflow 修改或发布。这里的快照仅供代码审阅、归档和用户日后自行安排发布，不能据此自动覆盖当前仍在修改的页面。

恢复 GitHub 写权限并审阅提交后，可以再由用户决定是否改回固定 commit hash 的 jsDelivr 引用。
