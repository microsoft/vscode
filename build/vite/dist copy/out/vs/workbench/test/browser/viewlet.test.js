/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Registry } from '../../../platform/registry/common/platform.js';
import { PaneCompositeDescriptor, Extensions, PaneComposite } from '../../browser/panecomposite.js';
import { isFunction } from '../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
suite('Viewlets', () => {
    class TestViewlet extends PaneComposite {
        constructor() {
            super('id', null, null, null, null, null, null, null);
        }
        layout(dimension) {
            throw new Error('Method not implemented.');
        }
        setBoundarySashes(sashes) {
            throw new Error('Method not implemented.');
        }
        createViewPaneContainer() { return null; }
    }
    test('ViewletDescriptor API', function () {
        const d = PaneCompositeDescriptor.create(TestViewlet, 'id', 'name', 'class', 5);
        assert.strictEqual(d.id, 'id');
        assert.strictEqual(d.name, 'name');
        assert.strictEqual(d.cssClass, 'class');
        assert.strictEqual(d.order, 5);
    });
    test('Editor Aware ViewletDescriptor API', function () {
        let d = PaneCompositeDescriptor.create(TestViewlet, 'id', 'name', 'class', 5);
        assert.strictEqual(d.id, 'id');
        assert.strictEqual(d.name, 'name');
        d = PaneCompositeDescriptor.create(TestViewlet, 'id', 'name', 'class', 5);
        assert.strictEqual(d.id, 'id');
        assert.strictEqual(d.name, 'name');
    });
    test('Viewlet extension point and registration', function () {
        assert(isFunction(Registry.as(Extensions.Viewlets).registerPaneComposite));
        assert(isFunction(Registry.as(Extensions.Viewlets).getPaneComposite));
        assert(isFunction(Registry.as(Extensions.Viewlets).getPaneComposites));
        const oldCount = Registry.as(Extensions.Viewlets).getPaneComposites().length;
        const d = PaneCompositeDescriptor.create(TestViewlet, 'reg-test-id', 'name');
        Registry.as(Extensions.Viewlets).registerPaneComposite(d);
        assert(d === Registry.as(Extensions.Viewlets).getPaneComposite('reg-test-id'));
        assert.strictEqual(oldCount + 1, Registry.as(Extensions.Viewlets).getPaneComposites().length);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld2xldC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3Rlc3QvYnJvd3Nlci92aWV3bGV0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsVUFBVSxFQUF5QixhQUFhLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzSCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFN0YsS0FBSyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7SUFFdEIsTUFBTSxXQUFZLFNBQVEsYUFBYTtRQUV0QztZQUNDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSyxFQUFFLElBQUssRUFBRSxJQUFLLEVBQUUsSUFBSyxFQUFFLElBQUssRUFBRSxJQUFLLEVBQUUsSUFBSyxDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUVRLE1BQU0sQ0FBQyxTQUFjO1lBQzdCLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUM1QyxDQUFDO1FBRVEsaUJBQWlCLENBQUMsTUFBdUI7WUFDakQsTUFBTSxJQUFJLEtBQUssQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFFa0IsdUJBQXVCLEtBQUssT0FBTyxJQUFLLENBQUMsQ0FBQyxDQUFDO0tBQzlEO0lBRUQsSUFBSSxDQUFDLHVCQUF1QixFQUFFO1FBQzdCLE1BQU0sQ0FBQyxHQUFHLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxPQUFPLEVB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