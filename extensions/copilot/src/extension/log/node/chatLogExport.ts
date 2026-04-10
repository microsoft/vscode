/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LoggedInfo, LoggedInfoKind } from '../../../platform/requestLogger/node/requestLogger';

/**
 * Type for a log entry in an exported chat log file.
 * These types correspond to LoggedInfoKind from the request logger.
 */
type ExportedLogKind = 'element' | 'request' | 'toolCall' | 'error';

/**
 * Metadata attached to request entries.
 */
interface ExportedLogMetadata {
	model?: string;
	duration?: number;
	startTime?: string;
	endTime?: string;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
}

/**
 * Exported log entry from a chat log export file.
 * This is the serialized form of LoggedInfo.
 */
interface ExportedLogEntry {
	id: string;
	kind: ExportedLogKind;
	/** Name of the element or request */
	name?: string;
	/** Tool name for tool call entries */
	tool?: string;
	/** Request type (e.g., 'ChatMLSuccess', 'ChatMLFailure', 'MarkdownContentRequest') */
	type?: string;
	/** Token count for element entries */
	tokens?: number;
	/** Max tokens for element entries */
	maxTokens?: number;
	/** Arguments for tool call entries */
	args?: Record<string, unknown>;
	/** Response from tool or model */
	response?: object;
	/** Markdown content for MarkdownContentRequest entries - displayed directly to user */
	content?: string;
	/** Metadata for request entries */
	metadata?: ExportedLogMetadata;
	/** Raw request messages */
	requestMessages?: {
		messages?: unknown[];
	};
	/** Timestamp */
	time?: string;
	/** Thinking content for reasoning models */
	thinking?: {
		id?: string;
		text?: string;
	};
	/** Error message for error entries */
	error?: string;
	/** Timestamp for when the entry occurred */
	timestamp?: string;
}

/**
 * Structure of an exported prompt in a chat log export file.
 * Each prompt represents a user query and its associated log entries.
 */
export interface ExportedPrompt {
	/** The user's prompt text */
	prompt: string;
	/** Unique identifier for the prompt */
	promptId?: string;
	/** Whether this is a continuation of a previous conversation */
	hasSeen?: boolean;
	/** Number of log entries in this prompt */
	logCount: number;
	/** The log entries for this prompt */
	logs: ExportedLogEntry[];
}

/**
 * Root structure of a chat log export file.
 */
export interface ChatLogExport {
	/** ISO timestamp of when the export was created */
	exportedAt: string;
	/** Total number of prompts in the export */
	totalPrompts: number;
	/** Total number of log entries across all prompts */
	totalLogEntries: number;
	/** Array of exported prompts */
	prompts: ExportedPrompt[];
	/** MCP server definitions active during the session */
	mcpServers?: object[];
}

/**
 * Converts a single log entry to its JSON representation.
 * Handles async toJSON methods for tool calls.
 */
async function entryToJson(entry: LoggedInfo): Promise<object> {
	if (entry.kind === LoggedInfoKind.ToolCall) {
		// Tool calls have async toJSON
		return await (entry as { toJSON(): Promise<object> }).toJSON();
	} else {
		// Elements and requests have sync toJSON
		return (entry as { toJSON(): object }).toJSON();
	}
}

/**
 * Creates an exported prompt from a collection of log entries.
 * Use this when entries are already grouped by prompt (e.g., from tree view).
 *
 * @param label - The prompt label
 * @param entries - The log entries for this prompt
 * @param options - Additional options
 * @returns The exported prompt structure
 */
export async function createExportedPrompt(
	label: string,
	entries: LoggedInfo[],
	options?: { promptId?: string; hasSeen?: boolean }
): Promise<ExportedPrompt> {
	const logs: ExportedLogEntry[] = [];
	for (const entry of entries) {
		try {
			logs.push(await entryToJson(entry) as ExportedLogEntry);
		} catch (error) {
			logs.push({
				id: entry.id,
				kind: 'error',
				error: error?.toString() || 'Unknown error',
				timestamp: new Date().toISOString()
			} as unknown as ExportedLogEntry);
		}
	}

	return {
		prompt: label,
		promptId: options?.promptId,
		hasSeen: options?.hasSeen,
		logCount: logs.length,
		logs
	};
}

/**
 * Assembles a complete ChatLogExport from exported prompts.
 *
 * @param prompts - Array of exported prompts
 * @param mcpServers - Optional MCP server definitions
 * @returns The complete export structure
 */
export function assembleChatLogExport(
	prompts: ExportedPrompt[],
	mcpServers?: object[]
): ChatLogExport {
	const totalLogEntries = prompts.reduce((sum, p) => sum + p.logCount, 0);

	return {
		exportedAt: new Date().toISOString(),
		totalPrompts: prompts.length,
		totalLogEntries,
		prompts,
		mcpServers
	};
}

/**
 * Serializes a chat log export to a JSON string.
 */
export function serializeChatLogExport(exportData: ChatLogExport): string {
	return JSON.stringify(exportData, null, 2);
}
