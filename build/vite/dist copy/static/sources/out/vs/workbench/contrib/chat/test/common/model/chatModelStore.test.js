/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatModelStore } from '../../../common/model/chatModelStore.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { MockChatModel } from './mockChatModel.js';
suite('ChatModelStore', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let testObject;
    let createdModels;
    let willDisposePromises;
    setup(() => {
        createdModels = [];
        willDisposePromises = [];
        testObject = store.add(new ChatModelStore({
            createModel: (props) => {
                const model = new MockChatModel(props.sessionResource);
                createdModels.push(model);
                return model;
            },
            willDisposeModel: async (model) => {
                const p = new DeferredPromise();
                willDisposePromises.push(p);
                await p.p;
            }
        }, new NullLogService()));
    });
    test('create and dispose', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref = testObject.acquireOrCreate(props);
        assert.strictEqual(createdModels.length, 1);
        assert.strictEqual(ref.object, createdModels[0]);
        ref.dispose();
        assert.strictEqual(willDisposePromises.length, 1);
        willDisposePromises[0].complete();
        await testObject.waitForModelDisposals();
        assert.strictEqual(testObject.get(uri), undefined);
    });
    test('resurrection', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref1 = testObject.acquireOrCreate(props);
        const model1 = ref1.object;
        ref1.dispose();
        // Model is pending disposal
        assert.strictEqual(willDisposePromises.length, 1);
        assert.strictEqual(testObject.get(uri), model1);
        // Acquire again - should be resurrected
        const ref2 = testObject.acquireOrCreate(props);
        assert.strictEqual(ref2.object, model1);
        assert.strictEqual(createdModels.length, 1);
        // Finish disposal of the first ref
        willDisposePromises[0].complete();
        await testObject.waitForModelDisposals();
        // Model should still exist because ref2 holds it
        assert.strictEqual(testObject.get(uri), model1);
        ref2.dispose();
    });
    test('get and has', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref = testObject.acquireOrCreate(props);
        assert.strictEqual(testObject.get(uri), ref.object);
        assert.strictEqual(testObject.has(uri), true);
        ref.dispose();
        willDisposePromises[0].complete();
        await testObject.waitForModelDisposals();
        assert.strictEqual(testObject.get(uri), undefined);
        assert.strictEqual(testObject.has(uri), false);
    });
    test('acquireExisting', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        assert.strictEqual(testObject.acquireExisting(uri), undefined);
        const ref1 = testObject.acquireOrCreate(props);
        const ref2 = testObject.acquireExisting(uri);
        assert.ok(ref2);
        assert.strictEqual(ref2.object, ref1.object);
        ref1.dispose();
        ref2.dispose();
        willDisposePromises[0].complete();
        await testObject.waitForModelDisposals();
    });
    test('values', async () => {
        const uri1 = URI.parse('test://session1');
        const uri2 = URI.parse('test://session2');
        const props1 = {
            sessionResource: uri1,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const props2 = {
            sessionResource: uri2,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref1 = testObject.acquireOrCreate(props1);
        const ref2 = testObject.acquireOrCreate(props2);
        const values = Array.from(testObject.values());
        assert.strictEqual(values.length, 2);
        assert.ok(values.includes(ref1.object));
        assert.ok(values.includes(ref2.object));
        ref1.dispose();
        ref2.dispose();
        willDisposePromises[0].complete();
        willDisposePromises[1].complete();
        await testObject.waitForModelDisposals();
    });
    test('dispose store', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref = testObject.acquireOrCreate(props);
        const model = ref.object;
        testObject.dispose();
        assert.strictEqual(model.isDisposed, true);
    });
    test('tracks reference owners and creation owner', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref1 = testObject.acquireOrCreate(props, 'ChatModelStoreTest#create');
        const ref2 = testObject.acquireExisting(uri, 'ChatModelStoreTest#existing');
        const ref3 = testObject.acquireExisting(uri, 'ChatModelStoreTest#existing');
        assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
            totalModels: 1,
            totalReferences: 3,
            models: [{
                    sessionResource: uri,
                    title: '',
                    createdBy: 'ChatModelStoreTest#create',
                    initialLocation: ChatAgentLocation.Chat,
                    isImported: false,
                    willKeepAlive: true,
                    hasPendingEdits: false,
                    pendingDisposal: false,
                    referenceCount: 3,
                    holders: [
                        { holder: 'ChatModelStoreTest#existing', count: 2 },
                        { holder: 'ChatModelStoreTest#create', count: 1 }
                    ]
                }]
        });
        ref1.dispose();
        ref2?.dispose();
        ref3?.dispose();
        willDisposePromises[0].complete();
        await testObject.waitForModelDisposals();
    });
    test('reports pending disposal models without holders', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref = testObject.acquireOrCreate(props, 'ChatModelStoreTest#create');
        ref.dispose();
        assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
            totalModels: 1,
            totalReferences: 0,
            models: [{
                    sessionResource: uri,
                    title: '',
                    createdBy: 'ChatModelStoreTest#create',
                    initialLocation: ChatAgentLocation.Chat,
                    isImported: false,
                    willKeepAlive: true,
                    hasPendingEdits: false,
                    pendingDisposal: true,
                    referenceCount: 0,
                    holders: []
                }]
        });
        willDisposePromises[0].complete();
        await testObject.waitForModelDisposals();
    });
    test('resurrection preserves debug tracking', async () => {
        const uri = URI.parse('test://session');
        const props = {
            sessionResource: uri,
            location: ChatAgentLocation.Chat,
            canUseTools: true
        };
        const ref1 = testObject.acquireOrCreate(props, 'OriginalCreator');
        ref1.dispose();
        // Model is pending disposal — re-acquire before disposal completes
        const ref2 = testObject.acquireOrCreate(props, 'Rescuer');
        // Complete the old disposal — should NOT wipe the model or tracking
        willDisposePromises[0].complete();
        await testObject.waitForModelDisposals();
        assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
            totalModels: 1,
            totalReferences: 1,
            models: [{
                    sessionResource: uri,
                    title: '',
                    createdBy: 'OriginalCreator',
                    initialLocation: ChatAgentLocation.Chat,
                    isImported: false,
                    willKeepAlive: true,
                    hasPendingEdits: false,
                    pendingDisposal: false,
                    referenceCount: 1,
                    holders: [{ holder: 'Rescuer', count: 1 }]
                }]
        });
        ref2.dispose();
        willDisposePromises[1].complete();
        await testObject.waitForModelDisposals();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsU3RvcmUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsU3RvcmUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUUsT0FBTyxFQUFFLGNBQWMsRUFBc0IsTUFBTSx5Q0FBeUMsQ0FBQztBQUM3RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFbkQsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtJQUM1QixNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksVUFBMEIsQ0FBQztJQUMvQixJQUFJLGFBQThCLENBQUM7SUFDbkMsSUFBSSxtQkFBNEMsQ0FBQztJQUVqRCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsYUFBYSxHQUFHLEVBQUUsQ0FBQztRQUNuQixtQkFBbUIsR0FBRyxFQUFFLENBQUM7UUFDekIsVUFBVSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxjQUFjLENBQUM7WUFDekMsV0FBVyxFQUFFLENBQUMsS0FBeUIsRUFBRSxFQUFFO2dCQUMxQyxNQUFNLEtBQUssR0FBRyxJQUFJLGFBQWEsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3ZELGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzFCLE9BQU8sS0FBNkIsQ0FBQztZQUN0QyxDQUFDO1lBQ0QsZ0JBQWdCLEVBQUUsS0FBSyxFQUFFLEtBQWdCLEVBQUUsRUFBRTtnQkFDNUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxlQUFlLEVBQVEsQ0FBQztnQkFDdEMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QixNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDWCxDQUFDO1NBQ0QsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNyQyxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDeEMsTUFBTSxLQUFLLEdBQXVCO1lBQ2pDLGVBQWUsRUFBRSxHQUFHO1lBQ3BCLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJO1lBQ2hDLFdBQVcsRUFBRSxJQUFJO1NBQ2pCLENBQUM7UUFFRixNQUFNLEdBQUcsR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzlDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFakQsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFbEQsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEMsTUFBTSxVQUFVLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUN6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDcEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsY0FBYyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQy9CLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN4QyxNQUFNLEtBQUssR0FBdUI7WUFDakMsZUFBZSxFQUFFLEdBQUc7WUFDcEIsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7WUFDaEMsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQztRQUVGLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDL0MsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUMzQixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFZiw0QkFBNEI7UUFDNUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRWhELHdDQUF3QztRQUN4QyxNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFNUMsbUNBQW1DO1FBQ25DLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sVUFBVSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFFekMsaURBQWlEO1FBQ2pELE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVoRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsYUFBYSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzlCLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN4QyxNQUFNLEtBQUssR0FBdUI7WUFDakMsZUFBZSxFQUFFLEdBQUc7WUFDcEIsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7WUFDaEMsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQztRQUVGLE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwRCxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFOUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2QsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEMsTUFBTSxVQUFVLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUV6QyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDbkQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN4QyxNQUFNLEtBQUssR0FBdUI7WUFDakMsZUFBZSxFQUFFLEdBQUc7WUFDcEIsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7WUFDaEMsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQztRQUVGLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUvRCxNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoQixNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTdDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNmLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNmLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sVUFBVSxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsUUFBUSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3pCLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUMxQyxNQUFNLElBQUksR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDMUMsTUFBTSxNQUFNLEdBQXVCO1lBQ2xDLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJO1lBQ2hDLFdBQVcsRUFBRSxJQUFJO1NBQ2pCLENBQUM7UUFDRixNQUFNLE1BQU0sR0FBdUI7WUFDbEMsZUFBZSxFQUFFLElBQUk7WUFDckIsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7WUFDaEMsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQztRQUVGLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDaEQsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVoRCxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQy9DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNyQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDeEMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBRXhDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNmLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNmLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sVUFBVSxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hDLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN4QyxNQUFNLEtBQUssR0FBdUI7WUFDakMsZUFBZSxFQUFFLEdBQUc7WUFDcEIsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7WUFDaEMsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQztRQUVGLE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUMsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLE1BQWtDLENBQUM7UUFDckQsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXJCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM1QyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUM3RCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDeEMsTUFBTSxLQUFLLEdBQXVCO1lBQ2pDLGVBQWUsRUFBRSxHQUFHO1lBQ3BCLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJO1lBQ2hDLFdBQVcsRUFBRSxJQUFJO1NBQ2pCLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSwyQkFBMkIsQ0FBQyxDQUFDO1FBQzVFLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLDZCQUE2QixDQUFDLENBQUM7UUFDNUUsTUFBTSxJQUFJLEdBQUcsVUFBVSxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztRQUU1RSxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyx5QkFBeUIsRUFBRSxFQUFFO1lBQzlELFdBQVcsRUFBRSxDQUFDO1lBQ2QsZUFBZSxFQUFFLENBQUM7WUFDbEIsTUFBTSxFQUFFLENBQUM7b0JBQ1IsZUFBZSxFQUFFLEdBQUc7b0JBQ3BCLEtBQUssRUFBRSxFQUFFO29CQUNULFNBQVMsRUFBRSwyQkFBMkI7b0JBQ3RDLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJO29CQUN2QyxVQUFVLEVBQUUsS0FBSztvQkFDakIsYUFBYSxFQUFFLElBQUk7b0JBQ25CLGVBQWUsRUFBRSxLQUFLO29CQUN0QixlQUFlLEVBQUUsS0FBSztvQkFDdEIsY0FBYyxFQUFFLENBQUM7b0JBQ2pCLE9BQU8sRUFBRTt3QkFDUixFQUFFLE1BQU0sRUFBRSw2QkFBNkIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFO3dCQUNuRCxFQUFFLE1BQU0sRUFBRSwyQkFBMkIsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFO3FCQUNqRDtpQkFDRCxDQUFDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2YsSUFBSSxFQUFFLE9BQU8sRUFBRSxDQUFDO1FBQ2hCLElBQUksRUFBRSxPQUFPLEVBQUUsQ0FBQztRQUNoQixtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsQyxNQUFNLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2xFLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUN4QyxNQUFNLEtBQUssR0FBdUI7WUFDakMsZUFBZSxFQUFFLEdBQUc7WUFDcEIsUUFBUSxFQUFFLGlCQUFpQixDQUFDLElBQUk7WUFDaEMsV0FBVyxFQUFFLElBQUk7U0FDakIsQ0FBQztRQUVGLE1BQU0sR0FBRyxHQUFHLFVBQVUsQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLDJCQUEyQixDQUFDLENBQUM7UUFDM0UsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRWQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMseUJBQXlCLEVBQUUsRUFBRTtZQUM5RCxXQUFXLEVBQUUsQ0FBQztZQUNkLGVBQWUsRUFBRSxDQUFDO1lBQ2xCLE1BQU0sRUFBRSxDQUFDO29CQUNSLGVBQWUsRUFBRSxHQUFHO29CQUNwQixLQUFLLEVBQUUsRUFBRTtvQkFDVCxTQUFTLEVBQUUsMkJBQTJCO29CQUN0QyxlQUFlLEVBQUUsaUJBQWlCLENBQUMsSUFBSTtvQkFDdkMsVUFBVSxFQUFFLEtBQUs7b0JBQ2pCLGFBQWEsRUFBRSxJQUFJO29CQUNuQixlQUFlLEVBQUUsS0FBSztvQkFDdEIsZUFBZSxFQUFFLElBQUk7b0JBQ3JCLGNBQWMsRUFBRSxDQUFDO29CQUNqQixPQUFPLEVBQUUsRUFBRTtpQkFDWCxDQUFDO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEMsTUFBTSxVQUFVLENBQUMscUJBQXFCLEVBQUUsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN4RCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDeEMsTUFBTSxLQUFLLEdBQXVCO1lBQ2pDLGVBQWUsRUFBRSxHQUFHO1lBQ3BCLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJO1lBQ2hDLFdBQVcsRUFBRSxJQUFJO1NBQ2pCLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2xFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUVmLG1FQUFtRTtRQUNuRSxNQUFNLElBQUksR0FBRyxVQUFVLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUxRCxvRUFBb0U7UUFDcEUsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDbEMsTUFBTSxVQUFVLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUV6QyxNQUFNLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyx5QkFBeUIsRUFBRSxFQUFFO1lBQzlELFdBQVcsRUFBRSxDQUFDO1lBQ2QsZUFBZSxFQUFFLENBQUM7WUFDbEIsTUFBTSxFQUFFLENBQUM7b0JBQ1IsZUFBZSxFQUFFLEdBQUc7b0JBQ3BCLEtBQUssRUFBRSxFQUFFO29CQUNULFNBQVMsRUFBRSxpQkFBaUI7b0JBQzVCLGVBQWUsRUFBRSxpQkFBaUIsQ0FBQyxJQUFJO29CQUN2QyxVQUFVLEVBQUUsS0FBSztvQkFDakIsYUFBYSxFQUFFLElBQUk7b0JBQ25CLGVBQWUsRUFBRSxLQUFLO29CQUN0QixlQUFlLEVBQUUsS0FBSztvQkFDdEIsY0FBYyxFQUFFLENBQUM7b0JBQ2pCLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUM7aUJBQzFDLENBQUM7U0FDRixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDZixtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsQyxNQUFNLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==