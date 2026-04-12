/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { notStrictEqual, strictEqual } from 'assert';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { StateService } from '../../../state/node/stateService.js';
import { IS_NEW_KEY } from '../../common/storage.js';
import { StorageMainService } from '../../electron-main/storageMainService.js';
import { currentSessionDateStorageKey, firstSessionDateStorageKey } from '../../../telemetry/common/telemetry.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { UserDataProfilesMainService } from '../../../userDataProfile/electron-main/userDataProfile.js';
import { TestLifecycleMainService } from '../../../test/electron-main/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
suite('StorageMainService', function () {
    const disposables = new DisposableStore();
    const productService = { _serviceBrand: undefined, ...product };
    const inMemoryProfileRoot = URI.file('/location').with({ scheme: Schemas.inMemory });
    const inMemoryProfile = {
        id: 'id',
        name: 'inMemory',
        isDefault: false,
        location: inMemoryProfileRoot,
        globalStorageHome: joinPath(inMemoryProfileRoot, 'globalStorageHome'),
        settingsResource: joinPath(inMemoryProfileRoot, 'settingsResource'),
        keybindingsResource: joinPath(inMemoryProfileRoot, 'keybindingsResource'),
        tasksResource: joinPath(inMemoryProfileRoot, 'tasksResource'),
        mcpResource: joinPath(inMemoryProfileRoot, 'mcp.json'),
        snippetsHome: joinPath(inMemoryProfileRoot, 'snippetsHome'),
        promptsHome: joinPath(inMemoryProfileRoot, 'promptsHome'),
        extensionsResource: joinPath(inMemoryProfileRoot, 'extensionsResource'),
        cacheHome: joinPath(inMemoryProfileRoot, 'cache'),
    };
    class TestStorageMainService extends StorageMainService {
        getStorageOptions() {
            return {
                useInMemoryStorage: true
            };
        }
    }
    async function testStorage(storage, scope) {
        strictEqual(storage.isInMemory(), true);
        // Telemetry: added after init unless workspace/profile scoped
        if (scope === -1 /* StorageScope.APPLICATION */) {
            strictEqual(storage.items.size, 0);
            await storage.init();
            strictEqual(typeof storage.get(firstSessionDateStorageKey), 'string');
            strictEqual(typeof storage.get(currentSessionDateStorageKey), 'string');
        }
        else {
            await storage.init();
        }
        let storageChangeEvent = undefined;
        disposables.add(storage.onDidChangeStorage(e => {
            storageChangeEvent = e;
        }));
        let storageDidClose = false;
        disposables.add(storage.onDidCloseStorage(() => storageDidClose = true));
        // Basic store/get/remove
        const size = storage.items.size;
        storage.set('bar', 'foo');
        strictEqual(storageChangeEvent.key, 'bar');
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
    function createStorageService(lifecycleMainService = new TestLifecycleMainService()) {
        const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
        const fileService = disposables.add(new FileService(new NullLogService()));
        const uriIdentityService = disposables.add(new UriIdentityService(fileService));
        const testStorageService = disposables.add(new TestStorageMainService(new NullLogService(), environmentService, disposables.add(new UserDataProfilesMainService(disposables.add(new StateService(1 /* SaveStrategy.DELAYED */, environmentService, new NullLogService(), fileService)), disposables.add(uriIdentityService), environmentService, fileService, new NullLogService())), lifecycleMainService, fileService, uriIdentityService));
        disposables.add(testStorageService.applicationStorage);
        return testStorageService;
    }
    test('basics (application)', function () {
        const storageMainService = createStorageService();
        return testStorage(storageMainService.applicationStorage, -1 /* StorageScope.APPLICATION */);
    });
    test('basics (profile)', function () {
        const storageMainService = createStorageService();
        const profile = inMemoryProfile;
        return testStorage(storageMainService.profileStorage(profile), 0 /* StorageScope.PROFILE */);
    });
    test('basics (workspace)', function () {
        const workspace = { id: generateUuid() };
        const storageMainService = createStorageService();
        return testStorage(storageMainService.workspaceStorage(workspace), 1 /* StorageScope.WORKSPACE */);
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
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZU1haW5TZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9zdG9yYWdlL3Rlc3QvZWxlY3Ryb24tbWFpbi9zdG9yYWdlTWFpblNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUNyRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbkUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sT0FBTyxNQUFNLG9DQUFvQyxDQUFDO0FBRXpELE9BQU8sRUFBZ0IsWUFBWSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDakYsT0FBTyxFQUFFLFVBQVUsRUFBZ0IsTUFBTSx5QkFBeUIsQ0FBQztBQUVuRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsSCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUV2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