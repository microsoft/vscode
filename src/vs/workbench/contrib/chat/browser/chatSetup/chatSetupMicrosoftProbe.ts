/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottlerByKey } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource, cancelOnDispose } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableFromEvent, observableSignal, observableValue, transaction } from '../../../../../base/common/observable.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { ChatMicrosoftAuthenticationEnabledSettingId, ChatMicrosoftAuthenticationMode, toChatMicrosoftAuthenticationMode } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IAuthenticationService, WORKBENCH_ONLY_SESSION_OPTION_PREFIX } from '../../../../services/authentication/common/authentication.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

const MICROSOFT_PROVIDER_ID = 'microsoft';

/**
 * The Entra audience GitHub accepts as the subject token of the Entra-to-GitHub token exchange.
 * Must match `ENTRA_GITHUB_AUDIENCE_SCOPE` in `extensions/github-authentication`, so the probe
 * receives the same token a real "Continue with Microsoft" sign-in would.
 */
const ENTRA_GITHUB_AUDIENCE_SCOPE = '12f6db80-0741-4a7e-b9c5-b85d737b3a31/.default';

/**
 * Asks the Microsoft provider for silent tokens from the work or school accounts the native broker
 * knows about, including accounts the user has not yet allowed VS Code to use. Handled in
 * `extensions/microsoft-authentication`.
 */
const INCLUDE_UNAPPROVED_ACCOUNTS_OPTION = `${WORKBENCH_ONLY_SESSION_OPTION_PREFIX}IncludeUnapprovedAccounts`;

/**
 * Asks the GitHub provider whether GitHub links the Entra identity behind any of the given tokens
 * to a GitHub account. Handled in `extensions/github-authentication`, which revokes the token it
 * mints to find out when the GitHub host and the build allow it. Where they do not, such as in
 * Code - OSS (no client secret) or on a host without the revocation endpoint, the token is left
 * to expire on its own.
 */
const ENTRA_EXCHANGE_PROBE_OPTION = `${WORKBENCH_ONLY_SESSION_OPTION_PREFIX}EntraExchangeProbe`;

export const enum MicrosoftSignInProbeOutcome {
	Linked = 'linked',
	NotLinked = 'notLinked',
	NoMicrosoftAccounts = 'noMicrosoftAccounts',
	Error = 'error',
}

export interface IMicrosoftSignInProbeResult {
	readonly outcome: MicrosoftSignInProbeOutcome;
	/** How many Microsoft work or school accounts could be asked about. */
	readonly microsoftAccounts: number;
}

/**
 * Checks, without showing the user anything, whether any Microsoft work or school account on this
 * device is linked by GitHub to a GitHub account (for example, an Enterprise Managed User).
 *
 * Every step is silent. The Microsoft tokens are never handed to extensions other than the two
 * authentication providers. The GitHub provider revokes the token it mints to answer where the host
 * and build allow it, and otherwise leaves it to expire (see {@link ENTRA_EXCHANGE_PROBE_OPTION}).
 * Both options are reserved for the workbench, so extensions cannot run this check.
 *
 * @param gitHubProviderId The GitHub authentication provider that sign-in would use.
 * @throws {@link CancellationError} when `token` is cancelled; any provider failure is rethrown.
 */
export async function probeMicrosoftSignIn(authenticationService: IAuthenticationService, gitHubProviderId: string, token: CancellationToken): Promise<IMicrosoftSignInProbeResult> {
	const microsoftSessions = await authenticationService.getSessions(MICROSOFT_PROVIDER_ID, [ENTRA_GITHUB_AUDIENCE_SCOPE], {
		silent: true,
		[INCLUDE_UNAPPROVED_ACCOUNTS_OPTION]: true
	}, true);
	if (!microsoftSessions.length) {
		return { outcome: MicrosoftSignInProbeOutcome.NoMicrosoftAccounts, microsoftAccounts: 0 };
	}
	// Checked before GitHub is asked, because asking mints a token.
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const linked = await authenticationService.getSessions(gitHubProviderId, [], {
		silent: true,
		[ENTRA_EXCHANGE_PROBE_OPTION]: { subjectTokens: microsoftSessions.map(session => session.accessToken) }
	}, true);
	// Checked again because the request cannot be cancelled once the provider has it: an answer for
	// accounts that have changed since must not be reported.
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	return {
		outcome: linked.length ? MicrosoftSignInProbeOutcome.Linked : MicrosoftSignInProbeOutcome.NotLinked,
		microsoftAccounts: microsoftSessions.length
	};
}

