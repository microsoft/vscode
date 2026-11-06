/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import type { ILogService } from '../../../../platform/log/common/logService';
import type { IToolDeferralService } from '../../../../platform/networking/common/toolDeferralService';
import type { IToolEmbeddingsComputer } from '../../common/virtualTools/toolEmbeddingsComputer';
import type { IToolsService } from '../../common/toolsService';
import { ToolSearchTool } from '../toolSearchTool';

function text(result: vscode.LanguageModelToolResult): string {
	return result.content.map(part => {
		const value = part as { value?: unknown };
		return value.value === undefined ? '' : String(value.value);
	}).join('');
}

describe('ToolSearchTool', () => {
	it('uses an injected Agent Host corpus instead of the extension registry', async () => {
		const searchToolsByQuery = vi.fn(async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => tools.map(tool => tool.name));
		const embeddings = { _serviceBrand: undefined, searchToolsByQuery } as unknown as IToolEmbeddingsComputer;
		const toolsService = {
			_serviceBrand: undefined,
			tools: [{ name: 'extension-only', description: 'Extension tool', inputSchema: undefined, tags: [], source: undefined }],
		} as unknown as IToolsService;
		const deferral = { _serviceBrand: undefined, isNonDeferredTool: () => false } as IToolDeferralService;
		const log = { _serviceBrand: undefined, trace: vi.fn() } as unknown as ILogService;
		const tool = new ToolSearchTool(embeddings, toolsService, deferral, log);

		const result = await tool.invoke({
			input: {
				query: 'add numbers',
				candidateTools: [{ name: 'everything-get-sum', description: 'Adds numbers' }],
			},
			toolInvocationToken: undefined,
		} as vscode.LanguageModelToolInvocationOptions<any>, CancellationToken.None);

		expect(searchToolsByQuery).toHaveBeenCalledOnce();
		expect(searchToolsByQuery.mock.calls[0][1].map(tool => tool.name)).toEqual(['everything-get-sum']);
		expect(text(result)).toBe('["everything-get-sum"]');
	});

	it('preserves the extension registry path when no corpus is injected', async () => {
		const searchToolsByQuery = vi.fn(async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => tools.map(tool => tool.name));
		const embeddings = { _serviceBrand: undefined, searchToolsByQuery } as unknown as IToolEmbeddingsComputer;
		const toolsService = {
			_serviceBrand: undefined,
			tools: [
				{ name: 'deferred-extension-tool', description: 'Deferred', inputSchema: undefined, tags: [], source: undefined },
				{ name: 'core-tool', description: 'Core', inputSchema: undefined, tags: [], source: undefined },
			],
		} as unknown as IToolsService;
		const deferral = { _serviceBrand: undefined, isNonDeferredTool: (name: string) => name === 'core-tool' } as IToolDeferralService;
		const log = { _serviceBrand: undefined, trace: vi.fn() } as unknown as ILogService;
		const tool = new ToolSearchTool(embeddings, toolsService, deferral, log);

		await tool.invoke({ input: { query: 'deferred' }, toolInvocationToken: undefined } as vscode.LanguageModelToolInvocationOptions<any>, CancellationToken.None);

		expect(searchToolsByQuery.mock.calls[0][1].map(tool => tool.name)).toEqual(['deferred-extension-tool']);
	});
});
