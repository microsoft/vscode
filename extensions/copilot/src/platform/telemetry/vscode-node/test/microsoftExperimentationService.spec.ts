/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Extension } from 'vscode';
import { getExperimentationServiceFromConfig, IExperimentationService } from 'vscode-tas-client';
import { mock } from '../../../../util/common/test/simpleMock';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { CopilotTokenStore, ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { AuthProviderId, ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { INTEGRATION_ID } from '../../../endpoint/common/licenseAgreement';
import { IEnvService } from '../../../env/common/envService';
import { IVSCodeExtensionContext } from '../../../extContext/common/extensionContext';
import { ILogService } from '../../../log/common/logService';
import { IFetcherService, Response } from '../../../networking/common/fetcherService';
import { MockExtensionContext } from '../../../test/node/extensionContext';
import { ITelemetryService } from '../../common/telemetry';
import { UserInfoStore } from '../../node/baseExperimentationService';
import { MicrosoftExperimentationService } from '../microsoftExperimentationService';

vi.mock('vscode', async importOriginal => ({
	...await importOriginal<typeof import('vscode')>(),
	env: { appRoot: '', devDeviceId: 'test-device' },
	workspace: { isAgentSessionsWorkspace: false },
	extensions: { getExtension: () => undefined },
}));

vi.mock('vscode-tas-client', () => ({
	TargetPopulation: { Public: 'public', Insiders: 'insider' },
	getExperimentationServiceFromConfig: vi.fn(),
}));

class MockTASClient extends mock<IExperimentationService>() {
	override readonly initializePromise = Promise.resolve();
	override readonly initialFetch = Promise.resolve();
	override readonly getTreatmentVariableAsync = vi.fn(async () => undefined);
	override readonly dispose = vi.fn();
}

class ExperimentationExtensionContext extends mock<IVSCodeExtensionContext>() {
	override extension = new class extends mock<Extension<void>>() {
		override id = 'GitHub.copilot-chat';
		override packageJSON = { version: '1.0.0' };
	}();
	override globalState = Object.assign(new MockExtensionContext().globalState, { setKeysForSync: () => { } });
}

describe('MicrosoftExperimentationService endpoint routing', () => {
	const store = new DisposableStore();
	const clients: MockTASClient[] = [];
	const endpoints = [
		'https://exp.enterprise.githubcopilot.com/api/v1/assignments',
		'https://exp.business.githubcopilot.com/api/v1/assignments',
		'https://exp.individual.githubcopilot.com/api/v1/assignments',
	];
	const emptyAssignments = '{"featureVariables":{},"assignmentContext":""}';

	function response(status = 200, body = emptyAssignments) {
		return Response.fromText(status, '', new Headers(), body, 'test-stub');
	}

	function fetchAssignments() {
		const config = vi.mocked(getExperimentationServiceFromConfig).mock.calls.at(-1)![0];
		const userParams = Object.fromEntries(config.assignmentsFilterProviders!.flatMap(provider => [...provider.getFilters()]));
		const init = { method: 'POST' as const, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userParams }) };
		return (config.assignmentsFetch ?? config.fetch)!(config.assignmentsEndpoint!, init);
	}

	beforeEach(() => {
		clients.length = 0;
		vi.mocked(getExperimentationServiceFromConfig).mockClear();
		vi.mocked(getExperimentationServiceFromConfig).mockImplementation(() => {
			const client = new MockTASClient();
			clients.push(client);
			return client;
		});
	});

	afterEach(() => {
		store.clear();
		vi.useRealTimers();
	});

	function createService(token?: CopilotToken, state: ICopilotTokenStore['authenticationState'] = token ? 'signedIn' : 'signedOut', provider = AuthProviderId.GitHub, context = new ExperimentationExtensionContext()) {
		const tokens = store.add(new CopilotTokenStore());
		tokens.authenticationState = state;
		tokens.copilotToken = token;
		const configuration = store.add(new InMemoryConfigurationService(
			store.add(new DefaultsOnlyConfigurationService()),
			new Map([[ConfigKey.Shared.AuthProvider, provider]]),
		));
		const env = new class extends mock<IEnvService>() {
			override isPreRelease() { return false; }
		}();
		const log = new class extends mock<ILogService>() {
			override trace(): void { }
			override warn(): void { }
		}();
		const fetcher = new class extends mock<IFetcherService>() {
			override fetch = vi.fn<IFetcherService['fetch']>(async () => response());
			override makeAbortController() { return new AbortController(); }
		}();
		const service = store.add(new MicrosoftExperimentationService(
			new class extends mock<ITelemetryService>() { }(),
			context,
			env,
			tokens,
			configuration,
			fetcher,
			log,
		));
		return { service, tokens, configuration, fetcher };
	}

	for (const token of [undefined, new CopilotToken(createTestExtendedTokenInfo({ endpoints: undefined }))]) {
		it(`sends the integrator only in assignment userParams when ${token ? 'signed in' : 'signed out'}`, async () => {
			const { service, fetcher } = createService(token);
			await service.hasTreatments();
			await fetchAssignments();
			const config = vi.mocked(getExperimentationServiceFromConfig).mock.calls.at(-1)![0];
			const legacyFilters = Object.fromEntries(config.filterProviders!.flatMap(provider => [...provider.getFilters()]));
			expect({
				requests: fetcher.fetch.mock.calls.map(([, options]) => ({
					integratorId: JSON.parse(options.body!).userParams.integratorid,
					headers: options.headers,
				})),
				legacyIntegratorId: legacyFilters.integratorid,
			}).toEqual({
				requests: [{ integratorId: INTEGRATION_ID, headers: { 'Content-Type': 'application/json' } }],
				legacyIntegratorId: undefined,
			});
		});

		it(`configures ${token ? 'individual routing without a token endpoint' : 'discovery when signed out'}`, async () => {
			const { service } = createService(token);
			await service.hasTreatments();
			const configs = vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => ({
				endpoint: config.assignmentsEndpoint,
				hasLegacyFilters: !!config.filterProviders?.length,
				hasAssignmentsFilters: !!config.assignmentsFilterProviders?.length,
				hasTransport: typeof config.fetch === 'function',
			}));
			expect(configs).toEqual([{
				endpoint: token ? endpoints[2] : endpoints[0],
				hasLegacyFilters: true,
				hasAssignmentsFilters: true,
				hasTransport: true,
			}]);
		});
	}

	it('switches between discovered and account routing even on the same host', async () => {
		const { service, tokens } = createService();
		await service.hasTreatments();
		tokens.authenticationState = 'signedIn';
		tokens.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ endpoints: { exp: 'https://exp.enterprise.githubcopilot.com///' } }));
		await service.hasTreatments();
		tokens.authenticationState = 'unknown';
		tokens.copilotToken = undefined;
		tokens.authenticationState = 'signedOut';
		await service.hasTreatments();
		expect(vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => config.assignmentsEndpoint).filter(Boolean)).toEqual([
			endpoints[0],
			'https://exp.enterprise.githubcopilot.com/api/v1/assignments',
			endpoints[0],
		]);
	});

	it('waits for discovered auth and does not recreate for token refreshes with unchanged targeting', async () => {
		const { service, tokens } = createService(undefined, 'unknown');
		await service.hasTreatments();
		tokens.authenticationState = 'signedIn';
		const info = createTestExtendedTokenInfo({ token: 'tid=user;refresh=1', endpoints: { exp: 'https://exp.individual.githubcopilot.com' } });
		tokens.copilotToken = new CopilotToken(info);
		await service.hasTreatments();
		tokens.copilotToken = new CopilotToken({ ...info, token: 'tid=user;refresh=2' });
		await service.hasTreatments();
		expect(vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => config.assignmentsEndpoint)).toEqual([
			undefined,
			'https://exp.individual.githubcopilot.com/api/v1/assignments',
		]);
	});

	it('replaces signed-out assignments when a late token has no endpoint and cached user info matches', async () => {
		const context = new ExperimentationExtensionContext();
		await context.globalState.update(UserInfoStore.SKU_STORAGE_KEY, 'free_limited_copilot');
		await context.globalState.update(UserInfoStore.IS_FCV1_STORAGE_KEY, false);
		await context.globalState.update(UserInfoStore.IS_SN_STORAGE_KEY, false);
		await context.globalState.update(UserInfoStore.IS_VSCODE_TEAM_MEMBER_STORAGE_KEY, false);
		await context.globalState.update(UserInfoStore.ORGANIZATION_LIST_STORAGE_KEY, []);
		const { service, tokens } = createService(undefined, 'signedOut', AuthProviderId.GitHub, context);
		await service.hasTreatments();
		tokens.authenticationState = 'signedIn';
		tokens.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'tid=late-user', endpoints: undefined }));
		await service.hasTreatments();
		expect(vi.mocked(getExperimentationServiceFromConfig).mock.calls.filter(([config]) => config.assignmentsEndpoint).map(([config]) => ({
			endpoint: config.assignmentsEndpoint,
			tid: config.assignmentsFilterProviders?.[0].getFilters().get('copilottrackingid'),
		}))).toEqual([
			{ endpoint: endpoints[0], tid: undefined },
			{ endpoint: 'https://exp.individual.githubcopilot.com/api/v1/assignments', tid: 'late-user' },
		]);
	});

	it('refreshes changed targeting on the same endpoint without fetching through a superseded delegate', async () => {
		const info = createTestExtendedTokenInfo({ token: 'tid=first', endpoints: { exp: 'https://exp.individual.githubcopilot.com' } });
		const { service, tokens } = createService(new CopilotToken(info));
		await service.hasTreatments();
		const originalConfig = vi.mocked(getExperimentationServiceFromConfig).mock.calls[0][0];
		tokens.copilotToken = new CopilotToken({ ...info, token: 'tid=second', enterprise_list: [42] });
		await service.hasTreatments();
		const configs = vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => config);
		expect(configs.map(config => {
			const filters = config.assignmentsFilterProviders?.[0].getFilters();
			return [filters?.get('copilottrackingid'), filters?.get('github_core_businessid')];
		})).toEqual([['first', ''], ['second', '42']]);
		expect(() => originalConfig.fetch!('https://exp.individual.githubcopilot.com/api/v1/assignments', { method: 'POST', headers: {}, body: '{}' })).toThrow('Canceled');
		expect(clients.map(client => client.getTreatmentVariableAsync.mock.calls.length)).toEqual([0, 0]);
	});

	for (const { plan, individual, provider, state } of [
		{ plan: 'business', individual: false, provider: AuthProviderId.GitHub, state: 'signedIn' },
		{ plan: 'enterprise', individual: false, provider: AuthProviderId.GitHub, state: 'signedIn' },
		{ plan: 'unknown', individual: true, provider: AuthProviderId.GitHub, state: 'signedIn' },
		{ plan: 'individual', individual: true, provider: AuthProviderId.GitHubEnterprise, state: 'signedIn' },
	] as const) {
		it(`requires an explicit endpoint for ${plan}, ${provider}, ${state}`, async () => {
			const token = state === 'signedIn' ? new CopilotToken(createTestExtendedTokenInfo({ sku: 'test-paid-sku', copilot_plan: plan, individual, endpoints: undefined })) : undefined;
			const { service } = createService(token, state, provider);
			await service.hasTreatments();
			expect(vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => config.assignmentsEndpoint)).toEqual([undefined]);
		});
	}

	it('starts managed assignments when a refreshed token supplies the explicit endpoint', async () => {
		const info = createTestExtendedTokenInfo({ token: 'tid=user;refresh=1', copilot_plan: 'enterprise', individual: false, endpoints: undefined });
		const { service, tokens } = createService(new CopilotToken(info), 'signedIn', AuthProviderId.GitHubEnterprise);
		await service.hasTreatments();
		tokens.copilotToken = new CopilotToken({ ...info, endpoints: { exp: 'https://exp.example.ghe.com' } });
		await service.hasTreatments();
		expect(vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => config.assignmentsEndpoint)).toEqual([
			undefined,
			'https://exp.example.ghe.com/api/v1/assignments',
		]);
	});

	for (const state of ['unknown', 'signedIn'] as const) {
		it(`refreshes legacy targeting without a new endpoint when auth is ${state}`, async () => {
			const info = createTestExtendedTokenInfo({ token: 'tid=user', sku: 'business', copilot_plan: 'business', individual: false, endpoints: undefined });
			const { service, tokens } = createService(new CopilotToken(info), state, AuthProviderId.GitHubEnterprise);
			await service.hasTreatments();
			const snapshots = () => vi.mocked(getExperimentationServiceFromConfig).mock.calls.map(([config]) => ({
				endpoint: config.assignmentsEndpoint,
				legacy: Object.fromEntries(config.filterProviders![0].getFilters()),
			}));
			const before = snapshots()[0];
			tokens.copilotToken = new CopilotToken({ ...info, sku: 'enterprise', organization_list: ['vscode'] });
			await service.hasTreatments();
			const after = snapshots().at(-1)!;
			tokens.copilotToken = new CopilotToken({ ...info, sku: 'enterprise', organization_list: ['vscode'] });
			await service.hasTreatments();
			expect({
				endpoints: [before.endpoint, after.endpoint],
				skus: [before.legacy['X-GitHub-Copilot-SKU'], after.legacy['X-GitHub-Copilot-SKU']],
				orgs: [before.legacy['X-GitHub-Copilot-OrganizationList'], after.legacy['X-GitHub-Copilot-OrganizationList']],
				delegates: clients.length,
				refreshes: clients.map(client => client.getTreatmentVariableAsync.mock.calls.length),
			}).toEqual({
				endpoints: [undefined, undefined],
				skus: ['business', 'enterprise'],
				orgs: ['', 'vscode'],
				delegates: 2,
				refreshes: [0, 0],
			});
		});
	}

	for (const failure of ['network', 'http', 'json', 'schema', 'timeout'] as const) {
		it(`discovers and reuses an empty assignment after ${failure} failure even with enterprise auth configured`, async () => {
			const staleToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'tid=previous-user' }));
			const { service, fetcher } = createService(staleToken, 'signedOut', AuthProviderId.GitHubEnterprise);
			await service.hasTreatments();
			vi.useFakeTimers();
			fetcher.fetch.mockImplementationOnce(async (_url, options) => {
				switch (failure) {
					case 'network': throw new Error('Blocked');
					case 'http': return response(403, 'Forbidden');
					case 'json': return response(200, '<html>Blocked</html>');
					case 'schema': return response(200, '{"featureVariables":[],"assignmentContext":""}');
					case 'timeout': return new Promise<Response>((_resolve, reject) => {
						options.signal!.addEventListener('abort', () => reject(new Error('Aborted')));
					});
				}
			});
			const pending = fetchAssignments();
			if (failure === 'timeout') {
				await vi.advanceTimersByTimeAsync(1000);
			}
			const result = await pending;
			await fetchAssignments();
			expect({
				urls: fetcher.fetch.mock.calls.map(([url]) => url),
				identities: fetcher.fetch.mock.calls.map(([, options]) => JSON.parse(options.body!).userParams.copilottrackingid),
				body: await result.json(),
				firstAborted: fetcher.fetch.mock.calls[0][1].signal?.aborted,
			}).toEqual({
				urls: [endpoints[0], endpoints[1], endpoints[1]],
				identities: [undefined, undefined, undefined],
				body: { featureVariables: {}, assignmentContext: '' },
				firstAborted: true,
			});
		});
	}

	for (const winner of [0, 1, 2, undefined] as const) {
		it(`staggers discovery and cancels outstanding work with ${winner === undefined ? 'a shared deadline' : `winner ${winner}`}`, async () => {
			const { service, fetcher } = createService();
			await service.hasTreatments();
			vi.useFakeTimers();
			const start = Date.now();
			const starts: number[] = [];
			const cancelled: string[] = [];
			fetcher.fetch.mockImplementation(async (url, options) => {
				starts.push(Date.now() - start);
				if (winner !== undefined && url === endpoints[winner]) {
					return response();
				}
				return new Promise<Response>((_resolve, reject) => {
					options.signal!.addEventListener('abort', () => {
						cancelled.push(url);
						reject(new Error('Aborted'));
					});
				});
			});
			let settledAt: number | undefined;
			const pending = fetchAssignments().finally(() => { settledAt = Date.now() - start; });
			const checked = winner === undefined
				? expect(pending).rejects.toThrow('Signed-out TAS discovery timed out')
				: expect(pending).resolves.toMatchObject({ status: 200 });
			await vi.advanceTimersByTimeAsync(4999);
			const beforeDeadline = settledAt;
			await vi.advanceTimersByTimeAsync(1);
			await checked;
			await vi.advanceTimersByTimeAsync(1000);
			const count = winner === undefined ? 3 : winner + 1;
			expect({
				urls: fetcher.fetch.mock.calls.map(([url]) => url),
				starts,
				beforeDeadline,
				settledAt,
				cancelled,
				timers: vi.getTimerCount(),
			}).toEqual({
				urls: endpoints.slice(0, count),
				starts: [0, 1000, 2000].slice(0, count),
				beforeDeadline: winner === undefined ? undefined : winner * 1000,
				settledAt: winner === undefined ? 5000 : winner * 1000,
				cancelled: endpoints.slice(0, winner ?? 3),
				timers: 0,
			});
		});
	}

	it('a late successful loser cannot replace the remembered winner', async () => {
		const { service, fetcher } = createService();
		await service.hasTreatments();
		vi.useFakeTimers();
		let complete: ((response: Response) => void) | undefined;
		fetcher.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }));
		const pending = fetchAssignments();
		await vi.advanceTimersByTimeAsync(1000);
		await pending;
		complete!(response());
		await vi.advanceTimersByTimeAsync(0);
		await fetchAssignments();
		expect(fetcher.fetch.mock.calls.map(([url]) => url)).toEqual([endpoints[0], endpoints[1], endpoints[1]]);
	});

	it('does not hedge a remembered host and rediscovers after it stops responding', async () => {
		const { service, fetcher } = createService();
		await service.hasTreatments();
		vi.useFakeTimers();
		await fetchAssignments();
		fetcher.fetch.mockImplementationOnce(() => new Promise<Response>(() => { }));
		const timedOut = expect(fetchAssignments()).rejects.toThrow('Signed-out TAS discovery timed out');
		await vi.advanceTimersByTimeAsync(5000);
		await timedOut;
		fetcher.fetch.mockImplementationOnce(() => new Promise<Response>(() => { }));
		const rediscovered = fetchAssignments();
		await vi.advanceTimersByTimeAsync(1000);
		await rediscovered;
		expect(fetcher.fetch.mock.calls.map(([url]) => url)).toEqual([endpoints[0], endpoints[0], endpoints[0], endpoints[1]]);
	});

	it('rejects after one attempt per host, retries on the next fetch, and replaces a failed preferred host', async () => {
		const { service, fetcher, tokens } = createService();
		await service.hasTreatments();
		let workingEndpoint: string | undefined;
		fetcher.fetch.mockImplementation(async url => response(url === workingEndpoint ? 200 : 503));
		await expect(fetchAssignments()).rejects.toThrow('All signed-out TAS endpoints failed');
		workingEndpoint = endpoints[2];
		await fetchAssignments();
		workingEndpoint = endpoints[1];
		await fetchAssignments();
		await fetchAssignments();
		const discovered = fetcher.fetch.mock.calls.map(([url]) => url);
		tokens.authenticationState = 'signedIn';
		tokens.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ endpoints: { exp: 'https://exp.individual.githubcopilot.com' } }));
		await service.hasTreatments();
		await fetchAssignments();
		expect({ discovered, signedIn: fetcher.fetch.mock.calls.slice(discovered.length).map(([url]) => url) }).toEqual({
			discovered: [...endpoints, ...endpoints, endpoints[2], endpoints[0], endpoints[1], endpoints[1]],
			signedIn: [endpoints[2]],
		});
	});

	it('does not continue discovery after sign-in revokes a pending anonymous fetch', async () => {
		const { service, fetcher, tokens } = createService();
		await service.hasTreatments();
		let complete: ((response: Response) => void) | undefined;
		fetcher.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { complete = resolve; }));
		const pending = fetchAssignments();
		tokens.authenticationState = 'signedIn';
		tokens.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ endpoints: { exp: 'https://exp.individual.githubcopilot.com' } }));
		await service.hasTreatments();
		complete!(response(503));
		await expect(pending).rejects.toThrow('Canceled');
		await fetchAssignments();
		expect(fetcher.fetch.mock.calls.map(([url]) => url)).toEqual([endpoints[0], endpoints[2]]);
	});
});
