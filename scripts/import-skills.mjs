/**
 * 批量导入 92 个 Skill 到数据库
 * 运行方式: node scripts/import-skills.mjs
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载环境变量
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in environment");
  process.exit(1);
}

// 读取解析好的 Skill 数据
const skillsData = JSON.parse(
  readFileSync("/home/ubuntu/skills_import_data.json", "utf-8")
);

// 分类名称 → 英文 slug 映射（用于 category 字段）
const CATEGORY_SLUG_MAP = {
  "Listing优化": "listing",
  "关键词智能分析": "keyword",
  "广告分析": "advertising",
  "智能运营": "operations",
  "售后服务": "aftersales",
  "图片工作流": "image",
  "视频脚本": "video",
  "站外分析": "offsite",
  "市场分析": "analysis",
  "站外营销": "offsite-marketing",
};

async function main() {
  console.log(`📦 准备导入 ${skillsData.length} 个 Skill...`);

  // 解析 DATABASE_URL
  const url = new URL(DATABASE_URL);
  const conn = await createConnection({
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  console.log("✅ 数据库连接成功");

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const skill of skillsData) {
    try {
      const categorySlug = CATEGORY_SLUG_MAP[skill.category] || "other";
      
      // 构建 inputSchema（从变量列表生成）
      const inputSchema = {};
      for (const v of skill.variables || []) {
        inputSchema[v] = { type: "string", description: v };
      }

      // 构建 outputSchema
      const outputSchema = skill.outputSchema
        ? { description: skill.outputSchema.substring(0, 200) }
        : {};

      // 构建 modelParams
      const modelParams = {
        temperature: skill.temperature || 0.7,
        maxTokens: skill.maxTokens || 2000,
        riskLevel: skill.riskLevel || "L0",
        tags: skill.tags || [],
        sourceSlug: skill.slug, // 保留原始 slug 用于 Listing 工具对接
      };

      // 使用 INSERT ... ON DUPLICATE KEY UPDATE
      const sql = `
        INSERT INTO ai_skills 
          (name, slug, description, category, scope, promptTemplate, systemPrompt, 
           inputSchema, outputSchema, modelParams, status, createdBy, currentVersion)
        VALUES (?, ?, ?, ?, 'global', ?, ?, ?, ?, ?, 'active', 1, 1)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          description = VALUES(description),
          category = VALUES(category),
          promptTemplate = VALUES(promptTemplate),
          systemPrompt = VALUES(systemPrompt),
          inputSchema = VALUES(inputSchema),
          outputSchema = VALUES(outputSchema),
          modelParams = VALUES(modelParams),
          status = 'active'
      `;

      const [result] = await conn.execute(sql, [
        skill.name,
        skill.slug,
        skill.description || "",
        categorySlug,
        skill.userPromptTemplate || "",
        skill.systemPrompt || "",
        JSON.stringify(inputSchema),
        JSON.stringify(outputSchema),
        JSON.stringify(modelParams),
      ]);

      if (result.affectedRows === 1) {
        inserted++;
        process.stdout.write(`✅ 新增: ${skill.slug}\n`);
      } else if (result.affectedRows === 2) {
        updated++;
        process.stdout.write(`🔄 更新: ${skill.slug}\n`);
      }
    } catch (err) {
      errors++;
      console.error(`❌ 失败: ${skill.slug} - ${err.message}`);
    }
  }

  await conn.end();

  console.log("\n" + "=".repeat(50));
  console.log(`📊 导入结果:`);
  console.log(`  ✅ 新增: ${inserted}`);
  console.log(`  🔄 更新: ${updated}`);
  console.log(`  ❌ 失败: ${errors}`);
  console.log(`  📦 总计: ${skillsData.length}`);
  
  if (errors === 0) {
    console.log("\n🎉 全部导入成功！");
  } else {
    console.log(`\n⚠️  有 ${errors} 个 Skill 导入失败，请检查错误信息`);
  }
}

main().catch(console.error);
