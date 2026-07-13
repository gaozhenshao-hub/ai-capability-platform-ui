/**
 * 将 Emperor 平台中有但 Webdev 数据库中没有的 Skill 批量同步
 * 读取 Emperor store.json → 对比 DB → 插入缺失项
 */
import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const STORE_PATH = '/mnt/a8osnij5pbxdzc5feozmar7ar/ubuntu/ai-capability-platform/data/platform-store.json';

const conn = await createConnection(process.env.DATABASE_URL);

// 1. 读取 Emperor 平台所有 Skill
const store = JSON.parse(readFileSync(STORE_PATH, 'utf8'));
const emperorSkills = store.skills;
console.log('Emperor 平台 Skill 总数:', emperorSkills.length);

// 2. 读取 Webdev DB 现有 slug
const [existingRows] = await conn.execute('SELECT slug FROM ai_skills');
const existingSlugs = new Set(existingRows.map(r => r.slug));
console.log('Webdev DB 现有 Skill 数:', existingSlugs.size);

// 3. 找出缺失的 Skill
const missing = emperorSkills.filter(s => !existingSlugs.has(s.slug));
console.log('缺失 Skill 数:', missing.length);
missing.forEach(s => console.log(' -', s.slug, '|', s.category));

if (missing.length === 0) {
  console.log('✅ 无需同步，数据库已是最新');
  await conn.end();
  process.exit(0);
}

// 4. AMZ 模块分类映射
const categoryMap = {
  'dev.': 'M1-产品开发',
  'listing.': 'M2-Listing工具',
  'keyword.': 'M2-Listing工具',
  'ad.': 'M3-运营AI',
  'ops.': 'M3-运营AI',
  'aftersales.': 'M4-售后服务',
  'off.': 'M5-内容营销',
  'offsite.': 'M5-内容营销',
  'video.': 'M5-内容营销',
  'image.': 'M5-内容营销',
  'analysis.': 'M0-通用分析',
};

function getCategory(slug, emperorCategory) {
  // 优先用 Emperor 中已设置的 AMZ 分类
  if (emperorCategory && emperorCategory.startsWith('M')) return emperorCategory;
  for (const [prefix, cat] of Object.entries(categoryMap)) {
    if (slug.startsWith(prefix)) return cat;
  }
  return 'M0-通用分析';
}

// 5. 批量插入
const now = new Date();
let inserted = 0;

for (const skill of missing) {
  const impl = skill.manifest?.implementation ?? {};
  const systemPrompt = impl.systemPrompt ?? skill.description ?? '';
  const promptTemplate = impl.userPromptTemplate ?? '{{context}}';
  const inputSchema = impl.inputSchema ? JSON.stringify(impl.inputSchema) : JSON.stringify({
    type: 'object',
    properties: { context: { type: 'string' } },
    required: ['context']
  });
  const outputSchema = skill.manifest?.contract?.outputSchema
    ? JSON.stringify(skill.manifest.contract.outputSchema)
    : JSON.stringify({ type: 'object' });

  const category = getCategory(skill.slug, skill.category);
  const status = skill.status === 'Released' ? 'active' : (skill.status === 'Draft' ? 'draft' : 'active');

  try {
    await conn.execute(
      `INSERT INTO ai_skills
        (slug, name, description, category, status, scope,
         systemPrompt, promptTemplate, inputSchema, outputSchema,
         currentVersion, createdAt, updatedAt, createdBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        skill.slug,
        skill.name,
        skill.description ?? '',
        category,
        status,
        'global',
        systemPrompt,
        promptTemplate,
        inputSchema,
        outputSchema,
        skill.version ?? 1,
        now,
        now,
        1  // owner user id
      ]
    );
    console.log(`✅ 插入: ${skill.slug} (${category})`);
    inserted++;
  } catch (err) {
    console.error(`❌ 失败: ${skill.slug}`, err.message);
  }
}

await conn.end();
console.log(`\n完成：新增 ${inserted} 个 Skill`);
