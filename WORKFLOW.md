# KOKO 预订系统 · 完整工作流

这份文档按「业务怎么跑」来写：一笔订单从客户下单到门店收到通知的全过程、系统会发出的每一封邮件、员工怎么处理订单，以及我们改代码上线的流程。每个文件具体做什么，看 [README.md](README.md)。

---

## 一、订单的完整生命周期

### 0. 客户从哪里进来
- 首页和 `/parties` 有快速预订小部件（[koko-homepage-quick-booking.html](koko-homepage-quick-booking.html)、[koko-parties-quick-booking.html](koko-parties-quick-booking.html)）。客户选好地点、日期、人数后，带着 `?auto_check=1` 跳进完整的预订流程。
- [koko-attribution.js](koko-attribution.js) 记录客户第一次进来时的渠道和落地页（UTM 参数或来源网站、`entry_page`），之后随订单一起保存。

### 1. 下单（Webflow 前端 → Xano）

| 类型 | 页面 | 脚本 | 接口 |
|---|---|---|---|
| 生日派对 | `/booking/birthday-party` | [koko-booking.js](koko-booking.js) | `CreateBooking` |
| 团体 | `/booking/group` | [koko-group-booking.js](koko-group-booking.js) | `CreateGroupBooking` |

客户依次选：地点 → 查空位 → 套餐 → 加购 → 联系方式（可以填推荐码，可以勾选营销同意）→ 确认页。

- 点「Review」会生成一个 **`hold` 订单**。这个房间和时段会被锁 15 分钟（`hold_expires_at_ts`）。
- 如果有 $30 折扣（老客户或推荐码），这笔抵扣会先**预留**（`pending`），还不算用掉。
- 客户勾了营销同意的话，通过 `mailchimp_subscribe` 加进 Mailchimp，标签是 `online booking`，同时写入名字、门店（`STORE`）和电话（`PHONE`，格式 `+614…`）。只写有值的字段，所以之后再订 newsletter 不会把门店和电话清空。Mailchimp 出错也不会影响下单。
- 团体订单加购麻将时，客户要选麻将玩法。
- [koko-booking-presence.js](koko-booking-presence.js) 在客户停留期间每 60 秒发一次 `BookingHeartbeat`，记录客户还在页面上。

### 2. 付款（Stripe）
- 点「Pay」会调用 `ConfirmBooking` / `ConfirmGroupBooking`，每次都新建一个 Stripe Checkout 链接。
- 默认付 **$50 定金 + $1.50 Booking fee**。团体订单也可以选**一次付清**（`payment_option: "full"`）。
- 付完跳到 `/booking/booking-success`，客户取消付款就跳到 `/booking/booking-cancelled`。
- 成功页会用 `VerifyBookingConversion` 确认确实付了钱，再计一次转化。

### 3. 付款成功（`StripeWebhook`）
1. 订单状态改为 `deposit_paid`（付清的改为余额 0）。
2. 生成这笔订单的 `referral_code`。
3. 结算预留的折扣：标记为已用，或者给推荐人发 $30 抵扣。
4. 给这位客户再发一张 $30 抵扣，下次可用。
5. 发确认邮件（见「三、邮件」）。
6. 团体订单有麻将加购的，调用 `reserve_mahjong_rooms`，在 Cityheroes 麻将系统里占房。

Stripe 发来 `checkout.session.expired` 时，只要订单还没付钱，就改为 `expired`。

### 4. 没付款怎么办（弃单挽回）
- [Reminders.gs](Reminders.gs) **每 5 分钟**调用一次 `RunReminders`，发两封提醒邮件（见「三、邮件」）。
- 同一个邮箱后来又下了新单或已经付款的，就跳过，并在 `reminder_skip_reason` 里记下原因。
- 邮件按钮指向 `/booking/resume`，这个页面会重新生成 Stripe 链接并跳转过去。
- 订单生成 **24 小时**后还没付，`expire_stale_holds` 会把它改为 `expired`，同时退回预留的抵扣。
  - ⚠️ 15 分钟锁房和 24 小时放弃是两个独立的计时，不能混在一起改。

### 5. 门店收到通知（Google 表格 / 日历）
[SyncBookings.gs](SyncBookings.gs) **每小时**运行一次：
- 从 `BookingSheetExport` 拉全部订单，重写「Booking Master」表格。
- 每个已付款或 `confirmed` 的订单在对应门店的 Google 日历里建一个事件（发票单的标题以 `🧾[INVOICE]` 开头，开始前 30 分钟弹窗提醒）。
- 给门店发 `[NEW BOOKING]`、`[BOOKING CHANGED]`、`[BOOKING CANCELLED]` 邮件（见「三、邮件」）。

### 6. 员工后台
[koko-admin.js](koko-admin.js)（Webflow 上一个不让搜索引擎收录的页面，进入时需要输入 `ADMIN_KEY`）：
- 员工可以搜索、筛选订单，修改日期、时间、门店、房间、人数、套餐、联系人和派对信息、备注、加购（点按钮添加）和状态。金额会自动算好，也可以手动改。
- 可以取消订单、重发确认邮件、复制未付款订单的付款链接。
- 每次保存都会记进 `admin_log`。**在后台改金额不会通过 Stripe 收款或退款。**
- 改过的已付款订单最多一小时后会同步到日历，并发出 `[BOOKING CHANGED]`。

### 订单状态

```
hold ──付款──► deposit_paid / paid
  │  └─pending_payment─┘
  └─24h 未付──► expired
confirmed   员工手动录入的发票单（不走 Stripe，也不发提醒）
cancelled / refunded   员工在后台操作
```

### 营销那条线（和订单系统分开）
- 首页 Newsletter 表单 → Webflow webhook → `NewsletterSignup` → Mailchimp（标签 `website newsletter`）。
- [BirthdaySync.gs](BirthdaySync.gs)：每天凌晨 3 点从 Mailchimp 读取会员，在生日前 7 天发一个生日礼品码 `CODE`，同时写进 Members 表格。
- [SyncMailchimp.gs](SyncMailchimp.gs)：把另一张表单的回复按门店分别同步到对应的 Mailchimp audience。

---

## 二、定时任务一览

| 频率 | 由谁执行 | 做什么 |
|---|---|---|
| 每 5 分钟 | Apps Script `Reminders.gs` | 调用 `RunReminders` 发弃单提醒 |
| 每小时 | Apps Script `SyncBookings.gs` | 同步表格、日历，给门店发邮件 |
| 每天凌晨 3 点 | Apps Script `BirthdaySync.gs` | 给会员发生日礼品码，同步 Members 表格 |
| 每次有人下单 | Xano `expire_stale_holds` | 把超过 24 小时未付的订单改为 `expired` |
| 手动 | GitHub Actions `reminders.yml` | `RunReminders` 的备用触发入口 |

---

## 三、邮件

系统有两套发信方式：

| | 客户邮件 | 门店邮件 |
|---|---|---|
| 谁来发 | Xano 通过 **Resend** 发送 | Apps Script（`SyncBookings.gs`）通过 **Gmail（MailApp）** 发送 |
| 发件人 | `KOKO Amusement <booking@mail.morefun.com.au>`（必须用这个已验证的域名，换别的地址会直接 403） | 名称显示「KOKO Booking Bot」，地址是运行这个 Apps Script 的 Gmail 账号 |
| 格式 | 品牌样式的 HTML | 纯文本 |
| 时效 | 事件发生时立刻发 | 每小时同步时才发，**最多晚 1 小时** |
| 发送失败时 | 不记为已发送（见下方各封邮件） | 这一列留空，下个小时自动重试 |

### A. 发给客户的邮件

| # | 邮件 | 什么时候发 | 标题 | 在哪里改 |
|---|---|---|---|---|
| 1 | **确认邮件** | Stripe 付款成功时 | 生日单：`{孩子名}'s KOKO Birthday Party Confirmed #ID`<br>其他：`KOKO Booking Deposit Confirmation #ID`<br>付清的单标题里去掉 "Deposit" | [StripeWebhook.txt](StripeWebhook.txt) |
| 2 | **重发确认邮件** | 员工在后台点「Resend confirmation email」 | 和第 1 封一样 | [ResendConfirmationEmail.txt](ResendConfirmationEmail.txt) |
| 3 | **提醒 1**（弃单） | 订单生成 15 分钟以上、客户已离开页面 15 分钟、仍未付款 | `Your KOKO booking isn't confirmed yet (#ID)` | [RunReminders.txt](RunReminders.txt) |
| 4 | **提醒 2**（最后机会） | 订单生成 20 小时、仍未付款 | `Last chance — your KOKO booking expires in 4 hours` | [RunReminders.txt](RunReminders.txt) |
| 5 | 推荐码补发 | 一次性任务，已经跑完，现在会拒绝所有调用 | `You've got a $30 referral code from KOKO Amusement` | [BackfillReferralCodesAndCredits.txt](BackfillReferralCodesAndCredits.txt) |

- **确认邮件的内容：** 订单详情、加购分项、付款汇总（含折扣行、已付金额、余额）、改期须知、定金不退说明（付清的单会换掉这段）、生日邀请函下载区（团体单不显示）、推荐码卡片、客户资料。
- **确认邮件发送失败时：** `confirmation_email_sent_at` 保持空白，员工后台显示「Confirmation email: —」，员工点重发即可。重发也失败的话，后台会弹出红色提示「Didn't send」。
- **提醒邮件** 只有在 Resend 收下后才会标记为已发送，失败的会在下一轮重试。
- **联系邮箱** 统一写的是 `marketing@kokoamusement.com.au`。
- **生日礼品码邮件** 由 Mailchimp 那边的自动化发出，不在这个仓库里。`BirthdaySync.gs` 只负责写入 `CODE` 字段。

