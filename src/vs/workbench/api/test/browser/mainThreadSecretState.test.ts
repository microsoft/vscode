/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { TestSecretStorageService } from '../../../../platform/secrets/test/common/testSecretStorageService.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { ExtensionHostKind } from '../../../services/extensions/common/extensionHostKind.js';
import { IExtensionsStatus, IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { LocalProcessRunningLocation, RemoteRunningLocation } from '../../../services/extensions/common/extensionRunningLocation.js';
import { MainThreadSecretState } from '../../browser/mainThreadSecretState.js';

// A UI extension: it runs in the local extension host and its secret is the
// user's own credential, held in the local secret store.
const LOCAL_EXTENSION = 'vscode.github-authentication';
// A workspace extension: with a remote connection open it runs in the remote host.
const REMOTE_EXTENSION = 'some-publisher.remote-workspace-extension';

function storageKey(extensionId: string, key: string): string {
	return JSON.stringify({ extensionId, key });
}

suite('MainThreadSecretState', function () {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSecretState(callerHostKind: ExtensionHostKind): { secretState: MainThreadSecretState; storage: TestSecretStorageService } {
		const storage = new TestSecretStorageService();
		disposables.add({ dispose: () => storage.dispose() });

		const extensionService = new class extends mock<IExtensionService>() {
			override async whenInstalledExtensionsRegistered(): Promise<boolean> {
				return true;
			}
			override getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
				return {
					[LOCAL_EXTENSION]: {
						id: new ExtensionIdentifier(LOCAL_EXTENSION),
						runningLocation: new LocalProcessRunningLocation(0),
					} as IExtensionsStatus,
					[REMOTE_EXTENSION]: {
						id: new ExtensionIdentifier(REMOTE_EXTENSION),
						runningLocation: new RemoteRunningLocation(),
					} as IExtensionsStatus,
				};
			}
		};

		const extHostContext = new class extends mock<IExtHostContext>() {
			override readonly extensionHostKind = callerHostKind;
			override getProxy<T>(): T {
				return { $onDidChangePassword: () => Promise.resolve() } as T;
			}
		};

		const secretState = new MainThreadSecretState(
			extHostContext,
			storage,
			new NullLogService(),
			new class extends mock<IBrowserWorkbenchEnvironmentService>() { },
			extensionService
		);
		disposables.add(secretState);

		return { secretState, storage };
	}

	suite('a remote extension host naming a local extension', () => {

		test('cannot read its secret, and the store is not consulted', async () => {
			const { secretState, storage } = createSecretState(ExtensionHostKind.Remote);
			await storage.set(storageKey(LOCAL_EXTENSION, 'token'), 'the-local-token');

			await assert.rejects(() => secretState.$getPassword(LOCAL_EXTENSION, 'token'));

			// The secret is still exactly where it was, and was never handed over.
			assert.strictEqual(await storage.get(storageKey(LOCAL_EXTENSION, 'token')), 'the-local-token');
		});

		test('cannot overwrite its secret', async () => {
			const { secretState, storage } = createSecretState(ExtensionHostKind.Remote);
			await storage.set(storageKey(LOCAL_EXTENSION, 'token'), 'the-local-token');

			await assert.rejects(() => secretState.$setPassword(LOCAL_EXTENSION, 'token', 'attacker-token'));

			assert.strictEqual(await storage.get(storageKey(LOCAL_EXTENSION, 'token')), 'the-local-token');
		});

		test('cannot delete its secret', async () => {
			const { secretState, storage } = createSecretState(ExtensionHostKind.Remote);
			await storage.set(storageKey(LOCAL_EXTENSION, 'token'), 'the-local-token');

			await assert.rejects(() => secretState.$deletePassword(LOCAL_EXTENSION, 'token'));

			assert.strictEqual(await storage.get(storageKey(LOCAL_EXTENSION, 'token')), 'the-local-token');
		});

		test('cannot enumerate its keys', async () => {
			const { secretState, storage } = createSecretState(ExtensionHostKind.Remote);
			await storage.set(storageKey(LOCAL_EXTENSION, 'token'), 'the-local-token');

			await assert.rejects(() => secretState.$getKeys(LOCAL_EXTENSION));
		});

		test('is not let through by a differently-cased identifier', async () => {
			const { secretState, storage } = createSecretState(ExtensionHostKind.Remote);
			await storage.set(storageKey(LOCAL_EXTENSION, 'token'), 'the-local-token');

			await assert.rejects(() => secretState.$getPassword(LOCAL_EXTENSION.toUpperCase(), 'token'));
		});
	});

	suite('a host naming an extension it does run', () => {

		test('the remote host reaches its own extension', async () => {
			const { secretState } = createSecretState(ExtensionHostKind.Remote);

			await secretState.$setPassword(REMOTE_EXTENSION, 'token', 'remote-token');

			assert.strictEqual(await secretState.$getPassword(REMOTE_EXTENSION, 'token'), 'remote-token');
			assert.deepStrictEqual(await secretState.$getKeys(REMOTE_EXTENSION), ['token']);

			await secretState.$deletePassword(REMOTE_EXTENSION, 'token');
			assert.strictEqual(await secretState.$getPassword(REMOTE_EXTENSION, 'token'), undefined);
		});

		test('the local host reaches its own extension', async () => {
			const { secretState } = createSecretState(ExtensionHostKind.LocalProcess);

			await secretState.$setPassword(LOCAL_EXTENSION, 'token', 'local-token');

			assert.strictEqual(await secretState.$getPassword(LOCAL_EXTENSION, 'token'), 'local-token');
			assert.deepStrictEqual(await secretState.$getKeys(LOCAL_EXTENSION), ['token']);
		});

		test('a differently-cased identifier still resolves for its own host', async () => {
			const { secretState } = createSecretState(ExtensionHostKind.LocalProcess);

			await secretState.$setPassword(LOCAL_EXTENSION.toUpperCase(), 'token', 'local-token');

			assert.strictEqual(await secretState.$getPassword(LOCAL_EXTENSION.toUpperCase(), 'token'), 'local-token');
		});
	});

	suite('the local host naming a remote extension', () => {

		test('is refused in the same way', async () => {
			const { secretState } = createSecretState(ExtensionHostKind.LocalProcess);

			await assert.rejects(() => secretState.$getPassword(REMOTE_EXTENSION, 'token'));
		});
	});

	suite('an extension this window does not run', () => {

		test('is refused, so leftover secrets of a disabled extension stay unreachable', async () => {
			const { secretState, storage } = createSecretState(ExtensionHostKind.Remote);
			await storage.set(storageKey('some-publisher.uninstalled', 'token'), 'stale-token');

			await assert.rejects(() => secretState.$getPassword('some-publisher.uninstalled', 'token'));

			assert.strictEqual(await storage.get(storageKey('some-publisher.uninstalled', 'token')), 'stale-token');
		});
	});
});
