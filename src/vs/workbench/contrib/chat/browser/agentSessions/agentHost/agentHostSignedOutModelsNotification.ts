/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostService, protectedResourcesRequireGitHubCopilotSignIn } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ProtectedResourceMetadata } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { hasVisibleByokModelsTargetingSessionType } from '../sessionTypeAvailability.js';
import { CHAT_SETUP_ACTION_ID } from '../../actions/chatActions.js';
import { ChatSetupDialogVisibleContext } from '../../chatSetup/chatSetup.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationCommandAction, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelsService } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../../../common/languageModelsConfiguration.js';
import { getAgentHostSignInOptions, resolveProtectedResourceAuthenticationState } from './agentHostAuth.js';
import { IAgentHostProtectedResourcesService } from './agentHostProtectedResourcesService.js';

const SIGNED_OUT_MODELS_NOTIFICATION_ID = 'agentHost.signedOutModels.copilot';
const COPILOT_AGENT_HOST_PROVIDER_ID = 'copilotcli';
type CopilotAuthenticationState = Awaited<ReturnType<typeof resolveProtectedResourceAuthenticationState>>;
const NOTIFICATION_CONTEXT_KEYS = new Set([
	ChatEntitlementContextKeys.clientByokEnabled.key,
	ChatSetupDialogVisibleContext.key,
]);
/**
 * Upper bound on waiting for local model readiness. Extension registration and
 * config loading always settle, but a vendor named in the user's BYOK config may
 * never resolve, so the wait is capped rather than open-ended.
 */
const NOTIFICATION_GRACE_PERIOD_MS = 5_000;

export const enum SignedOutModelsNotificationState {
	Hidden,
	Waiting,
	Visible,
	VisibleMissingPermissions,
}

/** Chooses sign-in guidance only once account and model availability are known. */
export function getSignedOutModelsNotificationState(options: {
	readonly accountResolved: boolean;
	readonly entitlementResolved: boolean;
	readonly signedIn: boolean;
	readonly copilotAuthentication?: 'resolved' | 'signedOut' | 'unavailable';
	readonly hasCopilotHarness: boolean;
	readonly hasModels: boolean;
	readonly localModelsLoaded: boolean;
	readonly gracePeriodElapsed: boolean;
	readonly setupDialogVisible: boolean;
}): SignedOutModelsNotificationState {
	if (options.setupDialogVisible || !options.accountResolved || !options.entitlementResolved || !options.hasCopilotHarness || options.hasModels) {
		return SignedOutModelsNotificationState.Hidden;
	}
	if (options.signedIn && options.copilotAuthentication !== 'signedOut') {
		return SignedOutModelsNotificationState.Hidden;
	}
	// Readiness is the fast path; the grace period bounds it because a vendor named
	// in the user's config may never resolve — no provider registers for it (an
	// uninstalled or inactive extension), or the provider's model lookup hangs.
	return options.localModelsLoaded || options.gracePeriodElapsed
		? (options.signedIn ? SignedOutModelsNotificationState.VisibleMissingPermissions : SignedOutModelsNotificationState.Visible)
		: SignedOutModelsNotificationState.Waiting;
}

export function areLocalModelsLoaded(extensionsRegistered: boolean, configurationLoaded: boolean, configuredByokVendors: readonly string[], hasResolvedVendor: (vendor: string) => boolean): boolean {
	return extensionsRegistered && configurationLoaded && configuredByokVendors.every(hasResolvedVendor);
}

/**
 * Shows harness-scoped guidance when GitHub Copilot authentication is missing and no usable models are available.
 */
export class AgentHostSignedOutModelsNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostSignedOutModelsNotification';

	private _notificationKey: string | undefined;
	private _authenticationSequence = 0;
	private _pendingAuthenticationKey: string | undefined;
	/** The last lookup result, keyed by the account and resource it was computed for. */
	private _copilotAuthentication: { readonly key: string; readonly state: CopilotAuthenticationState | undefined; readonly scopes: readonly string[] } | undefined;
	/** Startup readiness prevents transient empty catalogs from producing false notifications. */
	private _accountResolved = false;
	private _extensionsRegistered = false;
	private _configurationLoaded = false;
	private _gracePeriodElapsed = false;
	private readonly _gracePeriod = this._register(new MutableDisposable());

	constructor(
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@IAuthenticationService authenticationService: IAuthenticationService,
		@IAgentHostProtectedResourcesService private readonly _protectedResourcesService: IAgentHostProtectedResourcesService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		// Reconcile whenever auth, model registration/visibility, configuration, or host state can change the answer.
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => {
			this._accountResolved = true;
			void this._updateAuthentication();
		}));
		this._defaultAccountService.getDefaultAccount().then(() => {
			if (!this._store.isDisposed) {
				this._accountResolved = true;
				void this._updateAuthentication();
			}
		});
		this._register(Event.any(
			Event.signal(authenticationService.onDidChangeSessions),
			Event.signal(authenticationService.onDidRegisterAuthenticationProvider),
			Event.signal(authenticationService.onDidUnregisterAuthenticationProvider),
			Event.signal(Event.filter(this._protectedResourcesService.onDidChange, provider => provider === COPILOT_AGENT_HOST_PROVIDER_ID)),
		)(() => { void this._updateAuthentication(); }));
		this._register(Event.any(
			this._chatEntitlementService.onDidChangeEntitlement,
			this._languageModelsService.onDidChangeLanguageModels,
			this._languageModelsService.onDidChangeModelVisibility,
			this._languageModelsConfigurationService.onDidChangeLanguageModelGroups,
			Event.filter(this._contextKeyService.onDidChangeContext, event => event.affectsSome(NOTIFICATION_CONTEXT_KEYS)),
		)(() => this._update()));
		extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (!this._store.isDisposed) {
				this._extensionsRegistered = true;
				this._update();
			}
		});
		this._languageModelsConfigurationService.whenReady.then(() => {
			if (!this._store.isDisposed) {
				this._configurationLoaded = true;
				this._update();
			}
		});
		const rootStateListeners = this._register(new DisposableStore());
		const bindRootState = () => {
			rootStateListeners.clear();
			rootStateListeners.add(this._agentHostService.rootState.onDidChange(() => this._updateAuthenticationIfStale()));
			if (this._agentHostService.rootState.onDidError) {
				rootStateListeners.add(this._agentHostService.rootState.onDidError(() => this._update()));
			}
			void this._updateAuthentication();
		};
		bindRootState();
		this._register(this._agentHostService.onAgentHostStart(bindRootState));
	}

	private _getCopilotAuthenticationTarget(): { readonly key: string; readonly resource: ProtectedResourceMetadata } | undefined {
		const account = this._defaultAccountService.currentDefaultAccount;
		const resource = this._protectedResourcesService.getProtectedResources(COPILOT_AGENT_HOST_PROVIDER_ID)
			?.find(resource => protectedResourcesRequireGitHubCopilotSignIn([resource]));
		return account && resource
			? { key: JSON.stringify([account.authenticationProvider.id, account.sessionId, resource]), resource }
			: undefined;
	}

	/** Looks up the session again only when the account or resource metadata changed. */
	private _updateAuthenticationIfStale(): void {
		const key = this._getCopilotAuthenticationTarget()?.key;
		if (key !== undefined && key !== this._copilotAuthentication?.key && key !== this._pendingAuthenticationKey) {
			void this._updateAuthentication();
		} else {
			this._update();
		}
	}

	private async _updateAuthentication(): Promise<void> {
		const sequence = ++this._authenticationSequence;
		const target = this._getCopilotAuthenticationTarget();
		this._pendingAuthenticationKey = target?.key;
		this._update();
		if (!target) {
			return;
		}
		let state: CopilotAuthenticationState | undefined;
		try {
			state = await this._instantiationService.invokeFunction(resolveProtectedResourceAuthenticationState, target.resource, '[AgentHostSignedOutModelsNotification]');
		} catch {
			state = undefined;
		}
		if (this._store.isDisposed || sequence !== this._authenticationSequence) {
			return;
		}
		this._pendingAuthenticationKey = undefined;
		this._copilotAuthentication = { key: target.key, state, scopes: target.resource.scopes_supported ?? [] };
		this._update();
	}

	private _update(): void {
		// Local BYOK readiness is shared by both harnesses; the Agent Host's own bridged catalog is covered by the grace period.
		const entitlement = this._chatEntitlementService.entitlement;
		const entitlementResolved = entitlement !== ChatEntitlement.Unresolved;
		const signedIn = this._defaultAccountService.currentDefaultAccount !== null
			|| (entitlementResolved && entitlement !== ChatEntitlement.Unknown);
		const configuredByokVendors = new Set(this._languageModelsConfigurationService.getLanguageModelsProviderGroups()
			.map(group => group.vendor)
			.filter(vendor => vendor !== COPILOT_VENDOR_ID));
		const localModelsLoaded = areLocalModelsLoaded(
			this._extensionsRegistered,
			this._configurationLoaded,
			[...configuredByokVendors],
			vendor => this._languageModelsService.hasResolvedVendor(vendor),
		);
		const rootState = this._agentHostService.rootState.value;
		const hasCopilotHarness = !!rootState
			&& !(rootState instanceof Error)
			&& rootState.agents.some(agent => agent.provider === COPILOT_AGENT_HOST_PROVIDER_ID);
		const hasModels = this._chatEntitlementService.clientByokEnabled
			&& hasVisibleByokModelsTargetingSessionType(this._languageModelsService, SessionType.AgentHostCopilot);
		// A result computed for another account or resource is unknown until the current lookup finishes.
		const authenticationKey = this._getCopilotAuthenticationTarget()?.key;
		const state = getSignedOutModelsNotificationState({
			accountResolved: this._accountResolved,
			entitlementResolved,
			signedIn,
			copilotAuthentication: authenticationKey !== undefined && this._copilotAuthentication?.key === authenticationKey ? this._copilotAuthentication.state : undefined,
			hasCopilotHarness,
			hasModels,
			localModelsLoaded,
			gracePeriodElapsed: this._gracePeriodElapsed,
			setupDialogVisible: this._contextKeyService.getContextKeyValue<boolean>(ChatSetupDialogVisibleContext.key) === true,
		});
		this._updateGracePeriod(state);
		this._setNotification(state);
	}

	private _updateGracePeriod(state: SignedOutModelsNotificationState): void {
		if (state === SignedOutModelsNotificationState.Hidden) {
			this._gracePeriod.clear();
			this._gracePeriodElapsed = false;
			return;
		}
		if (state === SignedOutModelsNotificationState.Visible || state === SignedOutModelsNotificationState.VisibleMissingPermissions) {
			// Readiness may have settled before the timer fired. Drop it so a later
			// wait starts a full budget instead of inheriting the remainder, but keep
			// an already elapsed flag: clearing it here would flip straight back to
			// waiting and hide the notification that flag just made visible.
			this._gracePeriod.clear();
			return;
		}
		if (!this._gracePeriod.value) {
			this._gracePeriod.value = disposableTimeout(() => {
				this._gracePeriodElapsed = true;
				this._update();
			}, NOTIFICATION_GRACE_PERIOD_MS);
		}
	}

	private _setNotification(state: SignedOutModelsNotificationState): void {
		const missingPermissions = state === SignedOutModelsNotificationState.VisibleMissingPermissions;
		const key = state === SignedOutModelsNotificationState.Visible || missingPermissions
			? JSON.stringify([state, missingPermissions ? this._copilotAuthentication?.scopes ?? [] : []])
			: undefined;
		if (key === this._notificationKey) {
			return;
		}
		this._notificationKey = key;
		if (key === undefined) {
			this._chatInputNotificationService.deleteNotification(SIGNED_OUT_MODELS_NOTIFICATION_ID);
			return;
		}
		this._chatInputNotificationService.setNotification(this._createNotification(missingPermissions));
	}

	private _createNotification(missingPermissions: boolean): IChatInputNotification {
		const signInAction: IChatInputNotificationCommandAction = {
			kind: ChatInputNotificationActionKind.Command,
			label: localize('agentHost.signedOutModels.signIn', "Sign In"),
			commandId: CHAT_SETUP_ACTION_ID,
			commandArgs: missingPermissions ? [undefined, getAgentHostSignInOptions(this._copilotAuthentication?.scopes ?? [])] : undefined,
			primary: missingPermissions ? true : undefined,
			keepOpen: true,
		};
		return {
			id: SIGNED_OUT_MODELS_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: missingPermissions
				? localize('agentHost.missingPermissions.message', "GitHub Copilot needs additional permissions.")
				: localize('agentHost.signedOutModels.message', "Choose how you want to use Copilot."),
			description: missingPermissions
				? localize('agentHost.missingPermissions.description', "Your GitHub sign-in doesn't grant the access Copilot requires. Sign in again to continue.")
				: localize('agentHost.signedOutModels.description', "Sign in to use GitHub Copilot models, or add a model with your own API key."),
			actions: missingPermissions ? [signInAction] : [
				{
					kind: ChatInputNotificationActionKind.Command,
					label: localize('agentHost.signedOutModels.addModels', "Add Models"),
					commandId: MANAGE_CHAT_COMMAND_ID,
					keepOpen: true,
				},
				signInAction,
			],
			dismissible: false,
			autoDismissOnMessage: false,
			sessionTypes: [SessionType.AgentHostCopilot],
		};
	}
}
