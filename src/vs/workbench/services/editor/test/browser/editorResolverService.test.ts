/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { EditorResolverService } from 'vs/workbench/services/editor/browser/editorResolverService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorResolverService, ResolvedStatus, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { createEditorPart, ITestInstantiationService, TestFileEditorInput, TestServiceAccessor, workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

suite('EditorResolverService', () => {

	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorResolverService';
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	async function createEditorResolverService(instantiationService: ITestInstantiationService = workbenchInstantiationService()): Promise<[EditorPart, EditorResolverService, TestServiceAccessor]> {
		const part = await createEditorPart(instantiationService, disposables);

		instantiationService.stub(IEditorGroupsService, part);
		const editorResolverService = instantiationService.createInstance(EditorResolverService);
		instantiationService.stub(IEditorResolverService, editorResolverService);

		return [part, editorResolverService, instantiationService.createInstance(TestServiceAccessor)];
	}

	test('Simple Resolve', async () => {
		const [part, service] = await createEditorResolverService();
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

		const resultingResolution = await service.resolveEditor({ resource: URI.file('my://resource-basics.test') }, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(resultingResolution.editor.typeId, TEST_EDITOR_INPUT_ID);
			resultingResolution.editor.dispose();
		}
		registeredEditor.dispose();
	});

	test('Untitled Resolve', async () => {
		const UNTITLED_TEST_EDITOR_INPUT_ID = 'UNTITLED_TEST_INPUT';
		const [part, service] = await createEditorResolverService();
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
		let resultingResolution = await service.resolveEditor({ resource: undefined }, part.activeGroup);
		assert.ok(resultingResolution);
		// We don't expect untitled to match the *.test glob
		assert.strictEqual(typeof resultingResolution, 'number');

		// Untyped untitled - with untitled resource
		resultingResolution = await service.resolveEditor({ resource: URI.from({ scheme: Schemas.untitled, path: 'foo.test' }) }, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
			resultingResolution.editor.dispose();
		}

		// Untyped untitled - file resource with forceUntitled
		resultingResolution = await service.resolveEditor({ resource: URI.file('/fake.test'), forceUntitled: true }, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
			resultingResolution.editor.dispose();
		}


		registeredEditor.dispose();
	});
});
