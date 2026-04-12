/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { MainThreadDocumentContentProviders } from '../../browser/mainThreadDocumentContentProviders.js';
import { createTextModel } from '../../../../editor/test/common/testTextModel.js';
import { mock } from '../../../../base/test/common/mock.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('MainThreadDocumentContentProviders', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('events are processed properly', function () {
        const uri = URI.parse('test:uri');
        const model = createTextModel('1', undefined, undefined, uri);
        const providers = new MainThreadDocumentContentProviders(new TestRPCProtocol(), null, null, new class extends mock() {
            getModel(_uri) {
                assert.strictEqual(uri.toString(), _uri.toString());
                return model;
            }
        }, new class extends mock() {
            computeMoreMinimalEdits(_uri, data) {
                assert.strictEqual(model.getValue(), '1');
                return Promise.resolve(data);
            }
        });
        store.add(model);
        store.add(providers);
        return new Promise((resolve, reject) => {
            let expectedEvents = 1;
            store.add(model.onDidChangeContent(e => {
                expectedEvents -= 1;
                try {
                    assert.ok(expectedEvents >= 0);
                }
                catch (err) {
                    reject(err);
                }
                if (model.getValue() === '1\n2\n3') {
                    model.dispose();
                    resolve();
                }
            }));
            providers.$onVirtualDocumentChange(uri, '1\n2');
            providers.$onVirtualDocumentChange(uri, '1\n2\n3');
        });
    });
    test('model disposed during async operation', async function () {
        const uri = URI.parse('test:disposed');
        const model = createTextModel('initial', undefined, undefined, uri);
        let disposeModelDuringEdit = false;
        const providers = new MainThreadDocumentContentProviders(new TestRPCProtocol(), null, null, new class extends mock() {
            getModel(_uri) {
                assert.strictEqual(uri.toString(), _uri.toString());
                return model;
            }
        }, new class extends mock() {
            async computeMoreMinimalEdits(_uri, data) {
                // Simulate async operation
                await new Promise(resolve => setTimeout(resolve, 10));
                // Dispose model during the async operation if flag is set
                if (disposeModelDuringEdit) {
                    model.dispose();
                }
                return data;
            }
        });
        store.add(model);
        store.add(providers);
        // First call should work normally
        await providers.$onVirtualDocumentChange(uri, 'updated');
        assert.strictEqual(model.getValue(), 'updated');
        // Second call should not throw even though model gets disposed during async operation
        disposeModelDuringEdit = true;
        await providers.$onVirtualDocumentChange(uri, 'should not apply');
        // Model should be disposed and value unchanged
        assert.ok(model.isDisposed());
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZERvY3VtZW50Q29udGVudFByb3ZpZGVycy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvbWFpblRocmVhZERvY3VtZW50Q29udGVudFByb3ZpZGVycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDekcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUc1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFL0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEcsS0FBSyxDQUFDLG9DQUFvQyxFQUFFO0lBRTNDLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsSUFBSSxDQUFDLCtCQUErQixFQUFFO1FBRXJDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEMsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRTlELE1BQU0sU0FBUyxHQUFHLElBQUksa0NBQWtDLENBQUMsSUFBSSxlQUFlLEVBQUUsRUFBRSxJQUFLLEVBQUUsSUFBSyxFQUMzRixJQUFJLEtBQU0sU0FBUSxJQUFJLEVBQWlCO1lBQzdCLFFBQVEsQ0FBQyxJQUFTO2dCQUMxQixNQUFN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