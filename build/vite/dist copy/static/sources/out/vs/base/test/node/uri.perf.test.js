/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { readFileSync } from 'fs';
import { FileAccess } from '../../common/network.js';
import { URI } from '../../common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
suite('URI - perf', function () {
    // COMMENT THIS OUT TO RUN TEST
    if (1) {
        return;
    }
    ensureNoDisposablesAreLeakedInTestSuite();
    let manyFileUris;
    setup(function () {
        manyFileUris = [];
        const data = readFileSync(FileAccess.asFileUri('vs/base/test/node/uri.perf.data.txt').fsPath).toString();
        const lines = data.split('\n');
        for (const line of lines) {
            manyFileUris.push(URI.file(line));
        }
    });
    function perfTest(name, callback) {
        test(name, _done => {
            const t1 = Date.now();
            callback();
            const d = Date.now() - t1;
            console.log(`${name} took ${d}ms (${(d / manyFileUris.length).toPrecision(3)} ms/uri) (${manyFileUris.length} uris)`);
            _done();
        });
    }
    perfTest('toString', function () {
        for (const uri of manyFileUris) {
            const data = uri.toString();
            assert.ok(data);
        }
    });
    perfTest('toString(skipEncoding)', function () {
        for (const uri of manyFileUris) {
            const data = uri.toString(true);
            assert.ok(data);
        }
    });
    perfTest('fsPath', function () {
        for (const uri of manyFileUris) {
            const data = uri.fsPath;
            assert.ok(data);
        }
    });
    perfTest('toJSON', function () {
        for (const uri of manyFileUris) {
            const data = uri.toJSON();
            assert.ok(data);
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpLnBlcmYudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9ub2RlL3VyaS5wZXJmLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDbEMsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3JELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMxQyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU3RSxLQUFLLENBQUMsWUFBWSxFQUFFO0lBRW5CLCtCQUErQjtJQUMvQixJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ1AsT0FBTztJQUNSLENBQUM7SUFFRCx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksWUFBbUIsQ0FBQztJQUN4QixLQUFLLENBQUM7UUFDTCxZQUFZLEdBQUcsRUFBRSxDQUFDO1FBQ2xCLE1BQU0sSUFBSSxHQUFHLFlBQVksQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLHFDQUFxQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDekcsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzFCLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ25DLENBQUM7SUFDRixDQUFDLENBQUMsQ0FBQztJQUVILFNBQVMsUUFBUSxDQUFDLElBQVksRUFBRSxRQUFrQjtRQUNqRCxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxFQUFFO1lBQ2xCLE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN0QixRQUFRLEVBQUUsQ0FBQztZQUNYLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUM7WUFDMUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsYUFBYSxZQUFZLENBQUMsTUFBTSxRQUFRLENBQUMsQ0FBQztZQUN0SCxLQUFLLEVBQUUsQ0FBQztRQUNULENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELFFBQVEsQ0FBQyxVQUFVLEVBQUU7UUFDcEIsS0FBSyxNQUFNLEdBQUcsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNoQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDNUIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsd0JBQXdCLEVBQUU7UUFDbEMsS0FBSyxNQUFNLEdBQUcsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNoQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ2hDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakIsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLFFBQVEsRUFBRTtRQUNsQixLQUFLLE1BQU0sR0FBRyxJQUFJLFlBQVksRUFBRSxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUM7WUFDeEIsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQixDQUFDO0lBQ0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsUUFBUSxFQUFFO1FBQ2xCLEtBQUssTUFBTSxHQUFHLElBQUksWUFBWSxFQUFFLENBQUM7WUFDaEMsTUFBTSxJQUFJLEdBQUcsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakIsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0FBRUosQ0FBQyxDQUFDLENBQUMifQ==