/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionInfo, IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, IAgentSdkSetupInfo, readAgentSdkSetupInfos } from '../../../../platform/agentHost/common/agentSdkSetup.js';
import { IAgentConnection, IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ICodexAccountService } from './codexAccountService.js';

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
 * One step of the setup funnel: `downloadOffered` → a download → `noAccount` →
 * a route out of it → `resolved`. The banner reports states; this service reports routes.
 */
type AgentSdkSetupFunnelStep =
	| AgentSdkSetupState
	| 'downloadClicked'
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
	step: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which step of the agent SDK setup funnel was reached (downloadOffered, downloadClicked, noAccount, docsClicked, gitHubSignInClicked, signInClicked, reloadClicked, resolved).' };
	owner: 'TylerLeonhardt';
	comment: 'Tracks how far a signed-out user gets through setting up their own Claude or Codex account.';
};

export interface IAgentSdkSetup extends IAgentSdkSetupInfo {
	/** Opaque host-scoped identity, safe to use in notification telemetry. */
	readonly id: string;
	readonly displayName: string;
	readonly host: IAgentHostConnectionInfo & { readonly connection: IAgentConnection };
}

interface IAgentSdkDownloadOptions {
	readonly source: 'setup' | 'turn';
}

export interface IAgentSdkSetupService {
	readonly _serviceBrand: undefined;

	/** Named agents with SDK setup information and a live host connection. */
	readonly setups: readonly IAgentSdkSetup[];
	readonly onDidChangeSetups: Event<readonly IAgentSdkSetup[]>;

	/** Download on the supplied connection. Setup actions record a click; turns skip SDKs that are already available. */
	requestDownload(agent: string, connection: IAgentConnection, options: IAgentSdkDownloadOptions): void;

	/** Open the setup instructions `agent` published, if it published any. */
	openSetupDocs(agent: string, connection: IAgentConnection): void;

	/**
	 * Ask `agent` to look again at a setup the user completed outside the app —
	 * the only signal there is that a `claude login` in a terminal finished.
	 */
	requestReload(agent: string, connection: IAgentConnection): void;

	/** Start GitHub sign-in, which reaches every agent's models through our proxy. */
	signInToGitHub(agent: string): void;

	/** Start `agent`'s own sign-in flow, if it declared one. */
	signIn(agent: string, connection: IAgentConnection): void;

	/** Whether this host has an unacknowledged SDK download request for `agent`. */
	isDownloadPending(agent: string, connection: IAgentConnection): boolean;

	/**
	 * Record that the user reached `state`. Public because the banner is
	 * where these three are computed and this service cannot see them; every other
	 * step is reported by the method that takes it.
	 */
	reportSetupState(agent: string, state: AgentSdkSetupState): void;
}

class AgentSdkSetupConnectionState extends DisposableStore {
	readonly id = generateUuid();
	readonly pendingRequests = new Set<string>();
}

