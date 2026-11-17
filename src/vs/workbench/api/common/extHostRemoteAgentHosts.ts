/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { parseRemoteAgentHostAddress } from '../../../platform/agentHost/common/remoteAgentHostAddress.js';
import { IMainContext, MainContext, MainThreadRemoteAgentHostsShape } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';

export class ExtHostRemoteAgentHosts {

	private readonly _proxy: MainThreadRemoteAgentHostsShape;
	private _handlePool = 0;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadRemoteAgentHosts);
	}

	registerRemoteAgentHost(extension: IExtensionDescription, host: vscode.RemoteAgentHost): vscode.Disposable {
		if (typeof host?.name !== 'string' || !host.name.trim()) {
			throw new Error('A remote agent host needs a name.');
		}
		const parsed = typeof host.address === 'string' ? parseRemoteAgentHostAddress(host.address.trim()) : undefined;
		if (!parsed) {
			throw new Error(`Invalid remote agent host address: '${host.address}'. Expected host:port, or a ws:// or wss:// URL.`);
		}
		if (host.connectionToken !== undefined && typeof host.connectionToken !== 'string') {
			throw new Error('The connection token of a remote agent host must be a string.');
		}

		const handle = this._handlePool++;
		this._proxy.$registerRemoteAgentHost(handle, {
			extensionId: extension.identifier.value,
			extensionDisplayName: extension.displayName || extension.name,
			name: host.name.trim(),
			address: parsed.address,
			connectionToken: host.connectionToken ?? parsed.connectionToken,
		});
		return new Disposable(() => this._proxy.$unregisterRemoteAgentHost(handle));
	}
}
