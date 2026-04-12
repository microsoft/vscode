/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as platform from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { fixDriveC, getAbsoluteGlob } from '../../node/ripgrepFileSearch.js';
suite('RipgrepFileSearch - etc', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testGetAbsGlob(params) {
        const [folder, glob, expectedResult] = params;
        assert.strictEqual(fixDriveC(getAbsoluteGlob(folder, glob)), expectedResult, JSON.stringify(params));
    }
    (!platform.isWindows ? test.skip : test)('getAbsoluteGlob_win', () => {
        [
            ['C:/foo/bar', 'glob/**', '/foo\\bar\\glob\\**'],
            ['c:/', 'glob/**', '/glob\\**'],
            ['C:\\foo\\bar', 'glob\\**', '/foo\\bar\\glob\\**'],
            ['c:\\foo\\bar', 'glob\\**', '/foo\\bar\\glob\\**'],
            ['c:\\', 'glob\\**', '/glob\\**'],
            ['\\\\localhost\\c$\\foo\\bar', 'glob/**', '\\\\localhost\\c$\\foo\\bar\\glob\\**'],
            // absolute paths are not resolved further
            ['c:/foo/bar', '/path/something', '/path/something'],
            ['c:/foo/bar', 'c:\\project\\folder', '/project\\folder']
        ].forEach(testGetAbsGlob);
    });
    (platform.isWindows ? test.skip : test)('getAbsoluteGlob_posix', () => {
        [
            ['/foo/bar', 'glob/**', '/foo/bar/glob/**'],
            ['/', 'glob/**', '/glob/**'],
            // absolute paths are not resolved further
            ['/', '/project/folder', '/project/folder'],
        ].forEach(testGetAbsGlob);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmlwZ3JlcEZpbGVTZWFyY2gudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvdGVzdC9ub2RlL3JpcGdyZXBGaWxlU2VhcmNoLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxRQUFRLE1BQU0sd0NBQXdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUU3RSxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLHVDQUF1QyxFQUFFLENBQUM7SUFDMUMsU0FBUyxjQUFjLENBQUMsTUFBZ0I7UUFDdkMsTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsY0FBYyxDQUFDLEdBQUcsTUFBTSxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQ3RHLENBQUM7SUFFRCxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO1FBQ3BFO1lBQ0MsQ0FBQyxZQUFZLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixDQUFDO1lBQ2hELENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUM7WUFDL0IsQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLHFCQUFxQixDQUFDO1lBQ25ELENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxxQkFBcUIsQ0FBQztZQUNuRCxDQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsV0FBVyxDQUFDO1lBQ2pDLENBQUMsNkJBQTZCLEVBQUUsU0FBUyxFQUFFLHVDQUF1QyxDQUFDO1lBRW5GLDBDQUEwQztZQUMxQyxDQUFDLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsQ0FBQztZQUNwRCxDQUFDLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsQ0FBQztTQUN6RCxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FBQztJQUVILENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1FBQ3JFO1lBQ0MsQ0FBQyxVQUFVLEVBQUUsU0FBUyxFQUFFLGtCQUFrQixDQUFDO1lBQzNDLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxVQUFVLENBQUM7WUFFNUIsMENBQTBDO1lBQzFDLENBQUMsR0FBRyxFQUFFLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDO1NBQzNDLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQzNCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==