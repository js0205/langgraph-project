# Render 部署指南

## 📋 概述

本指南帮助您将多智能体医疗咨询系统部署到 Render 平台，完全免费且支持无限团队成员协作。

## ✅ 部署优势

| 特性 | Render | Vercel |
|------|--------|--------|
| **团队成员** | ✅ 无限制 | ❌ 仅 2 人 |
| 免费额度 | 750 小时/月 | 100GB 带宽 |
| 私有仓库 | ✅ 支持 | ✅ 支持 |
| 自动部署 | ✅ 支持 | ✅ 支持 |
| 环境变量 | ✅ 加密存储 | ✅ 加密存储 |
| 构建日志 | ✅ 所有成员可见 | ❌ 仅 2 人可见 |

---

## 🚀 快速部署步骤

### 第一步：准备代码

1. **提交配置文件到 Git**

```bash
# 在项目根目录
git add render.yaml
git commit -m "feat: 添加 Render 部署配置"
git push origin master
```

2. **确认文件已推送**

```bash
git status
```

---

### 第二步：在 Render 创建服务

#### 方式 A：使用 Blueprint（推荐，一键部署前后端）

1. 访问 Render 控制台
   - 网址：https://dashboard.render.com
   - 如果没有账号，使用 GitHub 账号登录

2. 创建 Blueprint
   - 点击右上角 **"New +"**
   - 选择 **"Blueprint"**
   - 点击 **"Connect a repository"**
   - 选择 `js0205/langgraph-project` 仓库
   - 点击 **"Connect"**

3. Render 会自动读取 `render.yaml`
   - 显示 2 个服务：
     - `medical-backend` (Web Service)
     - `medical-frontend` (Static Site)
   - 点击 **"Apply"**

4. 等待部署完成
   - 后端部署时间：约 2-3 分钟
   - 前端部署时间：约 1-2 分钟
   - 可以实时查看构建日志

---

#### 方式 B：手动创建服务

如果不想使用 Blueprint，可以分别创建前后端服务：

**创建后端服务：**

1. 点击 **"New +"** → **"Web Service"**
2. 连接 GitHub 仓库：`js0205/langgraph-project`
3. 配置：
   - **Name**: `medical-backend`
   - **Region**: `Singapore`
   - **Branch**: `master`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

4. 添加环境变量：
   - `GEMINI_API_KEY`: (您的 Gemini API Key)
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `ALLOWED_ORIGINS`: `*`

5. 点击 **"Create Web Service"**

**创建前端服务：**

1. 点击 **"New +"** → **"Static Site"**
2. 连接同一个 GitHub 仓库
3. 配置：
   - **Name**: `medical-frontend`
   - **Region**: `Singapore`
   - **Branch**: `master`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Plan**: `Free`

4. 添加环境变量：
   - `VITE_API_URL`: `https://medical-backend.onrender.com`
     (替换为您的后端实际 URL)

5. 点击 **"Create Static Site"**

---

### 第三步：配置自定义域名（可选）

1. 在后端服务页面
   - 点击 **"Settings"**
   - 找到 **"Custom Domains"**
   - 添加自定义域名（如果有）

2. 在前端服务页面
   - 同样可以添加自定义域名

---

### 第四步：更新前端 API 地址

1. **获取后端 URL**
   - 部署完成后，后端服务会有一个 URL，例如：
     `https://medical-backend.onrender.com`

2. **更新前端环境变量**
   - 进入前端服务 **"Environment"** 页面
   - 更新 `VITE_API_URL` 为后端实际 URL
   - 保存后会自动重新部署

---

### 第五步：验证部署

1. **访问前端 URL**
   - 例如：`https://medical-frontend.onrender.com`

2. **测试聊天功能**
   - 输入测试问题：
     - "我最近头痛发热，该怎么办？"
     - "阿莫西林的用法用量是什么？"

3. **检查后端连接**
   - 前端界面应该显示"后端已连接"

---

## 🔒 安全配置

### 环境变量保护

**重要提示：** 永远不要将敏感信息提交到 Git！

在 `render.yaml` 中，`sync: false` 表示该环境变量需要在 Render 控制台手动设置：

```yaml
envVars:
  - key: GEMINI_API_KEY
    sync: false  # 不从 Git 同步，需手动输入
```

**设置步骤：**

1. 进入服务 **"Environment"** 页面
2. 找到 `GEMINI_API_KEY`
3. 点击 **"Edit"**，输入您的 API Key
4. 保存后会自动重新部署

---

## 👥 团队协作

### 添加团队成员

1. 进入 Render 控制台
2. 点击左上角团队名称
3. 选择 **"Team Settings"**
4. 点击 **"Invite Member"**
5. 输入成员邮箱，发送邀请

### 团队成员权限

