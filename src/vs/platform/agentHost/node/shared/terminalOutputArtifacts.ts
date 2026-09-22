/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { hash } from '../../../../base/common/hash.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { ToolResultContentType, type TerminalCommandResult, type ToolResultTerminalContent } from '../../common/state/protocol/state.js';
import { buildNonPtyShellTerminalUri } from './nonPtyShellTerminal.js';

export const TERMINAL_OUTPUT_PREVIEW_CHARACTER_LIMIT = 500;
export const TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES = 20 * 1024;

export function shouldPersistTerminalOutput(output: string): boolean {
	return VSBuffer.fromString(output).byteLength > TERMINAL_OUTPUT_ARTIFACT_THRESHOLD_BYTES;
}

export function terminalOutputPreview(...parts: readonly (string | undefined)[]): string | undefined {
	const output = parts.filter((part): part is string => !!part).join('\n');
	return output ? output.slice(0, TERMINAL_OUTPUT_PREVIEW_CHARACTER_LIMIT) : undefined;
}

export function terminalOutputContent(session: URI | string, toolCallId: string, title: string, result: TerminalCommandResult): ToolResultTerminalContent {
	return {
		type: ToolResultContentType.Terminal,
		resource: buildNonPtyShellTerminalUri(session, toolCallId),
		title,
		isPty: false,
		result,
	};
}

export interface IRetainedTerminalOutput {
	readonly result: TerminalCommandResult;
	readonly artifact: URI;
}

export function existingTerminalOutput(options: {
	readonly path: string;
	readonly preview?: string;
	readonly exitCode?: number;
}): IRetainedTerminalOutput {
	return {
		result: {
			...(options.exitCode !== undefined ? { exitCode: options.exitCode } : {}),
			...(options.preview !== undefined ? { preview: options.preview } : {}),
			truncated: true,
		},
		artifact: URI.file(options.path),
	};
}

export async function persistTerminalOutput(options: {
	readonly owner: URI;
	readonly toolCallId: string;
	readonly output: string;
	readonly exitCode?: number;
}, sessionDataService: ISessionDataService, fileService: IFileService): Promise<IRetainedTerminalOutput> {
	const directory = URI.joinPath(sessionDataService.getSessionDataDir(options.owner), 'terminal-output');
	const name = `${(hash(options.toolCallId) >>> 0).toString(36)}.txt`;
	const resource = URI.joinPath(directory, name);
	await fileService.createFolder(directory);
	const bytes = VSBuffer.fromString(options.output);
	await fileService.writeFile(resource, bytes);
	return {
		result: {
			...(options.exitCode !== undefined ? { exitCode: options.exitCode } : {}),
			preview: terminalOutputPreview(options.output),
			truncated: true,
		},
		artifact: resource,
	};
}
