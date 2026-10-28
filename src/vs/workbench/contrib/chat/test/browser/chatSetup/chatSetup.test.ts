/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatMicrosoftAuthenticationEnabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, ChatEntitlementContext, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { buildUpgradeUrlWithRedirect, ChatSetupAnonymous, CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID, ChatSetupSource, ChatSetupStrategy, IChatSetupRunOptions } from '../../../browser/chatSetup/chatSetup.js';
import { ChatSetupController } from '../../../browser/chatSetup/chatSetupController.js';
import { ChatSetup, ChatSetupDialog, getChatSetupDialogButtons, getChatSetupDialogFooter, getNativeCopilotSignInFooter, IChatSetupDialogProviders, shouldShowMicrosoftProvider, showChatSetupDialogWithCancellation } from '../../../browser/chatSetup/chatSetupRunner.js';

/**
 * Parses the final URL and extracts the decoded return_to value,
 * then extracts the decoded vscode URI from the return_to redirect.
 */
function parseRedirectUrl(url: string): { returnTo: string; redirectHost: string; vscodeUri: string } {
	const questionIdx = url.indexOf('return_to=');
	const returnTo = decodeURIComponent(url.slice(questionIdx + 'return_to='.length));
	const redirectUrl = new URL(returnTo);
	const vscodeUri = decodeURIComponent(redirectUrl.searchParams.get('url')!);
	return { returnTo, redirectHost: redirectUrl.host, vscodeUri };
}

suite('buildUpgradeUrlWithRedirect', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('stable quality uses vscode.dev host', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'vscode',
			'stable'
		);
		const { redirectHost, vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(redirectHost, 'vscode.dev');
		assert.strictEqual(vscodeUri, 'vscode://GitHub.copilot-chat/upgrade-success');
	});

	test('insider quality uses insiders.vscode.dev host', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'vscode-insiders',
			'insider'
		);
		const { redirectHost, vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(redirectHost, 'insiders.vscode.dev');
		assert.strictEqual(vscodeUri, 'vscode-insiders://GitHub.copilot-chat/upgrade-success');
	});

	test('undefined quality defaults to insiders.vscode.dev host', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'code-oss',
			undefined
		);
		const { redirectHost, vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(redirectHost, 'insiders.vscode.dev');
		assert.strictEqual(vscodeUri, 'code-oss://GitHub.copilot-chat/upgrade-success');
	});

	test('appends with & when base URL already has query params', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade?utm_source=vscode',
			'vscode',
			'stable'
		);
		assert.ok(result.startsWith('https://github.com/github-copilot/upgrade?utm_source=vscode&return_to='));
	});

	test('appends with ? when base URL has no query params', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.com/github-copilot/upgrade',
			'vscode',
			'stable'
		);
		assert.ok(result.startsWith('https://github.com/github-copilot/upgrade?return_to='));
	});

	test('GHE URL is handled correctly', () => {
		const result = buildUpgradeUrlWithRedirect(
			'https://github.example.com/github-copilot/upgrade?utm_source=vscode',
			'vscode',
			'stable'
		);
		assert.ok(result.startsWith('https://github.example.com/github-copilot/upgrade?utm_source=vscode&return_to='));
		const { vscodeUri } = parseRedirectUrl(result);
		assert.strictEqual(vscodeUri, 'vscode://GitHub.copilot-chat/upgrade-success');
	});
});

