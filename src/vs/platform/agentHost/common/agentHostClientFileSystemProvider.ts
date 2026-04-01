/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { AHPFileSystemProvider } from './agentHostFileSystemProvider.js';
import { fromAgentClientUri } from './agentClientUri.js';

/**
 * Read-only filesystem provider for accessing client-side files from the
 * agent host. Registered under the `vscode-agent-client` scheme.
 *
 * This is the inverse of {@link AgentHostFileSystemProvider}: where that
 * provider lets a client read agent host files, this one lets the agent
 * host read files from a connected client.
 *
 * ```
 * vscode-agent-client://[clientId]/[originalScheme]/[originalAuthority]/[originalPath]
 * ```
 *
 * Connections are registered per client ID. The connection implementation
 * must proxy `browseDirectory`/`fetchContent` calls back to the client
 * (e.g. via a reverse JSON-RPC request over the WebSocket transport).
 */
export class AgentHostClientFileSystemProvider extends AHPFileSystemProvider {

	protected _decodeUri(resource: URI): URI {
		return fromAgentClientUri(resource);
	}
}
