/**
 * 批量更新 Webdev 数据库 ai_skills 表的 category 字段
 * 按 AMZ 全链路工具五大模块结构分组
 */
import { createConnection } from 'mysql2/promise';

const EXACT_MAP = {
  'listing.competitor.analyze': 'M2-Listing工具',
  'listing.review.analyze': 'M2-Listing工具',
  'image.workflow.step1.sellingpoints': 'M2-Listing工具',
  'image.workflow.step2.outline': 'M2-Listing工具',
  'image.workflow.step3.copy': 'M2-Listing工具',
  'image.workflow.step4.refine': 'M2-Listing工具',
  'image.workflow.step5.checklist': 'M2-Listing工具',
  'keyword.classification': 'M2-Listing工具',
  'keyword.strategy': 'M2-Listing工具',
  'offsite.youtube.analyze': 'M5-内容营销',
  'offsite.tiktok.analyze': 'M5-内容营销',
  'dev.market.opportunity': 'M1-产品开发',
  'dev.analysis.product': 'M1-产品开发',
  'video.product.info': 'M2-Listing工具',
  'analysis.rufus.attribute': 'M2-Listing工具',
  'analysis.competitor.multi': 'M2-Listing工具',
  'analysis.cosmo.scene': 'M2-Listing工具',
  'analysis.a9.keyword.grade': 'M2-Listing工具',
};

const PREFIX_MAP = [
  { prefix: 'dev.', category: 'M1-产品开发' },
  { prefix: 'listing.', category: 'M2-Listing工具' },
  { prefix: 'keyword.', category: 'M2-Listing工具' },
  { prefix: 'ad.', category: 'M3-运营AI' },
  { prefix: 'ops.', category: 'M3-运营AI' },
  { prefix: 'aftersales.', category: 'M4-售后服务' },
  { prefix: 'image.', category: 'M5-内容营销' },
  { prefix: 'video.', category: 'M5-内容营销' },
  { prefix: 'offsite.', category: 'M5-内容营销' },
  { prefix: 'off.', category: 'M5-内容营销' },
  { prefix: 'analysis.', category: 'M0-通用分析' },
];

function getCategory(slug) {
  if (EXACT_MAP[slug]) return EXACT_MAP[slug];
  for (const { prefix, category } of PREFIX_MAP) {
    if (slug.startsWith(prefix)) return category;
  }
  return 'M0-通用分析';
}

const conn = await createConnection(process.env.DATABASE_URL);
const [skills] = await conn.execute('SELECT id, slug, category FROM ai_skills');

const summary = {};
let updated = 0;

for (const skill of skills) {
  const newCat = getCategory(skill.slug);
  if (skill.category !== newCat) {
    await conn.execute('UPDATE ai_skills SET category = ? WHERE id = ?', [newCat, skill.id]);
    updated++;
  }
  summary[newCat] = (summary[newCat] || 0) + 1;
}

await conn.end();

console.log(`✅ 更新完成：${updated} 个 Skill 的 category 已修改（共 ${skills.length} 个）`);
console.log('\n📊 分组统计：');
Object.entries(summary).sort().forEach(([cat, count]) => {
  console.log(`  ${cat}: ${count} 个`);
});
