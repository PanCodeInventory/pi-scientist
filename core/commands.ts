import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the bundled HTML template in source and dist layouts. */
function resolveReportTemplatePath(): string {
	const root = [__dirname, path.resolve(__dirname, ".."), path.resolve(__dirname, "..", "..")]
		.find((candidate) => fs.existsSync(path.join(candidate, "skills"))) ?? path.resolve(__dirname, "..");
	return path.join(root, "skills", "analysis-planning", "references", "report-template.html");
}

export function registerReflectCommand(pi: ExtensionAPI): void {
	pi.registerCommand("reflect", {
		description: "结合实际结果，按需讨论方法、参数和局限性",
		async handler(args) {
			pi.sendUserMessage([
				"回顾本次分析，用实际数据与结果解释关键方法、参数依据和局限性。",
				"先给简短总结，再按用户的兴趣讨论；若用户希望练习，可逐题交流。不要强制考试或固定问题配额，不运行新分析。",
				args.trim(),
			].filter(Boolean).join("\n"), { deliverAs: "followUp" });
		},
	});
}

export function registerGenerateReportCommand(pi: ExtensionAPI): void {
	pi.registerCommand("generate-report", {
		description: "按需生成自包含中文 HTML 报告；不要求 Task 文件",
		async handler(args) {
			pi.sendUserMessage([
				"用户请求生成分析报告。结合明确的任务范围、实际代码/配置/产物与会话讨论，主代理直接生成自包含中文 HTML。",
				"若有相关 Task 文件可作为索引，但不是前置条件；不要仅按修改时间猜测哪个结果权威。范围不清时询问。",
				`读取模板 \`${resolveReportTemplatePath()}\`，保留黑白学术排版，用真实结果替换演示内容，移除占位脚本。`,
				"包含：方法与参数依据、证据支持的核心结论、逐图解释、文件与复现索引；明确未解决问题和未验证内容。请求报告不等于结果已经确认。",
				"保存至分析目录的 Report/<TaskID或主题>-<YYYYMMDD>.html，图片以 data URI 内嵌，无外部依赖。无需为报告补建计划或调度子代理。",
				"告知报告路径，未经用户要求不 commit/push。",
				args.trim(),
			].filter(Boolean).join("\n"), { deliverAs: "followUp" });
		},
	});
}

export function registerPublicationCommand(pi: ExtensionAPI): void {
	pi.registerCommand("publication", {
		description: "将既有结果整理为可复现的一图一 Jupyter Notebook",
		async handler(args) {
			pi.sendUserMessage([
				"用户请求 Publication 成图整理。读取 publication skill，直接盘点相关既有结果，只澄清影响交付的未知选择。",
				"在分析目录 Publication/ 下生成一图一 notebook，相对路径引用数据，不复制大数据；保留来源与参数，导出单张图 PDF + PNG。",
				"实际从头执行 notebook 验证复现。无需 Task、Scout 或 worker/reviewer 链；若缺少数据或需要新增分析，说明缺口并确认扩展范围。",
				"完成后告知产物和验证情况，不自动生成报告或 commit/push。",
				args.trim(),
			].filter(Boolean).join("\n"), { deliverAs: "followUp" });
		},
	});
}
