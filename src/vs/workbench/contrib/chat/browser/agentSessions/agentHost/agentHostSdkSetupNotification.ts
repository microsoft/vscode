/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { createCommandUri, escapeMarkdownSyntaxTokens, IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostAllowSignedOutWhenUsableSettingId, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import type { AgentSdkDownloadStatus, IAgentSdkSetupInfo } from '../../../../../../platform/agentHost/common/agentSdkSetup.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAgentSdkSetupService, type AgentSdkSetupState, type IAgentSdkSetup } from '../../../../../services/agentHost/browser/agentSdkSetupService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { hasAnyModelTargetingSessionType } from '../sessionTypeAvailability.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationAction, IChatInputNotificationService } from '../../widget/input/chatInputNotificationService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';

// #region State

/** Everything one agent's {@link AgentSdkSetupState} is decided from. */
export interface IAgentSdkSetupStateInputs {
	/** The experimentation flag the missing-account routes stay behind. Not the download offer. */
	readonly allowSignedOutWhenUsable: boolean;
	/** Whether the user is signed in to GitHub (Copilot models already work). */
	readonly signedIn: boolean;
	/** Whether entitlement has settled; before that "signed out" is not yet a fact. */
	readonly entitlementResolved: boolean;
	readonly download: AgentSdkDownloadStatus;
	/** Whether a fetch has been asked for and the host has not answered yet. */
	readonly downloadRequested: boolean;
	/** Whether this agent has published any model — its own report of "I found an account". */
	readonly hasModels: boolean;
}

/**
 * The whole decision, as one pure function: what the banner renders and what the
 * funnel records are two readings of this one state.
 *
 * The download is offered before any other check, because it applies to
 * everyone: we fetch a large SDK onto the user's machine, and that is worth
 * saying whether or not they have models already.
 */
export function getAgentSdkSetupState(inputs: IAgentSdkSetupStateInputs): AgentSdkSetupState | undefined {
	if (inputs.download === 'notDownloaded') {
		// A request we sent covers the gap before the host answers it, so standing
		// consent (or a click) never flashes the offer it has already satisfied.
		return inputs.downloadRequested ? undefined : 'downloadOffered';
	}
	if (inputs.download === 'downloadOnUse' || inputs.download === 'downloading') {
		return undefined;
	}
	// Everything below explains a missing account, which is the signed-out
	// experiment and stays behind its flag.
	if (!inputs.allowSignedOutWhenUsable || !inputs.entitlementResolved || inputs.signedIn) {
		return undefined;
	}
	if (inputs.hasModels) {
		return 'resolved';
	}
	return 'noAccount';
}

/**
 * The state worth reporting to the funnel, or `undefined` when it adds
 * nothing to what was last reported for this agent — `_update()` re-runs on every
 * model, entitlement and root-state change. Comparing against the last *reported*
 * state also counts each step once per user: a download that fails back to the
 * offer is the same person still being asked.
 */
export function getAgentSdkSetupStateToReport(previous: AgentSdkSetupState | undefined, state: AgentSdkSetupState | undefined): AgentSdkSetupState | undefined {
	// Reaching `resolved` without ever being asked for anything is a user who was
	// set up before this feature saw them, not one it converted.
	if (state === undefined || state === previous || (state === 'resolved' && previous === undefined)) {
		return undefined;
	}
	return state;
}

// #endregion

// #region Banner

/** Trusted for the commands its links address, and nothing else. */
function setupMarkdown(value: string): MarkdownString {
	return new MarkdownString(value, { isTrusted: { enabledCommands: [AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, AGENT_SDK_SETUP_RELOAD_COMMAND_ID] } });
}

/**
 * The "no account" second line: one whole sentence per combination of routes,
 * never assembled from localized fragments, because clause order is not stable
 * across languages. The routes share one "or" list, ranked as the buttons rank
 * them and led by the unconditional GitHub clause: reaching models through our
 * Copilot proxy is workbench knowledge, not something an agent declares.
 */
function noAccountDescription(setup: IAgentSdkSetupInfo, displayName: string, authority: string): IMarkdownString {
	// Both nouns are the host's, and this string is trusted for two commands, so
	// they are escaped rather than interpolated raw: `[]()` in a name would
	// otherwise synthesize a link to either one.
	const name = escapeMarkdownSyntaxTokens(displayName);
	const provider = setup.signInProviderName && escapeMarkdownSyntaxTokens(setup.signInProviderName);
	const reload = createCommandUri(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, setup.agent, authority).toString();
	const docs = setup.setupDocsUrl ? createCommandUri(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, setup.agent, authority).toString() : undefined;
	if (provider && docs) {
		return setupMarkdown(localize('agentHost.sdkSetup.noAccountDescription.all', "Sign in to GitHub to use GitHub Copilot models, sign in to {2} to use your {2} subscription, or [reload the configuration]({1}) if you have set up {0} elsewhere. For other ways to set up {0}, [learn more]({3}) on their docs.", name, reload, provider, docs));
	}
	if (provider) {
		return setupMarkdown(localize('agentHost.sdkSetup.noAccountDescription.signIn', "Sign in to GitHub to use GitHub Copilot models, sign in to {2} to use your {2} subscription, or [reload the configuration]({1}) if you have set up {0} elsewhere.", name, reload, provider));
	}
	if (docs) {
		return setupMarkdown(localize('agentHost.sdkSetup.noAccountDescription.docs', "Sign in to GitHub to use GitHub Copilot models or [reload the configuration]({1}) if you have set up {0} elsewhere. For other ways to set up {0}, [learn more]({2}) on their docs.", name, reload, docs));
	}
	return setupMarkdown(localize('agentHost.sdkSetup.noAccountDescription', "Sign in to GitHub to use GitHub Copilot models or [reload the configuration]({1}) if you have set up {0} elsewhere.", name, reload));
}

export function agentSdkSetupSessionType(agent: string, authority: string): string {
	return authority === AMBIENT_AGENT_HOST_AUTHORITY
		? `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${agent}`
		: remoteAgentHostSessionTypeId(authority, agent);
}

const AGENT_SDK_SETUP_NOTIFICATION_ID_PREFIX = 'agentHost.sdkSetup.';

export function agentSdkSetupNotificationId(setupId: string): string {
	return `${AGENT_SDK_SETUP_NOTIFICATION_ID_PREFIX}${setupId}`;
}

/**
 * Whether an agent advertised demand-driven setup for the given session type.
 * Pickers use the capability itself rather than a currently visible banner:
 * an already-authenticated account has no banner, but still needs selection to
 * activate the agent and enumerate its models.
 */
export function hasAgentSdkSetupForSessionType(setups: readonly IAgentSdkSetup[], sessionType: string): boolean {
	return setups.some(setup => agentSdkSetupSessionType(setup.agent, setup.host.authority) === sessionType);
}

/**
 * Render one agent's banner, or `undefined` when it has nothing to say.
 *
 * Every string is a template this layer owns, filled with the proper nouns the
 * agent declared (`displayName`, `signInProviderName`) and varied by the routes
 * it offers — nothing a person reads crosses the wire. The download lines
 * never tie the SDK to an account: it is the same SDK behind the Copilot proxy,
 * a subscription or a BYO key.
 */
export function createAgentSdkSetupNotification(setup: IAgentSdkSetup, state: AgentSdkSetupState | undefined, hasModels = false): IChatInputNotification | undefined {
	if (state === undefined || state === 'resolved') {
		return undefined;
	}
	const { host, displayName } = setup;
	const base = {
		id: agentSdkSetupNotificationId(setup.id),
		severity: ChatInputNotificationSeverity.Info,
		dismissible: false,
		autoDismissOnMessage: false,
		sessionTypes: [agentSdkSetupSessionType(setup.agent, host.authority)],
	} as const;
	const action = (label: string, commandId: string): IChatInputNotificationAction => ({
		kind: ChatInputNotificationActionKind.Command,
		label,
		commandId,
		commandArgs: [setup.agent, host.authority],
		keepOpen: true,
	});
	if (state === 'downloadOffered') {
		return {
			...base,
			message: localize('agentHost.sdkSetup.download', "Download the {0} Agent", displayName),
			description: host.isAmbient
				? hasModels
					? localize('agentHost.sdkSetup.downloadDescription.withModels', "Click Download or send a message to download the {0} Agent SDK.", displayName)
					: localize('agentHost.sdkSetup.downloadDescription', "To use the {0} Agent, we need to download the {0} Agent SDK.", displayName)
				: hasModels
					? localize('agentHost.sdkSetup.remoteDownloadDescription.withModels', "Click Download or send a message to download the {0} Agent SDK on {1}.", displayName, host.name)
					: localize('agentHost.sdkSetup.remoteDownloadDescription', "To use the {0} Agent on {1}, we need to download the {0} Agent SDK to that host.", displayName, host.name),
			actions: [action(localize('agentHost.sdkSetup.downloadAction', "Download"), AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID)],
		};
	}
	const actions: IChatInputNotificationAction[] = [];
	if (setup.signInProviderName) {
		actions.push(action(localize('agentHost.sdkSetup.signInAction', "Sign in to {0}", setup.signInProviderName), AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID));
	}
	// Last, because the widget styles the final action as the primary button and
	// this is the route that works whatever the user has set up elsewhere.
	actions.push(action(localize('agentHost.sdkSetup.gitHubSignInAction', "Sign in to GitHub"), AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID));
	return {
		...base,
		message: host.isAmbient
			? localize('agentHost.sdkSetup.noAccount', "Choose how you want to use {0}.", displayName)
			: localize('agentHost.sdkSetup.remoteNoAccount', "Choose how you want to use {0} on {1}.", displayName, host.name),
		description: noAccountDescription(setup, displayName, host.authority),
		actions,
	};
}

// #endregion

// #region Commands

export const AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID = 'workbench.action.chat.agentHost.downloadAgentSdk';
export const AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID = 'workbench.action.chat.agentHost.openAgentSetupDocs';
export const AGENT_SDK_SETUP_RELOAD_COMMAND_ID = 'workbench.action.chat.agentHost.reloadAgentConfiguration';
export const AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID = 'workbench.action.chat.agentHost.signInToGitHubForAgent';
export const AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID = 'workbench.action.chat.agentHost.signInToAgent';

function registerAgentSdkSetupCommand(id: string, run: (setupService: IAgentSdkSetupService, agent: string, connection: IAgentConnection) => void): void {
	CommandsRegistry.registerCommand(id, (accessor: ServicesAccessor, agent: unknown, authority: unknown) => {
		if (typeof agent !== 'string' || typeof authority !== 'string') {
			throw new Error(localize('agentHost.sdkSetup.invalidTarget', "An agent and agent host are required for this setup action."));
		}
		const connection = accessor.get(IAgentHostConnectionsService).getConnectionByAuthority(authority);
		if (!connection) {
			throw new Error(localize('agentHost.sdkSetup.disconnected', "The selected agent host is disconnected. Reconnect and try again."));
		}
		run(accessor.get(IAgentSdkSetupService), agent, connection);
	});
}

registerAgentSdkSetupCommand(AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID, (setupService, agent, connection) => setupService.requestDownload(agent, connection, { source: 'setup' }));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, (setupService, agent, connection) => setupService.openSetupDocs(agent, connection));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, (setupService, agent, connection) => setupService.requestReload(agent, connection));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID, (setupService, agent) => setupService.signInToGitHub(agent));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, (setupService, agent, connection) => setupService.signIn(agent, connection));

