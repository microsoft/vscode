/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AuthenticationProviderRegistration } from '../common/authenticationProviderRegistration';

suite('Authentication provider registration', () => {
	const disposables: vscode.Disposable[] = [];
	teardown(() => {
		disposables.splice(0).reverse().forEach(disposable => disposable.dispose());
		sinon.restore();
	});

	function createProvider() {
		const events = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
		disposables.push(events);
		const session: vscode.AuthenticationSession = { id: 'saved', account: { id: 'account', label: 'Account' }, accessToken: 'fake-token', scopes: ['repo'] };
		const provider: vscode.AuthenticationProvider = {
			onDidChangeSessions: events.event,
			getSessions: async () => [session],
			createSession: async () => session,
			removeSession: async () => { }
		};
		return { events, provider, session };
	}

	test('buffers configuration changes until registration subscribes, without querying sessions', async () => {
		sinon.stub(vscode.authentication, 'registerAuthenticationProvider').returns(new vscode.Disposable(() => { }));
		const { events, provider, session } = createProvider();
		const reads = sinon.spy(provider, 'getSessions');
		const registration = new AuthenticationProviderRegistration('test-registration', 'Test', provider, {});
		disposables.push(registration);
		const change = { added: [session], removed: [], changed: [] };
		events.fire(change);
		const received: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(registration.onDidChangeSessions(event => received.push(event)));
		assert.deepStrictEqual(received, []);
		await Promise.resolve();
		assert.deepStrictEqual({ received, reads: reads.callCount, registered: await registration.whenRegistered }, { received: [change], reads: 0, registered: true });
	});

	test('disposal drops pending events and detaches the source listener', async () => {
		sinon.stub(vscode.authentication, 'registerAuthenticationProvider').returns(new vscode.Disposable(() => { }));
		const { events, provider, session } = createProvider();
		const registration = new AuthenticationProviderRegistration('test-disposed-registration', 'Test', provider, {});
		disposables.push(registration);
		events.fire({ added: [session], removed: [], changed: [] });
		const received: vscode.AuthenticationProviderAuthenticationSessionsChangeEvent[] = [];
		disposables.push(registration.onDidChangeSessions(event => received.push(event)));
		registration.dispose();
		events.fire({ added: [], removed: [session], changed: [] });
		await Promise.resolve();
		assert.deepStrictEqual({ received, registered: await registration.whenRegistered }, { received: [], registered: false });
	});

	test('initial session changes cross the real authentication RPC without a client read', async () => {
		const { events, provider, session } = createProvider();
		const id = 'github-enterprise-registration-test';
		const notification = new Promise<string>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Session notification was not delivered')), 5000);
			disposables.push(new vscode.Disposable(() => clearTimeout(timeout)));
			disposables.push(vscode.authentication.onDidChangeSessions(event => {
				if (event.provider.id === id) {
					resolve(event.provider.id);
				}
			}));
		});
		const registration = new AuthenticationProviderRegistration(id, 'Registration Test', provider, { supportsMultipleAccounts: true });
		disposables.push(registration);
		events.fire({ added: [session], removed: [], changed: [] });
		assert.strictEqual(await notification, id);
	});
});
