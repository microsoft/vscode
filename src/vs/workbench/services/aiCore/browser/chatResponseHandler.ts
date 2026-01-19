/*---------------------------------------------------------------------------------------------
 *  AI Core Chat Response Handler
 *  负责将 GLM 流式事件转换为 VSCode Chat 的各种进度类型
 *  支持：思考过程、流式内容、工具调用、文件编辑预览
 *---------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatProgress } from '../../../contrib/chat/common/chatService/chatService.js';
import { GLMStreamEvent, GLMToolCall, GLMChatContext, WebSearchResult } from './glmChatService.js';
import { IAgentToolService } from './agentToolService.js';
import { FileChange } from '../common/agentTools.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { isLocation, Location } from '../../../../editor/common/languages.js';

// ============================================================================
// 类型定义
// ============================================================================

// Chat 请求变量数据类型（简化版）
interface IChatVariable {
	kind?: string;
	value?: unknown;
	name?: string;
	uri?: URI;
	isSelection?: boolean;
}

interface IVariableData {
	variables?: IChatVariable[];
}

export interface ChatResponseState {
	/** 累积的 Markdown 内容 */
	content: string;
	/** 是否正在思考中 */
	isThinking: boolean;
	/** 当前工具调用 */
	currentToolCall: GLMToolCall | null;
	/** 工具调用参数缓冲区 */
	toolArgsBuffer: string;
	/** 待确认的文件变更 */
	pendingChanges: FileChange[];
	/** 上次输出时间 */
	lastOutputTime: number;
}

/**
 * 工具调用结果 - 用于续接对话
 */
export interface ToolCallResult {
	toolCallId: string;
	toolName: string;
	result: string;
	success: boolean;
}

export interface ChatResponseHandlerOptions {
	enableThinking?: boolean;
	enableToolCalls?: boolean;
	maxIterations?: number;
}

// ============================================================================
// Chat 响应处理器 - 真正的打字机效果
// ============================================================================

export class ChatResponseHandler {
	private state: ChatResponseState;
	private _pendingToolResults: ToolCallResult[] = [];
	private _hasToolCalls: boolean = false;

	constructor(
		private readonly progress: (part: IChatProgress) => void,
		private readonly logService: ILogService,
		private readonly agentToolService: IAgentToolService,
		private readonly options: ChatResponseHandlerOptions = {}
	) {
		this.state = {
			content: '',
			isThinking: false,
			currentToolCall: null,
			toolArgsBuffer: '',
			pendingChanges: [],
			lastOutputTime: Date.now()
		};
	}

	/**
	 * 是否有工具调用需要续接
	 */
	get hasToolCalls(): boolean {
		return this._hasToolCalls;
	}

	/**
	 * 获取待处理的工具调用结果
	 */
	getPendingToolResults(): ToolCallResult[] {
		return [...this._pendingToolResults];
	}

	/**
	 * 清除待处理的工具调用结果
	 */
	clearPendingToolResults(): void {
		this._pendingToolResults = [];
		this._hasToolCalls = false;
	}

	/**
	 * 处理流式事件 - 立即输出，不缓冲
	 */
	async handleEvent(event: GLMStreamEvent): Promise<void> {
		switch (event.type) {
			case 'thinking':
				this.handleThinking(event.content || '');
				break;

			case 'content':
				this.handleContentImmediate(event.content || '');
				break;

			case 'tool_call':
				if (event.toolCall) {
					await this.handleToolCall(event.toolCall);
				}
				break;

			case 'tool_result':
				if (event.toolResult) {
					this.handleToolResult(event.toolResult);
				}
				break;

			case 'web_search':
				this.handleWebSearch(event.content || '', event.webSearchResults);
				break;

			case 'done':
				this.handleDone();
				break;

			case 'error':
				this.handleError(event.error || 'Unknown error');
				break;
		}
	}

	/**
	 * 处理联网搜索结果 - 一次性输出，避免逐字显示
	 */
	private handleWebSearch(message: string, results?: WebSearchResult[]): void {
		// 显示搜索状态
		this.progress({
			kind: 'progressMessage',
			content: new MarkdownString(`🔍 ${message}`)
		});

		// 如果有搜索结果，显示摘要（一次性输出）
		if (results && results.length > 0) {
			const lines: string[] = [];
			lines.push('');
			lines.push('> **📚 参考资料：**');

			for (const result of results.slice(0, 5)) {  // 最多显示5条
				let line = `> - [${result.title}](${result.link})`;
				if (result.media) {
					line += ` *${result.media}*`;
				}
				lines.push(line);
			}
			lines.push('');

			const searchSummary = lines.join('\n');

			this.progress({
				kind: 'markdownContent',
				content: this.createMarkdownString(searchSummary)
			});
			this.state.content += searchSummary;
		}
	}