suite('Chat setup dialog presentation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const providers: IChatSetupDialogProviders = {
		default: { name: 'GitHub' },
		enterprise: { name: 'GHE' },
		google: { name: 'Google' },
		apple: { name: 'Apple' },
		microsoft: { name: 'Microsoft' },
	};

	function buttonLabels(options: IChatSetupRunOptions, enterpriseAuthentication: boolean, showMicrosoftProvider: boolean): string[] {
		return getChatSetupDialogButtons(ChatEntitlement.Unknown, options, enterpriseAuthentication, showMicrosoftProvider, providers).map(button => button.label);
	}

	function microsoftSetting(enabled: boolean): IConfigurationService {
		return new TestConfigurationService({ [ChatMicrosoftAuthenticationEnabledSettingId]: enabled });
	}

	test('places signed-out continuation after providers', () => {
		const buttons = getChatSetupDialogButtons(ChatEntitlement.Unknown, { allowContinueWithoutSignIn: true }, false, false, providers);
		const footer = getChatSetupDialogFooter(undefined, TelemetryLevel.USAGE, 'https://example.com/settings', {
			providerName: 'GitHub',
			termsStatementUrl: 'https://example.com/terms',
			privacyStatementUrl: 'https://example.com/privacy',
			publicCodeMatchesUrl: 'https://example.com/public-code',
		});

		assert.deepStrictEqual({
			buttonLabels: buttons.map(button => button.label),
			lastButton: buttons.at(-1),
			footer,
		}, {
			buttonLabels: ['Continue with GitHub', 'Continue with Google', 'Continue with Apple', 'Continue with GHE', 'Continue Without Signing In'],
			lastButton: {
				label: 'Continue Without Signing In',
				strategy: ChatSetupStrategy.Canceled,
				classes: ['link-button'],
			},
			footer: 'By continuing, you agree to GitHub\'s [Terms](https://example.com/terms) and [Privacy Statement](https://example.com/privacy). GitHub Copilot may show [public code](https://example.com/public-code) suggestions and use your data to improve the product. You can change these [settings](https://example.com/settings) anytime.',
		});
	});

	test('describes either Microsoft service independently in dual-provider mode', () => {
		const termsUrl = 'https://example.com/terms';
		const privacyUrl = 'https://example.com/privacy';
		assert.deepStrictEqual({
			lokiOnly: getNativeCopilotSignInFooter(false, termsUrl, privacyUrl),
			dual: getNativeCopilotSignInFooter(true, termsUrl, privacyUrl),
		}, {
			lokiOnly: 'GitHub sign-in choices use GitHub\'s [Terms](https://example.com/terms) and [Privacy Statement](https://example.com/privacy). Continue with Microsoft signs in directly to Microsoft 365 Copilot without a GitHub exchange.',
			dual: 'GitHub Copilot uses GitHub\'s [Terms](https://example.com/terms) and [Privacy Statement](https://example.com/privacy). Continue with Microsoft enables GitHub Copilot, Microsoft 365 Copilot, or both, depending on what\'s available to your account.',
		});
	});

	test('places Microsoft after the other providers and before the signed-out continuation', () => {
		assert.deepStrictEqual({
			withMicrosoft: buttonLabels({ allowContinueWithoutSignIn: true }, false, true),
			withoutMicrosoft: buttonLabels({ allowContinueWithoutSignIn: true }, false, false),
			// The enterprise dialog offers the same social providers, in the same order, because
			// every one of them signs in against whichever host the default account points at.
			enterprise: buttonLabels({}, true, true),
		}, {
			withMicrosoft: ['Continue with GitHub', 'Continue with Google', 'Continue with Apple', 'Continue with Microsoft', 'Continue with GHE', 'Continue Without Signing In'],
			withoutMicrosoft: ['Continue with GitHub', 'Continue with Google', 'Continue with Apple', 'Continue with GHE', 'Continue Without Signing In'],
			enterprise: ['Continue with GHE', 'Continue with Google', 'Continue with Apple', 'Continue with Microsoft', 'Continue with GitHub'],
		});
	});

	test('offers Microsoft to every sign-in dialog once the setting is on', () => {
		assert.deepStrictEqual({
			settingOff: shouldShowMicrosoftProvider(microsoftSetting(false)),
			settingOn: shouldShowMicrosoftProvider(microsoftSetting(true)),
			nativeLokiWithoutSetting: shouldShowMicrosoftProvider(microsoftSetting(false), true),
		}, {
			settingOff: false,
			settingOn: true,
			nativeLokiWithoutSetting: true,
		});
	});

	test('adds Microsoft to the existing provider choices for resource-scoped sign-in', () => {
		const options = { forceSignInDialog: true, directMicrosoftSignIn: async () => { } };
		assert.deepStrictEqual({
			standard: buttonLabels(options, false, false),
			enterprise: buttonLabels(options, true, false),
		}, {
			standard: ['Continue with GitHub', 'Continue with Google', 'Continue with Apple', 'Continue with Microsoft', 'Continue with GHE'],
			enterprise: ['Continue with GHE', 'Continue with Google', 'Continue with Apple', 'Continue with Microsoft', 'Continue with GitHub'],
		});
	});
});

