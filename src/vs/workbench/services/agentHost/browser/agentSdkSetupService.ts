/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, IAgentSdkSetupInfo, readAgentSdkSetupInfos, readConsentedSdkAgents, resolveConsentedSdkDownloads, writeConsentedSdkAgents } from '../../../../platform/agentHost/common/agentSdkSetup.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ICodexAccountService } from './codexAccountService.js';

/**
 * The agents whose SDK the user has agreed to fetch, each recorded on its own
 * first explicit Download. `APPLICATION` + `USER` so it follows the person, not
 * the machine — see {@link resolveConsentedSdkDownloads} for why it is neither
 * re-asked per version nor shared between agents.
 */
const AGENT_SDK_DOWNLOAD_CONSENT_KEY = 'agentHost.agentSdkDownloadConsent';

/** The Copilot sign-in flow, shared with `AgentHostSignedOutModelsNotification`. */
const CHAT_SETUP_COMMAND_ID = 'workbench.action.chat.triggerSetup';

export const IAgentSdkSetupService = createDecorator<IAgentSdkSetupService>('agentSdkSetupService');

/**
 * Where the user stands with one agent's setup: the download is on offer, the
 * SDK is on disk and found no account, or the agent has models. Every other
 * case — the feature not applying, a fetch in flight — is `undefined`.
 */
export type AgentSdkSetupState = 'downloadOffered' | 'noAccount' | 'resolved';

/**
 * One step of the setup funnel: `downloadOffered` → a download (clicked, or
 * taken under standing consent) → `noAccount` → a route out of it →
 * `resolved`, the step that decides whether this was worth building. The states
 * are reported by the banner that computes them, the routes by this service.
 */
type AgentSdkSetupFunnelStep =
	| AgentSdkSetupState
	| 'downloadClicked'
	| 'consentedDownload'
	| 'docsClicked'
	| 'gitHubSignInClicked'
	| 'signInClicked'
	| 'reloadClicked';

interface IAgentSdkSetupFunnelEvent {
	agent: string;
	step: string;
}

type AgentSdkSetupFunnelClassification = {
	agent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent whose setup this step belongs to, e.g. claude or codex.' };
	step: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which step of the agent SDK setup funnel was reached (downloadOffered, downloadClicked, consentedDownload, noAccount, docsClicked, gitHubSignInClicked, signInClicked, reloadClicked, resolved).' };
	owner: 'TylerLeonhardt';
	comment: 'Tracks how far a signed-out user gets through setting up their own Claude or Codex account.';
};

export interface IAgentSdkSetupService {
	readonly _serviceBrand: undefined;

	/** Every agent that has published a setup status, newest state. */
	readonly setups: readonly IAgentSdkSetupInfo[];
	readonly onDidChangeSetups: Event<readonly IAgentSdkSetupInfo[]>;

	/**
	 * Ask `agent` to fetch its SDK, and record standing consent to do so again
	 * for later version bumps.
	 */
	requestDownload(agent: string): void;

	/** Open the setup instructions `agent` published, if it published any. */
	openSetupDocs(agent: string): void;

	/**
	 * Ask `agent` to look again at a setup the user completed outside the app —
	 * the only signal there is that a `claude login` in a terminal finished.
	 */
	requestReload(agent: string): void;

	/** Start GitHub sign-in, which reaches every agent's models through our proxy. */
	signInToGitHub(agent: string): void;

	/** Start `agent`'s own sign-in flow, if it declared one. */
	signIn(agent: string): void;

	/**
	 * Whether `agent` has been asked to fetch its SDK and the host has not
	 * answered yet — already downloading, as far as this window can tell.
	 */
	isDownloadPending(agent: string): boolean;

	/**
	 * Record that the user reached `state`. Public because the banner is
	 * where these three are computed and this service cannot see them; every other
	 * step is reported by the method that takes it.
	 */
	reportSetupState(agent: string, state: AgentSdkSetupState): void;
}

