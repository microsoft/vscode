/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { workbenchInstantiationService, TestFileEditorInput, registerTestEditor, createEditorPart, registerTestFileEditor } from 'vs/workbench/test/browser/workbenchTestServices';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { GoScope } from 'vs/workbench/services/history/common/history';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { EditorViewStateManager } from 'vs/workbench/browser/quickaccess';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { EditorsOrder } from 'vs/workbench/common/editor';
import { Range } from 'vs/editor/common/core/range';

suite('EditorViewStateManager', () => {
	async function createServices(scope = GoScope.DEFAULT): Promise<[EditorPart, EditorService, IInstantiationService]> {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);


		return [part, editorService, instantiationService];
	}
	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor('testTypeId', [new SyncDescriptor(TestFileEditorInput)]));
		disposables.add(registerTestFileEditor());
	});

	teardown(() => {
		disposables.clear();
	});
	test('EditorViewState can properly restore editors', async () => {
		const [part, editorService, instantiationService] = await createServices();
		const editorViewState = disposables.add(instantiationService.createInstance(EditorViewStateManager));
		disposables.add(part);
		disposables.add(editorService);

		const input1 = {
			resource: URI.parse('foo://bar1'),
			options: {
				pinned: true, preserveFocus: true, selection: new Range(1, 0, 1, 3)
			}
		};
		const input2 = {
			resource: URI.parse('foo://bar2'),
			options: {
				pinned: true, selection: new Range(1, 0, 1, 3)
			}
		};
		const input3 = {
			resource: URI.parse('foo://bar3'),
			options: {
				transient: true
			}
		};
		const input4 = {
			resource: URI.parse('foo://bar4'),
			options: {
				transient: true
			}
		};

		const editor = await editorService.openEditor(input1);
		assert.strictEqual(editor, editorService.activeEditorPane);
		editorViewState.set();
		await editorService.openEditor(input2);
		await editorService.openEditor(input3);
		await editorService.openEditor(input4);
		await editorViewState.restore(true);

		assert.strictEqual(part.activeGroup.activeEditor?.resource, input1.resource);
		assert.deepStrictEqual(part.activeGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map(e => e.resource), [input1.resource, input2.resource]);
		if (part.activeGroup.activeEditorPane?.getSelection) {
			assert.deepStrictEqual(part.activeGroup.activeEditorPane?.getSelection(), input1.options.selection);
		}
		await part.activeGroup.closeAllEditors();
	});
	ensureNoDisposablesAreLeakedInTestSuite();
});
