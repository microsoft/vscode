/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentDecisionErrorData, type IAgentDecisionsRequest, type IAgentDecisionsResult } from '../../common/agentDecisions.js';
import type { IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
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
});
