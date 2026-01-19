/*---------------------------------------------------------------------------------------------
 *  AI Core Agent Tool Service
 *  实现文件操作、终端命令、代码搜索等工具
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISearchService, QueryType, ITextQuery } from '../../../services/search/common/search.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import {
	AgentTool,
	AgentToolResult,
	FileChange,
	AGENT_TOOL_NAMES,
	toGLMToolsFormat
} from '../common/agentTools.js';

export type ExecutionMode = 'autopilot' | 'supervised';

export const IAgentToolService = createDecorator<IAgentToolService>('IAgentToolService');

export interface IAgentToolService {
	readonly _serviceBrand: undefined;

	readonly onDidAddPendingChange: Event<FileChange>;
	readonly onDidApplyChange: Event<FileChange>;

	getTools(): AgentTool[];
	getToolsForGLM(): object[];
	executeTool(toolName: string, args: Record<string, unknown>): Promise<AgentToolResult>;

	// 执行模式
	getExecutionMode(): ExecutionMode;
	setExecutionMode(mode: ExecutionMode): void;
	isAutopilot(): boolean;

	// 文件变更管理
	getPendingChanges(): FileChange[];
	applyChange(change: FileChange): Promise<boolean>;
	applyAllChanges(): Promise<{ applied: number; failed: number }>;
	revertAllChanges(): Promise<void>;
	rejectChange(change: FileChange): void;
	clearPendingChanges(): void;
}

export class AgentToolService extends Disposable implements IAgentToolService {
	readonly _serviceBrand: undefined;

	private readonly _tools: Map<string, AgentTool> = new Map();
	private readonly _pendingChanges: FileChange[] = [];
	private readonly _appliedChanges: FileChange[] = []; // 用于 Revert

	private readonly _onDidAddPendingChange = this._register(new Emitter<FileChange>());
	readonly onDidAddPendingChange = this._onDidAddPendingChange.event;

	private readonly _onDidApplyChange = this._register(new Emitter<FileChange>());
	readonly onDidApplyChange = this._onDidApplyChange.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ISearchService private readonly searchService: ISearchService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IMarkerService private readonly markerService: IMarkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.registerDefaultTools();
	}

	// ========================================================================
	// 执行模式管理
	// ========================================================================

	getExecutionMode(): ExecutionMode {
		return this.configurationService.getValue<ExecutionMode>('aiCore.executionMode') || 'supervised';
	}

	setExecutionMode(mode: ExecutionMode): void {
		this.configurationService.updateValue('aiCore.executionMode', mode);
	}

	isAutopilot(): boolean {
		return this.getExecutionMode() === 'autopilot';
	}

	private registerDefaultTools(): void {
		// 1. 读取文件
		this._tools.set(AGENT_TOOL_NAMES.READ_FILE, {
			name: AGENT_TOOL_NAMES.READ_FILE,
			description: '读取指定文件的内容。可以读取项目中的任何文本文件。',
			parameters: [
				{ name: 'path', type: 'string', description: '文件路径（相对于项目根目录或绝对路径）', required: true },
				{ name: 'startLine', type: 'number', description: '起始行号（可选，从1开始）', required: false },
				{ name: 'endLine', type: 'number', description: '结束行号（可选）', required: false }
			],
			execute: async (args) => this.readFile(args)
		});

		// 2. 写入/修改文件
		this._tools.set(AGENT_TOOL_NAMES.WRITE_FILE, {
			name: AGENT_TOOL_NAMES.WRITE_FILE,
			description: '创建或修改文件。修改会显示 diff 预览，需要用户确认后才会应用。',
			parameters: [
				{ name: 'path', type: 'string', description: '文件路径', required: true },
				{ name: 'content', type: 'string', description: '新的文件内容', required: true },
				{ name: 'description', type: 'string', description: '描述这次修改的目的', required: true }
			],
			execute: async (args) => this.writeFile(args)
		});

		// 3. 搜索文件
		this._tools.set(AGENT_TOOL_NAMES.SEARCH_FILES, {
			name: AGENT_TOOL_NAMES.SEARCH_FILES,
			description: '在项目中搜索文件名。支持 glob 模式匹配。',
			parameters: [
				{ name: 'pattern', type: 'string', description: '文件名模式（如 *.ts, **/*.json）', required: true },
				{ name: 'maxResults', type: 'number', description: '最大结果数（默认50）', required: false }
			],
			execute: async (args) => this.searchFiles(args)
		});

		// 4. 列出目录
		this._tools.set(AGENT_TOOL_NAMES.LIST_DIR, {
			name: AGENT_TOOL_NAMES.LIST_DIR,
			description: '列出目录中的文件和子目录。',
			parameters: [
				{ name: 'path', type: 'string', description: '目录路径（默认为项目根目录）', required: false }
			],
			execute: async (args) => this.listDir(args)
		});

		// 5. 执行终端命令
		this._tools.set(AGENT_TOOL_NAMES.RUN_COMMAND, {
			name: AGENT_TOOL_NAMES.RUN_COMMAND,
			description: '在终端中执行 shell 命令。可用于运行构建、测试、安装依赖等操作。',
			parameters: [
				{ name: 'command', type: 'string', description: '要执行的命令', required: true },
				{ name: 'cwd', type: 'string', description: '工作目录（可选）', required: false }
			],
			execute: async (args) => this.runCommand(args)
		});

		// 6. Grep 搜索
		this._tools.set(AGENT_TOOL_NAMES.GREP_SEARCH, {
			name: AGENT_TOOL_NAMES.GREP_SEARCH,
			description: '在项目文件中搜索文本内容。支持正则表达式。',
			parameters: [
				{ name: 'pattern', type: 'string', description: '搜索模式（文本或正则表达式）', required: true },
				{ name: 'filePattern', type: 'string', description: '限定文件类型（如 *.ts）', required: false },
				{ name: 'maxResults', type: 'number', description: '最大结果数（默认20）', required: false }
			],
			execute: async (args) => this.grepSearch(args)
		});

		// 7. 获取诊断信息（错误/警告）
		this._tools.set(AGENT_TOOL_NAMES.GET_DIAGNOSTICS, {
			name: AGENT_TOOL_NAMES.GET_DIAGNOSTICS,
			description: '获取项目中的编译错误、警告和 lint 问题。',
			parameters: [
				{ name: 'path', type: 'string', description: '指定文件路径（可选，不填则获取所有）', required: false },
				{ name: 'severity', type: 'string', description: '过滤严重级别: error, warning, info', required: false, enum: ['error', 'warning', 'info'] }
			],
			execute: async (args) => this.getDiagnostics(args)
		});

		// 8. 浏览网页 - 访问 URL 并提取内容（深度检索）
		this._tools.set(AGENT_TOOL_NAMES.BROWSE_URL, {
			name: AGENT_TOOL_NAMES.BROWSE_URL,
			description: '访问指定 URL 并提取网页的完整内容。用于深度阅读搜索结果中的链接，获取详细信息。支持论文、文档、博客等网页。',
			parameters: [
				{ name: 'url', type: 'string', description: '要访问的网页 URL', required: true },
				{ name: 'extractLinks', type: 'boolean', description: '是否提取页面中的链接（默认 false）', required: false }
			],
			execute: async (args) => this.browseUrl(args)
		});

		// 9. 深度网络搜索 - 搜索并自动访问前几个结果
		this._tools.set(AGENT_TOOL_NAMES.WEB_SEARCH, {
			name: AGENT_TOOL_NAMES.WEB_SEARCH,
			description: '深度网络搜索：先搜索，然后自动访问前 3 个结果获取详细内容。适合需要深入了解某个主题的场景。',
			parameters: [
				{ name: 'query', type: 'string', description: '搜索关键词', required: true },
				{ name: 'maxResults', type: 'number', description: '要深度访问的结果数量（默认 3，最大 5）', required: false }
			],
			execute: async (args) => this.webSearchDeep(args)
		});

		this.logService.info(`[AgentToolService]: Registered ${this._tools.size} tools`);
	}

	getTools(): AgentTool[] {
		return Array.from(this._tools.values());
	}

	getToolsForGLM(): object[] {
		return toGLMToolsFormat(this.getTools());
	}

	async executeTool(toolName: string, args: Record<string, unknown>): Promise<AgentToolResult> {
		const tool = this._tools.get(toolName);
		if (!tool) {
			return { success: false, error: `Unknown tool: ${toolName}` };
		}

		this.logService.info(`[AgentToolService]: Executing tool ${toolName} with args: ${JSON.stringify(args)}`);

		try {
			const result = await tool.execute(args);
			this.logService.info(`[AgentToolService]: Tool ${toolName} completed: ${result.success}`);
			return result;
		} catch (error) {
			this.logService.error(`[AgentToolService]: Tool ${toolName} failed: ${String(error)}`);
			return { success: false, error: String(error) };
		}
	}

	// ========================================================================
	// Tool Implementations
	// ========================================================================

	private async readFile(args: Record<string, unknown>): Promise<AgentToolResult> {
		const path = args.path as string;
		const startLine = args.startLine as number | undefined;
		const endLine = args.endLine as number | undefined;

		const uri = this.resolveUri(path);
		if (!uri) {
			return { success: false, error: 'Invalid path or no workspace' };
		}

		try {
			// 先检查是否是目录
			const stat = await this.fileService.stat(uri);
			if (stat.isDirectory) {
				return {
					success: false,
					error: `Unable to read file '${path}' that is actually a directory. Use 'list_dir' tool instead to list directory contents.`
				};
			}

			const content = (await this.fileService.readFile(uri)).value.toString();
			let lines = content.split('\n');

			if (startLine !== undefined || endLine !== undefined) {
				const start = (startLine ?? 1) - 1;
				const end = endLine ?? lines.length;
				lines = lines.slice(start, end);
			}

			// 添加行号
			const numberedContent = lines
				.map((line, i) => `${String((startLine ?? 1) + i).padStart(4)}| ${line}`)
				.join('\n');

			return {
				success: true,
				output: numberedContent,
				data: { path, lineCount: lines.length }
			};
		} catch (error) {
			return { success: false, error: `Failed to read file: ${String(error)}` };
		}
	}

	private async writeFile(args: Record<string, unknown>): Promise<AgentToolResult> {
		const path = args.path as string;
		const content = args.content as string;
		const description = args.description as string;

		const uri = this.resolveUri(path);
		if (!uri) {
			return { success: false, error: 'Invalid path or no workspace' };
		}

		// 读取原始内容（如果存在）
		let originalContent = '';
		try {
			originalContent = (await this.fileService.readFile(uri)).value.toString();
		} catch {
			// 新文件
		}

		// 创建变更记录
		const change: FileChange = {
			uri,
			originalContent,
			newContent: content,
			description,
			applied: false
		};

		// 根据执行模式决定行为
		if (this.isAutopilot()) {
			// Autopilot 模式：直接应用更改
			try {
				await this.fileService.writeFile(uri, VSBuffer.fromString(content));
				change.applied = true;
				this._appliedChanges.push(change);
				this._onDidApplyChange.fire(change);

				this.logService.info(`[AgentTool] Autopilot: Applied change to ${path}`);

				return {
					success: true,
					output: `✅ 文件已自动更新（Autopilot 模式）：\n- 文件: ${path}\n- 描述: ${description}\n- 变更行数: ${this.countChangedLines(originalContent, content)}`,
					fileChanges: [change]
				};
			} catch (error) {
				return { success: false, error: `Failed to write file: ${String(error)}` };
			}
		} else {
			// Supervised 模式：等待用户确认
			this._pendingChanges.push(change);
			this._onDidAddPendingChange.fire(change);

			return {
				success: true,
				output: `📝 文件修改已准备好，等待确认（Supervised 模式）：\n- 文件: ${path}\n- 描述: ${description}\n- 变更行数: ${this.countChangedLines(originalContent, content)}\n\n> 使用 "Accept All" 应用更改，或 "Reject All" 放弃`,
				fileChanges: [change]
			};
		}
	}

	private async searchFiles(args: Record<string, unknown>): Promise<AgentToolResult> {
		const pattern = args.pattern as string;
		const maxResults = (args.maxResults as number) || 50;

		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			return { success: false, error: 'No workspace folder' };
		}

		try {
			const results = await this.searchService.fileSearch({
				type: QueryType.File,
				folderQueries: folders.map(f => ({ folder: f.uri })),
				filePattern: pattern,
				maxResults
			});

			const files = results.results.map(r => r.resource.fsPath);
			return {
				success: true,
				output: `找到 ${files.length} 个文件:\n${files.map(f => `- ${f}`).join('\n')}`,
				data: { files, count: files.length }
			};
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	private async listDir(args: Record<string, unknown>): Promise<AgentToolResult> {
		const path = (args.path as string) || '';

		const uri = this.resolveUri(path) || this.workspaceService.getWorkspace().folders[0]?.uri;
		if (!uri) {
			return { success: false, error: 'No workspace folder' };
		}

		try {
			const stat = await this.fileService.resolve(uri);
			if (!stat.children) {
				return { success: false, error: 'Not a directory' };
			}

			const items = stat.children.map(child => ({
				name: child.name,
				type: child.isDirectory ? 'dir' : 'file',
				size: child.isFile ? child.size : undefined
			}));

			const output = items
				.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
				.map(item => `${item.type === 'dir' ? '📁' : '📄'} ${item.name}`)
				.join('\n');

			return {
				success: true,
				output: `目录: ${uri.fsPath}\n\n${output}`,
				data: { items }
			};
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	private async runCommand(args: Record<string, unknown>): Promise<AgentToolResult> {
		const command = args.command as string;
		const cwd = args.cwd as string | undefined;

		try {
			// 创建或使用现有终端
			const terminal = this.terminalService.activeInstance ||
				await this.terminalService.createTerminal({ cwd });

			if (!terminal) {
				return { success: false, error: 'Failed to create terminal' };
			}

			// 发送命令
			terminal.sendText(command, true);

			// 注意：实际输出需要异步收集，这里简化处理
			return {
				success: true,
				output: `命令已在终端执行: ${command}\n工作目录: ${cwd || '项目根目录'}\n\n请查看终端输出了解执行结果。`,
				data: { command, cwd }
			};
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	private async grepSearch(args: Record<string, unknown>): Promise<AgentToolResult> {
		const pattern = args.pattern as string;
		const filePattern = args.filePattern as string | undefined;
		const maxResults = (args.maxResults as number) || 20;

		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			return { success: false, error: 'No workspace folder' };
		}

		try {
			const query: ITextQuery = {
				type: QueryType.Text,
				contentPattern: { pattern },
				folderQueries: folders.map(f => ({
					folder: f.uri,
					...(filePattern ? { includePattern: { [filePattern]: true } } : {})
				})),
				maxResults
			};

			const results = await this.searchService.textSearch(query);

			let output = `搜索 "${pattern}" 找到 ${results.results.length} 个结果:\n\n`;

			for (const result of results.results.slice(0, 10)) {
				const fileName = result.resource.fsPath.split('/').pop();
				output += `📄 ${fileName}\n`;

				if (result.results) {
					for (const match of result.results.slice(0, 3)) {
						if ('preview' in match && match.preview) {
							const preview = match.preview as { text: string };
							output += `   ${preview.text.trim()}\n`;
						}
					}
				}
				output += '\n';
			}

			return {
				success: true,
				output,
				data: { matchCount: results.results.length }
			};
		} catch (error) {
			return { success: false, error: String(error) };
		}
	}

	private async getDiagnostics(args: Record<string, unknown>): Promise<AgentToolResult> {
		const path = args.path as string | undefined;
		const severity = args.severity as string | undefined;

		const uri = path ? this.resolveUri(path) : undefined;
		const markers = uri
			? this.markerService.read({ resource: uri })
			: this.markerService.read({});

		let filtered = markers;
		if (severity) {
			const severityMap: Record<string, MarkerSeverity> = {
				'error': MarkerSeverity.Error,
				'warning': MarkerSeverity.Warning,
				'info': MarkerSeverity.Info
			};
			const targetSeverity = severityMap[severity];
			if (targetSeverity) {
				filtered = markers.filter(m => m.severity === targetSeverity);
			}
		}

		if (filtered.length === 0) {
			return {
				success: true,
				output: '没有发现问题 ✅',
				data: { count: 0 }
			};
		}

		let output = `发现 ${filtered.length} 个问题:\n\n`;
		for (const marker of filtered.slice(0, 20)) {
			const icon = marker.severity === MarkerSeverity.Error ? '❌' :
				marker.severity === MarkerSeverity.Warning ? '⚠️' : 'ℹ️';
			output += `${icon} ${marker.resource.fsPath.split('/').pop()}:${marker.startLineNumber}\n`;
			output += `   ${marker.message}\n\n`;
		}

		return {
			success: true,
			output,
			data: { count: filtered.length, markers: filtered.slice(0, 20) }
		};
	}

	// ========================================================================
	// File Change Management
	// ========================================================================

	getPendingChanges(): FileChange[] {
		return [...this._pendingChanges];
	}

	async applyChange(change: FileChange): Promise<boolean> {
		try {
			await this.fileService.writeFile(change.uri, VSBuffer.fromString(change.newContent));
			change.applied = true;

			// 从待处理列表移除
			const index = this._pendingChanges.indexOf(change);
			if (index > -1) {
				this._pendingChanges.splice(index, 1);
			}

			this._onDidApplyChange.fire(change);
			this.logService.info(`[AgentToolService]: Applied change to ${change.uri.fsPath}`);
			return true;
		} catch (error) {
			this.logService.error(`[AgentToolService]: Failed to apply change: ${String(error)}`);
			return false;
		}
	}

	async applyAllChanges(): Promise<{ applied: number; failed: number }> {
		let applied = 0;
		let failed = 0;

		for (const change of [...this._pendingChanges]) {
			if (await this.applyChange(change)) {
				applied++;
			} else {
				failed++;
			}
		}

		return { applied, failed };
	}

	rejectChange(change: FileChange): void {
		const index = this._pendingChanges.indexOf(change);
		if (index > -1) {
			this._pendingChanges.splice(index, 1);
		}
	}

	clearPendingChanges(): void {
		this._pendingChanges.length = 0;
	}

	async revertAllChanges(): Promise<void> {
		// 撤销所有已应用的更改（恢复原始内容）
		for (const change of [...this._appliedChanges].reverse()) {
			try {
				await this.fileService.writeFile(change.uri, VSBuffer.fromString(change.originalContent));
				this.logService.info(`[AgentTool] Reverted change to ${change.uri.fsPath}`);
			} catch (error) {
				this.logService.error(`[AgentTool] Failed to revert ${change.uri.fsPath}: ${String(error)}`);
			}
		}
		this._appliedChanges.length = 0;
	}

	// ========================================================================
	// Helper Methods
	// ========================================================================

	private resolveUri(path: string): URI | undefined {
		const folders = this.workspaceService.getWorkspace().folders;
		if (folders.length === 0) {
			return undefined;
		}

		if (path.startsWith('/')) {
			return URI.file(path);
		}

		return URI.joinPath(folders[0].uri, path);
	}

	private countChangedLines(original: string, newContent: string): number {
		const originalLines = original.split('\n');
		const newLines = newContent.split('\n');
		let changed = 0;

		const maxLen = Math.max(originalLines.length, newLines.length);
		for (let i = 0; i < maxLen; i++) {
			if (originalLines[i] !== newLines[i]) {
				changed++;
			}
		}

		return changed;
	}

	// ========================================================================
	// Web Browsing Tools - 深度网页访问
	// ========================================================================

	/**
	 * 使用智谱 AI 访问网页并提取内容
	 * 通过让模型访问网页，获取结构化的内容摘要
	 */
	private async browseUrl(args: Record<string, unknown>): Promise<AgentToolResult> {
		const url = args.url as string;

		if (!url) {
			return { success: false, error: 'URL is required' };
		}

		this.logService.info(`[AgentToolService]: Browsing URL via GLM: ${url}`);

		try {
			// 使用智谱 AI 的 web_browser 能力来访问网页
			const apiKey = '20cca2b90c8c4348aaab3d4f6814c33b.Ow4WJfqfc06uB4KI';
			const apiEndpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

			const response = await fetch(apiEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model: 'glm-4.7',
					messages: [
						{
							role: 'system',
							content: '你是一个网页内容提取助手。请访问用户提供的网页，提取并总结其中的核心内容。输出格式：\n1. 页面标题\n2. 主要内容摘要（重点信息）\n3. 关键信息列表\n不要返回导航菜单、页脚等无关内容。'
						},
						{
							role: 'user',
							content: `请访问并总结这个网页的核心内容：${url}`
						}
					],
					tools: [{
						type: 'web_search',
						web_search: {
							enable: true,
							search_result: true
						}
					}],
					stream: false,
					max_tokens: 4096
				})
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				this.logService.error(`[AgentToolService]: Browse URL failed: ${response.status} - ${JSON.stringify(errData)}`);
				return { success: false, error: `访问失败: HTTP ${response.status}` };
			}

			const data = await response.json();
			const content = data.choices?.[0]?.message?.content || '';

			if (!content || content.length < 50) {
				return { success: false, error: '未能获取有效内容' };
			}

			return {
				success: true,
				output: content,
				data: { url, contentLength: content.length }
			};
		} catch (error) {
			this.logService.error(`[AgentToolService]: Browse URL failed: ${String(error)}`);
			return { success: false, error: `无法访问网页: ${String(error)}` };
		}
	}

	/**
	 * 深度网络搜索：让智谱 AI 搜索并综合分析
	 */
	private async webSearchDeep(args: Record<string, unknown>): Promise<AgentToolResult> {
		const query = args.query as string;

		if (!query) {
			return { success: false, error: 'Search query is required' };
		}

		this.logService.info(`[AgentToolService]: Deep web search: "${query}"`);

		try {
			// 直接让智谱 AI 进行深度搜索并综合分析
			const apiKey = '20cca2b90c8c4348aaab3d4f6814c33b.Ow4WJfqfc06uB4KI';
			const apiEndpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

			const response = await fetch(apiEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`
				},
				body: JSON.stringify({
					model: 'glm-4.7',
					messages: [
						{
							role: 'system',
							content: `你是一个专业的研究助手。用户会给你一个研究问题，你需要：
1. 联网搜索相关资料
2. 深入分析搜索到的内容
3. 综合整理成结构化的研究报告

输出要求：
- 使用 Markdown 格式
- 列出关键发现和结论
- 标注信息来源
- 提供具体的技术细节或数据
- 给出实用的建议

不要说"我无法访问"或"作为AI我没有能力"，你有联网搜索能力。`
						},
						{
							role: 'user',
							content: query
						}
					],
					tools: [{
						type: 'web_search',
						web_search: {
							enable: true,
							search_result: true
						}
					}],
					stream: false,
					max_tokens: 8192
				})
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				this.logService.error(`[AgentToolService]: Deep search failed: ${response.status} - ${JSON.stringify(errData)}`);
				return { success: false, error: `搜索失败: HTTP ${response.status}` };
			}

			const data = await response.json();
			const content = data.choices?.[0]?.message?.content || '';

			if (!content || content.length < 100) {
				return { success: false, error: '未能获取有效的搜索结果' };
			}

			return {
				success: true,
				output: content,
				data: { query, contentLength: content.length }
			};
		} catch (error) {
			this.logService.error(`[AgentToolService]: Deep web search failed: ${String(error)}`);
			return { success: false, error: `深度搜索失败: ${String(error)}` };
		}
	}

}

registerSingleton(IAgentToolService, AgentToolService, InstantiationType.Delayed);

