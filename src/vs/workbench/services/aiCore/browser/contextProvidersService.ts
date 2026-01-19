/*---------------------------------------------------------------------------------------------
 *  AI Core Context Providers Service
 *  实现 Kiro 风格的 # 符号上下文引用系统
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { isCodeEditor, ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { basename } from '../../../../base/common/resources.js';

export const IContextProvidersService = createDecorator<IContextProvidersService>('IContextProvidersService');

// ============================================================================
// Types
// ============================================================================

export interface ContextProviderResult {
	type: ContextProviderType;
	name: string;
	content: string;
	uri?: string;
	metadata?: Record<string, unknown>;
}

export type ContextProviderType =
	| 'file'
	| 'folder'
	| 'codebase'
	| 'git_diff'
	| 'terminal'
	| 'problems'
	| 'url'
	| 'repository'
	| 'current'
	| 'code'
	| 'selection';

export interface ParsedContextReference {
	type: ContextProviderType;
	arg?: string;
	range: { start: number; end: number };
	raw: string;
}

export interface IContextProvidersService {
	readonly _serviceBrand: undefined;

	// 解析消息中的上下文引用
	parseContextReferences(message: string): ParsedContextReference[];

	// 获取上下文内容
	resolveContext(ref: ParsedContextReference): Promise<ContextProviderResult | undefined>;

	// 批量解析并获取所有上下文
	resolveAllContexts(message: string): Promise<{
		contexts: ContextProviderResult[];
		cleanMessage: string;
	}>;

	// 格式化上下文为 LLM 可用的格式
	formatContextsForLLM(contexts: ContextProviderResult[]): string;
}

// ============================================================================
// Context Providers Service Implementation
// ============================================================================

export class ContextProvidersService extends Disposable implements IContextProvidersService {
	readonly _serviceBrand: undefined;

	private static readonly MAX_FILE_SIZE = 100_000;
	private static readonly MAX_FOLDER_FILES = 20;
	private static readonly MAX_TERMINAL_OUTPUT = 5_000;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IEditorService private readonly editorService: IEditorService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@IMarkerService private readonly markerService: IMarkerService
	) {
		super();
	}

	// ========================================================================
	// 解析上下文引用
	// ========================================================================

	parseContextReferences(message: string): ParsedContextReference[] {
		const refs: ParsedContextReference[] = [];

		// 正则表达式匹配所有 # 引用
		// #file:path/to/file.ts
		// #folder:src/components
		// #codebase
		// #git diff
		// #terminal
		// #problems
		// #url:https://...
		// #repository
		// #current
		// #code:snippet

		const patterns: Array<{ type: ContextProviderType; regex: RegExp }> = [
			{ type: 'file', regex: /#file:([^\s]+)/gi },
			{ type: 'folder', regex: /#folder:([^\s]+)/gi },
			{ type: 'codebase', regex: /#codebase\b/gi },
			{ type: 'git_diff', regex: /#git\s*diff\b/gi },
			{ type: 'terminal', regex: /#terminal\b/gi },
			{ type: 'problems', regex: /#problems\b/gi },
			{ type: 'url', regex: /#url:([^\s]+)/gi },
			{ type: 'repository', regex: /#repository\b/gi },
			{ type: 'current', regex: /#current\b/gi },
			{ type: 'code', regex: /#code:(.+?)(?=\s#|\s*$)/gi },
			{ type: 'selection', regex: /#selection\b/gi }
		];

		for (const { type, regex } of patterns) {
			let match: RegExpExecArray | null;
			while ((match = regex.exec(message)) !== null) {
				refs.push({
					type,
					arg: match[1],
					range: { start: match.index, end: match.index + match[0].length },
					raw: match[0]
				});
			}
		}

		// 按位置排序
		refs.sort((a, b) => a.range.start - b.range.start);

		return refs;
	}

	// ========================================================================
	// 解析上下文内容
	// ========================================================================

	async resolveContext(ref: ParsedContextReference): Promise<ContextProviderResult | undefined> {
		try {
			switch (ref.type) {
				case 'file':
					return await this.resolveFileContext(ref.arg);
				case 'folder':
					return await this.resolveFolderContext(ref.arg);
				case 'codebase':
					return await this.resolveCodebaseContext();
				case 'git_diff':
					return await this.resolveGitDiffContext();
				case 'terminal':
					return await this.resolveTerminalContext();
				case 'problems':
					return await this.resolveProblemsContext();
				case 'url':
					return await this.resolveUrlContext(ref.arg);
				case 'repository':
					return await this.resolveRepositoryContext();
				case 'current':
					return await this.resolveCurrentContext();
				case 'selection':
					return await this.resolveSelectionContext();
				case 'code':
					return this.resolveCodeContext(ref.arg);
				default:
					return undefined;
			}
		} catch (error) {
			this.logService.error(`[ContextProviders] Failed to resolve ${ref.type}: ${String(error)}`);
			return undefined;
		}
	}

	// ========================================================================
	// 批量解析
	// ========================================================================

	async resolveAllContexts(message: string): Promise<{
		contexts: ContextProviderResult[];
		cleanMessage: string;
	}> {
		const refs = this.parseContextReferences(message);
		const contexts: ContextProviderResult[] = [];

		// 并行解析所有上下文
		const results = await Promise.all(refs.map(ref => this.resolveContext(ref)));

		for (const result of results) {
			if (result) {
				contexts.push(result);
			}
		}

		// 清理消息中的上下文引用
		let cleanMessage = message;
		// 从后往前替换，避免位置偏移
		for (let i = refs.length - 1; i >= 0; i--) {
			const ref = refs[i];
			cleanMessage = cleanMessage.slice(0, ref.range.start) + cleanMessage.slice(ref.range.end);
		}

		cleanMessage = cleanMessage.trim();

		this.logService.info(`[ContextProviders] Resolved ${contexts.length} contexts from message`);

		return { contexts, cleanMessage };
	}

	// ========================================================================
	// 格式化上下文
	// ========================================================================

	formatContextsForLLM(contexts: ContextProviderResult[]): string {
		if (contexts.length === 0) {
			return '';
		}

		const sections: string[] = [];

		for (const ctx of contexts) {
			let section = '';

			switch (ctx.type) {
				case 'file':
					section = `<file path="${ctx.name}">\n${ctx.content}\n</file>`;
					break;
				case 'folder':
					section = `<folder path="${ctx.name}">\n${ctx.content}\n</folder>`;
					break;
				case 'codebase':
					section = `<codebase_structure>\n${ctx.content}\n</codebase_structure>`;
					break;
				case 'git_diff':
					section = `<git_diff>\n${ctx.content}\n</git_diff>`;
					break;
				case 'terminal':
					section = `<terminal_output>\n${ctx.content}\n</terminal_output>`;
					break;
				case 'problems':
					section = `<problems>\n${ctx.content}\n</problems>`;
					break;
				case 'url':
					section = `<web_content url="${ctx.name}">\n${ctx.content}\n</web_content>`;
					break;
				case 'repository':
					section = `<repository_structure>\n${ctx.content}\n</repository_structure>`;
					break;
				case 'current':
				case 'selection':
					section = `<current_file path="${ctx.name}">\n${ctx.content}\n</current_file>`;
					break;
				case 'code':
					section = `<code_snippet>\n${ctx.content}\n</code_snippet>`;
					break;
			}

			if (section) {
				sections.push(section);
			}
		}

		return sections.join('\n\n');
	}

	// ========================================================================
	// 具体的上下文解析器
	// ========================================================================

	private async resolveFileContext(path?: string): Promise<ContextProviderResult | undefined> {
		if (!path) {
			return undefined;
		}

		const workspaceFolders = this.workspaceService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return undefined;
		}

		// 尝试在工作区中查找文件
		let fileUri: URI | undefined;

		for (const folder of workspaceFolders) {
			const candidate = URI.joinPath(folder.uri, path);
			try {
				const stat = await this.fileService.stat(candidate);
				if (stat && !stat.isDirectory) {
					fileUri = candidate;
					break;
				}
			} catch {
				// 继续尝试下一个文件夹
			}
		}

		if (!fileUri) {
			return {
				type: 'file',
				name: path,
				content: `[文件未找到: ${path}]`
			};
		}

		try {
			const content = await this.fileService.readFile(fileUri);
			let text = content.value.toString();

			// 限制大小
			if (text.length > ContextProvidersService.MAX_FILE_SIZE) {
				text = text.slice(0, ContextProvidersService.MAX_FILE_SIZE) + '\n... [内容已截断]';
			}

			return {
				type: 'file',
				name: path,
				content: text,
				uri: fileUri.toString()
			};
		} catch (error) {
			return {
				type: 'file',
				name: path,
				content: `[读取文件失败: ${String(error)}]`
			};
		}
	}

	private async resolveFolderContext(path?: string): Promise<ContextProviderResult | undefined> {
		if (!path) {
			return undefined;
		}

		const workspaceFolders = this.workspaceService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			return undefined;
		}

		let folderUri: URI | undefined;

		for (const folder of workspaceFolders) {
			const candidate = URI.joinPath(folder.uri, path);
			try {
				const stat = await this.fileService.stat(candidate);
				if (stat && stat.isDirectory) {
					folderUri = candidate;
					break;
				}
			} catch {
				// 继续
			}
		}

		if (!folderUri) {
			return {
				type: 'folder',
				name: path,
				content: `[文件夹未找到: ${path}]`
			};
		}

		try {
			const stat = await this.fileService.resolve(folderUri);
			const files: string[] = [];

			if (!stat.children) {
				return {
					type: 'folder',
					name: path,
					content: '[空文件夹]',
					uri: folderUri.toString()
				};
			}

			let fileCount = 0;
			for (const child of stat.children) {
				if (fileCount >= ContextProvidersService.MAX_FOLDER_FILES) {
					files.push(`... 还有更多文件`);
					break;
				}

				const icon = child.isDirectory ? '📁' : '📄';
				files.push(`${icon} ${child.name}`);

				// 如果是文件，尝试读取内容摘要
				if (!child.isDirectory) {
					try {
						const content = await this.fileService.readFile(child.resource);
						const text = content.value.toString();
						const preview = text.slice(0, 500).split('\n').slice(0, 10).join('\n');
						files.push(`  内容预览:\n${preview.split('\n').map(l => '    ' + l).join('\n')}`);
					} catch {
						// 忽略读取错误
					}
					fileCount++;
				}
			}

			return {
				type: 'folder',
				name: path,
				content: files.join('\n'),
				uri: folderUri.toString()
			};
		} catch (error) {
			return {
				type: 'folder',
				name: path,
				content: `[读取文件夹失败: ${String(error)}]`
			};
		}
	}

	private async resolveCodebaseContext(): Promise<ContextProviderResult> {
		// 返回代码库结构概览
		const workspaceFolders = this.workspaceService.getWorkspace().folders;

		if (workspaceFolders.length === 0) {
			return {
				type: 'codebase',
				name: 'codebase',
				content: '[未打开工作区]'
			};
		}

		const structure: string[] = ['# 代码库结构\n'];

		for (const folder of workspaceFolders) {
			structure.push(`## ${basename(folder.uri)}`);
			try {
				await this.buildFolderTree(folder.uri, structure, 0, 3);
			} catch (error) {
				structure.push(`  [读取失败: ${String(error)}]`);
			}
		}

		return {
			type: 'codebase',
			name: 'codebase',
			content: structure.join('\n')
		};
	}

	private async buildFolderTree(uri: URI, output: string[], depth: number, maxDepth: number): Promise<void> {
		if (depth >= maxDepth) {
			return;
		}

		const indent = '  '.repeat(depth + 1);

		try {
			const stat = await this.fileService.resolve(uri);

			if (!stat.children) {
				return;
			}

			// 排序：文件夹在前，然后按名称排序
			const sortedChildren = [...stat.children].sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) {
					return a.isDirectory ? -1 : 1; // 文件夹优先
				}
				return a.name.localeCompare(b.name);
			});

			for (const child of sortedChildren) {
				// 跳过常见的忽略目录
				if (['node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__', '.vscode'].includes(child.name)) {
					continue;
				}

				const icon = child.isDirectory ? '📁' : '📄';
				output.push(`${indent}${icon} ${child.name}`);

				if (child.isDirectory && depth < maxDepth - 1) {
					await this.buildFolderTree(child.resource, output, depth + 1, maxDepth);
				}
			}
		} catch {
			// 忽略错误
		}
	}

	private async resolveGitDiffContext(): Promise<ContextProviderResult> {
		// 简化实现：提示用户 Git diff 需要终端执行
		// TODO: 集成 Git 扩展 API
		return {
			type: 'git_diff',
			name: 'git diff',
			content: '[Git diff 功能需要 Git 扩展支持。请在终端中运行 `git diff` 或 `git status` 查看更改。]'
		};
	}

	private async resolveTerminalContext(): Promise<ContextProviderResult> {
		try {
			const instances = this.terminalService.instances;

			if (instances.length === 0) {
				return {
					type: 'terminal',
					name: 'terminal',
					content: '[没有活动的终端]'
				};
			}

			const outputs: string[] = [];

			for (const terminal of instances) {
				const title = terminal.title || '终端';
				outputs.push(`## ${title}`);

				// 获取终端缓冲区内容
				try {
					// 使用 xterm 缓冲区获取内容
					const buffer = terminal.xterm?.raw?.buffer?.active;
					if (buffer) {
						const lines: string[] = [];
						const startLine = Math.max(0, buffer.length - 50); // 最后 50 行
						for (let i = startLine; i < buffer.length; i++) {
							const line = buffer.getLine(i);
							if (line) {
								lines.push(line.translateToString());
							}
						}
						const content = lines.join('\n').trim();
						if (content.length > ContextProvidersService.MAX_TERMINAL_OUTPUT) {
							outputs.push(content.slice(-ContextProvidersService.MAX_TERMINAL_OUTPUT));
						} else {
							outputs.push(content || '[空]');
						}
					} else {
						outputs.push('[无法读取终端内容]');
					}
				} catch {
					outputs.push('[读取终端内容失败]');
				}

				outputs.push('');
			}

			return {
				type: 'terminal',
				name: 'terminal',
				content: outputs.join('\n')
			};
		} catch (error) {
			return {
				type: 'terminal',
				name: 'terminal',
				content: `[终端服务不可用: ${String(error)}]`
			};
		}
	}

	private async resolveProblemsContext(): Promise<ContextProviderResult> {
		const markers = this.markerService.read();

		if (markers.length === 0) {
			return {
				type: 'problems',
				name: 'problems',
				content: '✅ 没有问题'
			};
		}

		const problems: string[] = [];
		let errorCount = 0;
		let warningCount = 0;
		let infoCount = 0;

		for (const marker of markers) {
			const severityIcon = marker.severity === MarkerSeverity.Error ? '🔴' :
				marker.severity === MarkerSeverity.Warning ? '🟡' : '🔵';

			if (marker.severity === MarkerSeverity.Error) { errorCount++; }
			else if (marker.severity === MarkerSeverity.Warning) { warningCount++; }
			else { infoCount++; }

			const location = `${basename(marker.resource)}:${marker.startLineNumber}:${marker.startColumn}`;
			problems.push(`${severityIcon} ${location}`);
			problems.push(`   ${marker.message}`);
			if (marker.source) {
				problems.push(`   来源: ${marker.source}`);
			}
		}

		const summary = `# 问题概览\n错误: ${errorCount} | 警告: ${warningCount} | 信息: ${infoCount}\n\n`;

		return {
			type: 'problems',
			name: 'problems',
			content: summary + problems.join('\n')
		};
	}

	private async resolveUrlContext(url?: string): Promise<ContextProviderResult | undefined> {
		if (!url) {
			return undefined;
		}

		// 使用 GLM Web Search 或简单的 fetch
		try {
			// 简化实现：返回 URL 引用，实际内容由 Web Search 工具获取
			return {
				type: 'url',
				name: url,
				content: `[请使用 Web Search 功能获取此 URL 的内容: ${url}]`,
				metadata: { url }
			};
		} catch (error) {
			return {
				type: 'url',
				name: url,
				content: `[获取 URL 内容失败: ${String(error)}]`
			};
		}
	}

	private async resolveRepositoryContext(): Promise<ContextProviderResult> {
		const workspaceFolders = this.workspaceService.getWorkspace().folders;

		if (workspaceFolders.length === 0) {
			return {
				type: 'repository',
				name: 'repository',
				content: '[未打开工作区]'
			};
		}

		const structure: string[] = [];

		for (const folder of workspaceFolders) {
			structure.push(`# 仓库: ${basename(folder.uri)}`);
			structure.push(`路径: ${folder.uri.fsPath}`);
			structure.push('');

			// 检查常见配置文件
			const configFiles = ['package.json', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml'];

			for (const configFile of configFiles) {
				const configUri = URI.joinPath(folder.uri, configFile);
				try {
					const content = await this.fileService.readFile(configUri);
					const text = content.value.toString();

					// 提取关键信息
					if (configFile === 'package.json') {
						try {
							const pkg = JSON.parse(text);
							structure.push(`## package.json`);
							structure.push(`- 名称: ${pkg.name || '未指定'}`);
							structure.push(`- 版本: ${pkg.version || '未指定'}`);
							structure.push(`- 描述: ${pkg.description || '未指定'}`);
							if (pkg.dependencies) {
								structure.push(`- 依赖: ${Object.keys(pkg.dependencies).length} 个`);
							}
							if (pkg.devDependencies) {
								structure.push(`- 开发依赖: ${Object.keys(pkg.devDependencies).length} 个`);
							}
							structure.push('');
						} catch {
							// JSON 解析失败
						}
					} else {
						structure.push(`## ${configFile}`);
						structure.push(`[已找到配置文件]`);
						structure.push('');
					}
				} catch {
					// 文件不存在，继续
				}
			}

			// 构建目录树
			structure.push('## 目录结构');
			await this.buildFolderTree(folder.uri, structure, 0, 2);
		}

		return {
			type: 'repository',
			name: 'repository',
			content: structure.join('\n')
		};
	}

	private async resolveCurrentContext(): Promise<ContextProviderResult | undefined> {
		const activeEditor = this.getActiveCodeEditor();

		if (!activeEditor?.hasModel()) {
			return {
				type: 'current',
				name: 'current',
				content: '[没有打开的文件]'
			};
		}

		const model = activeEditor.getModel();
		const uri = model.uri;
		const fileName = basename(uri);
		let content = model.getValue();

		if (content.length > ContextProvidersService.MAX_FILE_SIZE) {
			content = content.slice(0, ContextProvidersService.MAX_FILE_SIZE) + '\n... [内容已截断]';
		}

		return {
			type: 'current',
			name: fileName,
			content,
			uri: uri.toString(),
			metadata: {
				languageId: model.getLanguageId(),
				lineCount: model.getLineCount()
			}
		};
	}

	private async resolveSelectionContext(): Promise<ContextProviderResult | undefined> {
		const activeEditor = this.getActiveCodeEditor();

		if (!activeEditor?.hasModel()) {
			return {
				type: 'selection',
				name: 'selection',
				content: '[没有选中的代码]'
			};
		}

		const model = activeEditor.getModel();
		const selection = activeEditor.getSelection();

		if (!selection || selection.isEmpty()) {
			return {
				type: 'selection',
				name: 'selection',
				content: '[没有选中的代码]'
			};
		}

		const selectedText = model.getValueInRange(selection);
		const fileName = basename(model.uri);
		const startLine = selection.startLineNumber;
		const endLine = selection.endLineNumber;

		return {
			type: 'selection',
			name: `${fileName}:${startLine}-${endLine}`,
			content: selectedText,
			uri: model.uri.toString(),
			metadata: {
				startLine,
				endLine,
				languageId: model.getLanguageId()
			}
		};
	}

	private resolveCodeContext(code?: string): ContextProviderResult | undefined {
		if (!code) {
			return undefined;
		}

		return {
			type: 'code',
			name: 'code snippet',
			content: code
		};
	}

	private getActiveCodeEditor(): ICodeEditor | undefined {
		const activeTextEditorControl = this.editorService.activeTextEditorControl;

		if (!isCodeEditor(activeTextEditorControl) || !activeTextEditorControl.hasModel()) {
			return undefined;
		}

		return activeTextEditorControl;
	}
}

registerSingleton(IContextProvidersService, ContextProvidersService, InstantiationType.Delayed);
