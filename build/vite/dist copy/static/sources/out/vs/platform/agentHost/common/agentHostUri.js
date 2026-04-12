/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { encodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
/**
 * The URI scheme for accessing files on a remote agent host.
 *
 * URIs encode the original scheme, authority, and path so that any
 * remote resource can be represented without assuming `file://`:
 *
 * ```
 * vscode-agent-host://[connectionAuthority]/[originalScheme]/[originalAuthority]/[originalPath]
 * ```
 *
 * For example, `file:///home/user/foo.ts` on remote `my-server` becomes:
 * ```
 * vscode-agent-host://my-server/file//home/user/foo.ts
 * ```
 */
export const AGENT_HOST_SCHEME = 'vscode-agent-host';
/**
 * Wraps a remote URI into a {@link AGENT_HOST_SCHEME} URI that can be
 * resolved through the agent host filesystem provider.
 *
 * @param originalUri The URI on the remote (e.g. `file:///path` or
 *   `agenthost-content:///sessionId/...`)
 * @param connectionAuthority The sanitized connection identifier used as
 *   the URI authority (from {@link agentHostAuthority}).
 */
export function toAgentHostUri(originalUri, connectionAuthority) {
    if (connectionAuthority === 'local' && originalUri.scheme === Schemas.file) {
        return originalUri;
    }
    // Path format: /[originalScheme]/[originalAuthority]/[originalPath]
    const originalAuthority = originalUri.authority || '';
    return URI.from({
        scheme: AGENT_HOST_SCHEME,
        authority: connectionAuthority,
        path: `/${originalUri.scheme}/${originalAuthority || '-'}${originalUri.path}`,
    });
}
/**
 * Extracts the original URI from a {@link AGENT_HOST_SCHEME} URI.
 *
 * The inverse of {@link toAgentHostUri}.
 */
export function fromAgentHostUri(agentHostUri) {
    // Path: /[originalScheme]/[originalAuthority]/[rest of original path]
    const path = agentHostUri.path;
    // Find first segment boundary after leading /
    const schemeEnd = path.indexOf('/', 1);
    if (schemeEnd === -1) {
        // Malformed — treat whole path as file scheme
        return URI.from({ scheme: 'file', path });
    }
    const originalScheme = path.substring(1, schemeEnd);
    // Find second segment boundary (authority/path split)
    const authorityEnd = path.indexOf('/', schemeEnd + 1);
    if (authorityEnd === -1) {
        // No path after authority
        const originalAuthority = path.substring(schemeEnd + 1);
        return URI.from({ scheme: originalScheme, authority: originalAuthority, path: '/' });
    }
    let originalAuthority = path.substring(schemeEnd + 1, authorityEnd);
    if (originalAuthority === '-') {
        originalAuthority = '';
    }
    const originalPath = path.substring(authorityEnd);
    return URI.from({
        scheme: originalScheme,
        authority: originalAuthority || undefined,
        path: originalPath,
    });
}
/**
 * Strips the redundant `ws://` scheme from an address. The transport layer
 * already defaults to `ws://`, so only `wss://` needs to be preserved.
 */
export function normalizeRemoteAgentHostAddress(address) {
    if (address.startsWith('ws://')) {
        return address.slice('ws://'.length);
    }
    return address;
}
/**
 * Encode a remote address into an identifier that is safe for use in
 * both URI schemes and URI authorities, and is collision-free.
 *
 * Three tiers:
 * 1. Purely alphanumeric addresses are returned as-is.
 * 2. "Normal" addresses containing only `[a-zA-Z0-9.:-]` get colons
 *    replaced with `__` (double underscore) for human readability.
 *    Addresses containing `_` skip this tier to keep the encoding
 *    collision-free (`__` can only appear from colon replacement).
 * 3. Everything else is url-safe base64-encoded with a `b64-` prefix.
 */
export function agentHostAuthority(address) {
    const normalized = normalizeRemoteAgentHostAddress(address);
    if (/^[a-zA-Z0-9]+$/.test(normalized)) {
        return normalized;
    }
    if (/^[a-zA-Z0-9.:\-]+$/.test(normalized)) {
        return normalized.replaceAll(':', '__');
    }
    return 'b64-' + encodeBase64(VSBuffer.fromString(normalized), false, true);
}
/**
 * Label formatter for {@link AGENT_HOST_SCHEME} URIs. Strips the two
 * leading path segments (`/scheme/authority`) to display the original
 * file path.
 */
export const AGENT_HOST_LABEL_FORMATTER = {
    scheme: AGENT_HOST_SCHEME,
    formatting: {
        label: '${path}',
        separator: '/',
        stripPathSegments: 2,
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0VXJpLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBR2xEOzs7Ozs7Ozs7Ozs7OztHQWNHO0FBQ0gsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsbUJBQW1CLENBQUM7QUFFckQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLFVBQVUsY0FBYyxDQUFDLFdBQWdCLEVBQUUsbUJBQTJCO0lBQzNFLElBQUksbUJBQW1CLEtBQUssT0FBTyxJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzVFLE9BQU8sV0FBVyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxvRUFBb0U7SUFDcEUsTUFBTSxpQkFBaUIsR0FBRyxXQUFXLENBQUMsU0FBUyxJQUFJLEVBQUUsQ0FBQztJQUN0RCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFDZixNQUFNLEVBQUUsaUJBQWlCO1FBQ3pCLFNBQVMsRUFBRSxtQkFBbUI7UUFDOUIsSUFBSSxFQUFFLElBQUksV0FBVyxDQUFDLE1BQU0sSUFBSSxpQkFBaUIsSUFBSSxHQUFHLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRTtLQUM3RSxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxZQUFpQjtJQUNqRCxzRUFBc0U7SUFDdEUsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQztJQUUvQiw4Q0FBOEM7SUFDOUMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdkMsSUFBSSxTQUFTLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUN0Qiw4Q0FBOEM7UUFDOUMsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztJQUVwRCxzREFBc0Q7SUFDdEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3RELElBQUksWUFBWSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDekIsMEJBQTBCO1FBQzFCLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDeEQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUVELElBQUksaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3BFLElBQUksaUJBQWlCLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDL0IsaUJBQWlCLEdBQUcsRUFBRSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBRWxELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQztRQUNmLE1BQU0sRUFBRSxjQUFjO1FBQ3RCLFNBQVMsRUFBRSxpQkFBaUIsSUFBSSxTQUFTO1FBQ3pDLElBQUksRUFBRSxZQUFZO0tBQ2xCLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsK0JBQStCLENBQUMsT0FBZTtJQUM5RCxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUNqQyxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFDRCxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsT0FBZTtJQUNqRCxNQUFNLFVBQVUsR0FBRywrQkFBK0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM1RCxJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQ3ZDLE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUM7SUFDRCxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO1FBQzNDLE9BQU8sVUFBVSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDekMsQ0FBQztJQUNELE9BQU8sTUFBTSxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztBQUM1RSxDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUEyQjtJQUNqRSxNQUFNLEVBQUUsaUJBQWlCO0lBQ3pCLFVBQVUsRUFBRTtRQUNYLEtBQUssRUFBRSxTQUFTO1FBQ2hCLFNBQVMsRUFBRSxHQUFHO1FBQ2QsaUJBQWlCLEVBQUUsQ0FBQztLQUNwQjtDQUNELENBQUMifQ==