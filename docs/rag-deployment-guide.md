# RAG 检索部署配置指南

本指南带你从零把 RAG 检索能力（药剂师 pgvector + 研究员 PubMed）配起来并上线。

> 前提：代码已在 master 分支。研究员的 PubMed 检索**开箱即用无需配置**；本指南主要是把药剂师的 pgvector 检索跑通。

---

## 一、注册 Neon 并拿到连接串

1. 打开 https://neon.tech ，用 GitHub 账号免费登录。
2. 点 **Create Project**：
   - Project name：随意，如 `medical-rag`
   - Region：选 **Asia Pacific (Singapore)**，与后端 Render 新加坡节点同区，延迟最低
   - Postgres 版本：默认即可
3. 建好后，Dashboard 首页的 **Connection string** 就是你要的 `DATABASE_URL`，形如：
   ```
   postgresql://alex:AbC123xyz@ep-cool-name-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   点复制备用。**这串含密码，不要提交到 git。**

---

## 二、启用 pgvector 扩展

Neon 自带 pgvector，只需执行一次开启命令。两种方式任选：

**方式 A：Neon 网页 SQL Editor（推荐，无需装工具）**
Dashboard 左侧点 **SQL Editor**，粘贴执行：
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
返回成功即可。

**方式 B：本地 psql**
```bash
psql "粘贴你的连接串" -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

## 三、本地配置环境变量

在 `backend/.env`（没有就新建，此文件已被 git 忽略）加入：

```bash
# 粘贴第一步拿到的真实连接串
DATABASE_URL=postgresql://alex:AbC123xyz@ep-cool-name-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# PubMed 加速 key，留空即可（免费匿名调用足够）
NCBI_API_KEY=

# 确认已有 Gemini Key（embedding 与对话共用）
GOOGLE_API_KEY=你的_gemini_key
```

同时在 `backend/.env.example` 补上占位符（这个文件会提交，**只放示例不放真实值**）：
```bash
DATABASE_URL=postgres://user:password@host/dbname
NCBI_API_KEY=
```

---

## 四、灌入药品说明书数据

确保本地 Node ≥ 20（本机默认是 v16，需切换）：

```bash
cd backend
source ~/.nvm/nvm.sh && nvm use 24
npm run ingest
```

成功输出类似：
```
解析 7 份说明书，共 35 个切块，开始入库...
入库完成
```

> 数据只需灌一次，存在 Neon 里持久保留。以后往 `data/drug-labels/` 加新药品文件后，重跑 `npm run ingest` 即可（脚本会追加）。

---

## 五、本地验证

启动后端，发一条含症状的问诊（如"头痛发烧推荐什么药"），观察药剂师返回的 `sources` 字段是否带真实出处（如 `NMPA说明书:布洛芬-用法用量`）。

若 `DATABASE_URL` 没配或库空，药剂师会**安全降级**为通用建议并在 warnings 标注"未检索到说明书"，不会报错崩溃。

---

## 六、线上部署（Render）

1. 打开 Render 后端服务 → **Environment** 标签。
2. 新增环境变量：
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | 第一步的 Neon 连接串（同一个即可，Neon 是云端库） |
   | `NCBI_API_KEY` | 留空或填申请的 key |
3. 保存后 Render 会自动重新部署。
4. 数据无需在线上重灌——Neon 是云端数据库，第四步灌的数据线上直接可用。

---

## 常见问题

**Q：一定要用 Neon 吗？**
任何带 pgvector 的 Postgres 都行（Supabase、自建 PG 装 pgvector 扩展）。换库只需改 `DATABASE_URL`，代码不用动。

**Q：NCBI_API_KEY 必须填吗？**
不必。PubMed 匿名调用限速 3 次/秒，Demo 足够。高并发再去 https://www.ncbi.nlm.nih.gov/account/ 免费申请。

**Q：embedding 要额外付费吗？**
不用。用的是 Gemini `gemini-embedding-001`（3072 维），与对话共用 `GOOGLE_API_KEY`，几十份说明书的向量化在免费额度内。

> ⚠️ 注意：embedding 模型必须选 API Key 所在项目实际可用的型号。部分 Key 不支持 `text-embedding-004`，本项目改用 `gemini-embedding-001`。如需确认可用模型，请求 `https://generativelanguage.googleapis.com/v1beta/models?key=你的KEY` 查看支持 `embedContent` 的型号。

**Q：换了 embedding 模型怎么办？**
向量维度与模型绑定。若更换 embedding 模型，必须重跑 `npm run ingest` 重算全部向量。
