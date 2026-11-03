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
	it.each([0, 1, 1000])('only adds readable headers to the injected Agent Host search (%i matches)', async count => {
		const searchToolsByQuery = vi.fn(async (_query: string, tools: readonly vscode.LanguageModelToolInformation[]) => tools.map(tool => tool.name));
		const embeddings = { _serviceBrand: undefined, searchToolsByQuery } as unknown as IToolEmbeddingsComputer;
		const toolsService = {
			_serviceBrand: undefined,
			tools: [{ name: 'extension-only', description: 'Extension tool', inputSchema: undefined, tags: [], source: undefined }],
		} as unknown as IToolsService;
		const deferral = { _serviceBrand: undefined, isNonDeferredTool: () => false } as IToolDeferralService;
		const log = { _serviceBrand: undefined, trace: vi.fn() } as unknown as ILogService;
		const tool = new ToolSearchTool(embeddings, toolsService, deferral, log);
		const candidates = Array.from({ length: count }, (_, index) => ({ name: `tool_${index}`, description: `Tool ${index}` }));
		const query = 'Find\nGitHub tools ' + 'x'.repeat(1000);
		const prepared = tool.prepareInvocation({ input: { query } });

		const result = await tool.invoke({
			input: {
				query,
				candidateTools: candidates,
			},
			toolInvocationToken: undefined,
		} as vscode.LanguageModelToolInvocationOptions<any>, CancellationToken.None);

		expect(searchToolsByQuery).toHaveBeenCalledOnce();
		expect(searchToolsByQuery.mock.calls[0][1].map(tool => tool.name)).toEqual(candidates.map(tool => tool.name));
		const preview = 'Find GitHub tools ' + 'x'.repeat(59) + '...';
		const label = count === 0 ? 'No matching tools found' : count === 1 ? 'Found 1 tool' : 'Found 1000 tools';
		expect({
			invocation: prepared.invocationMessage,
			pastTense: prepared.pastTenseMessage,
			completed: result.toolResultMessage,
			content: text(result),
		}).toMatchObject({
			invocation: { value: `Searching tools for \`${preview}\`` },
			pastTense: { value: `Searched tools for \`${preview}\`` },
			completed: { value: `${label} for \`${preview}\`` },
			content: JSON.stringify(candidates.map(tool => tool.name)),
		});
		expect(searchToolsByQuery.mock.calls[0][0]).toBe(query);
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

		const query = '`[unsafe](command:run)`';
		const result = await tool.invoke({ input: { query }, toolInvocationToken: undefined } as vscode.LanguageModelToolInvocationOptions<any>, CancellationToken.None);

		expect(searchToolsByQuery.mock.calls[0][1].map(tool => tool.name)).toEqual(['deferred-extension-tool']);
		expect(result.toolResultMessage?.value).toBe('Found 1 tool for `` `[unsafe](command:run)` ``');
	});
});
