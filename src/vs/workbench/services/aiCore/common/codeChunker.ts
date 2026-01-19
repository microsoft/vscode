/*---------------------------------------------------------------------------------------------
 *  AI Core Code Chunker
 *  将代码文件拆分为语义块
 *---------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { CodeChunk, CodeChunkType, IndexConfig, DEFAULT_INDEX_CONFIG } from './codeIndexTypes.js';

/**
 * 代码分块器
 * 负责将代码文件拆分为语义块，支持多种语言
 */
export class CodeChunker {
	private readonly config: IndexConfig;
	private chunkIdCounter = 0;

	constructor(config: Partial<IndexConfig> = {}) {
		this.config = { ...DEFAULT_INDEX_CONFIG, ...config };
	}

	/**
	 * 将文件内容拆分为代码块
	 */
	chunkFile(uri: URI, content: string, language: string): CodeChunk[] {
		const lines = content.split('\n');

		// 根据语言选择分块策略
		switch (language) {
			case 'typescript':
			case 'javascript':
			case 'typescriptreact':
			case 'javascriptreact':
				return this.chunkTypeScript(uri, content, lines, language);

			case 'python':
				return this.chunkPython(uri, content, lines, language);

			case 'java':
			case 'csharp':
			case 'cpp':
			case 'c':
				return this.chunkCLike(uri, content, lines, language);

			case 'go':
				return this.chunkGo(uri, content, lines, language);

			case 'rust':
				return this.chunkRust(uri, content, lines, language);

			default:
				// 默认策略：按行数分块
				return this.chunkByLines(uri, content, lines, language);
		}
	}

	/**
	 * TypeScript/JavaScript 分块策略
	 */
	private chunkTypeScript(uri: URI, content: string, lines: string[], language: string): CodeChunk[] {
		const chunks: CodeChunk[] = [];
		const path = uri.fsPath;

		// 正则表达式匹配各种声明
		const patterns = {
			// 函数声明
			function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
			// 箭头函数
			arrowFunction: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
			// 类声明
			class: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
			// 接口声明
			interface: /^(?:export\s+)?interface\s+(\w+)/,
			// 类型声明
			type: /^(?:export\s+)?type\s+(\w+)/,
			// 枚举声明
			enum: /^(?:export\s+)?enum\s+(\w+)/,
		};

		let currentChunk: Partial<CodeChunk> | null = null;
		let braceCount = 0;
		let chunkContent: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			// 检查是否开始新的声明
			if (!currentChunk) {
				for (const [type, pattern] of Object.entries(patterns)) {
					const match = trimmedLine.match(pattern);
					if (match) {
						currentChunk = {
							id: this.generateId(),
							uri,
							path,
							type: this.mapTypeToChunkType(type),
							name: match[1],
							startLine: i + 1,
							language,
							lastModified: Date.now()
						};
						braceCount = 0;
						chunkContent = [];
						break;
					}
				}
			}

			// 如果在块中，收集内容
			if (currentChunk) {
				chunkContent.push(line);

				// 计算大括号
				for (const char of line) {
					if (char === '{') braceCount++;
					if (char === '}') braceCount--;
				}

				// 块结束
				if (braceCount === 0 && chunkContent.length > 0 && line.includes('}')) {
					const content = chunkContent.join('\n');
					if (content.length >= this.config.minChunkSize) {
						chunks.push({
							...currentChunk,
							content: this.truncateContent(content),
							endLine: i + 1,
							signature: this.extractSignature(chunkContent[0])
						} as CodeChunk);
					}
					currentChunk = null;
					chunkContent = [];
				}
			}
		}

		// 如果没有找到结构化的块，按行分块
		if (chunks.length === 0) {
			return this.chunkByLines(uri, content, lines, language);
		}

