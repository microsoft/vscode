/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
    _decodeUri(resource) {
        return fromAgentClientUri(resource);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0Q2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDbGllbnRGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFekQ7Ozs7Ozs7Ozs7Ozs7OztHQWVHO0FBQ0gsTUFBTSxPQUFPLGlDQUFrQyxTQUFRLHFCQUFxQjtJQUVqRSxVQUFVLENBQUMsUUFBYTtRQUNqQyxPQUFPLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7Q0FDRCJ9