export const IChatMicrosoftSignInProbeService = createDecorator<IChatMicrosoftSignInProbeService>('chatMicrosoftSignInProbeService');

/**
 * Decides whether sign-in surfaces offer "Continue with Microsoft", according to
 * {@link ChatMicrosoftAuthenticationEnabledSettingId}. In {@link ChatMicrosoftAuthenticationMode.Auto},
 * the option is offered once {@link probeMicrosoftSignIn} finds a linked account for the GitHub
 * host sign-in would use. Probing starts in the background as soon as this service exists, whether
 * or not the user is signed in, so that no surface has to wait for it, forced sign-in dialogs for
 * signed-in users included.
 *
 * The setting is rolled out through experimentation, and this service logs its experiment trigger:
 * in every arm, whenever the assigned default is in effect and offering Microsoft can matter, which
 * is when the background probe could start.
 */
export interface IChatMicrosoftSignInProbeService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether sign-in surfaces should offer "Continue with Microsoft". Can turn on while a surface is
	 * showing, when a probe finds a linked account, so a surface that stays open should follow it.
	 */
	readonly offerMicrosoftSignIn: IObservable<boolean>;

	/**
	 * Call whenever a surface that could offer "Continue with Microsoft" is shown. Logs the experiment
	 * trigger, and never waits: when Microsoft is not offered yet, it probes again in the background.
	 */
	notifySignInShown(): void;
}

type MicrosoftSignInProbeEvent = {
	outcome: string;
	microsoftAccounts: number;
	durationMs: number;
};

type MicrosoftSignInProbeClassification = {
	owner: 'TylerLeonhardt';
	comment: 'Reports whether the silent check for a Microsoft account linked to GitHub found one, to judge whether offering "Continue with Microsoft" automatically works.';
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether a linked account was found, none was, there were no Microsoft accounts, or the check failed.' };
	microsoftAccounts: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'How many Microsoft work or school accounts were checked.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How long the check took, in milliseconds.' };
};

export class ChatMicrosoftSignInProbeService extends Disposable implements IChatMicrosoftSignInProbeService {

	declare readonly _serviceBrand: undefined;

	readonly offerMicrosoftSignIn: IObservable<boolean>;

	private readonly mode: IObservable<ChatMicrosoftAuthenticationMode>;
	private readonly gitHubProviderId: IObservable<string>;
	/** What the mode and the probes say, before whether offering Microsoft can matter at all. */
	private readonly offered: IObservable<boolean>;
	/** The GitHub provider a probe found a linked account for. */
	private readonly linkedGitHubProviderId = observableValue<string | undefined>(this, undefined);
	/**
	 * Runs one probe at a time for each GitHub provider. The authentication service cannot cancel a
	 * request once a provider has it, so a running probe is never abandoned: whatever asks for a probe
	 * meanwhile, such as a dialog or a Microsoft sign-in, is coalesced into one more probe after it.
	 */
	private readonly probes = this._register(new ThrottlerByKey<string>());
	/** Stops a running probe from asking GitHub, and so from minting a token, once this service is gone. */
	private readonly disposed = cancelOnDispose(this._store);
	/**
	 * Cancelled, and replaced, whenever a Microsoft account is added or removed: a probe still running
	 * then answers for accounts that may be gone, so its answer is discarded.
	 */
	private accountsCancellation = new CancellationTokenSource(this.disposed);

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IDefaultAccountService defaultAccountService: IDefaultAccountService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		const setting = observableConfigValue<unknown>(ChatMicrosoftAuthenticationEnabledSettingId, undefined, configurationService);
		this.mode = derived(this, reader => toChatMicrosoftAuthenticationMode(setting.read(reader)));
		this.gitHubProviderId = observableFromEvent(this, defaultAccountService.onDidChangeDefaultAccount, () => defaultAccountService.getDefaultAccountAuthenticationProvider().id);
		this.offered = derived(this, reader => {
			switch (this.mode.read(reader)) {
				case ChatMicrosoftAuthenticationMode.Always: return true;
				case ChatMicrosoftAuthenticationMode.Never: return false;
				default: return this.linkedGitHubProviderId.read(reader) === this.gitHubProviderId.read(reader);
			}
		});
		this.offerMicrosoftSignIn = derived(this, reader => this.isProbeRelevant(reader) && this.offered.read(reader));

