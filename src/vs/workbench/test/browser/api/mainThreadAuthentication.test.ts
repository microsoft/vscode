/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AuthenticationProviderInformation } from 'vs/editor/common/modes';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { TestDialogService } from 'vs/platform/dialogs/test/common/testDialogService';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IQuickInputHideEvent, IQuickInputService, IQuickPickDidAcceptEvent } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { MainThreadAuthentication } from 'vs/workbench/api/browser/mainThreadAuthentication';
import { IExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { AuthenticationService, IAuthenticationService } from 'vs/workbench/services/authentication/browser/authenticationService';
import { ExtensionHostKind, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { TestRemoteAgentService } from 'vs/workbench/services/remote/test/common/testServices';
import { TestQuickInputService } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestActivityService, TestExtensionService, TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';

function createSession(id: string = '1234', scope: string[] = []) {
	return {
		accessToken: '1234',
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
	suiteSetup(async () => {
		// extHostContext: IExtHostContext,
		const services = new ServiceCollection();
		const dialogService = new TestDialogService();
		const storageService = new TestStorageService();
		const quickInputService = new AuthTestQuickInputService();
		const extensionService = new TestExtensionService();

		const activityService = new TestActivityService();
		const remoteAgentService = new TestRemoteAgentService();

		services.set(IDialogService, dialogService);
		services.set(IStorageService, storageService);
		services.set(INotificationService, new TestNotificationService());
		services.set(IQuickInputService, quickInputService);
		services.set(IExtensionService, extensionService);
		services.set(IActivityService, activityService);
		services.set(IRemoteAgentService, remoteAgentService);

		const instaService = new InstantiationService(services);
		services.set(IAuthenticationService, instaService.createInstance(AuthenticationService));

		mainThreadAuthentication = instaService.createInstance(MainThreadAuthentication,
			new class implements IExtHostContext {
				remoteAuthority = '';
				extensionHostKind = ExtensionHostKind.LocalProcess;
				assertRegistered() { }
				set(v: any): any { return null; }
				getProxy(): any {
					return {
						$getSessions(id: string, scopes: string[]) {
							return Promise.resolve([createSession(id, scopes)]);
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

		await mainThreadAuthentication.$registerAuthenticationProvider('test', 'test provider', true);
	});

	suiteTeardown(() => {
		mainThreadAuthentication.$unregisterAuthenticationProvider('test');
		mainThreadAuthentication.dispose();
	});

	test('Can get a session', async () => {
		const session = await mainThreadAuthentication.$getSession('test', ['foo'], 'testextension', 'test extension', { createIfNone: true, clearSessionPreference: false });
		assert.strictEqual(session?.id, 'test');
		assert.strictEqual(session?.scopes[0], 'foo');
	});
});