suite('Chat setup strategy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('routes the Microsoft strategy to the Microsoft social provider', async () => {
		let setupOptions: { useEnterpriseProvider?: boolean; useSocialProvider?: string; additionalScopes?: readonly string[] } | undefined;
		const setup = new ChatSetup(
			{ update() { } } as never,
			{
				value: {
					setupWithProvider: async (options: typeof setupOptions) => {
						setupOptions = options;
						return true;
					},
				},
			} as never,
			{ publicLog2() { } } as never,
			undefined as never,
			undefined as never,
			{ error() { } } as never,
			{ revealWidget() { } } as never,
			{ requestWorkspaceTrust: async () => true } as never,
			{ getDefaultAccountAuthenticationProvider: () => ({ enterprise: false }) } as never,
			undefined as never,
			{ isWorkspaceTrusted: () => true } as never,
			undefined as never,
			new TestConfigurationService(),
			upcastPartial<IEnvironmentService>({ isBuilt: true }),
			upcastPartial<ICommandService>({}),
		);

		const result = await setup.run({ setupStrategy: ChatSetupStrategy.SetupWithMicrosoftProvider, additionalScopes: ['repo'] });

		assert.deepStrictEqual({
			success: result.success,
			useEnterpriseProvider: setupOptions?.useEnterpriseProvider,
			useSocialProvider: setupOptions?.useSocialProvider,
			additionalScopes: setupOptions?.additionalScopes,
		}, {
			success: true,
			useEnterpriseProvider: false,
			useSocialProvider: 'microsoft',
			additionalScopes: ['repo'],
		});
	});
});

