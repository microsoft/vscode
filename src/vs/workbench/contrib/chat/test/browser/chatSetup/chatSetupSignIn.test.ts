/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceTimeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { Emitter } from '../../../../../../base/common/event.js';
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

suite('Chat setup dialog external sign-in', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const account: IDefaultAccount = {
		accountName: 'test-account',
		sessionId: 'test-session',
		authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
		enterprise: false,
	};

	function createSetup(allowContinueWithoutSignIn = false, initialAccount: IDefaultAccount | null = null, setupResult: Promise<boolean> = Promise.resolve(true)) {
		const instantiationService = store.add(new TestInstantiationService());
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const cancellation = store.add(new CancellationTokenSource());
		const dialogShown = new DeferredPromise<void>();
		const dialogResult = new DeferredPromise<ChatSetupStrategy>();
		const setupStarted = new DeferredPromise<void>();
		const setupCalls: string[] = [];
		let currentAccount = initialAccount;
		let dialogDisposed = false;
		let completed = false;
		let dismissed = false;
		let listeningDuringProviderSetup = false;
		const state = {
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
		instantiationService.stub(ILogService, { error: message => assert.fail(message) });
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
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
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
			setAccount,
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