	/**
	 * 处理思考过程
	 */
	private handleThinking(content: string): void {
		if (!this.options.enableThinking) {
			return;
		}

		this.state.isThinking = true;

		// 使用 progressMessage 显示思考过程
		this.progress({
			kind: 'progressMessage',
			content: new MarkdownString(`💭 ${content}`)
		});
	}

	// 内容缓冲区 - 用于累积小片段后一次性渲染
	private contentBuffer: string = '';
	private flushTimeout: ReturnType<typeof setTimeout> | null = null;

	/**
	 * 创建可合并的 MarkdownString - 使用默认值以确保一致性
	 * 关键：所有 MarkdownString 必须具有相同的 isTrusted/supportHtml/supportThemeIcons 才能合并
	 */
	private createMarkdownString(value: string): MarkdownString {
		// 使用 MarkdownString 默认构造，不设置任何选项
		// 这样所有通过此方法创建的 MarkdownString 都有相同的属性（都是默认值）
		return new MarkdownString(value);
	}

	/**
	 * 处理流式内容 - 智能缓冲，累积更多内容后再发送
	 * 策略：累积到较大的自然断点后再发送，减少 UI 更新频率
	 */
	private handleContentImmediate(content: string): void {
		if (!content) {
			return;
		}

		if (this.state.isThinking) {
			this.state.isThinking = false;
		}

		// 累积内容
		this.contentBuffer += content;
		this.state.content += content;

		// 检查是否应该立即刷新：
		// 1. 遇到双换行符（段落结束）
		// 2. 缓冲区超过 100 个字符
		// 3. 遇到代码块结束标记
		const shouldFlush =
			this.contentBuffer.includes('\n\n') ||
			this.contentBuffer.endsWith('```\n') ||
			this.contentBuffer.length >= 100;

		if (shouldFlush) {
			this.flushContentBuffer();
		} else {
			// 设置超时刷新（200ms 内没有新内容就刷新）
			if (this.flushTimeout) {
				clearTimeout(this.flushTimeout);
			}
			this.flushTimeout = setTimeout(() => this.flushContentBuffer(), 200);
		}
	}

	/**
	 * 刷新内容缓冲区到 UI
	 */
	private flushContentBuffer(): void {
		if (this.flushTimeout) {
			clearTimeout(this.flushTimeout);
			this.flushTimeout = null;
		}

		if (!this.contentBuffer) {
			return;
		}

		// 一次性发送累积的内容，使用统一的 MarkdownString 属性确保可合并
		this.progress({
			kind: 'markdownContent',
			content: this.createMarkdownString(this.contentBuffer)
		});

		this.state.lastOutputTime = Date.now();
		this.logService.trace(`[ChatResponseHandler] Flushed: ${this.contentBuffer.length} chars`);

		this.contentBuffer = '';
	}

	/**
	 * 处理工具调用
	 */
	private async handleToolCall(toolCall: GLMToolCall): Promise<void> {
		const toolName = toolCall.function.name;
		let toolArgs: Record<string, unknown>;

		try {
			toolArgs = JSON.parse(toolCall.function.arguments || '{}');
		} catch {
			toolArgs = {};
		}

		this.logService.info(`[ChatResponseHandler] Tool call: ${toolName}`);
		this._hasToolCalls = true;

		// 先刷新任何缓冲的内容，避免工具调用打断内容
		this.flushContentBuffer();

		// 执行工具（不显示进度消息，减少 UI 干扰）
		const result = await this.agentToolService.executeTool(toolName, toolArgs);

		// 保存工具调用结果用于续接对话
		const toolResultOutput = result.success
			? (result.output || JSON.stringify(result.data) || 'success')
			: `Error: ${result.error}`;

		this._pendingToolResults.push({
			toolCallId: toolCall.id,
			toolName: toolName,
			result: toolResultOutput,
			success: result.success
		});

		this.logService.info(`[ChatResponseHandler] Tool ${toolName} completed, result saved for continuation`);

		// 显示工具结果（只对失败的工具显示警告）
		if (result.success) {
			// 如果有文件变更，使用 textEdit 类型
			if (result.fileChanges && result.fileChanges.length > 0) {
				for (const change of result.fileChanges) {
					// 只有未应用的变更才加入待确认列表（Supervised 模式）
					if (!change.applied) {
						this.state.pendingChanges.push(change);
					}
					await this.showFileChange(change);
				}
			}
			// 成功的工具调用不显示 progressMessage，让 AI 继续回复内容
			this.logService.trace(`[ChatResponseHandler] Tool ${toolName} succeeded silently`);
		} else {
			this.progress({
				kind: 'warning',
				content: this.createMarkdownString(`⚠️ ${this.getToolDisplayName(toolName)}: ${result.error}`)
			});
		}
	}

