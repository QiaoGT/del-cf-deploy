# del-cf-deploy
# 🧹 del-cf-deploy

[![Cleanup Workflow](https://github.com/QiaoGT/del-cf-deploy/actions/workflows/cleanup.yml/badge.svg)](https://github.com/QiaoGT/del-cf-deploy/actions/workflows/cleanup.yml)

自动清理 Cloudflare Pages 的历史部署记录，只保留最新的 3 条部署。

Clean up old Cloudflare Pages deployments automatically, keeping only the latest 3.

---

## ✨ 特性 Features

- 🗓️ 每日自动运行，也支持手动运行（可切换项目）
- 🧠 智能识别部署状态，跳过当前激活版本
- 🔧 基于 GitHub Actions 和 Node.js
- 🧹 节省部署空间，保持项目整洁
- ✅ 无需服务器，全程托管

---

## 🚀 使用方法 Usage

### 1. 添加 Secrets

点击 GitHub 仓库 → Settings → Secrets and variables → **Actions** → 添加：

| 名称              | 说明                                 |
|-------------------|--------------------------------------|
| `CF_API_TOKEN`     | Cloudflare 的 API Token（需具有 Pages 权限） |
| `CF_ACCOUNT_ID`    | 你的 Cloudflare 账户 ID                 |

（可选）在 Variables 中添加默认项目名：

| 名称              | 示例值             |
|-------------------|--------------------|
| `CF_PROJECT_NAME`  | `telegraph-image`  |

---

### 2. 配置 Actions

每次 push 后，该 workflow 会自动运行（或你也可以手动运行，并传入不同的项目名）：

```yaml
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:
    inputs:
      cf_project_name:
        description: 'Cloudflare Pages 项目名称'
        required: false
        default: telegraph-image

