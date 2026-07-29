/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { URI } from '../../../util/vs/base/common/uri';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { extractSessionId } from './memoryTool';

const MEMORY_BASE_DIR = 'memory-tool/memories';

interface IResolveMemoryFileUriParams {
	readonly path: string;
}

export class ResolveMemoryFileUriTool implements ICopilotTool<IResolveMemoryFileUriParams> {
	public static toolName = ToolName.ResolveMemoryFileUri;

	constructor(
		@IVSCodeExtensionContext private readonly _extensionContext: vscode.ExtensionContext,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IResolveMemoryFileUriParams>, _token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const memoryPath = options.input.path;
		if (!memoryPath || !memoryPath.startsWith('/memories/')) {
			throw new Error('Path must start with /memories/');
		}
		if (memoryPath.includes('..')) {
			throw new Error('Path traversal is not allowed');
		}

		const segments = memoryPath.split('/').filter(s => s.length > 0);
		const sessionResource = options.chatSessionResource?.toString();

		let resolved: URI;

		if (memoryPath.startsWith('/memories/session/') || memoryPath === '/memories/session') {
			const storageUri = this._extensionContext.storageUri;
			if (!storageUri) {
				throw new Error('No workspace storage available');
			}
			const relativeSegments = segments.slice(2);
			const baseUri = URI.from(storageUri);
			if (sessionResource) {
				const sessionId = extractSessionId(sessionResource);
				resolved = URI.joinPath(baseUri, MEMORY_BASE_DIR, sessionId, ...relativeSegments);
			} else {
				resolved = URI.joinPath(baseUri, MEMORY_BASE_DIR, ...relativeSegments);
			}
		} else if (memoryPath.startsWith('/memories/repo/') || memoryPath === '/memories/repo') {
			const storageUri = this._extensionContext.storageUri;
			if (!storageUri) {
				throw new Error('No workspace storage available');
			}
			const relativeSegments = segments.slice(2);
			resolved = URI.joinPath(URI.from(storageUri), MEMORY_BASE_DIR, 'repo', ...relativeSegments);
		} else {
			const globalStorageUri = this._extensionContext.globalStorageUri;
			if (!globalStorageUri) {
				throw new Error('No global storage available');
			}
			const relativeSegments = segments.slice(1);
			resolved = URI.joinPath(globalStorageUri, MEMORY_BASE_DIR, ...relativeSegments);
		}

		return new LanguageModelToolResult([new LanguageModelTextPart(resolved.toString())]);
	}
}

ToolRegistry.registerTool(ResolveMemoryFileUriTool);
