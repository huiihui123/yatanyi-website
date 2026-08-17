# Cloudflare 接入步骤说明（CDN + HTTP/2/3 + 边缘缓存）

> 适用环境：本网站当前部署在 PythonAnywhere（wsgi.py 引用 app_pa.py），
> 服务器只支持 HTTP/1.1。接入 Cloudflare 免费版可自动获得：
> 全球 CDN 边缘缓存、HTTP/2/3 多路复用（无限并发）、免费 HTTPS、防攻击。
>
> ⚠️ 重要提醒（先看完再决定）：
> 1. **国内访问可能变慢**：Cloudflare 免费版没有中国大陆节点，国内用户访问
>    会先绕到海外节点。如果网站主要客户在本地/国内，接入后**可能反而更慢**，
>    加速效果主要针对海外用户。请先想清楚主要访客在哪。
> 2. **需要自有域名**：Cloudflare 免费版不能接管 pythonanywhere.com 子域名，
>    必须有自己的域名（如阿里云/腾讯云购买的 xxx.com）。
> 3. **PythonAnywhere 需付费版**：免费版不能绑定自定义域名，至少需升级到
>    付费方案（Hacker，约 $5/月）。
> 4. 代码层无需任何改动：本项目的 Flask 已设置好 Cache-Control 响应头，
>    Cloudflare 默认会遵守源站头，接入后缓存策略自动生效。

---

## 一、前置条件确认

- [ ] 已有自己的域名（阿里云/腾讯云注册的，如 myfurniture.com）
- [ ] PythonAnywhere 账号已升级到付费版（Hacker 及以上）
- [ ] PythonAnywhere 上的 Web app 已正常运行（当前用 wsgi.py + app_pa.py）

> 如果还没有域名：去阿里云（万网）或腾讯云搜索购买，.com 约 60-80 元/年，
> 购买后在阿里云控制台完成实名认证（个人即可）。

---

## 二、接入步骤（约 30 分钟，含 DNS 等待）

### 第 1 步：注册 Cloudflare 账号
1. 打开 https://dash.cloudflare.com/sign-up 注册（邮箱即可，免费）
2. 登录后点击「Add a site（添加站点）」

### 第 2 步：添加你的域名
1. 输入你的域名（如 myfurniture.com），点击「Add site」
2. 套餐选择 **Free（免费）**，点击「Continue」
3. Cloudflare 会自动扫描你域名的现有 DNS 记录（如 A 记录指向 PythonAnywhere）
4. 点击「Continue」，Cloudflare 会给你 **两个 NS 地址**，例如：
   - `ada.ns.cloudflare.com`
   - `ben.ns.cloudflare.com`
   **记下这两个地址，下一步要用**

### 第 3 步：去域名注册商修改 DNS（最关键的一步）
以阿里云为例（其他注册商类似）：
1. 登录阿里云控制台 → 域名 → 域名列表 → 找到你的域名 → 管理
2. 左侧「DNS修改」→ 修改 DNS 服务器
3. 把原来阿里云的 DNS（如 `hichina.com` 的 2 个）**替换为** Cloudflare 给的两个 NS 地址
4. 保存。NS 生效需要 **几分钟到 48 小时**（通常 10-30 分钟）
5. 回到 Cloudflare 页面点击「Done, check nameservers」
6. 当 Cloudflare 控制台显示域名状态为 **Active（已激活）** 时继续下一步
   （期间会收到 Cloudflare 的邮件提醒，无需理会）

### 第 4 步：在 Cloudflare 添加 DNS 记录（先不开代理）
1. Cloudflare 控制台 → 你的域名 → DNS → Records
2. 添加记录（如果扫描时已自动生成 A 记录，直接编辑它）：
   - 类型：**CNAME**（推荐）或 A
   - 名称：`@`（根域名）——如需 www 可再加一条名称 `www`
   - 目标：`你的PythonAnywhere用户名.pythonanywhere.com`
     （或 PythonAnywhere 提供的服务器 IP，两者选一）
   - **代理状态：先保持灰色云朵（仅 DNS，不代理）**——方便下一步验证
3. 保存

### 第 5 步：在 PythonAnywhere 绑定自定义域名
1. 登录 PythonAnywhere → Web 标签页
2. 找到你的 Web app → 「Add a new domain」（或进入 Web 配置页点域名管理）
3. 输入你的域名，按页面提示操作：
   - 通常要求你在域名 DNS 中添加一条记录（CNAME 指向 `你的用户名.pythonanywhere.com`）
   - 我们已经在上一步添加过（灰色云朵），直接点验证
