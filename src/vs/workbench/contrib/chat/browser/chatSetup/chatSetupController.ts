/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellation, raceCancellationError, raceTimeout, Sequencer } from '../../../../../base/common/async.js';
import { distinct } from '../../../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableFromEvent, waitForState } from '../../../../../base/common/observable.js';
import { equals } from '../../../../../base/common/objects.js';
import Severity from '../../../../../base/common/severity.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { isObject, isUndefined } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import product from '../../../../../platform/product/common/product.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IActivityService, ProgressBadge } from '../../../../services/activity/common/activity.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { ChatEntitlement, ChatEntitlementContext, ChatEntitlementRequests, isProUser } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_OPEN_ACTION_ID } from '../actions/chatActions.js';
import { ChatViewContainerId, ChatViewId } from '../chat.js';
import { ChatSetupAnonymous, ChatSetupError, ChatSetupStep, ChatSetupResultValue, InstallChatEvent, InstallChatClassification, refreshTokens, maybeEnableAuthExtension } from './chatSetup.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { addGitHubEnterpriseUri, getConfiguredGitHubEnterpriseUris, GheParseResultKind, gitHubEnterpriseUrisSetting, isValidGitHubEnterpriseUri, parseGheInstanceInput } from '../../../../services/accounts/common/githubEnterprise.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraResources } from '../../../../../platform/agentHost/common/copilotEntraAuthentication.js';
import { ProtectedResourceMetadata } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { AuthRequiredReason, NotificationType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI, RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { URI } from '../../../../../base/common/uri.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { AgentHostCopilotM365EnabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { toAuthenticateRequest } from '../agentSessions/agentHost/agentHostAuth.js';

const defaultChat = {
	chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? '',
	provider: product.defaultChatAgent?.provider ?? { default: { id: '', name: '' }, enterprise: { id: '', name: '' }, apple: { id: '', name: '' }, google: { id: '', name: '' }, microsoft: { id: '', name: '' } },
	providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? 'github-enterprise.uri',
	completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? '',
};

class MicrosoftSetupError extends Error {
	constructor(readonly resource: ProtectedResourceMetadata, readonly rootState: IAgentHostService['rootState'], cause: unknown) {
		super(toErrorMessage(cause), { cause });
	}
}

export interface IChatSetupControllerOptions {
	readonly forceSignIn?: boolean;
	readonly useSocialProvider?: string;
	readonly useEnterpriseProvider?: boolean;
	readonly additionalScopes?: readonly string[];
	readonly forceAnonymous?: ChatSetupAnonymous;
	readonly cancellationToken?: CancellationToken;
}

export class ChatSetupController extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _step = ChatSetupStep.Initial;
	get step(): ChatSetupStep { return this._step; }

	constructor(
		private readonly context: ChatEntitlementContext,
		private readonly requests: ChatEntitlementRequests,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ILogService private readonly logService: ILogService,
		@IProgressService private readonly progressService: IProgressService,
		@IActivityService private readonly activityService: IActivityService,
		@ICommandService private readonly commandService: ICommandService,
		@IDialogService private readonly dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.context.onDidChange(() => this._onDidChange.fire()));
	}

	private setStep(step: ChatSetupStep): void {
		if (this._step === step) {
			return;
		}

		this._step = step;
		this._onDidChange.fire();
	}

	async setup(options: IChatSetupControllerOptions = {}): Promise<ChatSetupResultValue> {
		const watch = new StopWatch(false);
		const title = localize('setupChatProgress', "Getting chat ready...");
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(options.cancellationToken));
		const microsoftSetup = options.useSocialProvider === 'microsoft' && this.configurationService.getValue(AgentHostCopilotM365EnabledSettingId) === true;
		store.add(this.activityService.showViewContainerActivity(ChatViewContainerId, {
			badge: new ProgressBadge(() => title),
		}));

		try {
			return await this.progressService.withProgress({
				location: ProgressLocation.Window,
				command: microsoftSetup ? undefined : CHAT_OPEN_ACTION_ID,
				cancellable: microsoftSetup,
				title,
			}, () => this.doSetup({ ...options, cancellationToken: cancellation.token }, watch), () => cancellation.cancel());
		} finally {
			store.dispose();
		}
	}

	private async doSetup(options: IChatSetupControllerOptions, watch: StopWatch): Promise<ChatSetupResultValue> {
		if (options.cancellationToken?.isCancellationRequested) {
			return undefined;
		}

		if (options.useSocialProvider === 'microsoft' && this.configurationService.getValue(AgentHostCopilotM365EnabledSettingId) === true) {
			return this.setupMicrosoftAccount(options);
		}
		return this.setupLegacyAccount(options, watch);
	}

	private async setupLegacyAccount(options: IChatSetupControllerOptions, watch: StopWatch): Promise<ChatSetupResultValue> {
		this.context.suspend();  // reduces flicker

		let success: ChatSetupResultValue = false;
		try {
			let entitlement: ChatEntitlement | undefined;

			let signIn: boolean;
			if (options.forceSignIn) {
				signIn = true; // forced to sign in
			} else if (this.context.state.entitlement === ChatEntitlement.Unknown) {
				if (options.forceAnonymous) {
					signIn = false; // forced to anonymous without sign in
				} else {
					signIn = true; // sign in since we are signed out
				}
			} else {
				signIn = false; // already signed in
			}

			if (signIn) {
				this.setStep(ChatSetupStep.SigningIn);
				const result = await this.signIn(options);
				if (!result) {
					return undefined;
				}
				if (!result.defaultAccount) {
					const provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNotSignedIn', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
					return undefined; // treat as cancelled because signing in already triggers an error dialog
				}

				entitlement = result.entitlement;
			}

			if (options.cancellationToken?.isCancellationRequested) {
				return undefined;
			}

			// Await Install
			this.setStep(ChatSetupStep.Installing);
			success = await this.install(entitlement ?? this.context.state.entitlement, watch, options);
		} finally {
			this.setStep(ChatSetupStep.Initial);
			this.context.resume();
		}

		return success;
	}

	private async setupMicrosoftAccount(options: IChatSetupControllerOptions): Promise<ChatSetupResultValue> {
		const token = options.cancellationToken ?? CancellationToken.None;
		try {
			while (!token.isCancellationRequested) {
				try {
					return await this.doMicrosoftAccountSetup(token);
				} catch (error) {
					if (isCancellationError(error) || token.isCancellationRequested) {
						await this.clearMicrosoftSetup(error);
						return undefined;
					}
					this.logService.error('[chat setup] Microsoft Copilot setup failed', error);
					if (!await this.retryMicrosoftSetup(error)) {
						await this.clearMicrosoftSetup(error);
						throw new ChatSetupError(error instanceof Error ? error : new Error(toErrorMessage(error)), true);
					}
				}
			}
			return undefined;
		} finally {
			this.setStep(ChatSetupStep.Initial);
		}
	}

	private async clearMicrosoftSetup(error: unknown): Promise<void> {
		if (!(error instanceof MicrosoftSetupError)) {
			return;
		}
		if (this.agentHostService.connectionAvailable?.get() === false || this.agentHostService.rootState !== error.rootState) {
			this.logService.debug('[chat setup] The original Microsoft setup connection is no longer available to clear');
			return;
		}
		const result = await this.agentHostService.authenticate({ resource: error.resource.resource, scopes: error.resource.scopes_supported, token: '' });
		if (result.authenticated === false) {
			throw new Error(localize('copilotMicrosoftResetRejected', "The agent host could not clear the incomplete Microsoft Copilot setup."));
		}
	}

	private async retryMicrosoftSetup(error: unknown): Promise<boolean> {
		if (this.lifecycleService.willShutdown) {
			return false;
		}
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Error,
			message: localize('copilotDiscoveryRetry', "Copilot setup could not be completed. Would you like to try again?"),
			detail: toErrorMessage(error),
			primaryButton: localize('retry', "Retry"),
		});
		return confirmed;
	}

	private async doMicrosoftAccountSetup(token: CancellationToken): Promise<ChatSetupResultValue> {
		this.setStep(ChatSetupStep.SigningIn);
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		store.add(this.agentHostService.onAgentHostExit(() => cancellation.cancel()));
		let started: { resource: ProtectedResourceMetadata; rootState: IAgentHostService['rootState'] } | undefined;
		try {
			this.agentHostService.startAgentHost();
			await waitForState(this.agentHostService.connectionAvailable ?? constObservable(true), available => available, undefined, cancellation.token);
			const subscription = this.agentHostService.rootState;
			const published = observableFromEvent(store, Event.any(subscription.onDidChange, subscription.onDidError ?? Event.None), () => subscription.value);
			const root = derived(reader =>
				this.agentHostService.connectionAvailable?.read(reader) === false || this.agentHostService.rootState !== subscription
					? new Error(localize('copilotHostDisconnected', "The agent host disconnected during Copilot setup."))
					: published.read(reader));
			const initial = await waitForState(root, (state): state is RootState => !!state && !(state instanceof Error), state => state instanceof Error ? state : undefined, cancellation.token);
			const agent = initial.agents.find(agent => agent.protectedResources?.some(resource => resource.resource === copilotEntraDiscoveryResource));
			const discovery = agent?.protectedResources?.find(resource => resource.resource === copilotEntraDiscoveryResource);
			if (!agent || !discovery) {
				throw new Error(localize('copilotMicrosoftUnavailable', "Microsoft Copilot setup is not available on the current agent host."));
			}
			const identity = await this.getMicrosoftSession(discovery, cancellation.token);
			const currentResources = () => {
				const state = root.get();
				if (state instanceof Error) {
					throw state;
				}
				return state?.agents.find(candidate => candidate.provider === agent.provider)?.protectedResources ?? [];
			};
			const targets = new Set(copilotEntraResources.values());
			const failed = new DeferredPromise<never>();
			const prompts = new Sequencer();
			const credentials = new Map<string, { resource: ProtectedResourceMetadata; credential: DeferredPromise<AuthenticationSession | undefined> }>();
			const identityCredential = new DeferredPromise<AuthenticationSession | undefined>();
			await identityCredential.complete(identity);
			credentials.set(discovery.resource, { resource: discovery, credential: identityCredential });
			// The host names a service it offers. A credential it asked for and was not given stays advertised without a name, also across attempts.
			const offeredServices = (resources: readonly ProtectedResourceMetadata[]) => resources.filter(resource => targets.has(resource.resource) && !!resource.resource_name);
			const answerChallenge = async (resource: ProtectedResourceMetadata, reason: AuthRequiredReason | undefined, credential: DeferredPromise<AuthenticationSession | undefined>) => {
				try {
					// The host announces a challenge before it advertises the challenged resource.
					await waitForState(root,
						state => !!state && !(state instanceof Error) && state.agents.some(candidate => candidate.provider === agent.provider && candidate.protectedResources?.some(advertised => equals(advertised, resource))),
						state => state instanceof Error ? state : undefined, cancellation.token);
					await prompts.queue(async () => {
						if (!currentResources().some(advertised => equals(advertised, resource))) {
							// Another path satisfied the requirement before anything was asked, so choosing this service acquires its credential the ordinary way.
							credentials.delete(resource.resource);
							await credential.complete(undefined);
							return;
						}
						this.requireMicrosoftResource(resource, currentResources(), cancellation.token);
						const session = await this.getMicrosoftCredential(resource, identity.account, cancellation.token, reason === AuthRequiredReason.Expired);
						await credential.complete(session);
						await this.authenticateMicrosoftResource(resource, session, currentResources(), cancellation.token);
					});
				} catch (error) {
					// One service's permission can be unavailable while the host still offers another, so its result decides.
					if (!cancellation.token.isCancellationRequested) {
						this.logService.info(`[chat setup] Microsoft authentication for ${resource.resource} was not completed: ${toErrorMessage(error)}`);
					}
					await credential.error(error);
				}
			};
			store.add(this.agentHostService.onDidNotification(notification => {
				if (notification.type !== NotificationType.AuthRequired || notification.channel !== ROOT_STATE_URI || cancellation.token.isCancellationRequested || failed.isSettled) {
					return;
				}
				const resource = notification.resource;
				if (resource.resource !== discovery.resource && !targets.has(resource.resource)) {
					return;
				}
				const previous = credentials.get(resource.resource);
				if (previous) {
					if (previous.credential.isResolved) {
						void failed.error(new Error(localize('copilotRepeatedChallenge', "The agent host requested Microsoft authentication again after it was already answered. Try setup again.")));
					}
					return;
				}
				const credential = new DeferredPromise<AuthenticationSession | undefined>();
				credential.p.catch(() => { });
				credentials.set(resource.resource, { resource, credential });
				void answerChallenge(resource, notification.reason, credential);
			}));
			const setup = (async () => {
				this.requireMicrosoftResource(discovery, currentResources(), cancellation.token);
				started = { resource: discovery, rootState: subscription };
				await this.authenticateMicrosoftResource(discovery, identity, currentResources(), cancellation.token);
				const updated = await raceTimeout(waitForState(root,
					state => !!state && !(state instanceof Error) && offeredServices(state.agents.find(candidate => candidate.provider === agent.provider)?.protectedResources ?? []).length > 0,
					state => state instanceof Error ? state : undefined, cancellation.token), 30_000);
				if (!updated) {
					throw new Error(localize('copilotDiscoveryIncomplete', "Copilot service availability could not be confirmed. Your Microsoft sign-in has been retained."));
				}
				const offered = offeredServices(currentResources());
				const choice = offered.length === 1 ? offered[0] : await this.chooseCopilotService(offered, cancellation.token);
				if (!choice) {
					return undefined;
				}
				this.requireMicrosoftResource(choice, currentResources(), cancellation.token);
				const challenged = credentials.get(choice.resource);
				const answered = await challenged?.credential.p;
				const credential = answered ?? await this.getMicrosoftCredential(choice, identity.account, cancellation.token);
				if (challenged && answered && (!equals(challenged.resource.authorization_servers, choice.authorization_servers) || !choice.scopes_supported?.every(scope => credential.scopes.includes(scope)))) {
					throw new Error(localize('copilotConsentChanged', "The Microsoft authentication requirements changed during setup. Try setup again."));
				}
				if (!answered) {
					const acquired = new DeferredPromise<AuthenticationSession | undefined>();
					await acquired.complete(credential);
					credentials.set(choice.resource, { resource: choice, credential: acquired });
				}
				await this.authenticateMicrosoftResource(choice, credential, currentResources(), cancellation.token);
				this.requireMicrosoftResource(choice, currentResources(), cancellation.token);
				this.setStep(ChatSetupStep.Installing);
				await this.doInstall();
				this.requireMicrosoftResource(choice, currentResources(), cancellation.token);
				return true;
			})();
			return await Promise.race([setup, failed.p]);
		} catch (error) {
			if (isCancellationError(error) && cancellation.token.isCancellationRequested && !token.isCancellationRequested) {
				error = new Error(localize('copilotHostDisconnected', "The agent host disconnected during Copilot setup."));
			}
			throw started ? new MicrosoftSetupError(started.resource, started.rootState, error) : error;
		} finally {
			cancellation.cancel();
			store.dispose();
		}
	}

	private requireMicrosoftResource(resource: ProtectedResourceMetadata, offered: readonly ProtectedResourceMetadata[], token: CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (!offered.some(candidate => equals(candidate, resource))) {
			throw new Error(localize('copilotResourceNotOffered', "The selected Copilot service is no longer offered by the agent host."));
		}
	}

	private async authenticateMicrosoftResource(resource: ProtectedResourceMetadata, credential: AuthenticationSession, offered: readonly ProtectedResourceMetadata[], token: CancellationToken): Promise<void> {
		this.requireMicrosoftResource(resource, offered, token);
		const result = await raceCancellationError(this.agentHostService.authenticate(toAuthenticateRequest(resource.resource, resource.scopes_supported, credential, 'microsoft')), token);
		if (result.authenticated === false) {
			throw new Error(localize('copilotAuthenticationRejected', "The agent host did not accept Microsoft authentication."));
		}
	}

	private async getMicrosoftSession(resource: ProtectedResourceMetadata, token: CancellationToken): Promise<AuthenticationSession> {
		const available = await raceCancellationError(this.authenticationService.getSessions('microsoft', undefined, { clientId: copilotEntraClientId, silent: true }, true), token);
		const sessions = distinct(available, session => session.account.id);
		return this.getMicrosoftCredential(resource, sessions.length === 1 ? sessions[0].account : undefined, token);
	}

	private async getMicrosoftCredential(resource: ProtectedResourceMetadata, account: AuthenticationSession['account'] | undefined, token: CancellationToken, refresh = false): Promise<AuthenticationSession> {
		const server = resource.authorization_servers?.[0];
		const scopes = resource.scopes_supported;
		if (!server || !scopes?.length) {
			throw new Error(localize('copilotAuthenticationMetadataMissing', "The agent host did not provide Microsoft authentication requirements."));
		}
		const authOptions = { clientId: copilotEntraClientId, authorizationServer: URI.parse(server), account };
		let credential: AuthenticationSession | undefined;
		if (account && !refresh) {
			const credentials = await raceCancellationError(this.authenticationService.getSessions('microsoft', scopes, { ...authOptions, silent: true }, true), token);
			credential = credentials?.find(session => session.account.id === account.id);
		}
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		credential ??= await raceCancellationError(this.authenticationService.createSession('microsoft', scopes, authOptions), token);
		if (account && credential.account.id !== account.id || !credential.accessToken || !scopes.every(scope => credential.scopes.includes(scope))) {
			throw new Error(localize('copilotMicrosoftCredentialMismatch', "Authentication did not provide the requested permissions for the intended Microsoft account."));
		}
		return credential;
	}

	private async chooseCopilotService(resources: readonly ProtectedResourceMetadata[], token: CancellationToken): Promise<ProtectedResourceMetadata | undefined> {
		const choice = await this.quickInputService.pick(resources.map(resource => ({
			label: resource.resource_name ?? resource.resource,
			resource,
		})), {
			title: localize('chooseCopilotService', "Choose a Copilot Service"),
			placeHolder: localize('chooseCopilotServicePlaceholder', "Choose which service to use. Escape keeps Microsoft signed in without completing setup."),
			ignoreFocusLost: true,
		}, token);
		if (!choice || token.isCancellationRequested) {
			return undefined;
		}
		return choice.resource;
	}

	private async signIn(options: IChatSetupControllerOptions): Promise<{ defaultAccount: IDefaultAccount | undefined; entitlement: ChatEntitlement | undefined } | undefined> {
		const authExtensionReEnabled = await maybeEnableAuthExtension(this.extensionsWorkbenchService, this.logService);
		if (authExtensionReEnabled) {
			refreshTokens(this.commandService);
		}
		if (options.cancellationToken?.isCancellationRequested) {
			return undefined;
		}

		let entitlements;
		let defaultAccount;
		let signInError: Error | undefined;
		try {
			const result = await raceCancellation(this.requests.signIn(options), options.cancellationToken ?? CancellationToken.None);
			if (!result) {
				return undefined;
			}
			({ defaultAccount, entitlements } = result);
		} catch (e) {
			this.logService.error(`[chat setup] signIn: error ${e}`);
			signInError = e instanceof Error ? e : new Error(String(e));
		}

		if (options.cancellationToken?.isCancellationRequested) {
			return undefined;
		}

		if (!defaultAccount && !this.lifecycleService.willShutdown) {
			const { confirmed } = await this.dialogService.confirm({
				type: Severity.Error,
				message: localize('unknownSignInError', "Failed to sign in to {0}. Would you like to try again?", this.defaultAccountService.getDefaultAccountAuthenticationProvider().name),
				detail: localize('unknownSignInErrorDetail', "You must be signed in to use AI features."),
				primaryButton: localize('retry', "Retry")
			});

			if (confirmed) {
				return this.signIn(options);
			}
		}
		if (signInError) {
			throw new ChatSetupError(signInError, true);
		}

		return { defaultAccount, entitlement: entitlements?.entitlement };
	}

	private async install(entitlement: ChatEntitlement, watch: StopWatch, options: IChatSetupControllerOptions): Promise<ChatSetupResultValue> {
		const wasRunning = this.context.state.completed && !this.context.state.disabled;
		let signUpResult: boolean | { errorCode: number } | undefined = undefined;

		let provider: string;
		if (options.forceAnonymous && entitlement === ChatEntitlement.Unknown) {
			provider = 'anonymous';
		} else {
			provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
		}

		try {
			if (
				!options.forceAnonymous &&						// User is not asking for anonymous access
				entitlement !== ChatEntitlement.Free &&			// User is not signed up to Copilot Free
				!isProUser(entitlement) &&						// User is not signed up for a Copilot subscription
				entitlement !== ChatEntitlement.Unavailable		// User is eligible for Copilot Free
			) {
				signUpResult = await this.requests.signUpFree();

				if (isUndefined(signUpResult)) {
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedNoSession', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
					return false; // unexpected
				}

				if (typeof signUpResult !== 'boolean' /* error */) {
					this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedSignUp', installDuration: watch.elapsed(), signUpErrorCode: signUpResult.errorCode, provider });
				}
			}

			await this.doInstallWithRetry();
		} catch (error) {
			this.logService.error(`[chat setup] install: error ${error}`);
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: isCancellationError(error) ? 'cancelled' : 'failedInstall', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
			return false;
		}

		if (typeof signUpResult === 'boolean' /* not an error case */ || typeof signUpResult === 'undefined' /* already signed up */) {
			this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: wasRunning && !signUpResult ? 'alreadyInstalled' : 'installed', installDuration: watch.elapsed(), signUpErrorCode: undefined, provider });
		}

		if (wasRunning) {
			// We always trigger refresh of tokens to help the user
			// get out of authentication issues that can happen when
			// for example the sign-up ran after the extension tried
			// to use the authentication information to mint a token
			refreshTokens(this.commandService);
		}

		return true;
	}

	private async doInstallWithRetry(): Promise<void> {
		let error: Error | undefined;
		try {
			await this.doInstall();
		} catch (e) {
			this.logService.error(`[chat setup] install: error ${error}`);
			error = e;
		}

		if (error) {
			if (!this.lifecycleService.willShutdown) {
				const { confirmed } = await this.dialogService.confirm({
					type: Severity.Error,
					message: localize('unknownSetupError', "An error occurred while setting up chat. Would you like to try again?"),
					detail: error && !isCancellationError(error) ? toErrorMessage(error) : undefined,
					primaryButton: localize('retry', "Retry")
				});

				if (confirmed) {
					return this.doInstallWithRetry();
				}
			}

			throw error;
		}
	}

	private async doInstall(): Promise<void> {
		await this.extensionsWorkbenchService.install(defaultChat.chatExtensionId, {
			enable: true,
			isApplicationScoped: true, 	// install into all profiles
			isMachineScoped: false,		// do not ask to sync
			installEverywhere: true,	// install in local and remote
			installPreReleaseVersion: this.productService.quality !== 'stable'
		}, ChatViewId);
	}

	async setupWithProvider(options: IChatSetupControllerOptions): Promise<ChatSetupResultValue> {
		if (options.cancellationToken?.isCancellationRequested) {
			return undefined;
		}

		if (options.useSocialProvider === 'microsoft' && this.configurationService.getValue(AgentHostCopilotM365EnabledSettingId) === true) {
			return this.setup({ ...options, forceSignIn: true });
		}

		const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		registry.registerConfiguration({
			'id': 'copilot.setup',
			'type': 'object',
			'properties': {
				[defaultChat.completionsAdvancedSetting]: {
					'type': 'object',
					'properties': {
						'authProvider': {
							'type': 'string'
						}
					}
				},
				[defaultChat.providerUriSetting]: {
					'type': 'string'
				},
				[gitHubEnterpriseUrisSetting]: {
					'type': 'array',
					'items': { 'type': 'string' },
					'restricted': true
				}
			}
		});

		if (options.useEnterpriseProvider) {
			const success = await this.handleEnterpriseInstance(options.cancellationToken);
			if (!success) {
				this.telemetryService.publicLog2<InstallChatEvent, InstallChatClassification>('commandCenter.chatInstall', { installResult: 'failedEnterpriseSetup', installDuration: 0, signUpErrorCode: undefined, provider: undefined });
				return success; // not properly configured, abort
			}
		}
		if (options.cancellationToken?.isCancellationRequested) {
			return undefined;
		}

		let existingAdvancedSetting = this.configurationService.inspect(defaultChat.completionsAdvancedSetting).user?.value;
		if (!isObject(existingAdvancedSetting)) {
			existingAdvancedSetting = {};
		}

		if (options.useEnterpriseProvider) {
			await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, {
				...existingAdvancedSetting,
				'authProvider': defaultChat.provider.enterprise.id
			}, ConfigurationTarget.USER);
		} else {
			await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, Object.keys(existingAdvancedSetting).length > 0 ? {
				...existingAdvancedSetting,
				'authProvider': undefined
			} : undefined, ConfigurationTarget.USER);
		}

		return this.setup({ ...options, forceSignIn: true });
	}

	private async handleEnterpriseInstance(cancellationToken?: CancellationToken): Promise<ChatSetupResultValue> {
		while (!cancellationToken?.isCancellationRequested) {
			const uris = getConfiguredGitHubEnterpriseUris(this.configurationService, this.workspaceTrustManagementService.isWorkspaceTrusted(), defaultChat.providerUriSetting);
			const invalidUri = uris.find(uri => !isValidGitHubEnterpriseUri(uri));
			const hasCloudInstance = uris.some(uri => parseGheInstanceInput(uri).kind === GheParseResultKind.FullUri);
			if (hasCloudInstance && invalidUri === undefined) {
				return true;
			}

			const result = await this.quickInputService.input({
				prompt: localize('enterpriseInstance', "What is your {0} instance?", defaultChat.provider.enterprise.name),
				placeHolder: localize('enterpriseInstancePlaceholder', 'i.e. "octocat" or "https://octocat.ghe.com"...'),
				ignoreFocusLost: true,
				value: invalidUri,
				validateInput: async value => {
					const parsed = parseGheInstanceInput(value);
					if (parsed.kind === GheParseResultKind.SingleWord) {
						return {
							content: localize('willResolveTo', "Will resolve to {0}", parsed.resolvedUri),
							severity: Severity.Info
						};
					}
					if (parsed.kind === GheParseResultKind.Invalid) {
						return {
							content: localize('invalidEnterpriseInstance2', "Enter a GHE.com instance name or HTTPS URL."),
							severity: Severity.Error
						};
					}
					return undefined;
				}
			}, cancellationToken);

			if (!result || cancellationToken?.isCancellationRequested) {
				return undefined;
			}
			const parsed = parseGheInstanceInput(result);
			if (parsed.kind === GheParseResultKind.Empty || parsed.kind === GheParseResultKind.Invalid) {
				throw new Error(localize('invalidEnterpriseInstance2', "Enter a GHE.com instance name or HTTPS URL."));
			}
			await addGitHubEnterpriseUri(this.configurationService, parsed.resolvedUri, this.workspaceTrustManagementService.isWorkspaceTrusted(), defaultChat.providerUriSetting, invalidUri);
		}
		return undefined;
	}
}