class AgentSdkSetupService extends Disposable implements IAgentSdkSetupService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSetups = this._register(new Emitter<readonly IAgentSdkSetup[]>());
	readonly onDidChangeSetups = this._onDidChangeSetups.event;

	private readonly _connections = this._register(new DisposableMap<IAgentConnection, AgentSdkSetupConnectionState>());

	get setups(): readonly IAgentSdkSetup[] {
		return this._hostConnectionsService.connections.flatMap(host => {
			const connection = host.connection;
			const connectionState = connection && this._connections.get(connection);
			if (!connection || !connectionState) {
				return [];
			}
			const state = connection.rootState.value;
			if (!state || state instanceof Error) {
				return [];
			}
			return readAgentSdkSetupInfos(state).flatMap(setup => {
				const displayName = state.agents.find(agent => agent.provider === setup.agent)?.displayName;
				return displayName ? [{
					...setup,
					id: host.isAmbient ? setup.agent : `${connectionState.id}.${setup.agent}`,
					displayName,
					host: { ...host, connection },
				}] : [];
			});
		});
	}

	constructor(
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostConnectionsService private readonly _hostConnectionsService: IAgentHostConnectionsService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ICommandService private readonly _commandService: ICommandService,
		@ICodexAccountService private readonly _codexAccountService: ICodexAccountService,
	) {
		super();
		// The ambient connection replaces its root subscription on restart.
		this._trackConnection(this._agentHostService);
		this._register(this._agentHostService.onAgentHostStart(() => this._trackConnection(this._agentHostService)));
		this._register(this._agentHostService.onAgentHostExit(() => {
			this._connections.deleteAndDispose(this._agentHostService);
			this._updateSetups(this._agentHostService, []);
		}));
		this._register(this._hostConnectionsService.onDidChangeConnections(() => this._syncRemoteConnections()));
		this._syncRemoteConnections();
	}

	private _syncRemoteConnections(): void {
		const connected = new Set<IAgentConnection>();
		for (const host of this._hostConnectionsService.connections) {
			if (host.isAmbient) {
				continue;
			}
			const connection = host.connection;
			if (connection) {
				connected.add(connection);
				if (!this._connections.has(connection)) {
					this._trackConnection(connection);
				}
			}
		}
		for (const connection of this._connections.keys()) {
			if (connection !== this._agentHostService && !connected.has(connection)) {
				this._connections.deleteAndDispose(connection);
			}
		}
		this._onDidChangeSetups.fire(this.setups);
	}

	private _trackConnection(connection: IAgentConnection): void {
		const connectionState = new AgentSdkSetupConnectionState();
		this._connections.set(connection, connectionState);

		const rootState = connection.rootState;
		connectionState.add(rootState.onDidChange(state => this._updateSetups(connection, readAgentSdkSetupInfos(state))));
		if (rootState.onDidError) {
			connectionState.add(rootState.onDidError(() => {
				connectionState.pendingRequests.clear();
				this._updateSetups(connection, []);
			}));
		}
		const state = rootState.value;
		this._updateSetups(connection, readAgentSdkSetupInfos(state instanceof Error ? undefined : state));
	}

	requestDownload(agent: string, connection: IAgentConnection, options: IAgentSdkDownloadOptions): void {
		if (options.source === 'setup') {
			this._reportStep(agent, 'downloadClicked');
		}
		const pendingRequests = this._connections.get(connection)?.pendingRequests;
		if (!pendingRequests) {
			if (options.source === 'setup') {
				throw new Error(localize('agentSdkSetup.disconnected', "The selected agent host is disconnected. Reconnect and try again."));
			}
			this._logService.trace(`[AgentSdkSetup] ${agent}: skipping download request for an unavailable connection`);
			return;
		}
		if (options.source === 'turn') {
			const state = connection.rootState.value;
			const download = readAgentSdkSetupInfos(state instanceof Error ? undefined : state).find(setup => setup.agent === agent)?.download;
			if (download !== 'notDownloaded' && download !== 'downloadOnUse') {
				return;
			}
		}
		if (pendingRequests.has(agent)) {
			return;
		}
		pendingRequests.add(agent);
		try {
			this._dispatchRequest(AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, agent, connection);
		} catch (error) {
			pendingRequests.delete(agent);
			throw error;
		}
		// Hide this host's download offer before the request is acknowledged.
		this._onDidChangeSetups.fire(this.setups);
	}

	openSetupDocs(agent: string, connection: IAgentConnection): void {
		const url = this.setups.find(setup => setup.agent === agent && setup.host.connection === connection)?.setupDocsUrl;
		if (!url) {
			return;
		}
		this._reportStep(agent, 'docsClicked');
		// The URL is declared by the agent, so it is validated like any other
		// externally-supplied link rather than trusted.
		void this._openerService.open(url, { openExternal: true });
	}

	requestReload(agent: string, connection: IAgentConnection): void {
		this._reportStep(agent, 'reloadClicked');
		// Deliberately not a pending request: that set gates the download offer, and
		// a reload happens in a state where there is nothing to offer.
		this._dispatchRequest(AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, agent, connection);
	}

	signInToGitHub(agent: string): void {
		// A thin wrapper over the ordinary Copilot sign-in, taking the agent id only
		// to attribute the click — which is the funnel's most telling drop.
		this._reportStep(agent, 'gitHubSignInClicked');
		void this._commandService.executeCommand(CHAT_SETUP_COMMAND_ID);
	}

	signIn(agent: string, connection: IAgentConnection): void {
		// Codex is the only agent with an in-app sign-in today, and comparing against
		// the service's own `agent` rather than a literal keeps `'codex'` out of the
		// workbench. A second such agent turns this comparison into a lookup.
		if (agent !== this._codexAccountService.agent) {
			return;
		}
		this._reportStep(agent, 'signInClicked');
		this._codexAccountService.signIn(connection);
	}

	reportSetupState(agent: string, state: AgentSdkSetupState): void {
		this._reportStep(agent, state);
	}

	isDownloadPending(agent: string, connection: IAgentConnection): boolean {
		return this._connections.get(connection)?.pendingRequests.has(agent) ?? false;
	}

	private _reportStep(agent: string, step: AgentSdkSetupFunnelStep): void {
		this._telemetryService.publicLog2<IAgentSdkSetupFunnelEvent, AgentSdkSetupFunnelClassification>('agentHost.agentSdkSetup', { agent, step });
		// This feature is diagnosed from a user's attached log far more often than
		// from a dashboard; the event says how many, this line says why this person.
		this._logService.trace(`[AgentSdkSetup] ${agent}: ${step}`);
	}

	private _dispatchRequest(key: string, agent: string, connection: IAgentConnection): void {
		if (!this._connections.has(connection)) {
			throw new Error(localize('agentSdkSetup.disconnected', "The selected agent host is disconnected. Reconnect and try again."));
		}
		// A fresh nonce every time so pressing the same thing twice is two
		// requests; the agent clears the key as it consumes it.
		connection.dispatch(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [key]: { agent, request: generateUuid() } },
		});
	}

	private _updateSetups(connection: IAgentConnection, setups: readonly IAgentSdkSetupInfo[]): void {
		const pendingRequests = this._connections.get(connection)?.pendingRequests;
		for (const setup of setups) {
			if (setup.download === 'downloading' || setup.download === 'ready') {
				pendingRequests?.delete(setup.agent);
			}
		}
		this._onDidChangeSetups.fire(this.setups);
	}
}

registerSingleton(IAgentSdkSetupService, AgentSdkSetupService, InstantiationType.Delayed);
