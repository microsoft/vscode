/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as resources from '../../../../../base/common/resources.js';
import assert from 'assert';
import { TestEnvironmentService, TestLifecycleService, TestPathService, TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';
import { URI } from '../../../../../base/common/uri.js';
import { LabelService } from '../../common/labelService.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { TestWorkspace, Workspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { Memento } from '../../../../common/memento.js';
import { sep } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
suite('URI Label', () => {
    let labelService;
    let storageService;
    setup(() => {
        storageService = new TestStorageService();
        labelService = new LabelService(TestEnvironmentService, new TestContextService(), new TestPathService(URI.file('/foobar')), new TestRemoteAgentService(), storageService, new TestLifecycleService());
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('custom scheme', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            formatting: {
                label: 'LABEL/${path}/${authority}/END',
                separator: '/',
                tildify: true,
                normalizeDriveLetter: true
            }
        });
        const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL//1/2/3/4/5/microsoft.com/END');
        assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'END');
    });
    test('file scheme', function () {
        labelService.registerFormatter({
            scheme: 'file',
            formatting: {
                label: '${path}',
                separator: sep,
                tildify: !isWindows,
                normalizeDriveLetter: isWindows
            }
        });
        const uri1 = TestWorkspace.folders[0].uri.with({ path: TestWorkspace.folders[0].uri.path.concat('/a/b/c/d') });
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: true }), isWindows ? 'a\\b\\c\\d' : 'a/b/c/d');
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), isWindows ? 'C:\\testWorkspace\\a\\b\\c\\d' : '/testWorkspace/a/b/c/d');
        assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'd');
        const uri2 = URI.file('c:\\1/2/3');
        assert.strictEqual(labelService.getUriLabel(uri2, { relative: false }), isWindows ? 'C:\\1\\2\\3' : '/c:\\1/2/3');
        assert.strictEqual(labelService.getUriBasenameLabel(uri2), '3');
    });
    test('separator', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            formatting: {
                label: 'LABEL\\${path}\\${authority}\\END',
                separator: '\\',
                tildify: true,
                normalizeDriveLetter: true
            }
        });
        const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL\\\\1\\2\\3\\4\\5\\microsoft.com\\END');
        assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'END');
    });
    test('custom authority', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            authority: 'micro*',
            formatting: {
                label: 'LABEL/${path}/${authority}/END',
                separator: '/'
            }
        });
        const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL//1/2/3/4/5/microsoft.com/END');
        assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'END');
    });
    test('mulitple authority', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            authority: 'not_matching_but_long',
            formatting: {
                label: 'first',
                separator: '/'
            }
        });
        labelService.registerFormatter({
            scheme: 'vscode',
            authority: 'microsof*',
            formatting: {
                label: 'second',
                separator: '/'
            }
        });
        labelService.registerFormatter({
            scheme: 'vscode',
            authority: 'mi*',
            formatting: {
                label: 'third',
                separator: '/'
            }
        });
        // Make sure the most specific authority is picked
        const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'second');
        assert.strictEqual(labelService.getUriBasenameLabel(uri1), 'second');
    });
    test('custom query', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            formatting: {
                label: 'LABEL${query.prefix}: ${query.path}/END',
                separator: '/',
                tildify: true,
                normalizeDriveLetter: true
            }
        });
        const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ prefix: 'prefix', path: 'path' }))}`);
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABELprefix: path/END');
    });
    test('custom query without value', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            formatting: {
                label: 'LABEL${query.prefix}: ${query.path}/END',
                separator: '/',
                tildify: true,
                normalizeDriveLetter: true
            }
        });
        const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ path: 'path' }))}`);
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: path/END');
    });
    test('custom query without query json', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            formatting: {
                label: 'LABEL${query.prefix}: ${query.path}/END',
                separator: '/',
                tildify: true,
                normalizeDriveLetter: true
            }
        });
        const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5?path=foo');
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: /END');
    });
    test('custom query without query', function () {
        labelService.registerFormatter({
            scheme: 'vscode',
            formatting: {
                label: 'LABEL${query.prefix}: ${query.path}/END',
                separator: '/',
                tildify: true,
                normalizeDriveLetter: true
            }
        });
        const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
        assert.strictEqual(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: /END');
    });
    test('label caching', () => {
        const m = new Memento('cachedResourceLabelFormatters2', storageService).getMemento(0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        const makeFormatter = (scheme) => ({ formatting: { label: `\${path} (${scheme})`, separator: '/' }, scheme });
        assert.deepStrictEqual(m, {});
        // registers a new formatter:
        labelService.registerCachedFormatter(makeFormatter('a'));
        assert.deepStrictEqual(m, { formatters: [makeFormatter('a')] });
        // registers a 2nd formatter:
        labelService.registerCachedFormatter(makeFormatter('b'));
        assert.deepStrictEqual(m, { formatters: [makeFormatter('b'), makeFormatter('a')] });
        // promotes a formatter on re-register:
        labelService.registerCachedFormatter(makeFormatter('a'));
        assert.deepStrictEqual(m, { formatters: [makeFormatter('a'), makeFormatter('b')] });
        // no-ops if already in first place:
        labelService.registerCachedFormatter(makeFormatter('a'));
        assert.deepStrictEqual(m, { formatters: [makeFormatter('a'), makeFormatter('b')] });
        // limits the cache:
        for (let i = 0; i < 100; i++) {
            labelService.registerCachedFormatter(makeFormatter(`i${i}`));
        }
        const expected = [];
        for (let i = 50; i < 100; i++) {
            expected.unshift(makeFormatter(`i${i}`));
        }
        assert.deepStrictEqual(m, { formatters: expected });
        delete m.formatters;
    });
});
suite('multi-root workspace', () => {
    let labelService;
    const disposables = new DisposableStore();
    setup(() => {
        const sources = URI.file('folder1/src');
        const tests = URI.file('folder1/test');
        const other = URI.file('folder2');
        labelService = disposables.add(new LabelService(TestEnvironmentService, new TestContextService(new Workspace('test-workspace', [
            new WorkspaceFolder({ uri: sources, index: 0, name: 'Sources' }),
            new WorkspaceFolder({ uri: tests, index: 1, name: 'Tests' }),
            new WorkspaceFolder({ uri: other, index: 2, name: resources.basename(other) }),
        ])), new TestPathService(), new TestRemoteAgentService(), disposables.add(new TestStorageService()), disposables.add(new TestLifecycleService())));
    });
    teardown(() => {
        disposables.clear();
    });
    test('labels of files in multiroot workspaces are the foldername followed by offset from the folder', () => {
        labelService.registerFormatter({
            scheme: 'file',
            formatting: {
                label: '${authority}${path}',
                separator: '/',
                tildify: false,
                normalizeDriveLetter: false,
                authorityPrefix: '//',
                workspaceSuffix: ''
            }
        });
        const tests = {
            'folder1/src/file': 'Sources • file',
            'folder1/src/folder/file': 'Sources • folder/file',
            'folder1/src': 'Sources',
            'folder1/other': '/folder1/other',
            'folder2/other': 'folder2 • other',
        };
        Object.entries(tests).forEach(([path, label]) => {
            const generated = labelService.getUriLabel(URI.file(path), { relative: true });
            assert.strictEqual(generated, label);
        });
    });
    test('labels with context after path', () => {
        labelService.registerFormatter({
            scheme: 'file',
            formatting: {
                label: '${path} (${scheme})',
                separator: '/',
            }
        });
        const tests = {
            'folder1/src/file': 'Sources • file (file)',
            'folder1/src/folder/file': 'Sources • folder/file (file)',
            'folder1/src': 'Sources',
            'folder1/other': '/folder1/other (file)',
            'folder2/other': 'folder2 • other (file)',
        };
        Object.entries(tests).forEach(([path, label]) => {
            const generated = labelService.getUriLabel(URI.file(path), { relative: true });
            assert.strictEqual(generated, label, path);
        });
    });
    test('stripPathStartingSeparator', () => {
        labelService.registerFormatter({
            scheme: 'file',
            formatting: {
                label: '${path}',
                separator: '/',
                stripPathStartingSeparator: true
            }
        });
        const tests = {
            'folder1/src/file': 'Sources • file',
            'other/blah': 'other/blah',
        };
        Object.entries(tests).forEach(([path, label]) => {
            const generated = labelService.getUriLabel(URI.file(path), { relative: true });
            assert.strictEqual(generated, label, path);
        });
    });
    test('stripPathSegments strips leading path segments', () => {
        labelService.registerFormatter({
            scheme: 'vscode-agent-host',
            formatting: {
                label: '${path}',
                separator: '/',
                stripPathSegments: 2
            }
        });
        const uri = URI.from({ scheme: 'vscode-agent-host', authority: 'my-server', path: '/file//home/user/project/file.ts' });
        const generated = labelService.getUriLabel(uri, { relative: false });
        assert.strictEqual(generated, '/home/user/project/file.ts');
    });
    test('stripPathSegments combined with stripPathStartingSeparator', () => {
        labelService.registerFormatter({
            scheme: 'vscode-agent-host',
            formatting: {
                label: '${path}',
                separator: '/',
                stripPathSegments: 2,
                stripPathStartingSeparator: true
            }
        });
        const uri = URI.from({ scheme: 'vscode-agent-host', authority: 'my-server', path: '/file//home/user/file.ts' });
        const generated = labelService.getUriLabel(uri, { relative: false });
        assert.strictEqual(generated, 'home/user/file.ts');
    });
    test('stripPathSegments with fewer segments than requested', () => {
        labelService.registerFormatter({
            scheme: 'test-strip',
            formatting: {
                label: '${path}',
                separator: '/',
                stripPathSegments: 5
            }
        });
        const uri = URI.from({ scheme: 'test-strip', path: '/a/b' });
        const generated = labelService.getUriLabel(uri, { relative: false });
        // Should strip as many as possible without crashing
        assert.strictEqual(generated, '/b');
    });
    test('relative label without formatter', () => {
        const rootFolder = URI.parse('myscheme://myauthority/');
        labelService = disposables.add(new LabelService(TestEnvironmentService, new TestContextService(new Workspace('test-workspace', [
            new WorkspaceFolder({ uri: rootFolder, index: 0, name: 'FSProotFolder' }),
        ])), new TestPathService(undefined, rootFolder.scheme), new TestRemoteAgentService(), disposables.add(new TestStorageService()), disposables.add(new TestLifecycleService())));
        const generated = labelService.getUriLabel(URI.parse('myscheme://myauthority/some/folder/test.txt'), { relative: true });
        if (isWindows) {
            assert.strictEqual(generated, 'some\\folder\\test.txt');
        }
        else {
            assert.strictEqual(generated, 'some/folder/test.txt');
        }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
suite('workspace at FSP root', () => {
    let labelService;
    setup(() => {
        const rootFolder = URI.parse('myscheme://myauthority/');
        labelService = new LabelService(TestEnvironmentService, new TestContextService(new Workspace('test-workspace', [
            new WorkspaceFolder({ uri: rootFolder, index: 0, name: 'FSProotFolder' }),
        ])), new TestPathService(), new TestRemoteAgentService(), new TestStorageService(), new TestLifecycleService());
        labelService.registerFormatter({
            scheme: 'myscheme',
            formatting: {
                label: '${scheme}://${authority}${path}',
                separator: '/',
                tildify: false,
                normalizeDriveLetter: false,
                workspaceSuffix: '',
                authorityPrefix: '',
                stripPathStartingSeparator: false
            }
        });
    });
    test('non-relative label', () => {
        const tests = {
            'myscheme://myauthority/myFile1.txt': 'myscheme://myauthority/myFile1.txt',
            'myscheme://myauthority/folder/myFile2.txt': 'myscheme://myauthority/folder/myFile2.txt',
        };
        Object.entries(tests).forEach(([uriString, label]) => {
            const generated = labelService.getUriLabel(URI.parse(uriString), { relative: false });
            assert.strictEqual(generated, label);
        });
    });
    test('relative label', () => {
        const tests = {
            'myscheme://myauthority/myFile1.txt': 'myFile1.txt',
            'myscheme://myauthority/folder/myFile2.txt': 'folder/myFile2.txt',
        };
        Object.entries(tests).forEach(([uriString, label]) => {
            const generated = labelService.getUriLabel(URI.parse(uriString), { relative: true });
            assert.strictEqual(generated, label);
        });
    });
    test('relative label with explicit path separator', () => {
        let generated = labelService.getUriLabel(URI.parse('myscheme://myauthority/some/folder/test.txt'), { relative: true, separator: '/' });
        assert.strictEqual(generated, 'some/folder/test.txt');
        generated = labelService.getUriLabel(URI.parse('myscheme://myauthority/some/folder/test.txt'), { relative: true, separator: '\\' });
        assert.strictEqual(generated, 'some\\folder\\test.txt');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFiZWwudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYWJlbC90ZXN0L2Jyb3dzZXIvbGFiZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssU0FBUyxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JFLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsb0JBQW9CLEVBQUUsZUFBZSxFQUFFLHNCQUFzQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDMUosT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxTQUFTLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUMxRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRXhELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFMUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7SUFDdkIsSUFBSSxZQUEwQixDQUFDO0lBQy9CLElBQUksY0FBa0MsQ0FBQztJQUV2QyxLQUFLLENBQUMsR0FB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