/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { VSBuffer } from '../../../base/common/buffer.js';
import type { Event } from '../../../base/common/event.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import { vArray, vBoolean, vEnum, vNumber, vObj, vOptionalProp, vString, type ValidatorType } from '../../../base/common/validation.js';

/*
 * Forwarding of a client's Git configuration and identity, Git credentials, and SSH and GPG agents to the processes an
 * agent host runs, like the Dev Containers extension forwards them into a container. Host → client requests are sent only
 * to clients advertising `vscode.clientForwarding`; the data notifications flow in both directions once the client opened
 * a connection.
 */

export const clientForwardingSocketValidator = vEnum('ssh-agent', 'gpg-agent', 'keyboxd');
/** An agent socket of the client: its SSH agent, GPG agent or GnuPG `keyboxd`. */
export type ClientForwardingSocket = ValidatorType<typeof clientForwardingSocketValidator>;

/**
 * Host → client: what the client forwards. The host listens for agents only while a client offers them, and asks for Git
 * credentials and the full Git configuration only from clients offering them, e.g., not for a sandboxed container.
 */
export const DescribeClientForwardingExtensionMethod = 'vscode/forwarding/describe';
export const describeClientForwardingResultValidator = vObj({ gitConfig: vBoolean(), gitCredentials: vBoolean(), sshAgent: vBoolean(), gpgAgent: vBoolean(), keyboxd: vBoolean() });
export type ClientForwardingDescription = ValidatorType<typeof describeClientForwardingResultValidator>;

/**
 * Host → client: connects one of the client's agents for connection `connection` to the host's socket, numbered by the
 * host. The request succeeds once the client is connected; the host sends data only after that.
 */
export const OpenClientForwardingExtensionMethod = 'vscode/forwarding/open';
export const openClientForwardingParamsValidator = vObj({ connection: vNumber(), socket: clientForwardingSocketValidator });

/** Either direction: base64 data of an open connection. Agents exchange small messages, so there is no flow control. */
export const ClientForwardingDataNotification = 'vscode/forwarding/data';
export const clientForwardingDataParamsValidator = vObj({ connection: vNumber(), data: vString() });

/** Either direction: the sender closed a connection, so the receiver closes its side. */
export const ClientForwardingCloseNotification = 'vscode/forwarding/close';
export const clientForwardingCloseParamsValidator = vObj({ connection: vNumber() });

/** Host → client: a Git credential helper operation, answered with the client's Git credentials like a helper's output. */
export const ClientGitCredentialExtensionMethod = 'vscode/forwarding/gitCredential';
export const clientGitCredentialOperationValidator = vEnum('get', 'store', 'erase');
export type ClientGitCredentialOperation = ValidatorType<typeof clientGitCredentialOperationValidator>;
export const clientGitCredentialParamsValidator = vObj({ operation: clientGitCredentialOperationValidator, input: vString() });
export const clientGitCredentialResultValidator = vObj({ output: vString() });

/**
 * Host → client: the client's GPG public keys, certificates and owner trust, base64-encoded, which the host imports where
 * the client's GPG agent is forwarded and no public keys exist yet.
 */
export const ClientGpgKeysExtensionMethod = 'vscode/forwarding/gpgKeys';
export const clientGpgKeysResultValidator = vObj({ publicKeys: vOptionalProp(vString()), certificates: vOptionalProp(vString()), ownertrust: vOptionalProp(vString()) });
export type ClientGpgKeys = ValidatorType<typeof clientGpgKeysResultValidator>;

/**
 * Host → client: the Git identity the client uses for the workspace, and, from clients offering their Git configuration,
 * their global configuration, base64-encoded, and the files it names in their home folder, e.g., allowed signers, which
 * the host copies where it has no configuration of its own, like Dev Containers.
 */
export const ClientGitConfigExtensionMethod = 'vscode/forwarding/gitConfig';
export const clientGitConfigResultValidator = vObj({
	user: vObj({ name: vOptionalProp(vString()), email: vOptionalProp(vString()) }),
	config: vOptionalProp(vString()),
	xdgConfig: vOptionalProp(vString()),
	/** Files a setting names, with their path relative to the home folder. */
	files: vOptionalProp(vArray(vObj({ key: vString(), path: vString(), content: vString() }))),
});
export type ClientGitConfig = ValidatorType<typeof clientGitConfigResultValidator>;

/** A connection to one of the client's agents. */
export interface IClientForwardingConnection extends IDisposable {
	readonly onDidReceiveData: Event<VSBuffer>;
	/** Fires when the agent closed the connection, not after {@link IDisposable.dispose}. */
	readonly onDidClose: Event<void>;
	write(data: VSBuffer): void;
}

/** Forwarding a client offers an agent host, such as one in a Dev Container. */
export interface IAgentHostClientForwardingProvider {
	/** Whether to advertise the capability when connecting. */
	isEnabled(): boolean;
	describe(): Promise<ClientForwardingDescription>;
	open(socket: ClientForwardingSocket): Promise<IClientForwardingConnection>;
	/** Runs `git credential fill`, `approve` or `reject` with `input` and returns its output. */
	gitCredential(operation: ClientGitCredentialOperation, input: string): Promise<string>;
	gpgKeys(): Promise<ClientGpgKeys>;
	gitConfig(): Promise<ClientGitConfig>;
}
