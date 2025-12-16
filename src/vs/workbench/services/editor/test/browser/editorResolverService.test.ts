/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { EditorResolverService } from '../../browser/editorResolverService.js';
import { IEditorGroupsService } from '../../common/editorGroupsService.js';
import { IEditorResolverService, ResolvedStatus, RegisteredEditorPriority } from '../../common/editorResolverService.js';
import { createEditorPart, ITestInstantiationService, TestFileEditorInput, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('EditorResolverService', () => {

	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEditorResolverService';
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createEditorResolverService(instantiationService: ITestInstantiationService = workbenchInstantiationService(undefined, disposables)): Promise<[EditorPart, EditorResolverService, TestServiceAccessor]> {
		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorResolverService = instantiationService.createInstance(EditorResolverService);
		instantiationService.stub(IEditorResolverService, editorResolverService);
		disposables.add(editorResolverService);

		return [part, editorResolverService, instantiationService.createInstance(TestServiceAccessor)];
	}

	function constructDisposableFileEditorInput(uri: URI, typeId: string, store: DisposableStore): TestFileEditorInput {
		const editor = new TestFileEditorInput(uri, typeId);
		store.add(editor);
		return editor;
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
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
			}
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
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
				createUntitledEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput((resource ? resource : URI.from({ scheme: Schemas.untitled })), UNTITLED_TEST_EDITOR_INPUT_ID) }),
			}
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

	test('Side by side Resolve', async () => {
		const [part, service] = await createEditorResolverService();
		const registeredEditorPrimary = service.registerEditor('*.test-primary',
			{
				id: 'TEST_EDITOR_PRIMARY',
				label: 'Test Editor Label Primary',
				detail: 'Test Editor Details Primary',
				priority: RegisteredEditorPriority.default
			},
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
			}
		);

		const registeredEditorSecondary = service.registerEditor('*.test-secondary',
			{
				id: 'TEST_EDITOR_SECONDARY',
				label: 'Test Editor Label Secondary',
				detail: 'Test Editor Details Secondary',
				priority: RegisteredEditorPriority.default
			},
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
			}
		);

		const resultingResolution = await service.resolveEditor({
			primary: { resource: URI.file('my://resource-basics.test-primary') },
			secondary: { resource: URI.file('my://resource-basics.test-secondary') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editorinputs.sidebysideEditorInput');
			resultingResolution.editor.dispose();
		} else {
			assert.fail();
		}
		registeredEditorPrimary.dispose();
		registeredEditorSecondary.dispose();
	});

	test('Diff editor Resolve', async () => {
		const [part, service, accessor] = await createEditorResolverService();
		const registeredEditor = service.registerEditor('*.test-diff',
			{
				id: 'TEST_EDITOR',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.default
			},
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
				createDiffEditorInput: ({ modified, original, options }, group) => ({
					editor: accessor.instantiationService.createInstance(
						DiffEditorInput,
						'name',
						'description',
						constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
						constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
						undefined)
				})
			}
		);

		const resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('my://resource-basics.test-diff') },
			modified: { resource: URI.file('my://resource-basics.test-diff') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
			resultingResolution.editor.dispose();
		} else {
			assert.fail();
		}
		registeredEditor.dispose();
	});

	test('Diff editor Resolve - Different Types', async () => {
		const [part, service, accessor] = await createEditorResolverService();
		let diffOneCounter = 0;
		let diffTwoCounter = 0;
		let defaultDiffCounter = 0;
		const registeredEditor = service.registerEditor('*.test-diff',
			{
				id: 'TEST_EDITOR',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.default
			},
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
				createDiffEditorInput: ({ modified, original, options }, group) => {
					diffOneCounter++;
					return {
						editor: accessor.instantiationService.createInstance(
							DiffEditorInput,
							'name',
							'description',
							constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
							constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
							undefined)
					};
				}
			}
		);

		const secondRegisteredEditor = service.registerEditor('*.test-secondDiff',
			{
				id: 'TEST_EDITOR_2',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.default
			},
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
				createDiffEditorInput: ({ modified, original, options }, group) => {
					diffTwoCounter++;
					return {
						editor: accessor.instantiationService.createInstance(
							DiffEditorInput,
							'name',
							'description',
							constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
							constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
							undefined)
					};
				}
			}
		);

		const defaultRegisteredEditor = service.registerEditor('*',
			{
				id: 'default',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.option
			},
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
				createDiffEditorInput: ({ modified, original, options }, group) => {
					defaultDiffCounter++;
					return {
						editor: accessor.instantiationService.createInstance(
							DiffEditorInput,
							'name',
							'description',
							constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
							constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
							undefined)
					};
				}
			}
		);

		let resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('my://resource-basics.test-diff') },
			modified: { resource: URI.file('my://resource-basics.test-diff') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(diffOneCounter, 1);
			assert.strictEqual(diffTwoCounter, 0);
			assert.strictEqual(defaultDiffCounter, 0);
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
			resultingResolution.editor.dispose();
		} else {
			assert.fail();
		}

		resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('my://resource-basics.test-secondDiff') },
			modified: { resource: URI.file('my://resource-basics.test-secondDiff') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(diffOneCounter, 1);
			assert.strictEqual(diffTwoCounter, 1);
			assert.strictEqual(defaultDiffCounter, 0);
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
			resultingResolution.editor.dispose();
		} else {
			assert.fail();
		}

		resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('my://resource-basics.test-secondDiff') },
			modified: { resource: URI.file('my://resource-basics.test-diff') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(diffOneCounter, 1);
			assert.strictEqual(diffTwoCounter, 1);
			assert.strictEqual(defaultDiffCounter, 1);
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
			resultingResolution.editor.dispose();
		} else {
			assert.fail();
		}

		resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('my://resource-basics.test-diff') },
			modified: { resource: URI.file('my://resource-basics.test-secondDiff') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(diffOneCounter, 1);
			assert.strictEqual(diffTwoCounter, 1);
			assert.strictEqual(defaultDiffCounter, 2);
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
			resultingResolution.editor.dispose();
		} else {
			assert.fail();
		}

		resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('my://resource-basics.test-secondDiff') },
			modified: { resource: URI.file('my://resource-basics.test-diff') },
			options: { override: 'TEST_EDITOR' }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(diffOneCounter, 2);
			assert.strictEqual(diffTwoCounter, 1);
			assert.strictEqual(defaultDiffCounter, 2);
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
			resultingResolution.editor.dispose();
		} else {
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

		const registeredEditor = service.registerEditor('*.test',
			{
				id: 'TEST_EDITOR',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.default
			},
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
			}
		);

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
		const registeredSingleEditor = service.registerEditor('*.test',
			testEditorInfo,
			{},
			{
				createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
			}
		);

		const registeredDiffEditor = service.registerEditor('*.test',
			testEditorInfo,
			{},
			{
				createDiffEditorInput: ({ modified, original, options }, group) => ({
					editor: accessor.instantiationService.createInstance(
						DiffEditorInput,
						'name',
						'description',
						constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
						constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
						undefined)
				})
			}
		);

		// Resolve a diff
		let resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('my://resource-basics.test') },
			modified: { resource: URI.file('my://resource-basics.test') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(resultingResolution.editor.typeId, 'workbench.editors.diffEditorInput');
			resultingResolution.editor.dispose();
		} else {
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
		if (resultingResolution !== ResolvedStatus.NONE) {
			assert.fail();
		}

		registeredSingleEditor.dispose();
	});
});
