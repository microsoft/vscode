/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorResourceAccessor, isResourceSideBySideEditorInput, isSideBySideEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { TestFileEditorInput, workbenchInstantiationService } from '../../workbenchTestServices.js';
suite('SideBySideEditorInput', () => {
    const disposables = new DisposableStore();
    teardown(() => {
        disposables.clear();
    });
    class MyEditorInput extends EditorInput {
        constructor(resource = undefined) {
            super();
            this.resource = resource;
        }
        fireCapabilitiesChangeEvent() {
            this._onDidChangeCapabilities.fire();
        }
        fireDirtyChangeEvent() {
            this._onDidChangeDirty.fire();
        }
        fireLabelChangeEvent() {
            this._onDidChangeLabel.fire();
        }
        get typeId() { return 'myEditorInput'; }
        resolve() { return null; }
        toUntyped() {
            return { resource: this.resource, options: { override: this.typeId } };
        }
        matches(otherInput) {
            if (super.matches(otherInput)) {
                return true;
            }
            const resource = EditorResourceAccessor.getCanonicalUri(otherInput);
            return resource?.toString() === this.resource?.toString();
        }
    }
    test('basics', () => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        let counter = 0;
        const input = disposables.add(new MyEditorInput(URI.file('/fake')));
        disposables.add(input.onWillDispose(() => {
            assert(true);
            counter++;
        }));
        const otherInput = disposables.add(new MyEditorInput(URI.file('/fake2')));
        disposables.add(otherInput.onWillDispose(() => {
            assert(true);
            counter++;
        }));
        const sideBySideInput = disposables.add(instantiationService.createInstance(SideBySideEditorInput, 'name', 'description', input, otherInput));
        assert.strictEqual(sideBySideInput.getName(), 'name');
        assert.strictEqual(sideBySideInput.getDescription(), 'description');
        assert.ok(isSideBySideEditorInput(sideBySideInput));
        assert.ok(!isSideBySideEditorInput(input));
        assert.strictEqual(sideBySideInput.secondary, input);
        assert.strictEqual(sideBySideInput.primary, otherInput);
        assert(sideBySideInput.matches(sideBySideInput));
        assert(!sideBySideInput.matches(otherInput));
        sideBySideInput.dispose();
        assert.strictEqual(counter, 0);
        const sideBySideInputSame = disposables.add(instantiationService.createInstance(SideBySideEditorInput, undefined, undefined, input, input));
        assert.strictEqual(sideBySideInputSame.getName(), input.getName());
        assert.strictEqual(sideBySideInputSame.getDescription(), input.getDescription());
        assert.strictEqual(sideBySideInputSame.getTitle(), input.getTitle());
        assert.strictEqual(sideBySideInputSame.resource?.toString(), input.resource?.toString());
    });
    test('events dispatching', () => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const input = disposables.add(new MyEditorInput());
        const otherInput = disposables.add(new MyEditorInput());
        const sideBySideInut = disposables.add(instantiationService.createInstance(SideBySideEditorInput, 'name', 'description', otherInput, input));
        assert.ok(isSideBySideEditorInput(sideBySideInut));
        let capabilitiesChangeCounter = 0;
        disposables.add(sideBySideInut.onDidChangeCapabilities(() => capabilitiesChangeCounter++));
        let dirtyChangeCounter = 0;
        disposables.add(sideBySideInut.onDidChangeDirty(() => dirtyChangeCounter++));
        let labelChangeCounter = 0;
        disposables.add(sideBySideInut.onDidChangeLabel(() => labelChangeCounter++));
        input.fireCapabilitiesChangeEvent();
        assert.strictEqual(capabilitiesChangeCounter, 1);
        otherInput.fireCapabilitiesChangeEvent();
        assert.strictEqual(capabilitiesChangeCounter, 2);
        input.fireDirtyChangeEvent();
        otherInput.fireDirtyChangeEvent();
        assert.strictEqual(dirtyChangeCounter, 1);
        input.fireLabelChangeEvent();
        otherInput.fireLabelChangeEvent();
        assert.strictEqual(labelChangeCounter, 2);
    });
    test('toUntyped', () => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const primaryInput = disposables.add(new MyEditorInput(URI.file('/fake')));
        const secondaryInput = disposables.add(new MyEditorInput(URI.file('/fake2')));
        const sideBySideInput = disposables.add(instantiationService.createInstance(SideBySideEditorInput, 'Side By Side Test', undefined, secondaryInput, primaryInput));
        const untypedSideBySideInput = sideBySideInput.toUntyped();
        assert.ok(isResourceSideBySideEditorInput(untypedSideBySideInput));
    });
    test('untyped matches', () => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        const primaryInput = disposables.add(new TestFileEditorInput(URI.file('/fake'), 'primaryId'));
        const secondaryInput = disposables.add(new TestFileEditorInput(URI.file('/fake2'), 'secondaryId'));
        const sideBySideInput = disposables.add(instantiationService.createInstance(SideBySideEditorInput, 'Side By Side Test', undefined, secondaryInput, primaryInput));
        const primaryUntypedInput = { resource: URI.file('/fake'), options: { override: 'primaryId' } };
        const secondaryUntypedInput = { resource: URI.file('/fake2'), options: { override: 'secondaryId' } };
        const sideBySideUntyped = { primary: primaryUntypedInput, secondary: secondaryUntypedInput };
        assert.ok(sideBySideInput.matches(sideBySideUntyped));
        const primaryUntypedInput2 = { resource: URI.file('/fake'), options: { override: 'primaryIdWrong' } };
        const secondaryUntypedInput2 = { resource: URI.file('/fake2'), options: { override: 'secondaryId' } };
        const sideBySideUntyped2 = { primary: primaryUntypedInput2, secondary: secondaryUntypedInput2 };
        assert.ok(!sideBySideInput.matches(sideBySideUntyped2));
        const primaryUntypedInput3 = { resource: URI.file('/fake'), options: { override: 'primaryId' } };
        const secondaryUntypedInput3 = { resource: URI.file('/fake2Wrong'), options: { override: 'secondaryId' } };
        const sideBySideUntyped3 = { primary: primaryUntypedInput3, secondary: secondaryUntypedInput3 };
        assert.ok(!sideBySideInput.matches(sideBySideUntyped3));
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2lkZUJ5U2lkZUVkaXRvcklucHV0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvdGVzdC9icm93c2VyL3BhcnRzL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9ySW5wdXQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQWtDLCtCQUErQixFQUFFLHVCQUF1QixFQUF1QixNQUFNLDhCQUE4QixDQUFDO0FBQ3JMLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVwRyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO0lBRW5DLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFFMUMsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sYUFBYyxTQUFRLFdBQVc7UUFFdEMsWUFBbUIsV0FBNEIsU0FBUztZQUN2RCxLQUFLLEVBQUUsQ0FBQztZQURVLGFBQVEsR0FBUixRQUFRLENBQTZCO1FBRXhELENBQUM7UUFFRCwyQkFBMkI7WUFDMUIsSUFBSSxDQUFDLHdCQUF3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