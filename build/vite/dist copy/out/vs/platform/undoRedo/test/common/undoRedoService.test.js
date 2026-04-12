/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestDialogService } from '../../../dialogs/test/common/testDialogService.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { UndoRedoGroup } from '../../common/undoRedo.js';
import { UndoRedoService } from '../../common/undoRedoService.js';
suite('UndoRedoService', () => {
    function createUndoRedoService(dialogService = new TestDialogService()) {
        const notificationService = new TestNotificationService();
        return new UndoRedoService(dialogService, notificationService);
    }
    test('simple single resource elements', () => {
        const resource = URI.file('test.txt');
        const service = createUndoRedoService();
        assert.strictEqual(service.canUndo(resource), false);
        assert.strictEqual(service.canRedo(resource), false);
        assert.strictEqual(service.hasElements(resource), false);
        assert.ok(service.getLastElement(resource) === null);
        let undoCall1 = 0;
        let redoCall1 = 0;
        const element1 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 1',
            code: 'typing',
            undo: () => { undoCall1++; },
            redo: () => { redoCall1++; }
        };
        service.pushElement(element1);
        assert.strictEqual(undoCall1, 0);
        assert.strictEqual(redoCall1, 0);
        assert.strictEqual(service.canUndo(resource), true);
        assert.strictEqual(service.canRedo(resource), false);
        assert.strictEqual(service.hasElements(resource), true);
        assert.ok(service.getLastElement(resource) === element1);
        service.undo(resource);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 0);
        assert.strictEqual(service.canUndo(resource), false);
        assert.strictEqual(service.canRedo(resource), true);
        assert.strictEqual(service.hasElements(resource), true);
        assert.ok(service.getLastElement(resource) === null);
        service.redo(resource);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 1);
        assert.strictEqual(service.canUndo(resource), true);
        assert.strictEqual(service.canRedo(resource), false);
        assert.strictEqual(service.hasElements(resource), true);
        assert.ok(service.getLastElement(resource) === element1);
        let undoCall2 = 0;
        let redoCall2 = 0;
        const element2 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 2',
            code: 'typing',
            undo: () => { undoCall2++; },
            redo: () => { redoCall2++; }
        };
        service.pushElement(element2);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 1);
        assert.strictEqual(undoCall2, 0);
        assert.strictEqual(redoCall2, 0);
        assert.strictEqual(service.canUndo(resource), true);
        assert.strictEqual(service.canRedo(resource), false);
        assert.strictEqual(service.hasElements(resource), true);
        assert.ok(service.getLastElement(resource) === element2);
        service.undo(resource);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 1);
        assert.strictEqual(undoCall2, 1);
        assert.strictEqual(redoCall2, 0);
        assert.strictEqual(service.canUndo(resource), true);
        assert.strictEqual(service.canRedo(resource), true);
        assert.strictEqual(service.hasElements(resource), true);
        assert.ok(service.getLastElement(resource) === null);
        let undoCall3 = 0;
        let redoCall3 = 0;
        const element3 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 2',
            code: 'typing',
            undo: () => { undoCall3++; },
            redo: () => { redoCall3++; }
        };
        service.pushElement(element3);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 1);
        assert.strictEqual(undoCall2, 1);
        assert.strictEqual(redoCall2, 0);
        assert.strictEqual(undoCall3, 0);
        assert.strictEqual(redoCall3, 0);
        assert.strictEqual(service.canUndo(resource), true);
        assert.strictEqual(service.canRedo(resource), false);
        assert.strictEqual(service.hasElements(resource), true);
        assert.ok(service.getLastElement(resource) === element3);
        service.undo(resource);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 1);
        assert.strictEqual(undoCall2, 1);
        assert.strictEqual(redoCall2, 0);
        assert.strictEqual(undoCall3, 1);
        assert.strictEqual(redoCall3, 0);
        assert.strictEqual(service.canUndo(resource), true);
        assert.strictEqual(service.canRedo(resource), true);
        assert.strictEqual(service.hasElements(resource), true);
        assert.ok(service.getLastElement(resource) === null);
    });
    test('multi resource elements', async () => {
        const resource1 = URI.file('test1.txt');
        const resource2 = URI.file('test2.txt');
        const service = createUndoRedoService(new class extends mock() {
            async prompt(prompt) {
                const result = prompt.buttons?.[0].run({ checkboxChecked: false });
                return { result };
            }
            async confirm() {
                return {
                    confirmed: true // confirm!
                };
            }
        });
        let undoCall1 = 0, undoCall11 = 0, undoCall12 = 0;
        let redoCall1 = 0, redoCall11 = 0, redoCall12 = 0;
        const element1 = {
            type: 1 /* UndoRedoElementType.Workspace */,
            resources: [resource1, resource2],
            label: 'typing 1',
            code: 'typing',
            undo: () => { undoCall1++; },
            redo: () => { redoCall1++; },
            split: () => {
                return [
                    {
                        type: 0 /* UndoRedoElementType.Resource */,
                        resource: resource1,
                        label: 'typing 1.1',
                        code: 'typing',
                        undo: () => { undoCall11++; },
                        redo: () => { redoCall11++; }
                    },
                    {
                        type: 0 /* UndoRedoElementType.Resource */,
                        resource: resource2,
                        label: 'typing 1.2',
                        code: 'typing',
                        undo: () => { undoCall12++; },
                        redo: () => { redoCall12++; }
                    }
                ];
            }
        };
        service.pushElement(element1);
        assert.strictEqual(service.canUndo(resource1), true);
        assert.strictEqual(service.canRedo(resource1), false);
        assert.strictEqual(service.hasElements(resource1), true);
        assert.ok(service.getLastElement(resource1) === element1);
        assert.strictEqual(service.canUndo(resource2), true);
        assert.strictEqual(service.canRedo(resource2), false);
        assert.strictEqual(service.hasElements(resource2), true);
        assert.ok(service.getLastElement(resource2) === element1);
        await service.undo(resource1);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 0);
        assert.strictEqual(service.canUndo(resource1), false);
        assert.strictEqual(service.canRedo(resource1), true);
        assert.strictEqual(service.hasElements(resource1), true);
        assert.ok(service.getLastElement(resource1) === null);
        assert.strictEqual(service.canUndo(resource2), false);
        assert.strictEqual(service.canRedo(resource2), true);
        assert.strictEqual(service.hasElements(resource2), true);
        assert.ok(service.getLastElement(resource2) === null);
        await service.redo(resource2);
        assert.strictEqual(undoCall1, 1);
        assert.strictEqual(redoCall1, 1);
        assert.strictEqual(undoCall11, 0);
        assert.strictEqual(redoCall11, 0);
        assert.strictEqual(undoCall12, 0);
        assert.strictEqual(redoCall12, 0);
        assert.strictEqual(service.canUndo(resource1), true);
        assert.strictEqual(service.canRedo(resource1), false);
        assert.strictEqual(service.hasElements(resource1), true);
        assert.ok(service.getLastElement(resource1) === element1);
        assert.strictEqual(service.canUndo(resource2), true);
        assert.strictEqual(service.canRedo(resource2), false);
        assert.strictEqual(service.hasElements(resource2), true);
        assert.ok(service.getLastElement(resource2) === element1);
    });
    test('UndoRedoGroup.None uses id 0', () => {
        assert.strictEqual(UndoRedoGroup.None.id, 0);
        assert.strictEqual(UndoRedoGroup.None.nextOrder(), 0);
        assert.strictEqual(UndoRedoGroup.None.nextOrder(), 0);
    });
    test('restoreSnapshot preserves elements that match the snapshot', () => {
        const resource = URI.file('test.txt');
        const service = createUndoRedoService();
        // Push three elements
        const element1 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 1',
            code: 'typing',
            undo: () => { },
            redo: () => { }
        };
        const element2 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 2',
            code: 'typing',
            undo: () => { },
            redo: () => { }
        };
        const element3 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 3',
            code: 'typing',
            undo: () => { },
            redo: () => { }
        };
        service.pushElement(element1);
        service.pushElement(element2);
        service.pushElement(element3);
        // Create snapshot after 3 elements: [element1, element2, element3]
        const snapshot = service.createSnapshot(resource);
        // Push more elements after the snapshot
        const element4 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 4',
            code: 'typing',
            undo: () => { },
            redo: () => { }
        };
        const element5 = {
            type: 0 /* UndoRedoElementType.Resource */,
            resource: resource,
            label: 'typing 5',
            code: 'typing',
            undo: () => { },
            redo: () => { }
        };
        service.pushElement(element4);
        service.pushElement(element5);
        // Verify we have 5 elements now
        let elements = service.getElements(resource);
        assert.strictEqual(elements.past.length, 5);
        assert.strictEqual(elements.future.length, 0);
        // Restore snapshot - should remove element4 and element5, but keep element1, element2, element3
        service.restoreSnapshot(snapshot);
        // Verify that elements matching the snapshot are preserved
        elements = service.getElements(resource);
        assert.strictEqual(elements.past.length, 3, 'Should have 3 past elements after restore');
        assert.strictEqual(elements.future.length, 0, 'Should have 0 future elements after restore');
        assert.strictEqual(elements.past[0], element1, 'First element should be element1');
        assert.strictEqual(elements.past[1], element2, 'Second element should be element2');
        assert.strictEqual(elements.past[2], element3, 'Third element should be element3');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5kb1JlZG9TZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91bmRvUmVkby90ZXN0L2NvbW1vbi91bmRvUmVkb1NlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUN2RyxPQUFPLEVBQXlDLGFBQWEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2hHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUVsRSxLQUFLLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO0lBRTdCLFNBQVMscUJBQXFCLENBQUMsZ0JBQWdDLElBQUksaUJBQWlCLEVBQUU7UUFDckYsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLHVCQUF1QixFQUFFLENBQUM7UUFDMUQsT0FBTyxJQUFJLGVBQWUsQ0FBQyxhQUFhLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtRQUM1QyxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RDLE1BQU0sT0FBTyxHQUFHLHFCQUFxQixFQUFFLENBQUM7UUFFeEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxP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UUFBUSxDQUFDLENBQUM7UUFFOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBRXpELE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFdkIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFT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LE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUM7UUFFMUQsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRTlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7UUFFdEQsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlCLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3pELE1BQU0sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsS0FBSyxRQUFRLENBQUMsQ0FBQztRQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN6RCxNQUFNLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLEtBQUssUUFBUSxDQUFDLENBQUM7SUFFM0QsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOEJBQThCLEVBQUUsR0FBRyxFQUFFO1FBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0REFBNEQsRUFBRSxHQUFHLEVBQUU7UUFDdkUsTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0QyxNQUFNLE9BQU8sR0FBRyxxQkFBcUIsRUFBRSxDQUFDO1FBRXhDLHNCQUFzQjtRQUN0QixNQUFNLFFBQVEsR0FBcUI7WUFDbEMsSUFBSSxzQ0FBOEI7WUFDbEMsUUFBUSxFQUFFLFFBQVE7WUFDbEIsS0FBSyxFQUFFLFVBQVU7WUFDakIsSUFBSSxFQUFFLFFBQVE7WUFDZCxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztZQUNmLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1NBQ2YsQ0FBQztRQUNGLE1BQU0sUUFBUSxHQUFxQjtZQUNsQyxJQUFJLHNDQUE4QjtZQUNsQyxRQUFRLEVBQUUsUUFBUTtZQUNsQixLQUFLLEVBQUUsVUFBVTtZQUNqQixJQUFJLEVBQUUsUUFBUTtZQUNkLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1lBQ2YsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7U0FDZixDQUFDO1FBQ0YsTUFBTSxRQUFRLEdBQXFCO1lBQ2xDLElBQUksc0NBQThCO1lBQ2xDLFFBQVEsRUFBRSxRQUFRO1lBQ2xCLEtBQUssRUFBRSxVQUFVO1lBQ2pCLElBQUksRUFBRSxRQUFRO1lBQ2QsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDZixJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUNmLENBQUM7UUFDRixPQUFPLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlCLE9BQU8sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDOUIsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU5QixtRUFBbUU7UUFDbkUsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVsRCx3Q0FBd0M7UUFDeEMsTUFBTSxRQUFRLEdBQXFCO1lBQ2xDLElBQUksc0NBQThCO1lBQ2xDLFFBQVEsRUFBRSxRQUFRO1lBQ2xCLEtBQUssRUFBRSxVQUFVO1lBQ2pCLElBQUksRUFBRSxRQUFRO1lBQ2QsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDZixJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUNmLENBQUM7UUFDRixNQUFNLFFBQVEsR0FBcUI7WUFDbEMsSUFBSSxzQ0FBOEI7WUFDbEMsUUFBUSxFQUFFLFFBQVE7WUFDbEIsS0FBSyxFQUFFLFVBQVU7WUFDakIsSUFBSSxFQUFFLFFBQVE7WUFDZCxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztZQUNmLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1NBQ2YsQ0FBQztRQUNGLE9BQU8sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDOUIsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUU5QixnQ0FBZ0M7UUFDaEMsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUMsZ0dBQWdHO1FBQ2hHLE9BQU8sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFbEMsMkRBQTJEO1FBQzNELFFBQVEsR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLDJDQUEyQyxDQUFDLENBQUM7UUFDekYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsNkNBQTZDLENBQUMsQ0FBQztRQUM3RixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLGtDQUFrQyxDQUFDLENBQUM7UUFDbkYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ3BGLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztJQUNwRixDQUFDLENBQUMsQ0FBQztJQUVILHVDQUF1QyxFQUFFLENBQUM7QUFDM0MsQ0FBQyxDQUFDLENBQUMifQ==