/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatMicrosoftAuthenticationEnabledSettingId, ChatMicrosoftAuthenticationMode, toChatMicrosoftAuthenticationMode } from '../../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { AuthenticationSession, AuthenticationSessionsChangeEvent, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, ChatEntitlementContext, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { buildUpgradeUrlWithRedirect, ChatSetupAnonymous, ChatSetupSource, ChatSetupStrategy, IChatSetupRunOptions } from '../../../browser/chatSetup/chatSetup.js';
import { ChatSetupController } from '../../../browser/chatSetup/chatSetupController.js';
import { ChatMicrosoftSignInProbeService, IChatMicrosoftSignInProbeService, MicrosoftSignInProbeOutcome, probeMicrosoftSignIn } from '../../../browser/chatSetup/chatSetupMicrosoftProbe.js';
import { ChatSetup, ChatSetupDialog, getChatSetupDialogButtons, getChatSetupDialogFooter, IChatSetupDialogProviders, showChatSetupDialogWithCancellation } from '../../../browser/chatSetup/chatSetupRunner.js';

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

	test('keeps settings text without a link when the enterprise URL is unavailable', () => {
		const footer = getChatSetupDialogFooter(undefined, TelemetryLevel.USAGE, undefined, {
			providerName: 'GitHub',
			termsStatementUrl: 'https://example.com/terms',
			privacyStatementUrl: 'https://example.com/privacy',
			publicCodeMatchesUrl: 'https://example.com/public-code',
		});

		assert.strictEqual(footer, 'By continuing, you agree to GitHub\'s [Terms](https://example.com/terms) and [Privacy Statement](https://example.com/privacy). GitHub Copilot may show [public code](https://example.com/public-code) suggestions and use your data to improve the product. You can change these settings anytime.');
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

	test('reads legacy boolean values of the Microsoft sign-in setting with their old meaning, and anything else as never', () => {
		assert.deepStrictEqual([true, false, 'always', 'never', 'auto', undefined, 'bogus'].map(toChatMicrosoftAuthenticationMode), [
			ChatMicrosoftAuthenticationMode.Always,
			ChatMicrosoftAuthenticationMode.Never,
			ChatMicrosoftAuthenticationMode.Always,
			ChatMicrosoftAuthenticationMode.Never,
			ChatMicrosoftAuthenticationMode.Auto,
			ChatMicrosoftAuthenticationMode.Never,
			ChatMicrosoftAuthenticationMode.Never,
		]);
	});
});

interface IProbeCall {
	readonly providerId: string;
	readonly scopes: readonly string[] | undefined;
	readonly options: Record<string, unknown> | undefined;
}

function recordingAuthenticationService(calls: IProbeCall[], respond: (call: IProbeCall) => Promise<readonly AuthenticationSession[]>, onDidChangeSessions = Event.None as IAuthenticationService['onDidChangeSessions']): IAuthenticationService {
	return upcastPartial<IAuthenticationService>({
		onDidChangeSessions,
		getSessions: (providerId, scopeListOrRequest, options) => {
			const call: IProbeCall = { providerId, scopes: Array.isArray(scopeListOrRequest) ? scopeListOrRequest : undefined, options };
			calls.push(call);
			return respond(call);
		}
	});
}

function probeSession(id: string, accessToken: string): AuthenticationSession {
	return { id, accessToken, account: { id, label: id }, scopes: [] };
}

suite('Chat setup Microsoft sign-in probe', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('asks GitHub about every Microsoft account in one request', async () => {
		const calls: IProbeCall[] = [];
		const authenticationService = recordingAuthenticationService(calls, async call => call.providerId === 'microsoft'
			? [probeSession('first', 'entra-first'), probeSession('second', 'entra-second')]
			: [probeSession('mona_contoso', '')]);

		const result = await probeMicrosoftSignIn(authenticationService, 'github', CancellationToken.None);

		assert.deepStrictEqual({ result, calls }, {
			result: { outcome: MicrosoftSignInProbeOutcome.Linked, microsoftAccounts: 2 },
			calls: [
				{ providerId: 'microsoft', scopes: ['12f6db80-0741-4a7e-b9c5-b85d737b3a31/.default'], options: { silent: true, _workbenchIncludeUnapprovedAccounts: true } },
				{ providerId: 'github', scopes: [], options: { silent: true, _workbenchEntraExchangeProbe: { subjectTokens: ['entra-first', 'entra-second'] } } },
			]
		});
	});

	test('does not ask GitHub when there are no Microsoft accounts or the probe was cancelled', async () => {
		const noAccountCalls: IProbeCall[] = [];
		const noAccounts = await probeMicrosoftSignIn(recordingAuthenticationService(noAccountCalls, async () => []), 'github', CancellationToken.None);
		const cancelledCalls: IProbeCall[] = [];
		let cancelled: unknown;
		try {
			await probeMicrosoftSignIn(recordingAuthenticationService(cancelledCalls, async () => [probeSession('first', 'entra-first')]), 'github', CancellationToken.Cancelled);
		} catch (error) {
			cancelled = error;
		}

		assert.deepStrictEqual({
			noAccounts,
			noAccountCalls: noAccountCalls.map(call => call.providerId),
			cancelled: isCancellationError(cancelled),
			cancelledCalls: cancelledCalls.map(call => call.providerId),
		}, {
			noAccounts: { outcome: MicrosoftSignInProbeOutcome.NoMicrosoftAccounts, microsoftAccounts: 0 },
			noAccountCalls: ['microsoft'],
			cancelled: true,
			cancelledCalls: ['microsoft'],
		});
	});
});

