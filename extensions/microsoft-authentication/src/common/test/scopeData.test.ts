/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ScopeData } from '../scopeData';
import { Uri } from 'vscode';

suite('ScopeData', () => {
	test('should include default scopes if not present', () => {
		const scopeData = new ScopeData(['custom_scope']);
		assert.deepStrictEqual(scopeData.allScopes, ['custom_scope']);
	});

	test('should not duplicate default scopes if already present', () => {
		const scopeData = new ScopeData(['custom_scope', 'openid', 'email', 'profile', 'offline_access']);
		assert.deepStrictEqual(scopeData.allScopes, ['custom_scope', 'email', 'offline_access', 'openid', 'profile']);
	});

	test('should sort the scopes alphabetically', () => {
		const scopeData = new ScopeData(['custom_scope', 'profile', 'email', 'openid', 'offline_access']);
		assert.deepStrictEqual(scopeData.allScopes, ['custom_scope', 'email', 'offline_access', 'openid', 'profile']);
	});

	test('should create a space-separated string of all scopes', () => {
		const scopeData = new ScopeData(['custom_scope', 'openid', 'email', 'offline_access', 'profile']);
		assert.strictEqual(scopeData.scopeStr, 'custom_scope email offline_access openid profile');
	});

	test('should add TACK ON scope if all scopes are OIDC scopes', () => {
		const scopeData = new ScopeData(['openid', 'email', 'offline_access', 'profile']);
		assert.deepStrictEqual(scopeData.scopesToSend, ['email', 'offline_access', 'openid', 'profile', 'User.Read']);
	});

	test('should filter out internal VS Code scopes for scopesToSend', () => {
		const scopeData = new ScopeData(['custom_scope', 'VSCODE_CLIENT_ID:some_id']);
		assert.deepStrictEqual(scopeData.scopesToSend, ['custom_scope']);
	});

	test('should use the default client ID if no VSCODE_CLIENT_ID scope is present', () => {
		const scopeData = new ScopeData(['custom_scope']);
		assert.strictEqual(scopeData.clientId, 'aebc6443-996d-45c2-90f0-388ff96faa56');
	});

	test('should use the VSCODE_CLIENT_ID scope if present', () => {
		const scopeData = new ScopeData(['custom_scope', 'VSCODE_CLIENT_ID:some_id']);
		assert.strictEqual(scopeData.clientId, 'some_id');
	});

	test('should use the default tenant ID if no VSCODE_TENANT scope is present', () => {
		const scopeData = new ScopeData(['custom_scope']);
		assert.strictEqual(scopeData.tenant, 'organizations');
	});

	test('should use the VSCODE_TENANT scope if present', () => {
		const scopeData = new ScopeData(['custom_scope', 'VSCODE_TENANT:some_tenant']);
		assert.strictEqual(scopeData.tenant, 'some_tenant');
	});

	test('should have tenantId be undefined if no VSCODE_TENANT scope is present', () => {
		const scopeData = new ScopeData(['custom_scope']);
		assert.strictEqual(scopeData.tenantId, undefined);
	});

	test('should have tenantId be undefined if typical tenant values are present', () => {
		for (const element of ['common', 'organizations', 'consumers']) {
			const scopeData = new ScopeData(['custom_scope', `VSCODE_TENANT:${element}`]);
			assert.strictEqual(scopeData.tenantId, undefined);
		}
	});

	test('should have tenantId be the value of VSCODE_TENANT scope if set to a specific value', () => {
		const scopeData = new ScopeData(['custom_scope', 'VSCODE_TENANT:some_guid']);
		assert.strictEqual(scopeData.tenantId, 'some_guid');
	});

	test('should extract tenant from issuer URL path', () => {
		const issuer = Uri.parse('https://login.microsoftonline.com/tenant123/oauth2/v2.0');
		const scopeData = new ScopeData(['custom_scope'], issuer);
		assert.strictEqual(scopeData.tenant, 'tenant123');
	});

	test('should fallback to default tenant if issuer URL has no path segments', () => {
		const issuer = Uri.parse('https://login.microsoftonline.com');
		const scopeData = new ScopeData(['custom_scope'], issuer);
		assert.strictEqual(scopeData.tenant, 'organizations');
	});

	test('should prioritize issuer URL over VSCODE_TENANT scope', () => {
		const issuer = Uri.parse('https://login.microsoftonline.com/url_tenant/oauth2/v2.0');
		const scopeData = new ScopeData(['custom_scope', 'VSCODE_TENANT:scope_tenant'], issuer);
		assert.strictEqual(scopeData.tenant, 'url_tenant');
	});
});