		return chunks;
	}

	/**
	 * Python 分块策略
	 */
	private chunkPython(uri: URI, content: string, lines: string[], language: string): CodeChunk[] {
		const chunks: CodeChunk[] = [];
		const path = uri.fsPath;

		const patterns = {
			function: /^(?:async\s+)?def\s+(\w+)\s*\(/,
			class: /^class\s+(\w+)/,
		};

		let currentChunk: Partial<CodeChunk> | null = null;
		let baseIndent = 0;
		let chunkContent: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();
			const indent = line.length - line.trimStart().length;

			// 检查是否开始新的声明
			if (!currentChunk || (indent <= baseIndent && trimmedLine.length > 0)) {
				// 保存之前的块
				if (currentChunk && chunkContent.length > 0) {
					const content = chunkContent.join('\n');
					if (content.length >= this.config.minChunkSize) {
						chunks.push({
							...currentChunk,
							content: this.truncateContent(content),
							endLine: i
						} as CodeChunk);
					}
				}

				currentChunk = null;

				for (const [type, pattern] of Object.entries(patterns)) {
					const match = trimmedLine.match(pattern);
					if (match) {
						currentChunk = {
							id: this.generateId(),
							uri,
							path,
							type: this.mapTypeToChunkType(type),
							name: match[1],
							startLine: i + 1,
							language,
							lastModified: Date.now()
						};
						baseIndent = indent;
						chunkContent = [line];
						break;
					}
				}
			} else if (currentChunk) {
				chunkContent.push(line);
			}
		}

		// 保存最后一个块
		if (currentChunk && chunkContent.length > 0) {
			const content = chunkContent.join('\n');
			if (content.length >= this.config.minChunkSize) {
				chunks.push({
					...currentChunk,
					content: this.truncateContent(content),
					endLine: lines.length
				} as CodeChunk);
			}
		}

		if (chunks.length === 0) {
			return this.chunkByLines(uri, content, lines, language);
		}

		return chunks;
	}

	/**
	 * C-like 语言分块策略 (Java, C#, C++, C)
	 */
	private chunkCLike(uri: URI, content: string, lines: string[], language: string): CodeChunk[] {
		// 使用与 TypeScript 类似的大括号匹配策略
		return this.chunkTypeScript(uri, content, lines, language);
	}

	/**
	 * Go 分块策略
	 */
	private chunkGo(uri: URI, content: string, lines: string[], language: string): CodeChunk[] {
		const chunks: CodeChunk[] = [];
		const path = uri.fsPath;

		const patterns = {
			function: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/,
			type: /^type\s+(\w+)\s+(?:struct|interface)/,
		};

		let currentChunk: Partial<CodeChunk> | null = null;
		let braceCount = 0;
		let chunkContent: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			if (!currentChunk) {
				for (const [type, pattern] of Object.entries(patterns)) {
					const match = trimmedLine.match(pattern);
					if (match) {
						currentChunk = {
							id: this.generateId(),
							uri,
							path,
							type: this.mapTypeToChunkType(type),
							name: match[1],
							startLine: i + 1,
							language,
							lastModified: Date.now()
						};
						braceCount = 0;
						chunkContent = [];
						break;
					}
				}
			}

			if (currentChunk) {
				chunkContent.push(line);

				for (const char of line) {
					if (char === '{') braceCount++;
					if (char === '}') braceCount--;
				}

				if (braceCount === 0 && chunkContent.length > 0 && line.includes('}')) {
					const content = chunkContent.join('\n');
					if (content.length >= this.config.minChunkSize) {
						chunks.push({
							...currentChunk,
							content: this.truncateContent(content),
							endLine: i + 1
						} as CodeChunk);
					}
					currentChunk = null;
					chunkContent = [];
				}
			}
		}

		if (chunks.length === 0) {
			return this.chunkByLines(uri, content, lines, language);
		}

		return chunks;
	}

	/**
	 * Rust 分块策略
	 */
	private chunkRust(uri: URI, content: string, lines: string[], language: string): CodeChunk[] {
		const chunks: CodeChunk[] = [];
		const path = uri.fsPath;

		const patterns = {
			function: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
			struct: /^(?:pub\s+)?struct\s+(\w+)/,
			impl: /^impl(?:<[^>]+>)?\s+(\w+)/,
			trait: /^(?:pub\s+)?trait\s+(\w+)/,
		};

		let currentChunk: Partial<CodeChunk> | null = null;
		let braceCount = 0;
		let chunkContent: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			if (!currentChunk) {
				for (const [type, pattern] of Object.entries(patterns)) {
					const match = trimmedLine.match(pattern);
					if (match) {
						currentChunk = {
							id: this.generateId(),
							uri,
							path,
							type: type === 'struct' ? CodeChunkType.Class : this.mapTypeToChunkType(type),
							name: match[1],
							startLine: i + 1,
							language,
							lastModified: Date.now()
						};
						braceCount = 0;
						chunkContent = [];
						break;
					}
				}
			}

			if (currentChunk) {
				chunkContent.push(line);

				for (const char of line) {
					if (char === '{') braceCount++;
					if (char === '}') braceCount--;
				}

				if (braceCount === 0 && chunkContent.length > 0 && line.includes('}')) {
					const content = chunkContent.join('\n');
					if (content.length >= this.config.minChunkSize) {
						chunks.push({
							...currentChunk,
							content: this.truncateContent(content),
							endLine: i + 1
						} as CodeChunk);
					}
					currentChunk = null;
					chunkContent = [];
				}
			}
		}

		if (chunks.length === 0) {
			return this.chunkByLines(uri, content, lines, language);
		}

		return chunks;
	}

	/**
	 * 按行数分块（默认策略）
	 */
	private chunkByLines(uri: URI, content: string, lines: string[], language: string): CodeChunk[] {
		const chunks: CodeChunk[] = [];
		const path = uri.fsPath;
		const chunkSize = 50; // 每块 50 行

		for (let i = 0; i < lines.length; i += chunkSize) {
			const chunkLines = lines.slice(i, Math.min(i + chunkSize, lines.length));
			const chunkContent = chunkLines.join('\n');

			if (chunkContent.trim().length >= this.config.minChunkSize) {
				chunks.push({
					id: this.generateId(),
					uri,
					path,
					type: CodeChunkType.Snippet,
					content: this.truncateContent(chunkContent),
					startLine: i + 1,
					endLine: Math.min(i + chunkSize, lines.length),
					language,
					lastModified: Date.now()
				});
			}
		}

		return chunks;
	}

	/**
	 * 生成唯一 ID
	 */
	private generateId(): string {
		return `chunk_${Date.now()}_${this.chunkIdCounter++}`;
	}

	/**
	 * 截断内容
	 */
	private truncateContent(content: string): string {
		if (content.length <= this.config.maxChunkSize) {
			return content;
		}
		return content.slice(0, this.config.maxChunkSize) + '\n// ... (truncated)';
	}

	/**
	 * 提取签名
	 */
	private extractSignature(firstLine: string): string {
		return firstLine.trim().slice(0, 100);
	}

	/**
	 * 映射类型
	 */
	private mapTypeToChunkType(type: string): CodeChunkType {
		const mapping: Record<string, CodeChunkType> = {
			'function': CodeChunkType.Function,
			'arrowFunction': CodeChunkType.Function,
			'class': CodeChunkType.Class,
			'interface': CodeChunkType.Interface,
			'type': CodeChunkType.Type,
			'enum': CodeChunkType.Type,
			'struct': CodeChunkType.Class,
			'impl': CodeChunkType.Class,
			'trait': CodeChunkType.Interface,
		};
		return mapping[type] || CodeChunkType.Snippet;
	}
}
