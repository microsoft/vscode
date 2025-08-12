/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { DeferredPromise } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { TestExtensionContext, TestItem } from '../../contrib/testing/common/testTypes.js';
import { ExtHostAuthentication } from '../common/extHostAuthentication.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { MainThreadAuthenticationShape } from '../common/extHost.protocol.js';

/**
 * Test to validate authentication challenges integration.
 * This demonstrates how the new challenge-based authentication API works.
 */
suite('Authentication Challenges Integration', () => {
	const disposables = new DisposableStore();
	let extHostAuthentication: ExtHostAuthentication;
	let mockMainThreadAuth: MockMainThreadAuthentication;
	
	const extensionDescription: IExtensionDescription = {
		identifier: { value: 'test-extension' },
		name: 'Test Extension',
		displayName: 'Test Extension',
		version: '1.0.0',
		publisher: 'test',
		isBuiltin: false,
		isUserBuiltin: false,
		isUnderDevelopment: false,
		extensionLocation: vscode.Uri.parse('test://extension'),
		engines: { vscode: '*' },
		enabledApiProposals: ['authenticationChallenges'],
		extensionDependencies: [],
		activationEvents: [],
		main: '',
		targetPlatform: 'universal'
	} as IExtensionDescription;

	setup(() => {
		mockMainThreadAuth = new MockMainThreadAuthentication();
		extHostAuthentication = new ExtHostAuthentication(
			{} as any, // rpc service
			{} as any, // init data service  
			{} as any, // window service
			{} as any, // urls service
			{} as any, // progress service
			{} as any, // logger service
			{} as any  // log service
		);
		
		// Replace the proxy with our mock
		(extHostAuthentication as any)._proxy = mockMainThreadAuth;
	});

	teardown(() => {
		disposables.clear();
	});

	test('getSession with WWW-Authenticate challenge for insufficient claims', async () => {
		// Simulate a scenario where an API returns 401 with WWW-Authenticate header
		const wwwAuthenticateHeader = 'Bearer realm="", authorization_uri="https://login.microsoftonline.com/common/oauth2/authorize", error="insufficient_claims", claims="eyJhY2Nlc3NfdG9rZW4iOnsiYWNycyI6eyJlc3NlbnRpYWwiOnRydWUsInZhbHVlcyI6WyJwMSJdfX19"';
		
		const challenge: vscode.AuthenticationSessionChallenge = {
			challenge: wwwAuthenticateHeader,
			scopes: ['https://graph.microsoft.com/User.Read']
		};

		// Mock a successful session creation from challenge
		const expectedSession: vscode.AuthenticationSession = {
			id: 'challenge-session-1',
			accessToken: 'access-token-with-mfa-claims',
			account: {
				id: 'user-123',
				label: 'test@example.com'
			},
			scopes: ['https://graph.microsoft.com/User.Read']
		};

		mockMainThreadAuth.setNextSessionFromChallenge(expectedSession);

		// Test the challenge-based getSession API
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'microsoft',
			challenge,
			{ createIfNone: true }
		);

		assert.strictEqual(session.id, expectedSession.id);
		assert.strictEqual(session.accessToken, expectedSession.accessToken);
		assert.strictEqual(session.account.id, expectedSession.account.id);
		assert.strictEqual(session.scopes[0], expectedSession.scopes[0]);

		// Verify that the challenge was parsed and passed correctly
		const lastChallengeCall = mockMainThreadAuth.getLastChallengeCall();
		assert.ok(lastChallengeCall);
		assert.strictEqual(lastChallengeCall.challenge.challenge, wwwAuthenticateHeader);
		assert.deepStrictEqual(lastChallengeCall.challenge.scopes, ['https://graph.microsoft.com/User.Read']);
	});

	test('getSession falls back to regular authentication when challenge is not supported', async () => {
		const challenge: vscode.AuthenticationSessionChallenge = {
			challenge: 'Bearer scope="https://graph.microsoft.com/.default"',
			scopes: ['https://graph.microsoft.com/User.Read']
		};

		// Mock that challenge-based session creation fails
		mockMainThreadAuth.setChallengeSessionError(new Error('Challenge not supported'));

		// Mock regular session creation succeeds
		const expectedSession: vscode.AuthenticationSession = {
			id: 'regular-session-1',
			accessToken: 'regular-access-token',
			account: {
				id: 'user-123',
				label: 'test@example.com'
			},
			scopes: ['https://graph.microsoft.com/User.Read']
		};

		mockMainThreadAuth.setNextSession(expectedSession);

		// This should fall back to regular authentication
		const session = await extHostAuthentication.getSession(
			extensionDescription,
			'microsoft',
			challenge,
			{ createIfNone: true }
		);

		assert.strictEqual(session.id, expectedSession.id);
		assert.strictEqual(session.accessToken, expectedSession.accessToken);
	});
});

class MockMainThreadAuthentication implements MainThreadAuthenticationShape {
	private nextSession?: vscode.AuthenticationSession;
	private nextSessionFromChallenge?: vscode.AuthenticationSession;
	private challengeSessionError?: Error;
	private lastChallengeCall?: { challenge: vscode.AuthenticationSessionChallenge; options: any };

	setNextSession(session: vscode.AuthenticationSession) {
		this.nextSession = session;
	}

	setNextSessionFromChallenge(session: vscode.AuthenticationSession) {
		this.nextSessionFromChallenge = session;
	}

	setChallengeSessionError(error: Error) {
		this.challengeSessionError = error;
	}

	getLastChallengeCall() {
		return this.lastChallengeCall;
	}

	async $getSession(): Promise<vscode.AuthenticationSession | undefined> {
		const session = this.nextSession;
		this.nextSession = undefined;
		return session;
	}

	async $getSessionFromChallenge(providerId: string, challenge: any, extensionId: string, extensionName: string, options: any): Promise<vscode.AuthenticationSession | undefined> {
		this.lastChallengeCall = { challenge, options };
		
		if (this.challengeSessionError) {
			const error = this.challengeSessionError;
			this.challengeSessionError = undefined;
			throw error;
		}

		const session = this.nextSessionFromChallenge;
		this.nextSessionFromChallenge = undefined;
		return session;
	}

	// Other required methods - simplified implementations
	async $registerAuthenticationProvider(): Promise<void> {}
	async $unregisterAuthenticationProvider(): Promise<void> {}
	async $ensureProvider(): Promise<void> {}
	async $sendDidChangeSessions(): Promise<void> {}
	async $getAccounts(): Promise<ReadonlyArray<vscode.AuthenticationSessionAccount>> { return []; }
	async $removeSession(): Promise<void> {}
	async $waitForUriHandler(): Promise<any> { return {}; }
	async $showContinueNotification(): Promise<boolean> { return true; }
	async $showDeviceCodeModal(): Promise<boolean> { return true; }
	async $promptForClientRegistration(): Promise<any> { return undefined; }
	async $registerDynamicAuthenticationProvider(): Promise<void> {}
	async $setSessionsForDynamicAuthProvider(): Promise<void> {}
	async $sendDidChangeDynamicProviderInfo(): Promise<void> {}
	dispose(): void {}
}