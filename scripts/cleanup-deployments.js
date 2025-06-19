const fetch = require('node-fetch');

const accountId = process.env.CF_ACCOUNT_ID;
const project = process.env.CF_PROJECT_NAME;
const token = process.env.CF_API_TOKEN;
const keepCount = 3;

const baseURL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}/deployments`;
const headers = { Authorization: `Bearer ${token}` };

(async () => {
  console.log("📥 Fetching deployments...");
  const res = await fetch(baseURL, { headers });
  const data = await res.json();

  if (!data.success) {
    console.error("❌ Fetch failed:", data.errors);
    process.exit(1);
  }

  const deployments = data.result;
  console.log(`📦 Found ${deployments.length} deployments.`);

  if (deployments.length <= keepCount) {
    console.log("✅ Nothing to delete.");
    return;
  }

  const toDelete = deployments
    .sort((a, b) => new Date(b.created_on) - new Date(a.created_on))
    .slice(keepCount);

  for (const d of toDelete) {
    if (d.latest_stage?.status === "ACTIVE") {
      console.log(`⏭️ Skipping active: ${d.id}`);
      continue;
    }

    const delURL = `${baseURL}/${d.id}`;
    console.log(`🗑 Deleting: ${d.id}`);
    const delRes = await fetch(delURL, { method: 'DELETE', headers });
    const delData = await delRes.json();

    if (delData.success) {
      console.log(`✅ Deleted: ${d.id}`);
    } else {
      console.warn(`⚠️ Failed to delete ${d.id}:`, delData.errors);
    }

    await new Promise(res => setTimeout(res, 1000)); // avoid rate limiting
  }
})();
