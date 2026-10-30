/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ClientConnectionEvent, IChannel, IPCClient } from '../../../../base/parts/ipc/common/ipc.js';
import { GITHUB_CHANNEL_NAME, GITHUB_CREDENTIALS_CHANNEL_NAME, IGitHubCredentialBroker } from '../../common/remote/ipc.js';
import { GitHubCredentialsChannel } from '../../common/remote/ipcClient.js';

/** Bidirectional serialized IPC with controllable response delivery for lease-race tests. */
export class TestConnection extends Disposable {
	private readonly incoming = this._register(new Emitter<VSBuffer>());
	private readonly outgoing = this._register(new Emitter<VSBuffer>());
	private readonly onDidDisconnect = this._register(new Emitter<void>());
	private readonly client: IPCClient<string>;
	private readonly responses: VSBuffer[] = [];
	pauseResponses = false;
	readonly channel: IChannel;

	constructor(onDidConnect: Emitter<ClientConnectionEvent>, context: string) {
		super();
		onDidConnect.fire({
			protocol: {
				onMessage: this.outgoing.event,
				send: buffer => {
					if (this.pauseResponses) {
						this.responses.push(buffer);
					} else {
						queueMicrotask(() => this.incoming.fire(buffer));
					}
				},
			},
			onDidClientDisconnect: this.onDidDisconnect.event,
		});
		this.client = this._register(new IPCClient({
			onMessage: this.incoming.event,
			send: buffer => queueMicrotask(() => this.outgoing.fire(buffer)),
		}, context));
		this.channel = this.client.getChannel(GITHUB_CHANNEL_NAME);
	}

	flush(): Promise<void> {
		return this.channel.call('releaseClient', { clientId: 'unallocated-roundtrip-barrier' });
	}

	registerCredentials(broker: IGitHubCredentialBroker): void {
		this.client.registerChannel(GITHUB_CREDENTIALS_CHANNEL_NAME, this._register(new GitHubCredentialsChannel(broker)));
	}

	resumeResponses(): void {
		this.pauseResponses = false;
		for (const buffer of this.responses.splice(0)) {
			queueMicrotask(() => this.incoming.fire(buffer));
		}
	}

	override dispose(): void {
		if (!this._store.isDisposed) {
			this.onDidDisconnect.fire();
			this.responses.length = 0;
			super.dispose();
		}
	}
}
