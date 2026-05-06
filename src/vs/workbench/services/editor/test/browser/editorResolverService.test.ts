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
import { IEditorResolverService, ResolvedStatus, RegisteredEditorPriority, diffEditorsAssociationsSettingId, editorsAssociationsSettingId } from '../../common/editorResolverService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
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

	function constructDisposableDiffEditorInput(accessor: TestServiceAccessor, original: { readonly resource?: URI }, modified: { readonly resource?: URI }, typeId: string): DiffEditorInput {
		return accessor.instantiationService.createInstance(
			DiffEditorInput,
			'name',
			'description',
			constructDisposableFileEditorInput(original.resource ?? URI.from({ scheme: Schemas.untitled }), typeId, disposables),
			constructDisposableFileEditorInput(modified.resource ?? URI.from({ scheme: Schemas.untitled }), typeId, disposables),
			undefined);
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

	test('Diff editor Resolve - Falls back to editor associations', async () => {
		const CUSTOM_EDITOR_INPUT_ID = 'testCustomEditorInput';
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				[editorsAssociationsSettingId]: {
					'*.test-diff-association': 'TEST_EDITOR'
				}
			})
		}, disposables);
		const [part, service, accessor] = await createEditorResolverService(instantiationService);
		let customDiffCounter = 0;
		let defaultDiffCounter = 0;

		const defaultRegisteredEditor = service.registerEditor('*',
			{
				id: 'default',
				label: 'Default Editor',
				detail: 'Default',
				priority: RegisteredEditorPriority.builtin
			},
			{},
			{
				createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, TEST_EDITOR_INPUT_ID, disposables) }),
				createDiffEditorInput: ({ modified, original }) => {
					defaultDiffCounter++;
					return { editor: constructDisposableDiffEditorInput(accessor, original, modified, TEST_EDITOR_INPUT_ID) };
				}
			}
		);

		const customRegisteredEditor = service.registerEditor('*.test-diff-association',
			{
				id: 'TEST_EDITOR',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.option
			},
			{},
			{
				createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, CUSTOM_EDITOR_INPUT_ID, disposables) }),
				createDiffEditorInput: ({ modified, original }) => {
					customDiffCounter++;
					return { editor: constructDisposableDiffEditorInput(accessor, original, modified, CUSTOM_EDITOR_INPUT_ID) };
				}
			}
		);

		const resultingResolution = await service.resolveEditor({
			original: { resource: URI.file('resource-basics.test-diff-association') },
			modified: { resource: URI.file('resource-basics.test-diff-association') }
		}, part.activeGroup);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(customDiffCounter, 1);
			assert.strictEqual(defaultDiffCounter, 0);
			resultingResolution.editor.dispose();
		} else {
			assert.fail();
		}

		defaultRegisteredEditor.dispose();
		customRegisteredEditor.dispose();
	});

	test('Diff editor Resolve - Diff associations override editor associations', async () => {
		const EDITOR_ASSOCIATION_INPUT_ID = 'testEditorAssociationInput';
		const DIFF_ASSOCIATION_INPUT_ID = 'testDiffAssociationInput';
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				[editorsAssociationsSettingId]: {
					'*.test-diff-association': 'TEST_EDITOR'
				},
				[diffEditorsAssociationsSettingId]: {
					'*.test-diff-association': 'TEST_DIFF_EDITOR'
				}
			})
		}, disposables);
		const [part, service, accessor] = await createEditorResolverService(instantiationService);
		let editorAssociationDiffCounter = 0;
		let diffAssociationDiffCounter = 0;

		const editorAssociationRegisteredEditor = service.registerEditor('*.test-diff-association',
			{
				id: 'TEST_EDITOR',
				label: 'Test Editor Label',
				detail: 'Test Editor Details',
				priority: RegisteredEditorPriority.option
			},
			{},
			{
				createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, EDITOR_ASSOCIATION_INPUT_ID, disposables) }),
				createDiffEditorInput: ({ modified, original }) => {
					editorAssociationDiffCounter++;
					return { editor: constructDisposableDiffEditorInput(accessor, original, modified, EDITOR_ASSOCIATION_INPUT_ID) };
				}
			}
		);

		const diffAssociationRegisteredEditor = service.registerEditor('*.test-diff-association',
			{
				id: 'TEST_DIFF_EDITOR',
				label: 'Test Diff Editor Label',
				detail: 'Test Diff Editor Details',
				priority: RegisteredEditorPriority.option
			},
			{},
			{
				createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, DIFF_ASSOCIATION_INPUT_ID, disposables) }),
				createDiffEditorInput: ({ modified, original }) => {
					diffAssociationDiffCounter++;
					return { editor: constructDisposableDiffEditorInput(accessor, original, modified, DIFF_ASSOCIATION_INPUT_ID) };
				}
			}
		);

		const diffResolution = await service.resolveEditor({
			original: { resource: URI.file('resource-basics.test-diff-association') },
			modified: { resource: URI.file('resource-basics.test-diff-association') }
		}, part.activeGroup);
		assert.ok(diffResolution);
		assert.notStrictEqual(typeof diffResolution, 'number');
		if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(editorAssociationDiffCounter, 0);
			assert.strictEqual(diffAssociationDiffCounter, 1);
			diffResolution.editor.dispose();
		} else {
			assert.fail();
		}

		const editorResolution = await service.resolveEditor({ resource: URI.file('resource-basics.test-diff-association') }, part.activeGroup);
		assert.ok(editorResolution);
		assert.notStrictEqual(typeof editorResolution, 'number');
		if (editorResolution !== ResolvedStatus.ABORT && editorResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(editorResolution.editor.typeId, EDITOR_ASSOCIATION_INPUT_ID);
			editorResolution.editor.dispose();
		} else {
			assert.fail();
		}

		editorAssociationRegisteredEditor.dispose();
		diffAssociationRegisteredEditor.dispose();
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

	test('User-configured editor association resolves on first startup with empty cache #244597', async () => {
		const CUSTOM_EDITOR_INPUT_ID = 'testCustomEditorInput';

		// Set up a configuration with a user-configured editor association
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({
				[editorsAssociationsSettingId]: {
					'*.md': 'CUSTOM_MD_EDITOR'
				}
			})
		}, disposables);

		const part = await createEditorPart(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, part);

		const editorResolverService = instantiationService.createInstance(EditorResolverService);
		disposables.add(editorResolverService);

		// Register both the default text editor and the custom markdown editor with 'option' priority
		// (matching how markdown preview is registered in package.json)
		const defaultEditor = editorResolverService.registerEditor('*',
			{
				id: 'default',
				label: 'Default Editor',
				detail: 'Default',
				priority: RegisteredEditorPriority.default
			},
			{},
			{
				createEditorInput: ({ resource }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
			}
		);

		const customEditor = editorResolverService.registerEditor('*.md',
			{
				id: 'CUSTOM_MD_EDITOR',
				label: 'Markdown Preview',
				detail: 'Markdown Preview Details',
				priority: RegisteredEditorPriority.option
			},
			{},
			{
				createEditorInput: ({ resource }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), CUSTOM_EDITOR_INPUT_ID) })
			}
		);

		// Resolve a .md file - should use the custom editor due to user association
		const resultingResolution = await editorResolverService.resolveEditor(
			{ resource: URI.file('test.md') },
			part.activeGroup
		);
		assert.ok(resultingResolution);
		assert.notStrictEqual(typeof resultingResolution, 'number');
		if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
			assert.strictEqual(resultingResolution.editor.typeId, CUSTOM_EDITOR_INPUT_ID,
				'Should resolve to custom editor when user has configured editor association');
			resultingResolution.editor.dispose();
		} else {
			assert.fail('Expected editor to resolve successfully');
		}

		defaultEditor.dispose();
		customEditor.dispose();
	});
});