	/**
	 * 处理工具结果
	 */
	private handleToolResult(result: { id: string; output: string; success: boolean }): void {
		if (result.success) {
			this.logService.trace(`[ChatResponseHandler] Tool result: ${result.id} - success`);
		} else {
			this.logService.warn(`[ChatResponseHandler] Tool result: ${result.id} - failed`);
		}
	}

	/**
	 * 显示文件变更（Diff 预览）
	 */
	private async showFileChange(change: FileChange): Promise<void> {
		const fileName = change.uri.fsPath.split('/').pop() || 'file';

		// 显示文件变更的 Markdown 预览
		let diffContent = `\n### 📄 ${fileName}\n`;
		diffContent += `**${change.description}**\n\n`;

		// 简单的 diff 显示
		const originalLines = change.originalContent.split('\n');
		const newLines = change.newContent.split('\n');

		diffContent += '```diff\n';

		// 只显示有变化的行（最多 20 行）
		let changesShown = 0;
		const maxChanges = 20;

		for (let i = 0; i < Math.max(originalLines.length, newLines.length) && changesShown < maxChanges; i++) {
			if (originalLines[i] !== newLines[i]) {
				if (originalLines[i] !== undefined) {
					diffContent += `- ${originalLines[i]}\n`;
					changesShown++;
				}
				if (newLines[i] !== undefined) {
					diffContent += `+ ${newLines[i]}\n`;
					changesShown++;
				}
			}
		}

		if (changesShown >= maxChanges) {
			diffContent += `... (更多变更已省略)\n`;
		}

		diffContent += '```\n\n';
		// 根据是否已应用显示不同提示
		if (change.applied) {
			diffContent += '> ✅ 此修改已自动应用（Autopilot 模式）\n\n';
		} else {
			diffContent += '> ⚠️ 此修改需要确认后才会应用\n\n';
		}

		this.progress({
			kind: 'markdownContent',
			content: this.createMarkdownString(diffContent)
		});

		this.state.content += diffContent;
	}

	/**
	 * 处理完成
	 */
	private handleDone(): void {
		// 先刷新任何剩余的缓冲内容
		this.flushContentBuffer();

		// 如果有待确认的文件变更，显示汇总
		if (this.state.pendingChanges.length > 0) {
			let summary = '\n---\n\n';
			summary += `## 📝 待确认的修改 (${this.state.pendingChanges.length} 个文件)\n\n`;
			summary += '使用命令 `AI Core: Apply All Pending Changes` 来应用这些修改。\n\n';

			for (const change of this.state.pendingChanges) {
				const fileName = change.uri.fsPath.split('/').pop();
				summary += `- **${fileName}**: ${change.description}\n`;
			}

			this.progress({
				kind: 'markdownContent',
				content: this.createMarkdownString(summary)
			});
		}
	}

	/**
	 * 处理错误
	 */
	private handleError(error: string): void {
		this.progress({
			kind: 'warning',
			content: new MarkdownString(`❌ 错误: ${error}`)
		});
	}

	/**
	 * 获取工具的显示名称
	 */
	private getToolDisplayName(toolName: string): string {
		const names: Record<string, string> = {
			'read_file': '读取文件',
			'write_file': '写入文件',
			'run_command': '执行命令',
			'grep_search': '搜索代码',
			'search_files': '搜索文件',
			'list_dir': '列出目录',
			'list_files': '列出文件',
			'get_diagnostics': '获取诊断信息',
			// 网页浏览工具
			'browse_url': '🌐 访问网页',
			'web_search_deep': '🔍 深度搜索'
		};
		return names[toolName] || toolName;
	}

	/**
	 * 获取当前状态
	 */
	getState(): ChatResponseState {
		return { ...this.state };
	}

	/**
	 * 获取累积的内容
	 */
	getContent(): string {
		return this.state.content;
	}

	/**
	 * 获取待确认的文件变更
	 */
	getPendingChanges(): FileChange[] {
		return [...this.state.pendingChanges];
	}
}

