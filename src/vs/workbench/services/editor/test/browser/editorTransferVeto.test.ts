/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfirmResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { LocalSelectionTransfer } from '../../../../../platform/dnd/browser/dnd.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { DraggedEditorGroupIdentifier } from '../../../../browser/dnd.js';
import { IEditorGroupView } from '../../../../browser/parts/editor/editor.js';
import { CopyEditorToNewindowAction, MoveEditorGroupToNewWindowAction, MoveEditorToNewWindowAction } from '../../../../browser/parts/editor/editorActions.js';
import { MoveModalEditorToMainWindowAction } from '../../../../browser/parts/editor/editorCommands.js';
import { AuxiliaryEditorPartImpl } from '../../../../browser/parts/editor/auxiliaryEditorPart.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { getEditorsTransferVeto, IEditorTransferVeto, INewWindowTransfer, NEW_WINDOW_TARGET, transferToNewWindow } from '../../../../browser/parts/editor/editorTransferVeto.js';
import { EditorExtensions, EditorInputCapabilities, EditorsOrder, GroupIdentifier, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { createEditorParts, registerTestEditor, TestEditorParts, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { GroupDirection, GroupsOrder, IAuxiliaryEditorPart, IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart, IModalEditorPart, MergeGroupMode } from '../../common/editorGroupsService.js';

/** Records the errors it is asked to show, as a veto is shown. */
class RecordingDialogService extends TestDialogService {
	readonly errors: { message: string; detail: string | undefined }[] = [];
	override async error(message: string, detail?: string): Promise<void> {
		this.errors.push({ message, detail });
	}
}

class ConfirmingTestFileEditorInput extends TestFileEditorInput {
	override readonly closeHandler: IEditorCloseHandler = { showConfirm: () => true, confirm: async () => ConfirmResult.CANCEL };
}

const VETO = 'This editor cannot leave its window.';

/** An editor that cannot go into the groups that `refuses` picks, as an editor that can only be shown in some windows. */
class PartSensitiveEditorInput extends TestFileEditorInput {
	refuses: (target: GroupIdentifier) => boolean = () => false;
	override canMove(_source: GroupIdentifier, target: GroupIdentifier): true | string {
		return this.refuses(target) ? VETO : true;
	}
}

suite('Editor transfer vetoes', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForTransferVetoes';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForTransferVetoes';

	const disposables = new DisposableStore();
	/** Closes the parts of a test while the main part they merge back into still exists. */
	const partClosers = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(() => {
		partClosers.clear();
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(path: string, options?: { veto?: boolean; singleton?: boolean; dirty?: boolean; confirming?: boolean }): TestFileEditorInput {
		const input = disposables.add(options?.confirming ? new ConfirmingTestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID) : new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
		if (options?.veto) {
			input.setMoveDisabled(VETO);
		}
		if (options?.singleton) {
			input.capabilities = EditorInputCapabilities.Singleton;
		}
		if (options?.dirty) {
			input.setDirty();
		}

		return input;
	}

	async function createServices(): Promise<{ parts: TestEditorParts; dialogs: RecordingDialogService; instantiationService: TestInstantiationService }> {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		const dialogs = new RecordingDialogService();
		instantiationService.stub(IDialogService, dialogs);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		return { parts, dialogs, instantiationService };
	}

	/** A part of the main window beside its main part: a transfer into it crosses parts within the window. */
	function createPart(parts: TestEditorParts): IContentPart {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		const part = parts.createEditorPart({ container });
		// Force: a part that holds an editor that cannot go back to the main part refuses to close
		partClosers.add({ dispose: () => part.forceClose() });
		part.layout(800, 600, 0, 0);

		return part;
	}

	/** An auxiliary editor part of the main window, compact or not, as an auxiliary window has. */
	function createAuxiliaryPart(parts: TestEditorParts, instantiationService: TestInstantiationService, compact: boolean): AuxiliaryEditorPartImpl {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		const part = disposables.add(instantiationService.createInstance(AuxiliaryEditorPartImpl, mainWindow.vscodeWindowId, parts, undefined, 'Auxiliary'));
		part.updateOptions({ compact });
		disposables.add(parts.registerPart(part));
		part.create(container);
		part.layout(800, 600, 0, 0);

		return part;
	}

	/** The group events of `parts`, and the moves out of a content part that are announced. */
	function recordEvents(...parts: (IEditorPart | IContentPart)[]): string[] {
		const events: string[] = [];
		for (const part of parts) {
			disposables.add(part.onDidAddGroup(() => events.push('add')));
			disposables.add(part.onDidRemoveGroup(() => events.push('remove')));
			disposables.add(part.onDidMoveGroup(() => events.push('move')));
			disposables.add(part.onDidActivateGroup(() => events.push('activate')));
			disposables.add(part.onDidChangeGroupIndex(() => events.push('index')));
			const willMoveOut = (part as IContentPart).onWillMoveGroupOut;
			if (willMoveOut) {
				disposables.add(willMoveOut(() => events.push('willMoveOut')));
			}
		}

		return events;
	}

	function editorsOf(group: IEditorGroup): string[] {
		return group.getEditors(EditorsOrder.SEQUENTIAL).map(editor => editor.resource!.path);
	}

	suite('which editors are asked', () => {

		test('only the participating editors are asked; a copy asks only singleton editors; a new window asks canMoveToNewWindow', () => {
			const ordinary = createInput('/ordinary');
			const vetoing = createInput('/vetoing', { veto: true });
			const singleton = createInput('/singleton', { veto: true, singleton: true });
			const dirty = createInput('/dirty', { veto: true, dirty: true });
			const newWindowOnly = disposables.add(new class extends TestFileEditorInput {
				override canMoveToNewWindow(): string { return 'not to a new window'; }
			}(URI.file('/newWindowOnly'), TEST_EDITOR_INPUT_ID));

			const message = (veto: IEditorTransferVeto | undefined) => veto && { message: veto.message, dirty: veto.dirty, editor: veto.editor.resource!.path };
			assert.deepStrictEqual({
				ordinaryOnly: getEditorsTransferVeto([ordinary], 1, 2),
				withVetoing: message(getEditorsTransferVeto([ordinary, vetoing], 1, 2)),
				copyOfVetoing: getEditorsTransferVeto([vetoing], 1, 2, { copy: true }),
				copyOfSingleton: message(getEditorsTransferVeto([singleton], 1, 2, { copy: true })),
				dirty: message(getEditorsTransferVeto([dirty], 1, 2)),
				newWindowOnlyToGroup: getEditorsTransferVeto([newWindowOnly], 1, 2),
				newWindowOnlyToNewWindow: message(getEditorsTransferVeto([newWindowOnly], 1, NEW_WINDOW_TARGET)),
			}, {
				ordinaryOnly: undefined,
				withVetoing: { message: VETO, dirty: false, editor: '/vetoing' },
				copyOfVetoing: undefined,
				copyOfSingleton: { message: VETO, dirty: false, editor: '/singleton' },
				dirty: { message: VETO, dirty: true, editor: '/dirty' },
				newWindowOnlyToGroup: undefined,
				newWindowOnlyToNewWindow: { message: 'not to a new window', dirty: false, editor: '/newWindowOnly' },
			});
		});
	});

	suite('into a new window', () => {

		function createFakePart(options?: { readonly content?: boolean }): { part: IAuxiliaryEditorPart; closed: () => number } {
			let closed = 0;
			const onWillClose = disposables.add(new Emitter<void>());
			const group = new class extends mock<IEditorGroup>() {
				override readonly id = 42;
				override readonly isEmpty = !options?.content;
			}();
			const part = new class extends mock<IAuxiliaryEditorPart>() {
				override readonly onWillClose = onWillClose.event;
				override readonly activeGroup = group;
				override readonly groups = [group];
				override close(): boolean { closed++; onWillClose.fire(); return true; }
			}();

			return { part, closed: () => closed };
		}

		async function run(options: { veto?: (target: unknown) => string | undefined; part?: IAuxiliaryEditorPart; sourceAlive?: boolean }): Promise<{ created: number; vetoes: string[]; transferred: number; result: boolean }> {
			let created = 0;
			let transferred = 0;
			const vetoes: string[] = [];
			const editor = createInput('/editor');
			const transfer: INewWindowTransfer = {
				getVeto: target => {
					const message = options.veto?.(target);
					return message ? { editor, message, dirty: false } : undefined;
				},
				showVeto: veto => vetoes.push(veto.message),
				createPart: async () => { created++; return options.part; },
				isSourceAlive: () => options.sourceAlive ?? true,
				transfer: () => transferred++,
			};
			const result = !!await transferToNewWindow(transfer);

			return { created, vetoes, transferred, result };
		}

		test('a veto before the window exists creates no window', async () => {
			const fake = createFakePart();
			assert.deepStrictEqual(await run({ veto: () => VETO, part: fake.part }), { created: 0, vetoes: [VETO], transferred: 0, result: false });
			assert.strictEqual(fake.closed(), 0);
		});

		test('a veto once the window exists, such as of an editor that changed meanwhile, closes the empty window and moves nothing', async () => {
			const fake = createFakePart();
			const result = await run({ veto: target => target === NEW_WINDOW_TARGET ? undefined : VETO, part: fake.part });

			assert.deepStrictEqual({ ...result, closed: fake.closed() }, { created: 1, vetoes: [VETO], transferred: 0, result: false, closed: 1 });
		});

		test('a window that got an editor meanwhile is neither closed nor merged on a late veto', async () => {
			const fake = createFakePart({ content: true });
			const result = await run({ veto: target => target === NEW_WINDOW_TARGET ? undefined : VETO, part: fake.part });

			assert.deepStrictEqual({ ...result, closed: fake.closed() }, { created: 1, vetoes: [VETO], transferred: 0, result: false, closed: 0 });
		});

		test('editors that went away meanwhile do not move, and the empty window closes', async () => {
			const fake = createFakePart();
			const result = await run({ part: fake.part, sourceAlive: false });

			assert.deepStrictEqual({ ...result, closed: fake.closed() }, { created: 1, vetoes: [], transferred: 0, result: false, closed: 1 });
		});

		test('editors that can go move into the window', async () => {
			const fake = createFakePart();
			const result = await run({ part: fake.part });

			assert.deepStrictEqual({ ...result, closed: fake.closed() }, { created: 1, vetoes: [], transferred: 1, result: true, closed: 0 });
		});
	});

	suite('across parts', () => {

		test('moving a group with an editor that cannot go leaves both parts as they were, with no events', async () => {
			const { parts, dialogs } = await createServices();
			const part = createPart(parts);
			const ordinary = createInput('/ordinary');
			const vetoing = createInput('/vetoing', { veto: true });
			const source = part.activeGroup;
			await source.openEditors([{ editor: ordinary, options: { pinned: true } }, { editor: vetoing, options: { pinned: true, inactive: true } }]);
			const events = recordEvents(part, parts.mainPart);
			const mainGroupCount = parts.mainPart.count;

			const result = parts.moveGroup(source.id, parts.mainPart.activeGroup.id, GroupDirection.RIGHT);

			assert.deepStrictEqual({
				returnedSource: result === source,
				sourceEditors: editorsOf(source),
				sourceActive: source.activeEditor === ordinary,
				mainGroupCount: parts.mainPart.count,
				events,
				dialogs: dialogs.errors,
			}, {
				returnedSource: true,
				sourceEditors: ['/ordinary', '/vetoing'],
				sourceActive: true,
				mainGroupCount,
				events: [],
				dialogs: [{ message: VETO, detail: undefined }],
			});
		});

		test('a group whose editors can go still moves into another part, announced first', async () => {
			const { parts, dialogs } = await createServices();
			const part = createPart(parts);
			const ordinary = createInput('/ordinary');
			await part.activeGroup.openEditor(ordinary, { pinned: true });
			const events = recordEvents(part);
			const mainGroupCount = parts.mainPart.count;

			const moved = parts.moveGroup(part.activeGroup.id, parts.mainPart.activeGroup.id, GroupDirection.RIGHT);

			assert.deepStrictEqual({ inMain: parts.mainPart.groups.includes(moved as never), editors: editorsOf(moved), mainGroupCount: parts.mainPart.count, announced: events.includes('willMoveOut'), dialogs: dialogs.errors }, {
				inMain: true, editors: ['/ordinary'], mainGroupCount: mainGroupCount + 1, announced: true, dialogs: []
			});
		});

		test('copying a group into another part asks all its editors, which go there themselves; merging a copy asks only singleton editors', async () => {
			const { parts, dialogs } = await createServices();
			const part = createPart(parts);
			await part.activeGroup.openEditor(createInput('/vetoing', { veto: true }), { pinned: true });
			const mainGroupCount = parts.mainPart.count;

			// The copied group clones the model of the group: the same editors, not copies of them
			const copy = parts.copyGroup(part.activeGroup.id, parts.mainPart.activeGroup.id, GroupDirection.RIGHT);
			const afterCopy = { returnedSource: copy === part.activeGroup, mainGroupCount: parts.mainPart.count, dialogs: dialogs.errors.splice(0) };

			// Merging a copy copies each editor
			const merged = parts.mergeGroup(part.activeGroup.id, parts.mainPart.activeGroup.id, { mode: MergeGroupMode.COPY_EDITORS });

			assert.deepStrictEqual({ afterCopy, merged, partEditors: editorsOf(part.activeGroup), dialogs: dialogs.errors }, {
				afterCopy: { returnedSource: true, mainGroupCount, dialogs: [{ message: VETO, detail: undefined }] },
				merged: true,
				partEditors: ['/vetoing'],
				dialogs: [],
			});
		});

		test('copying a group into a compact auxiliary window, which adds its groups to the main window, copies it there, so its editors are not asked', async () => {
			const { parts, dialogs, instantiationService } = await createServices();
			const compact = createAuxiliaryPart(parts, instantiationService, true);
			const source = parts.mainPart.activeGroup;
			await source.openEditor(createInput('/vetoing', { veto: true, dirty: true }), { pinned: true });
			const mainGroupCount = parts.mainPart.count;

			const copy = parts.copyGroup(source.id, compact.activeGroup.id, GroupDirection.RIGHT);

			assert.deepStrictEqual({ inMain: parts.getPart(copy) === parts.mainPart, mainGroupCount: parts.mainPart.count, editors: editorsOf(copy), compactGroups: compact.count, dialogs: dialogs.errors }, {
				inMain: true, mainGroupCount: mainGroupCount + 1, editors: ['/vetoing'], compactGroups: 1, dialogs: []
			});
		});

		test('moving a group onto a compact auxiliary window, which adds its groups to the main window, keeps it there, so its editors are not asked', async () => {
			const { parts, dialogs, instantiationService } = await createServices();
			const compact = createAuxiliaryPart(parts, instantiationService, true);
			const source = parts.mainPart.activeGroup;
			await source.openEditor(createInput('/vetoing', { veto: true, dirty: true }), { pinned: true });
			const other = parts.mainPart.addGroup(source, GroupDirection.DOWN);
			await other.openEditor(createInput('/other'), { pinned: true });
			const mainGroupCount = parts.mainPart.count;

			const moved = parts.moveGroup(source.id, compact.activeGroup.id, GroupDirection.RIGHT);

			assert.deepStrictEqual({ inMain: parts.getPart(moved) === parts.mainPart, mainGroupCount: parts.mainPart.count, editors: editorsOf(moved), compactGroups: compact.count, dialogs: dialogs.errors }, {
				inMain: true, mainGroupCount, editors: ['/vetoing'], compactGroups: 1, dialogs: []
			});
		});

		test('a group moved within a compact auxiliary window moves in its grid, so an editor that cannot go into the main window is not asked about it', async () => {
			const { parts, dialogs, instantiationService } = await createServices();
			const auxiliary = createAuxiliaryPart(parts, instantiationService, false);
			const source = auxiliary.activeGroup;
			const editor = disposables.add(new PartSensitiveEditorInput(URI.file('/notInMainWindow'), TEST_EDITOR_INPUT_ID));
			editor.refuses = target => parts.getPart(target) === parts.mainPart;
			await source.openEditor(editor, { pinned: true });
			const other = auxiliary.addGroup(source, GroupDirection.RIGHT);
			await other.openEditor(createInput('/other'), { pinned: true });
			auxiliary.updateOptions({ compact: true }); // after it had several groups
			const mainGroupCount = parts.mainPart.count;

			const moved = parts.moveGroup(source.id, other.id, GroupDirection.RIGHT);

			assert.deepStrictEqual({ inAuxiliary: parts.getPart(moved) === auxiliary, auxiliaryGroups: auxiliary.count, mainGroupCount: parts.mainPart.count, dialogs: dialogs.errors }, {
				inAuxiliary: true, auxiliaryGroups: 2, mainGroupCount, dialogs: []
			});
		});

		for (const mainRefuses of [true, false]) {
			test(`copying a group out of a compact auxiliary window, whose part adds the copy to the main window, asks its editors about the main window (${mainRefuses ? 'refused' : 'allowed'})`, async () => {
				const { parts, dialogs, instantiationService } = await createServices();
				const compact = createAuxiliaryPart(parts, instantiationService, true);
				const target = createAuxiliaryPart(parts, instantiationService, false);
				const editor = disposables.add(new PartSensitiveEditorInput(URI.file('/partSensitive'), TEST_EDITOR_INPUT_ID));
				editor.refuses = group => parts.getPart(group) === (mainRefuses ? parts.mainPart : target);
				const source = compact.activeGroup;
				await source.openEditor(editor, { pinned: true });
				const mainGroupCount = parts.mainPart.count;
				const events = recordEvents(parts.mainPart, compact, target);

				const copy = parts.copyGroup(source.id, target.activeGroup.id, GroupDirection.RIGHT);

				assert.deepStrictEqual({ returnedSource: copy === source, mainGroupCount: parts.mainPart.count, targetGroups: target.count, events: mainRefuses ? events : [], dialogs: dialogs.errors.length }, mainRefuses
					? { returnedSource: true, mainGroupCount, targetGroups: 1, events: [], dialogs: 1 }
					: { returnedSource: false, mainGroupCount: mainGroupCount + 1, targetGroups: 1, events: [], dialogs: 0 });
			});
		}

		test('copying a group into an auxiliary window that is not compact still asks its editors', async () => {
			const { parts, dialogs, instantiationService } = await createServices();
			const auxiliary = createAuxiliaryPart(parts, instantiationService, false);
			const source = parts.mainPart.activeGroup;
			await source.openEditor(createInput('/vetoing', { veto: true, dirty: true }), { pinned: true });

			const copy = parts.copyGroup(source.id, auxiliary.activeGroup.id, GroupDirection.RIGHT);

			assert.deepStrictEqual({ returnedSource: copy === source, auxiliaryGroups: auxiliary.count, dialogs: dialogs.errors }, {
				returnedSource: true, auxiliaryGroups: 1, dialogs: [{ message: VETO, detail: 'Try saving or reverting the editor first and then try again.' }]
			});
		});

		test('merging a group into another part moves all its editors or none', async () => {
			const { parts, dialogs } = await createServices();
			const part = createPart(parts);
			const source = part.activeGroup;
			await source.openEditors([{ editor: createInput('/ordinary'), options: { pinned: true } }, { editor: createInput('/vetoing', { veto: true, dirty: true }), options: { pinned: true, inactive: true } }]);
			const target = parts.mainPart.activeGroup;

			const merged = parts.mergeGroup(source.id, target.id);

			assert.deepStrictEqual({ merged, sourceEditors: editorsOf(source), targetEditors: editorsOf(target), dialogs: dialogs.errors }, {
				merged: false,
				sourceEditors: ['/ordinary', '/vetoing'],
				targetEditors: [],
				dialogs: [{ message: VETO, detail: 'Try saving or reverting the editor first and then try again.' }],
			});
		});

		test('merging all groups into another part transfers none when a group merged last cannot go, with no events', async () => {
			const { parts, dialogs } = await createServices();
			const part = createPart(parts);
			const first = part.activeGroup;
			await first.openEditor(createInput('/vetoing', { veto: true }), { pinned: true });
			const second = part.addGroup(first, GroupDirection.RIGHT);
			await second.openEditor(createInput('/ordinary'), { pinned: true });
			part.activateGroup(second); // merged first: the most recently active
			const target = parts.mainPart.activeGroup;
			const events = recordEvents(part, parts.mainPart);
			const order = part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).map(group => editorsOf(group));

			const merged = (part as unknown as EditorPart).mergeAllGroups(target.id);

			assert.deepStrictEqual({ order, merged, groups: part.getGroups(GroupsOrder.GRID_APPEARANCE).map(group => editorsOf(group)), targetEditors: editorsOf(target), events, dialogs: dialogs.errors.length }, {
				order: [['/ordinary'], ['/vetoing']],
				merged: false,
				groups: [['/vetoing'], ['/ordinary']],
				targetEditors: [],
				events: [],
				dialogs: 1,
			});
		});

		test('closing a part merges its editors back as before, without the check of explicit transfers, while Restore Editors into Main Window is checked', async () => {
			const { parts, dialogs } = await createServices();
			const part = createPart(parts);
			await part.activeGroup.openEditors([{ editor: createInput('/ordinary', { dirty: true, confirming: true }), options: { pinned: true } }, { editor: createInput('/vetoing', { veto: true, dirty: true, confirming: true }), options: { pinned: true, inactive: true } }]);
			const mainGroup = parts.mainPart.activeGroup;

			// What Restore Editors into Main Window does with the part it runs in
			const restored = (part as unknown as EditorPart).mergeAllGroups(mainGroup.id);
			const afterRestore = { restored, partEditors: editorsOf(part.activeGroup), mainEditors: editorsOf(mainGroup), dialogs: dialogs.errors.splice(0) };

			// Each editor is asked as it moves: one that cannot go stays, with the part
			const closed = part.close();

			assert.deepStrictEqual({ afterRestore, afterClose: { closed, partEditors: editorsOf(part.activeGroup), mainEditors: editorsOf(mainGroup), dialogs: dialogs.errors } }, {
				afterRestore: { restored: false, partEditors: ['/ordinary', '/vetoing'], mainEditors: [], dialogs: [{ message: VETO, detail: 'Try saving or reverting the editor first and then try again.' }] },
				afterClose: { closed: false, partEditors: ['/vetoing'], mainEditors: ['/ordinary'], dialogs: [{ message: VETO, detail: 'Try saving or reverting the editor first and then try again.' }] },
			});
		});

		test('closing a part whose editor cannot go back still adds a group to a main part whose groups are all locked, as before', async () => {
			const { parts } = await createServices();
			parts.mainPart.activeGroup.lock(true);
			const part = createPart(parts);
			await part.activeGroup.openEditor(createInput('/vetoing', { veto: true, confirming: true }), { pinned: true });
			const mainGroupCount = parts.mainPart.count;

			const closed = part.close();

			assert.deepStrictEqual({ closed, mainGroupCount: parts.mainPart.count, partEditors: editorsOf(part.activeGroup) }, { closed: false, mainGroupCount: mainGroupCount + 1, partEditors: ['/vetoing'] });
		});

		test('closing a part whose editors can go back still adds a group to a main part whose groups are all locked', async () => {
			const { parts } = await createServices();
			parts.mainPart.activeGroup.lock(true);
			const part = createPart(parts);
			await part.activeGroup.openEditor(createInput('/ordinary', { confirming: true }), { pinned: true });
			const mainGroupCount = parts.mainPart.count;

			const closed = part.close();

			assert.deepStrictEqual({ closed, mainGroupCount: parts.mainPart.count, editors: editorsOf(parts.mainPart.activeGroup) }, { closed: true, mainGroupCount: mainGroupCount + 1, editors: ['/ordinary'] });
		});

		/** Drops the title of `source` onto the tab strip of `target`, as dragging a group onto the tabs of another group does. */
		function dropGroupOnTabStrip(source: IEditorGroup, target: IEditorGroup, copy: boolean): void {
			LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>().setData([new DraggedEditorGroupIdentifier(source.id)], DraggedEditorGroupIdentifier.prototype);
			const tabStrip = (target as IEditorGroupView).element.querySelector('.tabs-container')!;
			tabStrip.dispatchEvent(new DragEvent(EventType.DROP, { dataTransfer: new DataTransfer(), bubbles: true, cancelable: true, altKey: copy && isMacintosh, ctrlKey: copy && !isMacintosh }));
		}

		test('dropping a group onto the tab strip of another part, with an editor that cannot go, merges nothing and leaves focus and the active group alone', async () => {
			const { parts, dialogs } = await createServices();
			const part = createPart(parts);
			const target = part.activeGroup;
			await target.openEditor(createInput('/target'), { pinned: true });
			const source = parts.mainPart.activeGroup;
			await source.openEditors([{ editor: createInput('/ordinary'), options: { pinned: true } }, { editor: createInput('/vetoing', { veto: true }), options: { pinned: true, inactive: true } }]);
			parts.activateGroup(source);
			const activeBefore = parts.activeGroup;
			const events = recordEvents(part, parts.mainPart);

			dropGroupOnTabStrip(source, target, false);

			assert.deepStrictEqual({
				sourceEditors: editorsOf(source),
				targetEditors: editorsOf(target),
				active: parts.activeGroup === activeBefore,
				focusInTarget: (target as IEditorGroupView).element.contains(mainWindow.document.activeElement),
				events,
				dialogs: dialogs.errors,
				transferCleared: !LocalSelectionTransfer.getInstance<DraggedEditorGroupIdentifier>().hasData(DraggedEditorGroupIdentifier.prototype),
			}, {
				sourceEditors: ['/ordinary', '/vetoing'],
				targetEditors: ['/target'],
				active: true,
				focusInTarget: false,
				events: [],
				dialogs: [{ message: VETO, detail: undefined }],
				transferCleared: true,
			});
		});

		for (const copy of [false, true]) {
			test(`dropping a group onto the tab strip of another part ${copy ? 'copies' : 'moves'} its editors when they can go`, async () => {
				const { parts, dialogs } = await createServices();
				const part = createPart(parts);
				const target = part.activeGroup;
				await target.openEditor(createInput('/target'), { pinned: true });
				const source = parts.mainPart.activeGroup;
				// Not a singleton: a copy does not ask it
				await source.openEditors([{ editor: createInput('/ordinary'), options: { pinned: true } }, { editor: createInput('/vetoing', { veto: copy }), options: { pinned: true, inactive: true } }]);

				dropGroupOnTabStrip(source, target, copy);

				assert.deepStrictEqual({ sourceEditors: source.isEmpty ? [] : editorsOf(source), targetEditors: editorsOf(target), dialogs: dialogs.errors }, {
					sourceEditors: copy ? ['/ordinary', '/vetoing'] : [],
					targetEditors: ['/target', '/ordinary', '/vetoing'],
					dialogs: [],
				});
			});
		}
	});

	suite('commands into a new window', () => {

		/** The new window of the commands: a part of the main window, which a transfer into crosses parts. */
		function stubNewWindow(parts: TestEditorParts): { created: () => IContentPart[] } {
			const created: IContentPart[] = [];
			parts.createAuxiliaryEditorPart = async () => {
				const part = createPart(parts);
				created.push(part);
				return part as unknown as IAuxiliaryEditorPart;
			};

			return { created: () => created };
		}

		async function openTwo(parts: TestEditorParts): Promise<{ group: IEditorGroup; ordinary: EditorInput; vetoing: EditorInput }> {
			const group = parts.mainPart.activeGroup;
			const ordinary = createInput('/ordinary');
			const vetoing = createInput('/vetoing', { veto: true });
			await group.openEditors([{ editor: vetoing, options: { pinned: true } }, { editor: ordinary, options: { pinned: true } }]);

			return { group, ordinary, vetoing };
		}

		for (const [name, action] of [['Move Editor into New Window', MoveEditorToNewWindowAction], ['Copy Editor into New Window', CopyEditorToNewindowAction]] as const) {
			test(`${name} moves the selected editor, while an inactive editor of its group that cannot go stays`, async () => {
				const { parts, instantiationService, dialogs } = await createServices();
				const { created } = stubNewWindow(parts);
				const { group, ordinary } = await openTwo(parts);

				await instantiationService.invokeFunction(accessor => new action().run(accessor, { groupId: group.id, editorIndex: group.getIndexOfEditor(ordinary) }));

				const windows = created();
				assert.deepStrictEqual({ windows: windows.length, inWindow: windows.map(part => editorsOf(part.activeGroup)), stays: editorsOf(group).includes('/vetoing'), dialogs: dialogs.errors }, {
					windows: 1, inWindow: [['/ordinary']], stays: true, dialogs: []
				});
			});
		}

		test('Move Editor into New Window of an editor that cannot go creates no window', async () => {
			const { parts, instantiationService, dialogs } = await createServices();
			const { created } = stubNewWindow(parts);
			const { group, vetoing } = await openTwo(parts);

			await instantiationService.invokeFunction(accessor => new MoveEditorToNewWindowAction().run(accessor, { groupId: group.id, editorIndex: group.getIndexOfEditor(vetoing) }));

			assert.deepStrictEqual({ windows: created().length, editors: editorsOf(group), dialogs: dialogs.errors }, { windows: 0, editors: ['/vetoing', '/ordinary'], dialogs: [{ message: VETO, detail: undefined }] });
		});

		test('Move Editor Group into New Window of a group with an editor that cannot go creates no window', async () => {
			const { parts, instantiationService, dialogs } = await createServices();
			const { created } = stubNewWindow(parts);
			const { group } = await openTwo(parts);

			await instantiationService.invokeFunction(accessor => new MoveEditorGroupToNewWindowAction().run(accessor));

			assert.deepStrictEqual({ windows: created().length, editors: editorsOf(group), dialogs: dialogs.errors.length }, { windows: 0, editors: ['/vetoing', '/ordinary'], dialogs: 1 });
		});

		test('a window created for editors that changed meanwhile closes again, empty', async () => {
			const { parts, instantiationService } = await createServices();
			const { group, ordinary } = await openTwo(parts);
			const created: IContentPart[] = [];
			parts.createAuxiliaryEditorPart = async () => {
				// The editor changes while the window is created: it cannot go anymore
				(ordinary as TestFileEditorInput).setMoveDisabled(VETO);
				const part = createPart(parts);
				created.push(part);
				return part as unknown as IAuxiliaryEditorPart;
			};
			const partsBefore = parts.parts.length;

			await instantiationService.invokeFunction(accessor => new MoveEditorToNewWindowAction().run(accessor, { groupId: group.id, editorIndex: group.getIndexOfEditor(ordinary) }));

			assert.deepStrictEqual({ created: created.length, parts: parts.parts.length, editors: editorsOf(group) }, { created: 1, parts: partsBefore, editors: ['/vetoing', '/ordinary'] });
		});
	});

	suite('Open Modal Editor in Main Window', () => {

		async function openModal(veto: boolean): Promise<{ parts: TestEditorParts; dialogs: RecordingDialogService; instantiationService: TestInstantiationService; modal: IModalEditorPart; isClosed: () => boolean }> {
			const services = await createServices();
			const modal = await services.parts.createModalEditorPart();
			const modalElement = modal.modalElement as HTMLElement;
			await modal.activeGroup.openEditors([{ editor: createInput('/ordinary'), options: { pinned: true } }, { editor: createInput('/later', { veto }), options: { pinned: true, inactive: true } }]);

			return { ...services, modal, isClosed: () => !modalElement.parentElement };
		}

		test('with an editor that cannot go, moves nothing and keeps the modal editor, with no events', async () => {
			const { parts, dialogs, instantiationService, modal, isClosed } = await openModal(true);
			const mainGroup = parts.mainPart.activeGroup;
			const activeElement = mainWindow.document.activeElement;
			const events = recordEvents(modal, parts.mainPart);
			const mainGroupCount = parts.mainPart.count;

			const moved = await instantiationService.invokeFunction(accessor => new MoveModalEditorToMainWindowAction().run(accessor));

			assert.deepStrictEqual({
				moved,
				modalOpen: !isClosed(),
				modalEditors: editorsOf(modal.activeGroup),
				modalActive: modal.activeGroup.activeEditor?.resource?.path,
				mainEditors: editorsOf(mainGroup),
				mainGroupCount: parts.mainPart.count,
				focusUnchanged: mainWindow.document.activeElement === activeElement,
				events,
				dialogs: dialogs.errors,
			}, {
				moved: false,
				modalOpen: true,
				modalEditors: ['/ordinary', '/later'],
				modalActive: '/ordinary',
				mainEditors: [],
				mainGroupCount,
				focusUnchanged: true,
				events: [],
				dialogs: [{ message: VETO, detail: undefined }],
			});

			await modal.close();
		});

		test('with editors that can go, moves them all into the main window and closes the modal editor', async () => {
			const { parts, dialogs, instantiationService, isClosed } = await openModal(false);
			const mainGroup = parts.mainPart.activeGroup;

			const moved = await instantiationService.invokeFunction(accessor => new MoveModalEditorToMainWindowAction().run(accessor));

			assert.deepStrictEqual({ moved, modalOpen: !isClosed(), mainEditors: editorsOf(mainGroup), dialogs: dialogs.errors }, {
				moved: true, modalOpen: false, mainEditors: ['/ordinary', '/later'], dialogs: []
			});
		});
	});
});