		// Adding or removing a Microsoft account can change the answer either way, so whatever was found
		// is forgotten and the accounts are probed again. Token refreshes only fire `changed` and are
		// ignored, because probing mints a GitHub token.
		const microsoftAccountsChanged = observableSignal(this);
		this._register(toDisposable(() => this.accountsCancellation.dispose(true)));
		this._register(authenticationService.onDidChangeSessions(({ providerId, event }) => {
			if (providerId !== MICROSOFT_PROVIDER_ID || !(event.added?.length || event.removed?.length)) {
				return;
			}
			this.accountsCancellation.dispose(true);
			this.accountsCancellation = new CancellationTokenSource(this.disposed);
			transaction(tx => {
				this.linkedGitHubProviderId.set(undefined, tx);
				microsoftAccountsChanged.trigger(tx);
			});
		}));
		// Signed-in users are probed too, so that a forced sign-in dialog already knows the answer when it opens.
		this._register(autorun(reader => {
			microsoftAccountsChanged.read(reader);
			const mode = this.mode.read(reader);
			if (!this.isProbeRelevant(reader)) {
				return;
			}
			// The moment the arms diverge, because only `auto` checks in the background.
			this.logExperimentTrigger();
			if (mode === ChatMicrosoftAuthenticationMode.Auto && !this.offered.read(reader)) {
				this.probe(this.gitHubProviderId.read(reader));
			}
		}));
	}

	notifySignInShown(): void {
		if (!this.isProbeRelevant(undefined)) {
			return;
		}
		this.logExperimentTrigger();
		if (!this.offered.get() && this.mode.get() === ChatMicrosoftAuthenticationMode.Auto) {
			this.probe(this.gitHubProviderId.get());
		}
	}

	/** Whether "Continue with Microsoft" can matter at all, in any mode: independent of the experiment arm. */
	private isProbeRelevant(reader: IReader | undefined): boolean {
		return !this.chatEntitlementService.sentimentObs.read(reader).hidden
			&& !!this.productService.defaultChatAgent?.provider.microsoft?.id;
	}

	/**
	 * Logs the setting's experiment trigger, unless the user or a policy chose a mode themselves: the
	 * assigned default then has no effect, and that holds the same in every arm.
	 */
	private logExperimentTrigger(): void {
		const { userValue, applicationValue, policyValue } = this.configurationService.inspect(ChatMicrosoftAuthenticationEnabledSettingId);
		if (userValue === undefined && applicationValue === undefined && policyValue === undefined) {
			logSettingExperimentTrigger(this.telemetryService, ChatMicrosoftAuthenticationEnabledSettingId);
		}
	}

	private probe(gitHubProviderId: string): void {
		void this.probes.queue(gitHubProviderId, () => this.runProbe(gitHubProviderId));
	}

	private async runProbe(gitHubProviderId: string): Promise<void> {
		// A coalesced probe runs after the one before it, which may have made it pointless.
		if (this.mode.get() !== ChatMicrosoftAuthenticationMode.Auto || this.linkedGitHubProviderId.get() === gitHubProviderId) {
			return;
		}
		const watch = StopWatch.create();
		try {
			const result = await probeMicrosoftSignIn(this.authenticationService, gitHubProviderId, this.accountsCancellation.token);
			this.report(gitHubProviderId, result, watch.elapsed());
			if (result.outcome === MicrosoftSignInProbeOutcome.Linked) {
				this.linkedGitHubProviderId.set(gitHubProviderId, undefined);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this.logService.trace(`[chat setup] Could not check for a Microsoft account linked to GitHub: ${toErrorMessage(error)}`);
				this.report(gitHubProviderId, { outcome: MicrosoftSignInProbeOutcome.Error, microsoftAccounts: 0 }, watch.elapsed());
			}
		}
	}

	private report(gitHubProviderId: string, result: IMicrosoftSignInProbeResult, durationMs: number): void {
		this.logService.trace(`[chat setup] Microsoft sign-in probe for ${gitHubProviderId}: ${result.outcome} (${result.microsoftAccounts} account(s))`);
		this.telemetryService.publicLog2<MicrosoftSignInProbeEvent, MicrosoftSignInProbeClassification>('chatSetup.microsoftSignInProbe', {
			outcome: result.outcome,
			microsoftAccounts: result.microsoftAccounts,
			durationMs: Math.round(durationMs),
		});
	}
}

/** Creates {@link IChatMicrosoftSignInProbeService} after startup, so it can probe before a dialog needs the answer. */
export class ChatMicrosoftSignInProbeContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatMicrosoftSignInProbe';

	constructor(@IChatMicrosoftSignInProbeService _microsoftSignInProbeService: IChatMicrosoftSignInProbeService) { }
}
