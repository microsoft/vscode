/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { basename } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../platform/registry/common/platform.js';
import { IEditorPartUIState } from '../../../workbench/browser/parts/editor/editorPart.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../workbench/common/editor.js';
import { EditorInput } from '../../../workbench/common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../workbench/services/editor/common/editorGroupsService.js';
import { createEditorParts, registerTestEditor, TestEditorPart, TestFileEditorInput, workbenchInstantiationService, workbenchTeardown } from '../../../workbench/test/browser/workbenchTestServices.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { applySingleGroupEditorStateInPlace } from '../../browser/parts/editorGroupStateInPlace.js';

suite('Sessions - Apply editor group state in place', () => {

	const TEST_EDITOR_ID = 'sessionsEditorGroupStateInPlaceEditor';
	const TEST_EDITOR_INPUT_ID = 'sessionsEditorGroupStateInPlaceInput';

	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService | undefined;

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(async () => {
		if (instantiationService) {
			await workbenchTeardown(instantiationService);
			instantiationService = undefined;
		}
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createPart(): Promise<TestEditorPart> {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		return parts.testMainPart;
	}

	function input(path: string): TestFileEditorInput {
		return new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID);
	}

	function paths(editors: readonly EditorInput[]): string[] {
		return editors.map(editor => editor.resource!.path);
	}

	async function captureState(part: TestEditorPart, editors: TestFileEditorInput[], active: TestFileEditorInput): Promise<IEditorPartUIState> {
		const group = part.activeGroup;
		await group.openEditors(editors.map(editor => ({ editor, options: { pinned: true, inactive: editor !== active } })));
		await group.openEditor(active);
		const state = part.createState();
		await group.closeAllEditors();
		return state;
	}

	function recordTransitions(part: TestEditorPart) {
		const group = part.activeGroup;
		const editorCounts: number[] = [];
		const tabRows: string[][] = [];
		const store = new DisposableStore();
		store.add(group.onDidModelChange(() => editorCounts.push(group.count)));
		const observer = new MutationObserver(() => tabRows.push(group.editors.map(editor => basename(editor.resource!))));
		observer.observe(part.element, { subtree: true, childList: true, attributes: true });
		store.add(toDisposable(() => observer.disconnect()));
		return {
			store,
			tabRows,
			result: () => ({
				leftEmpty: editorCounts.includes(0),
				showedTabTwice: tabRows.some(row => new Set(row).size !== row.length),
			}),
		};
	}

	test('switching between two sessions\' editors never empties the group or shows a tab twice', async () => {
		const part = await createPart();
		const incomingChanges = input('/b/Changes');
		const incomingState = await captureState(part, [incomingChanges, input('/files/Files'), input('/b/notes.ts')], incomingChanges);

		const outgoingChanges = input('/a/Changes');
		const sharedFiles = input('/files/Files');
		await part.activeGroup.openEditors([
			{ editor: outgoingChanges, options: { pinned: true } },
			{ editor: sharedFiles, options: { pinned: true, inactive: true } },
			{ editor: input('/a/todo.ts'), options: { pinned: true, inactive: true } },
		]);

		const recording = recordTransitions(part);
		const applied = await applySingleGroupEditorStateInPlace(part.activeGroup, incomingState, instantiationService!);
		await Promise.resolve();
		recording.store.dispose();

		assert.deepStrictEqual({
			applied,
			...recording.result(),
			editors: paths(part.activeGroup.editors),
			active: part.activeGroup.activeEditor?.resource?.path,
			reusedSharedEditor: part.activeGroup.editors.includes(sharedFiles),
			outgoingDisposed: outgoingChanges.isDisposed(),
		}, {
			applied: true,
			leftEmpty: false,
			showedTabTwice: false,
			editors: ['/b/Changes', '/files/Files', '/b/notes.ts'],
			active: '/b/Changes',
			reusedSharedEditor: true,
			outgoingDisposed: true,
		});
	});

	test('keeps the incoming order and active editor when the shared editor was active', async () => {
		const part = await createPart();
		const incomingFiles = input('/files/Files');
		const incomingState = await captureState(part, [input('/b/Changes'), incomingFiles], incomingFiles);

		const sharedFiles = input('/files/Files');
		await part.activeGroup.openEditors([
			{ editor: sharedFiles, options: { pinned: true } },
			{ editor: input('/a/Changes'), options: { pinned: true, inactive: true, index: 0 } },
		]);

		const recording = recordTransitions(part);
		const applied = await applySingleGroupEditorStateInPlace(part.activeGroup, incomingState, instantiationService!);
		recording.store.dispose();

		assert.deepStrictEqual({
			applied,
			leftEmpty: recording.result().leftEmpty,
			editors: paths(part.activeGroup.editors),
			active: part.activeGroup.activeEditor === sharedFiles,
		}, {
			applied: true,
			leftEmpty: false,
			editors: ['/b/Changes', '/files/Files'],
			active: true,
		});
	});

	test('keeps an editor shared by both sessions when the incoming session pins it and previews another', async () => {
		const part = await createPart();
		await part.activeGroup.openEditor(input('/shared/foo.ts'), { pinned: true });
		await part.activeGroup.openEditor(input('/b/bar.ts'), { pinned: false });
		const incomingState = part.createState();
		await part.activeGroup.closeAllEditors();

		const sharedPreview = input('/shared/foo.ts');
		await part.activeGroup.openEditor(sharedPreview, { pinned: false });

		const applied = await applySingleGroupEditorStateInPlace(part.activeGroup, incomingState, instantiationService!);

		assert.deepStrictEqual({
			applied,
			editors: paths(part.activeGroup.editors),
			sharedReusedAndPinned: part.activeGroup.contains(sharedPreview) && part.activeGroup.isPinned(sharedPreview),
		}, {
			applied: true,
			editors: ['/shared/foo.ts', '/b/bar.ts'],
			sharedReusedAndPinned: true,
		});
	});

	test('closes outgoing editors without first moving the reused editors ahead of them', async () => {
		const part = await createPart();
		const incomingFiles = input('/files/Files');
		const incomingState = await captureState(part, [incomingFiles], incomingFiles);

		await part.activeGroup.openEditors([
			{ editor: input('/a/Changes'), options: { pinned: true } },
			{ editor: input('/files/Files'), options: { pinned: true, inactive: true } },
		]);

		const recording = recordTransitions(part);
		const applied = await applySingleGroupEditorStateInPlace(part.activeGroup, incomingState, instantiationService!);
		await Promise.resolve();
		recording.store.dispose();

		assert.deepStrictEqual({ applied, tabRows: recording.tabRows }, { applied: true, tabRows: [['Changes', 'Files'], ['Files']] });
	});

	test('leaves the group untouched when the saved preview editor is open pinned or either side has sticky editors', async () => {
		const part = await createPart();
		const group = part.activeGroup;
		await group.openEditor(input('/b/Changes'), { pinned: true });
		await group.openEditor(input('/shared/foo.ts'), { pinned: false });
		const previewState = part.createState();
		await group.closeAllEditors();
		await group.openEditor(input('/b/Changes'), { pinned: true, sticky: true });
		const stickyState = part.createState();
		await group.closeAllEditors();

		await group.openEditor(input('/shared/foo.ts'), { pinned: true });
		const pinnedSharedPreview = { applied: await applySingleGroupEditorStateInPlace(group, previewState, instantiationService!), editors: paths(group.editors) };
		const incomingSticky = { applied: await applySingleGroupEditorStateInPlace(group, stickyState, instantiationService!), editors: paths(group.editors) };
		await group.closeAllEditors();
		await group.openEditor(input('/a/Changes'), { pinned: true, sticky: true });
		const outgoingSticky = { applied: await applySingleGroupEditorStateInPlace(group, previewState, instantiationService!), editors: paths(group.editors) };

		assert.deepStrictEqual({ pinnedSharedPreview, incomingSticky, outgoingSticky }, {
			pinnedSharedPreview: { applied: false, editors: ['/shared/foo.ts'] },
			incomingSticky: { applied: false, editors: ['/shared/foo.ts'] },
			outgoingSticky: { applied: false, editors: ['/a/Changes'] },
		});
	});

	test('leaves the group untouched when an outgoing editor needs a close confirmation', async () => {
		const part = await createPart();
		const incomingChanges = input('/b/Changes');
		const incomingState = await captureState(part, [incomingChanges], incomingChanges);

		const dirty = input('/a/dirty.ts');
		dirty.dirty = true;
		await part.activeGroup.openEditor(dirty, { pinned: true });

		const applied = await applySingleGroupEditorStateInPlace(part.activeGroup, incomingState, instantiationService!);

		assert.deepStrictEqual({ applied, editors: paths(part.activeGroup.editors) }, { applied: false, editors: ['/a/dirty.ts'] });
		dirty.dirty = false;
	});
});
