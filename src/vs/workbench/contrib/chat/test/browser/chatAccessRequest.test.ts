/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IDefaultAccount, IEntitlementsData } from '../../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { ChatAccessRequestController } from '../../browser/chatStatus/chatAccessRequest.js';

suite('ChatAccessRequestController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers({ now: 1700000000000, toFake: ['Date'] });
	});

	teardown(() => sinon.restore());

	function createAccount(data: Partial<IEntitlementsData> = {}, sessionId = 'session-a'): IDefaultAccount {
		return {
			accountName: 'example',
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
			enterprise: false,
			sessionId,
			entitlementsDataFetchedAt: Date.now() - 1,
			entitlementsData: {
				access_type_sku: '',
				chat_enabled: false,
				assigned_date: '',
				can_signup_for_limited: true,
				copilot_plan: '',
				organization_login_list: [],
				analytics_tracking_id: 'canonical-a',
				can_request_copilot_access: true,
				copilot_access_request_assignment: {
					variant: 'treatment', assignment_context: 'assignment-a', data_version: 1
				},
				...data
			}
		};
	}

	function createController(initial: IDefaultAccount | null = createAccount(), config: Record<string, unknown> = {}) {
		let account = initial;
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const sessionsChanged = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		const sentimentChanged = store.add(new Emitter<void>());
		const sentiment: IChatSentiment = {};
		const events: object[] = [];
		const opened: { uri: string; options: OpenOptions | undefined }[] = [];
		const notifications = { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
		const configuration = new TestConfigurationService(config);
		store.add(configuration.onDidChangeConfigurationEmitter);
		const log = new NullLogService();
		const errors = sinon.spy(log, 'error');
		const setAccount = (value: IDefaultAccount | null) => {
			account = value;
			accountChanged.fire(value);
		};
		let refresh = async () => {
			clock.tick(1);
			setAccount(account ? { ...account, entitlementsDataFetchedAt: Date.now() } : null);
			return account;
		};
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IDefaultAccountService, upcastPartial<IDefaultAccountService>({
			get currentDefaultAccount() { return account; },
			onDidChangeDefaultAccount: accountChanged.event,
			refresh: () => refresh(),
		}));
		instantiation.stub(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
			sentiment,
			onDidChangeSentiment: sentimentChanged.event,
		}));
		instantiation.stub(IAuthenticationService, upcastPartial<IAuthenticationService>({ onDidChangeSessions: sessionsChanged.event }));
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(ITelemetryService, upcastPartial<ITelemetryService>({
			publicLog2: (name, data) => { events.push({ name, data }); },
		}));
		instantiation.stub(IOpenerService, upcastPartial<IOpenerService>({
			open: async (uri, options) => {
				opened.push({ uri: typeof uri === 'string' ? uri : uri.toString(true), options });
				return true;
			},
		}));
		instantiation.stub(INotificationService, upcastPartial<INotificationService>(notifications));
		instantiation.stub(ILogService, log);
		const controller = store.add(instantiation.createInstance(ChatAccessRequestController));
		return {
			controller, setAccount, events, opened, errors, notifications, sentiment, sentimentChanged, sessionsChanged, configuration,
			setRefresh: (value: () => Promise<IDefaultAccount | null>) => { refresh = value; },
			fresh: (value: IDefaultAccount) => {
				clock.tick(1);
				setAccount({ ...value, entitlementsDataFetchedAt: Date.now() });
			}
		};
	}

	test('requires fresh authoritative eligibility and explicit treatment, without paid entitlement or org heuristics', async () => {
		const results = [];
		for (const plan of ['', 'individual', 'individual_pro', 'business', 'enterprise']) {
			const h = createController(createAccount({ copilot_plan: plan }));
			await h.controller.refresh();
			results.push(h.controller.visible);
		}
		assert.deepStrictEqual(results, [true, true, true, true, true]);
	});

	test('hides managed, seated, no-org, pending and unknown users when the authority withholds eligibility', async () => {
		const results = [];
		for (const eligible of [false, undefined]) {
			for (const plan of ['', 'individual', 'business', 'enterprise']) {
				const h = createController(createAccount({ can_request_copilot_access: eligible, copilot_plan: plan }));
				await h.controller.refresh();
				h.controller.recordTrigger();
				await h.controller.open();
				results.push({ visible: h.controller.visible, events: h.events, opened: h.opened });
			}
		}
		assert.deepStrictEqual(results, Array.from({ length: 8 }, () => ({ visible: false, events: [], opened: [] })));
	});

	test('rejects missing or malformed assignment and tracking data', async () => {
		const valid = createAccount().entitlementsData!;
		const changes = [
			{ copilot_access_request_assignment: undefined },
			{ can_request_copilot_access: 'true' },
			{ analytics_tracking_id: null },
			{ analytics_tracking_id: '' },
			{ analytics_tracking_id: ' ' },
			{ copilot_access_request_assignment: { ...valid.copilot_access_request_assignment, variant: 'default' } },
			{ copilot_access_request_assignment: { ...valid.copilot_access_request_assignment, variant: true } },
			{ copilot_access_request_assignment: { ...valid.copilot_access_request_assignment, assignment_context: '' } },
			{ copilot_access_request_assignment: { ...valid.copilot_access_request_assignment, assignment_context: '  ' } },
			...[undefined, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1'].map(data_version => ({
				copilot_access_request_assignment: { ...valid.copilot_access_request_assignment, data_version }
			})),
		];
		const results = [];
		for (const change of changes) {
			const account = createAccount();
			const entitlementsData: IEntitlementsData = JSON.parse(JSON.stringify({ ...valid, ...change }));
			const h = createController({ ...account, entitlementsData });
			await h.controller.refresh();
			results.push(h.controller.visible);
		}
		assert.deepStrictEqual(results, changes.map(() => false));
	});

	test('accepts the inclusive safe-integer version boundaries', async () => {
		const results = [];
		for (const data_version of [0, Number.MAX_SAFE_INTEGER]) {
			const h = createController(createAccount({
				copilot_access_request_assignment: { variant: 'treatment', assignment_context: 'assignment-a', data_version }
			}));
			await h.controller.refresh();
			h.controller.recordTrigger();
			results.push({ visible: h.controller.visible, triggers: h.events.length });
		}
		assert.deepStrictEqual(results, [{ visible: true, triggers: 1 }, { visible: true, triggers: 1 }]);
	});

	test('records explicit control trigger only and records treatment impression separately', async () => {
		const control = createController(createAccount({
			copilot_access_request_assignment: { variant: 'control', assignment_context: 'assignment-a', data_version: 0 }
		}));
		const treatment = createController();
		await control.controller.refresh();
		await treatment.controller.refresh();
		assert.deepStrictEqual([control.events, treatment.events], [[], []]);
		for (const h of [control, treatment]) {
			h.controller.recordTrigger();
			h.controller.recordImpression();
			h.controller.recordTrigger();
			h.controller.recordImpression();
		}
		const event = (action: string, variant: string, dataVersion: number) => ({
			name: 'copilotAccessRequest',
			data: { action, variant, assignmentContext: 'assignment-a', dataVersion, copilotTrackingId: 'canonical-a' }
		});
		assert.deepStrictEqual([control.controller.visible, control.events, treatment.events], [
			false,
			[event('trigger', 'control', 0)],
			[event('trigger', 'treatment', 1), event('impression', 'treatment', 1)]
		]);
	});

	test('opens only the fixed HTTPS chooser after a fresh recheck and never reports request creation', async () => {
		const h = createController();
		await h.controller.refresh();
		h.controller.recordImpression();
		await h.controller.open();
		assert.deepStrictEqual({ opened: h.opened, events: h.events.length }, {
			opened: [{
				uri: 'https://github.com/settings/copilot/features?contextual_access=1#copilot-access-requests',
				options: { openExternal: true, allowContributedOpeners: false, allowCommands: false }
			}],
			events: 3
		});
	});

	test('does not use stale data after a cached or failed refresh', async () => {
		const results = [];
		for (const fail of [false, true]) {
			const account = createAccount();
			const h = createController(account);
			h.setRefresh(async () => {
				if (fail) {
					throw new Error('offline');
				}
				return account;
			});
			await h.controller.refresh();
			results.push({ visible: h.controller.visible, loggedError: h.errors.called });
		}
		assert.deepStrictEqual(results, [{ visible: false, loggedError: false }, { visible: false, loggedError: true }]);
	});

	test('hides immediately and rejects late completion after sign-out, switch, session replacement or disposal', async () => {
		const results = [];
		for (const change of ['signout', 'switch', 'replace', 'dispose']) {
			const h = createController();
			await h.controller.refresh();
			const pending = new DeferredPromise<IDefaultAccount | null>();
			h.setRefresh(() => pending.p);
			const opening = h.controller.open();
			if (change === 'signout') {
				h.setAccount(null);
			} else if (change === 'switch') {
				h.setAccount(createAccount({ analytics_tracking_id: 'canonical-b' }, 'session-b'));
			} else if (change === 'replace') {
				h.setAccount(createAccount({}, 'replacement-session'));
			} else {
				h.controller.dispose();
			}
			await pending.complete(null);
			await opening;
			results.push({ visible: h.controller.visible, opened: h.opened });
		}
		assert.deepStrictEqual(results, Array.from({ length: 4 }, () => ({ visible: false, opened: [] })));
	});

	test('rejects account A to B to A during an outstanding refresh', async () => {
		const account = createAccount();
		const h = createController(account);
		const pending = new DeferredPromise<void>();
		const refreshing = h.controller.refresh(pending.p);
		h.setAccount(createAccount({}, 'session-b'));
		h.fresh(account);
		await pending.complete();
		await refreshing;
		assert.strictEqual(h.controller.visible, false);
	});

	test('clears an action before authentication session reconciliation completes', async () => {
		const h = createController();
		await h.controller.refresh();
		h.sessionsChanged.fire({ providerId: 'github', label: 'GitHub', event: { added: [], removed: [], changed: [] } });
		assert.strictEqual(h.controller.visible, false);
	});

	test('discards an older overlapping refresh', async () => {
		const h = createController();
		const pending = new DeferredPromise<void>();
		const older = h.controller.refresh(pending.p);
		await h.controller.refresh();
		h.setAccount(createAccount({ can_request_copilot_access: false }));
		await pending.complete();
		await older;
		assert.strictEqual(h.controller.visible, false);
	});

	test('does not open after eligibility or assignment changes while clicking', async () => {
		const results = [];
		for (const data of [
			{ can_request_copilot_access: false },
			{ copilot_access_request_assignment: { variant: 'control' as const, assignment_context: 'assignment-b', data_version: 2 } },
			{ copilot_access_request_assignment: undefined },
		]) {
			const h = createController();
			await h.controller.refresh();
			h.setRefresh(async () => {
				h.fresh(createAccount(data));
				return null;
			});
			await h.controller.open();
			results.push({ visible: h.controller.visible, opened: h.opened });
		}
		assert.deepStrictEqual(results, Array.from({ length: 3 }, () => ({ visible: false, opened: [] })));
	});

	test('honors telemetry opt-out and AI visibility preferences', async () => {
		const results = [];
		for (const config of [{ 'telemetry.telemetryLevel': 'off' }, { 'chat.disableAIFeatures': true }]) {
			const h = createController(createAccount(), config);
			await h.controller.refresh();
			h.controller.recordTrigger();
			results.push({ visible: h.controller.visible, events: h.events });
		}
		for (const field of ['hidden', 'disabled', 'disabledInWorkspace', 'untrusted'] as const) {
			const h = createController();
			await h.controller.refresh();
			h.sentiment[field] = true;
			h.sentimentChanged.fire();
			h.controller.recordImpression();
			results.push({ visible: h.controller.visible, events: h.events });
		}
		assert.deepStrictEqual(results, Array.from({ length: 6 }, () => ({ visible: false, events: [] })));
	});
});