// ============================================================================
// 上下文收集工具 - 正确处理各种变量类型
// ============================================================================

export class ChatContextCollector {

	/**
	 * 从 VSCode Chat 请求中收集上下文
	 * 正确处理：file、implicit、location 等各种类型
	 */
	static async collectFromRequest(
		variableData: IVariableData | undefined,
		textModelService: ITextModelService,
		logService: ILogService
	): Promise<GLMChatContext> {
		const files: GLMChatContext['files'] = [];

		if (!variableData?.variables) {
			logService.trace('[ChatContextCollector] No variables provided');
			return { files };
		}

		logService.info(`[ChatContextCollector] Processing ${variableData.variables.length} variables`);

		for (const variable of variableData.variables) {
			logService.trace(`[ChatContextCollector] Variable kind: ${variable.kind}, name: ${variable.name}`);

			try {
				const fileInfo = await this.extractFileInfo(variable, textModelService, logService);
				if (fileInfo) {
					files.push(fileInfo);
					logService.info(`[ChatContextCollector] Added file: ${fileInfo.path}${fileInfo.lineRange ? `:${fileInfo.lineRange}` : ''}`);
				}
			} catch (error) {
				logService.warn(`[ChatContextCollector] Failed to process variable: ${String(error)}`);
			}
		}

		return { files };
	}

	/**
	 * 从变量中提取文件信息
	 */
	private static async extractFileInfo(
		variable: {
			kind?: string;
			value?: unknown;
			name?: string;
			uri?: URI;
			isSelection?: boolean;
		},
		textModelService: ITextModelService,
		logService: ILogService
	): Promise<GLMChatContext['files'][0] | null> {

		let uri: URI | undefined;
		let startLine: number | undefined;
		let endLine: number | undefined;

		// 情况1: value 是 Location 类型（包含 uri 和 range）
		if (variable.value && isLocation(variable.value)) {
			const location = variable.value as Location;
			uri = location.uri;
			startLine = location.range.startLineNumber;
			endLine = location.range.endLineNumber;
			logService.trace(`[ChatContextCollector] Found Location: ${uri.fsPath}:${startLine}-${endLine}`);
		}
		// 情况2: value 是一个包含 uri 和 range 的对象
		else if (variable.value && typeof variable.value === 'object') {
			const val = variable.value as {
				uri?: URI;
				range?: { startLineNumber: number; endLineNumber: number };
			};

			if (val.uri) {
				uri = val.uri;
				if (val.range) {
					startLine = val.range.startLineNumber;
					endLine = val.range.endLineNumber;
				}
				logService.trace(`[ChatContextCollector] Found object with uri: ${uri.fsPath}`);
			}
		}
		// 情况3: value 直接是 URI
		else if (variable.value && URI.isUri(variable.value)) {
			uri = variable.value as URI;
			logService.trace(`[ChatContextCollector] Found URI value: ${uri.fsPath}`);
		}
		// 情况4: 变量自身有 uri 属性
		else if (variable.uri) {
			uri = variable.uri;
			logService.trace(`[ChatContextCollector] Found variable.uri: ${uri.fsPath}`);
		}

		if (!uri) {
			return null;
		}

		// 读取文件内容
		try {
			const ref = await textModelService.createModelReference(uri);
			const model = ref.object.textEditorModel;

			let content: string;
			let lineRange: string | undefined;

			// 如果有行范围，只读取该范围
			if (startLine !== undefined && endLine !== undefined) {
				const range = {
					startLineNumber: startLine,
					startColumn: 1,
					endLineNumber: endLine,
					endColumn: model.getLineMaxColumn(endLine)
				};
				content = model.getValueInRange(range);
				lineRange = `${startLine}-${endLine}`;
				logService.info(`[ChatContextCollector] Reading lines ${lineRange} from ${uri.fsPath}`);
			} else {
				// 读取整个文件（但限制大小）
				const fullContent = model.getValue();
				const maxChars = 30000;
				content = fullContent.slice(0, maxChars);
				if (fullContent.length > maxChars) {
					content += '\n... (文件内容已截断)';
				}
				logService.info(`[ChatContextCollector] Reading full file ${uri.fsPath} (${content.length} chars)`);
			}

			ref.dispose();

			return {
				uri,
				path: uri.fsPath,
				content,
				language: model.getLanguageId(),
				lineRange
			};
		} catch (error) {
			logService.warn(`[ChatContextCollector] Failed to read ${uri.fsPath}: ${String(error)}`);
			return null;
		}
	}
}
