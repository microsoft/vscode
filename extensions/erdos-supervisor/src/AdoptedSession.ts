/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { JupyterKernel, JupyterSession } from './erdos-supervisor.d';
import { KernelBridgeSession } from './KernelBridgeSession';
import { KernelInfoReply } from './jupyter/JupyterTypes';
import { ConnectionInfo, DefaultApi, HttpError } from './kbclient/api';
import { summarizeHttpError } from './util';
import { Barrier } from './async';

export class AdoptedSession implements JupyterKernel {
	private _runtimeInfo: KernelInfoReply | undefined;

	public connected = new Barrier();

	constructor(
		private readonly _session: KernelBridgeSession,
		private readonly _connectionInfo: ConnectionInfo,
		private readonly _api: DefaultApi
	) {

	}

	async connectToSession(session: JupyterSession): Promise<void> {
		try {
			this._runtimeInfo = (await this._api.adoptSession(session.state.sessionId, this._connectionInfo)).body as KernelInfoReply;
		} catch (err) {
			const message = err instanceof HttpError ? summarizeHttpError(err) : err.message;
			throw new Error(`Failed to adopt session: ${message}`);
		} finally {
			this.connected.open();
		}
	}

	get runtimeInfo(): KernelInfoReply | undefined {
		return this._runtimeInfo;
	}

	log(msg: string): void {
		this._session.log(msg);
	}
}
