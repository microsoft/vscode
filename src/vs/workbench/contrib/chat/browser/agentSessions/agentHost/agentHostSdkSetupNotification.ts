/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Event } from '../../../../../../base/common/event.js';
import { createCommandUri, escapeMarkdownSyntaxTokens, IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostAllowSignedOutWhenUsableSettingId, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { AgentSdkDownloadStatus, IAgentSdkSetupInfo } from '../../../../../../platform/agentHost/common/agentSdkSetup.js';
import type { RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { IAgentSdkSetupService, type AgentSdkSetupState } from '../../../../../services/agentHost/browser/agentSdkSetupService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { hasAnyModelTargetingSessionType } from '../sessionTypeAvailability.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotification, IChatInputNotificationAction, IChatInputNotificationService, isChatInputNotificationApplicableToSessionType } from '../../widget/input/chatInputNotificationService.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';

// #region State

/** Everything one agent's {@link AgentSdkSetupState} is decided from. */
export interface IAgentSdkSetupStateInputs {
	/** The experimentation flag this whole feature stays behind. */
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
 * funnel records are two readings of this one state. A signed-in user already
 * has Copilot models, so there is nothing to offer and BYOK stays undiscoverable
 * for them (a deliberate v1 cut).
 */
export function getAgentSdkSetupState(inputs: IAgentSdkSetupStateInputs): AgentSdkSetupState | undefined {
	if (!inputs.allowSignedOutWhenUsable || !inputs.entitlementResolved || inputs.signedIn) {
		return undefined;
	}
	// Ahead of the download status because models are the honest end state: an
	// agent that can enumerate a catalog has an account, whatever a status claims.
	if (inputs.hasModels) {
		return 'resolved';
	}
	switch (inputs.download) {
		// A fetch in flight has nothing to ask for — the host drives its own
		// progress notification while it runs.
		case 'downloading': return undefined;
		// A request we sent covers the gap before the host answers it, so standing
		// consent (or a click) never flashes the offer it has already satisfied.
		case 'notDownloaded': return inputs.downloadRequested ? undefined : 'downloadOffered';
		case 'ready': return 'noAccount';
	}
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
function noAccountDescription(setup: IAgentSdkSetupInfo, displayName: string): IMarkdownString {
	// Both nouns are the host's, and this string is trusted for two commands, so
	// they are escaped rather than interpolated raw: `[]()` in a name would
	// otherwise synthesize a link to either one.
	const name = escapeMarkdownSyntaxTokens(displayName);
	const provider = setup.signInProviderName && escapeMarkdownSyntaxTokens(setup.signInProviderName);
	// `command:` hrefs, so a link in the copy takes the same route a button would —
	// funnel step and URL validation included. Both carry the agent id and nothing
	// else: the docs command resolves the URL from the agent's own declaration.
	const reload = createCommandUri(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, setup.agent).toString();
	const docs = setup.setupDocsUrl ? createCommandUri(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, setup.agent).toString() : undefined;
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

/**
 * The session type an agent's sessions run under, derived the same way
 * `AgentHostChatContribution` derives it — so agent #3 needs no edit here.
 * Scoped to the window's ambient host, which is itself the remote in a remote
 * window; the Sessions app's additional `remote-<authority>-<agent>`
 * connections are outside this banner, as they are the Copilot one.
 */
export function agentSdkSetupSessionType(agent: string): string {
	return `${LOCAL_AGENT_HOST_SCHEME_PREFIX}${agent}`;
}

/**
 * Each agent's own display name, keyed by provider id. Taken from root state
 * rather than the setup channel: the host describes every agent there already,
 * and a second wire source for one string would be free to disagree. Templating
 * is also what keeps user-facing text out of the host — what crosses the wire is
 * a proper noun the workbench cannot invent.
 */
export function getAgentDisplayNames(state: RootState | Error | undefined): ReadonlyMap<string, string> {
	const names = new Map<string, string>();
	if (!state || state instanceof Error) {
		return names;
	}
	for (const agent of state.agents ?? []) {
		if (agent.displayName) {
			names.set(agent.provider, agent.displayName);
		}
	}
	return names;
}

const AGENT_SDK_SETUP_NOTIFICATION_ID_PREFIX = 'agentHost.sdkSetup.';

export function agentSdkSetupNotificationId(agent: string): string {
	return `${AGENT_SDK_SETUP_NOTIFICATION_ID_PREFIX}${agent}`;
}

/**
 * Whether a setup banner is currently being offered for the given session type.
 *
 * The pickers ask because the banner lives *inside* a session of the type it is
 * scoped to: a harness with no models yet is greyed out by the ordinary
 * availability rule, hiding the one thing telling the user how to fix that.
 * Matching the setup id specifically matters — an unscoped notification (a quota
 * warning, say) applies to every type and would un-grey all of them.
 */
export function hasAgentSdkSetupNotification(chatInputNotificationService: IChatInputNotificationService, sessionType: string): boolean {
	return chatInputNotificationService.getActiveNotification(notification =>
		notification.id.startsWith(AGENT_SDK_SETUP_NOTIFICATION_ID_PREFIX)
		&& isChatInputNotificationApplicableToSessionType(notification, sessionType)
	) !== undefined;
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
export function createAgentSdkSetupNotification(setup: IAgentSdkSetupInfo, displayName: string, state: AgentSdkSetupState | undefined): IChatInputNotification | undefined {
	// Nothing to ask of a user who is already set up. An empty `displayName` means
	// the host has not described this agent yet, and "Download the  Agent" is worse
	// than none; the next root-state change is moments away.
	if (!displayName || state === undefined || state === 'resolved') {
		return undefined;
	}
	const base = {
		id: agentSdkSetupNotificationId(setup.agent),
		severity: ChatInputNotificationSeverity.Info,
		dismissible: false,
		autoDismissOnMessage: false,
		sessionTypes: [agentSdkSetupSessionType(setup.agent)],
	} as const;
	const action = (label: string, commandId: string): IChatInputNotificationAction => ({
		kind: ChatInputNotificationActionKind.Command,
		label,
		commandId,
		commandArgs: [setup.agent],
		keepOpen: true,
	});
	if (state === 'downloadOffered') {
		return {
			...base,
			message: localize('agentHost.sdkSetup.download', "Download the {0} Agent", displayName),
			description: localize('agentHost.sdkSetup.downloadDescription', "To use the {0} Agent, we need to download the {0} Agent SDK.", displayName),
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
		message: localize('agentHost.sdkSetup.noAccount', "Choose how you want to use {0}.", displayName),
		description: noAccountDescription(setup, displayName),
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

/**
 * The banner's buttons. Commands rather than inline handlers because
 * {@link IChatInputNotification} actions address commands by id, and each takes
 * the agent id and nothing else — what a route needs beyond that is resolved by
 * the service from the agent's own declaration, not from the banner's copy.
 */
function registerAgentSdkSetupCommand(id: string, run: (setupService: IAgentSdkSetupService, agent: string) => void): void {
	CommandsRegistry.registerCommand(id, (accessor: ServicesAccessor, agent: unknown) => {
		if (typeof agent === 'string') {
			run(accessor.get(IAgentSdkSetupService), agent);
		}
	});
}

registerAgentSdkSetupCommand(AGENT_SDK_SETUP_DOWNLOAD_COMMAND_ID, (setupService, agent) => setupService.requestDownload(agent));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_OPEN_DOCS_COMMAND_ID, (setupService, agent) => setupService.openSetupDocs(agent));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_RELOAD_COMMAND_ID, (setupService, agent) => setupService.requestReload(agent));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_GITHUB_SIGN_IN_COMMAND_ID, (setupService, agent) => setupService.signInToGitHub(agent));
registerAgentSdkSetupCommand(AGENT_SDK_SETUP_SIGN_IN_COMMAND_ID, (setupService, agent) => setupService.signIn(agent));

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
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
	) {
		super();
		this._register(Event.any(
			this._agentSdkSetupService.onDidChangeSetups,
			this._chatEntitlementService.onDidChangeEntitlement,
			this._defaultAccountService.onDidChangeDefaultAccount,
			this._languageModelsService.onDidChangeLanguageModels,
			Event.filter(this._configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(AgentHostAllowSignedOutWhenUsableSettingId)),
		)(() => this._update()));
		// The host restarts (and a remote reconnects) behind a fresh root state, so
		// re-bind rather than holding one subscription for the window's lifetime.
		const rootStateListeners = this._register(new DisposableStore());
		const bindRootState = () => {
			rootStateListeners.clear();
			rootStateListeners.add(this._agentHostService.rootState.onDidChange(() => this._update()));
			this._update();
		};
		bindRootState();
		this._register(this._agentHostService.onAgentHostStart(bindRootState));
	}

	private _update(): void {
		const allowSignedOutWhenUsable = this._configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
		const entitlement = this._chatEntitlementService.entitlement;
		const entitlementResolved = entitlement !== ChatEntitlement.Unresolved;
		const signedIn = this._defaultAccountService.currentDefaultAccount !== null
			|| (entitlementResolved && entitlement !== ChatEntitlement.Unknown);
		const displayNames = getAgentDisplayNames(this._agentHostService.rootState.value);
		const stale = new Set(this._shown.keys());
		for (const setup of this._agentSdkSetupService.setups) {
			// An agent can publish its setup status before root state lists it, so a
			// missing name here means "not yet", not "never" — and every root-state
			// change re-runs this.
			const displayName = displayNames.get(setup.agent);
			if (!displayName) {
				continue;
			}
			const state = getAgentSdkSetupState({
				allowSignedOutWhenUsable,
				signedIn,
				entitlementResolved,
				download: setup.download,
				downloadRequested: this._agentSdkSetupService.isDownloadPending(setup.agent),
				hasModels: hasAnyModelTargetingSessionType(this._languageModelsService, agentSdkSetupSessionType(setup.agent)),
			});
			// Before the render decision below, because `resolved` — the step the
			// funnel exists to count — is exactly the state that renders nothing.
			const toReport = getAgentSdkSetupStateToReport(this._lastReported.get(setup.agent), state);
			if (toReport) {
				this._lastReported.set(setup.agent, toReport);
				this._agentSdkSetupService.reportSetupState(setup.agent, toReport);
			}
			const notification = createAgentSdkSetupNotification(setup, displayName, state);
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
	}
}
