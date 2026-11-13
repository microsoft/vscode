/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ICopilotTokenInfo, IDefaultAccount, IEntitlementsData } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IRequestContext, IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY } from '../../../../../platform/assignment/common/assignment.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { COPILOT_INTEGRATION_ID } from '../../../../../platform/endpoint/common/licenseAgreement.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { WorkbenchAssignmentService } from '../../common/assignmentService.js';
import { Memento } from '../../../../common/memento.js';

// The real TAS client loads through the workbench's browser URL resolver, so these tests need a browser loader.
suite('WorkbenchAssignmentService polling', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const treatmentName = 'config.test.polling';
	setup(() => Memento.clear(StorageScope.APPLICATION));
	teardown(() => Memento.clear(StorageScope.APPLICATION));
	const signedOutEndpoints = [
		'https://exp.enterprise.githubcopilot.com/api/v1/assignments',
		'https://exp.business.githubcopilot.com/api/v1/assignments',
		'https://exp.individual.githubcopilot.com/api/v1/assignments',
	];

	function response(status: number, body: string): IRequestContext {
		return { res: { headers: {}, statusCode: status }, stream: bufferToStream(VSBuffer.fromString(body)) };
	}

	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Await client readiness and exercise refresh races without public test-only APIs. */
	function createService(enabled = true, accountState: 'signedIn' | 'signedOut' | 'missingEndpoint' = 'signedIn', options: { endpoint?: string; plan?: string; enterprise?: boolean; accountReady?: DeferredPromise<void>; cached?: Record<string, string | number | boolean>; aiDisabled?: boolean; telemetryLevel?: 'all' | 'error' | 'crash' | 'off' } = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ 'workbench.enableExperiments': enabled, 'telemetry.telemetryLevel': options.telemetryLevel ?? 'all', 'chat.disableAIFeatures': options.aiDisabled ?? false });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const storage = store.add(new InMemoryStorageService());
		instantiationService.stub(IStorageService, storage);
		if (options.cached) {
			const memento = new Memento<Record<string, unknown>>('experiment.service.memento', storage);
			memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE)[ASSIGNMENT_STORAGE_KEY] = {
				features: [], assignmentContext: 'cached-context', configs: [{ Id: 'vscode', Parameters: options.cached }],
			};
		}
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IProductService, {
			version: '1.100.0', nameLong: 'Test', quality: 'insider',
			tasConfig: {
				endpoint: `data:application/json,${encodeURIComponent(JSON.stringify({ Configs: [], AssignmentContext: '' }))}`,
				telemetryEventName: 'query-expfeature',
				assignmentContextTelemetryPropertyName: 'test.assignmentContext',
			},
		});
		instantiationService.stub(IWorkbenchEnvironmentService, {});
		const errors: string[] = [];
		instantiationService.stub(ILogService, store.add(new class extends NullLogService {
			override error(message: string | Error): void {
				errors.push(String(message));
			}
		}()));
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const entitlements = new class extends mock<IEntitlementsData>() {
			override endpoints = accountState === 'missingEndpoint' ? undefined : { exp: options.endpoint ?? 'https://assignments.example.com' };
			override copilot_plan = options.plan ?? 'individual';
			override access_type_sku = 'pro';
			override analytics_tracking_id = 'account-user';
			override is_staff = false;
		}();
		const authenticationProvider = { id: options.enterprise ? 'github-enterprise' : 'github', name: 'GitHub', enterprise: options.enterprise ?? false };
		const account = new class extends mock<IDefaultAccount>() {
			override readonly sessionId = 'account-session';
			override readonly authenticationProvider = authenticationProvider;
			override readonly enterprise = authenticationProvider.enterprise;
			override readonly entitlementsData = entitlements;
		}();
		const tokenChanged = store.add(new Emitter<ICopilotTokenInfo | null>());
		let refreshAccount = () => { };
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override currentDefaultAccount: IDefaultAccount | null = accountState === 'signedOut' ? null : account;
			override readonly onDidChangeDefaultAccount = accountChanged.event;
			override copilotTokenInfo: ICopilotTokenInfo | null = { sn: '0' };
			override readonly onDidChangeCopilotTokenInfo = tokenChanged.event;
			override async getDefaultAccount() {
				await options.accountReady?.p;
				return this.currentDefaultAccount;
			}
			override getDefaultAccountAuthenticationProvider() { return authenticationProvider; }
			override async refresh() {
				refreshAccount();
				return this.currentDefaultAccount;
			}
		}();
		instantiationService.stub(IDefaultAccountService, defaultAccountService);
		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override readonly onDidChangeExtensionsStatus = Event.None;
			override async getExtension() { return undefined; }
		}());
		const entitlementChanged = store.add(new Emitter<void>());
		const chatEntitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeEntitlement = entitlementChanged.event;
			override sku = 'pro';
			override isInternal = false;
			override copilotTrackingId = 'stale-chat-user';
		}();
		instantiationService.stub(IChatEntitlementService, chatEntitlementService);

		let value: string | undefined = 'initial';
		const requestedFilters: Record<string, string>[] = [];
		const requestedHeaders: IRequestOptions['headers'][] = [];
		const requestedUrls: (string | undefined)[] = [];
		let waitForResponse = async () => { };
		let respond: ((options: IRequestOptions, token: CancellationToken) => Promise<IRequestContext>) | undefined;
		instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions, token: CancellationToken) {
				assert.ok(options.data);
				const body: { userParams: Record<string, string> } = JSON.parse(options.data);
				requestedFilters.push(body.userParams);
				requestedHeaders.push(options.headers);
				requestedUrls.push(options.url);
				if (respond) {
					return respond(options, token);
				}
				const response = {
					featureVariables: value === undefined ? {} : { [`/vscode/${treatmentName}`]: value },
					assignmentContext: 'unchanged-context',
				};
				await waitForResponse();
				return { res: { headers: {}, statusCode: 200 }, stream: bufferToStream(VSBuffer.fromString(JSON.stringify(response))) };
			}
		}());
		const service = store.add(instantiationService.createInstance(WorkbenchAssignmentService));
		const ready = async () => {
			await defaultAccountService.getDefaultAccount();
			const client = await service['tasClient'];
			await client?.initialFetch;
			await service['refetchPromise'];
			await service['overrideInitDelay'];
			return client;
		};
		return {
			service, ready, errors, requestedFilters, requestedHeaders, requestedUrls, entitlements,
			requests: () => requestedFilters.length,
			setValue: (next: string | undefined) => { value = next; },
			setWaitForResponse: (wait: () => Promise<void>) => { waitForResponse = wait; },
			setResponse: (next: typeof respond) => { respond = next; },
			setRefreshAccount: (refresh: () => void) => { refreshAccount = refresh; },
			changeFilters: (kind: 'sku' | 'token' | 'staff', updated: boolean) => {
				if (kind === 'token') {
					defaultAccountService.copilotTokenInfo = { sn: updated ? '1' : '0' };
					tokenChanged.fire(defaultAccountService.copilotTokenInfo);
				} else {
					if (kind === 'sku') {
						chatEntitlementService.sku = updated ? 'business' : 'pro';
						entitlements.access_type_sku = chatEntitlementService.sku;
					} else {
						chatEntitlementService.isInternal = updated;
						entitlements.is_staff = updated;
					}
					entitlementChanged.fire();
					accountChanged.fire(defaultAccountService.currentDefaultAccount);
				}
			},
			changeEndpoint: () => {
				entitlements.endpoints = { exp: 'https://replacement.example.com' };
				accountChanged.fire(account);
			},
			changeAccount: (exp: string | null | undefined) => {
				entitlements.endpoints = exp ? { exp } : undefined;
				defaultAccountService.currentDefaultAccount = exp === null ? null : account;
				accountChanged.fire(defaultAccountService.currentDefaultAccount);
			},
		};
	}

	for (const accountState of ['signedIn', 'signedOut'] as const) {
		test(`keeps integrator targeting in the body with CORS-compatible headers (${accountState})`, async () => {
			const { service, ready, requestedFilters, requestedHeaders } = createService(true, accountState);
			await ready();
			assert.deepStrictEqual({
				treatment: await service.getTreatment(treatmentName),
				integratorIds: requestedFilters.map(filters => filters.integratorid),
				headers: requestedHeaders,
			}, {
				treatment: 'initial',
				integratorIds: [COPILOT_INTEGRATION_ID],
				headers: [{ 'Content-Type': 'application/json' }],
			});
		});
	}

	test('serves cached treatments before account discovery without calling a new endpoint', () => runWithFakedTimers({}, async () => {
		const accountReady = new DeferredPromise<void>();
		const { service, ready, requestedUrls, requestedFilters, changeAccount } = createService(true, 'signedOut', {
			accountReady,
			cached: { [`/vscode/${treatmentName}`]: false, '/vscode/config.test.zero': 0 },
		});
		try {
			const value = await service.getTreatment(treatmentName);
			const assignment = await service.getTreatmentWithAssignment('config.test.zero');
			const pending = { requests: requestedUrls.length, value, assignedValue: assignment.value, hasAssignment: await assignment.hasAssignment };
			changeAccount('https://exp.business.githubcopilot.com');
			await accountReady.complete();
			await ready();
			assert.deepStrictEqual({ pending, urls: requestedUrls, trackingIds: requestedFilters.map(filters => filters.copilottrackingid) }, {
				pending: { requests: 0, value: false, assignedValue: 0, hasAssignment: true },
				urls: ['https://exp.business.githubcopilot.com/api/v1/assignments'],
				trackingIds: ['account-user'],
			});
		} finally {
			service.dispose();
			await accountReady.complete();
		}
	}));

	for (const { experiments, telemetryLevel } of [
		{ experiments: true, telemetryLevel: 'all' },
		{ experiments: false, telemetryLevel: 'all' },
		{ experiments: true, telemetryLevel: 'error' },
		{ experiments: true, telemetryLevel: 'crash' },
		{ experiments: true, telemetryLevel: 'off' },
	] as const) {
		test(`AI-disabled discovery respects experiments=${experiments}, telemetry=${telemetryLevel}`, () => runWithFakedTimers({}, async () => {
			const { service, ready, requestedUrls, requestedFilters } = createService(experiments, 'signedOut', { aiDisabled: true, telemetryLevel });
			try {
				await ready();
				const enabled = experiments && telemetryLevel === 'all';
				if (!enabled) {
					await timeout(ASSIGNMENT_REFETCH_INTERVAL * 2);
				}
				assert.deepStrictEqual({
					urls: requestedUrls,
					accountIdentities: requestedFilters.map(filters => filters.copilottrackingid),
					hasClient: !!service['tasClient'],
					polling: service['refetchScheduler'].isScheduled(),
				}, {
					urls: enabled ? [signedOutEndpoints[0]] : [],
					accountIdentities: enabled ? [undefined] : [],
					hasClient: enabled,
					polling: enabled,
				});
			} finally {
				service.dispose();
			}
		}));
	}

	for (const endpoint of ['https://exp.individual.githubcopilot.com', 'https://exp.business.githubcopilot.com']) {
		test(`clears account filters and refetches on sign-out from ${endpoint}`, () => runWithFakedTimers({}, async () => {
			const { service, ready, requestedUrls, requestedFilters, changeAccount, entitlements } = createService(true, 'signedIn', { endpoint });
			entitlements.access_type_sku = '';
			try {
				await ready();
				changeAccount(null);
				await ready();
				assert.deepStrictEqual({
					urls: requestedUrls,
					identity: requestedFilters.map(filters => ({ tid: filters.copilottrackingid, sku: filters.github_core_copilotsku })),
				}, {
					urls: [`${endpoint}/api/v1/assignments`, signedOutEndpoints[0]],
					identity: [{ tid: 'account-user', sku: undefined }, { tid: undefined, sku: undefined }],
				});
			} finally {
				service.dispose();
			}
		}));
	}

	for (const { accountState, plan, enterprise } of [
		{ accountState: 'missingEndpoint', plan: 'business', enterprise: false },
		{ accountState: 'missingEndpoint', plan: 'enterprise', enterprise: false },
		{ accountState: 'missingEndpoint', plan: 'unknown', enterprise: false },
		{ accountState: 'missingEndpoint', plan: 'individual', enterprise: true },
	] as const) {
		test(`does not use public fallback for ${accountState}, ${plan}, enterprise=${enterprise}`, () => runWithFakedTimers({}, async () => {
			const { service, ready, requestedUrls } = createService(true, accountState, { plan, enterprise });
			try {
				await ready();
				assert.deepStrictEqual(requestedUrls, []);
			} finally {
				service.dispose();
			}
		}));
	}

	test('uses account updates without forcing entitlements on hourly or filter-driven refresh', () => runWithFakedTimers({}, async () => {
		const { service, ready, requestedUrls, changeAccount, changeFilters, setRefreshAccount } = createService(true, 'missingEndpoint', { plan: 'enterprise' });
		try {
			await ready();
			let discoveries = 0;
			setRefreshAccount(() => {
				discoveries++;
			});
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			await ready();
			changeFilters('sku', true);
			await timeout(1);
			await ready();
			changeAccount('https://exp.enterprise.githubcopilot.com');
			await ready();
			assert.deepStrictEqual({ discoveries, urls: requestedUrls }, {
				discoveries: 0,
				urls: ['https://exp.enterprise.githubcopilot.com/api/v1/assignments'],
			});
		} finally {
			service.dispose();
		}
	}));

	for (const accountState of ['signedOut', 'missingEndpoint'] as const) {
		test(`merges new TAS and legacy treatments when ${accountState}`, () => runWithFakedTimers({}, async () => {
			const { service, ready, requestedUrls } = createService(true, accountState);
			try {
				const client = (await ready())!;
				// Stub only the legacy provider: Electron's Node HTTP transport cannot fetch the data URL fixture.
				const legacy = sinon.stub(client['featureProviders']![0], 'getFeatures').resolves({
					features: [],
					assignmentContext: 'legacy-context',
					configs: [{ Id: 'vscode', Parameters: { [treatmentName]: 'legacy', 'config.test.legacyOnly': 'legacy-only' } }],
				});
				store.add(toDisposable(() => legacy.restore()));
				await service['refetchAssignments']();
				assert.deepStrictEqual({
					urls: requestedUrls,
					merged: await service.getTreatment(treatmentName),
					legacyOnly: await service.getTreatment('config.test.legacyOnly'),
				}, {
					urls: Array(2).fill(accountState === 'signedOut' ? signedOutEndpoints[0] : signedOutEndpoints[2]),
					merged: 'initial',
					legacyOnly: 'legacy-only',
				});
			} finally {
				service.dispose();
			}
		}));
	}

	test('switches between discovered and account routing even on the same host', () => runWithFakedTimers({}, async () => {
		const { service, ready, requestedUrls, changeAccount, setValue } = createService(true, 'signedOut');
		try {
			await ready();
			const values = [await service.getTreatment(treatmentName)];
			setValue('signed-in');
			changeAccount('https://exp.enterprise.githubcopilot.com///');
			await ready();
			values.push(await service.getTreatment(treatmentName));
			setValue('signed-out');
			changeAccount(null);
			await ready();
			values.push(await service.getTreatment(treatmentName));
			assert.deepStrictEqual({ urls: requestedUrls, values }, {
				urls: [
					signedOutEndpoints[0],
					'https://exp.enterprise.githubcopilot.com/api/v1/assignments',
					signedOutEndpoints[0],
				],
				values: ['initial', 'signed-in', 'signed-out'],
			});
		} finally {
			service.dispose();
		}
	}));

	for (const failure of ['network', 'http', 'json', 'schema', 'timeout'] as const) {
		test(`signed-out discovery advances after ${failure} failure and reuses a valid empty response`, () => runWithFakedTimers({}, async () => {
			const { service, ready, requestedUrls, requestedFilters, setResponse } = createService(true, 'signedOut', { enterprise: true });
			let aborted = false;
			setResponse(async (options, token) => {
				if (options.url === signedOutEndpoints[0]) {
					switch (failure) {
						case 'network': throw new Error('Blocked');
						case 'http': return response(403, 'Forbidden');
						case 'json': return response(200, '<html>Blocked</html>');
						case 'schema': return response(200, '{"featureVariables":[],"assignmentContext":""}');
						case 'timeout': {
							return new Promise<IRequestContext>((_resolve, reject) => {
								const listener = token.onCancellationRequested(() => {
									aborted = true;
									listener.dispose();
									reject(new Error('Aborted'));
								});
								store.add(listener);
							});
						}
					}
				}
				return response(200, '{"featureVariables":{},"assignmentContext":""}');
			});
			try {
				await ready();
				await service['refetchAssignments']();
				assert.deepStrictEqual({
					urls: requestedUrls,
					identities: requestedFilters.map(filters => filters.copilottrackingid),
					value: await service.getTreatment(treatmentName),
					aborted,
				}, {
					urls: [signedOutEndpoints[0], signedOutEndpoints[1], signedOutEndpoints[1]],
					identities: [undefined, undefined, undefined],
					value: undefined,
					aborted: failure === 'timeout',
				});
			} finally {
				service.dispose();
			}
		}));
	}

	for (const winner of [0, 1, 2, undefined] as const) {
		test(`staggers discovery and cancels outstanding work with ${winner === undefined ? 'a shared deadline' : `winner ${winner}`}`, () => runWithFakedTimers({}, async () => {
			const { service, ready, requestedUrls, setResponse } = createService(true, 'signedOut');
			const starts: number[] = [];
			const cancelled: (string | undefined)[] = [];
			setResponse(async (options, token) => {
				starts.push(Date.now());
				if (winner !== undefined && options.url === signedOutEndpoints[winner]) {
					return response(200, '{"featureVariables":{},"assignmentContext":""}');
				}
				return new Promise<IRequestContext>((_resolve, reject) => {
					const listener = store.add(token.onCancellationRequested(() => {
						cancelled.push(options.url);
						listener.dispose();
						reject(new Error('Aborted'));
					}));
				});
			});
			try {
				await ready();
				const elapsed = Date.now() - starts[0];
				await timeout(1000);
				const count = winner === undefined ? 3 : winner + 1;
				assert.deepStrictEqual({
					urls: requestedUrls,
					starts: starts.map(start => start - starts[0]),
					elapsed,
					cancelled,
				}, {
					urls: signedOutEndpoints.slice(0, count),
					starts: [0, 1000, 2000].slice(0, count),
					elapsed: winner === undefined ? 5000 : winner * 1000,
					cancelled: signedOutEndpoints.slice(0, winner ?? 3),
				});
			} finally {
				service.dispose();
			}
		}));
	}

	test('does not hedge a remembered host and rediscovers after it stops responding', () => runWithFakedTimers({}, async () => {
		const { service, ready, requestedUrls, setResponse } = createService(true, 'signedOut');
		let hangPreferred = false;
		setResponse(async (options, token) => {
			if (hangPreferred && options.url === signedOutEndpoints[0]) {
				return new Promise<IRequestContext>((_resolve, reject) => {
					const listener = store.add(token.onCancellationRequested(() => {
						listener.dispose();
						reject(new Error('Aborted'));
					}));
				});
			}
			return response(200, '{"featureVariables":{},"assignmentContext":""}');
		});
		try {
			await ready();
			hangPreferred = true;
			await service['refetchAssignments']();
			await service['refetchAssignments']();
			assert.deepStrictEqual(requestedUrls, [signedOutEndpoints[0], signedOutEndpoints[0], signedOutEndpoints[0], signedOutEndpoints[1]]);
		} finally {
			service.dispose();
		}
	}));

	for (const { name, accountState, plan, resolvesLate, urls } of [
		{ name: 'a managed account without an endpoint resolves after startup', accountState: 'signedOut', plan: 'enterprise', resolvesLate: true, urls: [] },
		{ name: 'an account with an endpoint is known before initialization', accountState: 'signedIn', plan: 'individual', resolvesLate: false, urls: ['https://assignments.example.com/api/v1/assignments'] },
	] as const) {
		test(`creates a single client when ${name}`, () => runWithFakedTimers({}, async () => {
			const accountReady = new DeferredPromise<void>();
			const { service, ready, requestedUrls, changeAccount } = createService(true, accountState, { plan, accountReady });
			try {
				if (resolvesLate) {
					changeAccount(undefined);
				}
				await accountReady.complete();
				await ready();
				assert.deepStrictEqual({ clients: service['setupGeneration'], urls: requestedUrls }, { clients: 1, urls });
			} finally {
				service.dispose();
				await accountReady.complete();
			}
		}));
	}

	test('a late successful loser cannot replace the remembered winner', () => runWithFakedTimers({}, async () => {
		const { service, ready, requestedUrls, setResponse } = createService(true, 'signedOut');
		const late = new DeferredPromise<IRequestContext>();
		setResponse(async options => options.url === signedOutEndpoints[0]
			? late.p
			: response(200, '{"featureVariables":{},"assignmentContext":""}'));
		try {
			await ready();
			await late.complete(response(200, '{"featureVariables":{},"assignmentContext":""}'));
			await timeout(0);
			await service['refetchAssignments']();
			assert.deepStrictEqual(requestedUrls, [signedOutEndpoints[0], signedOutEndpoints[1], signedOutEndpoints[1]]);
		} finally {
			service.dispose();
			await late.complete(response(503, 'Unavailable'));
		}
	}));

	test('tries each signed-out host once, retries after total failure, and replaces a failed preferred host', () => runWithFakedTimers({}, async () => {
		const { service, ready, requestedUrls, setResponse, changeAccount } = createService(true, 'signedOut');
		let workingEndpoint: string | undefined;
		setResponse(async options => options.url === workingEndpoint
			? response(200, '{"featureVariables":{},"assignmentContext":""}')
			: response(503, 'Unavailable'));
		try {
			await ready();
			workingEndpoint = signedOutEndpoints[2];
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			await ready();
			workingEndpoint = signedOutEndpoints[1];
			await service['refetchAssignments']();
			await service['refetchAssignments']();
			const discovered = requestedUrls.slice();
			changeAccount(signedOutEndpoints[2].replace('/api/v1/assignments', ''));
			await ready();
			assert.deepStrictEqual({ discovered, signedIn: requestedUrls.slice(discovered.length) }, {
				discovered: [
					...signedOutEndpoints, ...signedOutEndpoints,
					signedOutEndpoints[2], signedOutEndpoints[0], signedOutEndpoints[1], signedOutEndpoints[1],
				],
				signedIn: [signedOutEndpoints[2]],
			});
		} finally {
			service.dispose();
		}
	}));

	test('stops anonymous discovery when sign-in supersedes an in-flight attempt', () => runWithFakedTimers({}, async () => {
		const { service, ready, requestedUrls, requestedFilters, setResponse, changeAccount } = createService(true, 'signedOut');
		const pending = new DeferredPromise<IRequestContext>();
		const started = new DeferredPromise<void>();
		setResponse(async () => {
			await started.complete();
			return pending.p;
		});
		try {
			const initial = ready();
			await started.p;
			setResponse(undefined);
			changeAccount('https://exp.individual.githubcopilot.com');
			await ready();
			await pending.complete(response(503, 'Unavailable'));
			await initial;
			assert.deepStrictEqual({
				urls: requestedUrls,
				identities: requestedFilters.map(filters => filters.copilottrackingid),
			}, {
				urls: [signedOutEndpoints[0], signedOutEndpoints[2]],
				identities: [undefined, 'account-user'],
			});
		} finally {
			service.dispose();
			await pending.complete(response(503, 'Unavailable'));
		}
	}));

	test('refreshes consumed values every hour and publishes assignment removal with unchanged context', () => runWithFakedTimers({}, async () => {
		const { service, ready, requests, setValue } = createService();
		try {
			await ready();
			const initial = await service.getTreatment(treatmentName);
			const initialRequests = requests();
			let notifications = 0;
			store.add(service.onDidRefetchAssignments(() => notifications++));
			setValue('updated');
			await timeout(ASSIGNMENT_REFETCH_INTERVAL - 1);
			const beforeDeadline = requests() - initialRequests;
			await timeout(1);
			await service['refetchPromise'];
			const updated = await service.getTreatment(treatmentName);
			setValue(undefined);
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			await service['refetchPromise'];
			const removed = await service.getTreatmentWithAssignment(treatmentName);
			assert.deepStrictEqual({
				initial, beforeDeadline, updated, removed: removed.value, assigned: await removed.hasAssignment,
				requests: requests() - initialRequests, notifications,
			}, {
				initial: 'initial', beforeDeadline: 0, updated: 'updated', removed: undefined, assigned: false,
				requests: 2, notifications: 2,
			});
		} finally {
			service.dispose();
		}
	}));

	test('does not overlap refreshes and schedules the next poll after completion', () => runWithFakedTimers({}, async () => {
		const { service, ready, requests, setWaitForResponse } = createService();
		try {
			await ready();
			const initialRequests = requests();
			const response = new DeferredPromise<void>();
			setWaitForResponse(() => response.p);
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			const pending = service['refetchPromise'];
			const concurrent = service['refetchAssignments']();
			await timeout(ASSIGNMENT_REFETCH_INTERVAL * 2);
			const pendingRequests = requests() - initialRequests;
			await response.complete();
			await pending;
			await timeout(ASSIGNMENT_REFETCH_INTERVAL - 1);
			const beforeDeadline = requests() - initialRequests;
			await timeout(1);
			await service['refetchPromise'];
			assert.deepStrictEqual({
				coalesced: pending === concurrent, pendingRequests, beforeDeadline, requests: requests() - initialRequests,
			}, { coalesced: true, pendingRequests: 1, beforeDeadline: 1, requests: 2 });
		} finally {
			service.dispose();
		}
	}));

	test('logs a failed refresh and retries on the next interval', () => runWithFakedTimers({}, async () => {
		const { service, ready, requests, errors, setValue } = createService();
		try {
			const client = (await ready())!;
			const initialRequests = requests();
			const fetch = sinon.stub(client, 'getTreatmentVariableAsync').rejects(new Error('test refresh failure'));
			store.add(toDisposable(() => fetch.restore()));
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			await service['refetchPromise'];
			const failedAttempts = fetch.callCount;
			fetch.restore();
			setValue('recovered');
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			await service['refetchPromise'];
			assert.deepStrictEqual({
				failedAttempts, errors, requests: requests() - initialRequests, value: await service.getTreatment(treatmentName),
			}, {
				failedAttempts: 1, errors: ['WorkbenchAssignmentService: Failed to refresh assignments'], requests: 1, value: 'recovered',
			});
		} finally {
			service.dispose();
		}
	}));

	for (const { kind, key, initial, updated } of [
		{ kind: 'sku', key: 'github_core_copilotsku', initial: 'pro', updated: 'business' },
		{ kind: 'token', key: 'github_core_issn', initial: '0', updated: '1' },
		{ kind: 'staff', key: 'github_core_isghormsftstaff', initial: '0', updated: '1' },
	] as const) {
		test(`refetches immediately after ${kind} filter changes during a request`, () => runWithFakedTimers({}, async () => {
			const { service, ready, requests, requestedFilters, setValue, setWaitForResponse, changeFilters } = createService();
			try {
				await ready();
				const initialRequests = requests();
				const response = new DeferredPromise<void>();
				setWaitForResponse(() => response.p);
				await timeout(ASSIGNMENT_REFETCH_INTERVAL);
				const pending = service['refetchPromise'];
				const requestTime = Date.now();
				changeFilters(kind, true);
				changeFilters(kind, false);
				changeFilters(kind, true);
				setValue('updated');
				const pendingRequests = requests() - initialRequests;
				await response.complete();
				await pending;
				await timeout(0);
				await service['refetchPromise'];
				const immediate = {
					requests: requests() - initialRequests,
					value: await service.getTreatment(treatmentName),
					delay: Date.now() - requestTime,
				};
				await timeout(ASSIGNMENT_REFETCH_INTERVAL - 1);
				const beforeDeadline = requests() - initialRequests;
				await timeout(1);
				await service['refetchPromise'];
				assert.deepStrictEqual({
					pendingRequests, immediate, beforeDeadline, filters: requestedFilters.slice(initialRequests).map(filters => filters[key]),
				}, {
					pendingRequests: 1, immediate: { requests: 2, value: 'updated', delay: 0 }, beforeDeadline: 2, filters: [initial, updated, updated],
				});
			} finally {
				service.dispose();
			}
		}));
	}

	test('retries changed filters immediately when the in-flight refresh rejects', () => runWithFakedTimers({}, async () => {
		const { service, ready, requests, errors, setValue, changeFilters } = createService();
		try {
			const client = (await ready())!;
			const initialRequests = requests();
			const response = new DeferredPromise<void>();
			const fetch = sinon.stub(client, 'getTreatmentVariableAsync').callsFake(async () => {
				await response.p;
				throw new Error('test refresh failure');
			});
			store.add(toDisposable(() => fetch.restore()));
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			const pending = service['refetchPromise'];
			changeFilters('sku', true);
			setValue('recovered');
			fetch.restore();
			await response.complete();
			await pending;
			await timeout(0);
			await service['refetchPromise'];
			assert.deepStrictEqual({
				errors, requests: requests() - initialRequests, value: await service.getTreatment(treatmentName),
			}, {
				errors: ['WorkbenchAssignmentService: Failed to refresh assignments'], requests: 1, value: 'recovered',
			});
		} finally {
			service.dispose();
		}
	}));

	test('a replaced client cannot publish a stale refresh or reschedule the new client', () => runWithFakedTimers({}, async () => {
		const { service, ready, setValue, setWaitForResponse, changeEndpoint, changeFilters, requests } = createService();
		try {
			await ready();
			const response = new DeferredPromise<void>();
			setValue('stale');
			setWaitForResponse(() => response.p);
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			const staleRefresh = service['refetchPromise'];
			changeFilters('sku', true);
			setWaitForResponse(async () => { });
			setValue('replacement');
			changeEndpoint();
			await ready();
			const replacementRequests = requests();
			let notifications = 0;
			store.add(service.onDidRefetchAssignments(() => notifications++));
			await timeout(ASSIGNMENT_REFETCH_INTERVAL - 1);
			await response.complete();
			await staleRefresh;
			const beforeDeadline = { value: await service.getTreatment(treatmentName), notifications };
			await timeout(1);
			await service['refetchPromise'];
			assert.deepStrictEqual({
				beforeDeadline, requests: requests() - replacementRequests, notifications,
			}, {
				beforeDeadline: { value: 'replacement', notifications: 0 }, requests: 1, notifications: 1,
			});
		} finally {
			service.dispose();
		}
	}));

	test('disposal during a refresh stops publication and future polls', () => runWithFakedTimers({}, async () => {
		const { service, ready, requests, setWaitForResponse, changeFilters } = createService();
		try {
			await ready();
			const response = new DeferredPromise<void>();
			setWaitForResponse(() => response.p);
			await timeout(ASSIGNMENT_REFETCH_INTERVAL);
			const pending = service['refetchPromise'];
			changeFilters('sku', true);
			const requestsAtDisposal = requests();
			service.dispose();
			await response.complete();
			await pending;
			await timeout(ASSIGNMENT_REFETCH_INTERVAL * 2);
			assert.deepStrictEqual({
				requests: requests() - requestsAtDisposal, scheduled: service['refetchScheduler'].isScheduled(),
			}, { requests: 0, scheduled: false });
		} finally {
			service.dispose();
		}
	}));

	test('waits for the initial fetch and ignores a replaced client completing initialization', () => runWithFakedTimers({}, async () => {
		const { service, ready, requests, setValue, setWaitForResponse, changeEndpoint } = createService();
		try {
			const response = new DeferredPromise<void>();
			setWaitForResponse(() => response.p);
			const initialClient = (await service['tasClient'])!;
			await timeout(ASSIGNMENT_REFETCH_INTERVAL * 2);
			const pending = { requests: requests(), scheduled: service['refetchScheduler'].isScheduled() };
			setWaitForResponse(async () => { });
			setValue('replacement');
			changeEndpoint();
			await ready();
			const replacementRequests = requests();
			await timeout(ASSIGNMENT_REFETCH_INTERVAL - 1);
			await response.complete();
			await initialClient.initialFetch;
			await timeout(1);
			await service['refetchPromise'];
			assert.deepStrictEqual({
				pending, requests: requests() - replacementRequests, value: await service.getTreatment(treatmentName),
			}, {
				pending: { requests: 1, scheduled: false }, requests: 1, value: 'replacement',
			});
		} finally {
			service.dispose();
		}
	}));

	test('does not start polling if disposed before the initial fetch completes', () => runWithFakedTimers({}, async () => {
		const { service, requests, setWaitForResponse } = createService();
		try {
			const response = new DeferredPromise<void>();
			setWaitForResponse(() => response.p);
			const client = (await service['tasClient'])!;
			await timeout(1);
			service.dispose();
			await response.complete();
			await client.initialFetch;
			const requestsAtDisposal = requests();
			await timeout(ASSIGNMENT_REFETCH_INTERVAL * 2);
			assert.deepStrictEqual({
				requests: requests() - requestsAtDisposal, scheduled: service['refetchScheduler'].isScheduled(),
			}, { requests: 0, scheduled: false });
		} finally {
			service.dispose();
		}
	}));

	test('does not start a client or polling when experiments are disabled', () => runWithFakedTimers({}, async () => {
		const { service, ready, requests } = createService(false, 'signedOut');
		try {
			await ready();
			await timeout(ASSIGNMENT_REFETCH_INTERVAL * 2);
			assert.deepStrictEqual({
				client: service['tasClient'], requests: requests(), scheduled: service['refetchScheduler'].isScheduled(),
			}, { client: undefined, requests: 0, scheduled: false });
		} finally {
			service.dispose();
		}
	}));
	/* eslint-enable local/code-no-bracket-notation-for-identifiers */
});
