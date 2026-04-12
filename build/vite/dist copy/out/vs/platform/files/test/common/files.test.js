/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isEqual, isEqualOrParent } from '../../../../base/common/extpath.js';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../base/test/common/utils.js';
import { FileChangesEvent, isParent } from '../../common/files.js';
suite('Files', () => {
    test('FileChangesEvent - basics', function () {
        const changes = [
            { resource: toResource.call(this, '/foo/updated.txt'), type: 0 /* FileChangeType.UPDATED */ },
            { resource: toResource.call(this, '/foo/otherupdated.txt'), type: 0 /* FileChangeType.UPDATED */ },
            { resource: toResource.call(this, '/added.txt'), type: 1 /* FileChangeType.ADDED */ },
            { resource: toResource.call(this, '/bar/deleted.txt'), type: 2 /* FileChangeType.DELETED */ },
            { resource: toResource.call(this, '/bar/folder'), type: 2 /* FileChangeType.DELETED */ },
            { resource: toResource.call(this, '/BAR/FOLDER'), type: 2 /* FileChangeType.DELETED */ }
        ];
        for (const ignorePathCasing of [false, true]) {
            const event = new FileChangesEvent(changes, ignorePathCasing);
            assert(!event.contains(toResource.call(this, '/foo'), 0 /* FileChangeType.UPDATED */));
            assert(event.affects(toResource.call(this, '/foo'), 0 /* FileChangeType.UPDATED */));
            assert(event.contains(toResource.call(this, '/foo/updated.txt'), 0 /* FileChangeType.UPDATED */));
            assert(event.affects(toResource.call(this, '/foo/updated.txt'), 0 /* FileChangeType.UPDATED */));
            assert(event.contains(toResource.call(this, '/foo/updated.txt'), 0 /* FileChangeType.UPDATED */, 1 /* FileChangeType.ADDED */));
            assert(event.affects(toResource.call(this, '/foo/updated.txt'), 0 /* FileChangeType.UPDATED */, 1 /* FileChangeType.ADDED */));
            assert(event.contains(toResource.call(this, '/foo/updated.txt'), 0 /* FileChangeType.UPDATED */, 1 /* FileChangeType.ADDED */, 2 /* FileChangeType.DELETED */));
            assert(!event.contains(toResource.call(this, '/foo/updated.txt'), 1 /* FileChangeType.ADDED */, 2 /* FileChangeType.DELETED */));
            assert(!event.contains(toResource.call(this, '/foo/updated.txt'), 1 /* FileChangeType.ADDED */));
            assert(!event.contains(toResource.call(this, '/foo/updated.txt'), 2 /* FileChangeType.DELETED */));
            assert(!event.affects(toResource.call(this, '/foo/updated.txt'), 2 /* FileChangeType.DELETED */));
            assert(event.contains(toResource.call(this, '/bar/folder'), 2 /* FileChangeType.DELETED */));
            assert(event.contains(toResource.call(this, '/BAR/FOLDER'), 2 /* FileChangeType.DELETED */));
            assert(event.affects(toResource.call(this, '/BAR'), 2 /* FileChangeType.DELETED */));
            if (ignorePathCasing) {
                assert(event.contains(toResource.call(this, '/BAR/folder'), 2 /* FileChangeType.DELETED */));
                assert(event.affects(toResource.call(this, '/bar'), 2 /* FileChangeType.DELETED */));
            }
            else {
                assert(!event.contains(toResource.call(this, '/BAR/folder'), 2 /* FileChangeType.DELETED */));
                assert(event.affects(toResource.call(this, '/bar'), 2 /* FileChangeType.DELETED */));
            }
            assert(event.contains(toResource.call(this, '/bar/folder/somefile'), 2 /* FileChangeType.DELETED */));
            assert(event.contains(toResource.call(this, '/bar/folder/somefile/test.txt'), 2 /* FileChangeType.DELETED */));
            assert(event.contains(toResource.call(this, '/BAR/FOLDER/somefile/test.txt'), 2 /* FileChangeType.DELETED */));
            if (ignorePathCasing) {
                assert(event.contains(toResource.call(this, '/BAR/folder/somefile/test.txt'), 2 /* FileChangeType.DELETED */));
            }
            else {
                assert(!event.contains(toResource.call(this, '/BAR/folder/somefile/test.txt'), 2 /* FileChangeType.DELETED */));
            }
            assert(!event.contains(toResource.call(this, '/bar/folder2/somefile'), 2 /* FileChangeType.DELETED */));
            assert.strictEqual(1, event.rawAdded.length);
            assert.strictEqual(2, event.rawUpdated.length);
            assert.strictEqual(3, event.rawDeleted.length);
            assert.strictEqual(true, event.gotAdded());
            assert.strictEqual(true, event.gotUpdated());
            assert.strictEqual(true, event.gotDeleted());
        }
    });
    test('FileChangesEvent - supports multiple changes on file tree', function () {
        for (const type of [1 /* FileChangeType.ADDED */, 0 /* FileChangeType.UPDATED */, 2 /* FileChangeType.DELETED */]) {
            const changes = [
                { resource: toResource.call(this, '/foo/bar/updated.txt'), type },
                { resource: toResource.call(this, '/foo/bar/otherupdated.txt'), type },
                { resource: toResource.call(this, '/foo/bar'), type },
                { resource: toResource.call(this, '/foo'), type },
                { resource: toResource.call(this, '/bar'), type },
                { resource: toResource.call(this, '/bar/foo'), type },
                { resource: toResource.call(this, '/bar/foo/updated.txt'), type },
                { resource: toResource.call(this, '/bar/foo/otherupdated.txt'), type }
            ];
            for (const ignorePathCasing of [false, true]) {
                const event = new FileChangesEvent(changes, ignorePathCasing);
                for (const change of changes) {
                    assert(event.contains(change.resource, type));
                    assert(event.affects(change.resource, type));
                }
                assert(event.affects(toResource.call(this, '/foo'), type));
                assert(event.affects(toResource.call(this, '/bar'), type));
                assert(event.affects(toResource.call(this, '/'), type));
                assert(!event.affects(toResource.call(this, '/foobar'), type));
                assert(!event.contains(toResource.call(this, '/some/foo/bar'), type));
                assert(!event.affects(toResource.call(this, '/some/foo/bar'), type));
                assert(!event.contains(toResource.call(this, '/some/bar'), type));
                assert(!event.affects(toResource.call(this, '/some/bar'), type));
                switch (type) {
                    case 1 /* FileChangeType.ADDED */:
                        assert.strictEqual(8, event.rawAdded.length);
                        break;
                    case 2 /* FileChangeType.DELETED */:
                        assert.strictEqual(8, event.rawDeleted.length);
                        break;
                }
            }
        }
    });
    test('FileChangesEvent - correlation', function () {
        let changes = [
            { resource: toResource.call(this, '/foo/updated.txt'), type: 0 /* FileChangeType.UPDATED */ },
            { resource: toResource.call(this, '/foo/otherupdated.txt'), type: 0 /* FileChangeType.UPDATED */ },
            { resource: toResource.call(this, '/added.txt'), type: 1 /* FileChangeType.ADDED */ },
        ];
        let event = new FileChangesEvent(changes, true);
        assert.strictEqual(event.hasCorrelation(), false);
        assert.strictEqual(event.correlates(100), false);
        changes = [
            { resource: toResource.call(this, '/foo/updated.txt'), type: 0 /* FileChangeType.UPDATED */, cId: 100 },
            { resource: toResource.call(this, '/foo/otherupdated.txt'), type: 0 /* FileChangeType.UPDATED */, cId: 100 },
            { resource: toResource.call(this, '/added.txt'), type: 1 /* FileChangeType.ADDED */, cId: 100 },
        ];
        event = new FileChangesEvent(changes, true);
        assert.strictEqual(event.hasCorrelation(), true);
        assert.strictEqual(event.correlates(100), true);
        assert.strictEqual(event.correlates(120), false);
        changes = [
            { resource: toResource.call(this, '/foo/updated.txt'), type: 0 /* FileChangeType.UPDATED */, cId: 100 },
            { resource: toResource.call(this, '/foo/otherupdated.txt'), type: 0 /* FileChangeType.UPDATED */ },
            { resource: toResource.call(this, '/added.txt'), type: 1 /* FileChangeType.ADDED */, cId: 100 },
        ];
        event = new FileChangesEvent(changes, true);
        assert.strictEqual(event.hasCorrelation(), false);
        assert.strictEqual(event.correlates(100), false);
        assert.strictEqual(event.correlates(120), false);
        changes = [
            { resource: toResource.call(this, '/foo/updated.txt'), type: 0 /* FileChangeType.UPDATED */, cId: 100 },
            { resource: toResource.call(this, '/foo/otherupdated.txt'), type: 0 /* FileChangeType.UPDATED */, cId: 120 },
            { resource: toResource.call(this, '/added.txt'), type: 1 /* FileChangeType.ADDED */, cId: 100 },
        ];
        event = new FileChangesEvent(changes, true);
        assert.strictEqual(event.hasCorrelation(), false);
        assert.strictEqual(event.correlates(100), false);
        assert.strictEqual(event.correlates(120), false);
    });
    function testIsEqual(testMethod) {
        // corner cases
        assert(testMethod('', '', true));
        assert(!testMethod(null, '', true));
        assert(!testMethod(undefined, '', true));
        // basics (string)
        assert(testMethod('/', '/', true));
        assert(testMethod('/some', '/some', true));
        assert(testMethod('/some/path', '/some/path', true));
        assert(testMethod('c:\\', 'c:\\', true));
        assert(testMethod('c:\\some', 'c:\\some', true));
        assert(testMethod('c:\\some\\path', 'c:\\some\\path', true));
        assert(testMethod('/someöäü/path', '/someöäü/path', true));
        assert(testMethod('c:\\someöäü\\path', 'c:\\someöäü\\path', true));
        assert(!testMethod('/some/path', '/some/other/path', true));
        assert(!testMethod('c:\\some\\path', 'c:\\some\\other\\path', true));
        assert(!testMethod('c:\\some\\path', 'd:\\some\\path', true));
        assert(testMethod('/some/path', '/some/PATH', true));
        assert(testMethod('/someöäü/path', '/someÖÄÜ/PATH', true));
        assert(testMethod('c:\\some\\path', 'c:\\some\\PATH', true));
        assert(testMethod('c:\\someöäü\\path', 'c:\\someÖÄÜ\\PATH', true));
        assert(testMethod('c:\\some\\path', 'C:\\some\\PATH', true));
    }
    test('isEqual (ignoreCase)', function () {
        testIsEqual(isEqual);
        // basics (uris)
        assert(isEqual(URI.file('/some/path').fsPath, URI.file('/some/path').fsPath, true));
        assert(isEqual(URI.file('c:\\some\\path').fsPath, URI.file('c:\\some\\path').fsPath, true));
        assert(isEqual(URI.file('/someöäü/path').fsPath, URI.file('/someöäü/path').fsPath, true));
        assert(isEqual(URI.file('c:\\someöäü\\path').fsPath, URI.file('c:\\someöäü\\path').fsPath, true));
        assert(!isEqual(URI.file('/some/path').fsPath, URI.file('/some/other/path').fsPath, true));
        assert(!isEqual(URI.file('c:\\some\\path').fsPath, URI.file('c:\\some\\other\\path').fsPath, true));
        assert(isEqual(URI.file('/some/path').fsPath, URI.file('/some/PATH').fsPath, true));
        assert(isEqual(URI.file('/someöäü/path').fsPath, URI.file('/someÖÄÜ/PATH').fsPath, true));
        assert(isEqual(URI.file('c:\\some\\path').fsPath, URI.file('c:\\some\\PATH').fsPath, true));
        assert(isEqual(URI.file('c:\\someöäü\\path').fsPath, URI.file('c:\\someÖÄÜ\\PATH').fsPath, true));
        assert(isEqual(URI.file('c:\\some\\path').fsPath, URI.file('C:\\some\\PATH').fsPath, true));
    });
    test('isParent (ignorecase)', function () {
        if (isWindows) {
            assert(isParent('c:\\some\\path', 'c:\\', true));
            assert(isParent('c:\\some\\path', 'c:\\some', true));
            assert(isParent('c:\\some\\path', 'c:\\some\\', true));
            assert(isParent('c:\\someöäü\\path', 'c:\\someöäü', true));
            assert(isParent('c:\\someöäü\\path', 'c:\\someöäü\\', true));
            assert(isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar', true));
            assert(isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\', true));
            assert(isParent('c:\\some\\path', 'C:\\', true));
            assert(isParent('c:\\some\\path', 'c:\\SOME', true));
            assert(isParent('c:\\some\\path', 'c:\\SOME\\', true));
            assert(!isParent('c:\\some\\path', 'd:\\', true));
            assert(!isParent('c:\\some\\path', 'c:\\some\\path', true));
            assert(!isParent('c:\\some\\path', 'd:\\some\\path', true));
            assert(!isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\barr', true));
            assert(!isParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test', true));
        }
        if (isMacintosh || isLinux) {
            assert(isParent('/some/path', '/', true));
            assert(isParent('/some/path', '/some', true));
            assert(isParent('/some/path', '/some/', true));
            assert(isParent('/someöäü/path', '/someöäü', true));
            assert(isParent('/someöäü/path', '/someöäü/', true));
            assert(isParent('/foo/bar/test.ts', '/foo/bar', true));
            assert(isParent('/foo/bar/test.ts', '/foo/bar/', true));
            assert(isParent('/some/path', '/SOME', true));
            assert(isParent('/some/path', '/SOME/', true));
            assert(isParent('/someöäü/path', '/SOMEÖÄÜ', true));
            assert(isParent('/someöäü/path', '/SOMEÖÄÜ/', true));
            assert(!isParent('/some/path', '/some/path', true));
            assert(!isParent('/foo/bar/test.ts', '/foo/barr', true));
            assert(!isParent('/foo/bar/test.ts', '/foo/bar/test', true));
        }
    });
    test('isEqualOrParent (ignorecase)', function () {
        // same assertions apply as with isEqual()
        testIsEqual(isEqualOrParent); //
        if (isWindows) {
            assert(isEqualOrParent('c:\\some\\path', 'c:\\', true));
            assert(isEqualOrParent('c:\\some\\path', 'c:\\some', true));
            assert(isEqualOrParent('c:\\some\\path', 'c:\\some\\', true));
            assert(isEqualOrParent('c:\\someöäü\\path', 'c:\\someöäü', true));
            assert(isEqualOrParent('c:\\someöäü\\path', 'c:\\someöäü\\', true));
            assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar', true));
            assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\', true));
            assert(isEqualOrParent('c:\\some\\path', 'c:\\some\\path', true));
            assert(isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test.ts', true));
            assert(isEqualOrParent('c:\\some\\path', 'C:\\', true));
            assert(isEqualOrParent('c:\\some\\path', 'c:\\SOME', true));
            assert(isEqualOrParent('c:\\some\\path', 'c:\\SOME\\', true));
            assert(!isEqualOrParent('c:\\some\\path', 'd:\\', true));
            assert(!isEqualOrParent('c:\\some\\path', 'd:\\some\\path', true));
            assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\barr', true));
            assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test', true));
            assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\bar\\test.', true));
            assert(!isEqualOrParent('c:\\foo\\bar\\test.ts', 'c:\\foo\\BAR\\test.', true));
        }
        if (isMacintosh || isLinux) {
            assert(isEqualOrParent('/some/path', '/', true));
            assert(isEqualOrParent('/some/path', '/some', true));
            assert(isEqualOrParent('/some/path', '/some/', true));
            assert(isEqualOrParent('/someöäü/path', '/someöäü', true));
            assert(isEqualOrParent('/someöäü/path', '/someöäü/', true));
            assert(isEqualOrParent('/foo/bar/test.ts', '/foo/bar', true));
            assert(isEqualOrParent('/foo/bar/test.ts', '/foo/bar/', true));
            assert(isEqualOrParent('/some/path', '/some/path', true));
            assert(isEqualOrParent('/some/path', '/SOME', true));
            assert(isEqualOrParent('/some/path', '/SOME/', true));
            assert(isEqualOrParent('/someöäü/path', '/SOMEÖÄÜ', true));
            assert(isEqualOrParent('/someöäü/path', '/SOMEÖÄÜ/', true));
            assert(!isEqualOrParent('/foo/bar/test.ts', '/foo/barr', true));
            assert(!isEqualOrParent('/foo/bar/test.ts', '/foo/bar/test', true));
            assert(!isEqualOrParent('foo/bar/test.ts', 'foo/bar/test.', true));
            assert(!isEqualOrParent('foo/bar/test.ts', 'foo/BAR/test.', true));
        }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZXMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3QvY29tbW9uL2ZpbGVzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDOUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdEYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQStCLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWhHLEtBQUssQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO0lBRW5CLElBQUksQ0FBQywyQkFBMkIsRUFBRTtRQUNqQyxNQUFNLE9BQU8sR0FBRztZQUNmLEVBQUUsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGtCQUFrQixDQUFDLEVBQUUsSUFBSSxnQ0FBd0IsRUFBRTtZQUNyRixFQUFFLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSx1QkFBdUIsQ0FBQyxFQUFFLElBQUksZ0NBQXdCLEVBQUU7WUFDMUYsRUFBRSxRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWSxDQUFDLEVBQUUsSUFBSSw4QkFBc0IsRUFBRTtZQUM3RSxFQUFFLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxrQkFBa0IsQ0FBQyxFQUFFLElBQUksZ0NB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