### B. 发给门店的邮件（每小时由 SyncBookings 发）

| 邮件 | 什么时候发 | 标题 |
|---|---|---|
| **`[NEW BOOKING]`** | 已付定金或 `confirmed` 的订单第一次被同步到 | `[NEW BOOKING] #ID - 门店 - 日期 开始时间` |
| **`[BOOKING CHANGED]`** | 已付款订单的门店、房间、日期、时间、人数、套餐或加购有改动 | `[BOOKING CHANGED] #ID - …`，正文列出「旧值 → 新值」。换门店的话两家店都会收到 |
| **`[BOOKING CANCELLED]`** | 已付款订单变成 cancelled、expired 或 refunded | `[BOOKING CANCELLED] #ID - …`，正文写着 "Please free up this slot" |

- 只改备注或客户电话**不会**发邮件。
- 发票单（`confirmed`）的 NEW BOOKING 邮件会注明「paid by invoice — not paid online yet」。

**门店收件地址**（和日历是同一个账号，在 `SyncBookings.gs` 的 `STORE_CALENDAR_ID_MAP` 里改）：

| 门店 | 收件邮箱 |
|---|---|
| Town Hall - 614 | 614partykoko@gmail.com |
| Haymarket | haymarketparty@gmail.com |
| Hornsby Level 4 | hbpartykoko@gmail.com |
| KOKO & Cityheroes Hornsby Level 2 | hbpartykoko@gmail.com（和 L4 是同一个收件箱） |
| Hurstville | hvpartykoko@gmail.com |
| Burwood | kokoburwoodpackage@gmail.com |

### C. 内部警报
- **`[ACTION NEEDED] Mahjong rooms not held for KOKO booking #ID`**：团体单已经付款，但在 Cityheroes 占麻将房失败了。这封邮件由 Resend 发到 `marketing@kokoamusement.com.au`，需要人工去补占房。来源是 [reserve_mahjong_rooms.txt](reserve_mahjong_rooms.txt)。

### 目前客户收不到的邮件
- 员工在后台**改了订单**：只有门店收到 `[BOOKING CHANGED]`，客户收不到更新后的确认邮件，需要员工手动点「重发确认」。
- 员工在后台**取消订单或退款**：客户不会收到任何邮件。
- **活动前一天的提醒**：没有。
- 订单 24 小时未付款被**过期**：客户不会收到通知。

---

## 四、我们的开发和上线流程

### 改 Xano 后端（`.txt` 文件）
1. **先拉线上版本**（用 Metadata API，token 在开发机的 `~/.xano_token`，不放进仓库）。员工可能在 Xano 界面里改过，不能直接拿仓库里的版本去覆盖。
2. 在线上版本的基础上改。`PUT` 上去后**立刻就是正式环境**，所以每次写入前都要先说一声。
3. 用一个会在执行前就被拒绝的请求去验证（比如密钥写错、订单号不存在）。
4. 再把线上版本拉回仓库，让 `.txt` 文件和正式环境一致，然后 commit。
5. 新加的字段要**先在 `bookings` 表里建列**，否则存不进去。

### 改前端脚本（`.js`）
1. 在仓库里改好，commit 并 push 到 GitHub。
2. Webflow 里通过 jsDelivr 引用，**一定要写 commit hash**（`@<commit>`），不能写 `@main`，否则 CDN 会给旧版本。
3. Webflow 改完要 **Publish**。只 Save 不会上线，这是最常见的「改了没反应」的原因。

### 改 Apps Script（`.gs`）
- 在仓库里改好，然后手动粘贴到 Apps Script 编辑器。
- 触发器用 `install…Trigger()` 安装，只需要运行一次。

### 密钥放在哪里（仓库是公开的，任何密钥都不能出现在里面）

| 密钥 | 存放位置 | 对应的另一端 |
|---|---|---|
| `RESEND_API_KEY` / `MC_API_KEY` | Xano 工作区变量 | — |
| `REMINDER_SECRET` | Xano 工作区变量 | Apps Script Script Property（GitHub 手动备份流程也用它） |
| `SHEET_EXPORT_KEY` | Xano 工作区变量 | Apps Script `XANO_EXPORT_KEY` |
| `ADMIN_KEY` | Xano 工作区变量 | 员工在后台页面输入 |
| `WEBFLOW_HOOK_KEY` | Xano 工作区变量 | Webflow webhook URL |
| Stripe 密钥 | Xano 表 `stripe_location_keys`（每个门店一份） | — |
| Cityheroes 密钥 | Xano 表 `partner_keys` | Cityheroes `settings` |

任何密钥只要在 git 历史里出现过，就等于公开了：要换掉，光删掉没用。

### 定价常量要几处一起改
$50 定金、$1.50 Booking fee、$30 折扣在两个前端脚本和多个 Xano 接口里**各有一份**，改的时候每一份都要改。
