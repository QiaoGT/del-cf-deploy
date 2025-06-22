import fetch from 'node-fetch';

const token = process.env.CF_API_TOKEN;
const accountId = process.env.CF_ACCOUNT_ID;
const headers = { Authorization: `Bearer ${token}` };

const keepCount = 3; // 要保留的最新部署数量
const perPage = 25;  // 每页请求数
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

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

const main = async () => {
  if (!token || !accountId) {
    console.log(JSON.stringify({ cleanup: false, reason: "Missing credentials" }));
    process.exit(1);
  }

  const projects = await getAllProjectNames();
  for (const project of projects) {
    const count = await getDeploymentCount(project);
    if (count > keepCount) {
      console.log(JSON.stringify({ cleanup: true }));
      return;
    }
    await sleep(300);
  }

  console.log(JSON.stringify({ cleanup: false }));
};

main();
