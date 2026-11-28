/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import type { IAgentHostClientForwardingMainService } from '../common/agentHostClientForwardingMainService.js';
import type { ClientForwardingDescription, ClientForwardingSocket, ClientGitConfig, ClientGitCredentialOperation, ClientGpgKeys, IAgentHostClientForwardingProvider, IClientForwardingConnection } from '../common/clientForwardingProtocol.js';

interface IConnectionEmitters {
	readonly data: Emitter<VSBuffer>;
	readonly close: Emitter<void>;
	readonly store: DisposableStore;
}

/** What a client forwards to an agent host. */
export interface IAgentHostClientForwardingOptions {
	/** Whether to forward Git credentials and agents and supply the full Git configuration, e.g., not to a sandboxed container. */
	readonly forwardCredentials: () => boolean;
	/** Fires when {@link forwardCredentials} may have changed, so open agent connections close when it turns off. */
	readonly onDidChangeForwardCredentials?: Event<void>;
	/** The workspace folder on this machine, whose conditional includes the Git identity follows. */
	readonly folder?: string;
}

/**
 * Forwards the Git identity of this client's machine, and its Git configuration, Git credentials and agents unless
 * restricted, through the service that connects to them.
 */
export class AgentHostClientForwarding extends Disposable implements IAgentHostClientForwardingProvider {
	private readonly _connections = new Map<string, IConnectionEmitters>();
	private _listening = false;

	constructor(
		private readonly _service: IAgentHostClientForwardingMainService,
		private readonly _options: IAgentHostClientForwardingOptions,
	) {
		super();
		if (_options.onDidChangeForwardCredentials) {
			this._register(_options.onDidChangeForwardCredentials(() => {
				if (!_options.forwardCredentials()) {
					for (const [id, connection] of [...this._connections]) {
						this._connections.delete(id);
						void this._service.close(id).catch(() => { });
						connection.close.fire();
					}
				}
			}));
		}
		this._register(toDisposable(() => {
			for (const [id, connection] of this._connections) {
				connection.store.dispose();
				void this._service.close(id).catch(() => { });
			}
			this._connections.clear();
		}));
	}

	/** Listens once the first agent connection opens, as many clients never forward one. */
	private _listen(): void {
		if (this._listening) {
			return;
		}
		this._listening = true;
		// The service serves all windows, so it reports connections of other windows as well.
		this._register(this._service.onDidReceiveData(([id, data]) => this._connections.get(id)?.data.fire(data)));
		this._register(this._service.onDidClose(id => {
			const connection = this._connections.get(id);
			if (connection) {
				this._connections.delete(id);
				connection.close.fire();
			}
		}));
	}

	isEnabled(): boolean {
		// The Git identity is forwarded either way.
		return true;
	}

	async describe(): Promise<ClientForwardingDescription> {
		if (!this._options.forwardCredentials()) {
			return { gitConfig: false, gitCredentials: false, sshAgent: false, gpgAgent: false, keyboxd: false };
		}
		return { ...await this._service.describe(), gitConfig: true, gitCredentials: true };
	}

	async open(socket: ClientForwardingSocket): Promise<IClientForwardingConnection> {
		if (this._store.isDisposed || !this._options.forwardCredentials()) {
			throw new Error('This client does not forward its agents');
		}
		this._listen();
		// Registered before opening, as an agent like GnuPG's greets first.
		const id = generateUuid();
		const store = new DisposableStore();
		const connection: IConnectionEmitters = { data: store.add(new Emitter<VSBuffer>()), close: store.add(new Emitter<void>()), store };
		this._connections.set(id, connection);
		// Until the caller listens.
		const onDidReceiveData = Event.buffer(connection.data.event, 'agentHostClientForwarding.data', false, [], store);
		const onDidClose = Event.buffer(connection.close.event, 'agentHostClientForwarding.close', false, [], store);
		try {
			await this._service.open(id, socket);
		} catch (error) {
			if (this._connections.get(id) === connection) {
				this._connections.delete(id);
			}
			store.dispose();
			throw error;
		}
		if (this._store.isDisposed || !this._options.forwardCredentials()) {
			// Closing again, as the service may have still been opening when this was disposed or forwarding turned off.
			if (this._connections.get(id) === connection) {
				this._connections.delete(id);
			}
			store.dispose();
			void this._service.close(id).catch(() => { });
			throw new Error('This client does not forward its agents');
		}
		return {
			onDidReceiveData,
			onDidClose,
			write: data => void this._service.write(id, data).catch(() => { }),
			dispose: () => {
				store.dispose();
				if (this._connections.get(id) === connection) {
					this._connections.delete(id);
					void this._service.close(id).catch(() => { });
				}
			},
		};
	}

	async gitCredential(operation: ClientGitCredentialOperation, input: string): Promise<string> {
		if (!this._options.forwardCredentials()) {
			return '';
		}
		const output = await this._service.gitCredential(operation, input);
		// Forwarding may have turned off while a credential manager signed in.
		return this._options.forwardCredentials() && !this._store.isDisposed ? output : '';
	}

	async gpgKeys(): Promise<ClientGpgKeys> {
		return this._options.forwardCredentials() ? this._service.gpgKeys() : {};
	}

	async gitConfig(): Promise<ClientGitConfig> {
		const gitConfig = await this._service.gitConfig(this._options.forwardCredentials(), this._options.folder);
		return this._options.forwardCredentials() || !gitConfig.gitGlobalConfig ? gitConfig : { user: gitConfig.user };
	}
}
