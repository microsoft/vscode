/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hashTelemetryValue } from '../../../util/node/crypto';
import {
	EditOperationType,
	FILE_TOOL_NAMES,
	GitHubCopilotAttr,
	SHELL_TOOL_NAMES,
	TOOL_PARAM_COMMAND_MAX_LEN,
} from '../common/genAiAttributes';

/**
 * Result of extracting structured parameter attributes from a tool invocation.
 * `gatedAttrs` are content-sensitive (raw paths, command text, MCP server
 * names) and must only be emitted when `captureContent` is enabled. `attrs`
 * are always safe (e.g. SHA-256 hashes, fixed enums).
 */
export interface ToolParameterAttributes {
	attrs: Record<string, string>;
	gatedAttrs: Record<string, string>;
}

/**
 * Produces structured `github.copilot.tool.parameters.*` attributes for shell,
 * file, skill, and MCP tool calls. `gatedAttrs` are content-sensitive (raw
 * paths, commands, MCP server names) and emit only when `captureContent` is
 * enabled; `attrs` are always safe (hashes, fixed enums).
 */
export function extractToolParameters(toolName: string, input: unknown): ToolParameterAttributes {
	const attrs: Record<string, string> = {};
	const gatedAttrs: Record<string, string> = {};

	if (typeof input !== 'object' || input === null) {
		return { attrs, gatedAttrs };
	}
	const obj = input as Record<string, unknown>;

	if (SHELL_TOOL_NAMES.has(toolName)) {
		const command = pickFirstString(obj, ['command', 'cmd', 'commandLine']);
		if (command) {
			gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_COMMAND] =
				command.length > TOOL_PARAM_COMMAND_MAX_LEN
					? command.slice(0, TOOL_PARAM_COMMAND_MAX_LEN)
					: command;
		}
	}

	if (FILE_TOOL_NAMES.has(toolName)) {
		const filePath = pickFirstString(obj, ['file_path', 'filePath', 'path', 'uri']);
		if (filePath) {
			gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_FILE_PATH] = filePath;
		}
		const editType = classifyEditType(toolName, obj);
		if (editType) {
			attrs[GitHubCopilotAttr.TOOL_PARAM_EDIT_TYPE] = editType;
		}
	}

	const skillName = pickFirstString(obj, ['skill_name', 'skillName', 'skill']);
	if (skillName) {
		attrs[GitHubCopilotAttr.TOOL_PARAM_SKILL_NAME] = skillName;
	}

	// MCP-style tool names: VS Code emits `mcp_<server>_<tool>`; Anthropic-style
	// references use `mcp__<server>__<tool>`. Accept both.
	if (toolName.startsWith('mcp__')) {
		const rest = toolName.slice('mcp__'.length);
		const sep = rest.indexOf('__');
		if (sep > 0) {
			const serverName = rest.slice(0, sep);
			const mcpToolName = rest.slice(sep + 2);
			attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME_HASH] = hashTelemetryValue(serverName);
			attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_TOOL_NAME] = mcpToolName;
			gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME] = serverName;
		}
	} else if (toolName.startsWith('mcp_')) {
		const rest = toolName.slice('mcp_'.length);
		const underscore = rest.indexOf('_');
		if (underscore > 0) {
			const serverName = rest.slice(0, underscore);
			const mcpToolName = rest.slice(underscore + 1);
			attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME_HASH] = hashTelemetryValue(serverName);
			attrs[GitHubCopilotAttr.TOOL_PARAM_MCP_TOOL_NAME] = mcpToolName;
			gatedAttrs[GitHubCopilotAttr.TOOL_PARAM_MCP_SERVER_NAME] = serverName;
		}
	}

	return { attrs, gatedAttrs };
}

function pickFirstString(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
	for (const k of keys) {
		const v = obj[k];
		if (typeof v === 'string' && v.length > 0) {
			return v;
		}
	}
	return undefined;
}

function classifyEditType(toolName: string, obj: Record<string, unknown>): EditOperationType | undefined {
	if (toolName === 'create' || toolName === 'createFile' || toolName === 'create_file' || toolName === 'Write') {
		return 'create';
	}
	if (toolName === 'insert') {
		return 'insert';
	}
	if (
		toolName === 'str_replace' ||
		toolName === 'str_replace_editor' ||
		toolName === 'replaceString' ||
		toolName === 'replace_string_in_file' ||
		toolName === 'multi_replace_string_in_file' ||
		toolName === 'Edit' ||
		toolName === 'MultiEdit'
	) {
		return 'str_replace';
	}
	if (
		toolName === 'edit' ||
		toolName === 'applyPatch' ||
		toolName === 'apply_patch' ||
		toolName === 'insert_edit_into_file' ||
		toolName === 'edit_notebook_file' ||
		toolName === 'NotebookEdit'
	) {
		return 'update';
	}
	// `view`/`readFile`/`read_file`/`Read` have no edit_type.
	if (toolName === 'view' || toolName === 'readFile' || toolName === 'read_file' || toolName === 'Read') {
		return undefined;
	}
	// Fallback: heuristic on common arg names.
	if (typeof obj.old_str === 'string' || typeof obj.oldString === 'string') {
		return 'str_replace';
	}
	if (typeof obj.content === 'string' && typeof obj.file_text === 'undefined') {
		return 'update';
	}
	return undefined;
}
