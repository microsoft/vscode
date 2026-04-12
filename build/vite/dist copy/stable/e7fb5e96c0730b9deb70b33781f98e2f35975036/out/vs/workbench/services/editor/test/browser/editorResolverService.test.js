/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { EditorResolverService } from '../../browser/editorResolverService.js';
import { IEditorGroupsService } from '../../common/editorGroupsService.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../common/editorResolverService.js';
import { createEditorPart, TestFileEditorInput, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
suite('EditorResolverService', () => {
    const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorResolverService';
    const disposables = new DisposableStore();
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    async function createEditorResolverService(instantiationService = workbenchInstantiationService(undefined, disposables)) {
        const part = await createEditorPart(instantiationService, disposables);
        instantiationService.stub(IEditorGroupsService, part);
        const editorResolverService = instantiationService.createInstance(EditorResolverService);
        instantiationService.stub(IEditorResolverService, editorResolverService);
        disposables.add(editorResolverService);
        return [part, editorResolverService, instantiationService.createInstance(TestServiceAccessor)];
    }
    function constructDisposableFileEditorInput(uri, typeId, store) {
        const editor = new TestFileEditorInput(uri, typeId);
        store.add(editor);
        return editor;
    }
    test('Simple Resolve', async () => {
        const [part, service] = await createEditorResolverService();
        const registeredEditor = service.registerEditor('*.test', {
            id: 'TEST_EDITOR',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
        });
        const resultingResolution = await service.resolveEditor({ resource: URI.file('my://resource-basics.test') }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(resultingResolution.editor.typeId, TEST_EDITOR_INPUT_ID);
            resultingResolution.editor.dispose();
        }
        registeredEditor.dispose();
    });
    test('Untitled Resolve', async () => {
        const UNTITLED_TEST_EDITOR_INPUT_ID = 'UNTITLED_TEST_INPUT';
        const [part, service] = await createEditorResolverService();
        const registeredEditor = service.registerEditor('*.test', {
            id: 'TEST_EDITOR',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
            createUntitledEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput((resource ? resource : URI.from({ scheme: Schemas.untitled })), UNTITLED_TEST_EDITOR_INPUT_ID) }),
        });
        // Untyped untitled - no resource
        let resultingResolution = await service.resolveEditor({ resource: undefined }, part.activeGroup);
        assert.ok(resultingResolution);
        // We don't expect untitled to match the *.test glob
        assert.strictEqual(typeof resultingResolution, 'number');
        // Untyped untitled - with untitled resource
        resultingResolution = await service.resolveEditor({ resource: URI.from({ scheme: Schemas.untitled, path: 'foo.test' }) }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
            resultingResolution.editor.dispose();
        }
        // Untyped untitled - file resource with forceUntitled
        resultingResolution = await service.resolveEditor({ resource: URI.file('/fake.test'), forceUntitled: true }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
            resultingResolution.editor.dispose();
        }
        registeredEditor.dispose();
    });
    test('Side by side Resolve', async () => {
        const [part, service] = await createEditorResolverService();
        const registeredEditorPrimary = service.registerEditor('*.test-primary', {
            id: 'TEST_EDITOR_PRIMARY',
            label: 'Test Editor Label Primary',
            detail: 'Test Editor Details Primary',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
        });
        const registeredEditorSecondary = service.registerEditor('*.test-secondary', {
            id: 'TEST_EDITOR_SECONDARY',
            label: 'Test Editor Label Secondary',
            detail: 'Test Editor Details Secondary',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
        });
        const resultingResolution = await service.resolveEditor({
            primary: { resource: URI.file('my://resource-basics.test-primary') },
            secondary: { resource: URI.file('my://resource-basics.test-secondary') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editorinputs.sidebysideEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        registeredEditorPrimary.dispose();
        registeredEditorSecondary.dispose();
    });
    test('Diff editor Resolve', async () => {
        const [part, service, accessor] = await createEditorResolverService();
        const registeredEditor = service.registerEditor('*.test-diff', {
            id: 'TEST_EDITOR',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
            createDiffEditorInput: ({ modified, original, options }, group) => ({
                editor: accessor.instantiationService.createInstance(DiffEditorInput, 'name', 'description', constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables), constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables), undefined)
            })
        });
        const resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test-diff') },
            modified: { resource: URI.file('my://resource-basics.test-diff') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        registeredEditor.dispose();
    });
    test('Diff editor Resolve - Different Types', async () => {
        const [part, service, accessor] = await createEditorResolverService();
        let diffOneCounter = 0;
        let diffTwoCounter = 0;
        let defaultDiffCounter = 0;
        const registeredEditor = service.registerEditor('*.test-diff', {
            id: 'TEST_EDITOR',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
            createDiffEditorInput: ({ modified, original, options }, group) => {
                diffOneCounter++;
                return {
                    editor: accessor.instantiationService.createInstance(DiffEditorInput, 'name', 'description', constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables), constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables), undefined)
                };
            }
        });
        const secondRegisteredEditor = service.registerEditor('*.test-secondDiff', {
            id: 'TEST_EDITOR_2',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
            createDiffEditorInput: ({ modified, original, options }, group) => {
                diffTwoCounter++;
                return {
                    editor: accessor.instantiationService.createInstance(DiffEditorInput, 'name', 'description', constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables), constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables), undefined)
                };
            }
        });
        const defaultRegisteredEditor = service.registerEditor('*', {
            id: 'default',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.option
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
            createDiffEditorInput: ({ modified, original, options }, group) => {
                defaultDiffCounter++;
                return {
                    editor: accessor.instantiationService.createInstance(DiffEditorInput, 'name', 'description', constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables), constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables), undefined)
                };
            }
        });
        let resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test-diff') },
            modified: { resource: URI.file('my://resource-basics.test-diff') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(diffOneCounter, 1);
            assert.strictEqual(diffTwoCounter, 0);
            assert.strictEqual(defaultDiffCounter, 0);
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test-secondDiff') },
            modified: { resource: URI.file('my://resource-basics.test-secondDiff') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(diffOneCounter, 1);
            assert.strictEqual(diffTwoCounter, 1);
            assert.strictEqual(defaultDiffCounter, 0);
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test-secondDiff') },
            modified: { resource: URI.file('my://resource-basics.test-diff') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(diffOneCounter, 1);
            assert.strictEqual(diffTwoCounter, 1);
            assert.strictEqual(defaultDiffCounter, 1);
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test-diff') },
            modified: { resource: URI.file('my://resource-basics.test-secondDiff') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(diffOneCounter, 1);
            assert.strictEqual(diffTwoCounter, 1);
            assert.strictEqual(defaultDiffCounter, 2);
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test-secondDiff') },
            modified: { resource: URI.file('my://resource-basics.test-diff') },
            options: { override: 'TEST_EDITOR' }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(diffOneCounter, 2);
            assert.strictEqual(diffTwoCounter, 1);
            assert.strictEqual(defaultDiffCounter, 2);
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        registeredEditor.dispose();
        secondRegisteredEditor.dispose();
        defaultRegisteredEditor.dispose();
    });
    test('Registry & Events', async () => {
        const [, service] = await createEditorResolverService();
        let eventCounter = 0;
        disposables.add(service.onDidChangeEditorRegistrations(() => {
            eventCounter++;
        }));
        const editors = service.getEditors();
        const registeredEditor = service.registerEditor('*.test', {
            id: 'TEST_EDITOR',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.default
        }, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
        });
        assert.strictEqual(eventCounter, 1);
        assert.strictEqual(service.getEditors().length, editors.length + 1);
        assert.strictEqual(service.getEditors().some(editor => editor.id === 'TEST_EDITOR'), true);
        registeredEditor.dispose();
        assert.strictEqual(eventCounter, 2);
        assert.strictEqual(service.getEditors().length, editors.length);
        assert.strictEqual(service.getEditors().some(editor => editor.id === 'TEST_EDITOR'), false);
    });
    test('Multiple registrations to same glob and id #155859', async () => {
        const [part, service, accessor] = await createEditorResolverService();
        const testEditorInfo = {
            id: 'TEST_EDITOR',
            label: 'Test Editor Label',
            detail: 'Test Editor Details',
            priority: RegisteredEditorPriority.default
        };
        const registeredSingleEditor = service.registerEditor('*.test', testEditorInfo, {}, {
            createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
        });
        const registeredDiffEditor = service.registerEditor('*.test', testEditorInfo, {}, {
            createDiffEditorInput: ({ modified, original, options }, group) => ({
                editor: accessor.instantiationService.createInstance(DiffEditorInput, 'name', 'description', constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables), constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables), undefined)
            })
        });
        // Resolve a diff
        let resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test') },
            modified: { resource: URI.file('my://resource-basics.test') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.notStrictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 1 /* ResolvedStatus.ABORT */ && resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
            resultingResolution.editor.dispose();
        }
        else {
            assert.fail();
        }
        // Remove diff registration
        registeredDiffEditor.dispose();
        // Resolve a diff again, expected failure
        resultingResolution = await service.resolveEditor({
            original: { resource: URI.file('my://resource-basics.test') },
            modified: { resource: URI.file('my://resource-basics.test') }
        }, part.activeGroup);
        assert.ok(resultingResolution);
        assert.strictEqual(typeof resultingResolution, 'number');
        if (resultingResolution !== 2 /* ResolvedStatus.NONE */) {
            assert.fail();
        }
        registeredSingleEditor.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL3Rlc3QvYnJvd3Nlci9lZGl0b3JSZXNvbHZlclNlcnZpY2UudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxzQkFBc0IsRUFBa0Isd0JBQXdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQTZCLG1CQUFtQixFQUFFLG1CQUFtQixFQUFFLDZCQUE2QixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFekwsS0FBSyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtJQUVuQyxNQUFNLG9CQUFvQixHQUFHLHlDQUF5QyxDQUFDO0lBQ3ZFLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFFMUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBRXBDLHVDQUF1QyxFQUFF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