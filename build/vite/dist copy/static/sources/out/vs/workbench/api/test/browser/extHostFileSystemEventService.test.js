/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ExtHostFileSystemEventService } from '../../common/extHostFileSystemEventService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { URI } from '../../../../base/common/uri.js';
import { RelativePattern } from '../../common/extHostTypes.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
suite('ExtHostFileSystemEventService', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const protocol = {
        getProxy: () => { return undefined; },
        set: undefined,
        dispose: undefined,
        assertRegistered: undefined,
        drain: undefined
    };
    const protocolWithProxy = {
        getProxy: () => ({ $watch() { }, $unwatch() { }, dispose() { } }),
        set: undefined,
        dispose: undefined,
        assertRegistered: undefined,
        drain: undefined
    };
    test('FileSystemWatcher ignore events properties are reversed #26851', function () {
        const fileSystemInfo = new ExtHostFileSystemInfo();
        const watcher1 = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined).createFileSystemWatcher(undefined, undefined, fileSystemInfo, undefined, '**/somethingInteresting', {});
        assert.strictEqual(watcher1.ignoreChangeEvents, false);
        assert.strictEqual(watcher1.ignoreCreateEvents, false);
        assert.strictEqual(watcher1.ignoreDeleteEvents, false);
        watcher1.dispose();
        const watcher2 = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined).createFileSystemWatcher(undefined, undefined, fileSystemInfo, undefined, '**/somethingBoring', { ignoreCreateEvents: true, ignoreChangeEvents: true, ignoreDeleteEvents: true });
        assert.strictEqual(watcher2.ignoreChangeEvents, true);
        assert.strictEqual(watcher2.ignoreCreateEvents, true);
        assert.strictEqual(watcher2.ignoreDeleteEvents, true);
        watcher2.dispose();
    });
    test('FileSystemWatcher matches case-insensitively via pre-lowercasing', function () {
        const fileSystemInfo = new ExtHostFileSystemInfo();
        // Default: no PathCaseSensitive capability → ignoreCase=true for string patterns
        const workspace = {
            getWorkspaceFolder: () => ({ uri: URI.file('/workspace'), name: 'test', index: 0 })
        };
        const service = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined);
        const watcher = service.createFileSystemWatcher(workspace, undefined, fileSystemInfo, undefined, '**/*.TXT', {});
        const created = [];
        const sub = watcher.onDidCreate(uri => created.push(uri));
        // lowercase path should match uppercase pattern on case-insensitive fs
        service.$onFileEvent({
            session: undefined,
            created: [URI.file('/workspace/file.txt')],
            changed: [],
            deleted: []
        });
        assert.strictEqual(created.length, 1);
        sub.dispose();
        watcher.dispose();
    });
    test('FileSystemWatcher matches case-sensitively when PathCaseSensitive', function () {
        const fileSystemInfo = new ExtHostFileSystemInfo();
        fileSystemInfo.$acceptProviderInfos(URI.file('/'), 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */);
        const workspace = {
            getWorkspaceFolder: () => ({ uri: URI.file('/workspace'), name: 'test', index: 0 })
        };
        const service = new ExtHostFileSystemEventService(protocol, new NullLogService(), undefined);
        const watcher = service.createFileSystemWatcher(workspace, undefined, fileSystemInfo, undefined, '**/*.TXT', {});
        const created = [];
        const sub = watcher.onDidCreate(uri => created.push(uri));
        // lowercase path should NOT match uppercase pattern on case-sensitive fs
        service.$onFileEvent({
            session: undefined,
            created: [URI.file('/workspace/file.txt')],
            changed: [],
            deleted: []
        });
        assert.strictEqual(created.length, 0);
        // uppercase path SHOULD match
        service.$onFileEvent({
            session: undefined,
            created: [URI.file('/workspace/file.TXT')],
            changed: [],
            deleted: []
        });
        assert.strictEqual(created.length, 1);
        sub.dispose();
        watcher.dispose();
    });
    test('FileSystemWatcher matches relative pattern case-insensitively via pre-lowercasing', function () {
        const fileSystemInfo = new ExtHostFileSystemInfo();
        fileSystemInfo.$acceptProviderInfos(URI.file('/'), 2 /* FileSystemProviderCapabilities.FileReadWrite */); // no PathCaseSensitive → ignoreCase=true
        const workspace = {
            getWorkspaceFolder: () => ({ uri: URI.file('/workspace'), name: 'test', index: 0 })
        };
        const configProvider = {
            getConfiguration: () => ({ get: () => ({}) })
        };
        const service = new ExtHostFileSystemEventService(protocolWithProxy, new NullLogService(), undefined);
        const watcher = service.createFileSystemWatcher(workspace, configProvider, fileSystemInfo, nullExtensionDescription, new RelativePattern('/Workspace', '**/*.TXT'), {});
        const created = [];
        const sub = watcher.onDidCreate(uri => created.push(uri));
        // lowercase path should match mixed-case base + uppercase extension on case-insensitive fs
        service.$onFileEvent({
            session: undefined,
            created: [URI.file('/workspace/file.txt')],
            changed: [],
            deleted: []
        });
        assert.strictEqual(created.length, 1);
        sub.dispose();
        watcher.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEZpbGVTeXN0ZW1FdmVudFNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RGaWxlU3lzdGVtRXZlbnRTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRTlGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHckQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9ELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRzdGLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7SUFFM0MsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxNQUFNLFFBQVEsR0FBaUI7UUFDOUIsUUFBUSxFQUFFLEdBQUcsRUFBRSxHQUFHLE9BQU8sU0FBVSxDQUFDLENBQUMsQ0FBQztRQUN0QyxHQUFHLEVBQUUsU0FBVTtRQUNmLE9BQU8sRUFBRSxTQUFVO1FBQ25CLGdCQUFnQixFQUFFLFNBQVU7UUFDNUIsS0FBSyxFQUFFLFNBQVU7S0FDakIsQ0FBQztJQUVGLE1BQU0saUJBQWlCLEdBQWlCO1FBQ3ZDLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxLQUFLLENBQUMsRUFBRSxRQUFRLEtB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