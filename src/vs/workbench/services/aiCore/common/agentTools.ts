/*---------------------------------------------------------------------------------------------
 *  AI Core Agent Tools System
 *  类似 Cursor 的 Agent 工具系统
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

// ============================================================================
// Tool Definition Types
// ============================================================================

export interface AgentTool {
	name: string;
	description: string;
	parameters: AgentToolParameter[];
	execute: (args: Record<string, unknown>) => Promise<AgentToolResult>;
}

export interface AgentToolParameter {
	name: string;
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description: string;
	required: boolean;
	enum?: string[];
}

export interface AgentToolResult {
	success: boolean;
	output?: string;
	error?: string;
	data?: unknown;
	// 用于文件修改的 diff 信息
	fileChanges?: FileChange[];
}

export interface FileChange {
	uri: URI;
	originalContent: string;
	newContent: string;
	description: string;
	applied: boolean;
}

// ============================================================================
// Tool Call Types (GLM Function Calling)
// ============================================================================

export interface ToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string; // JSON string
	};
}

export interface ToolCallResult {
	toolCallId: string;
	result: AgentToolResult;
}

// ============================================================================
// Agent Session State
// ============================================================================

export interface AgentSession {
	id: string;
	tools: AgentTool[];
	pendingChanges: FileChange[];
	executedCommands: CommandExecution[];
	conversationHistory: AgentMessage[];
}

export interface AgentMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	toolCalls?: ToolCall[];
	toolCallId?: string;
}

export interface CommandExecution {
	command: string;
	cwd: string;
	output: string;
	exitCode: number;
	timestamp: number;
}

// ============================================================================
// GLM Tools Format (智谱 AI 函数调用格式)
// ============================================================================

export function toGLMToolsFormat(tools: AgentTool[]): object[] {
	return tools.map(tool => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: {
				type: 'object',
				properties: Object.fromEntries(
					tool.parameters.map(p => [
						p.name,
						{
							type: p.type,
							description: p.description,
							...(p.enum ? { enum: p.enum } : {})
						}
					])
				),
				required: tool.parameters.filter(p => p.required).map(p => p.name)
			}
		}
	}));
}

// ============================================================================
// Default Agent Tools
// ============================================================================

export const AGENT_TOOL_NAMES = {
	READ_FILE: 'read_file',
	WRITE_FILE: 'write_file',
	SEARCH_FILES: 'search_files',
	LIST_DIR: 'list_dir',
	RUN_COMMAND: 'run_command',
	GREP_SEARCH: 'grep_search',
	GET_DIAGNOSTICS: 'get_diagnostics',
	// 网页访问工具
	BROWSE_URL: 'browse_url',
	WEB_SEARCH: 'web_search_deep',
} as const;

// ============================================================================
// Web Content Types
// ============================================================================

export interface WebPageContent {
	url: string;
	title: string;
	content: string;
	description?: string;
	links?: { text: string; href: string }[];
	images?: { alt: string; src: string }[];
	publishDate?: string;
	author?: string;
}