class AgentSdkSetupService extends Disposable implements IAgentSdkSetupService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSetups = this._register(new Emitter<readonly IAgentSdkSetupInfo[]>());
	readonly onDidChangeSetups = this._onDidChangeSetups.event;

	private _setups: readonly IAgentSdkSetupInfo[] = [];

	/**
	 * Agents whose SDK we have already re-requested under standing consent, so a
	 * download that fails (and so reports `notDownloaded` again) is retried on the
	 * next window rather than immediately, forever.
	 */
	private readonly _consentedRequests = new Set<string>();

	/**
	 * Agents we have asked to fetch and the host has not answered yet. Cleared on
	 * that answer rather than on success, so a failed download — which republishes
	 * `notDownloaded` after the `downloading` we cleared on — re-offers the button.
	 */
	private readonly _pendingRequests = new Set<string>();

	get setups(): readonly IAgentSdkSetupInfo[] {
		return this._setups;
	}

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ICommandService private readonly _commandService: ICommandService,
		@ICodexAccountService private readonly _codexAccountService: ICodexAccountService,
	) {
		super();
		// `rootState` is a getter over a protocol client the host replaces on every
		// restart and reconnect, so one subscription taken here would go quietly
		// stale — re-bind, as the banner and the Copilot notification both do.
		const rootStateListeners = this._register(new DisposableStore());
		const bindRootState = () => {
			rootStateListeners.clear();
			rootStateListeners.add(this._agentHostService.rootState.onDidChange(state => this._updateSetups(readAgentSdkSetupInfos(state))));
			// A request the previous host never answered never will be; dropping it
			// re-offers the button rather than suppressing the offer for good.
			this._pendingRequests.clear();
			const state = this._agentHostService.rootState.value;
			this._updateSetups(readAgentSdkSetupInfos(state instanceof Error ? undefined : state));
		};
		bindRootState();
		this._register(this._agentHostService.onAgentHostStart(bindRootState));
	}

	requestDownload(agent: string): void {
		const consented = new Set(this._readConsentedAgents());
		consented.add(agent);
		this._storageService.store(AGENT_SDK_DOWNLOAD_CONSENT_KEY, writeConsentedSdkAgents(consented), StorageScope.APPLICATION, StorageTarget.USER);
		this._consentedRequests.add(agent);
		this._reportStep(agent, 'downloadClicked');
		this._dispatchDownloadRequest(agent);
	}

	openSetupDocs(agent: string): void {
		const url = this._getSetup(agent)?.setupDocsUrl;
		if (!url) {
			return;
		}
		this._reportStep(agent, 'docsClicked');
		// The URL is declared by the agent, so it is validated like any other
		// externally-supplied link rather than trusted.
		void this._openerService.open(url, { openExternal: true });
	}

	requestReload(agent: string): void {
		this._reportStep(agent, 'reloadClicked');
		// Deliberately not a pending request: that set gates the download offer, and
		// a reload happens in a state where there is nothing to offer.
		this._dispatchRequest(AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, agent);
	}

	signInToGitHub(agent: string): void {
		// A thin wrapper over the ordinary Copilot sign-in, taking the agent id only
		// to attribute the click — which is the funnel's most telling drop.
		this._reportStep(agent, 'gitHubSignInClicked');
		void this._commandService.executeCommand(CHAT_SETUP_COMMAND_ID);
	}

	signIn(agent: string): void {
		// Codex is the only agent with an in-app sign-in today, and comparing against
		// the service's own `agent` rather than a literal keeps `'codex'` out of the
		// workbench. A second such agent turns this comparison into a lookup.
		if (agent !== this._codexAccountService.agent) {
			return;
		}
		this._reportStep(agent, 'signInClicked');
		this._codexAccountService.signIn();
	}

	reportSetupState(agent: string, state: AgentSdkSetupState): void {
		this._reportStep(agent, state);
	}

	isDownloadPending(agent: string): boolean {
		return this._pendingRequests.has(agent);
	}

	private _reportStep(agent: string, step: AgentSdkSetupFunnelStep): void {
		this._telemetryService.publicLog2<IAgentSdkSetupFunnelEvent, AgentSdkSetupFunnelClassification>('agentHost.agentSdkSetup', { agent, step });
		// This feature is diagnosed from a user's attached log far more often than
		// from a dashboard; the event says how many, this line says why this person.
		this._logService.trace(`[AgentSdkSetup] ${agent}: ${step}`);
	}

	private _getSetup(agent: string): IAgentSdkSetupInfo | undefined {
		return this._setups.find(setup => setup.agent === agent);
	}

	private _dispatchDownloadRequest(agent: string): void {
		this._pendingRequests.add(agent);
		this._dispatchRequest(AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, agent);
		// The statuses are unchanged but {@link isDownloadPending} is not, and
		// without this the offer stays up until the host answers — the flicker the
		// pending set exists to prevent.
		this._onDidChangeSetups.fire(this._setups);
	}

	private _dispatchRequest(key: string, agent: string): void {
		// A fresh nonce every time so pressing the same thing twice is two
		// requests; the agent clears the key as it consumes it.
		this._agentHostService.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [key]: { agent, request: generateUuid() } },
		});
	}

	private _updateSetups(setups: readonly IAgentSdkSetupInfo[]): void {
		this._setups = setups;
		for (const setup of setups) {
			// Any status but `notDownloaded` is the host answering our request.
			if (setup.download !== 'notDownloaded') {
				this._pendingRequests.delete(setup.agent);
			}
		}
		this._applyConsent();
		this._onDidChangeSetups.fire(setups);
	}

	private _readConsentedAgents(): ReadonlySet<string> {
		return readConsentedSdkAgents(this._storageService.get(AGENT_SDK_DOWNLOAD_CONSENT_KEY, StorageScope.APPLICATION));
	}

	/**
	 * Honour standing consent without asking again. Runs on every status change
	 * because a host that starts (or a remote that connects) publishes
	 * `notDownloaded` only once it is up — there is no earlier moment to catch.
	 */
	private _applyConsent(): void {
		for (const agent of resolveConsentedSdkDownloads(this._readConsentedAgents(), this._setups, this._consentedRequests)) {
			this._consentedRequests.add(agent);
			this._reportStep(agent, 'consentedDownload');
			this._dispatchDownloadRequest(agent);
		}
	}
}

registerSingleton(IAgentSdkSetupService, AgentSdkSetupService, InstantiationType.Delayed);
