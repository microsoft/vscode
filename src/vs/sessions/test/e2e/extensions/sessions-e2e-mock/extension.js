/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/// <reference types="vscode" />

/**
 * Mock extension for Sessions E2E testing.
 *
 * Provides a fake GitHub authentication provider (skips sign-in).
 *
 * The mock-fs:// FileSystemProvider and chat agents are registered
 * directly in the workbench (web.test.ts), not here.
 */

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
	const vscode = require('vscode');

	console.log('[sessions-e2e-mock] Activating mock extension');

	// 1. Mock GitHub Authentication Provider
	context.subscriptions.push(registerMockAuth(vscode));

	// Note: The mock-fs:// FileSystemProvider is registered directly in the
	// workbench (web.test.ts → registerMockFileSystemProvider) so it is
	// available before any service tries to resolve workspace files.
	// Do NOT register it here — it would cause a duplicate provider error.

	console.log('[sessions-e2e-mock] All mocks registered');
}

// ---------------------------------------------------------------------------
// Mock Authentication Provider
// ---------------------------------------------------------------------------

/**
 * @param {typeof import('vscode')} vscode
 * @returns {import('vscode').Disposable}
 */
function registerMockAuth(vscode) {
	const sessionChangeEmitter = new vscode.EventEmitter();

	/** @type {import('vscode').AuthenticationSession} */
	const mockSession = {
		id: 'mock-session-1',
		accessToken: 'gho_mock_e2e_test_token_00000000000000000000',
		account: {
			id: 'e2e-test-user',
			label: 'E2E Test User',
		},
		scopes: ['read:user', 'repo', 'workflow'],
	};

	/** @type {import('vscode').AuthenticationProvider} */
	const provider = {
		onDidChangeSessions: sessionChangeEmitter.event,
		async getSessions(_scopes, _options) {
			return [mockSession];
		},
		async createSession(_scopes, _options) {
			sessionChangeEmitter.fire({ added: [mockSession], removed: [], changed: [] });
			return mockSession;
		},
		async removeSession(_sessionId) {
			sessionChangeEmitter.fire({ added: [], removed: [mockSession], changed: [] });
		},
	};

	console.log('[sessions-e2e-mock] Registering mock GitHub auth provider');
	return vscode.authentication.registerAuthenticationProvider('github', 'GitHub (Mock)', provider, {
		supportsMultipleAccounts: false,
	});
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { activate };
