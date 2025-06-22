// 导入 node-fetch 模块，用于发起 HTTP 请求
import fetch from 'node-fetch';

// === 环境变量 & 配置 ===
const token = process.env.CF_API_TOKEN;       // Cloudflare API 令牌
const accountId = process.env.CF_ACCOUNT_ID; // Cloudflare 帐号 ID
const headers = { Authorization: `Bearer ${token}` };

const keepCount = 3;   // 要保留的最新部署数量
const perPage = 25;    // 每次获取多少条记录
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// === 获取所有 Pages 项目的名称 ===
const getAllProjectNames = async () => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    return data.success ? data.result.map(p => p.name) : [];
  } catch {
    return [];
  }
};

// === 获取某个项目的部署数量（只查第一页即可）===
const getDeploymentCount = async (project) => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments?page=1&per_page=1`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();
    return data.success ? data.result_info.total_count || 0 : 0;
  } catch {
    return 0;
  }
};

// === 主逻辑 ===
const main = async () => {
  // 确保必要的环境变量存在
  if (!token || !accountId) {
    console.log(JSON.stringify({ cleanup: false, reason: "⚠️ 缺少 CF_API_TOKEN 或 CF_ACCOUNT_ID" }));
    process.exit(1);
  }

  // 获取所有项目
  const projects = await getAllProjectNames();

  // 遍历每个项目，判断是否有部署超过保留数量
  for (const project of projects) {
    const count = await getDeploymentCount(project);
    if (count > keepCount) {
      console.log(JSON.stringify({ cleanup: true }));
      return;
    }
    await sleep(300); // 稍作等待，避免触发 API 限速
  }

  // 所有项目都没有超过部署数量
  console.log(JSON.stringify({ cleanup: false }));
};

main();
