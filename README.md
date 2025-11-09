# 🏥 医药智能助手

一个基于 AI 的医药智能问答系统，提供药品查询、症状诊断、用药建议等功能。

## 📋 项目概述

本项目是一个全栈医药智能助手应用：

- **前端**：React + TypeScript + Vite + Tailwind CSS
- **后端**：Node.js + Express + TypeScript (待实现)
- **AI 框架**：LangChain.js + LangGraph.js (待实现)
- **LLM**：Google Gemini API (待实现)
- **数据源**：极速数据药品 API (待实现)

## 🚀 快速开始

### 前置要求

- Node.js 20+
- npm 或 yarn
- Git

### 安装和运行

#### 1. 克隆项目

```bash
cd ~/Desktop/langgraph-project
```

#### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端将在 http://localhost:5173/ 启动

#### 3. 启动后端（待实现）

```bash
cd backend
npm install
npm run dev
```

后端将在 http://localhost:3000 启动

## 📁 项目结构

```
langgraph-project/
├── frontend/          # React 前端应用
│   ├── src/
│   │   ├── components/    # UI 组件
│   │   ├── services/      # API 服务
│   │   ├── App.tsx        # 主应用
│   │   └── main.tsx       # 入口文件
│   └── package.json
├── backend/           # Express 后端（待创建）
├── shared/            # 共享类型和工具
├── docs/              # 文档
├── app.py             # Python 示例
└── TUTORIAL.md        # 完整开发教程
```

## ✨ 功能特性

### 前端 (已完成)

- ✅ 现代化聊天界面
- ✅ 消息发送和接收
- ✅ 后端连接状态检测
- ✅ 响应式设计
- ✅ 加载动画
- ✅ 示例问题快捷入口
- ✅ Tailwind CSS 样式

### 待实现功能

#### 前端
- ⏳ 药品信息展示卡片
- ⏳ 聊天历史记录
- ⏳ 语音输入
- ⏳ 图片识别（药品说明书扫描）
- ⏳ 用药提醒
- ⏳ 健康档案管理

#### 后端
- ⏳ Express 服务器搭建
- ⏳ Gemini API 集成
- ⏳ LangGraph 工作流
- ⏳ 药品 API 集成
- ⏳ 用户认证
- ⏳ 数据持久化

## 🛠️ 技术栈

### 前端
- **React 19** - UI 库
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Axios** - HTTP 客户端

### 后端（待实现）
- **Node.js** - 运行时
- **Express** - Web 框架
- **TypeScript** - 类型安全
- **LangChain.js** - AI 框架
- **LangGraph.js** - 工作流引擎

### AI 和数据
- **Google Gemini** - 大语言模型
- **极速数据 API** - 药品信息数据源

## 📖 开发教程

详细的开发教程请查看 [TUTORIAL.md](./TUTORIAL.md)，包含：

1. 项目初始化
2. 前端搭建
3. 后端搭建
4. Gemini API 集成
5. LangGraph 工作流
6. 药品 API 集成
7. 部署指南

## 🎯 当前状态

### ✅ 已完成

- [x] 项目目录结构
- [x] 前端框架搭建
- [x] Tailwind CSS 配置
- [x] 聊天界面 UI
- [x] API 服务层
- [x] 开发文档

### 🚧 进行中

- [ ] 后端服务器搭建
- [ ] API 路由设计
- [ ] Gemini 集成

### 📅 计划中

- [ ] LangGraph 工作流
- [ ] 药品数据库
- [ ] 用户系统
- [ ] 部署上线

## 📸 截图

目前前端界面包含：
- 顶部导航栏（显示连接状态）
- 聊天消息区域
- 输入框和发送按钮
- 示例问题快捷按钮
- 友好的欢迎界面

## 🤝 贡献指南

欢迎贡献！请遵循以下步骤：

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 待办事项

- [ ] 完成后端基础框架
- [ ] 集成 Gemini API
- [ ] 实现 LangGraph 工作流
- [ ] 添加药品数据查询
- [ ] 优化 UI/UX
- [ ] 添加单元测试
- [ ] 编写 API 文档
- [ ] 部署到生产环境

## ⚠️ 免责声明

本应用提供的医药信息仅供参考，不能替代专业医生的诊断和建议。使用药物前请务必咨询专业医生或药师。

## 📄 许可证

MIT License

---

**开发中** 🚀 欢迎提出建议和问题！
