/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthenticationProviderInformation } from 'vs/editor/common/modes';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IQuickInputHideEvent, IQuickInputService, IQuickPickDidAcceptEvent } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { MainThreadAuthentication } from 'vs/workbench/api/browser/mainThreadAuthentication';
import { IExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { AuthenticationService, IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { ExtensionHostKind, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TestRemoteAgentService } from 'vs/workbench/services/remote/test/common/testServices';
import { TestQuickInputService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestActivityService, TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

let i = 0;
function createSession(id: string = '1234', scope: string[] = []) {
	return {
		accessToken: (++i) + '',
		account: {
			id: 'test@test.com',
			label: 'Test Person'
		},
		id: id,
		scopes: scope
	};
}

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

suite('MainThreadAuthentication', () => {
	let mainThreadAuthentication: MainThreadAuthentication;
	let instantiationService: TestInstantiationService;
	suiteSetup(async () => {
		instantiationService = new TestInstantiationService();
		// extHostContext: IExtHostContext,
		instantiationService.stub(IDialogService, new TestDialogService());
		instantiationService.stub(IStorageService, new TestStorageService());
		instantiationService.stub(IQuickInputService, new AuthTestQuickInputService());
		instantiationService.stub(IExtensionService, new TestExtensionService());

		instantiationService.stub(IActivityService, new TestActivityService());
		instantiationService.stub(IRemoteAgentService, new TestRemoteAgentService());
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);

		instantiationService.stub(IAuthenticationService, instantiationService.createInstance(AuthenticationService));
		mainThreadAuthentication = instantiationService.createInstance(MainThreadAuthentication,
			new class implements IExtHostContext {
				remoteAuthority = '';
				extensionHostKind = ExtensionHostKind.LocalProcess;
				assertRegistered() { }
				set(v: any): any { return null; }
				getProxy(): any {
					return {
						async $getSessions(id: string, scopes: string[]) {
							// if we get the empty auth provider, return no sessions
							return id === 'empty' ? [] : [createSession(id, scopes)];
						},
						$createSession(id: string, scopes: string[]) {
							return Promise.resolve(createSession(id, scopes));
						},
						$removeSession(id: string, sessionId: string) { return Promise.resolve(); },
						$onDidChangeAuthenticationSessions(id: string, label: string) { return Promise.resolve(); },
						$setProviders(providers: AuthenticationProviderInformation[]) { return Promise.resolve(); }
					};
				}
				drain(): any { return null; }
			});
	});

	setup(async () => {
		await mainThreadAuthentication.$registerAuthenticationProvider('test', 'test provider', true);
		await mainThreadAuthentication.$registerAuthenticationProvider('empty', 'test provider', true);
	});

	teardown(() => {
		mainThreadAuthentication.$unregisterAuthenticationProvider('test');
		mainThreadAuthentication.$unregisterAuthenticationProvider('empty');
	});

	test('Can get a session', async () => {
		const session = await mainThreadAuthentication.$getSession('test', ['foo'], 'testextension', 'test extension', {
			createIfNone: true,
			clearSessionPreference: false,
			forceNewSession: false
		});
		assert.strictEqual(session?.id, 'test');
		assert.strictEqual(session?.scopes[0], 'foo');
	});

	test('Can recreate a session', async () => {
		const session = await mainThreadAuthentication.$getSession('test', ['foo'], 'testextension', 'test extension', {
			createIfNone: true,
			clearSessionPreference: false,
			forceNewSession: false
		});

		assert.strictEqual(session?.id, 'test');
		assert.strictEqual(session?.scopes[0], 'foo');

		const session2 = await mainThreadAuthentication.$getSession('test', ['foo'], 'testextension', 'test extension', {
			createIfNone: false,
			clearSessionPreference: false,
			forceNewSession: true
		});

		assert.strictEqual(session.id, session2?.id);
		assert.strictEqual(session.scopes[0], session2?.scopes[0]);
		assert.notStrictEqual(session.accessToken, session2?.accessToken);
	});

	test('Can not recreate a session if none exists', async () => {
		try {
			await mainThreadAuthentication.$getSession('empty', ['foo'], 'testextension', 'test extension', {
				createIfNone: false,
				clearSessionPreference: false,
				forceNewSession: true
			});
			assert.fail('should have thrown an Error.');
		} catch (e) {
			assert.strictEqual(e.message, 'No existing sessions found.');
		}
	});
});
