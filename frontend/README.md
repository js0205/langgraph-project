# 医药智能助手 - 前端

这是医药智能助手的前端应用，使用 React + TypeScript + Vite + Tailwind CSS 构建。

## 技术栈

- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Axios** - HTTP 客户端
- **Zustand** - 状态管理（待集成）

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

应用将在 http://localhost:5173/ 启动

### 构建生产版本

```bash
npm run build
```

## 项目结构

```
frontend/
├── src/
│   ├── components/        # 可复用组件
│   │   ├── chat/         # 聊天相关组件
│   │   └── medicine/     # 药品相关组件
│   ├── services/         # API 服务
│   │   ├── api.ts        # Axios 配置
│   │   └── chatService.ts # 聊天服务
│   ├── hooks/            # 自定义 Hooks
│   ├── types/            # TypeScript 类型定义
│   ├── utils/            # 工具函数
│   ├── App.tsx           # 主应用组件
│   ├── index.css         # 全局样式
│   └── main.tsx          # 应用入口
├── .env.local            # 环境变量
├── tailwind.config.js    # Tailwind 配置
└── package.json          # 项目配置
```

## 功能特性

### 已实现

- ✅ 聊天界面
- ✅ 消息发送和接收
- ✅ 后端健康检查
- ✅ 响应式设计
- ✅ 加载状态显示
- ✅ 示例问题快捷按钮

### 待实现

- ⏳ 药品信息展示卡片
- ⏳ 聊天历史记录保存
- ⏳ 语音输入功能
- ⏳ 图片识别（扫描药品说明书）
- ⏳ 用药提醒功能
- ⏳ 健康档案管理

## 环境变量

在 `.env.local` 中配置：

```bash
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_NAME=医药智能助手
```

## 开发指南

### 添加新组件

```typescript
// src/components/example/ExampleComponent.tsx
import React from 'react';

interface ExampleProps {
  title: string;
}

export const ExampleComponent: React.FC<ExampleProps> = ({ title }) => {
  return (
    <div className="p-4">
      <h2>{title}</h2>
    </div>
  );
};
```

### 调用后端 API

```typescript
import { chatService } from './services/chatService';

// 发送消息
const response = await chatService.sendMessage({
  message: '头疼应该吃什么药？',
  history: []
});

console.log(response.reply);
```

## 注意事项

- 确保后端服务器运行在 `http://localhost:3000`
- 使用 Tailwind CSS 类名进行样式设计
- 遵循 TypeScript 严格模式
- 组件应保持单一职责原则

## 常见问题

### Q: 前端无法连接后端？

A: 检查以下几点：
1. 后端服务是否运行在 `http://localhost:3000`
2. `.env.local` 中的 `VITE_API_BASE_URL` 是否正确
3. CORS 是否正确配置

### Q: Tailwind 样式不生效？

A: 确保：
1. `tailwind.config.js` 中 content 路径正确
2. `index.css` 中包含了 Tailwind 指令
3. 重启开发服务器

## 许可证

MIT License
