/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, RemoteConnectionType, ResolverResult } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { isLoopbackHost, parseAuthorityWithPort } from '../../../../platform/remote/common/remoteHosts.js';

/** Resolve a direct desktop connection only after confirming its destination. */
export async function resolveDirectRemoteAuthority(
	authority: string,
	getConnectionToken: (authority: string) => Promise<string | undefined>,
	confirmConnection: (host: string, port: number) => Promise<void>
): Promise<ResolverResult> {
	const { host, port } = parseAuthorityWithPort(authority);
	// Direct authorities can originate in untrusted workspace files. Preserve the
	// host confirmation before requesting credentials or connecting to the server.
	if (!isLoopbackHost(host)) {
		await confirmConnection(host, port);
	}

	let connectionToken: string | undefined;
	try {
		connectionToken = await getConnectionToken(authority);
	} catch (error) {
		// IPC does not preserve the main process's credential error class.
		throw new RemoteAuthorityResolverError(toErrorMessage(error), RemoteAuthorityResolverErrorCode.NotAvailable);
	}

	return { authority: { authority, connectTo: { type: RemoteConnectionType.WebSocket, host, port }, connectionToken } };
}

/** Keep the resolved token across reconnects for the lifetime of the workbench. */
export class DirectRemoteAuthorityResolver {
	private readonly _connectionTokens = new Map<string, Promise<string | undefined>>();

	constructor(
		private readonly _getConnectionToken: (authority: string) => Promise<string | undefined>,
		private readonly _confirmConnection: (host: string, port: number) => Promise<void>,
	) { }

	resolve(authority: string): Promise<ResolverResult> {
		return resolveDirectRemoteAuthority(authority, async authority => {
			let token = this._connectionTokens.get(authority);
			if (!token) {
				token = this._getConnectionToken(authority).catch(error => {
					this._connectionTokens.delete(authority);
					throw error;
				});
				this._connectionTokens.set(authority, token);
			}
			return token;
		}, this._confirmConnection);
	}
}
