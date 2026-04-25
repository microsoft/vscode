/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ISSHRemoteAgentHostService = createDecorator<ISSHRemoteAgentHostService>('sshRemoteAgentHostService');

/**
 * IPC channel name for the main-process SSH service.
 */
export const SSH_REMOTE_AGENT_HOST_CHANNEL = 'sshRemoteAgentHost';

export const enum SSHAuthMethod {
	/** Use the local SSH agent for key-based auth. */
	Agent = 'agent',
	/** Authenticate with an explicit private key file. */
	KeyFile = 'keyFile',
	/** Authenticate with a password. */
	Password = 'password',
}

export interface ISSHAgentHostConfig {
	/** Remote hostname or IP. */
	readonly host: string;
	/** SSH port (default 22). */
	readonly port?: number;
	/** Username on the remote machine. */
	readonly username: string;
	/** Authentication method. */
	readonly authMethod: SSHAuthMethod;
	/** Path to the private key file (when {@link authMethod} is KeyFile). */
	readonly privateKeyPath?: string;
	/** Password string (when {@link authMethod} is Password). */
	readonly password?: string;
	/** Display name for this connection. */
	readonly name: string;
	/** SSH config host alias (e.g. "robfast2") for reconnection on restart. */
	readonly sshConfigHost?: string;
	/** Dev override: custom command to start the remote agent host instead of the default CLI. */
	readonly remoteAgentHostCommand?: string;
	/** When true, enables OpenSSH agent forwarding (auth-agent@openssh.com) for this connection. Requires {@link authMethod} to be Agent. */
	readonly agentForward?: boolean;
}

/**
 * A sanitized view of the SSH config that omits secret material
 * (password, private key path). Exposed on active connections so
 * consumers can inspect connection metadata without accessing credentials.
 */
export type ISSHAgentHostConfigSanitized = Omit<ISSHAgentHostConfig, 'password' | 'privateKeyPath'>;

export interface ISSHAgentHostConnection extends IDisposable {
	/** The SSH config used to establish this connection (secrets stripped). */
	readonly config: ISSHAgentHostConfigSanitized;
	/** The connection address (e.g. `ssh:myhost` or `user@host:22`) registered with IRemoteAgentHostService. */
	readonly localAddress: string;
	/** The display name. */
	readonly name: string;
	/** Fires when this SSH connection is closed or lost. */
	readonly onDidClose: Event<void>;
}

/**
 * Manages SSH connections that bootstrap a remote agent host process.
 *
 * Each connection SSHs into a remote machine, ensures the VS Code CLI
 * is installed, starts `code agent-host`, and creates a WebSocket relay
 * over the SSH channel. Messages are forwarded between the renderer and
 * the remote agent host via IPC through the shared process.
 */
export interface ISSHRemoteAgentHostService {
	readonly _serviceBrand: undefined;

	/** Fires when the set of active SSH connections changes. */
	readonly onDidChangeConnections: Event<void>;

	/** Progress messages during connect. */
	readonly onDidReportConnectProgress: Event<ISSHConnectProgress>;

	/** Currently active SSH-bootstrapped connections. */
	readonly connections: readonly ISSHAgentHostConnection[];

	/**
	 * Bootstrap a remote agent host over SSH.
	 *
	 * 1. Opens an SSH connection to the remote host
	 * 2. Downloads and installs the VS Code CLI if needed
	 * 3. Starts `code agent-host`
	 * 4. Creates a WebSocket relay over the SSH channel
	 * 5. Registers the connection with {@link IRemoteAgentHostService}
	 *
	 * Resolves with the connection handle once the agent host is reachable.
	 */
	connect(config: ISSHAgentHostConfig): Promise<ISSHAgentHostConnection>;

	/**
	 * Disconnect an SSH-bootstrapped connection by host address.
	 * Tears down the SSH tunnel, stops the remote agent host, and
	 * removes the entry from {@link IRemoteAgentHostService}.
	 */
	disconnect(host: string): Promise<void>;

