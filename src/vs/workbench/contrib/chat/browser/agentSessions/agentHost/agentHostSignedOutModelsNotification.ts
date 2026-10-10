/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostAllowSignedOutWhenUsableSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { hasVisibleByokModelsTargetingSessionType } from '../sessionTypeAvailability.js';
import { ChatSetupDialogVisibleContext } from '../../chatSetup/chatSetup.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelsService } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../../../common/languageModelsConfiguration.js';

const SIGNED_OUT_MODELS_NOTIFICATION_ID = 'agentHost.signedOutModels.copilot';
const SIGN_IN_COMMAND_ID = 'workbench.action.chat.triggerSetup';
const COPILOT_AGENT_HOST_PROVIDER_ID = 'copilotcli';
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
}

export function getSignedOutModelsNotificationState(options: {
	readonly allowSignedOutWhenUsable: boolean;
	readonly accountResolved: boolean;
	readonly entitlementResolved: boolean;
	readonly signedIn: boolean;
	readonly hasCopilotHarness: boolean;
	readonly hasModels: boolean;
	readonly localModelsLoaded: boolean;
	readonly gracePeriodElapsed: boolean;
	readonly setupDialogVisible: boolean;
}): SignedOutModelsNotificationState {
	if (options.setupDialogVisible || !options.allowSignedOutWhenUsable || !options.accountResolved || !options.entitlementResolved || options.signedIn || !options.hasCopilotHarness || options.hasModels) {
		return SignedOutModelsNotificationState.Hidden;
	}
	// Readiness is the fast path; the grace period bounds it because a vendor named
	// in the user's config may never resolve — no provider registers for it (an
	// uninstalled or inactive extension), or the provider's model lookup hangs.
	return options.localModelsLoaded || options.gracePeriodElapsed
		? SignedOutModelsNotificationState.Visible
		: SignedOutModelsNotificationState.Waiting;
}

export function areLocalModelsLoaded(extensionsRegistered: boolean, configurationLoaded: boolean, configuredByokVendors: readonly string[], hasResolvedVendor: (vendor: string) => boolean): boolean {
	return extensionsRegistered && configurationLoaded && configuredByokVendors.every(hasResolvedVendor);
}

/**
 * Shows harness-scoped guidance when signed-out operation is enabled but the selected harness has no usable models.
 */
export class AgentHostSignedOutModelsNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostSignedOutModelsNotification';

	private _notificationShown = false;
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
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super();

		// Reconcile whenever auth, model registration/visibility, configuration, or host state can change the answer.
		this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => {
			this._accountResolved = true;
			this._update();
		}));
		this._defaultAccountService.getDefaultAccount().then(() => {
			if (!this._store.isDisposed) {
				this._accountResolved = true;
				this._update();
			}
		});
		this._register(Event.any(
			this._chatEntitlementService.onDidChangeEntitlement,
			this._languageModelsService.onDidChangeLanguageModels,
			this._languageModelsService.onDidChangeModelVisibility,
			this._languageModelsConfigurationService.onDidChangeLanguageModelGroups,
			Event.filter(this._contextKeyService.onDidChangeContext, event => event.affectsSome(NOTIFICATION_CONTEXT_KEYS)),
		)(() => this._update()));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId)) {
				this._update();
			}
		}));
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
			rootStateListeners.add(this._agentHostService.rootState.onDidChange(() => this._update()));
			if (this._agentHostService.rootState.onDidError) {
				rootStateListeners.add(this._agentHostService.rootState.onDidError(() => this._update()));
			}
			this._update();
		};
		bindRootState();
		this._register(this._agentHostService.onAgentHostStart(bindRootState));
	}

	private _update(): void {
		// Local BYOK readiness is shared by both harnesses; the Agent Host's own bridged catalog is covered by the grace period.
		const allowSignedOutWhenUsable = this._configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
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
		const state = getSignedOutModelsNotificationState({
			allowSignedOutWhenUsable,
			accountResolved: this._accountResolved,
			entitlementResolved,
			signedIn,
			hasCopilotHarness,
			hasModels,
			localModelsLoaded,
			gracePeriodElapsed: this._gracePeriodElapsed,
			setupDialogVisible: this._contextKeyService.getContextKeyValue<boolean>(ChatSetupDialogVisibleContext.key) === true,
		});
		this._updateGracePeriod(state);
		this._setNotification(state === SignedOutModelsNotificationState.Visible);
	}

	private _updateGracePeriod(state: SignedOutModelsNotificationState): void {
		if (state === SignedOutModelsNotificationState.Hidden) {
			this._gracePeriod.clear();
			this._gracePeriodElapsed = false;
			return;
		}
		if (state === SignedOutModelsNotificationState.Visible) {
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

	private _setNotification(show: boolean): void {
		if (show === this._notificationShown) {
			return;
		}
		this._notificationShown = show;
		if (!show) {
			this._chatInputNotificationService.deleteNotification(SIGNED_OUT_MODELS_NOTIFICATION_ID);
			return;
		}
		this._chatInputNotificationService.setNotification(this._createNotification());
	}

	private _createNotification(): IChatInputNotification {
		return {
			id: SIGNED_OUT_MODELS_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: localize('agentHost.signedOutModels.message', "Choose how you want to use Copilot."),
			description: localize('agentHost.signedOutModels.description', "Sign in to use GitHub Copilot models, or add a model with your own API key."),
			actions: [
				{
					kind: ChatInputNotificationActionKind.Command,
					label: localize('agentHost.signedOutModels.addModels', "Add Models"),
					commandId: MANAGE_CHAT_COMMAND_ID,
					keepOpen: true,
				},
				{
					kind: ChatInputNotificationActionKind.Command,
					label: localize('agentHost.signedOutModels.signIn', "Sign In"),
					commandId: SIGN_IN_COMMAND_ID,
					keepOpen: true,
				}
			],
			dismissible: false,
			autoDismissOnMessage: false,
			sessionTypes: [SessionType.AgentHostCopilot],
		};
	}
}
