import fetch from 'node-fetch';

// === 配置项 ===
const token = process.env.CF_API_TOKEN;
const accountId = process.env.CF_ACCOUNT_ID;
const headers = { Authorization: `Bearer ${token}` };

const keepCount = 3; // 要保留的最新部署数量
const perPage = 25;  // 每次获取的数量（分页）

// === 辅助函数 ===
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * 获取当前账号下的所有 Pages 项目名称
 * @returns {Promise<string[]>} 返回项目名称数组
 */
const getAllProjectNames = async () => {
  console.log("🌐 开始获取账户下的所有 Pages 项目...");
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;
  try {
    const res = await fetch(url, { headers });
    const data = await res.json();

    if (!data.success) {
      console.error(`::error:: 获取项目列表失败: ${data.errors?.[0]?.message || '未知错误'}`);
      return null;
    }

    const projects = data.result;
    if (!projects || projects.length === 0) {
      console.log("✅ 当前账户下没有任何项目。");
      return [];
    }

    console.log("✅ 已成功获取所有项目。");
    return projects.map(p => p.name);
  } catch (error) {
    console.error(`::error:: 获取项目列表时发生错误: ${error.message}`);
    return null;
  }
};

/**
 * 获取指定项目的所有部署记录（自动处理分页）
 * @param {string} project - 项目名称
 * @returns {Promise<Array|null>} 返回部署记录数组
 */
const getAllDeployments = async (project) => {
  const allDeployments = [];
  let page = 1;
  console.log(`🔍 [${project}] 获取所有部署记录中...`);

  while (true) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments?page=${page}&per_page=${perPage}&sort_by=created_on&sort_order=desc`;
    console.log(`[${project}] 正在获取第 ${page} 页部署记录...`);

    try {
      const res = await fetch(url, { headers });
      const data = await res.json();

      if (!data.success) {
        console.warn(`::warning:: [${project}] 获取第 ${page} 页失败: ${data.errors?.[0]?.message || '未知错误'}`);
        return null;
      }

      const deployments = data.result;
      if (!deployments || deployments.length === 0) break;

      allDeployments.push(...deployments);
      page++;
      await sleep(500);
    } catch (error) {
      console.error(`::error:: [${project}] 获取部署记录出错: ${error.message}`);
      return null;
    }
  }

  console.log(`✅ [${project}] 共获取到 ${allDeployments.length} 条部署记录。`);
  return allDeployments;
};

/**
 * 清理单个项目的旧部署
 * @param {string} project - 项目名称
 */
const cleanupProject = async (project) => {
  console.log(`\n🚀 [${project}] 开始执行清理任务...`);

  const deployments = await getAllDeployments(project);

  if (deployments === null) {
    console.error(`[${project}] 获取部署失败，跳过该项目。`);
    return;
  }

  if (deployments.length <= keepCount) {
    console.log(`✅ [${project}] 部署数量不超过 ${keepCount} 条，无需清理。`);
    return;
  }

  // 过滤出可删除的部署
  const toDelete = deployments.slice(keepCount).filter(d =>
    d.latest_stage?.status.toLowerCase() !== 'active' &&
    d.deployment_trigger?.type !== 'production'
  );

  if (toDelete.length === 0) {
    console.log(`✅ [${project}] 没有可删除的部署。`);
    return;
  }

  console.log(`🗑️ [${project}] 将尝试删除 ${toDelete.length} 个旧部署...`);

  const deleteBaseURL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments`;

  for (const d of toDelete) {
    const url = `${deleteBaseURL}/${d.id}`;
    const isProd = d.deployment_trigger?.type === 'production';
    const isActive = d.latest_stage?.status.toLowerCase() === 'active';

    if (isProd || isActive) {
      console.log(`⚠️ [${project}] 跳过删除部署 ${d.id.substring(0, 8)}（原因: ${isProd ? '生产版本' : '仍在激活'}）`);
      continue;
    }

    console.log(`🧨 [${project}] 正在删除部署: ${d.id.substring(0, 8)}...（创建于 ${d.created_on}）`);

    try {
      const res = await fetch(url, { method: 'DELETE', headers });
      if (res.ok) {
        console.log(`✅ [${project}] 删除成功: ${d.id.substring(0, 8)}`);
      } else {
        const msg = await res.json();
        console.warn(`::warning:: [${project}] 删除失败: ${msg.errors?.[0]?.message || res.statusText}`);
      }
    } catch (error) {
      console.error(`::error:: [${project}] 删除失败: ${error.message}`);
    }

    await sleep(800);
  }
};

/**
 * 主函数入口
 */
const main = async () => {
  if (!token || !accountId) {
    console.error("::error:: 缺少环境变量 CF_API_TOKEN 或 CF_ACCOUNT_ID，无法执行任务。");
    process.exit(1);
  }

  const projectNames = await getAllProjectNames();

  if (projectNames === null) {
    console.log("❌ 项目列表获取失败，任务终止。");
    process.exit(1);
  }

  if (projectNames.length === 0) {
    console.log("🤷 当前账户下没有任何 Pages 项目。");
    return;
  }

  console.log(`\n📦 本次将处理 ${projectNames.length} 个项目: ${projectNames.join(', ')}`);

  for (const project of projectNames) {
    await cleanupProject(project);
  }

  console.log("\n🎉 所有项目清理完毕！");
};

main();
