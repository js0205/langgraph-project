# 医药智能助手 - 完整开发教程

## 📚 目录

- [项目概述](#项目概述)
- [前置准备](#前置准备)
- [第一步：创建项目结构](#第一步创建项目结构)
- [第二步：搭建后端（Express + LangChain.js）](#第二步搭建后端)
- [第三步：搭建前端（React + Vite）](#第三步搭建前端)
- [第四步：集成 Gemini API](#第四步集成-gemini-api)
- [第五步：实现 LangGraph 工作流](#第五步实现-langgraph-工作流)
- [第六步：集成药品 API](#第六步集成药品-api)
- [第七步：优化和部署](#第七步优化和部署)
- [常见问题](#常见问题)

---

## 项目概述

我们将构建一个全栈医药智能问答系统：

- **前端**：React + TypeScript + Vite + Tailwind CSS
- **后端**：Node.js + Express + TypeScript
- **AI 框架**：LangChain.js + LangGraph.js
- **LLM**：Google Gemini API（免费）
- **数据源**：极速数据药品 API（免费 100 次/天）

---

## 前置准备

### 1. 安装必需软件

确保你已经安装：

- **Node.js 20+** （运行 `node -v` 检查）
- **npm 或 yarn**
- **Git**
- **代码编辑器**（推荐 VS Code）

### 2. 获取 API Keys

#### 2.1 获取 Google Gemini API Key（免费）

1. 访问 [Google AI Studio](https://makersuite.google.com/app/apikey)
2. 登录你的 Google 账号
3. 点击 "Create API Key"
4. 复制并保存你的 API Key

**免费额度：**
- 每天 100 次请求
- 每分钟 5 次请求
- 每分钟 25 万 tokens

#### 2.2 获取极速数据 API Key（可选，免费）

1. 访问 [极速数据](https://www.jisuapi.com/)
2. 注册账号
3. 进入控制台，找到"药品信息 API"
4. 获取 API Key

**免费额度：**
- 每天 100 次调用

---

## 第一步：创建项目结构

### 1.1 创建项目根目录

```bash
cd ~/Desktop/langgraph-project
```

### 1.2 创建目录结构

```bash
# 创建前端目录
mkdir frontend

# 创建后端目录
mkdir backend

# 创建共享类型目录
mkdir shared
mkdir shared/types

# 创建文档目录
mkdir -p docs
```

最终结构：
```
langgraph-project/
├── frontend/          # React 前端
├── backend/           # Express 后端
├── shared/            # 共享代码
├── docs/              # 文档
├── app.py             # 原 Python 示例（保留）
└── README.md
```

---

## 第二步：搭建后端

### 2.1 初始化后端项目

```bash
cd backend
npm init -y
```

### 2.2 安装后端依赖

```bash
# 核心依赖
npm install express cors dotenv

# LangChain 生态
npm install langchain @langchain/core @langchain/google-genai @langchain/community langgraph

# 工具库
npm install axios zod winston

# TypeScript 相关
npm install -D typescript @types/node @types/express @types/cors tsx nodemon

# 初始化 TypeScript
npx tsc --init
```

### 2.3 配置 TypeScript (tsconfig.json)

创建或修改 `backend/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 2.4 配置 package.json scripts

修改 `backend/package.json`，添加：

```json
{
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

### 2.5 创建后端目录结构

```bash
cd backend
mkdir -p src/{routes,services,langgraph,models,data,utils,config}
```

### 2.6 创建环境变量文件

创建 `backend/.env`：

```bash
# 服务器配置
PORT=3000
NODE_ENV=development

# Google Gemini API
GOOGLE_API_KEY=你的_Gemini_API_Key

# 极速数据 API（可选）
JISU_API_KEY=你的_极速数据_API_Key
JISU_API_URL=https://api.jisuapi.com/medicine

# CORS
ALLOWED_ORIGINS=http://localhost:5173
```

**⚠️ 重要：** 将 `你的_Gemini_API_Key` 替换为你实际的 API Key

### 2.7 创建 .gitignore

创建 `backend/.gitignore`：

```
node_modules/
dist/
.env
*.log
```

### 2.8 创建服务器入口文件

创建 `backend/src/index.ts`：

```typescript
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || 'http://localhost:5173'
}));
app.use(express.json());

// 健康检查路由
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
});
```

### 2.9 测试后端服务器

```bash
# 在 backend 目录下
npm run dev
```

应该看到：
```
🚀 服务器运行在 http://localhost:3000
📊 健康检查: http://localhost:3000/api/health
```

在浏览器访问 `http://localhost:3000/api/health`，应该看到 JSON 响应。

**✅ 第二步完成！后端基础框架搭建成功。**

---

## 第三步：搭建前端

### 3.1 使用 Vite 创建 React 项目

```bash
cd ~/Desktop/langgraph-project/frontend
npm create vite@latest . -- --template react-ts
```

如果提示目录不为空，选择继续。

### 3.2 安装前端依赖

```bash
# 安装依赖
npm install

# 安装额外的库
npm install axios zustand lucide-react clsx

# 安装 Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 3.3 配置 Tailwind CSS

修改 `frontend/tailwind.config.js`：

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

修改 `frontend/src/index.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 3.4 创建前端目录结构

```bash
cd src
mkdir -p components/chat components/medicine services types hooks utils
```

### 3.5 创建环境变量文件

创建 `frontend/.env.local`：

```bash
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_NAME=医药智能助手
```

### 3.6 创建 API 服务文件

创建 `frontend/src/services/api.ts`：

```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    console.log('📤 发送请求:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    console.log('📥 收到响应:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('❌ 请求失败:', error.message);
    return Promise.reject(error);
  }
);
```

创建 `frontend/src/services/chatService.ts`：

```typescript
import { apiClient } from './api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  medicines?: any[];
  disclaimer?: string;
}

export const chatService = {
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const response = await apiClient.post<ChatResponse>('/chat', request);
    return response.data;
  },

  async checkHealth(): Promise<any> {
    const response = await apiClient.get('/health');
    return response.data;
  },
};
```

### 3.7 创建简单的测试页面

修改 `frontend/src/App.tsx`：

```typescript
import { useState, useEffect } from 'react';
import { chatService } from './services/chatService';
import './index.css';

function App() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 测试后端连接
    chatService.checkHealth()
      .then(data => {
        setHealth(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('无法连接后端:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          🏥 医药智能助手
        </h1>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            后端连接状态
          </h2>
          {loading ? (
            <p className="text-gray-500">正在检查...</p>
          ) : health ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-700">✅ 连接成功</p>
              <p className="text-sm text-gray-600 mt-2">
                状态: {health.status}
              </p>
              <p className="text-sm text-gray-600">
                版本: {health.version}
              </p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700">❌ 连接失败</p>
              <p className="text-sm text-gray-600 mt-2">
                请确保后端服务器正在运行
              </p>
            </div>
          )}
        </div>

        <div className="text-sm text-gray-500 space-y-1">
          <p>• 前端: React + Vite + TypeScript</p>
          <p>• 后端: Express + LangChain.js</p>
          <p>• AI: Google Gemini API</p>
        </div>
      </div>
    </div>
  );
}

export default App;
```

### 3.8 测试前端

```bash
# 在 frontend 目录下
npm run dev
```

应该看到：
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

在浏览器访问 `http://localhost:5173/`，应该看到一个漂亮的测试页面，显示"连接成功"。

**✅ 第三步完成！前端基础框架搭建成功，并成功连接后端。**

---

## 第四步：集成 Gemini API

### 4.1 创建 LLM 服务

创建 `backend/src/services/llmService.ts`：

```typescript
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// 创建 Gemini 模型实例
export const createGeminiModel = () => {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY 未设置，请检查 .env 文件');
  }

  return new ChatGoogleGenerativeAI({
    modelName: "gemini-2.0-flash-exp",
    apiKey: apiKey,
    temperature: 0.7, // 控制创造性（0-1）
    maxOutputTokens: 1024,
  });
};

// 简单的聊天函数
export const chatWithGemini = async (message: string) => {
  try {
    const model = createGeminiModel();

    const response = await model.invoke([
      new HumanMessage(message)
    ]);

    return response.content;
  } catch (error) {
    console.error('Gemini API 调用失败:', error);
    throw error;
  }
};
```

### 4.2 创建聊天路由

创建 `backend/src/routes/chat.ts`：

```typescript
import { Router, Request, Response } from 'express';
import { chatWithGemini } from '../services/llmService';

const router = Router();

interface ChatRequest {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { message } = req.body as ChatRequest;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: '消息不能为空' });
    }

    console.log('📨 收到消息:', message);

    // 调用 Gemini
    const reply = await chatWithGemini(message);

    console.log('✅ Gemini 回复:', reply);

    res.json({
      reply,
      disclaimer: '⚠️ 以上建议仅供参考，请咨询专业医生'
    });

  } catch (error: any) {
    console.error('❌ 聊天路由错误:', error);
    res.status(500).json({
      error: '服务器错误',
      message: error.message
    });
  }
});

export default router;
```

### 4.3 在主服务器中注册路由

修改 `backend/src/index.ts`，添加聊天路由：

```typescript
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRouter from './routes/chat'; // 新增

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || 'http://localhost:5173'
}));
app.use(express.json());

// 路由
app.use('/api/chat', chatRouter); // 新增

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`💬 聊天接口: http://localhost:${PORT}/api/chat`);
});
```

### 4.4 测试 Gemini API

重启后端服务器：

```bash
# 在 backend 目录下
npm run dev
```

使用 curl 或 Postman 测试：

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}'
```

应该收到 Gemini 的回复！

**✅ 第四步完成！成功集成 Gemini API。**

---

## 第五步：实现 LangGraph 工作流

### 5.1 创建状态定义

创建 `backend/src/langgraph/state.ts`：

```typescript
// 工作流状态接口
export interface WorkflowState {
  // 用户输入
  userMessage: string;

  // 意图识别结果
  intent: 'medicine_query' | 'symptom_analysis' | 'safety_check' | 'general';

  // 检索到的药品信息
  medicines: any[];

  // 最终回复
  response: string;

  // 错误信息
  error?: string;
}

// 初始状态
export const createInitialState = (message: string): WorkflowState => ({
  userMessage: message,
  intent: 'general',
  medicines: [],
  response: '',
});
```

### 5.2 创建 Prompt 模板

创建 `backend/src/langgraph/prompts.ts`：

```typescript
export const INTENT_RECOGNITION_PROMPT = `你是一个医药智能助手。分析用户的问题，判断其意图。

用户问题: {message}

请判断用户意图，只返回以下之一：
- medicine_query: 查询具体药品信息
- symptom_analysis: 描述症状，想知道吃什么药
- safety_check: 咨询用药安全、副作用等
- general: 一般性咨询

意图:`;

export const MEDICAL_RESPONSE_PROMPT = `你是一位专业的医药助手，请回答用户的问题。

用户问题: {message}

回答要求：
1. 专业、准确、易懂
2. 如果涉及用药建议，必须强调"仅供参考，请咨询专业医生"
3. 紧急情况必须建议立即就医
4. 不推荐处方药
5. 使用简洁的中文

回答:`;
```

### 5.3 创建节点函数

创建 `backend/src/langgraph/nodes.ts`：

```typescript
import { WorkflowState } from './state';
import { chatWithGemini } from '../services/llmService';
import { MEDICAL_RESPONSE_PROMPT } from './prompts';

// 节点1: 意图识别
export async function recognizeIntent(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log('🔍 [节点] 意图识别...');

  // 简单的关键词识别（实际项目可以用 LLM）
  const message = state.userMessage.toLowerCase();

  let intent: WorkflowState['intent'] = 'general';

  if (message.includes('药') || message.includes('吃什么')) {
    intent = 'medicine_query';
  } else if (message.includes('症状') || message.includes('疼') || message.includes('痛')) {
    intent = 'symptom_analysis';
  } else if (message.includes('安全') || message.includes('副作用')) {
    intent = 'safety_check';
  }

  console.log(`✅ 识别意图: ${intent}`);

  return { intent };
}

// 节点2: 检索药品信息（暂时模拟）
export async function retrieveMedicines(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log('🔍 [节点] 检索药品信息...');

  // TODO: 这里将来会调用药品 API
  const medicines: any[] = [];

  return { medicines };
}

// 节点3: 生成回复
export async function generateResponse(state: WorkflowState): Promise<Partial<WorkflowState>> {
  console.log('💬 [节点] 生成回复...');

  try {
    const prompt = MEDICAL_RESPONSE_PROMPT.replace('{message}', state.userMessage);
    const response = await chatWithGemini(prompt);

    console.log('✅ 回复生成成功');

    return { response: response as string };
  } catch (error: any) {
    console.error('❌ 生成回复失败:', error);
    return {
      response: '抱歉，我现在无法回答。请稍后再试。',
      error: error.message
    };
  }
}
```

### 5.4 创建工作流

创建 `backend/src/langgraph/workflow.ts`：

```typescript
import { StateGraph, END } from "@langchain/langgraph";
import { WorkflowState } from './state';
import { recognizeIntent, retrieveMedicines, generateResponse } from './nodes';

// 创建状态图
export const createMedicalWorkflow = () => {
  const workflow = new StateGraph<WorkflowState>({
    channels: {
      userMessage: null,
      intent: null,
      medicines: null,
      response: null,
      error: null,
    }
  });

  // 添加节点
  workflow.addNode("recognize_intent", recognizeIntent);
  workflow.addNode("retrieve_medicines", retrieveMedicines);
  workflow.addNode("generate_response", generateResponse);

  // 设置入口点
  workflow.setEntryPoint("recognize_intent");

  // 添加边
  workflow.addEdge("recognize_intent", "retrieve_medicines");
  workflow.addEdge("retrieve_medicines", "generate_response");
  workflow.addEdge("generate_response", END);

  // 编译工作流
  return workflow.compile();
};

// 导出编译后的工作流
export const medicalWorkflow = createMedicalWorkflow();
```

### 5.5 更新聊天路由使用工作流

修改 `backend/src/routes/chat.ts`：

```typescript
import { Router, Request, Response } from 'express';
import { medicalWorkflow } from '../langgraph/workflow';
import { createInitialState } from '../langgraph/state';

const router = Router();

interface ChatRequest {
  message: string;
  history?: Array<{ role: string; content: string }>;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { message } = req.body as ChatRequest;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: '消息不能为空' });
    }

    console.log('📨 收到消息:', message);
    console.log('🔄 启动 LangGraph 工作流...');

    // 创建初始状态
    const initialState = createInitialState(message);

    // 调用工作流
    const result = await medicalWorkflow.invoke(initialState);

    console.log('✅ 工作流完成');

    res.json({
      reply: result.response,
      intent: result.intent,
      medicines: result.medicines,
      disclaimer: '⚠️ 以上建议仅供参考，请咨询专业医生'
    });

  } catch (error: any) {
    console.error('❌ 聊天路由错误:', error);
    res.status(500).json({
      error: '服务器错误',
      message: error.message
    });
  }
});

export default router;
```

### 5.6 测试工作流

重启后端并测试：

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "头疼应该吃什么药？"}'
```

你应该在控制台看到工作流的执行过程！

**✅ 第五步完成！LangGraph 工作流实现成功。**

---

## 第六步：集成药品 API

### 6.1 创建药品 API 服务

创建 `backend/src/services/medicineAPI.ts`：

```typescript
import axios from 'axios';

const JISU_API_URL = process.env.JISU_API_URL || 'https://api.jisuapi.com/medicine';
const JISU_API_KEY = process.env.JISU_API_KEY;

export interface MedicineInfo {
  name: string;
  manufacturer?: string;
  specification?: string;
  usage?: string;
  indications?: string;
  warnings?: string[];
}

export const searchMedicine = async (name: string): Promise<MedicineInfo | null> => {
  if (!JISU_API_KEY) {
    console.warn('⚠️ 极速数据 API Key 未设置，返回模拟数据');
    return getMockMedicine(name);
  }

  try {
    const response = await axios.get(`${JISU_API_URL}/detail`, {
      params: {
        appkey: JISU_API_KEY,
        name: name
      }
    });

    if (response.data.status === '0' && response.data.result) {
      return response.data.result;
    }

    return null;
  } catch (error) {
    console.error('药品 API 调用失败:', error);
    return getMockMedicine(name);
  }
};

// 模拟数据（用于测试）
const getMockMedicine = (name: string): MedicineInfo => {
  const mockData: Record<string, MedicineInfo> = {
    '布洛芬': {
      name: '布洛芬缓释胶囊',
      manufacturer: '某某制药有限公司',
      specification: '0.3g*20粒',
      usage: '口服，一次0.3g，一日2次（早晚各一次）',
      indications: '用于缓解轻至中度疼痛如头痛、关节痛、偏头痛、牙痛、肌肉痛、神经痛、痛经',
      warnings: ['孕妇及哺乳期妇女慎用', '对本品过敏者禁用', '胃溃疡患者慎用']
    },
    '感冒灵': {
      name: '感冒灵颗粒',
      manufacturer: '某某制药有限公司',
      specification: '10g*9袋',
      usage: '开水冲服，一次10g，一日3次',
      indications: '解热镇痛。用于感冒引起的头痛、发热、鼻塞、流涕、咽痛等',
      warnings: ['孕妇慎用', '服药期间不得驾驶车辆']
    }
  };

  return mockData[name] || {
    name: name,
    manufacturer: '未知',
    specification: '请咨询药师',
    usage: '请遵医嘱或咨询药师',
    indications: '暂无详细信息',
    warnings: ['请咨询专业医生或药师']
  };
};
```

### 6.2 创建药品路由

创建 `backend/src/routes/medicine.ts`：

```typescript
import { Router, Request, Response } from 'express';
import { searchMedicine } from '../services/medicineAPI';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.query;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: '请提供药品名称' });
    }

    console.log('🔍 查询药品:', name);

    const medicine = await searchMedicine(name);

    if (!medicine) {
      return res.status(404).json({ error: '未找到该药品信息' });
    }

    res.json(medicine);

  } catch (error: any) {
    console.error('❌ 药品查询错误:', error);
    res.status(500).json({
      error: '查询失败',
      message: error.message
    });
  }
});

export default router;
```

### 6.3 注册药品路由

修改 `backend/src/index.ts`：

```typescript
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRouter from './routes/chat';
import medicineRouter from './routes/medicine'; // 新增

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || 'http://localhost:5173'
}));
app.use(express.json());

// 路由
app.use('/api/chat', chatRouter);
app.use('/api/medicine', medicineRouter); // 新增

app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`💬 聊天接口: http://localhost:${PORT}/api/chat`);
  console.log(`💊 药品查询: http://localhost:${PORT}/api/medicine`);
});
```

### 6.4 测试药品 API

```bash
curl "http://localhost:3000/api/medicine?name=布洛芬"
```

**✅ 第六步完成！药品 API 集成成功。**

---

## 第七步：优化和部署

### 7.1 前端完整聊天界面

这部分代码较长，我会创建完整的聊天组件。

### 7.2 错误处理

在后端添加全局错误处理。

### 7.3 部署准备

- 前端：部署到 Vercel
- 后端：部署到 Railway 或 Render

---

## 常见问题

### Q1: Gemini API 调用失败？

检查：
1. API Key 是否正确
2. 是否有网络访问限制
3. 是否超过免费额度

### Q2: 前后端无法通信？

检查：
1. CORS 配置是否正确
2. 端口是否被占用
3. 防火墙设置

### Q3: TypeScript 编译错误？

运行 `npm install` 确保所有依赖已安装。

---

## 下一步学习

1. 学习 LangChain.js 文档
2. 学习 LangGraph.js 工作流
3. 优化 Prompt Engineering
4. 添加更多功能

---

**🎉 恭喜！你已经完成了基础教程。现在可以开始自己扩展功能了！**
