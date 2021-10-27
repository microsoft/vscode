/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IQuickInputHideEvent, IQuickInputService, IQuickPickDidAcceptEvent } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { MainThreadAuthentication } from 'vs/workbench/api/browser/mainThreadAuthentication';
import { ExtHostContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostAuthentication } from 'vs/workbench/api/common/extHostAuthentication';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { AuthenticationService, IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TestRemoteAgentService } from 'vs/workbench/services/remote/test/common/testServices';
import { TestRPCProtocol } from 'vs/workbench/test/browser/api/testRPCProtocol';
import { TestQuickInputService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestActivityService, TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import type { AuthenticationProvider, AuthenticationSession } from 'vscode';

class AuthQuickPick {
	private listener: ((e: IQuickPickDidAcceptEvent) => any) | undefined;
	public items = [];
	public get selectedItems(): string[] {
		return this.items;
	}

	onDidAccept(listener: (e: IQuickPickDidAcceptEvent) => any) {
		this.listener = listener;
	}
	onDidHide(listener: (e: IQuickInputHideEvent) => any) {

	}
	dispose() {

	}
	show() {
		this.listener!({
			inBackground: false
		});
	}
}
class AuthTestQuickInputService extends TestQuickInputService {
	override createQuickPick() {
		return <any>new AuthQuickPick();
	}
}

class TestAuthProvider implements AuthenticationProvider {
	private sessions = new Map<string, AuthenticationSession>();
	onDidChangeSessions = () => { return { dispose() { } }; };
	async getSessions(scopes?: readonly string[]): Promise<AuthenticationSession[]> {
		if (!scopes) {
			return [...this.sessions.values()];
		}

		const sessions = this.sessions.get(scopes.join(' '));
		return sessions ? [sessions] : [];
	}
	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {
		const scopesStr = scopes.join(' ');
		const session = {
			scopes,
			id: 'test',
			account: {
				label: scopesStr,
				id: scopesStr,
			},
			accessToken: Math.random() + '',
		};
		this.sessions.set(scopesStr, session);
		return session;
	}
	async removeSession(sessionId: string): Promise<void> {
		this.sessions.delete(sessionId);
	}

}

suite('ExtHostAuthentication', () => {
	let disposables: DisposableStore;
	let nullExtensionDescription: IExtensionDescription = {
		identifier: new ExtensionIdentifier('nullExtensionDescription'),
		name: 'Null Extension Description',
		publisher: 'vscode',
		enableProposedApi: true,
		engines: undefined!,
		extensionLocation: undefined!,
		isBuiltin: false,
		isUserBuiltin: false,
		isUnderDevelopment: false,
		version: undefined!
	};

	let extHostAuthentication: ExtHostAuthentication;
	let instantiationService: TestInstantiationService;

	suiteSetup(async () => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IDialogService, new TestDialogService());
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IQuickInputService, new AuthTestQuickInputService());
		instantiationService.stub(IExtensionService, new TestExtensionService());

		instantiationService.stub(IActivityService, new TestActivityService());
		instantiationService.stub(IRemoteAgentService, new TestRemoteAgentService());
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const rpcProtocol = new TestRPCProtocol();

		instantiationService.stub(IAuthenticationService, instantiationService.createInstance(AuthenticationService));
		rpcProtocol.set(MainContext.MainThreadAuthentication, instantiationService.createInstance(MainThreadAuthentication, rpcProtocol));
		extHostAuthentication = new ExtHostAuthentication(rpcProtocol);
		rpcProtocol.set(ExtHostContext.ExtHostAuthentication, extHostAuthentication);
	});

	setup(async () => {
		disposables = new DisposableStore();
		disposables.add(extHostAuthentication.registerAuthenticationProvider('test', 'test provider', new TestAuthProvider()));
		disposables.add(extHostAuthentication.registerAuthenticationProvider(
			'test-multiple',
			'test multiple provider',
			new TestAuthProvider(),
			{ supportsMultipleAccounts: true }));
	});

	teardown(() => {
		disposables.dispose();
	});

	test('createIfNone - true', async () => {
		const session = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});
		assert.strictEqual(session?.id, 'test');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('createIfNone - false', async () => {
		const nosession = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{});
		assert.strictEqual(nosession, undefined);

		// Now create the session
		const session = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, 'test');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{});

		assert.strictEqual(session.id, session2?.id);
		assert.strictEqual(session.scopes[0], session2?.scopes[0]);
		assert.strictEqual(session.accessToken, session2?.accessToken);
	});

	// should behave the same as createIfNone: false
	test('silent - true', async () => {
		const nosession = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				silent: true
			});
		assert.strictEqual(nosession, undefined);

		// Now create the session
		const session = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, 'test');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				silent: true
			});

		assert.strictEqual(session.id, session2?.id);
		assert.strictEqual(session.scopes[0], session2?.scopes[0]);
	});

	test('forceNewSession - true', async () => {
		const session1 = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});

		// Now create the session
		const session2 = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				forceNewSession: true
			});

		assert.strictEqual(session2?.id, 'test');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.notStrictEqual(session1.accessToken, session2?.accessToken);
	});

	test('forceNewSession - detail', async () => {
		const session1 = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				createIfNone: true
			});

		// Now create the session
		const session2 = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test',
			['foo'],
			{
				forceNewSession: { detail: 'bar' }
			});

		assert.strictEqual(session2?.id, 'test');
		assert.strictEqual(session2?.scopes[0], 'foo');
		assert.notStrictEqual(session1.accessToken, session2?.accessToken);
	});

	test('clearSessionPreference - true', async () => {
		// Now create the session
		const session = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test-multiple',
			['foo'],
			{
				createIfNone: true
			});

		assert.strictEqual(session?.id, 'test');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await extHostAuthentication.getSession(
			nullExtensionDescription,
			'test-multiple',
			['foo'],
			{
				clearSessionPreference: true,
				createIfNone: true
			});

		assert.strictEqual(session.id, session2?.id);
		assert.strictEqual(session.scopes[0], session2?.scopes[0]);
		assert.notStrictEqual(session.accessToken, session2?.accessToken);
	});

	//#region error cases

	test('forceNewSession with no sessions', async () => {
		try {
			await extHostAuthentication.getSession(
				nullExtensionDescription,
				'test',
				['foo'],
				{
					forceNewSession: true
				});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.strictEqual(e.message, 'No existing sessions found.');
		}
	});

	test('createIfNone and forceNewSession', async () => {
		try {
			await extHostAuthentication.getSession(
				nullExtensionDescription,
				'test',
				['foo'],
				{
					createIfNone: true,
					forceNewSession: true
				});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.ok(e);
		}
	});

	test('forceNewSession and silent', async () => {
		try {
			await extHostAuthentication.getSession(
				nullExtensionDescription,
				'test',
				['foo'],
				{
					forceNewSession: true,
					silent: true
				});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.ok(e);
		}
	});

	test('createIfNone and silent', async () => {
		try {
			await extHostAuthentication.getSession(
				nullExtensionDescription,
				'test',
				['foo'],
				{
					createIfNone: true,
					silent: true
				});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.ok(e);
		}
	});

	//#endregion
});
