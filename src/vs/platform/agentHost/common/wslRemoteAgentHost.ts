/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IRelayMessage } from './relayTransport.js';

/**
 * IPC channel name for the main-process WSL service.
 */
export const WSL_REMOTE_AGENT_HOST_CHANNEL = 'wslRemoteAgentHost';

export const WSL_INSTALL_DOCS_URL = 'https://aka.ms/vscode-remote/wsl/install-wsl';

/**
 * Prefix for WSL display addresses (`wsl:<distro>`). This is NOT a `ws://`
 * URL — it identifies a managed WSL connection and must never be funneled
 * into the raw WebSocket connect path.
 */
export const WSL_ADDRESS_PREFIX = 'wsl:';

/**
 * A WSL distribution discovered via `wsl --list`. Only WSL 2 distros are
 * surfaced — WSL 1 lacks the kernel features needed to host the agent.
 */
export interface IWSLDistro {
	readonly name: string;
	readonly isDefault: boolean;
	readonly isRunning: boolean;
	readonly version: 2;
}

export interface IWSLAgentHostConfig {
	readonly distro: string;
	/** Display name (defaults to the distro name in callers). */
	readonly name: string;
	/** Dev override: custom command to start the remote agent host. See SSH equivalent. */
	readonly remoteAgentHostCommand?: string;
}

export interface IWSLConnectProgress {
	readonly connectionKey: string;
	readonly message: string;
}

export interface IWSLConnectResult {
	readonly connectionId: string;
	/** Display address: `wsl:<distro>`. NOT the underlying ws:// URL. */
	readonly address: string;
	readonly distro: string;
	readonly name: string;
	readonly connectionToken: string | undefined;
}

export interface IWSLAgentHostConnection extends IDisposable {
	readonly distro: string;
	readonly localAddress: string;
	readonly name: string;
	readonly onDidClose: Event<void>;
}

/**
 * A WSL distro the user has connected to during this or a previous window.
 * Persisted by {@link IWSLRemoteAgentHostService} so the startup
 * auto-reconnect loop knows which running distros to re-attach to. This is
 * the WSL analogue of the tunnel service's cached-tunnels list — WSL
 * connections are managed in-memory and are never written to the remote
 * agent hosts setting.
 */
export interface IWSLCachedDistro {
	readonly distro: string;
	readonly name: string;
}

export const IWSLRemoteAgentHostService = createDecorator<IWSLRemoteAgentHostService>('wslRemoteAgentHostService');

/**
 * Manages WSL-bootstrapped connections to remote agent host processes.
 *
 * Each connection enters a WSL 2 distro, ensures the VS Code CLI is
 * available inside the distro, starts `code agent-host`, and creates a
 * stdio relay through the shared process.
 */
export interface IWSLRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeConnections: Event<void>;
	readonly onDidReportConnectProgress: Event<IWSLConnectProgress>;
	readonly connections: readonly IWSLAgentHostConnection[];

	isWSLAvailable(): Promise<boolean>;
	listDistros(): Promise<IWSLDistro[]>;
	listRunningDistros(): Promise<string[]>;
	connect(config: IWSLAgentHostConfig): Promise<IWSLAgentHostConnection>;
	disconnect(distro: string): Promise<void>;
	/** Used by the contribution's auto-reconnect loop on startup. */
	reconnect(distro: string, name: string): Promise<IWSLAgentHostConnection>;
	/**
	 * Distros the user has connected to, persisted across windows. Drives the
	 * startup auto-reconnect loop. WSL connections themselves live in-memory,
	 * mirroring how tunnels are handled.
	 */
	getCachedDistros(): readonly IWSLCachedDistro[];
}

export const IWSLRemoteAgentHostMainService = createDecorator<IWSLRemoteAgentHostMainService>('wslRemoteAgentHostMainService');

/**
 * Main-process service that performs the actual WSL work. The renderer
 * calls this over IPC and handles registration with
 * {@link IRemoteAgentHostService} locally.
 */
export interface IWSLRemoteAgentHostMainService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeConnections: Event<void>;
	readonly onDidCloseConnection: Event<string /* connectionId */>;
	readonly onDidReportConnectProgress: Event<IWSLConnectProgress>;

	readonly onDidRelayMessage: Event<IRelayMessage>;
	readonly onDidRelayClose: Event<string /* connectionId */>;
	relaySend(connectionId: string, message: string): Promise<void>;

	isWSLAvailable(): Promise<boolean>;
	listDistros(): Promise<IWSLDistro[]>;
	listRunningDistros(): Promise<string[]>;
	connect(config: IWSLAgentHostConfig): Promise<IWSLConnectResult>;
	disconnect(distro: string): Promise<void>;
	reconnect(distro: string, name: string, remoteAgentHostCommand?: string): Promise<IWSLConnectResult>;
}
