/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import type { ToolCall } from '../backend/agent';
import { readFileTool } from './readFile';
import { grepTool } from './grep';
import { listFilesTool } from './listFiles';
import { writeFileTool } from './writeFile';
import { applyPatchTool, insertLinesTool } from './applyPatch';

export interface ToolResult {
	success: boolean;
	data?: any;
	error?: string;
	truncated?: boolean;
}

export interface ExecutedToolCall {
	id: string;
	name: string;
	result: ToolResult;
}

/**
 * Execute tool calls from the agent.
 * File-based tools run here in the extension (have filesystem access).
 * search_codebase is pre-executed on backend (has Memvid access).
 */
export async function executeToolCalls(
	toolCalls: ToolCall[],
	workspaceRoot: string
): Promise<ExecutedToolCall[]> {
	const results: ExecutedToolCall[] = [];

	for (const tc of toolCalls) {
		const args = tc.arguments;

		// Check if already executed on backend (search_codebase)
		if (args._executed && args._result) {
			results.push({
				id: tc.id,
				name: tc.name,
				result: args._result as ToolResult
			});
			continue;
		}

		let result: ToolResult;

		try {
			switch (tc.name) {
				case 'read_file':
					result = await readFileTool(
						workspaceRoot,
						args.path,
						args.start_line,
						args.end_line
					);
					break;

				case 'grep':
					result = await grepTool(
						workspaceRoot,
						args.pattern,
						args.glob || '**/*',
						args.max_results || 20
					);
					break;

				case 'list_files':
					result = await listFilesTool(
						workspaceRoot,
						args.glob || '**/*',
						args.max_results || 50
					);
					break;

				case 'write_file':
					result = await writeFileTool(
						workspaceRoot,
						args.path,
						args.content,
						true
					);
					break;

				case 'apply_patch':
					result = await applyPatchTool(
						workspaceRoot,
						args.path,
						args.old_text,
						args.new_text,
						true
					);
					break;

				case 'insert_lines':
					result = await insertLinesTool(
						workspaceRoot,
						args.path,
						args.line_number,
						args.lines,
						true
					);
					break;

				default:
					result = {
						success: false,
						error: `Unknown tool: ${tc.name}`
					};
			}
		} catch (err) {
			result = {
				success: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}

		results.push({
			id: tc.id,
			name: tc.name,
			result
		});
	}

	return results;
}

/**
 * Format tool results as messages for the next agent turn.
 */
export function formatToolResultsAsMessages(
	executedCalls: ExecutedToolCall[]
): Array<{ role: 'tool'; tool_call_id: string; name: string; content: string }> {
	return executedCalls.map(ec => ({
		role: 'tool' as const,
		tool_call_id: ec.id,
		name: ec.name,
		content: JSON.stringify(ec.result)
	}));
}
