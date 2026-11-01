/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IImageResizeService } from '../../../../../platform/imageResize/common/imageResizeService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IToolResult, IToolResultInputOutputDetails } from '../../../chat/common/tools/languageModelToolsService.js';
import { McpToolImplementation } from '../../common/mcpLanguageModelToolContribution.js';
import { IMcpIcons, IMcpServer, IMcpTool, McpToolResourceLinkMimeType, McpToolVisibility } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';

suite('McpToolImplementation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const structuredContent = { rows: 3, table: 'orders' };

	test('sends text content to the model when structuredContent is present', async () => {
		const { result, details } = await invoke({
			content: [{ type: 'text', text: 'Found 3 rows in orders' }],
			structuredContent,
		});

		assert.deepStrictEqual(modelParts(result), ['text:Found 3 rows in orders']);
		assert.deepStrictEqual(details.output.map(o => o.type === 'embed' ? o.value : o.uri.toString()), [
			'Found 3 rows in orders',
			JSON.stringify(structuredContent, null, 2),
		]);
	});

	test('honors audience annotations on text content when structuredContent is present', async () => {
		const progress: string[] = [];
		const { result } = await invoke({
			content: [
				{ type: 'text', text: 'for the model', annotations: { audience: ['assistant'] } },
				{ type: 'text', text: 'for the user', annotations: { audience: ['user'] } },
			],
			structuredContent,
		}, { progress });

		assert.deepStrictEqual(modelParts(result), ['text:for the model']);
		assert.deepStrictEqual(progress, ['for the user']);
	});

	test('falls back to structuredContent when no content is for the model', async () => {
		const structuredOnly = await invoke({ content: [], structuredContent });
		assert.deepStrictEqual(modelParts(structuredOnly.result), [`text:${JSON.stringify(structuredContent)}`]);

		const userOnly = await invoke({
			content: [{ type: 'text', text: 'for the user', annotations: { audience: ['user'] } }],
			structuredContent,
		});
		assert.deepStrictEqual(modelParts(userOnly.result), [`text:${JSON.stringify(structuredContent)}`]);
	});

	test('does not send serialized structuredContent twice', async () => {
		const { result } = await invoke({
			content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
			structuredContent,
		});

		assert.deepStrictEqual(modelParts(result), [`text:${JSON.stringify(structuredContent)}`]);
	});

	test('keeps image and resource content and passes structuredContent to MCP Apps', async () => {
		const callResult: MCP.CallToolResult = {
			content: [
				{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' },
				{ type: 'resource_link', name: 'notes', uri: 'file:///notes.md', mimeType: 'text/markdown' },
				{ type: 'resource', resource: { uri: 'file:///data.csv', mimeType: 'text/csv', text: 'a,b' } },
			],
			structuredContent,
		};
		const { result, details } = await invoke(callResult, { uiResourceUri: 'ui://server/app.html' });

		assert.deepStrictEqual(modelParts(result), [
			'data:image/png',
			`data:${McpToolResourceLinkMimeType}`,
			`data:${McpToolResourceLinkMimeType}`,
		]);
		assert.strictEqual(details.mcpOutput, callResult);
	});
});

async function invoke(callResult: MCP.CallToolResult, options: { progress?: string[]; uiResourceUri?: string } = {}) {
	const tool: IMcpTool = {
		id: 'tool_query',
		referenceName: 'query',
		icons: {} as IMcpIcons,
		definition: { name: 'query', inputSchema: { type: 'object' } },
		visibility: McpToolVisibility.Model,
		uiResourceUri: options.uiResourceUri,
		call: async () => callResult,
		callWithProgress: async () => callResult,
	};
	const server = { definition: { id: 'server', label: 'Server' } } as IMcpServer;
	const imageResizeService: IImageResizeService = { _serviceBrand: undefined, resizeImage: async data => data as Uint8Array };
	const implementation = new McpToolImplementation(tool, server, new TestConfigurationService(), {} as IProductService, {} as IFileService, imageResizeService);

	const result = await implementation.invoke(
		{ callId: 'call', toolId: tool.id, parameters: {}, context: undefined },
		async () => 0,
		{
			report: step => {
				if (typeof step.message === 'string') {
					options.progress?.push(step.message);
				}
			}
		},
		CancellationToken.None,
	);
	return { result, details: result.toolResultDetails as IToolResultInputOutputDetails };
}

function modelParts(result: IToolResult): string[] {
	return result.content.map(part => part.kind === 'text' ? `text:${part.value}` : part.kind === 'data' ? `data:${part.value.mimeType}` : part.kind);
}
