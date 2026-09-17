/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatMicrosoftAuthenticationEnabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, ChatEntitlementContext, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { buildUpgradeUrlWithRedirect, ChatSetupAnonymous, ChatSetupSource, ChatSetupStrategy, IChatSetupRunOptions } from '../../../browser/chatSetup/chatSetup.js';
import { ChatSetupController } from '../../../browser/chatSetup/chatSetupController.js';
import { ChatSetup, ChatSetupDialog, getChatSetupDialogButtons, getChatSetupDialogFooter, IChatSetupDialogProviders, shouldShowMicrosoftProvider, showChatSetupDialogWithCancellation } from '../../../browser/chatSetup/chatSetupRunner.js';

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
		}, {
			settingOff: false,
			settingOn: true,
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