suite('Chat setup Microsoft runtime probe', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const commandId = '_workbench.chat.probeMicrosoftRuntime';

	async function runSetup(isBuilt: boolean, probeAvailable: boolean, options: {
		runOptions?: IChatSetupRunOptions;
		activateByEvent?: IExtensionService['activateByEvent'];
		probe?: (token: CancellationToken) => Promise<void>;
		nativeLoki?: { available: boolean; signIn?: (token: CancellationToken) => Promise<boolean | undefined> };
	} = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		let completed = false;
		if (probeAvailable) {
			store.add(CommandsRegistry.registerCommand(commandId, () => { }));
		}
		if (options.nativeLoki) {
			store.add(CommandsRegistry.registerCommand(CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID, () => { }));
		}
		instantiationService.stub(IEnvironmentService, { isBuilt });
		instantiationService.stub(ICommandService, {
			executeCommand: async <R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> => {
				calls.push(id);
				if (id === CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID) {
					assert.ok(options.nativeLoki);
					const [operation, token] = args;
					if (operation === 'isAvailable') {
						return options.nativeLoki.available as R;
					}
					assert.strictEqual(operation, 'signIn');
					assert.ok(CancellationToken.isCancellationToken(token));
					return (options.nativeLoki.signIn ? await options.nativeLoki.signIn(token) : true) as R | undefined;
				}
				const [token] = args;
				assert.ok(CancellationToken.isCancellationToken(token));
				await options.probe?.(token);
				return undefined;
			},
		});
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, { activateByEvent: options.activateByEvent ?? (async () => { }) });
		instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted: () => true });
		instantiationService.stub(IWorkspaceTrustRequestService, { requestWorkspaceTrust: async () => true });
		instantiationService.stub(IDefaultAccountService, { getDefaultAccountAuthenticationProvider: () => ({ id: 'github', name: 'GitHub', enterprise: false }) });
		const context = upcastPartial<ChatEntitlementContext>({
			update: async update => { completed ||= hasKey(update, { completed: true }) && update.completed === true; },
		});
		const controller = new Lazy(() => upcastPartial<ChatSetupController>({
			setupWithProvider: async options => {
				calls.push(options.useSocialProvider ?? 'github');
				return true;
			},
		}));
		const setup = instantiationService.createInstance(ChatSetup, context, controller);
		const result = await setup.run({ setupStrategy: ChatSetupStrategy.SetupWithMicrosoftProvider, disableChatViewReveal: true, ...options.runOptions });
		return { calls, completed, success: result.success, error: result.error };
	}

	test('runs the explicitly registered development probe without completing Chat setup', async () => {
		assert.deepStrictEqual(await runSetup(false, true), {
			calls: [commandId], completed: false, success: undefined, error: undefined,
		});
	});

	test('uses the native Loki Microsoft provider instead of exchanging into GitHub', async () => {
		assert.deepStrictEqual(await runSetup(false, false, { nativeLoki: { available: true } }), {
			calls: [CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID, CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID],
			completed: false, success: true, error: undefined,
		});
	});

	test('keeps Microsoft social sign-in outside the native Loki prototype', async () => {
		assert.deepStrictEqual(await runSetup(false, false, { nativeLoki: { available: false } }), {
			calls: [CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID, 'microsoft'],
			completed: true, success: true, error: undefined,
		});
	});

	test('does not fall back to GitHub after a native Loki Microsoft sign-in error', async () => {
		const error = new Error('Microsoft authentication failed');
		assert.deepStrictEqual(await runSetup(false, false, {
			nativeLoki: { available: true, signIn: async () => { throw error; } },
		}), {
			calls: [CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID, CHAT_SETUP_NATIVE_LOKI_MICROSOFT_SIGN_IN_COMMAND_ID],
			completed: false, success: false, error,
		});
	});

	test('uses direct Microsoft sign-in instead of the GitHub exchange or development probe', async () => {
		let signedIn = false;
		assert.deepStrictEqual(await runSetup(false, true, {
			runOptions: { directMicrosoftSignIn: async () => { signedIn = true; } },
		}), {
			calls: [], completed: false, success: true, error: undefined,
		});
		assert.strictEqual(signedIn, true);
	});

	test('keeps the other sign-in choices on their existing GitHub setup path', async () => {
		let microsoftSignIns = 0;
		const result = await runSetup(false, true, {
			runOptions: {
				setupStrategy: ChatSetupStrategy.SetupWithoutEnterpriseProvider,
				directMicrosoftSignIn: async () => { microsoftSignIns++; },
			},
		});
		assert.deepStrictEqual({ ...result, microsoftSignIns }, {
			calls: ['github'], completed: true, success: true, error: undefined, microsoftSignIns: 0,
		});
	});
	test('surfaces direct Microsoft sign-in failures without exchanging for GitHub', async () => {
		const error = new Error('Microsoft sign-in failed');
		assert.deepStrictEqual(await runSetup(false, true, {
			runOptions: { directMicrosoftSignIn: async () => { throw error; } },
		}), {
			calls: [], completed: false, success: false, error,
		});
	});

	test('does not complete Chat setup when direct Microsoft sign-in is cancelled', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		const finish = new DeferredPromise<void>();
		const pending = runSetup(false, true, {
			runOptions: {
				cancellationToken: cancellation.token,
				directMicrosoftSignIn: async () => {
					await started.complete();
					await finish.p;
				},
			},
		});
		await started.p;
		cancellation.cancel();
		const result = await pending;
		await finish.complete();
		assert.deepStrictEqual(result, {
			calls: [], completed: false, success: undefined, error: undefined,
		});
	});

	test('preserves normal Microsoft sign-in when the development probe is absent', async () => {
		assert.deepStrictEqual(await runSetup(false, false), {
			calls: ['microsoft'], completed: true, success: true, error: undefined,
		});
	});

	test('ignores the probe in a built product', async () => {
		assert.deepStrictEqual(await runSetup(true, true), {
			calls: ['microsoft'], completed: true, success: true, error: undefined,
		});
	});

	test('does not intercept other sign-in providers', async () => {
		assert.deepStrictEqual(await runSetup(false, true, { runOptions: { setupStrategy: ChatSetupStrategy.SetupWithGoogleProvider } }), {
			calls: ['google'], completed: true, success: true, error: undefined,
		});
	});

	test('surfaces a probe failure without falling back to ordinary sign-in', async () => {
		const error = new Error('Probe failed');
		assert.deepStrictEqual(await runSetup(false, true, { probe: async () => { throw error; } }), {
			calls: [commandId], completed: false, success: false, error,
		});
	});

	for (const probeAvailable of [true, false]) {
		test(`cancellation during activation does not start sign-in (probe available: ${probeAvailable})`, async () => {
			const cancellation = store.add(new CancellationTokenSource());
			const activationStarted = new DeferredPromise<void>();
			const activationFinished = new DeferredPromise<void>();
			const pending = runSetup(false, probeAvailable, {
				runOptions: { cancellationToken: cancellation.token },
				activateByEvent: async event => {
					assert.strictEqual(event, `onCommand:${commandId}`);
					await activationStarted.complete();
					await activationFinished.p;
				},
			});

			try {
				await activationStarted.p;
				cancellation.cancel();
				const result = await pending;
				await activationFinished.complete();

				assert.deepStrictEqual(result, {
					calls: [], completed: false, success: undefined, error: undefined,
				});
			} finally {
				await activationFinished.complete();
			}
		});
	}

	test('forwards caller cancellation to an active probe without waiting for its reply', async () => {
		const cancellation = store.add(new CancellationTokenSource());
		const probeStarted = new DeferredPromise<void>();
		const probeCancelled = new DeferredPromise<void>();
		const probeFinished = new DeferredPromise<void>();
		const pending = runSetup(false, true, {
			runOptions: { cancellationToken: cancellation.token },
			probe: async token => {
				store.add(token.onCancellationRequested(() => { void probeCancelled.complete(); }));
				await probeStarted.complete();
				await probeFinished.p;
			},
		});

		try {
			await probeStarted.p;
			cancellation.cancel();
			const result = await pending;
			await probeCancelled.p;

			assert.deepStrictEqual(result, {
				calls: [commandId], completed: false, success: undefined, error: undefined,
			});
		} finally {
			await probeFinished.complete();
		}
	});

	test('does not activate the probe when setup is cancelled as sign-in starts', async () => {
		const activationEvents: string[] = [];
		const result = await runSetup(false, true, {
			runOptions: { onSignInStarted: cancel => cancel() },
			activateByEvent: async event => { activationEvents.push(event); },
		});

		assert.deepStrictEqual({ ...result, activationEvents }, {
			calls: [], completed: false, success: undefined, error: undefined, activationEvents: [],
		});
	});
});

