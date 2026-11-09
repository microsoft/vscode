/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentDecisionErrorData, type IAgentDecisionsRequest, type IAgentDecisionsResult } from '../../common/agentDecisions.js';
import { URI } from '../../../../base/common/uri.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import type { IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { readAgentModelNoticesMeta } from '../../common/agentModelNotices.js';
import { parseModelRouter, readModelRouterDescription } from '../../common/modelRouter.js';
import { CopilotAgent } from '../../node/copilot/copilotAgent.js';

type AskDecisions = (this: unknown, request: IAgentDecisionsRequest, credentials: IAgentHostCredentialSource | undefined, token: CancellationToken) => Promise<IAgentDecisionsResult>;

const request: IAgentDecisionsRequest = { model: 'gpt-6-luna-decisions', context: { kind: 'text', text: 'hi' }, questions: [{ kind: 'boolean', name: 'q', instructions: 'Yes?' }] };
const answer: IAgentDecisionsResult = { model: 'gpt-6-luna-decisions', answers: [{ kind: 'boolean', name: 'q', probability: 1 }] };

suite('CopilotAgent.askDecisions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const askDecisions = (CopilotAgent.prototype as unknown as { askDecisions: AskDecisions }).askDecisions;

	function agentWith(rpc: object, hostToken: string | undefined = 'host') {
		const client = { rpc };
		return {
			_githubCredentials: { token: hostToken },
			_ensureClient: async () => client,
			_decisionsGates: new WeakMap(),
			_gitHubEndpointService: { getCopilotResource: () => ({ resource: 'https://api.github.com', scopes_supported: [] }) },
		};
	}

	const credentials = (token: string) => ({ getCredential: () => ({ resource: 'https://api.github.com', token }) }) as unknown as IAgentHostCredentialSource;

	test('is unavailable when the runtime has no decisions.ask', async () => {
		const error = await askDecisions.call(agentWith({}), request, undefined, CancellationToken.None).catch(e => e);
		assert.deepStrictEqual(agentDecisionErrorData(error), { kind: 'unavailable' });
	});

	test('is unauthenticated without a host or caller token', async () => {
		const error = await askDecisions.call(agentWith({ decisions: { ask: async () => answer } }, ''), request, undefined, CancellationToken.None).catch(e => e);
		assert.deepStrictEqual(agentDecisionErrorData(error), { kind: 'unauthenticated' });
	});

	test('asks as the caller\'s account, or the host\'s, with one gate per account', async () => {
		const asked: (string | undefined)[] = [];
		const agent = agentWith({
			decisions: {
				ask: async (params: IAgentDecisionsRequest & { gitHubToken?: string }) => {
					asked.push(params.gitHubToken);
					if (params.gitHubToken === 'limited') {
						throw Object.assign(new Error('limited'), { data: { kind: 'rateLimited', retryAfterMs: 60_000 } });
					}
					return answer;
				},
			},
		});
		const call = (source?: IAgentHostCredentialSource) => askDecisions.call(agent, request, source, CancellationToken.None).then(() => 'ok', e => agentDecisionErrorData(e)?.kind);
		assert.deepStrictEqual([
			await call(),
			await call(credentials('limited')),
			await call(credentials('limited')),
			await call(credentials('other')),
		], ['ok', 'rateLimited', 'rateLimited', 'ok']);
		assert.deepStrictEqual(asked, ['host', 'limited', 'other'], 'the rate-limited account\'s second call never reached the runtime');
	});

	test('a router with errors keeps its picker row, with a warning', () => {
		const withRows = (CopilotAgent.prototype as unknown as { _withModelRouterRows(this: unknown, models: readonly IAgentModelInfo[]): readonly IAgentModelInfo[] })._withModelRouterRows;
		const good = parseModelRouter('version: 1\ndescription: Good.\nroutes:\n  - model: a\n    when: A.\n  - model: b\n    when: B.\n', 'good.model-router.yaml');
		const files = [
			{ uri: URI.file('/r/good.model-router.yaml'), scope: 'user', name: 'good', router: good.router, diagnostics: [] },
			{ uri: URI.file('/r/bad.model-router.yaml'), scope: 'user', name: 'bad', router: undefined, diagnostics: [{ severity: 'error', message: 'Add `version: 1`.' }] },
		];
		const models: IAgentModelInfo[] = [{ provider: 'copilotcli', id: 'a', name: 'A', supportsVision: true }, { provider: 'copilotcli', id: 'b', name: 'B', supportsVision: true }];
		const rows = withRows.call({ id: 'copilotcli', _modelRouterCatalog: { value: { snapshot: { files } } } }, models).slice(2);
		assert.deepStrictEqual(rows.map(row => [row.id, readModelRouterDescription(row) !== undefined, readAgentModelNoticesMeta(row).rowWarning]), [
			['model-router:good', true, undefined],
			['model-router:bad', true, 'bad.model-router.yaml has errors: Add `version: 1`.'],
		]);
		assert.strictEqual(withRows.call({ id: 'copilotcli', _modelRouterCatalog: { value: { snapshot: { files: [] } } } }, models), models, 'unchanged without routers');
	});
});
