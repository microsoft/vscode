/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { terminalOutputContent, terminalOutputPreview, existingTerminalOutput } from '../shared/terminalOutputArtifacts.js';
import type { ToolResultTerminalContent } from '../../common/state/protocol/state.js';
import type { ISessionDatabase } from '../../common/sessionDataService.js';

export interface IClaudeTerminalOutputRecord {
	readonly preview?: string;
	readonly persistedOutputPath: string;
}

const CLAUDE_TERMINAL_OUTPUTS_METADATA_KEY = 'claude.terminalOutputs';

interface IClaudeBashOutput {
	readonly stdout: string;
	readonly stderr: string;
	readonly persistedOutputPath: string;
}

function asClaudeBashOutput(value: unknown): IClaudeBashOutput | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as Partial<IClaudeBashOutput>;
	if (typeof candidate.stdout !== 'string' || typeof candidate.stderr !== 'string' || typeof candidate.persistedOutputPath !== 'string') {
		return undefined;
	}
	return candidate as IClaudeBashOutput;
}

function asClaudeTerminalOutputRecord(value: unknown): IClaudeTerminalOutputRecord | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as Partial<IClaudeTerminalOutputRecord>;
	if ((candidate.preview !== undefined && typeof candidate.preview !== 'string') || typeof candidate.persistedOutputPath !== 'string') {
		return undefined;
	}
	return candidate as IClaudeTerminalOutputRecord;
}

function getClaudeStructuredToolResult(message: unknown): unknown {
	if (!message || typeof message !== 'object') {
		return undefined;
	}
	const candidate = message as { readonly tool_use_result?: unknown; readonly toolUseResult?: unknown };
	return candidate.tool_use_result ?? candidate.toolUseResult;
}

export function getClaudeTerminalOutputRecord(message: unknown): IClaudeTerminalOutputRecord | undefined {
	const output = asClaudeBashOutput(getClaudeStructuredToolResult(message));
	return output ? {
		preview: terminalOutputPreview(output.stdout, output.stderr),
		persistedOutputPath: output.persistedOutputPath,
	} : undefined;
}

export function getClaudeToolResultId(message: unknown): string | undefined {
	if (!message || typeof message !== 'object') {
		return undefined;
	}
	const content = (message as { readonly message?: { readonly content?: unknown } }).message?.content;
	if (!Array.isArray(content)) {
		return undefined;
	}
	const toolResultIds = content
		.filter((block): block is { readonly type: 'tool_result'; readonly tool_use_id: string } =>
			!!block
			&& typeof block === 'object'
			&& (block as { readonly type?: unknown }).type === 'tool_result'
			&& typeof (block as { readonly tool_use_id?: unknown }).tool_use_id === 'string')
		.map(block => block.tool_use_id);
	return toolResultIds.length === 1 ? toolResultIds[0] : undefined;
}

export async function persistClaudeTerminalOutput(db: ISessionDatabase, toolCallId: string, output: IClaudeTerminalOutputRecord): Promise<void> {
	const outputs = await readClaudeTerminalOutputRecords(db);
	outputs.set(toolCallId, output);
	await writeClaudeTerminalOutputRecords(db, outputs);
}

export async function writeClaudeTerminalOutputRecords(db: ISessionDatabase, outputs: ReadonlyMap<string, IClaudeTerminalOutputRecord>): Promise<void> {
	await db.setMetadata(CLAUDE_TERMINAL_OUTPUTS_METADATA_KEY, JSON.stringify(Object.fromEntries(outputs)));
}

export async function readClaudeTerminalOutputRecords(db: ISessionDatabase): Promise<Map<string, IClaudeTerminalOutputRecord>> {
	const raw = await db.getMetadata(CLAUDE_TERMINAL_OUTPUTS_METADATA_KEY);
	if (!raw) {
		return new Map();
	}
	const parsed: unknown = JSON.parse(raw);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`Invalid ${CLAUDE_TERMINAL_OUTPUTS_METADATA_KEY} metadata`);
	}
	const outputs = new Map<string, IClaudeTerminalOutputRecord>();
	for (const [toolCallId, value] of Object.entries(parsed)) {
		const output = asClaudeTerminalOutputRecord(value);
		if (!output) {
			throw new Error(`Invalid terminal output metadata for Claude tool call ${toolCallId}`);
		}
		outputs.set(toolCallId, output);
	}
	return outputs;
}

export function createClaudeTerminalOutput(options: {
	readonly message?: unknown;
	readonly persistedOutput?: IClaudeTerminalOutputRecord;
	readonly toolName: string;
	readonly session: URI;
	readonly toolCallId: string;
	readonly title: string;
}): ToolResultTerminalContent | undefined {
	if (options.toolName !== 'Bash' && options.toolName !== 'BashOutput') {
		return undefined;
	}
	const output = options.persistedOutput ?? getClaudeTerminalOutputRecord(options.message);
	if (!output) {
		return undefined;
	}
	const retained = existingTerminalOutput({
		path: output.persistedOutputPath,
		preview: output.preview,
	});
	return terminalOutputContent(options.session, options.toolCallId, options.title, retained.result);
}
