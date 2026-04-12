/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { InstantiationService } from '../../../../../platform/instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { URI } from '../../../../../base/common/uri.js';
import { BulkFileOperations } from '../../browser/preview/bulkEditPreview.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ResourceFileEdit, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('BulkEditPreview', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let instaService;
    setup(function () {
        const fileService = new class extends mock() {
            constructor() {
                super(...arguments);
                this.onDidFilesChange = Event.None;
            }
            async exists() {
                return true;
            }
        };
        const modelService = new class extends mock() {
            getModel() {
                return null;
            }
            getModels() {
                return [];
            }
        };
        instaService = new InstantiationService(new ServiceCollection([IFileService, fileService], [IModelService, modelService]));
    });
    test('one needsConfirmation unchecks all of file', async function () {
        const edits = [
            new ResourceFileEdit(undefined, URI.parse('some:///uri1'), undefined, { label: 'cat1', needsConfirmation: true }),
            new ResourceFileEdit(URI.parse('some:///uri1'), URI.parse('some:///uri2'), undefined, { label: 'cat2', needsConfirmation: false }),
        ];
        const ops = await instaService.invokeFunction(BulkFileOperations.create, edits);
        store.add(ops);
        assert.strictEqual(ops.fileOperations.length, 1);
        assert.strictEqual(ops.checked.isChecked(edits[0]), false);
    });
    test('has categories', async function () {
        const edits = [
            new ResourceFileEdit(undefined, URI.parse('some:///uri1'), undefined, { label: 'uri1', needsConfirmation: true }),
            new ResourceFileEdit(undefined, URI.parse('some:///uri2'), undefined, { label: 'uri2', needsConfirmation: false }),
        ];
        const ops = await instaService.invokeFunction(BulkFileOperations.create, edits);
        store.add(ops);
        assert.strictEqual(ops.categories.length, 2);
        assert.strictEqual(ops.categories[0].metadata.label, 'uri1'); // unconfirmed!
        assert.strictEqual(ops.categories[1].metadata.label, 'uri2');
    });
    test('has not categories', async function () {
        const edits = [
            new ResourceFileEdit(undefined, URI.parse('some:///uri1'), undefined, { label: 'uri1', needsConfirmation: true }),
            new ResourceFileEdit(undefined, URI.parse('some:///uri2'), undefined, { label: 'uri1', needsConfirmation: false }),
        ];
        const ops = await instaService.invokeFunction(BulkFileOperations.create, edits);
        store.add(ops);
        assert.strictEqual(ops.categories.length, 1);
        assert.strictEqual(ops.categories[0].metadata.label, 'uri1'); // unconfirmed!
        assert.strictEqual(ops.categories[0].metadata.label, 'uri1');
    });
    test('category selection', async function () {
        const edits = [
            new ResourceFileEdit(undefined, URI.parse('some:///uri1'), undefined, { label: 'C1', needsConfirmation: false }),
            new ResourceTextEdit(URI.parse('some:///uri2'), { text: 'foo', range: new Range(1, 1, 1, 1) }, undefined, { label: 'C2', needsConfirmation: false }),
        ];
        const ops = await instaService.invokeFunction(BulkFileOperations.create, edits);
        store.add(ops);
        assert.strictEqual(ops.checked.isChecked(edits[0]), true);
        assert.strictEqual(ops.checked.isChecked(edits[1]), true);
        assert.ok(edits === ops.getWorkspaceEdit());
        // NOT taking to create, but the invalid text edit will
        // go through
        ops.checked.updateChecked(edits[0], false);
        const newEdits = ops.getWorkspaceEdit();
        assert.ok(edits !== newEdits);
        assert.strictEqual(edits.length, 2);
        assert.strictEqual(newEdits.length, 1);
    });
    test('fix bad metadata', async function () {
        // bogous edit that wants creation to be confirmed, but not it's textedit-child...
        const edits = [
            new ResourceFileEdit(undefined, URI.parse('some:///uri1'), undefined, { label: 'C1', needsConfirmation: true }),
            new ResourceTextEdit(URI.parse('some:///uri1'), { text: 'foo', range: new Range(1, 1, 1, 1) }, undefined, { label: 'C2', needsConfirmation: false })
        ];
        const ops = await instaService.invokeFunction(BulkFileOperations.create, edits);
        store.add(ops);
        assert.strictEqual(ops.checked.isChecked(edits[0]), false);
        assert.strictEqual(ops.checked.isChecked(edits[1]), false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVsa0VkaXRQcmV2aWV3LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9idWxrRWRpdC90ZXN0L2Jyb3dzZXIvYnVsa0VkaXRQcmV2aWV3LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1FQUFtRSxDQUFDO0FBRXRHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQy9HLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLEtBQUssQ0FBQyxpQkFBaUIsRUFBRTtJQUV4QixNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksWUFBbUMsQ0FBQztJQUV4QyxLQUFLLENBQUM7UUFFTCxNQUFNLFdBQVcsR0FBaUIsSUFBSSxLQUFNLFNBQVEsSUFBSSxFQUFnQjtZQUFs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