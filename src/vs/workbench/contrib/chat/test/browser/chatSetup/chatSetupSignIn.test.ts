/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceTimeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, ChatEntitlementContext, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IChatWidgetService } from '../../../browser/chat.js';
import { ChatSetupSource, ChatSetupStrategy, IChatSetupRunOptions } from '../../../browser/chatSetup/chatSetup.js';
import { ChatSetupController } from '../../../browser/chatSetup/chatSetupController.js';
import { ChatSetup, ChatSetupDialog } from '../../../browser/chatSetup/chatSetupRunner.js';
import { IChatMicrosoftSignInProbeService } from '../../../browser/chatSetup/chatSetupMicrosoftProbe.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { NullAgentHostService } from '../../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { copilotAccountContextKey } from '../../../../../../platform/agentHost/common/copilotAccountContext.js';
import { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostCopilotM365EnabledSettingId, ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';

suite('Chat setup dialog external sign-in', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const account: IDefaultAccount = {
		accountName: 'test-account',
		sessionId: 'test-session',
		authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
		enterprise: false,
	};

	function createSetup(allowContinueWithoutSignIn = false, initialAccount: IDefaultAccount | null = null, setupResult: Promise<boolean> = Promise.resolve(true), host: IAgentHostService = new NullAgentHostService(), configuration = new TestConfigurationService()) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentHostService, host);
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const cancellation = store.add(new CancellationTokenSource());
		const dialogShown = new DeferredPromise<void>();
		const dialogResult = new DeferredPromise<ChatSetupStrategy>();
		const setupStarted = new DeferredPromise<void>();
		const setupCalls: string[] = [];
		const errors: (string | Error)[] = [];
		let currentAccount = initialAccount;
		let dialogDisposed = false;
		let completed = false;
		let dismissed = false;
		let listeningDuringProviderSetup = false;
		const state = {
			hidden: false,
			copilotAccountReady: host instanceof NullAgentHostService && host.authenticationPending.get() ? false : undefined,
			entitlement: initialAccount ? ChatEntitlement.Pro : ChatEntitlement.Unknown,
			sku: undefined,
			organisations: undefined,
			isStaff: undefined,
			copilotTrackingId: undefined,
		};
		const setAccount = (value: IDefaultAccount | null) => {
			currentAccount = value;
			state.entitlement = value ? ChatEntitlement.Pro : ChatEntitlement.Unknown;
			accountChanged.fire(value);
		};
		const context = upcastPartial<ChatEntitlementContext>({
			state,
			update: async update => {
				if (hasKey(update, { completed: true })) {
					completed = update.completed;
				}
				if (hasKey(update, { hidden: true })) {
					state.hidden = update.hidden;
				}
			},
		});
		const controller = new Lazy(() => upcastPartial<ChatSetupController>({
			setup: async options => {
				setupCalls.push(options?.useEnterpriseProvider ? 'default (enterprise)' : 'default');
				void setupStarted.complete();
				return setupResult;
			},
			setupWithProvider: async () => {
				setupCalls.push('provider');
				listeningDuringProviderSetup = accountChanged.hasListeners();
				setAccount(account);
				void setupStarted.complete();
				return setupResult;
			},
		}));
		instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.USAGE, publicLog2() { } });
		instantiationService.stub(ILogService, { error: message => errors.push(message) });
		instantiationService.stub(IChatEntitlementService, { entitlement: state.entitlement, anonymous: false });
		instantiationService.stub(IChatWidgetService, { revealWidget: async () => undefined });
		instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted: () => true });
		instantiationService.stub(IWorkspaceTrustRequestService, { requestWorkspaceTrust: async () => true });
		instantiationService.stub(IDefaultAccountService, {
			get currentDefaultAccount() { return currentAccount; },
			onDidChangeDefaultAccount: accountChanged.event,
			getDefaultAccountAuthenticationProvider: () => currentAccount?.authenticationProvider ?? account.authenticationProvider,
			resolveGitHubUrl: path => `https://github.com/${path}`,
		});
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IChatMicrosoftSignInProbeService, { offerMicrosoftSignIn: constObservable(false), notifySignInShown() { } });
		instantiationService.stub(ILayoutService, {});
		instantiationService.stubInstance(ChatSetupDialog, {
			show: () => {
				void dialogShown.complete();
				return dialogResult.p;
			},
			dispose: () => {
				dialogDisposed = true;
				if (!dialogResult.isSettled) {
					void dialogResult.complete(ChatSetupStrategy.Canceled);
				}
			},
		});
		const setup = instantiationService.createInstance(ChatSetup, context, controller);
		const options: IChatSetupRunOptions = {
			forceSignInDialog: true,
			autoDismissOnSignIn: true,
			allowContinueWithoutSignIn,
			disableCloseButton: !allowContinueWithoutSignIn,
			onDidDismissDialog: allowContinueWithoutSignIn ? () => dismissed = true : undefined,
		};
		return {
			dialogShown,
			dialogResult,
			setupStarted,
			errors,
			setAccount,
			hide: () => { state.hidden = true; },
			cancel: () => cancellation.cancel(),
			run: (overrides?: IChatSetupRunOptions) => setup.run({
				...options,
				telemetrySource: ChatSetupSource.SessionsSetup,
				cancellationToken: cancellation.token,
				...overrides,
			}),
			snapshot: () => ({ dialogDisposed, completed, dismissed, setupCalls, listening: accountChanged.hasListeners(), listeningDuringProviderSetup }),
		};
	}

	test('cold disabled-host setup enables AI before awaiting the root subscription', async () => {
		const changed = store.add(new Emitter<RootState>());
		const started = store.add(new Emitter<void>());
		const available = observableValue('connectionAvailable', false);
		let root: RootState | undefined;
		const host = new class extends NullAgentHostService {
			override readonly authenticationPending = constObservable(true);
			readonly connectionAvailable = available;
			override readonly onAgentHostStart = started.event;
			override get rootState() {
				return { value: root, verifiedValue: root, onDidChange: changed.event, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
		}();
		const writes: string[] = [];
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				writes.push(key);
				await this.setUserConfiguration(key, value);
				if (key === ChatAIDisabledSettingId && value === false) {
					root = { agents: [] };
					available.set(true, undefined);
					started.fire();
					changed.fire(root);
				}
			}
		}({ [ChatAIDisabledSettingId]: true });
		const f = createSetup(false, null, Promise.resolve(true), host, configuration);
		f.hide();
		const pending = f.run({ setupStrategy: ChatSetupStrategy.DefaultSetup });
		const result = await raceTimeout(pending, 100);
		f.cancel();
		await pending;
		assert.deepStrictEqual({ success: result?.success, enabled: configuration.getValue(ChatAIDisabledSettingId), wroteEnablement: writes.includes(ChatAIDisabledSettingId) }, {
			success: true, enabled: false, wroteEnablement: true,
		});
	});

	test('legacy visibility reset errors use the shared handled-result boundary', async () => {
		const configuration = new class extends TestConfigurationService {
			override async updateValue(): Promise<void> { throw new Error('visibility reset failed'); }
		}();
		const f = createSetup(false, null, Promise.resolve(true), new NullAgentHostService(), configuration);
		const result = await f.run({ setupStrategy: ChatSetupStrategy.DefaultSetup });
		assert.deepStrictEqual({ success: result.success, error: result.error?.message, calls: f.snapshot().setupCalls, errors: f.errors.length }, {
			success: false, error: 'visibility reset failed', calls: [], errors: 1,
		});
	});

	test('root errors and unsupported account state return handled failures', async () => {
		const observed = [];
		for (const root of [
			new Error('root unavailable'),
			{ agents: [], config: { schema: { type: 'object' as const, properties: {} }, values: { [copilotAccountContextKey]: { kind: 'unsupported' } } } },
		]) {
			const host = new class extends NullAgentHostService {
				override readonly authenticationPending = constObservable(true);
				override get rootState() {
					return { value: root, verifiedValue: root instanceof Error ? undefined : root, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
				}
			}();
			const f = createSetup(false, null, Promise.resolve(true), host, new TestConfigurationService({ [AgentHostCopilotM365EnabledSettingId]: true }));
			const result = await f.run({ setupStrategy: ChatSetupStrategy.DefaultSetup });
			observed.push({ success: result.success, error: result.error?.message, calls: f.snapshot().setupCalls, errors: f.errors.length });
		}
		assert.deepStrictEqual(observed, [
			{ success: false, error: 'root unavailable', calls: [], errors: 1 },
			{ success: false, error: 'The agent host returned an unsupported Copilot account state.', calls: [], errors: 1 },
		]);
	});

	test('canceling an enabled pending host returns a handled result without re-enabling AI', async () => {
		const host = new class extends NullAgentHostService {
			override readonly authenticationPending = constObservable(true);
			readonly connectionAvailable = constObservable(false);
			override get rootState() {
				return { value: undefined, verifiedValue: undefined, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
		}();
		const writes: string[] = [];
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string): Promise<void> { writes.push(key); }
		}();
		const f = createSetup(false, null, Promise.resolve(true), host, configuration);
		const pending = f.run({ setupStrategy: ChatSetupStrategy.DefaultSetup });
		f.cancel();
		const result = await pending;
		assert.deepStrictEqual({ result, writes, calls: f.snapshot().setupCalls, errors: f.errors }, {
			result: { success: undefined, dialogSkipped: false }, writes: [], calls: [], errors: [],
		});
	});

	test('Microsoft mode does not auto-dismiss or complete on external GitHub authentication', async () => {
		const host = new class extends NullAgentHostService {
			override readonly authenticationPending = constObservable(true);
			override get rootState() {
				const root = { agents: [], config: { schema: { type: 'object' as const, properties: {} }, values: { [copilotAccountContextKey]: { kind: 'signedOut' } } } };
				return { value: root, verifiedValue: root, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
		}();
		const f = createSetup(false, null, Promise.resolve(true), host);
		const result = f.run();
		await f.dialogShown.p;
		f.setAccount(account);
		const afterAuthentication = f.snapshot();
		f.cancel();
		await result;
		assert.deepStrictEqual({ disposed: afterAuthentication.dialogDisposed, completed: afterAuthentication.completed, calls: afterAuthentication.setupCalls },
			{ disposed: false, completed: false, calls: [] });
		const explicit = createSetup(false, null, Promise.resolve(true), host, new TestConfigurationService({ [AgentHostCopilotM365EnabledSettingId]: true }));
		let legacyProgressShown = false;
		await explicit.run({
			setupStrategy: ChatSetupStrategy.SetupWithMicrosoftProvider,
			onSignInStarted: () => { legacyProgressShown = true; },
		});
		assert.strictEqual(legacyProgressShown, false, 'Microsoft authentication owns its progress dialog');
		const hidden = createSetup(false, null, Promise.resolve(true), host);
		hidden.hide();
		const hiddenResult = await hidden.run();
		assert.deepStrictEqual({ success: hiddenResult.success, shown: hidden.dialogShown.isSettled, calls: hidden.snapshot().setupCalls },
			{ success: false, shown: false, calls: [] });
	});

	test('concurrent Microsoft setup callers receive the same handled failure', async () => {
		const host = new class extends NullAgentHostService {
			override readonly authenticationPending = constObservable(true);
			override get rootState() {
				const root = { agents: [], config: { schema: { type: 'object' as const, properties: {} }, values: { [copilotAccountContextKey]: { kind: 'signedOut' } } } };
				return { value: root, verifiedValue: root, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
			}
		}();
		const f = createSetup(false, null, Promise.resolve(true), host);
		f.hide();
		const results = await Promise.all([f.run(), f.run()]);
		assert.deepStrictEqual(results.map(result => ({ success: result.success, error: result.error?.message })), [
			{ success: false, error: 'Copilot setup is unavailable. Check your AI feature and administrator settings.' },
			{ success: false, error: 'Copilot setup is unavailable. Check your AI feature and administrator settings.' },
		]);
	});

	test('provider completion must match the chosen authentication path', async () => {
		const observed = [];
		for (const kind of ['legacy', 'ready'] as const) {
			const host = new class extends NullAgentHostService {
				override readonly authenticationPending = constObservable(true);
				override get rootState() {
					const context = kind === 'legacy' ? { kind } : {
						kind, entraAccountId: 'account', discoveryId: 'discovery', derivedFrom: 'base',
						choice: { service: 'm365', selectionId: 'selection', resource: 'https://m365.example', host: 'https://m365.example', accountName: 'user', displayName: 'User' },
					};
					const root = { agents: [], config: { schema: { type: 'object' as const, properties: {} }, values: { [copilotAccountContextKey]: context } } };
					return { value: root, verifiedValue: root, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
				}
			}();
			for (const strategy of [ChatSetupStrategy.SetupWithMicrosoftProvider, ChatSetupStrategy.SetupWithoutEnterpriseProvider]) {
				const f = createSetup(false, null, Promise.resolve(true), host, new TestConfigurationService({ [AgentHostCopilotM365EnabledSettingId]: true }));
				const result = await f.run({ setupStrategy: strategy });
				observed.push({ kind, strategy, success: result.success, completed: f.snapshot().completed });
			}
		}
		assert.deepStrictEqual(observed, [
			{ kind: 'legacy', strategy: ChatSetupStrategy.SetupWithMicrosoftProvider, success: false, completed: false },
			{ kind: 'legacy', strategy: ChatSetupStrategy.SetupWithoutEnterpriseProvider, success: true, completed: true },
			{ kind: 'ready', strategy: ChatSetupStrategy.SetupWithMicrosoftProvider, success: true, completed: true },
			{ kind: 'ready', strategy: ChatSetupStrategy.SetupWithoutEnterpriseProvider, success: false, completed: false },
		]);
	});

	for (const allowContinueWithoutSignIn of [false, true]) {
		test(`completes setup after external sign-in (optional: ${allowContinueWithoutSignIn})`, async () => {
			const fixture = createSetup(allowContinueWithoutSignIn);
			const result = fixture.run();
			try {
				await fixture.dialogShown.p;
				fixture.setAccount(account);

				assert.deepStrictEqual({
					success: (await raceTimeout(result, 100))?.success,
					...fixture.snapshot(),
				}, {
					success: true,
					dialogDisposed: true,
					completed: true,
					dismissed: false,
					setupCalls: ['default'],
					listening: false,
					listeningDuringProviderSetup: false,
				});
			} finally {
				fixture.cancel();
				await result;
			}
		});
	}

	for (const enterprise of [false, true]) {
		test(`reuses an account available before the dialog opens (enterprise: ${enterprise})`, async () => {
			const fixture = createSetup(false, {
				...account,
				enterprise,
				authenticationProvider: { ...account.authenticationProvider, enterprise },
			});
			const result = fixture.run();
			try {
				assert.deepStrictEqual({
					success: (await raceTimeout(result, 100))?.success,
					shown: fixture.dialogShown.isSettled,
					...fixture.snapshot(),
				}, {
					success: true,
					shown: false,
					dialogDisposed: true,
					completed: true,
					dismissed: false,
					setupCalls: [enterprise ? 'default (enterprise)' : 'default'],
					listening: false,
					listeningDuringProviderSetup: false,
				});
			} finally {
				fixture.cancel();
				await result;
			}
		});
	}

	for (const alreadySignedIn of [false, true]) {
		test(`does not start browser sign-in while finishing authenticated setup (already signed in: ${alreadySignedIn})`, async () => {
			const setupResult = new DeferredPromise<boolean>();
			const fixture = createSetup(false, alreadySignedIn ? account : null, setupResult.p);
			let signInNotifications = 0;
			const result = fixture.run({ onSignInStarted: () => signInNotifications++ });
			try {
				if (!alreadySignedIn) {
					await fixture.dialogShown.p;
					fixture.setAccount(account);
				}
				await fixture.setupStarted.p;
				const duringSetup = {
					signInNotifications,
					dialogDisposed: fixture.snapshot().dialogDisposed,
					completed: fixture.snapshot().completed,
				};
				await setupResult.complete(true);

				assert.deepStrictEqual({ duringSetup, success: (await result).success }, {
					duringSetup: { signInNotifications: 0, dialogDisposed: true, completed: false },
					success: true,
				});
			} finally {
				fixture.cancel();
				if (!setupResult.isSettled) {
					await setupResult.complete(false);
				}
				await result;
			}
		});
	}

	test('still starts explicit provider authentication when an account is available', async () => {
		const setupResult = new DeferredPromise<boolean>();
		const fixture = createSetup(false, account, setupResult.p);
		let signInNotifications = 0;
		const result = fixture.run({
			setupStrategy: ChatSetupStrategy.SetupWithoutEnterpriseProvider,
			onSignInStarted: () => signInNotifications++,
		});
		try {
			await fixture.setupStarted.p;
			const duringSetup = { signInNotifications, completed: fixture.snapshot().completed };
			await setupResult.complete(true);

			assert.deepStrictEqual({ duringSetup, success: (await result).success }, {
				duringSetup: { signInNotifications: 1, completed: false },
				success: true,
			});
		} finally {
			fixture.cancel();
			if (!setupResult.isSettled) {
				await setupResult.complete(false);
			}
			await result;
		}
	});

	test('a signed-out update does not dismiss the dialog', async () => {
		const fixture = createSetup(true);
		const result = fixture.run();
		try {
			await fixture.dialogShown.p;
			fixture.setAccount(null);
			const disposedAfterSignedOutUpdate = fixture.snapshot().dialogDisposed;
			await fixture.dialogResult.complete(ChatSetupStrategy.Canceled);

			assert.deepStrictEqual({
				disposedAfterSignedOutUpdate,
				success: (await result).success,
				...fixture.snapshot(),
			}, {
				disposedAfterSignedOutUpdate: false,
				success: undefined,
				dialogDisposed: true,
				completed: false,
				dismissed: true,
				setupCalls: [],
				listening: false,
				listeningDuringProviderSetup: false,
			});
		} finally {
			fixture.cancel();
			await result;
		}
	});

	test('cancellation wins over external sign-in', async () => {
		const fixture = createSetup(true);
		const result = fixture.run();
		try {
			await fixture.dialogShown.p;
			fixture.setAccount(account);
			fixture.cancel();

			assert.deepStrictEqual({
				success: (await result).success,
				...fixture.snapshot(),
			}, {
				success: undefined,
				dialogDisposed: true,
				completed: false,
				dismissed: false,
				setupCalls: [],
				listening: false,
				listeningDuringProviderSetup: false,
			});
		} finally {
			fixture.cancel();
			await result;
		}
	});

	test('deliberate sign-in dialogs do not opt into external completion', async () => {
		const fixture = createSetup();
		const result = fixture.run({ autoDismissOnSignIn: false });
		try {
			await fixture.dialogShown.p;
			fixture.setAccount(account);
			const disposedAfterSignIn = fixture.snapshot().dialogDisposed;
			await fixture.dialogResult.complete(ChatSetupStrategy.SetupWithoutEnterpriseProvider);

			assert.deepStrictEqual({
				disposedAfterSignIn,
				success: (await result).success,
				...fixture.snapshot(),
			}, {
				disposedAfterSignIn: false,
				success: true,
				dialogDisposed: true,
				completed: true,
				dismissed: false,
				setupCalls: ['provider'],
				listening: false,
				listeningDuringProviderSetup: false,
			});
		} finally {
			fixture.cancel();
			await result;
		}
	});

	test('stops observing accounts before the selected provider signs in', async () => {
		const fixture = createSetup();
		const result = fixture.run();
		try {
			await fixture.dialogShown.p;
			await fixture.dialogResult.complete(ChatSetupStrategy.SetupWithoutEnterpriseProvider);

			assert.deepStrictEqual({
				success: (await result).success,
				...fixture.snapshot(),
			}, {
				success: true,
				dialogDisposed: true,
				completed: true,
				dismissed: false,
				setupCalls: ['provider'],
				listening: false,
				listeningDuringProviderSetup: false,
			});
		} finally {
			fixture.cancel();
			await result;
		}
	});
});
