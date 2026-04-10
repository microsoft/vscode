/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection, IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { LoggingAgentConnection } from '../../../contrib/chat/browser/agentSessions/agentHost/loggingAgentConnection.js';
import { ITerminalProfileProvider, ITerminalProfileService } from '../common/terminal.js';
import { IAgentHostTerminalService } from './agentHostTerminalService.js';

const AGENT_HOST_PROFILE_EXT_ID = 'vscode.agent-host-terminal';

interface IAgentHostEntry {
	/** Display name for the profile */
	readonly name: string;
	/** Address or identifier for the host */
	readonly address: string;
	/** Getter for the connection (may be lazily resolved) */
	readonly getConnection: () => IAgentConnection | undefined;
}

/**
 * Registers terminal profiles for connected agent hosts, allowing users to
 * open terminals on remote (or local) agent host processes directly from the
 * terminal dropdown.
 */
export class AgentHostTerminalContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentHostTerminal';

	private readonly _registrations = this._register(new DisposableMap<string>());
	private readonly _usedHosts = new Set<string>();

	constructor(
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@ITerminalProfileService private readonly _terminalProfileService: ITerminalProfileService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
	) {
		super();

		// React to connection changes
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcile()));

		// React to local agent host lifecycle
		this._register(this._agentHostService.onAgentHostStart(() => this._reconcile()));
		this._register(this._agentHostService.onAgentHostExit(() => this._reconcile()));

		// Initial reconciliation
		this._reconcile();
	}

	private _reconcile(): void {
		const entries = this._collectEntries();

		// Determine which profiles to show
		const desiredProfiles = new Map<string, IAgentHostEntry>();

		if (entries.length === 0) {
			// No hosts connected — no profiles
		} else if (entries.length === 1) {
			// Single host — always show a named profile
			const entry = entries[0];
			desiredProfiles.set(entry.address, entry);
		} else {
			// Multiple hosts, some active — show named profiles for active ones
			let displaying = 0;
			for (const address of this._usedHosts) {
				const entry = entries.find(e => e.address === address);
				if (entry) {
					displaying++;
					desiredProfiles.set(entry.address, entry);
				}
			}

			if (displaying === entries.length - 1) {
				const missing = entries.find(e => !this._usedHosts.has(e.address));
				if (missing) {
					desiredProfiles.set(missing.address, missing);
				}
			} else if (displaying < entries.length) {
				// Multiple hosts, none active — show a generic quickpick profile
				desiredProfiles.set('__quickpick__', {
					name: localize('agentHostTerminal.pick', "Agent Host\u2026"),
					address: '__quickpick__',
					getConnection: () => undefined,
				});
			}
		}

		// Diff and update profile registrations
		for (const [key, entry] of desiredProfiles) {
			if (!this._registrations.has(key)) {
				this._registerProfile(key, entry, entries);
			}
		}
		for (const key of this._registrations.keys()) {
			if (!desiredProfiles.has(key)) {
				this._registrations.deleteAndDispose(key);
			}
		}
	}

	private _collectEntries(): IAgentHostEntry[] {
		const entries: IAgentHostEntry[] = [];

		// Remote connections
		for (const info of this._remoteAgentHostService.connections) {
			if (info.status !== RemoteAgentHostConnectionStatus.Connected) {
				continue;
			}
			const connection = this._remoteAgentHostService.getConnection(info.address);
			if (!connection) {
				continue;
			}

			entries.push({
				name: info.name || info.address,
				address: info.address,
				getConnection: () => this._instantiationService.createInstance(
					LoggingAgentConnection,
					connection,
					`agenthost.${connection.clientId}`,
					localize('agentHostTerminal.channelRemote', "Agent Host Terminal ({0})", info.address),
				),
			});
		}

		// Local agent host
		try {
			entries.push({
				name: localize('agentHostTerminal.local', "Local"),
				address: '__local__',
				getConnection: () => this._instantiationService.createInstance(
					LoggingAgentConnection,
					this._agentHostService,
					`agenthost.${this._agentHostService.clientId}`,
					localize('agentHostTerminal.channelLocal', "Agent Host Terminal (Local)"),
				),
			});
		} catch {
			// Local agent host may not be available
		}

		return entries;
	}

	private _registerProfile(key: string, entry: IAgentHostEntry, allEntries: IAgentHostEntry[]): void {
		const provider: ITerminalProfileProvider = {
			createContributedTerminalProfile: async (options) => {
				let connection: IAgentConnection | undefined;
				let displayName = entry.name;

				if (key === '__quickpick__') {
					// Show quickpick to let user choose a host
					const picks: (IQuickPickItem & { address: string; hostName: string })[] = allEntries.map(e => ({
						label: localize('agentHostTerminal.profileName', "Agent Host ({0})", e.name),
						address: e.address,
						hostName: e.name,
					}));
					const pick = await this._quickInputService.pick(picks, {
						placeHolder: localize('agentHostTerminal.pickHost', "Select an agent host to open a terminal on"),
					});
					if (!pick) {
						return;
					}
					this._usedHosts.add(pick.address);
					this._reconcile();
					displayName = pick.hostName;
					connection = allEntries.find(e => e.address === pick.address)?.getConnection();
				} else {
					connection = entry.getConnection();
				}

				if (!connection) {
					return;
				}

				await this._agentHostTerminalService.createTerminal(connection, {
					name: localize('agentHostTerminal.profileName', "Agent Host ({0})", displayName),
					cwd: options.cwd ? (typeof options.cwd === 'string' ? URI.file(options.cwd) : options.cwd) : undefined,
					location: options.location,
				});
			},
		};

		const title = key === '__quickpick__'
			? localize('agentHostTerminal.pick', "Agent Host\u2026")
			: localize('agentHostTerminal.profileName', "Agent Host ({0})", entry.name);

		const store = new DisposableStore();
		store.add(this._terminalProfileService.registerTerminalProfileProvider(
			AGENT_HOST_PROFILE_EXT_ID,
			key,
			provider,
		));

		// Register the profile metadata in-memory so it appears in the
		// contribution list without writing to user configuration.
		store.add(this._terminalProfileService.registerInternalContributedProfile({
			extensionIdentifier: AGENT_HOST_PROFILE_EXT_ID,
			id: key,
			title,
			icon: 'remote',
		}));

		this._registrations.set(key, store);
	}
}
