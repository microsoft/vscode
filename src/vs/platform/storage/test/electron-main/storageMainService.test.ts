/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { notStrictEqual, strictEqual } from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { FileService } from '../../../files/common/fileService.js';
import { ILifecycleMainService } from '../../../lifecycle/electron-main/lifecycleMainService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { SaveStrategy, StateService } from '../../../state/node/stateService.js';
import { IS_NEW_KEY, StorageScope } from '../../common/storage.js';
import { IStorageChangeEvent, IStorageMain, IStorageMainOptions } from '../../electron-main/storageMain.js';
import { StorageMainService } from '../../electron-main/storageMainService.js';
import { currentSessionDateStorageKey, firstSessionDateStorageKey } from '../../../telemetry/common/telemetry.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IUserDataProfile } from '../../../userDataProfile/common/userDataProfile.js';
import { UserDataProfilesMainService } from '../../../userDataProfile/electron-main/userDataProfile.js';
import { TestLifecycleMainService } from '../../../test/electron-main/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWindowsMainService } from '../../../windows/electron-main/windows.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { StorageDatabaseChannel } from '../../electron-main/storageIpc.js';

suite('StorageMainService', function () {

	const disposables = new DisposableStore();

	const productService: IProductService = { _serviceBrand: undefined, ...product };

	const inMemoryProfileRoot = URI.file('/location').with({ scheme: Schemas.inMemory });
	const inMemoryProfile: IUserDataProfile = {
		id: 'id',
		name: 'inMemory',
		isDefault: false,
		location: inMemoryProfileRoot,
		globalStorageHome: joinPath(inMemoryProfileRoot, 'globalStorageHome'),
		settingsResource: joinPath(inMemoryProfileRoot, 'settingsResource'),
		keybindingsResource: joinPath(inMemoryProfileRoot, 'keybindingsResource'),
		tasksResource: joinPath(inMemoryProfileRoot, 'tasksResource'),
		mcpResource: joinPath(inMemoryProfileRoot, 'mcp.json'),
		languageModelsResource: joinPath(inMemoryProfileRoot, 'chatLanguageModels.json'),
		snippetsHome: joinPath(inMemoryProfileRoot, 'snippetsHome'),
		promptsHome: joinPath(inMemoryProfileRoot, 'promptsHome'),
		extensionsResource: joinPath(inMemoryProfileRoot, 'extensionsResource'),
		cacheHome: joinPath(inMemoryProfileRoot, 'cache'),
		agentPluginsHome: joinPath(inMemoryProfileRoot, 'agentPluginsHome'),
	};

	class TestStorageMainService extends StorageMainService {

		protected override getStorageOptions(): IStorageMainOptions {
			return {
				useInMemoryStorage: true
			};
		}
	}

	class TestCodeWindow {

		private readonly _onDidClose = new Emitter<void>();
		readonly onDidClose = this._onDidClose.event;

		private readonly _onDidDestroy = new Emitter<void>();
		readonly onDidDestroy = this._onDidDestroy.event;

		constructor(
			readonly id: number
		) { }

		close(): void {
			this._onDidClose.fire();
		}

		destroy(): void {
			this._onDidDestroy.fire();
		}

		dispose(): void {
			this._onDidClose.dispose();
			this._onDidDestroy.dispose();
		}

		asCodeWindow(): ICodeWindow {
			return this as Partial<ICodeWindow> as ICodeWindow;
		}
	}

	class TestWindowsMainService {

		private readonly windows = new Map<number, TestCodeWindow>();

		addWindow(window: TestCodeWindow): void {
			this.windows.set(window.id, window);
		}

		getWindowById(windowId: number): ICodeWindow | undefined {
			return this.windows.get(windowId)?.asCodeWindow();
		}

		dispose(): void {
			for (const window of this.windows.values()) {
				window.dispose();
			}
			this.windows.clear();
		}

		asService(): IWindowsMainService {
			return this as Partial<IWindowsMainService> as IWindowsMainService;
		}
	}

	async function testStorage(storage: IStorageMain, scope: StorageScope): Promise<void> {
		strictEqual(storage.isInMemory(), true);

		// Telemetry: added after init unless workspace/profile scoped
		if (scope === StorageScope.APPLICATION) {
			strictEqual(storage.items.size, 0);
			await storage.init();
			strictEqual(typeof storage.get(firstSessionDateStorageKey), 'string');
			strictEqual(typeof storage.get(currentSessionDateStorageKey), 'string');
		} else {
			await storage.init();
		}

		let storageChangeEvent: IStorageChangeEvent | undefined = undefined;
		disposables.add(storage.onDidChangeStorage(e => {
			storageChangeEvent = e;
		}));

		let storageDidClose = false;
		disposables.add(storage.onDidCloseStorage(() => storageDidClose = true));

		// Basic store/get/remove
		const size = storage.items.size;

		storage.set('bar', 'foo');
		strictEqual(storageChangeEvent!.key, 'bar');
		storage.set('barNumber', 55);
		storage.set('barBoolean', true);

		strictEqual(storage.get('bar'), 'foo');
		strictEqual(storage.get('barNumber'), '55');
		strictEqual(storage.get('barBoolean'), 'true');

		strictEqual(storage.items.size, size + 3);

		storage.delete('bar');
		strictEqual(storage.get('bar'), undefined);

		strictEqual(storage.items.size, size + 2);

		// IS_NEW
		strictEqual(storage.get(IS_NEW_KEY), 'true');

		// Close
		await storage.close();

		strictEqual(storageDidClose, true);
	}

	teardown(() => {
		disposables.clear();
	});

	function createStorageService(lifecycleMainService: ILifecycleMainService = new TestLifecycleMainService(), windowsMainService: IWindowsMainService = new TestWindowsMainService().asService()): TestStorageMainService {
		const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
		const fileService = disposables.add(new FileService(new NullLogService()));
		const uriIdentityService = disposables.add(new UriIdentityService(fileService));
		const testStorageService = disposables.add(new TestStorageMainService(new NullLogService(), environmentService, disposables.add(new UserDataProfilesMainService(disposables.add(new StateService(SaveStrategy.DELAYED, environmentService, new NullLogService(), fileService)), disposables.add(uriIdentityService), environmentService, fileService, new NullLogService(), productService)), lifecycleMainService, fileService, uriIdentityService, windowsMainService));

		disposables.add(testStorageService.applicationStorage);

		return testStorageService;
	}

	function createProfile(id: string, isDefault = false): IUserDataProfile {
		return {
			...inMemoryProfile,
			id,
			name: id,
			isDefault
		};
	}

	test('basics (application)', function () {
		const storageMainService = createStorageService();

		return testStorage(storageMainService.applicationStorage, StorageScope.APPLICATION);
	});

	test('basics (profile)', function () {
		const storageMainService = createStorageService();
		const profile = inMemoryProfile;

		return testStorage(storageMainService.profileStorage(profile), StorageScope.PROFILE);
	});

	test('basics (application shared)', function () {
		const storageMainService = createStorageService();

		return testStorage(storageMainService.applicationSharedStorage, StorageScope.APPLICATION_SHARED);
	});

	test('basics (workspace)', function () {
		const workspace = { id: generateUuid() };
		const storageMainService = createStorageService();

		return testStorage(storageMainService.workspaceStorage(workspace), StorageScope.WORKSPACE);
	});

	test('storage closed onWillShutdown', async function () {
		const lifecycleMainService = new TestLifecycleMainService();
		const storageMainService = createStorageService(lifecycleMainService);

		const profile = inMemoryProfile;
		const workspace = { id: generateUuid() };

		const workspaceStorage = storageMainService.workspaceStorage(workspace);
		let didCloseWorkspaceStorage = false;
		disposables.add(workspaceStorage.onDidCloseStorage(() => {
			didCloseWorkspaceStorage = true;
		}));

		const profileStorage = storageMainService.profileStorage(profile);
		let didCloseProfileStorage = false;
		disposables.add(profileStorage.onDidCloseStorage(() => {
			didCloseProfileStorage = true;
		}));

		const applicationStorage = storageMainService.applicationStorage;
		let didCloseApplicationStorage = false;
		disposables.add(applicationStorage.onDidCloseStorage(() => {
			didCloseApplicationStorage = true;
		}));

		strictEqual(applicationStorage, storageMainService.applicationStorage); // same instance as long as not closed
		strictEqual(profileStorage, storageMainService.profileStorage(profile)); // same instance as long as not closed
		strictEqual(workspaceStorage, storageMainService.workspaceStorage(workspace)); // same instance as long as not closed

		await applicationStorage.init();
		await profileStorage.init();
		await workspaceStorage.init();

		await lifecycleMainService.fireOnWillShutdown();

		strictEqual(didCloseApplicationStorage, true);
		strictEqual(didCloseProfileStorage, true);
		strictEqual(didCloseWorkspaceStorage, true);

		const profileStorage2 = storageMainService.profileStorage(profile);
		notStrictEqual(profileStorage, profileStorage2);

		const workspaceStorage2 = storageMainService.workspaceStorage(workspace);
		notStrictEqual(workspaceStorage, workspaceStorage2);

		await profileStorage2.close();
		await workspaceStorage2.close();
	});

	test('storage closed before init works', async function () {
		const storageMainService = createStorageService();
		const profile = inMemoryProfile;
		const workspace = { id: generateUuid() };

		const workspaceStorage = storageMainService.workspaceStorage(workspace);
		let didCloseWorkspaceStorage = false;
		disposables.add(workspaceStorage.onDidCloseStorage(() => {
			didCloseWorkspaceStorage = true;
		}));

		const profileStorage = storageMainService.profileStorage(profile);
		let didCloseProfileStorage = false;
		disposables.add(profileStorage.onDidCloseStorage(() => {
			didCloseProfileStorage = true;
		}));

		const applicationStorage = storageMainService.applicationStorage;
		let didCloseApplicationStorage = false;
		disposables.add(applicationStorage.onDidCloseStorage(() => {
			didCloseApplicationStorage = true;
		}));

		await applicationStorage.close();
		await profileStorage.close();
		await workspaceStorage.close();

		strictEqual(didCloseApplicationStorage, true);
		strictEqual(didCloseProfileStorage, true);
		strictEqual(didCloseWorkspaceStorage, true);
	});

	test('storage closed before init awaits works', async function () {
		const storageMainService = createStorageService();
		const profile = inMemoryProfile;
		const workspace = { id: generateUuid() };

		const workspaceStorage = storageMainService.workspaceStorage(workspace);
		let didCloseWorkspaceStorage = false;
		disposables.add(workspaceStorage.onDidCloseStorage(() => {
			didCloseWorkspaceStorage = true;
		}));

		const profileStorage = storageMainService.profileStorage(profile);
		let didCloseProfileStorage = false;
		disposables.add(profileStorage.onDidCloseStorage(() => {
			didCloseProfileStorage = true;
		}));

		const applicationtorage = storageMainService.applicationStorage;
		let didCloseApplicationStorage = false;
		disposables.add(applicationtorage.onDidCloseStorage(() => {
			didCloseApplicationStorage = true;
		}));

		applicationtorage.init();
		profileStorage.init();
		workspaceStorage.init();

		await applicationtorage.close();
		await profileStorage.close();
		await workspaceStorage.close();

		strictEqual(didCloseApplicationStorage, true);
		strictEqual(didCloseProfileStorage, true);
		strictEqual(didCloseWorkspaceStorage, true);
	});

	test('profile storage closes when requesting owner window closes', async function () {
		const windowsMainService = disposables.add(new TestWindowsMainService());
		const window = disposables.add(new TestCodeWindow(1));
		windowsMainService.addWindow(window);
		const storageMainService = createStorageService(new TestLifecycleMainService(), windowsMainService.asService());
		const profile = createProfile('profile-owner');

		const profileStorage = storageMainService.profileStorage(profile, window.id);
		strictEqual(profileStorage, storageMainService.profileStorage(profile, window.id)); // repeated requests from the same window do not double count

		const closed = Event.toPromise(profileStorage.onDidCloseStorage);
		window.close();
		await closed;
	});

	test('profile storage stays open until all requesting owner windows close', async function () {
		const windowsMainService = disposables.add(new TestWindowsMainService());
		const window1 = disposables.add(new TestCodeWindow(1));
		const window2 = disposables.add(new TestCodeWindow(2));
		windowsMainService.addWindow(window1);
		windowsMainService.addWindow(window2);
		const storageMainService = createStorageService(new TestLifecycleMainService(), windowsMainService.asService());
		const profile = createProfile('shared-profile');

		const profileStorage = storageMainService.profileStorage(profile, window1.id);
		strictEqual(profileStorage, storageMainService.profileStorage(profile, window2.id));

		let didClose = false;
		disposables.add(profileStorage.onDidCloseStorage(() => didClose = true));

		window1.close();
		await timeout(0);
		strictEqual(didClose, false);

		const closed = Event.toPromise(profileStorage.onDidCloseStorage);
		window2.close();
		await closed;
		strictEqual(didClose, true);
	});

	test('workspace storages requested by one window close with that window', async function () {
		const windowsMainService = disposables.add(new TestWindowsMainService());
		const window = disposables.add(new TestCodeWindow(1));
		windowsMainService.addWindow(window);
		const storageMainService = createStorageService(new TestLifecycleMainService(), windowsMainService.asService());
		const workspace1 = { id: generateUuid() };
		const workspace2 = { id: generateUuid() };

		const workspaceStorage1 = storageMainService.workspaceStorage(workspace1, window.id);
		const workspaceStorage2 = storageMainService.workspaceStorage(workspace2, window.id);

		const closed1 = Event.toPromise(workspaceStorage1.onDidCloseStorage);
		const closed2 = Event.toPromise(workspaceStorage2.onDidCloseStorage);
		window.destroy();
		await Promise.all([closed1, closed2]);
	});

	test('non-window profile storage requests do not acquire owner refs', async function () {
		const windowsMainService = disposables.add(new TestWindowsMainService());
		const window = disposables.add(new TestCodeWindow(1));
		windowsMainService.addWindow(window);
		const storageMainService = createStorageService(new TestLifecycleMainService(), windowsMainService.asService());
		const profile = createProfile('anonymous-profile');

		const profileStorage = storageMainService.profileStorage(profile);
		let didClose = false;
		disposables.add(profileStorage.onDidCloseStorage(() => didClose = true));

		window.close();
		await timeout(0);
		strictEqual(didClose, false);

		await profileStorage.close();
	});

	test('default profile storage does not close application storage with owner window', async function () {
		const windowsMainService = disposables.add(new TestWindowsMainService());
		const window = disposables.add(new TestCodeWindow(1));
		windowsMainService.addWindow(window);
		const storageMainService = createStorageService(new TestLifecycleMainService(), windowsMainService.asService());
		const defaultProfile = createProfile('default-profile', true);

		const profileStorage = storageMainService.profileStorage(defaultProfile, window.id);
		strictEqual(profileStorage, storageMainService.applicationStorage);

		let didClose = false;
		disposables.add(profileStorage.onDidCloseStorage(() => didClose = true));

		window.close();
		await timeout(0);
		strictEqual(didClose, false);
	});

	test('storage closed onWillShutdown with owner refs', async function () {
		const lifecycleMainService = new TestLifecycleMainService();
		const windowsMainService = disposables.add(new TestWindowsMainService());
		const window = disposables.add(new TestCodeWindow(1));
		windowsMainService.addWindow(window);
		const storageMainService = createStorageService(lifecycleMainService, windowsMainService.asService());
		const profile = createProfile('shutdown-profile');
		const workspace = { id: generateUuid() };

		const profileStorage = storageMainService.profileStorage(profile, window.id);
		const workspaceStorage = storageMainService.workspaceStorage(workspace, window.id);

		let didCloseProfileStorage = false;
		disposables.add(profileStorage.onDidCloseStorage(() => didCloseProfileStorage = true));

		let didCloseWorkspaceStorage = false;
		disposables.add(workspaceStorage.onDidCloseStorage(() => didCloseWorkspaceStorage = true));

		await lifecycleMainService.fireOnWillShutdown();

		strictEqual(didCloseProfileStorage, true);
		strictEqual(didCloseWorkspaceStorage, true);
	});

	test('storage channel reattaches profile listener after storage closes', async function () {
		const windowsMainService = disposables.add(new TestWindowsMainService());
		const window1 = disposables.add(new TestCodeWindow(1));
		const window2 = disposables.add(new TestCodeWindow(2));
		windowsMainService.addWindow(window1);
		windowsMainService.addWindow(window2);
		const storageMainService = createStorageService(new TestLifecycleMainService(), windowsMainService.asService());
		const storageChannel = disposables.add(new StorageDatabaseChannel(new NullLogService(), storageMainService));
		const profile = createProfile('channel-profile');

		storageChannel.listen('window:1', 'onDidChangeStorage', { profile, workspace: undefined });
		const profileStorage = storageMainService.profileStorage(profile);
		const closed = Event.toPromise(profileStorage.onDidCloseStorage);
		window1.close();
		await closed;

		let didChange = false;
		disposables.add(storageChannel.listen('window:2', 'onDidChangeStorage', { profile, workspace: undefined })(() => didChange = true));
		await storageChannel.call('window:2', 'getItems', { profile, workspace: undefined });

		const profileStorage2 = storageMainService.profileStorage(profile);
		profileStorage2.set('foo', 'bar');
		await timeout(150);

		strictEqual(didChange, true);
	});

	test('application shared storage closed onWillShutdown', async function () {
		const lifecycleMainService = new TestLifecycleMainService();
		const storageMainService = createStorageService(lifecycleMainService);

		const applicationSharedStorage = storageMainService.applicationSharedStorage;
		let didCloseApplicationSharedStorage = false;
		disposables.add(applicationSharedStorage.onDidCloseStorage(() => {
			didCloseApplicationSharedStorage = true;
		}));

		await applicationSharedStorage.init();
		await lifecycleMainService.fireOnWillShutdown();

		strictEqual(didCloseApplicationSharedStorage, true);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
