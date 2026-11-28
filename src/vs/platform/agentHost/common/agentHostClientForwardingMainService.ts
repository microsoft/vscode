/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { VSBuffer } from '../../../base/common/buffer.js';
import type { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ClientForwardingDescription, ClientForwardingSocket, ClientGitConfig, ClientGitCredentialOperation, ClientGpgKeys } from './clientForwardingProtocol.js';

export const AGENT_HOST_CLIENT_FORWARDING_CHANNEL = 'agentHostClientForwarding';

export const IAgentHostClientForwardingMainService = createDecorator<IAgentHostClientForwardingMainService>('agentHostClientForwardingMainService');

/** Connects to this machine's SSH and GPG agents and Git credentials for agent hosts that clients forward them to. */
export interface IAgentHostClientForwardingMainService {
	readonly _serviceBrand: undefined;
	/** Fires with a connection and data from its agent; a tuple, as IPC serializes buffers only outside of objects. */
	readonly onDidReceiveData: Event<readonly [id: string, data: VSBuffer]>;
	/** Fires with the connection that the agent closed. */
	readonly onDidClose: Event<string>;
	/** The agents of this machine. */
	describe(): Promise<IClientAgents>;
	/** Connects to an agent with a unique identifier the caller chose, so it can listen for the connection's data first. */
	open(id: string, socket: ClientForwardingSocket): Promise<void>;
	write(id: string, data: VSBuffer): Promise<void>;
	close(id: string): Promise<void>;
	/** Rejects when Git fails other than for a missing credential, e.g., when it is not installed. */
	gitCredential(operation: ClientGitCredentialOperation, input: string): Promise<string>;
	gpgKeys(): Promise<ClientGpgKeys>;
	/**
	 * The Git identity for a folder of this machine, following its conditional includes, and, when `full`, the global Git
	 * configuration with the files in the home folder that settings name.
	 */
	gitConfig(full: boolean, folder: string | undefined): Promise<ClientGitConfig>;
}

export type IClientAgents = Pick<ClientForwardingDescription, 'sshAgent' | 'gpgAgent' | 'keyboxd'>;
