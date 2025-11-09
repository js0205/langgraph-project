# 🚀 快速启动指南

## 前端启动

### 首次启动

```bash
# 进入项目目录
cd ~/Desktop/langgraph-project/frontend

# 安装依赖（仅首次需要）
npm install

# 启动开发服务器
npm run dev
```

### 后续启动

```bash
cd ~/Desktop/langgraph-project/frontend
npm run dev
```

前端将在 **http://localhost:5173/** 启动

## 后端启动（待实现）

```bash
cd ~/Desktop/langgraph-project/backend
npm install
npm run dev
```

后端将在 **http://localhost:3000** 启动

## 访问应用

1. 启动前端后，在浏览器访问：http://localhost:5173/
2. 你将看到医药智能助手的聊天界面
3. 右上角会显示后端连接状态

## 当前状态

### ✅ 前端已完成
- 现代化聊天界面
- 消息发送接收
- 响应式设计
- 加载动画

### ⏳ 后端待实现
- Express 服务器
- Gemini API 集成
- LangGraph 工作流

## 注意事项

- 当前前端已经可以独立运行
- 由于后端未实现，发送消息会显示"服务暂时不可用"
- 建议按照 TUTORIAL.md 继续实现后端功能

## 下一步

请参考 [TUTORIAL.md](./TUTORIAL.md) 继续开发后端功能。
