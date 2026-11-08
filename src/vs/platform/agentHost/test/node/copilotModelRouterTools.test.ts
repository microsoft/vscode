/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ToolInvocation, ToolResultObject } from '@github/copilot-sdk';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { parseModelRouter } from '../../common/modelRouter.js';
import { ReasoningEffortConfigKey } from '../../common/reasoningEffort.js';
import type { IModelRouterFile } from '../../node/copilot/copilotModelRouterCatalog.js';
import { CheckModelRouterToolName, createCopilotModelRouterTools, type IModelRouterToolHost } from '../../node/copilot/copilotModelRouterTools.js';

const models: IAgentModelInfo[] = [
	{ provider: 'copilotcli', id: 'auto', name: 'Auto', supportsVision: true },
	{ provider: 'copilotcli', id: 'haiku', name: 'Haiku', supportsVision: true, configSchema: { type: 'object', properties: { [ReasoningEffortConfigKey]: { type: 'string', title: 'Effort', enum: ['low', 'high'] } } } },
	{ provider: 'copilotcli', id: 'opus', name: 'Opus', supportsVision: true, _meta: { warningText: { model_pending_deprecation: 'Retires soon.' } } },
];

const goodPath = '/home/.agents/model-routers/daily.model-router.yaml';
const good = 'version: 1\ndescription: Test.\nroutes:\n  - model: haiku\n    when: Small.\n    effort: max\n  - model: opus\n    when: Big.\n';
const files: Record<string, string> = {
	[URI.file(goodPath).fsPath]: good,
	[URI.file('/home/.agents/model-routers/bad.model-router.yaml').fsPath]: 'version: 1\ndescription: Bad.\nroutes:\n  - model: haiku\n    when: "unclosed\n',
};

suite('check_model_router', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createTool(enabled: () => boolean = () => true) {
		const parsed = parseModelRouter(good, 'daily.model-router.yaml');
		const host: IModelRouterToolHost = {
			isEnabled: enabled,
			listRouters: async (): Promise<IModelRouterFile[]> => [{ uri: URI.file(goodPath), scope: 'user', name: 'daily', router: parsed.router, diagnostics: parsed.diagnostics }],
			folders: [URI.file('/home/.agents/model-routers')],
			readFile: async uri => {
				const content = files[uri.fsPath];
				if (content === undefined) {
					throw new Error('not found');
				}
				return content;
			},
			models: async () => models,
		};
		const [tool] = createCopilotModelRouterTools(true, host, new NullLogService());
		return tool;
	}

	async function call(args: unknown, enabled?: () => boolean): Promise<ToolResultObject> {
		const { handler } = createTool(enabled);
		assert.ok(handler);
		return await handler(args, {} as ToolInvocation) as ToolResultObject;
	}

	test('is only offered while model routers are on, and refuses once they are turned off', async () => {
		let enabled = true;
		assert.deepStrictEqual(createCopilotModelRouterTools(false, {} as IModelRouterToolHost, new NullLogService()), []);
		assert.strictEqual(createTool().name, CheckModelRouterToolName);
		enabled = false;
		assert.strictEqual((await call({}, () => enabled)).resultType, 'failure');
	});

	test('does not read files outside the router folders', async () => {
		const result = JSON.parse((await call({ path: '/elsewhere/daily.model-router.yaml' })).textResultForLlm);
		assert.strictEqual(result.router.valid, false);
		assert.match(result.router.diagnostics[0].message, /read only from/);
	});

	test('checks a file against the account\'s models, with line numbers', async () => {
		const result = JSON.parse((await call({ path: goodPath })).textResultForLlm);
		assert.deepStrictEqual(result, {
			router: {
				name: 'daily',
				path: URI.file(goodPath).fsPath,
				valid: true,
				diagnostics: [
					{ severity: 'warning', message: 'Route 1: Haiku doesn\'t support effort `max`; it supports `low`, `high`.' },
					{ severity: 'warning', message: 'Route 2: Opus is being retired. Retires soon. Add a newer model to its `model` list.' },
				],
				routes: [
					{ route: 1, model: 'haiku', matched: 'haiku', supportedEfforts: ['low', 'high'] },
					{ route: 2, model: 'opus', matched: 'opus', supportedEfforts: [], retiring: 'Retires soon.' },
				],
			},
			availableModels: [
				{ id: 'haiku', name: 'Haiku', efforts: ['low', 'high'] },
				{ id: 'opus', name: 'Opus', efforts: [], retiring: 'Retires soon.' },
			],
		});
	});

	test('reports format errors with their line, and lists routers without a path', async () => {
		const bad = JSON.parse((await call({ path: '/home/.agents/model-routers/bad.model-router.yaml' })).textResultForLlm);
		const listed = JSON.parse((await call({})).textResultForLlm);
		assert.deepStrictEqual({
			bad: { valid: bad.router.valid, diagnostics: bad.router.diagnostics },
			listed: listed.routers.map((router: { name: string; valid: boolean }) => [router.name, router.valid]),
		}, {
			bad: { valid: false, diagnostics: [{ severity: 'error', message: 'This quoted value is missing its closing quote.', line: 5 }] },
			listed: [['daily', true]],
		});
	});
});