4. 验证通过后，PythonAnywhere 会为你的域名签发 HTTPS 证书
   （**必须等证书签发完成**，通常几分钟）
5. 确认访问 `https://你的域名` 能正常打开网站（此时已可访问）

### 第 6 步：开启 Cloudflare 代理（橙色云朵）
1. 回到 Cloudflare → DNS → Records
2. 把刚才那条记录的灰色云朵 **点成橙色云朵**（开启代理）
3. 稍等 1-2 分钟，访问 `https://你的域名` 确认正常
4. 成功标志：浏览器地址栏显示 Cloudflare 的 HTTPS 证书
   （证书颁发机构显示为 Cloudflare 或 Let's Encrypt）

### 第 7 步：配置 SSL 模式（避免重定向循环）
1. Cloudflare → 你的域名 → SSL/TLS → Overview
2. 加密模式选择 **Full**（如果页面正常）或 **Full (strict)**
3. 如果出现「重定向循环」错误：
   - 先改为 **Flexible** 试试（不推荐长期用）
   - 或检查 PythonAnywhere 上是否强制 HTTPS 跳转，两边设置要一致
4. 建议开启「Always Use HTTPS」（SSL/TLS → Edge Certificates → Always Use HTTPS）

### 第 8 步：缓存配置（可选优化，本项目已自动生效）
本项目 Flask 已返回正确的 Cache-Control 头，Cloudflare 默认遵守源站头，
**不配置也能正确工作**。可选增强：
1. Caching → Configuration → Cache Level：保持 Standard（默认）
2. Caching → Configuration → **Always Online**：开启（源站临时故障时用缓存兜底）
3. 如需给图片单独设置边缘缓存时长：
   - Caching → Cache Rules → Create rule
   - 条件：URI Path 包含 `/images/` 或 `/uploads/`
   - 动作：Edge Cache TTL 设为 1 个月
   - （注意：源站响应头已带 max-age=30 天 + SWR，Cloudflare 会先遵守源站头，
     此规则仅在你想覆盖时长时使用）

### 第 9 步：验证接入成功
在本机命令行执行（把域名换成你的）：
```bash
# 看响应头是否走 Cloudflare
curl -I https://你的域名/index.html
# 应看到：server: cloudflare
curl -I https://你的域名/images/ytyjs.jpg
# 应看到：cf-cache-status: HIT（或第一次是 MISS，再刷一次变 HIT）
# 且 Cache-Control 仍是源站设置的：public, max-age=2592000, stale-while-revalidate=86400
```
浏览器打开 https://你的域名，按 F12 → Network 面板：
- 资源响应头里出现 `cf-cache-status: HIT` = 边缘缓存生效
- 出现 `http/2` 或 `http/3`（Protocol 列）= 多路复用生效

---

## 三、常见问题排查

| 现象 | 原因与解决 |
|---|---|
| 域名一直显示 Pending 不激活 | NS 还没生效，等待或检查注册商处是否填错 |
| 网站打不开 / 502 | PythonAnywhere 域名绑定未完成，或证书未签发；先关代理（灰色云朵）检查 |
| 重定向循环 | SSL 模式设置不对，按第 7 步调整 |
| 国内访问慢 | Cloudflare 免费版无国内节点，属正常；可考虑阿里云 CDN（需域名备案） |
| 想回退 | 把 Cloudflare DNS 记录改回灰色云朵，或在注册商改回原 NS |

---

## 四、接入后你会得到什么

- 静态资源（CSS/JS/图片）由 Cloudflare 全球节点就近分发 → 海外用户加速
- HTTP/2/3 多路复用 → 浏览器并发下载不再受 6 连接限制（当前 waitress 的 HTTP/1.1 限制被绕过）
- 免费的 HTTPS + DDoS 防护
- 源站仍保留现有分级缓存策略（长缓存 + SWR + 协商缓存），两层叠加

## 五、什么时候不需要接 Cloudflare

- 主要客户都在国内本地 → 免费版可能反而更慢（建议直接不加，或评估阿里云 CDN）
- 访问量很小、页面已足够快 → 收益有限，可不折腾
- 不想升级 PythonAnywhere 付费版 → 无法绑自定义域名，接不了
