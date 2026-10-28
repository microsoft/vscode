/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import { CopilotCliVSCodeExperimentsEnabledKey } from '../../common/copilotCliConfig.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { buildCopilotExpUserParams, combineAssignmentContexts, CopilotExpAssignments, mapTasAssignmentResponse, resolveCopilotExpAssignmentsUrl, toCopilotExpVersion } from '../../node/copilot/copilotExpAssignments.js';
import type { FetchFunction, ICopilotApiService, ICopilotExpAccount } from '../../node/shared/copilotApiService.js';

const account: ICopilotExpAccount = {
	endpoint: 'https://exp.example.com/tas/',
	trackingId: 'tracking-id',
	isStaff: false,
	organizations: [],
};

const tasResponse = {
	assignedVariants: [{ name: 'treatment', numberline: 'numberline-a' }],
	featureVariables: { '/default/copilot_flag': 'true' },
	dataVersion: 3,
	assignmentContext: 'copilot-flight:1;',
};

const mappedResponse = {
	Features: ['treatment'],
	Flights: { 'numberline-a': 'treatment' },
	Configs: [{ Id: 'default', Parameters: { copilot_flag: true } }],
	FlightingVersion: 3,
	AssignmentContext: 'copilot-flight:1;',
};

suite('CopilotExpAssignments', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('request', () => {
		test('maps the runtime version to the ExP version like the runtime', () => {
			assert.deepStrictEqual([
				'1.0.103',
				'1.0.103-4',
				'1.0.103-unstable.r40031404408.gba6c003',
				'0.0.1',
				'0.0.1-local',
				'0.0.0-development',
				'not-a-version',
			].map(toCopilotExpVersion), [
				'1.0.103.9999',
				'1.0.103.4',
				'1.0.103.9999',
				'999.0.0.9999',
				'999.0.0.9999',
				'999.0.0.9999',
				'not-a-version',
			]);
		});

		test('identifies VS Code and its audience in the user params', () => {
			assert.deepStrictEqual([
				buildCopilotExpUserParams({ ...account, isStaff: true, organizations: ['github', 'microsoft'], copilotPlan: 'enterprise' }, '1.0.103'),
				buildCopilotExpUserParams({ ...account, isStaff: true, organizations: ['microsoft'] }, '1.0.103-2'),
				buildCopilotExpUserParams({ ...account, organizations: ['github'] }, '1.0.103'),
			], [
				{
					copilottrackingid: 'tracking-id',
					extensionname: 'CopilotVSCode',
					github_copilotcli_cliversion: '1.0.103.9999',
					github_copilotvscode_audience: 'github',
					gh_core_ghmsftorexternal: 'github',
					github_copilotcli_copilotplan: 'enterprise',
				},
				{
					copilottrackingid: 'tracking-id',
					extensionname: 'CopilotVSCode',
					github_copilotcli_cliversion: '1.0.103.2',
					github_copilotvscode_audience: 'microsoft',
					gh_core_ghmsftorexternal: 'microsoft',
				},
				{
					copilottrackingid: 'tracking-id',
					extensionname: 'CopilotVSCode',
					github_copilotcli_cliversion: '1.0.103.9999',
					github_copilotvscode_audience: 'external',
					gh_core_ghmsftorexternal: 'external',
				},
			]);
		});

		test('appends the assignments path to the canonical endpoint', () => {
			assert.deepStrictEqual([
				resolveCopilotExpAssignmentsUrl('https://exp.example.com'),
				resolveCopilotExpAssignmentsUrl('https://exp.example.com//tas//v2/?region=us#fragment'),
			], [
				'https://exp.example.com/api/v1/assignments',
				'https://exp.example.com/tas/v2/api/v1/assignments?region=us',
			]);
		});
	});

	suite('response mapping', () => {
		test('maps variants, feature variables, version and context', () => {
			assert.deepStrictEqual(mapTasAssignmentResponse({
				assignedVariants: [{ name: 'a', numberline: 'line-a' }, { name: 'b', numberline: 'line-b' }],
				featureVariables: {
					'/default/flag_bool': 'false',
					'/other/flag_number': '42.5',
					'flag_null': 'null',
					'/flag_string': 'value',
					'/default/flag_empty': '',
					'/default/flag_typed': 3,
				},
				dataVersion: 9,
				assignmentContext: 'ctx:1;',
			}), {
				Features: ['a', 'b'],
				Flights: { 'line-a': 'a', 'line-b': 'b' },
				Configs: [
					{ Id: 'default', Parameters: { flag_bool: false, flag_null: null, flag_string: 'value', flag_empty: '', flag_typed: 3 } },
					{ Id: 'other', Parameters: { flag_number: 42.5 } },
				],
				FlightingVersion: 9,
				AssignmentContext: 'ctx:1;',
			});
		});

		test('defaults absent fields', () => {
			assert.deepStrictEqual(mapTasAssignmentResponse({ assignedVariants: null }), {
				Features: [], Flights: {}, Configs: [], FlightingVersion: 0, AssignmentContext: '',
			});
		});

		test('rejects fields of the wrong type', () => {
			for (const response of [
				[],
				{ assignedVariants: {} },
				{ assignedVariants: [{ name: 'a' }] },
				{ featureVariables: [] },
				{ dataVersion: '1' },
				{ assignmentContext: 1 },
			]) {
				assert.throws(() => mapTasAssignmentResponse(response), Error, JSON.stringify(response));
			}
		});
	});

	test('combines VS Code and Copilot assignment contexts', () => {
		assert.deepStrictEqual([
			combineAssignmentContexts('vscode:1;shared:1', 'shared:1;copilot:2;'),
			combineAssignmentContexts('', 'copilot:2;'),
			combineAssignmentContexts('vscode:1', ''),
			combineAssignmentContexts('vscode:1', 'invalid'),
		], [
			'vscode:1;shared:1;copilot:2',
			'copilot:2;',
			'vscode:1',
			'vscode:1',
		]);
	});

	suite('resolver', () => {
		teardown(() => sinon.restore());

		interface IRequest { readonly url: string; readonly init: RequestInit | undefined }

		function createResolver(fetchFn: FetchFunction, options?: { readonly enabled?: boolean; readonly expAccount?: ICopilotExpAccount | null }) {
			const rootValues = { [CopilotCliVSCodeExperimentsEnabledKey]: options?.enabled ?? true };
			const expAccount = options?.expAccount === null ? undefined : options?.expAccount ?? account;
			const apiService = { resolveExpAccount: async () => expAccount } as Partial<ICopilotApiService> as ICopilotApiService;
			const configurationService = { getRootConfigValues: () => rootValues } as Partial<IAgentConfigurationService> as IAgentConfigurationService;
			const productService = { copilotVersions: { runtime: '1.0.103', sdk: '1.0.0' } } as Partial<IProductService> as IProductService;
			return disposables.add(new CopilotExpAssignments(fetchFn, apiService, configurationService, productService, new NullLogService()));
		}

		function respondingFetch(requests: IRequest[], ...responses: (() => Response)[]): FetchFunction {
			return async (input, init) => {
				requests.push({ url: String(input), init });
				const response = responses[Math.min(requests.length, responses.length) - 1];
				return response();
			};
		}

		test('posts the VS Code user params and returns the mapped assignments', async () => {
			const requests: IRequest[] = [];
			const resolver = createResolver(respondingFetch(requests, () => Response.json(tasResponse)));

			const assignments = await resolver.resolve('gh-token');

			assert.deepStrictEqual({
				assignments,
				requests: requests.map(request => ({ url: request.url, method: request.init?.method, headers: request.init?.headers, body: JSON.parse(String(request.init?.body)) })),
			}, {
				assignments: mappedResponse,
				requests: [{
					url: 'https://exp.example.com/tas/api/v1/assignments',
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: { userParams: buildCopilotExpUserParams(account, '1.0.103') },
				}],
			});
		});

		test('does not request assignments when VS Code experiments are disabled, signed out, or the account has no endpoint', async () => {
			const requests: IRequest[] = [];
			const fetchFn = respondingFetch(requests, () => Response.json(tasResponse));

			assert.deepStrictEqual([
				await createResolver(fetchFn, { enabled: false }).resolve('gh-token'),
				await createResolver(fetchFn).resolve(undefined),
				await createResolver(fetchFn, { expAccount: null }).resolve('gh-token'),
			], [undefined, undefined, undefined]);
			assert.deepStrictEqual(requests, []);
		});

		test('serves the cached assignments and refreshes them in the background', async () => {
			const clock = sinon.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
			const requests: IRequest[] = [];
			const refreshed = { ...tasResponse, assignmentContext: 'copilot-flight:2;' };
			const resolver = createResolver(respondingFetch(requests, () => Response.json(tasResponse), () => Response.json(refreshed)));

			const first = await resolver.resolve('gh-token');
			const cached = await resolver.resolve('gh-token');
			clock.tick(30 * 60 * 1000);
			const stale = await resolver.resolve('gh-token');
			await new Promise(resolve => setImmediate(resolve));
			const fresh = await resolver.resolve('gh-token');

			assert.deepStrictEqual({
				contexts: [first, cached, stale, fresh].map(value => value?.AssignmentContext),
				requests: requests.length,
			}, {
				contexts: ['copilot-flight:1;', 'copilot-flight:1;', 'copilot-flight:1;', 'copilot-flight:2;'],
				requests: 2,
			});
		});

		test('fails open and keeps the previous assignments when a request fails', async () => {
			const clock = sinon.useFakeTimers({ now: 1_000_000, toFake: ['Date'] });
			const requests: IRequest[] = [];
			const resolver = createResolver(respondingFetch(requests,
				() => new Response('unavailable', { status: 503 }),
				() => Response.json(tasResponse),
				() => Response.json({ assignedVariants: 'malformed' }),
			));

			const failed = await resolver.resolve('gh-token');
			clock.tick(5 * 60 * 1000);
			await resolver.resolve('gh-token');
			await new Promise(resolve => setImmediate(resolve));
			const recovered = await resolver.resolve('gh-token');
			clock.tick(30 * 60 * 1000);
			await resolver.resolve('gh-token');
			await new Promise(resolve => setImmediate(resolve));
			const kept = await resolver.resolve('gh-token');

			assert.deepStrictEqual({ failed, recovered, kept, requests: requests.length }, {
				failed: undefined, recovered: mappedResponse, kept: mappedResponse, requests: 3,
			});
		});

		test('waits at most the request timeout for an account\'s first assignments', async () => {
			const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
			const response = new DeferredPromise<Response>();
			const resolver = createResolver(async () => response.p);

			const resolution = resolver.resolve('gh-token');
			await clock.tickAsync(2000);
			const timedOut = await resolution;
			await response.complete(Response.json(tasResponse));
			await clock.tickAsync(0);
			await new Promise(resolve => setImmediate(resolve));

			assert.deepStrictEqual({ timedOut, later: await resolver.resolve('gh-token') }, { timedOut: undefined, later: mappedResponse });
		});
	});
});
