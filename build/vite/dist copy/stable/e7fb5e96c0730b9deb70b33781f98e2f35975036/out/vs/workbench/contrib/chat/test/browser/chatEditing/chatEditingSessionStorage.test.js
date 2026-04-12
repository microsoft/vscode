/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { cloneAndChange } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestEnvironmentService } from '../../../../../test/browser/workbenchTestServices.js';
import { ChatEditingSessionStorage } from '../../../browser/chatEditing/chatEditingSessionStorage.js';
import { ChatEditingSnapshotTextModelContentProvider } from '../../../browser/chatEditing/chatEditingTextModelContentProviders.js';
import { hasKey } from '../../../../../../base/common/types.js';
suite('ChatEditingSessionStorage', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    const sessionResource = URI.parse('chat://test-session');
    let fs;
    let storage;
    class TestChatEditingSessionStorage extends ChatEditingSessionStorage {
        get storageLocation() {
            return super._getStorageLocation();
        }
    }
    setup(() => {
        fs = ds.add(new FileService(new NullLogService()));
        ds.add(fs.registerProvider(TestEnvironmentService.workspaceStorageHome.scheme, ds.add(new InMemoryFileSystemProvider())));
        storage = new TestChatEditingSessionStorage(sessionResource, fs, TestEnvironmentService, new NullLogService(), 
        // eslint-disable-next-line local/code-no-any-casts
        { getWorkspace: () => ({ id: 'workspaceId' }) });
    });
    function makeStop(requestId, before, after) {
        const stopId = generateUuid();
        const resource = URI.file('/foo.js');
        return {
            stopId,
            entries: new ResourceMap([
                [resource, { resource, languageId: 'javascript', snapshotUri: ChatEditingSnapshotTextModelContentProvider.getSnapshotFileURI(sessionResource, requestId, stopId, resource.path), original: `contents${before}}`, current: `contents${after}`, state: 0 /* ModifiedFileEntryState.Modified */, telemetryInfo: { agentId: 'agentId', command: 'cmd', requestId: generateUuid(), result: undefined, sessionResource: sessionResource, modelId: undefined, modeId: undefined, applyCodeBlockSuggestionId: undefined, feature: undefined } }],
            ]),
        };
    }
    function generateState() {
        const initialFileContents = new ResourceMap();
        for (let i = 0; i < 10; i++) {
            initialFileContents.set(URI.file(`/foo${i}.js`), `fileContents${Math.floor(i / 2)}`);
        }
        return {
            initialFileContents,
            recentSnapshot: makeStop(undefined, 'd', 'e'),
            timeline: undefined,
        };
    }
    test('state is empty initially', async () => {
        const s = await storage.restoreState();
        assert.strictEqual(s, undefined);
    });
    test('round trips state', async () => {
        const original = generateState();
        await storage.storeState(original);
        const changer = (x) => {
            if (typeof x === 'object' && x && hasKey(x, { isDeleted: true }) && x.isDeleted === undefined) {
                delete x.isDeleted;
            }
            return URI.isUri(x) ? x.toString() : x instanceof Map ? cloneAndChange([...x.values()], changer) : undefined;
        };
        const restored = await storage.restoreState();
        assert.deepStrictEqual(cloneAndChange(restored, changer), cloneAndChange(original, changer));
    });
    test('clears state', async () => {
        await storage.storeState(generateState());
        await storage.clearState();
        const s = await storage.restoreState();
        assert.strictEqual(s, undefined);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdTZXNzaW9uU3RvcmFnZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDckYsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sdUVBQXVFLENBQUM7QUFDbkgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSx5QkFBeUIsRUFBK0MsTUFBTSwyREFBMkQsQ0FBQztBQUNuSixPQUFPLEVBQUUsMkNBQTJDLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUVuSSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFaEUsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN2QyxNQUFNLEVBQUUsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBQ3JELE1BQU0sZUFB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