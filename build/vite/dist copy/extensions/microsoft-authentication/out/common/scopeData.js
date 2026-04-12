"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScopeData = void 0;
const DEFAULT_CLIENT_ID = 'aebc6443-996d-45c2-90f0-388ff96faa56';
const DEFAULT_TENANT = 'organizations';
const OIDC_SCOPES = ['openid', 'email', 'profile', 'offline_access'];
const GRAPH_TACK_ON_SCOPE = 'User.Read';
class ScopeData {
    originalScopes;
    /**
     * The full list of scopes including:
     * * the original scopes passed to the constructor
     * * internal VS Code scopes (e.g. `VSCODE_CLIENT_ID:...`)
     * * the default scopes (`openid`, `email`, `profile`, `offline_access`)
     */
    allScopes;
    /**
     * The full list of scopes as a space-separated string. For logging.
     */
    scopeStr;
    /**
     * The list of scopes to send to the token endpoint. This is the same as `scopes` but without the internal VS Code scopes.
     */
    scopesToSend;
    /**
     * The client ID to use for the token request. This is the value of the `VSCODE_CLIENT_ID:...` scope if present, otherwise the default client ID.
     */
    clientId;
    /**
     * The tenant ID or `organizations`, `common`, `consumers` to use for the token request. This is the value of the `VSCODE_TENANT:...` scope if present, otherwise it's the default.
     */
    tenant;
    /**
     * The tenant ID to use for the token request. This will only ever be a GUID if one was specified via the `VSCODE_TENANT:...` scope, otherwise undefined.
     */
    tenantId;
    /**
     * The claims to include in the token request.
     */
    claims;
    constructor(originalScopes = [], claims, authorizationServer) {
        this.originalScopes = originalScopes;
        const modifiedScopes = [...originalScopes];
        modifiedScopes.sort();
        this.allScopes = modifiedScopes;
        this.scopeStr = modifiedScopes.join(' ');
        this.claims = claims;
        this.scopesToSend = this.getScopesToSend(modifiedScopes);
        this.clientId = this.getClientId(this.allScopes);
        this.tenant = this.getTenant(this.allScopes, authorizationServer);
        this.tenantId = this.getTenantId(this.tenant);
    }
    getClientId(scopes) {
        return scopes.reduce((prev, current) => {
            if (current.startsWith('VSCODE_CLIENT_ID:')) {
                return current.split('VSCODE_CLIENT_ID:')[1];
            }
            return prev;
        }, undefined) ?? DEFAULT_CLIENT_ID;
    }
    getTenant(scopes, authorizationServer) {
        if (authorizationServer?.path) {
            // Get tenant portion of URL
            const tenant = authorizationServer.path.split('/')[1];
            if (tenant) {
                return tenant;
            }
        }
        return scopes.reduce((prev, current) => {
            if (current.startsWith('VSCODE_TENANT:')) {
                return current.split('VSCODE_TENANT:')[1];
            }
            return prev;
        }, undefined) ?? DEFAULT_TENANT;
    }
    getTenantId(tenant) {
        switch (tenant) {
            case 'organizations':
            case 'common':
            case 'consumers':
                // These are not valid tenant IDs, so we return undefined
                return undefined;
            default:
                return this.tenant;
        }
    }
    getScopesToSend(scopes) {
        const scopesToSend = scopes.filter(s => !s.startsWith('VSCODE_'));
        const set = new Set(scopesToSend);
        for (const scope of OIDC_SCOPES) {
            set.delete(scope);
        }
        // If we only had OIDC scopes, we need to add a tack-on scope to make the request valid
        // by forcing Identity into treating this as a Graph token request.
        if (!set.size) {
            scopesToSend.push(GRAPH_TACK_ON_SCOPE);
        }
        return scopesToSend;
    }
}
exports.ScopeData = ScopeData;
//# sourceMappingURL=scopeData.js.map