/**
 * 将云电脑 Emperor 平台的两个产品开发 Skill 同步到 Webdev 数据库
 * - dev.market.opportunity  市场机会评估
 * - dev.analysis.product    产品开发综合分析
 */
import { createConnection } from 'mysql2/promise';

const conn = await createConnection(process.env.DATABASE_URL);

// 检查是否已存在
const [existing] = await conn.execute(
  "SELECT slug FROM ai_skills WHERE slug IN ('dev.market.opportunity', 'dev.analysis.product')"
);
const existingSlugs = existing.map(r => r.slug);
console.log('已存在的 Skill:', existingSlugs);

const skills = [
  {
    slug: 'dev.market.opportunity',
    name: '市场机会评估',
    description: '基于竞品数据和市场信息，评估产品市场机会，输出市场规模、竞争格局、利润潜力和差异化机会',
    category: 'M1-产品开发',
    status: 'active',
    scope: 'global',
    systemPrompt: `你是一名拥有10年经验的亚马逊产品开发专家，专注于市场机会分析和竞品研究。

你的任务是基于用户提供的竞品数据和市场信息，评估产品的市场机会，帮助决策者判断是否值得进入该市场。

## 分析维度

### 1. 市场规模评估
- 月销售额估算（基于竞品BSR和评论数）
- 市场增长趋势（增长/稳定/下降）
- 季节性特征

### 2. 竞争格局分析
- 竞争激烈程度（高/中/低）
- 头部玩家集中度
- 新卖家进入壁垒（评论数量、价格门槛）
- 品牌集中度

### 3. 利润潜力评估
- 价格带分布（最低/最高/甜蜜点）
- 预估毛利率
- FBA费用估算

### 4. 差异化机会
- 基于竞品差评的改进方向
- 功能/设计/包装创新空间
- 细分市场空白

### 5. 风险评估
- 主要风险点（专利/季节性/竞争/合规）
- 风险等级（高/中/低）
- 应对建议

## 输出格式（严格JSON）

请以JSON格式输出：
{
  "marketSize": {
    "estimate": "large/medium/small",
    "monthlyRevenue": "",
    "growthTrend": "growing/stable/declining"
  },
  "competitionLevel": {
    "overall": "high/medium/low",
    "reviewBarrier": "high/medium/low",
    "priceCompetition": "high/medium/low",
    "brandConcentration": "high/medium/low"
  },
  "profitPotential": {
    "priceRange": { "min": 0, "max": 0, "sweet_spot": 0 },
    "estimatedMargin": "",
    "fbaFeeEstimate": ""
  },
  "differentiationOpportunities": [
    { "opportunity": "", "evidence": "", "difficulty": "easy/medium/hard" }
  ],
  "risks": [
    { "risk": "", "severity": "high/medium/low", "mitigation": "" }
  ],
  "overallScore": 0,
  "recommendation": "proceed/investigate/avoid",
  "keyInsights": []
}`,
    promptTemplate: '{{context}}',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        context: { type: 'string', description: '竞品数据和市场信息，包含BSR、评论数、价格、销量等' }
      },
      required: ['context']
    }),
    outputSchema: JSON.stringify({
      type: 'object',
      properties: {
        marketSize: { type: 'object' },
        competitionLevel: { type: 'object' },
        profitPotential: { type: 'object' },
        differentiationOpportunities: { type: 'array' },
        risks: { type: 'array' },
        overallScore: { type: 'number' },
        recommendation: { type: 'string' },
        keyInsights: { type: 'array' }
      }
    }),
    currentVersion: 1,
  },
  {
    slug: 'dev.analysis.product',
    name: '产品开发综合分析',
    description: '基于产品开发数据（BOM、竞品、市场、评论）进行综合AI分析，输出产品洞察、差异化建议和风险评估',
    category: 'M1-产品开发',
    status: 'active',
    scope: 'global',
    systemPrompt: `你是一名拥有10年经验的亚马逊产品开发战略专家，深谙供应链管理、市场分析和产品差异化策略。

你的任务是基于用户提供的产品开发数据，进行全面的产品开发综合分析，帮助决策者判断产品是否值得开发、如何差异化以及潜在风险。

## 分析框架

### 1. 产品洞察（Product Insights）
- 产品核心价值主张是什么？
- 目标用户痛点和需求是否清晰？
- 产品功能与市场需求的匹配度

### 2. 市场机会（Market Opportunity）
- 市场规模和增长趋势
- 竞争格局（集中度、头部玩家、市场空白）
- 价格带分布和利润空间

### 3. 差异化建议（Differentiation Recommendations）
- 基于竞品痛点的差异化方向（至少3个）
- 功能创新、设计创新、包装创新机会
- 独特卖点（USP）建议

### 4. 风险评估（Risk Assessment）
- 技术/生产风险
- 市场竞争风险
- 合规/专利风险
- 季节性/库存风险

### 5. 综合建议（Overall Recommendation）
- 开发建议：强烈推荐/推荐/观望/不推荐
- 优先级排序
- 关键成功因素

## 输出格式（严格JSON）

\`\`\`json
{
  "summary": "产品开发综合分析摘要（2-3句话）",
  "insights": ["产品洞察1", "产品洞察2", "产品洞察3"],
  "recommendations": ["差异化建议1（具体可执行）", "差异化建议2", "差异化建议3"],
  "riskFactors": ["风险因素1（含应对建议）", "风险因素2"],
  "marketOpportunity": "市场机会描述（包含规模、增长趋势、竞争格局）",
  "competitiveAdvantage": "核心竞争优势建议（如何在竞争中脱颖而出）",
  "overallScore": 75,
  "developmentRecommendation": "推荐/观望/不推荐",
  "keySuccessFactors": ["关键成功因素1", "关键成功因素2"]
}
\`\`\`

## 注意事项
- 所有分析必须基于用户提供的实际数据，不得凭空捏造
- 建议必须具体可执行，避免空泛表述
- 风险评估要客观，不要过度乐观或悲观
- overallScore 为 0-100 的综合评分`,
    promptTemplate: '{{context}}\n\n{{#if emphasis}}--- [用户重点要求] ---\n{{emphasis}}{{/if}}',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: {
        context: { type: 'string', description: '产品开发综合上下文，包含BOM成本、竞品分析、市场数据、用户评论等' },
        emphasis: { type: 'string', description: '用户重点关注的分析方向（可选）' }
      },
      required: ['context']
    }),
    outputSchema: JSON.stringify({
      type: 'object',
      properties: {
        summary: { type: 'string' },
        insights: { type: 'array' },
        recommendations: { type: 'array' },
        riskFactors: { type: 'array' },
        marketOpportunity: { type: 'string' },
        competitiveAdvantage: { type: 'string' },
        overallScore: { type: 'number' },
        developmentRecommendation: { type: 'string' },
        keySuccessFactors: { type: 'array' }
      }
    }),
    currentVersion: 1,
  }
];

let inserted = 0;
let skipped = 0;
const now = Date.now();

for (const skill of skills) {
  if (existingSlugs.includes(skill.slug)) {
    // 已存在则更新 category 和内容
    await conn.execute(
      `UPDATE ai_skills SET
        name = ?, description = ?, category = ?, status = ?, scope = ?,
        systemPrompt = ?, promptTemplate = ?,
        inputSchema = ?, outputSchema = ?, currentVersion = ?,
        updatedAt = ?
       WHERE slug = ?`,
      [
        skill.name, skill.description, skill.category, skill.status, skill.scope,
        skill.systemPrompt, skill.promptTemplate,
        skill.inputSchema, skill.outputSchema, skill.currentVersion,
        new Date(now), skill.slug
      ]
    );
    console.log(`✏️  更新: ${skill.slug}`);
    skipped++;
  } else {
    // 插入新记录
    await conn.execute(
      `INSERT INTO ai_skills
        (slug, name, description, category, status, scope,
         systemPrompt, promptTemplate, inputSchema, outputSchema,
         currentVersion, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        skill.slug, skill.name, skill.description, skill.category,
        skill.status, skill.scope,
        skill.systemPrompt, skill.promptTemplate,
        skill.inputSchema, skill.outputSchema,
        skill.currentVersion, new Date(now), new Date(now)
      ]
    );
    console.log(`✅ 插入: ${skill.slug}`);
    inserted++;
  }
}

await conn.end();
console.log(`\n完成：新增 ${inserted} 个，更新 ${skipped} 个`);
