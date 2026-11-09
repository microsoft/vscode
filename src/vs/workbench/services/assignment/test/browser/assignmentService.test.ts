/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { ICopilotTokenInfo, IDefaultAccount, IEntitlementsData } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IRequestOptions } from '../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ASSIGNMENT_REFETCH_INTERVAL } from '../../../../../platform/assignment/common/assignment.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatEntitlementService } from '../../../chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { IExtensionService } from '../../../extensions/common/extensions.js';
import { WorkbenchAssignmentService } from '../../common/assignmentService.js';

// The real TAS client loads through the workbench's browser URL resolver, so these tests need a browser loader.
suite('WorkbenchAssignmentService polling', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const treatmentName = 'config.test.polling';

	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Await client readiness and exercise refresh races without public test-only APIs. */
	function createService(enabled = true) {
		const instantiationService = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ 'workbench.enableExperiments': enabled, 'telemetry.telemetryLevel': 'all' });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
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
			override endpoints = { exp: 'https://assignments.example.com' };
		}();
		const account = new class extends mock<IDefaultAccount>() {
			override readonly entitlementsData = entitlements;
		}();
		const tokenChanged = store.add(new Emitter<ICopilotTokenInfo | null>());
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override readonly currentDefaultAccount = account;
			override readonly onDidChangeDefaultAccount = accountChanged.event;
			override copilotTokenInfo: ICopilotTokenInfo | null = { sn: '0' };
			override readonly onDidChangeCopilotTokenInfo = tokenChanged.event;
			override async getDefaultAccount() { return account; }
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
		}();
		instantiationService.stub(IChatEntitlementService, chatEntitlementService);

		let value: string | undefined = 'initial';
		const requestedFilters: Record<string, string>[] = [];
		let waitForResponse = async () => { };
		instantiationService.stub(IRequestService, new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions) {
				assert.ok(options.data);
				const body: { userParams: Record<string, string> } = JSON.parse(options.data);
				requestedFilters.push(body.userParams);
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
			const client = await service['tasClient'];
			await client?.initialFetch;
			await service['refetchPromise'];
			await service['overrideInitDelay'];
			return client;
		};
		return {
			service, ready, errors, requestedFilters,
			requests: () => requestedFilters.length,
			setValue: (next: string | undefined) => { value = next; },
			setWaitForResponse: (wait: () => Promise<void>) => { waitForResponse = wait; },
			changeFilters: (kind: 'sku' | 'token' | 'staff', updated: boolean) => {
				if (kind === 'token') {
					defaultAccountService.copilotTokenInfo = { sn: updated ? '1' : '0' };
					tokenChanged.fire(defaultAccountService.copilotTokenInfo);
				} else {
					if (kind === 'sku') {
						chatEntitlementService.sku = updated ? 'business' : 'pro';
					} else {
						chatEntitlementService.isInternal = updated;
					}
					entitlementChanged.fire();
				}
			},
			changeEndpoint: () => {
				entitlements.endpoints = { exp: 'https://replacement.example.com' };
				accountChanged.fire(account);
			},
		};
	}

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
		const { service, ready, requests } = createService(false);
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
