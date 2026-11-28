/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Socket } from 'net';
import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import type { IAgentHostClientForwardingMainService, IClientAgents } from '../common/agentHostClientForwardingMainService.js';
import type { ClientForwardingSocket, ClientGitConfig, ClientGitCredentialOperation, ClientGpgKeys } from '../common/clientForwardingProtocol.js';
import { findHostGpgAgent, findHostSshAgent, IClientForwardingHost, NodeClientForwardingHost } from './clientForwardingHost.js';
import { readClientGitConfig } from './clientGitConfig.js';

/**
 * Serves the Git configuration and identity, Git credentials and agents of the machine a client runs on, as Dev
 * Containers forwards them into a container. Commands and agents are found in the user's shell environment, as from a
 * terminal.
 */
export class AgentHostClientForwardingMainService extends Disposable implements IAgentHostClientForwardingMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidReceiveData = this._register(new Emitter<readonly [id: string, data: VSBuffer]>());
	readonly onDidReceiveData = this._onDidReceiveData.event;
	private readonly _onDidClose = this._register(new Emitter<string>());
	readonly onDidClose = this._onDidClose.event;

	private readonly _connections = new Map<string, Socket>();
	private _host: Promise<IClientForwardingHost> | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const socket of this._connections.values()) {
				socket.destroy();
			}
			this._connections.clear();
		}));
	}

	protected _getHost(): Promise<IClientForwardingHost> {
		this._host ??= this._createHost();
		return this._host;
	}

	private async _createHost(): Promise<IClientForwardingHost> {
		let environment: NodeJS.ProcessEnv = process.env;
		try {
			environment = { ...process.env, ...await getResolvedShellEnv(this._configurationService, this._logService, { ...this._environmentService.args, 'force-user-env': true }, process.env) };
		} catch (error) {
			this._logService.error('[AgentHostClientForwarding] Unable to resolve the shell environment; using the inherited environment', error);
		}
		return new NodeClientForwardingHost(environment);
	}

	async describe(): Promise<IClientAgents> {
		const host = await this._getHost();
		const [sshAgent, gpgAgent] = await Promise.all([findHostSshAgent(host), findHostGpgAgent(host)]);
		if (gpgAgent) {
			// Updates the terminal the agent shows its passphrase prompt in, like Dev Containers.
			await host.run('gpg-connect-agent', ['updatestartuptty', '/bye']).catch(() => undefined);
		}
		return { sshAgent: !!sshAgent, gpgAgent: !!gpgAgent, keyboxd: !!gpgAgent?.usesKeyboxd };
	}

	async open(id: string, name: ClientForwardingSocket): Promise<void> {
		if (this._connections.has(id)) {
			throw new Error('The connection is already open');
		}
		const host = await this._getHost();
		const path = name === 'ssh-agent' ? await findHostSshAgent(host)
			: name === 'gpg-agent' ? (await findHostGpgAgent(host))?.extraSocket
				: (await findHostGpgAgent(host))?.keyboxdSocket;
		if (!path) {
			throw new Error(`No ${name} on this machine`);
		}
		const { socket, skip } = await host.connect(path);
		if (this._connections.has(id) || this._store.isDisposed) {
			socket.destroy();
			throw new Error('The connection is already open');
		}
		this._connections.set(id, socket);
		let remainingSkip = skip;
		socket.on('data', (data: Buffer) => {
			if (remainingSkip) {
				const skipped = Math.min(remainingSkip, data.length);
				remainingSkip -= skipped;
				data = data.subarray(skipped);
			}
			if (data.length) {
				this._onDidReceiveData.fire([id, VSBuffer.wrap(data)]);
			}
		});
		socket.on('error', error => this._logService.trace(`[AgentHostClientForwarding] ${name} connection failed: ${error.message}`));
		socket.on('close', () => {
			if (this._connections.get(id) === socket) {
				this._connections.delete(id);
				this._onDidClose.fire(id);
			}
		});
	}

	async write(id: string, data: VSBuffer): Promise<void> {
		this._connections.get(id)?.write(data.buffer);
	}

	async close(id: string): Promise<void> {
		const socket = this._connections.get(id);
		this._connections.delete(id);
		socket?.destroy();
	}

	async gitCredential(operation: ClientGitCredentialOperation, input: string): Promise<string> {
		const host = await this._getHost();
		const command = operation === 'get' ? 'fill' : operation === 'store' ? 'approve' : 'reject';
		// Credential managers may still show their own sign-in, like for the Dev Containers credential helper.
		const result = await host.run('git', ['credential', command], { stdin: input, environment: { GIT_TERMINAL_PROMPT: '0' } });
		return result?.code === 0 ? result.stdout.toString() : '';
	}

	async gpgKeys(): Promise<ClientGpgKeys> {
		const host = await this._getHost();
		const read = async (command: string, args: readonly string[]) => {
			const result = await host.run(command, args).catch(() => undefined);
			return result?.code === 0 && result.stdout.byteLength ? encodeBase64(VSBuffer.wrap(result.stdout)) : undefined;
		};
		const [publicKeys, certificates, ownertrust] = await Promise.all([
			read('gpg', ['--export', '--export-options', 'backup']),
			read('gpgsm', ['--export', '--armor']),
			read('gpg', ['--export-ownertrust']),
		]);
		return { publicKeys, certificates, ownertrust };
	}

	async gitConfig(full: boolean, folder: string | undefined): Promise<ClientGitConfig> {
		return readClientGitConfig(await this._getHost(), full, folder);
	}
}