	/** List SSH config host aliases (excluding wildcards). */
	listSSHConfigHosts(): Promise<string[]>;

	/** Resolve full SSH config for a host via `ssh -G`. */
	resolveSSHConfig(host: string): Promise<ISSHResolvedConfig>;

	/**
	 * Re-establish an SSH tunnel on startup for a previously connected host.
	 * Returns the new local forwarded address and registers it.
	 */
	reconnect(sshConfigHost: string, name: string): Promise<ISSHAgentHostConnection>;
}
/**
 * Serializable result from a successful SSH connect operation.
 * Returned over IPC from the main process.
 */
export interface ISSHConnectResult {
	/** Unique identifier for this connection's relay channel. */
	readonly connectionId: string;
	/** Display-friendly address (e.g. "ssh:robfast2"). */
	readonly address: string;
	readonly name: string;
	readonly connectionToken: string | undefined;
	readonly config: ISSHAgentHostConfigSanitized;
	/** SSH config host alias for reconnection on restart. */
	readonly sshConfigHost?: string;
}

/**
 * Resolved SSH configuration for a host, obtained from `ssh -G`.
 */
export interface ISSHResolvedConfig {
	readonly hostname: string;
	readonly user: string | undefined;
	readonly port: number;
	readonly identityFile: string[];
	readonly forwardAgent: boolean;
}

export interface ISSHConnectProgress {
	readonly connectionKey: string;
	readonly message: string;
}

/**
 * A message relayed from a remote agent host through the SSH tunnel.
 * The shared process acts as a WebSocket proxy, forwarding JSON messages
 * bidirectionally between the SSH channel and the renderer via IPC.
 */
export interface ISSHRelayMessage {
	readonly connectionId: string;
	readonly data: string;
}

/**
 * Main-process service that performs the actual SSH work.
 * The renderer calls this over IPC and handles registration
 * with {@link IRemoteAgentHostService} locally.
 */
export const ISSHRemoteAgentHostMainService = createDecorator<ISSHRemoteAgentHostMainService>('sshRemoteAgentHostMainService');

export interface ISSHRemoteAgentHostMainService {
	readonly _serviceBrand: undefined;

	/** Fires when the set of active SSH connections changes. */
	readonly onDidChangeConnections: Event<void>;

	/** Fires when a connection is closed from the shared process side. */
	readonly onDidCloseConnection: Event<string /* connectionId */>;

	/** Progress messages during connect (e.g. "Installing CLI..."). */
	readonly onDidReportConnectProgress: Event<ISSHConnectProgress>;

	/** Fires when a message is received from a remote agent host via the SSH relay. */
	readonly onDidRelayMessage: Event<ISSHRelayMessage>;

	/** Fires when a relay connection to a remote agent host closes. */
	readonly onDidRelayClose: Event<string /* connectionId */>;

	/**
	 * Bootstrap a remote agent host over SSH. Returns serializable
	 * connection info for the renderer to register.
	 */
	connect(config: ISSHAgentHostConfig): Promise<ISSHConnectResult>;

	/**
	 * Send a message to a remote agent host through the SSH relay.
	 */
	relaySend(connectionId: string, message: string): Promise<void>;

	/**
	 * Disconnect an SSH-bootstrapped connection by host address.
	 */
	disconnect(host: string): Promise<void>;

	/** List SSH config host aliases (excluding wildcards). */
	listSSHConfigHosts(): Promise<string[]>;

	/** Resolve full SSH config for a host via `ssh -G`. */
	resolveSSHConfig(host: string): Promise<ISSHResolvedConfig>;

	/**
	 * Re-establish an SSH tunnel for a previously connected host.
	 * Resolves the SSH config alias, connects, and returns fresh
	 * connection info with a new local forwarded port.
	 */
	reconnect(sshConfigHost: string, name: string, remoteAgentHostCommand?: string, agentForward?: boolean): Promise<ISSHConnectResult>;
}
