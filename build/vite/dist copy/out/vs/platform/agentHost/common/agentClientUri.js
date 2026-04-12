/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
/**
 * The URI scheme for accessing client-side files from the agent host.
 *
 * This is the inverse of {@link AGENT_HOST_SCHEME}: the agent host uses
 * this scheme to address files that live on the connected client.
 *
 * ```
 * vscode-agent-client://[clientId]/[originalScheme]/[originalAuthority]/[originalPath]
 * ```
 *
 * For example, `file:///Users/user/plugins/my-plugin` on client `client-1` becomes:
 * ```
 * vscode-agent-client://client-1/file/-/Users/user/plugins/my-plugin
 * ```
 */
export const AGENT_CLIENT_SCHEME = 'vscode-agent-client';
/**
 * Wraps a client-side URI into a {@link AGENT_CLIENT_SCHEME} URI that
 * can be resolved through the agent host's client filesystem provider.
 *
 * @param originalUri The URI on the client (e.g. `file:///path`)
 * @param clientId The client identifier (from the protocol `clientId`)
 */
export function toAgentClientUri(originalUri, clientId) {
    const originalAuthority = originalUri.authority || '-';
    return URI.from({
        scheme: AGENT_CLIENT_SCHEME,
        authority: clientId,
        path: `/${originalUri.scheme}/${originalAuthority}${originalUri.path}`,
    });
}
/**
 * Extracts the original client-side URI from a {@link AGENT_CLIENT_SCHEME} URI.
 *
 * The inverse of {@link toAgentClientUri}.
 */
export function fromAgentClientUri(agentClientUri) {
    const path = agentClientUri.path;
    const schemeEnd = path.indexOf('/', 1);
    if (schemeEnd === -1) {
        return URI.from({ scheme: 'file', path });
    }
    const originalScheme = path.substring(1, schemeEnd);
    const authorityEnd = path.indexOf('/', schemeEnd + 1);
    if (authorityEnd === -1) {
        const originalAuthority = path.substring(schemeEnd + 1);
        return URI.from({ scheme: originalScheme, authority: originalAuthority === '-' ? '' : originalAuthority, path: '/' });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRDbGllbnRVcmkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50Q2xpZW50VXJpLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVsRDs7Ozs7Ozs7Ozs7Ozs7R0FjRztBQUNILE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLHFCQUFxQixDQUFDO0FBRXpEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxXQUFnQixFQUFFLFFBQWdCO0lBQ2xFLE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDLFNBQVMsSUFBSSxHQUFHLENBQUM7SUFDdkQsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDO1FBQ2YsTUFBTSxFQUFFLG1CQUFtQjtRQUMzQixTQUFTLEVBQUUsUUFBUTtRQUNuQixJQUFJLEVBQUUsSUFBSSxXQUFXLENBQUMsTUFBTSxJQUFJLGlCQUFpQixHQUFHLFdBQVcsQ0FBQyxJQUFJLEVBQUU7S0FDdEUsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsY0FBbUI7SUFDckQsTUFBTSxJQUFJLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQztJQUVqQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2QyxJQUFJLFNBQVMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3RCLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFFcEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsU0FBUyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3RELElBQUksWUFBWSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDekIsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN4RCxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxpQkFBaUIsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDdkgsQ0FBQztJQUVELElBQUksaUJBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3BFLElBQUksaUJBQWlCLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDL0IsaUJBQWlCLEdBQUcsRUFBRSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBRWxELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQztRQUNmLE1BQU0sRUFBRSxjQUFjO1FBQ3RCLFNBQVMsRUFBRSxpQkFBaUIsSUFBSSxTQUFTO1FBQ3pDLElBQUksRUFBRSxZQUFZO0tBQ2xCLENBQUMsQ0FBQztBQUNKLENBQUMifQ==