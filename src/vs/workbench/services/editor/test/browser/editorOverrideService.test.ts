/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { EditorOverrideService } from 'vs/workbench/services/editor/browser/editorOverrideService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorOverrideService, OverrideStatus, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorOverrideService';
import { createEditorPart, ITestInstantiationService, TestFileEditorInput, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('EditorOverrideService', () => {

	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorOverrideService';
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	async function createEditorOverrideService(instantiationService: ITestInstantiationService = workbenchInstantiationService()): Promise<[EditorPart, EditorOverrideService, TestServiceAccessor]> {
		const part = await createEditorPart(instantiationService, disposables);

		instantiationService.stub(IEditorGroupsService, part);
		const editorOverrideService = instantiationService.createInstance(EditorOverrideService);
		instantiationService.stub(IEditorOverrideService, editorOverrideService);

		return [part, editorOverrideService, instantiationService.createInstance(TestServiceAccessor)];
	}

	test('Simple Override', async () => {
		const [part, service] = await createEditorOverrideService();
		const registeredEditor = service.registerEditor('*.test',
			{
				id: 'TEST_EDITOR',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.default
			},
			{ canHandleDiff: false },
			({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
		);

		const resultingOverride = await service.resolveEditor({ resource: URI.file('my://resource-basics.test') }, part.activeGroup);
		assert.ok(resultingOverride);
		assert.notStrictEqual(typeof resultingOverride, 'number');
		if (resultingOverride !== OverrideStatus.ABORT && resultingOverride !== OverrideStatus.NONE) {
			assert.strictEqual(resultingOverride.editor.typeId, TEST_EDITOR_INPUT_ID);
			resultingOverride.editor.dispose();
		}
		registeredEditor.dispose();
	});

	test('Untitled Override', async () => {
		const UNTITLED_TEST_EDITOR_INPUT_ID = 'UNTITLED_TEST_INPUT';
		const [part, service] = await createEditorOverrideService();
		const registeredEditor = service.registerEditor('*.test',
			{
				id: 'TEST_EDITOR',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.default
			},
			{ canHandleDiff: false },
			({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
			({ resource, options }, group) => ({ editor: new TestFileEditorInput((resource ? resource : URI.from({ scheme: Schemas.untitled })), UNTITLED_TEST_EDITOR_INPUT_ID) }),
		);

		// Untyped untitled - no resource
		let resultingOverride = await service.resolveEditor({ resource: undefined }, part.activeGroup);
		assert.ok(resultingOverride);
		// We don't expect untitled to match the *.test glob
		assert.strictEqual(typeof resultingOverride, 'number');

		// Untyped untitled - with untitled resource
		resultingOverride = await service.resolveEditor({ resource: URI.from({ scheme: Schemas.untitled, path: 'foo.test' }) }, part.activeGroup);
		assert.ok(resultingOverride);
		assert.notStrictEqual(typeof resultingOverride, 'number');
		if (resultingOverride !== OverrideStatus.ABORT && resultingOverride !== OverrideStatus.NONE) {
			assert.strictEqual(resultingOverride.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
			resultingOverride.editor.dispose();
		}

		// Untyped untitled - file resource with forceUntitled
		resultingOverride = await service.resolveEditor({ resource: URI.file('/fake.test'), forceUntitled: true }, part.activeGroup);
		assert.ok(resultingOverride);
		assert.notStrictEqual(typeof resultingOverride, 'number');
		if (resultingOverride !== OverrideStatus.ABORT && resultingOverride !== OverrideStatus.NONE) {
			assert.strictEqual(resultingOverride.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
			resultingOverride.editor.dispose();
		}


		registeredEditor.dispose();
	});
});