suite('Chat setup dialog cancellation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('disposes an open dialog when the caller cancels', async () => {
		const cancellation = new CancellationTokenSource();
		let disposed = false;
		let dismissed = false;
		let resolveShow: ((value: ChatSetupStrategy) => void) | undefined;
		const dialog = {
			show: () => new Promise<ChatSetupStrategy>(resolve => resolveShow = resolve),
			dispose: () => {
				if (!disposed) {
					disposed = true;
					resolveShow?.(ChatSetupStrategy.Canceled);
				}
			},
		};

		const result = showChatSetupDialogWithCancellation(dialog, cancellation.token, () => dismissed = true);
		cancellation.cancel();

		assert.deepStrictEqual({
			result: await result,
			disposed,
			dismissed,
		}, {
			result: ChatSetupStrategy.Canceled,
			disposed: true,
			dismissed: false,
		});
		cancellation.dispose();
	});

	test('reports an explicit dialog dismissal', async () => {
		let dismissed = false;
		const dialog = {
			show: async () => ChatSetupStrategy.Canceled,
			dispose: () => { },
		};

		const result = await showChatSetupDialogWithCancellation(dialog, undefined, () => dismissed = true);

		assert.deepStrictEqual({ result, dismissed }, {
			result: ChatSetupStrategy.Canceled,
			dismissed: true,
		});
	});

	test('cancels in-flight setup when the caller cancels', async () => {
		const cancellation = new CancellationTokenSource();
		const setupStarted = new DeferredPromise<void>();
		let setupToken: CancellationToken | undefined;
		const setup = new ChatSetup(
			{ update() { } } as never,
			{
				value: {
					setup: (options: { cancellationToken?: CancellationToken }) => {
						setupToken = options.cancellationToken;
						setupStarted.complete();
						return new Promise<undefined>(resolve => {
							const listener = setupToken!.onCancellationRequested(() => {
								listener.dispose();
								resolve(undefined);
							});
						});
					},
				},
			} as never,
			undefined as never,
			undefined as never,
			undefined as never,
			undefined as never,
			{ revealWidget() { } } as never,
			{ requestWorkspaceTrust: async () => true } as never,
			{ getDefaultAccountAuthenticationProvider: () => ({ enterprise: false }) } as never,
			undefined as never,
			{ isWorkspaceTrusted: () => true } as never,
			undefined as never,
			new TestConfigurationService(),
			upcastPartial<IEnvironmentService>({ isBuilt: true }),
			upcastPartial<ICommandService>({}),
		);

		const result = setup.run({ setupStrategy: ChatSetupStrategy.DefaultSetup, cancellationToken: cancellation.token });
		await setupStarted.p;
		cancellation.cancel();

		assert.strictEqual((await result).success, undefined);
		assert.strictEqual(setupToken?.isCancellationRequested, true);
		cancellation.dispose();
	});
});

