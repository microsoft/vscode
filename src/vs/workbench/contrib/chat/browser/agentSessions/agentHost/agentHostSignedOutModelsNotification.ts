/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostAllowSignedOutWhenUsableSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatEntitlementContextKeys, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { hasVisibleByokModelsTargetingSessionType } from '../sessionTypeAvailability.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';
import { SessionType } from '../../../common/chatSessionsService.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { COPILOT_VENDOR_ID, ILanguageModelsService } from '../../../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../../../common/languageModelsConfiguration.js';

const SIGNED_OUT_MODELS_NOTIFICATION_ID = 'agentHost.signedOutModels.copilot';
const SIGN_IN_COMMAND_ID = 'workbench.action.chat.triggerSetup';
const COPILOT_AGENT_HOST_PROVIDER_ID = 'copilotcli';
const CLIENT_BYOK_CONTEXT_KEYS = new Set([ChatEntitlementContextKeys.clientByokEnabled.key]);

export function shouldShowSignedOutModelsNotification(allowSignedOutWhenUsable: boolean, modelsLoaded: boolean, accountResolved: boolean, signedIn: boolean, hasModels: boolean): boolean {
	return allowSignedOutWhenUsable && modelsLoaded && accountResolved && !signedIn && !hasModels;
}

export function areLocalModelsLoaded(extensionsRegistered: boolean, configurationLoaded: boolean, configuredByokVendors: readonly string[], hasResolvedVendor: (vendor: string) => boolean): boolean {
	return extensionsRegistered && configurationLoaded && configuredByokVendors.every(hasResolvedVendor);
}

export function hasAvailableAgentHostByokModels(isClientByokEnabled: boolean, hasTargetedModels: boolean): boolean {
	return isClientByokEnabled && hasTargetedModels;
}

/**
 * Shows harness-scoped guidance when signed-out operation is enabled but the selected harness has no usable models.
 */
export class AgentHostSignedOutModelsNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostSignedOutModelsNotification';

	private readonly _shown = new Set<string>();
	/** Startup readiness prevents transient empty catalogs from producing false notifications. */
	private _accountResolved = false;
	private _extensionsRegistered = false;
	private _configurationLoaded = false;

	constructor(
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IContextKeyService contextKeyService: IContextKeyService,
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
		this._register(this._languageModelsService.onDidChangeLanguageModels(() => this._update()));
		this._register(this._languageModelsService.onDidChangeModelVisibility(() => this._update()));
		this._register(this._languageModelsConfigurationService.onDidChangeLanguageModelGroups(() => this._update()));
		this._register(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(CLIENT_BYOK_CONTEXT_KEYS)) {
				this._update();
			}
		}));
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
		// Local BYOK readiness is shared by both harnesses; Agent Host additionally waits for its bridged catalog.
		const allowSignedOutWhenUsable = this._configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
		const signedIn = this._defaultAccountService.currentDefaultAccount !== null;
		const configuredByokVendors = new Set(this._languageModelsConfigurationService.getLanguageModelsProviderGroups()
			.map(group => group.vendor)
			.filter(vendor => vendor !== COPILOT_VENDOR_ID));
		const byokModelsLoaded = areLocalModelsLoaded(
			this._extensionsRegistered,
			this._configurationLoaded,
			[...configuredByokVendors],
			vendor => this._languageModelsService.hasResolvedVendor(vendor),
		);
		const rootState = this._agentHostService.rootState.value;
		const agentHostModelsLoaded = byokModelsLoaded
			&& !!rootState
			&& !(rootState instanceof Error)
			&& rootState.agents.some(agent => agent.provider === COPILOT_AGENT_HOST_PROVIDER_ID)
			&& this._languageModelsService.hasResolvedVendor(SessionType.AgentHostCopilot);
		const hasVisibleAgentHostByokModels = hasAvailableAgentHostByokModels(
			this._chatEntitlementService.clientByokEnabled,
			hasVisibleByokModelsTargetingSessionType(this._languageModelsService, SessionType.AgentHostCopilot),
		);
		this._setNotification(
			SIGNED_OUT_MODELS_NOTIFICATION_ID,
			shouldShowSignedOutModelsNotification(allowSignedOutWhenUsable, agentHostModelsLoaded, this._accountResolved, signedIn, hasVisibleAgentHostByokModels),
			[SessionType.AgentHostCopilot],
		);
	}

	private _setNotification(id: string, show: boolean, sessionTypes: readonly string[]): void {
		// Reconcile by stable id so unrelated input notifications and user interaction state are preserved.
		if (!show) {
			if (this._shown.delete(id)) {
				this._chatInputNotificationService.deleteNotification(id);
			}
			return;
		}
		if (this._shown.has(id)) {
			return;
		}

		this._shown.add(id);
		this._chatInputNotificationService.setNotification(this._createNotification(id, sessionTypes));
	}

	private _createNotification(id: string, sessionTypes: readonly string[]): IChatInputNotification {
		return {
			id,
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
			sessionTypes,
		};
	}
}
