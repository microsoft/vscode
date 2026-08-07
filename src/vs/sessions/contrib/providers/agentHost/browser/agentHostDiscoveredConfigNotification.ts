/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AgentHostAllowSignedOutWhenUsableSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import { SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { ConditionalAuthState, conditionalAuthState, isAllowSignedOutWhenUsableEnabled, shouldShowDiscoveredConfigNudge } from '../../../../browser/sessionsAuthGate.js';

const DISCOVERED_CONFIG_NOTIFICATION_ID = 'agentHost.discoveredConfig.claude';

/** Single entry point for starting GitHub Copilot sign-in from a nudge. */
const SIGN_IN_COMMAND_ID = 'workbench.action.chat.triggerSetup';

/** Command bound to the nudge's bell-slash "Don't Show Again" button. */
const MUTE_COMMAND_ID = 'workbench.action.agentHost.discoveredConfig.mute';

/**
 * Persists the user's "Don't Show Again" choice. The discovered config lives on
 * this machine, so the preference is scoped to the machine — {@link
 * StorageScope.APPLICATION} to span profiles and workspaces, and {@link
 * StorageTarget.MACHINE} so settings sync does not carry it to a machine where
 * no such config exists.
 */
const MUTED_STORAGE_KEY = 'agentHost.discoveredConfig.claude.muted';

/**
 * Surfaces a calm chat-input notification in the Agents window when a signed-out
 * user — who has opted into `chat.agentHost.allowSignedOutWhenUsable` — lands
 * with the Claude agent running in native mode because it discovered an existing
 * configuration on disk. Instead of forcing GitHub sign-in, the Agents window
 * lets them in; this banner explains what happened and offers a single "Sign in
 * to GitHub" action for anyone who actually meant to use a Copilot subscription.
 *
 * The banner is scoped to the Claude session type (so it only renders when that
 * harness is selected) and clears itself the moment the user signs in or the
 * agent stops advertising native mode. Its bell-slash button persists a
 * machine-wide "Don't Show Again" choice; the X button dismisses it only for the
 * current window.
 */
export class AgentHostDiscoveredConfigNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.agentHostDiscoveredConfigNotification';

	private _shown = false;
	/**
	 * Set once the initial default-account resolution has completed. Until then
	 * {@link IDefaultAccountService.currentDefaultAccount} reads as `null` even for
	 * a signed-in user, so the nudge stays suppressed to avoid flashing at a
	 * signed-in user during the startup gap.
	 */
	private _accountResolved = false;

	constructor(
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		// The bell-slash button runs this command, which persists the mute; the
		// storage listener below then re-drives `_update` to tear the banner down.
		this._register(CommandsRegistry.registerCommand(MUTE_COMMAND_ID, () => {
			this._storageService.store(MUTED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}));

		// Signing in/out flips the nudge; a session-type change is how the agent
		// host signals that Claude switched between native and proxy (i.e. whether
		// it is usable without GitHub); the opt-in and the mute can both toggle at
		// runtime (the mute from another window on this machine).
		this._register(Event.any(
			this._defaultAccountService.onDidChangeDefaultAccount,
			this._sessionsManagementService.onDidChangeSessionTypes,
			Event.filter(this._configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId), this._store),
			this._storageService.onDidChangeValue(StorageScope.APPLICATION, MUTED_STORAGE_KEY, this._store),
		)(() => this._update()));

		// Until the account resolves, `currentDefaultAccount === null` reads as
		// "signed out" and would flash this signed-out nudge at a signed-in user
		// during startup. The account loads silently (no change event fires), so
		// await the first resolution, then re-evaluate.
		this._defaultAccountService.getDefaultAccount().then(() => {
			if (this._store.isDisposed) {
				return;
			}
			this._accountResolved = true;
			this._update();
		});
	}

	private _update(): void {
		// While the account is unresolved, `currentDefaultAccount` is null for
		// everyone; treating that as "signed out" flashes the nudge at a signed-in
		// user. Nothing is shown yet, so there is nothing to tear down — just wait.
		const authState = conditionalAuthState(this._accountResolved, this._defaultAccountService.currentDefaultAccount !== null);
		if (authState === ConditionalAuthState.Unresolved) {
			return;
		}

		// The Claude agent-host session type, once the host has advertised it.
		// Two providers (local / remote agent host) can offer the same id, so
		// prefer a usable instance and fall back to any for the display label.
		const claudeTypes = this._sessionsManagementService.getAllProviderSessionTypes()
			.filter(type => (type.sessionType.chatSessionType ?? type.sessionType.id) === SessionType.AgentHostClaude)
			.map(type => type.sessionType);
		const claude = claudeTypes.find(type => type.authRequirement === SessionTypeAuthRequirement.None) ?? claudeTypes[0];

		const show = shouldShowDiscoveredConfigNudge({
			signedIn: authState === ConditionalAuthState.SignedIn,
			allowSignedOutWhenUsable: isAllowSignedOutWhenUsableEnabled(this._configurationService),
			usableWithoutGitHub: claude?.authRequirement === SessionTypeAuthRequirement.None,
			muted: this._storageService.getBoolean(MUTED_STORAGE_KEY, StorageScope.APPLICATION, false),
		});

		if (!show) {
			if (this._shown) {
				this._chatInputNotificationService.deleteNotification(DISCOVERED_CONFIG_NOTIFICATION_ID);
				this._shown = false;
			}
			return;
		}

		// Already up: don't re-push, which would clear a pending user dismissal.
		if (this._shown || !claude) {
			return;
		}
		this._shown = true;

		this._chatInputNotificationService.setNotification({
			id: DISCOVERED_CONFIG_NOTIFICATION_ID,
			severity: ChatInputNotificationSeverity.Info,
			message: localize('agentHost.discoveredConfig.message', "We've discovered your existing {0} configuration.", claude.label),
			description: localize('agentHost.discoveredConfig.description', "If you intended to use a Copilot subscription, sign in to GitHub."),
			actions: [{
				kind: ChatInputNotificationActionKind.Command,
				label: localize('agentHost.discoveredConfig.signIn', "Sign in to GitHub"),
				commandId: SIGN_IN_COMMAND_ID,
			}],
			dismissible: true,
			autoDismissOnMessage: true,
			mute: {
				commandId: MUTE_COMMAND_ID,
				tooltip: localize('agentHost.discoveredConfig.mute', "Don't Show Again"),
			},
			sessionTypes: [SessionType.AgentHostClaude],
		});
	}
}
