# 付款、占位与确认邮件的可靠性

本轮修复日期：2026-11-13。Team Max 100 的实际权益已经确认：**100 分钟游戏、10 次 Claw & Prize Games、8 次 Feature Games、1000 tickets**。

## 付款怎么确认

- `StripeWebhook` 对未经 JSON 解析的原文验证 Stripe HMAC 签名；接受 5 分钟内的时间戳，支持多个 `v1` 签名，逐门店匹配签名密钥。未签名或错误签名返回 403。
- 验签通过后，用对应门店的 Stripe API key 重新读取 Checkout Session；校验当前 Session、订单和门店编号、AUD、正式模式、付款状态及金额。定金应为 5000 分 + 150 分手续费，付清应等于下单时存下的付款金额 + 手续费。
- `apply_stripe_checkout` 在数据库事务中锁定订单。相同事件或同一个 Session 再到达时，付款、推荐码、推荐奖励和回头客抵扣均不重复执行。不同事件对应同一笔付款也只处理一次。
- 已有 `referral_code` 保持不变。奖励还会检查 `source_booking_id + reason`，避免重复发放。
- 不匹配的真实付款写入 `payment_review_reason`，供后台筛选和内部告警处理；不会自动覆盖已取消或退款的状态。
- 外部资源与邮件在付款事务提交后执行。`fulfil_paid_booking` 单独锁定订单，避免并发重复占麻将房；失败由后续定时任务补救。

## 三个独立的时钟

| 阶段 | 期限和规则 |
|---|---|
| 点 Review 后 | 原有 15 分钟房间占位；超时后恢复付款必须重新检查空位 |
| 进入 Stripe 后 | 约 31 分钟。Stripe 最低要求 30 分钟，这里多留 60 秒创建余量；`hold_expires_at_ts` 保存 Stripe 返回的实际截止时间 |
| 弃单挽回 | 仍保留创建后 24 小时的恢复窗口，以及原有 15 分钟／20 小时提醒 |

再次点击 Pay 时，先向 Stripe 查询原链接。金额和付款选项一致的有效链接会复用；需要换链接时，先确认旧链接已经过期，再生成新链接。已完成的付款不能再生成另一条收款链接。

`reconcile_checkout_holds` 由现有每 5 分钟的任务及下单／查空位流程触发：只有 Stripe 确认对应 Session 已过期，才释放房间与预留抵扣。Stripe 暂时不可达时保留占位，下一轮重试。旧系统留下的长有效期链接也会在创建后约 31 分钟被主动关闭。付款成功但回调迟到的订单由对账补处理。

Session 过期后，24 小时内的购物车回到 `hold`，房间截止时间为 0、付款 URL 清空；超过 24 小时才变成 `expired`。抵扣只在仍处于 `pending` 且归这笔订单所有时释放。恢复付款会重新锁定并预留抵扣；已被其他订单使用的抵扣要求客户重新 Review，避免沿用已失效的优惠。

`customer_credits.used_booking_id` 在 `pending` 阶段也保存预留订单编号；使用后继续保存该编号。历史记录中的 0 仅作为兼容处理。

## 确认邮件与员工后台

所有确认邮件统一经过 `send_booking_confirmation`，付款回调、自动重试和员工重发共用同一份模板。

| 字段／状态 | 含义 |
|---|---|
| `confirmation_email_sent_at` | Resend 接收发送请求的时间，不代表收件服务器已接收 |
| `confirmation_email_id` | Resend 邮件编号 |
| `confirmation_email_status` | `queued`、`sending`、`accepted`、`delivered`、`delayed`、`failed`、`bounced` 或 `failed_delivery` |
| `confirmation_email_error` | 最近一次发送／投递错误 |
| `confirmation_email_attempts` | 当前发送版本的尝试次数 |
| `confirmation_email_next_retry_at` | 下一次可重试时间 |
| `confirmation_email_event_at` | 最新投递事件的发生时间，避免乱序事件覆盖新状态 |

