/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { BoundModelReferenceCollection } from '../../browser/mainThreadDocuments.js';
import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { extUri } from '../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('BoundModelReferenceCollection', function () {
    let col;
    setup(function () {
        col = new BoundModelReferenceCollection(extUri, 15, 75);
    });
    teardown(function () {
        col.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('max age', async function () {
        let didDispose = false;
        col.add(URI.parse('test://farboo'), {
            object: {},
            dispose() {
                didDispose = true;
            }
        });
        await timeout(30);
        assert.strictEqual(didDispose, true);
    });
    test('max size', function () {
        const disposed = [];
        col.add(URI.parse('test://farboo'), {
            object: {},
            dispose() {
                disposed.push(0);
            }
        }, 6);
        col.add(URI.parse('test://boofar'), {
            object: {},
            dispose() {
                disposed.push(1);
            }
        }, 6);
        col.add(URI.parse('test://xxxxxxx'), {
            object: {},
            dispose() {
                disposed.push(2);
            }
        }, 70);
        assert.deepStrictEqual(disposed, [0, 1]);
    });
    test('max count', function () {
        col.dispose();
        col = new BoundModelReferenceCollection(extUri, 10000, 10000, 2);
        const disposed = [];
        col.add(URI.parse('test://xxxxxxx'), {
            object: {},
            dispose() {
                disposed.push(0);
            }
        });
        col.add(URI.parse('test://xxxxxxx'), {
            object: {},
            dispose() {
                disposed.push(1);
            }
        });
        col.add(URI.parse('test://xxxxxxx'), {
            object: {},
            dispose() {
                disposed.push(2);
            }
        });
        assert.deepStrictEqual(disposed, [0]);
    });
    test('dispose uri', function () {
        let disposed = [];
        col.add(URI.parse('test:///farboo'), {
            object: {},
            dispose() {
                disposed.push(0);
            }
        });
        col.add(URI.parse('test:///boofar'), {
            object: {},
            dispose() {
                disposed.push(1);
            }
        });
        col.add(URI.parse('test:///boo/far1'), {
            object: {},
            dispose() {
                disposed.push(2);
            }
        });
        col.add(URI.parse('test:///boo/far2'), {
            object: {},
            dispose() {
                disposed.push(3);
            }
        });
        col.add(URI.parse('test:///boo1/far'), {
            object: {},
            dispose() {
                disposed.push(4);
            }
        });
        col.remove(URI.parse('test:///unknown'));
        assert.strictEqual(disposed.length, 0);
        col.remove(URI.parse('test:///farboo'));
        assert.deepStrictEqual(disposed, [0]);
        disposed = [];
        col.remove(URI.parse('test:///boo'));
        assert.deepStrictEqual(disposed, [2, 3]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERvY3VtZW50cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvbWFpblRocmVhZERvY3VtZW50cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxLQUFLLENBQUMsK0JBQStCLEVBQUU7SUFFdEMsSUFBSSxHQUFrQyxDQUFDO0lBRXZDLEtBQUssQ0FBQztRQUNMLEdBQUcsR0FBRyxJQUFJLDZCQUE2QixDQUFDLE1BQU0sRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDekQsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUM7UUFDUixHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDZixDQUFDLENBQUMsQ0FBQztJQUVILHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLO1FBRXBCLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztRQUV2QixHQUFHLENBQUMsR0FBRyxDQUNOLEdBQUcsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQzFCO1lBQ0MsTUFBTSxFQUFFLEVBQUU7WUFDVixPQUFPO2dCQUNOLFVBQVUsR0FBRyxJQUFJLENBQUM7WUFDbkIsQ0FBQztTQUNE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