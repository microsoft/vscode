/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../../base/common/uri.js';
/**
 * Resolves a bearer token for a protected resource by trying each
 * authorization server in order. First attempts an exact scope match,
 * then falls back to finding the session whose scopes are the narrowest
 * superset of the requested scopes.
 */
export async function resolveTokenForResource(resourceServer, authorizationServers, scopes, authenticationService, logService, logPrefix) {
    for (const server of authorizationServers) {
        const serverUri = URI.parse(server);
        const providerId = await authenticationService.getOrActivateProviderIdForServer(serverUri, resourceServer);
        if (!providerId) {
            logService.trace(`${logPrefix} No auth provider found for server: ${server}`);
            continue;
        }
        logService.trace(`${logPrefix} Resolved auth provider '${providerId}' for server: ${server}`);
        // Try exact scope match first
        const sessions = await authenticationService.getSessions(providerId, [...scopes], { authorizationServer: serverUri }, true);
        if (sessions.length > 0) {
            return sessions[0].accessToken;
        }
        // Fall back: get all sessions and find the narrowest superset of requested scopes
        const allSessions = await authenticationService.getSessions(providerId, undefined, { authorizationServer: serverUri }, true);
        const requestedSet = new Set(scopes);
        let bestToken;
        let bestExtraScopes = Infinity;
        for (const session of allSessions) {
            const sessionScopes = new Set(session.scopes);
            let isSuperset = true;
            for (const scope of requestedSet) {
                if (!sessionScopes.has(scope)) {
                    isSuperset = false;
                    break;
                }
            }
            if (isSuperset) {
                const extraScopes = sessionScopes.size - requestedSet.size;
                if (extraScopes < bestExtraScopes) {
                    bestExtraScopes = extraScopes;
                    bestToken = session.accessToken;
                }
            }
        }
        if (bestToken) {
            return bestToken;
        }
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0QXV0aC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBdXRoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUkzRDs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxLQUFLLFVBQVUsdUJBQXVCLENBQzVDLGNBQW1CLEVBQ25CLG9CQUF1QyxFQUN2QyxNQUF5QixFQUN6QixxQkFBNkMsRUFDN0MsVUFBdUIsRUFDdkIsU0FBaUI7SUFFakIsS0FBSyxNQUFNLE1BQU0sSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1FBQzNDLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEMsTUFBTSxVQUFVLEdBQUcsTUFBTSxxQkFBcUIsQ0FBQyxnQ0FBZ0MsQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDM0csSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pCLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxTQUFTLHVDQUF1QyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1lBQzlFLFNBQVM7UUFDVixDQUFDO1FBQ0QsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsNEJBQTRCLFVBQVUsaUJBQWlCLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFOUYsOEJBQThCO1FBQzlCLE1BQU0sUUFBUSxHQUFHLE1BQU0scUJBQXFCLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUUsRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1SCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDekIsT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBQ2hDLENBQUM7UUFFRCxrRkFBa0Y7UUFDbEYsTUFBTSxXQUFXLEdBQUcsTUFBTSxxQkFBcUIsQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLFNBQVMsRUFBRSxFQUFFLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdILE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JDLElBQUksU0FBNkIsQ0FBQztRQUNsQyxJQUFJLGVBQWUsR0FBRyxRQUFRLENBQUM7UUFDL0IsS0FBSyxNQUFNLE9BQU8sSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNuQyxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDOUMsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDO1lBQ3RCLEtBQUssTUFBTSxLQUFLLElBQUksWUFBWSxFQUFFLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQy9CLFVBQVUsR0FBRyxLQUFLLENBQUM7b0JBQ25CLE1BQU07Z0JBQ1AsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixNQUFNLFdBQVcsR0FBRyxhQUFhLENBQUMsSUFBSSxHQUFHLFlBQVksQ0FBQyxJQUFJLENBQUM7Z0JBQzNELElBQUksV0FBVyxHQUFHLGVBQWUsRUFBRSxDQUFDO29CQUNuQyxlQUFlLEdBQUcsV0FBVyxDQUFDO29CQUM5QixTQUFTLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQztnQkFDakMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0lBQ0QsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQyJ9