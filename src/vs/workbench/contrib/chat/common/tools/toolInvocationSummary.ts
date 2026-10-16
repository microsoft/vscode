/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { posix, win32 } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../chatService/chatService.js';

export interface IChatToolSummaryResource {
	readonly uri: URI;
}

/** Structured facts used for local tool-group summaries, including after history restoration. */
export type ChatToolInvocationSummary =
	| { readonly kind: 'incomplete' | 'unknown' | 'failed' | 'skipped' | 'denied' }
	| { readonly kind: 'read'; readonly resources: readonly IChatToolSummaryResource[] }
	| { readonly kind: 'search'; readonly queries: readonly string[]; readonly searchKind: 'text' | 'files' }
	| { readonly kind: 'command' }
	| { readonly kind: 'edit' | 'list' | 'diagnostics'; readonly resources: readonly IChatToolSummaryResource[] };

export function getToolInvocationSummary(invocation: IChatToolInvocation | IChatToolInvocationSerialized): ChatToolInvocationSummary | undefined {
	if (!IChatToolInvocation.isComplete(invocation) || invocation.kind === 'toolInvocationSerialized' && invocation.isComplete === false) {
		return { kind: 'incomplete' };
	}
	return invocation.summary;
}

/** Called at the agent-host boundary after validating native tool provenance and successful completion. */
export function getToolInvocationSummaryFromInput(toolId: string, input: unknown, mapResource: (uri: URI) => URI = uri => uri): ChatToolInvocationSummary | undefined {
	const resource = (value: unknown): IChatToolSummaryResource | undefined => {
		if (typeof value !== 'string' || !value) {
			return undefined;
		}
		let uri: URI;
		if (posix.isAbsolute(value)) {
			uri = URI.file(value);
		} else if (win32.isAbsolute(value)) {
			uri = URI.file(value.replaceAll('\\', '/'));
		} else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
			uri = URI.parse(value);
			if (uri.scheme !== Schemas.file && uri.scheme !== Schemas.vscodeRemote) {
				return undefined;
			}
		} else {
			return undefined;
		}
		return { uri: mapResource(uri) };
	};
	const file = () => resource(getProperty(input, 'filePath') ?? getProperty(input, 'file_path') ?? getProperty(input, 'path'));
	switch (toolId) {
		case 'copilot_readFile':
		case 'read_file': {
			// Requested ranges can be expanded or truncated by the tool.
			const target = file();
			return { kind: 'read', resources: target ? [target] : [] };
		}
		case 'view': {
			const target = file();
			const viewRange = getProperty(input, 'view_range');
			return target && Array.isArray(viewRange) && viewRange.length === 2 && Number.isSafeInteger(viewRange[0]) && viewRange[0] > 0
				&& Number.isSafeInteger(viewRange[1]) && (viewRange[1] === -1 || viewRange[1] >= viewRange[0])
				? { kind: 'read', resources: [target] } : undefined;
		}
		case 'copilot_findTextInFiles':
		case 'grep_search':
		case 'copilot_searchCodebase':
		case 'semantic_search':
		case 'grep':
		case 'rg':
		case 'copilot_findFiles':
		case 'file_search':
		case 'glob': {
			const query = getProperty(input, 'query') ?? getProperty(input, 'pattern');
			if (typeof query !== 'string' || !query.trim()) {
				return undefined;
			}
			return {
				kind: 'search',
				queries: [query],
				searchKind: toolId === 'copilot_findFiles' || toolId === 'file_search' || toolId === 'glob' ? 'files' : 'text',
			};
		}
		case 'run_in_terminal':
		case 'bash':
		case 'powershell':
		case 'shell': {
			const command = getProperty(input, 'command');
			return typeof command === 'string' && command.trim() ? { kind: 'command' } : undefined;
		}
		case 'copilot_listDirectory':
		case 'list_dir': {
			const target = file();
			return target ? { kind: 'list', resources: [target] } : undefined;
		}
		case 'copilot_getErrors':
		case 'get_errors': {
			const paths = getProperty(input, 'filePaths');
			if (!Array.isArray(paths) || paths.length === 0) {
				return undefined;
			}
			const resources = paths.map(resource);
			return resources.every(value => value !== undefined) ? { kind: 'diagnostics', resources } : undefined;
		}
		case 'copilot_applyPatch':
		case 'apply_patch':
			return { kind: 'edit', resources: [] };
		case 'copilot_replaceString':
		case 'replace_string_in_file':
		case 'copilot_insertEdit':
		case 'insert_edit_into_file':
		case 'copilot_createFile':
		case 'create_file':
		case 'edit': {
			const target = file();
			return target ? { kind: 'edit', resources: [target] } : undefined;
		}
		case 'vscode_editFile':
		case 'vscode_editFile_internal': {
			const target = resource(getProperty(input, 'uri'));
			return target ? { kind: 'edit', resources: [target] } : undefined;
		}
		case 'copilot_multiReplaceString':
		case 'multi_replace_string_in_file': {
			const replacements = getProperty(input, 'replacements');
			if (!Array.isArray(replacements) || replacements.length === 0) {
				return undefined;
			}
			const resources = replacements.map(replacement => resource(getProperty(replacement, 'filePath')));
			return resources.every(value => value !== undefined) ? { kind: 'edit', resources } : undefined;
		}
		default:
			return undefined;
	}
}

function getProperty(input: unknown, key: string): unknown {
	return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>)[key] : undefined;
}