suite('Chat Microsoft sign-in probe service', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const TREATMENT = `config.${ChatMicrosoftAuthenticationEnabledSettingId}`;

	/** Does what a sign-in surface does when it shows: notifies the service, then reads whether to offer Microsoft. */
	function showSignIn(service: ChatMicrosoftSignInProbeService): boolean {
		service.notifySignInShown();
		return service.offerMicrosoftSignIn.get();
	}

	/** Holds a value that comes from the setting's default, as one assigned by an experiment does, rather than from the user. */
	class AssignedDefaultConfigurationService extends TestConfigurationService {
		override inspect<T>(key: string): IConfigurationValue<T> {
			const value = this.getValue<T>(key);
			return { value, defaultValue: value };
		}
	}

	/** Records the probe outcomes it is told about, besides the experiment triggers. */
	class ProbeTelemetryService extends TestExperimentTriggerTelemetryService {
		readonly reported: Record<string, unknown>[] = [];
		readonly reportedOnce = new DeferredPromise<void>();

		override publicLog2(eventName?: string, data?: object): void {
			super.publicLog2(eventName, data);
			if (eventName === 'chatSetup.microsoftSignInProbe') {
				const { durationMs: _durationMs, ...rest } = data as Record<string, unknown>;
				this.reported.push(rest);
				void this.reportedOnce.complete();
			}
		}
	}

	interface IServiceOptions {
		/** The mode the experiment assigned as the default. */
		readonly assigned?: ChatMicrosoftAuthenticationMode;
		/** A mode the user chose, which wins over any assignment. */
		readonly user?: unknown;
		readonly entitlement?: ChatEntitlement;
		readonly hidden?: boolean;
		readonly microsoftProvider?: boolean;
		readonly respond?: (call: IProbeCall) => Promise<readonly AuthenticationSession[]>;
		readonly onDidChangeSessions?: IAuthenticationService['onDidChangeSessions'];
	}

	function createService(options: IServiceOptions = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: IProbeCall[] = [];
		const accountChanged = store.add(new Emitter<IDefaultAccount | null>());
		const telemetryService = new ProbeTelemetryService();
		let gitHubProviderId = 'github';
		instantiationService.stub(IAuthenticationService, recordingAuthenticationService(calls, options.respond ?? (async call => call.providerId === 'microsoft' ? [probeSession('first', 'entra-first')] : [probeSession('mona_contoso', '')]), options.onDidChangeSessions));
		instantiationService.stub(IDefaultAccountService, {
			onDidChangeDefaultAccount: accountChanged.event,
			getDefaultAccountAuthenticationProvider: () => ({ id: gitHubProviderId, name: 'GitHub', enterprise: false }),
		});
		instantiationService.stub(IChatEntitlementService, {
			entitlementObs: constObservable(options.entitlement ?? ChatEntitlement.Unknown),
			sentimentObs: constObservable({ hidden: options.hidden }),
		});
		instantiationService.stub(IConfigurationService, options.user !== undefined
			? new TestConfigurationService({ [ChatMicrosoftAuthenticationEnabledSettingId]: options.user })
			: new AssignedDefaultConfigurationService({ [ChatMicrosoftAuthenticationEnabledSettingId]: options.assigned ?? ChatMicrosoftAuthenticationMode.Auto }));
		instantiationService.stub(IProductService, upcastPartial<IProductService>({
			defaultChatAgent: options.microsoftProvider === false ? undefined : upcastPartial<NonNullable<IProductService['defaultChatAgent']>>({ provider: upcastPartial<NonNullable<IProductService['defaultChatAgent']>['provider']>({ microsoft: { id: 'microsoft', name: 'Microsoft' } }) }),
		}));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, telemetryService);
		const service = store.add(instantiationService.createInstance(ChatMicrosoftSignInProbeService));
		const switchGitHubProvider = (id: string) => {
			gitHubProviderId = id;
			accountChanged.fire(null);
		};
		return { service, calls, reported: telemetryService.reported, reportedOnce: telemetryService.reportedOnce.p, switchGitHubProvider, triggers: telemetryService.triggers };
	}

	test('offers Microsoft sign-in once a probe finds a linked account for the current GitHub host', async () => {
		const { service, calls, reported, reportedOnce, switchGitHubProvider } = createService();
		const offeredWhileProbing = showSignIn(service);
		await reportedOnce;
		const offeredOnceLinked = showSignIn(service);
		switchGitHubProvider('github-enterprise');

		assert.deepStrictEqual({
			offeredWhileProbing,
			offeredOnceLinked,
			offeredForAnotherHost: showSignIn(service),
			reported,
			probedHosts: calls.filter(call => call.providerId !== 'microsoft').map(call => call.providerId),
		}, {
			offeredWhileProbing: false,
			offeredOnceLinked: true,
			offeredForAnotherHost: false,
			reported: [{ outcome: MicrosoftSignInProbeOutcome.Linked, microsoftAccounts: 1 }],
			probedHosts: ['github'],
		});
	});

	test('only probes in auto mode, with AI features shown and a Microsoft provider, whether or not the user is signed in', () => {
		const cases = {
			defaultNever: createService({ assigned: ChatMicrosoftAuthenticationMode.Never }),
			assignedAlways: createService({ assigned: ChatMicrosoftAuthenticationMode.Always }),
			userAlways: createService({ user: ChatMicrosoftAuthenticationMode.Always }),
			legacyTrue: createService({ user: true }),
			userNever: createService({ user: ChatMicrosoftAuthenticationMode.Never }),
			legacyFalse: createService({ user: false }),
			hidden: createService({ hidden: true }),
			noMicrosoftProvider: createService({ microsoftProvider: false }),
			assignedAuto: createService(),
			// Signed in users are probed too, so a forced sign-in dialog knows the answer when it opens.
			signedIn: createService({ entitlement: ChatEntitlement.Pro }),
		};

		// Probes are counted before a dialog asks, because asking probes again when the answer is no.
		assert.deepStrictEqual(Object.fromEntries(Object.entries(cases).map(([name, { service, calls }]) => [name, { probes: calls.length, offered: showSignIn(service) }])), {
			defaultNever: { probes: 0, offered: false },
			assignedAlways: { probes: 0, offered: true },
			userAlways: { probes: 0, offered: true },
			legacyTrue: { probes: 0, offered: true },
			userNever: { probes: 0, offered: false },
			legacyFalse: { probes: 0, offered: false },
			hidden: { probes: 0, offered: false },
			noMicrosoftProvider: { probes: 0, offered: false },
			assignedAuto: { probes: 1, offered: false },
			signedIn: { probes: 1, offered: false },
		});
	});

	test('logs the experiment trigger in every arm, and only while the assigned default is in effect', () => {
		const triggersOf = (options: IServiceOptions, openDialog: boolean) => {
			const { service, triggers } = createService(options);
			if (openDialog) {
				showSignIn(service);
			}
			return triggers;
		};

		assert.deepStrictEqual({
			// The arms diverge in the background as soon as the service exists, signed in or not.
			signedOutNever: triggersOf({ assigned: ChatMicrosoftAuthenticationMode.Never }, false),
			signedOutAuto: triggersOf({ assigned: ChatMicrosoftAuthenticationMode.Auto }, false),
			signedOutAlways: triggersOf({ assigned: ChatMicrosoftAuthenticationMode.Always }, false),
			signedInNever: triggersOf({ assigned: ChatMicrosoftAuthenticationMode.Never, entitlement: ChatEntitlement.Pro }, false),
			signedInAuto: triggersOf({ assigned: ChatMicrosoftAuthenticationMode.Auto, entitlement: ChatEntitlement.Pro }, false),
			// A dialog opening later does not log it twice.
			withDialog: triggersOf({ assigned: ChatMicrosoftAuthenticationMode.Auto }, true),
			// Not affected by the assignment in any arm.
			userChoice: triggersOf({ user: ChatMicrosoftAuthenticationMode.Auto }, true),
			hidden: triggersOf({ hidden: true }, true),
			noMicrosoftProvider: triggersOf({ microsoftProvider: false }, true),
		}, {
			signedOutNever: [TREATMENT],
			signedOutAuto: [TREATMENT],
			signedOutAlways: [TREATMENT],
			signedInNever: [TREATMENT],
			signedInAuto: [TREATMENT],
			withDialog: [TREATMENT],
			userChoice: [],
			hidden: [],
			noMicrosoftProvider: [],
		});
	});

	test('coalesces probes asked for while one is running into one more, and probes again after a miss or a failure', async () => {
		const pending = new DeferredPromise<readonly AuthenticationSession[]>();
		const sessionsChanged = store.add(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
		let microsoftCalls = 0;
		let failNext = false;
		const { service, calls, reported } = createService({
			onDidChangeSessions: sessionsChanged.event,
			respond: async call => {
				if (call.providerId !== 'microsoft') {
					return [];
				}
				if (failNext) {
					failNext = false;
					throw new Error('offline');
				}
				// The service probes as soon as it exists; that first probe is held open.
				return ++microsoftCalls === 1 ? pending.p : [probeSession('first', 'entra-first')];
			}
		});
		// A dialog and a Microsoft sign-in change, both while the first probe runs, add up to one more probe after it.
		showSignIn(service);
		sessionsChanged.fire({ providerId: 'microsoft', label: 'Microsoft', event: { added: [], removed: [], changed: [] } });
		const probesWhileRunning = calls.length;
		await pending.complete([probeSession('first', 'entra-first')]);
		await timeout(0);
		failNext = true;
		showSignIn(service);
		await timeout(0);
		showSignIn(service);
		await timeout(0);

		assert.deepStrictEqual({ probesWhileRunning, reported }, {
			probesWhileRunning: 1,
			reported: [
				{ outcome: MicrosoftSignInProbeOutcome.NotLinked, microsoftAccounts: 1 },
				{ outcome: MicrosoftSignInProbeOutcome.NotLinked, microsoftAccounts: 1 },
				{ outcome: MicrosoftSignInProbeOutcome.Error, microsoftAccounts: 0 },
				{ outcome: MicrosoftSignInProbeOutcome.NotLinked, microsoftAccounts: 1 },
			],
		});
	});

	test('skips a coalesced probe once the one before it found a linked account', async () => {
		const pending = new DeferredPromise<readonly AuthenticationSession[]>();
		let microsoftCalls = 0;
		const { service, reported } = createService({
			respond: async call => call.providerId !== 'microsoft'
				? [probeSession('mona_contoso', '')]
				: ++microsoftCalls === 1 ? pending.p : [probeSession('first', 'entra-first')]
		});
		showSignIn(service);
		await pending.complete([probeSession('first', 'entra-first')]);
		await timeout(0);

		assert.deepStrictEqual({ reported, microsoftCalls, offered: showSignIn(service) }, {
			reported: [{ outcome: MicrosoftSignInProbeOutcome.Linked, microsoftAccounts: 1 }],
			microsoftCalls: 1,
			offered: true,
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
			undefined as never,
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
			undefined as never,
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
		let microsoftSignInAsked = 0;
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
		instantiationService.stub(IChatMicrosoftSignInProbeService, {
			offerMicrosoftSignIn: constObservable(false),
			notifySignInShown: () => { microsoftSignInAsked++; },
		});
		instantiationService.stub(ILayoutService, {});
		instantiationService.stubInstance(ChatSetupDialog, {
			show: () => {
				void dialogShown.complete();
				return dialogResult.p;
			},
			dispose: () => { void dialogResult.complete(ChatSetupStrategy.Canceled); },
		});
		const setup = instantiationService.createInstance(ChatSetup, context, controller);
		return { setup, impressions, dialogShown, dialogResult, microsoftSignInAsked: () => microsoftSignInAsked };
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

	test('asks whether to offer Microsoft sign-in only for dialogs with sign-in buttons', async () => {
		async function askedAfterTwoDialogs(entitlement: ChatEntitlement, accountAvailable: boolean): Promise<number> {
			const { setup, dialogResult, microsoftSignInAsked } = createSetup(entitlement, accountAvailable);
			const first = setup.run();
			await dialogResult.complete(ChatSetupStrategy.Canceled);
			await first;
			await setup.run();
			return microsoftSignInAsked();
		}

		assert.deepStrictEqual({
			signIn: await askedAfterTwoDialogs(ChatEntitlement.Unknown, false),
			// Asking logs the experiment trigger, so a dialog without sign-in buttons must not ask.
			setupOnly: await askedAfterTwoDialogs(ChatEntitlement.Unresolved, true),
		}, {
			signIn: 2,
			setupOnly: 0,
		});
	});

	test('does not report a dialog canceled before showing', async () => {
		const calls: string[] = [];
		await showChatSetupDialogWithCancellation({
			show: async () => { calls.push('show'); return ChatSetupStrategy.Canceled; },
			dispose: () => { },
		}, CancellationToken.Cancelled, () => calls.push('dismissed'), () => calls.push('impression'));
		assert.deepStrictEqual(calls, []);
	});
});