suite('Chat setup dialog telemetry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSetup(entitlement = ChatEntitlement.Unknown, accountAvailable = false) {
		const instantiationService = store.add(new TestInstantiationService());
		const impressions: (ITelemetryData | undefined)[] = [];
		const dialogShown = new DeferredPromise<void>();
		const dialogResult = new DeferredPromise<ChatSetupStrategy>();
		const context = upcastPartial<ChatEntitlementContext>({
			state: { entitlement, sku: undefined, organisations: undefined, isStaff: undefined, copilotTrackingId: undefined },
			update: async () => { },
		});
		const controller = new Lazy(() => upcastPartial<ChatSetupController>({ setup: async () => undefined }));
		instantiationService.stub(ITelemetryService, {
			telemetryLevel: TelemetryLevel.USAGE,
			publicLog2: (name, data) => {
				if (name === 'chatSetup.dialogShown') {
					impressions.push(data);
				}
			},
		});
		instantiationService.stub(IChatEntitlementService, { entitlement, anonymous: false });
		instantiationService.stub(IWorkspaceTrustManagementService, { isWorkspaceTrusted: () => true });
		instantiationService.stub(IWorkspaceTrustRequestService, { requestWorkspaceTrust: async () => true });
		instantiationService.stub(IDefaultAccountService, {
			currentDefaultAccount: accountAvailable ? upcastPartial<NonNullable<IDefaultAccountService['currentDefaultAccount']>>({}) : null,
			getDefaultAccountAuthenticationProvider: () => ({ id: 'github', name: 'GitHub', enterprise: false }),
			resolveGitHubUrl: path => `https://github.com/${path}`,
		});
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IEnvironmentService, { isBuilt: true });
		instantiationService.stub(ILayoutService, {});
		instantiationService.stubInstance(ChatSetupDialog, {
			show: () => {
				void dialogShown.complete();
				return dialogResult.p;
			},
			dispose: () => { void dialogResult.complete(ChatSetupStrategy.Canceled); },
		});
		const setup = instantiationService.createInstance(ChatSetup, context, controller);
		return { setup, impressions, dialogShown, dialogResult };
	}

	test('records one impression while concurrent callers share an open dialog', async () => {
		const { setup, impressions, dialogShown, dialogResult } = createSetup();
		const first = setup.run({ telemetrySource: ChatSetupSource.Chat });
		const second = setup.run({ telemetrySource: ChatSetupSource.Command });
		await dialogShown.p;

		assert.deepStrictEqual(impressions, [{
			source: 'chat', kind: 'signIn',
			accountAvailable: false, entitlement: 'Unknown', forceSignInDialog: false,
		}]);

		await dialogResult.complete(ChatSetupStrategy.Canceled);
		await Promise.all([first, second]);
		await setup.run({ telemetrySource: ChatSetupSource.Chat });
		assert.strictEqual(impressions.length, 2);
	});

	test('records forced sign-in with an available account from Agents setup', async () => {
		const { setup, impressions, dialogShown, dialogResult } = createSetup(ChatEntitlement.Pro, true);
		const result = setup.run({ telemetrySource: ChatSetupSource.SessionsSetup, forceSignInDialog: true });
		await dialogShown.p;
		await dialogResult.complete(ChatSetupStrategy.Canceled);
		await result;

		assert.deepStrictEqual(impressions, [{
			source: 'sessionsSetup', kind: 'signIn',
			accountAvailable: true, entitlement: 'Pro', forceSignInDialog: true,
		}]);
	});

	test('distinguishes setup from provider sign-in while entitlement is unresolved', async () => {
		const { setup, impressions, dialogShown, dialogResult } = createSetup(ChatEntitlement.Unresolved, true);
		const result = setup.run();
		await dialogShown.p;
		await dialogResult.complete(ChatSetupStrategy.Canceled);
		await result;

		assert.deepStrictEqual(impressions, [{
			source: 'unknown', kind: 'setup',
			accountAvailable: true, entitlement: 'Unresolved', forceSignInDialog: false,
		}]);
	});

	test('does not log arbitrary command arguments', async () => {
		const { setup, impressions, dialogShown, dialogResult } = createSetup();
		const options: IChatSetupRunOptions = JSON.parse('{"telemetrySource":"private source","dialogTitle":"private title","additionalScopes":["private scope"]}');
		const result = setup.run(options);
		await dialogShown.p;
		await dialogResult.complete(ChatSetupStrategy.Canceled);
		await result;

		assert.deepStrictEqual(impressions, [{
			source: 'unknown', kind: 'signIn',
			accountAvailable: false, entitlement: 'Unknown', forceSignInDialog: false,
		}]);
	});

	for (const skip of ['canceled', 'strategy', 'anonymous', 'entitled', 'skipOnce'] as const) {
		test(`does not record an impression when setup is skipped: ${skip}`, async () => {
			const { setup, impressions } = createSetup(skip === 'entitled' ? ChatEntitlement.Free : ChatEntitlement.Unknown);
			if (skip === 'skipOnce') {
				setup.skipDialog();
			}
			await setup.run({
				disableChatViewReveal: true,
				cancellationToken: skip === 'canceled' ? CancellationToken.Cancelled : undefined,
				setupStrategy: skip === 'strategy' ? ChatSetupStrategy.DefaultSetup : undefined,
				forceAnonymous: skip === 'anonymous' ? ChatSetupAnonymous.EnabledWithoutDialog : undefined,
			});
			assert.deepStrictEqual(impressions, []);
		});
	}

	test('does not report a dialog canceled before showing', async () => {
		const calls: string[] = [];
		await showChatSetupDialogWithCancellation({
			show: async () => { calls.push('show'); return ChatSetupStrategy.Canceled; },
			dispose: () => { },
		}, CancellationToken.Cancelled, () => calls.push('dismissed'), () => calls.push('impression'));
		assert.deepStrictEqual(calls, []);
	});
});