所有团队成员可以：
- ✅ 查看所有服务
- ✅ 查看部署日志
- ✅ 查看环境变量（但不能查看值）
- ✅ 触发手动部署
- ✅ 查看服务状态和指标

---

## 🔧 常见问题

### 1. 后端服务休眠

**问题：** Render 免费套餐 15 分钟无活动后会休眠，首次访问需要 30-60 秒冷启动。

**解决方案 A：使用免费唤醒服务**

使用 [UptimeRobot](https://uptimerobot.com/) 定期访问后端：

1. 注册 UptimeRobot 账号
2. 添加新监控：
   - **Monitor Type**: HTTP(s)
   - **URL**: `https://medical-backend.onrender.com/api/health`
   - **Monitoring Interval**: 5 分钟
3. 这样后端会保持唤醒状态

**解决方案 B：升级到付费套餐**

- $7/月可以避免休眠
- 更高的资源配额

---

### 2. 构建失败

**检查步骤：**

1. 查看构建日志
   - 进入服务页面
   - 点击 **"Events"** 或 **"Logs"**
   - 查看错误信息

2. 常见错误：
   - **依赖安装失败**：检查 `package.json`
   - **TypeScript 编译错误**：本地先运行 `npm run build` 测试
   - **环境变量缺失**：检查 `render.yaml` 和控制台配置

---

### 3. 前端 API 请求失败

**检查清单：**

1. 确认后端已成功部署
2. 检查前端环境变量 `VITE_API_URL`
3. 检查后端 `ALLOWED_ORIGINS` 是否包含前端域名
4. 查看浏览器控制台的 CORS 错误

**修复 CORS 问题：**

在后端环境变量中设置：
```
ALLOWED_ORIGINS=https://medical-frontend.onrender.com
```

或允许所有来源（开发阶段）：
```
ALLOWED_ORIGINS=*
```

---

### 4. 环境变量不生效

**原因：** 修改环境变量后需要重新部署。

**解决：**
1. 修改环境变量后，Render 会提示 **"Redeploy"**
2. 点击 **"Manual Deploy"** → **"Deploy latest commit"**
3. 或者推送一个新的 commit 触发自动部署

---

## 📊 监控和日志

### 查看实时日志

1. 进入服务页面
2. 点击 **"Logs"** 标签
3. 实时查看应用日志

### 查看部署历史

1. 点击 **"Events"** 标签
2. 查看所有部署记录
3. 可以回滚到之前的部署

### 资源使用情况

1. 点击 **"Metrics"** 标签
2. 查看：
   - CPU 使用率
   - 内存使用
   - 请求数量
   - 响应时间

---

## 🔄 自动部署

### Git 推送自动部署

**默认行为：**
- 推送到 `master` 分支 → 自动部署
- 推送到其他分支 → 不部署

**修改自动部署分支：**
1. 进入服务 **"Settings"**
2. 找到 **"Branch"**
3. 选择要自动部署的分支

### 禁用自动部署

1. 进入服务 **"Settings"**
2. 找到 **"Auto-Deploy"**
3. 关闭开关

---

## 💰 费用说明

### 免费套餐额度

**每个账号：**
- ✅ 750 小时/月免费运行时间
- ✅ 100GB 出站带宽
- ✅ 400 小时/月构建时间
- ✅ 无限团队成员
- ✅ 无限服务数量

**限制：**
- ⚠️ 15 分钟无活动休眠
- ⚠️ 512MB RAM
- ⚠️ 0.1 CPU

### 何时需要升级

- 需要避免休眠
- 需要更多资源（内存、CPU）
- 需要更快的构建速度
- 流量超过免费额度

---

## 🎯 下一步

部署完成后，您可以：

1. **添加自定义域名**
   - 让应用更专业

2. **配置数据库**
   - Render 支持 PostgreSQL
   - 可以添加用户认证、聊天历史等功能

3. **添加监控**
   - 集成 Sentry 进行错误追踪
   - 使用 Analytics 跟踪用户行为

4. **性能优化**
   - 添加 CDN
   - 启用缓存
   - 优化构建大小

---

## 📞 获取帮助

- **Render 官方文档**: https://render.com/docs
- **Render 社区**: https://community.render.com
- **项目 Issues**: https://github.com/js0205/langgraph-project/issues

---

## 📝 总结

Render 相比 Vercel 的主要优势：

✅ **无团队成员限制** - 所有团队成员都能访问项目
✅ **完全免费** - 对于开发和演示项目完全够用
✅ **配置简单** - 一个 `render.yaml` 搞定
✅ **支持全栈** - 前端静态网站 + 后端 Node.js 服务

唯一的缺点是免费套餐会休眠，但可以通过 UptimeRobot 等服务解决。

---

**祝您部署顺利！** 🎉
