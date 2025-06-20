import fetch from 'node-fetch';
import fs from 'fs';
import { backOff } from 'exponential-backoff'; // ✅ 引入 backOff

// ================== 配置 ==================
const token = process.env.CF_API_TOKEN;
const accountId = process.env.CF_ACCOUNT_ID;
const headers = { Authorization: `Bearer ${token}` };
const keepCount = 3; // 保留最新的部署数量
const perPage = 50; // 每次API请求获取的部署数量，最大100
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
// ==========================================

/**
 * 分页获取一个项目的所有部署
 * @param {string} project - 项目名称
 * @returns {Promise<Array>} - 包含所有部署对象的数组
 */
const getAllDeployments = async (project) => {
    const allDeployments = [];
    let page = 1;

    console.log(`📦 [${project}] 开始通过分页获取所有部署记录...`);

    while (true) {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments?per_page=${perPage}&page=${page}`;
        
        try {
            const fetchPage = async () => {
                const res = await fetch(url, { headers });
                if (!res.ok) {
                    // 如果API返回非2xx状态码，则抛出错误以触发重试
                    throw new Error(`API 请求失败，状态码: ${res.status}`);
                }
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.errors?.[0]?.message || 'Cloudflare API 返回失败');
                }
                return data.result;
            };

            // 使用 exponential-backoff 进行带重试的请求
            const deploymentsOnPage = await backOff(fetchPage, {
                numOfAttempts: 5,
                startingDelay: 1000,
                retry: (e, attemptNumber) => {
                    console.warn(`⚠️ [${project}] 获取第 ${page} 页失败 (尝试次数 ${attemptNumber}/5): ${e.message}`);
                    return true; // 继续重试
                }
            });

            if (deploymentsOnPage && deploymentsOnPage.length > 0) {
                allDeployments.push(...deploymentsOnPage);
                console.log(`  - 已获取第 ${page} 页，共 ${deploymentsOnPage.length} 条，累计 ${allDeployments.length} 条`);
                page++;
                await sleep(500); // 避免过于频繁请求
            } else {
                // 如果当前页没有数据，说明已经获取完毕
                break;
            }
        } catch (error) {
            console.error(`❌ [${project}] 在获取第 ${page} 页时发生严重错误，已中止该项目的处理: ${error.message}`);
            return null; // 返回 null 表示该项目处理失败
        }
    }
    
    console.log(`✅ [${project}] 所有部署记录获取完毕，共 ${allDeployments.length} 条。`);
    return allDeployments;
};

/**
 * 清理单个项目的部署
 * @param {string} project - 项目名称
 */
const cleanupProject = async (project) => {
    console.log(`\n🚀 开始处理项目: [${project}]`);
    
    const deployments = await getAllDeployments(project);

    if (deployments === null) {
        // 如果获取失败，则跳过该项目
        return;
    }

    if (deployments.length <= keepCount) {
        console.log(`👍 [${project}] 部署数量不足或等于 ${keepCount}，无需清理。`);
        return;
    }

    // 按创建时间倒序排序，最新的在前面
    deployments.sort((a, b) => new Date(b.created_on) - new Date(a.created_on));

    // 找出当前生产环境（别名）的部署ID，确保不被删除
    const productionDeployment = deployments.find(d => d.aliases && d.aliases.length > 0);
    const productionId = productionDeployment ? productionDeployment.id : null;
    if (productionId) {
        console.log(`🛡️ [${project}] 生产部署 ID: ${productionId}，将不会被删除。`);
    }

    // 找出需要保留的最新部署的ID
    const keepIds = new Set(deployments.slice(0, keepCount).map(d => d.id));
    if (productionId) {
        keepIds.add(productionId); // 确保生产部署一定被保留
    }

    // 筛选出需要删除的部署
    const toDelete = deployments.filter(d => !keepIds.has(d.id));

    if (toDelete.length === 0) {
        console.log(`👍 [${project}] 没有需要删除的部署。`);
        return;
    }

    console.log(`🗑️ [${project}] 计划删除 ${toDelete.length} 个旧部署...`);

    for (const d of toDelete) {
        const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments/${d.id}`;
        console.log(`   - 正在删除部署：${d.id} (创建于: ${d.created_on})`);
        try {
            const res = await fetch(url, { method: 'DELETE', headers });
            const delData = await res.json();
            if (delData.success) {
                console.log(`   ✅ 删除成功: ${d.id}`);
            } else {
                console.warn(`   ⚠️ 删除失败: ${d.id}，原因: ${delData.errors?.[0]?.message || '未知'}`);
            }
        } catch (error) {
            console.error(`   ❌ 删除时发生网络错误: ${d.id}, ${error.message}`);
        }
        await sleep(800); // 每次删除后等待，防止API速率限制
    }
};

/**
 * 主函数
 */
(async () => {
    try {
        const projects = JSON.parse(fs.readFileSync('./projects.json', 'utf-8'));
        console.log('====== 开始执行 Cloudflare Pages 部署清理任务 ======');
        for (const project of projects) {
            await cleanupProject(project);
        }
        console.log('\n====== 所有项目处理完毕 ======');
    } catch (error) {
        console.error('读取 projects.json 文件或执行主流程时出错:', error);
    }
})();