// #endregion

/**
 * Offers the SDK download, and explains a missing account once it is on disk,
 * for every agent whose setup lives outside the app.
 *
 * Sibling to `AgentHostSignedOutModelsNotification`, which stays Copilot-scoped
 * — these are different asks aimed at different people and share only the
 * notification machinery.
 */
export class AgentHostSdkSetupNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostSdkSetupNotification';

	/** Pushed notification content by id, so an unchanged answer is not re-pushed (which would clear a dismissal and re-announce). */
	private readonly _shown = new Map<string, string>();

	/** Last state reported per agent, so a re-render is not a second event. */
	private readonly _lastReported = new Map<string, AgentSdkSetupState>();

	constructor(
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
		@IAgentSdkSetupService private readonly _agentSdkSetupService: IAgentSdkSetupService,
		@IDefaultAccountService private readonly _defaultAccountService: IDefaultAccountService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		super();
		this._register(Event.any(
			this._agentSdkSetupService.onDidChangeSetups,
			this._chatEntitlementService.onDidChangeEntitlement,
			this._chatEntitlementService.onDidChangeSentiment,
			this._defaultAccountService.onDidChangeDefaultAccount,
			this._languageModelsService.onDidChangeLanguageModels,
			Event.filter(this._configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId)),
		)(() => this._update()));
		this._update();
	}

	private _update(): void {
		const allowSignedOutWhenUsable = this._configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
		const entitlement = this._chatEntitlementService.entitlement;
		const entitlementResolved = entitlement !== ChatEntitlement.Unresolved;
		const signedIn = this._defaultAccountService.currentDefaultAccount !== null
			|| (entitlementResolved && entitlement !== ChatEntitlement.Unknown);
		const stale = new Set(this._shown.keys());
		const liveIds = new Set<string>();
		const setups = this._chatEntitlementService.sentiment.hidden ? [] : this._agentSdkSetupService.setups;
		for (const setup of setups) {
			const connection = setup.host.connection;
			const notificationId = agentSdkSetupNotificationId(setup.id);
			liveIds.add(notificationId);
			const sessionType = agentSdkSetupSessionType(setup.agent, setup.host.authority);
			const hasModels = hasAnyModelTargetingSessionType(this._languageModelsService, sessionType);
			const state = getAgentSdkSetupState({
				allowSignedOutWhenUsable,
				signedIn,
				entitlementResolved,
				download: setup.download,
				downloadRequested: this._agentSdkSetupService.isDownloadPending(setup.agent, connection),
				hasModels,
			});
			// Before the render decision below, because `resolved` — the step the
			// funnel exists to count — is exactly the state that renders nothing.
			const toReport = getAgentSdkSetupStateToReport(this._lastReported.get(notificationId), state);
			if (toReport) {
				this._lastReported.set(notificationId, toReport);
				this._agentSdkSetupService.reportSetupState(setup.agent, toReport);
			}
			const notification = createAgentSdkSetupNotification(setup, state, hasModels);
			if (!notification) {
				continue;
			}
			stale.delete(notification.id);
			const signature = JSON.stringify(notification);
			if (this._shown.get(notification.id) === signature) {
				continue;
			}
			this._shown.set(notification.id, signature);
			this._chatInputNotificationService.setNotification(notification);
		}
		for (const id of stale) {
			this._shown.delete(id);
			this._chatInputNotificationService.deleteNotification(id);
		}
		for (const id of this._lastReported.keys()) {
			if (!liveIds.has(id)) {
				this._lastReported.delete(id);
			}
		}
	}
}
