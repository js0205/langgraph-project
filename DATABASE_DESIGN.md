# 数据库设计方案

## 为什么需要数据库？

当前项目是无状态的，所有数据都在内存中。如果需要以下功能，就需要数据库：

### 需要数据库的场景：

1. **用户系统**
   - 用户注册、登录
   - 个人资料管理
   - 多用户隔离

2. **对话历史持久化**
   - 保存所有聊天记录
   - 用户可查看历史对话
   - 跨设备同步

3. **药品数据库**
   - 存储真实的药品信息
   - 支持精确查询
   - 定期更新数据

4. **用户反馈和评分**
   - 记录用户对建议的反馈
   - 优化推荐算法

5. **统计和分析**
   - 常见问题统计
   - 用户行为分析
   - 系统性能监控

---

## 推荐的数据库方案

### 方案一：PostgreSQL + Prisma ORM（推荐）

**优点：**
- 关系型数据库，适合结构化数据
- Prisma 提供类型安全的 ORM
- 支持 JSON 字段（存储工作流结果）
- 成熟稳定

### 方案二：MongoDB + Mongoose

**优点：**
- NoSQL，灵活的文档结构
- 适合存储嵌套的对话数据
- JSON 格式天然契合

### 方案三：SQLite（开发/小型项目）

**优点：**
- 无需独立数据库服务器
- 轻量级，易于部署
- 适合原型开发

---

## 数据库表设计

### 1. 用户表 (users)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**TypeScript 接口：**
```typescript
interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 2. 对话会话表 (conversations)

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200),  -- 对话标题（根据第一条消息生成）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
```

**TypeScript 接口：**
```typescript
interface Conversation {
  id: string;
  userId: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 3. 消息表 (messages)

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,  -- 'user' 或 'assistant'
  content TEXT NOT NULL,

  -- 工作流相关字段（仅 assistant 消息有值）
  intent VARCHAR(50),
  symptoms TEXT[],  -- PostgreSQL 数组
  workflow_data JSONB,  -- 存储完整的工作流结果

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
```

**TypeScript 接口：**
```typescript
interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;

  // 工作流字段
  intent?: string;
  symptoms?: string[];
  workflowData?: {
    medicines?: Array<{
      name: string;
      type: string;
      indication: string;
      usage: string;
    }>;
  };

  createdAt: Date;
}
```

---

### 4. 药品表 (medicines)

```sql
CREATE TABLE medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  generic_name VARCHAR(200),  -- 通用名
  type VARCHAR(100),  -- 药品类型
  indication TEXT,  -- 适应症
  usage TEXT,  -- 用法用量
  contraindication TEXT,  -- 禁忌症
  side_effects TEXT,  -- 副作用
  precautions TEXT,  -- 注意事项
  price DECIMAL(10, 2),  -- 价格
  manufacturer VARCHAR(200),  -- 生产厂家
  approval_number VARCHAR(100),  -- 批准文号

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_medicines_name ON medicines(name);
CREATE INDEX idx_medicines_type ON medicines(type);
-- 全文搜索索引
CREATE INDEX idx_medicines_fulltext ON medicines USING GIN (
  to_tsvector('chinese', name || ' ' || COALESCE(indication, ''))
);
```

**TypeScript 接口：**
```typescript
interface Medicine {
  id: string;
  name: string;
  genericName?: string;
  type?: string;
  indication?: string;
  usage?: string;
  contraindication?: string;
  sideEffects?: string;
  precautions?: string;
  price?: number;
  manufacturer?: string;
  approvalNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 5. 用户反馈表 (feedback)

```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),  -- 1-5 星评分
  comment TEXT,
  helpful BOOLEAN,  -- 回复是否有帮助
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_user_id ON feedback(user_id);
CREATE INDEX idx_feedback_message_id ON feedback(message_id);
```

---

## Prisma Schema 示例

```prisma
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String         @id @default(uuid())
  username      String         @unique
  email         String         @unique
  passwordHash  String
  avatarUrl     String?
  conversations Conversation[]
  feedback      Feedback[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model Conversation {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String?
  messages  Message[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([userId])
  @@index([createdAt])
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String
  content        String       @db.Text
  intent         String?
  symptoms       String[]
  workflowData   Json?
  feedback       Feedback[]
  createdAt      DateTime     @default(now())

  @@index([conversationId])
  @@index([createdAt])
}

model Medicine {
  id              String    @id @default(uuid())
  name            String
  genericName     String?
  type            String?
  indication      String?   @db.Text
  usage           String?   @db.Text
  contraindication String?  @db.Text
  sideEffects     String?   @db.Text
  precautions     String?   @db.Text
  price           Decimal?  @db.Decimal(10, 2)
  manufacturer    String?
  approvalNumber  String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([name])
  @@index([type])
}

model Feedback {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  messageId String
  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
  rating    Int
  comment   String?  @db.Text
  helpful   Boolean?
  createdAt DateTime @default(now())

  @@index([userId])
  @@index([messageId])
}
```

---

## 如何添加数据库到项目

### 1. 安装依赖

```bash
cd backend
npm install @prisma/client
npm install -D prisma
```

### 2. 初始化 Prisma

```bash
npx prisma init
```

### 3. 配置数据库连接

```env
# backend/.env
DATABASE_URL="postgresql://username:password@localhost:5432/medical_assistant"
```

### 4. 创建和迁移数据库

```bash
# 创建迁移
npx prisma migrate dev --name init

# 生成 Prisma Client
npx prisma generate
```

### 5. 在代码中使用

```typescript
// backend/src/db/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// backend/src/services/conversationService.ts
import { prisma } from '../db/prisma';

export class ConversationService {
  // 保存对话
  async saveMessage(conversationId: string, role: string, content: string) {
    return await prisma.message.create({
      data: {
        conversationId,
        role,
        content
      }
    });
  }

  // 获取对话历史
  async getConversationHistory(conversationId: string) {
    return await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });
  }
}
```

---

## 总结

### 当前项目（无数据库）
✅ 适合演示和学习
✅ 快速开发和部署
✅ 无额外依赖
❌ 无法持久化数据
❌ 无法支持多用户

### 添加数据库后
✅ 数据持久化
✅ 多用户支持
✅ 对话历史管理
✅ 药品数据库查询
✅ 用户反馈和统计
❌ 增加部署复杂度
❌ 需要数据库维护

**建议：**
- 原型阶段：无数据库（当前）
- 生产环境：添加 PostgreSQL + Prisma
