"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const scopeData_1 = require("../scopeData");
const vscode_1 = require("vscode");
suite('ScopeData', () => {
    test('should include default scopes if not present', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope']);
        assert.deepStrictEqual(scopeData.allScopes, ['custom_scope']);
    });
    test('should not duplicate default scopes if already present', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'openid', 'email', 'profile', 'offline_access']);
        assert.deepStrictEqual(scopeData.allScopes, ['custom_scope', 'email', 'offline_access', 'openid', 'profile']);
    });
    test('should sort the scopes alphabetically', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'profile', 'email', 'openid', 'offline_access']);
        assert.deepStrictEqual(scopeData.allScopes, ['custom_scope', 'email', 'offline_access', 'openid', 'profile']);
    });
    test('should create a space-separated string of all scopes', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'openid', 'email', 'offline_access', 'profile']);
        assert.strictEqual(scopeData.scopeStr, 'custom_scope email offline_access openid profile');
    });
    test('should add TACK ON scope if all scopes are OIDC scopes', () => {
        const scopeData = new scopeData_1.ScopeData(['openid', 'email', 'offline_access', 'profile']);
        assert.deepStrictEqual(scopeData.scopesToSend, ['email', 'offline_access', 'openid', 'profile', 'User.Read']);
    });
    test('should filter out internal VS Code scopes for scopesToSend', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'VSCODE_CLIENT_ID:some_id']);
        assert.deepStrictEqual(scopeData.scopesToSend, ['custom_scope']);
    });
    test('should use the default client ID if no VSCODE_CLIENT_ID scope is present', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope']);
        assert.strictEqual(scopeData.clientId, 'aebc6443-996d-45c2-90f0-388ff96faa56');
    });
    test('should use the VSCODE_CLIENT_ID scope if present', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'VSCODE_CLIENT_ID:some_id']);
        assert.strictEqual(scopeData.clientId, 'some_id');
    });
    test('should use the default tenant ID if no VSCODE_TENANT scope is present', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope']);
        assert.strictEqual(scopeData.tenant, 'organizations');
    });
    test('should use the VSCODE_TENANT scope if present', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'VSCODE_TENANT:some_tenant']);
        assert.strictEqual(scopeData.tenant, 'some_tenant');
    });
    test('should have tenantId be undefined if no VSCODE_TENANT scope is present', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope']);
        assert.strictEqual(scopeData.tenantId, undefined);
    });
    test('should have tenantId be undefined if typical tenant values are present', () => {
        for (const element of ['common', 'organizations', 'consumers']) {
            const scopeData = new scopeData_1.ScopeData(['custom_scope', `VSCODE_TENANT:${element}`]);
            assert.strictEqual(scopeData.tenantId, undefined);
        }
    });
    test('should have tenantId be the value of VSCODE_TENANT scope if set to a specific value', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'VSCODE_TENANT:some_guid']);
        assert.strictEqual(scopeData.tenantId, 'some_guid');
    });
    test('should not return claims', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope']);
        assert.strictEqual(scopeData.claims, undefined);
    });
    test('should return claims', () => {
        const scopeData = new scopeData_1.ScopeData(['custom_scope'], 'test');
        assert.strictEqual(scopeData.claims, 'test');
    });
    test('should extract tenant from authorization server URL path', () => {
        const authorizationServer = vscode_1.Uri.parse('https://login.microsoftonline.com/tenant123/oauth2/v2.0');
        const scopeData = new scopeData_1.ScopeData(['custom_scope'], undefined, authorizationServer);
        assert.strictEqual(scopeData.tenant, 'tenant123');
    });
    test('should fallback to default tenant if authorization server URL has no path segments', () => {
        const authorizationServer = vscode_1.Uri.parse('https://login.microsoftonline.com');
        const scopeData = new scopeData_1.ScopeData(['custom_scope'], undefined, authorizationServer);
        assert.strictEqual(scopeData.tenant, 'organizations');
    });
    test('should prioritize authorization server URL over VSCODE_TENANT scope', () => {
        const authorizationServer = vscode_1.Uri.parse('https://login.microsoftonline.com/url_tenant/oauth2/v2.0');
        const scopeData = new scopeData_1.ScopeData(['custom_scope', 'VSCODE_TENANT:scope_tenant'], undefined, authorizationServer);
        assert.strictEqual(scopeData.tenant, 'url_tenant');
    });
    test('should extract tenant from v1.0 authorization server URL path', () => {
        const authorizationServer = vscode_1.Uri.parse('https://login.microsoftonline.com/tenant123');
        const scopeData = new scopeData_1.ScopeData(['custom_scope'], undefined, authorizationServer);
        assert.strictEqual(scopeData.tenant, 'tenant123');
    });
});
//# sourceMappingURL=scopeData.test.js.map