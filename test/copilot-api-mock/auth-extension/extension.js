/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/// <reference types="vscode" />

/**
 * Mock GitHub authentication provider for validating enterprise-managed plugins
 * against Code OSS. Hands the workbench a static `github` session so the
 * default-account flow resolves offline — no real sign-in, no network.
 *
 * Pattern reused from src/vs/sessions/test/e2e/extensions/sessions-e2e-mock.
 *
 * IMPORTANT: the account label must NOT contain `_` — core treats an
 * underscore in the label as an enterprise (EMU) account and switches to the
 * `api.<enterprise-host>` URL derivation, bypassing the mock.
 *
 * Launch with the built-in provider disabled so this one owns the `github` id:
 *   ./scripts/code.sh \
 *     --disable-extension vscode.github-authentication \
 *     --extensionDevelopmentPath=<repo>/test/copilot-api-mock/auth-extension
 *
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
	const vscode = require('vscode');
	const sessionChangeEmitter = new vscode.EventEmitter();

	/** @type {import('vscode').AuthenticationSession} */
	const mockSession = {
		id: 'copilot-api-mock-session',
		accessToken: 'copilot-api-mock-token',
		account: {
			id: 'copilot-api-mock',
			label: 'copilot-api-mock',
		},
		// Superset of every set in product.json defaultChatAgent.providerScopes,
		// so core's scopesMatch() succeeds for whichever set it requests.
		scopes: ['read:user', 'user:email', 'repo', 'workflow'],
	};

	/** @type {import('vscode').AuthenticationProvider} */
	const provider = {
		onDidChangeSessions: sessionChangeEmitter.event,
		async getSessions() {
			return [mockSession];
		},
		async createSession() {
			sessionChangeEmitter.fire({ added: [mockSession], removed: [], changed: [] });
			return mockSession;
		},
		async removeSession() {
			sessionChangeEmitter.fire({ added: [], removed: [mockSession], changed: [] });
		},
	};

	context.subscriptions.push(
		vscode.authentication.registerAuthenticationProvider('github', 'GitHub (Mock)', provider, {
			supportsMultipleAccounts: false,
		})
	);

	// Announce the session so the default-account flow resolves promptly.
	sessionChangeEmitter.fire({ added: [mockSession], removed: [], changed: [] });
	console.log('[copilot-api-mock] mock GitHub auth provider registered');
}

function deactivate() { }

module.exports = { activate, deactivate };