发送失败后每轮间隔至少 5 分钟，自动尝试最多 5 次。失败达到 3 次，或收到永久退信／投递失败事件时，向 `marketing@kokoamusement.com.au` 发送处理提醒。永久退信由员工核对邮箱后手动重发。自动重试复用 Resend `Idempotency-Key`，员工的新操作使用新版本，避免网络超时后重复发送。

`ResendConfirmationEmail` 在读取订单前校验 `ADMIN_KEY`。浏览器将 key 放在 POST 请求体；不写入 URL、仓库或页面源代码。仅已实际付款的订单能发送付款确认。

后台新增 **Email follow-up**、**Payment review** 筛选，以及邮件状态、错误和尝试次数。`accepted` 与 `delivered` 分开展示。

`ResendWebhook` 对 Svix 的原文签名和时间戳验签；按最新的 `confirmation_email_id` 匹配订单，旧版本邮件和旧事件不能覆盖新状态。现有 Resend key 是 send-only，投递回调已通过 Resend 后台配置并启用；无需扩大该 key 的权限。邮件在 Resend 接收时显示 `accepted`，只有真实投递事件才更新为 `delivered`。

## 套餐只读取一份数据

`BookingPackageCatalogue` 只返回有效套餐的公开权益字段。团体页面卡片和 PDF 从该接口读取；确认邮件直接读取同一张 `Packages` 表。PDF 无法核实套餐数据时提示重试，不再用另一份硬编码权益导出。

## 密钥与部署

- Stripe signing secret 存在每个门店的 `stripe_location_keys.webhook_secret_live` 私有列，endpoint id 在 `webhook_endpoint_live`。同一个 Stripe 账户的两个 Hornsby 门店共用对应的签名配置。
- 邮件回调 secret 存在私有配置表 `booking_notification_settings`，`service = resend`。不应把该表接到公开 API。
- 新字段清单见 [migrations/20261113_booking_reliability.json](migrations/20261113_booking_reliability.json)。先补字段和内部函数，再切换入口；不能只粘贴入口脚本。
- Stripe 仅替换 KOKO Booking 的 webhook；Cityheroes 及其他系统的 webhook 保持各自配置。
- Xano Metadata API 的 PUT 立即生效。修改前先读取线上版本，修改后回读归档。
- 本轮 GitHub 连接没有仓库写权限，三个前端脚本采用内联部署，代码快照在 `webflow/`。悉尼时间 18:10 完成过一次整站发布，用户随后要求停止发布；后续没有再修改或发布 Webflow。恢复仓库写权限后，再由用户决定是否改回固定 commit hash 的 CDN 引用。
- Apps Script 继续使用原来的每 5 分钟 `RunReminders` 入口，无须安装新触发器。

## 验证记录

`node --test tests/booking-reliability.test.cjs`：15 项本地测试通过，执行的是实际嵌入 Xano 的签名／金额／事件判定代码。

Xano 实测：5 个并发回调中只有 1 次结算、只有 1 张回头客抵扣；不同事件编号也不会重复发放；推荐码一致。旧 Session 过期事件被忽略；当前 Session 过期后购物车可恢复、预留抵扣回到 `available`。合成订单、测试抵扣和临时测试接口已清理。

Stripe 实测：定金链接 A$51.50，付清链接 A$381.50；重复点击复用未过期链接；切换付清前原链接确实变为 `expired`；实际有效期 1859 秒，订单保存的截止时间与 Stripe 相同。未进行扣款，测试链接已关闭、测试订单已清理。

Resend 实测：签名有效的送达事件返回 200 并写入 `delivered`；旧事件和旧邮件编号均不覆盖新状态，未签名请求返回 403。未向客户发送测试邮件。

现有每 5 分钟 `RunReminders` 的最近 6 次执行均返回 200，`error_message` 为 null；新补救函数已经接在该入口鉴权之后。详见 [VALIDATION.json](VALIDATION.json)。
