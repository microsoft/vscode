/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { registerWindow } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { BeforeAuxiliaryWindowUnloadEvent, IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../browser/editorPartWindowBinding.js';
import { GroupDirection, GroupsOrder, IEditorGroupsService, IEditorPart, IEmbeddedEditorPart } from '../../common/editorGroupsService.js';
import { EditorService } from '../../browser/editorService.js';
import { IEditorService, SIDE_GROUP } from '../../common/editorService.js';
import { timeout } from '../../../../../base/common/async.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { EditorPartEmbeddedContext } from '../../../../common/contextkeys.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('Embedded Editor Part', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForEmbeddedEditorPart';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForEmbeddedEditorPart';

	const disposables = new DisposableStore();

	setup(() => {
		disposables.add(registerTestEditor(TEST_EDITOR_ID, [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(SideBySideEditorInput)], TEST_EDITOR_INPUT_ID));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(path: string): TestFileEditorInput {
		return disposables.add(new TestFileEditorInput(URI.file(path), TEST_EDITOR_INPUT_ID));
	}

	async function createServices(configure?: (instantiationService: TestInstantiationService) => void) {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		configure?.(instantiationService);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		return parts;
	}

	function elementOf(part: IEmbeddedEditorPart): HTMLElement {
		return part.element as HTMLElement;
	}

	function sameAs(actual: unknown, expected: IEmbeddedEditorPart): boolean {
		return actual === (expected as unknown);
	}

	function createContainer(): HTMLElement {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });

		return container;
	}

	test('parts share a document, each with its own scoped instantiation service', async () => {
		const parts = await createServices();

		const first = parts.createEditorPart({ container: createContainer() });
		const second = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => { first.close(); second.close(); } });

		assert.deepStrictEqual({
			distinct: first !== second,
			firstByElement: sameAs(parts.getPart(elementOf(first).appendChild(mainWindow.document.createElement('span'))), first),
			secondByElement: sameAs(parts.getPart(elementOf(second).appendChild(mainWindow.document.createElement('span'))), second),
			scopedDiffer: parts.getScopedInstantiationService(first) !== parts.getScopedInstantiationService(second),
			listed: parts.parts.includes(first as never) && parts.parts.includes(second as never)
		}, { distinct: true, firstByElement: true, secondByElement: true, scopedDiffer: true, listed: true });
	});

	test('services given to a part reach what it creates, in place of the workbench\'s, and only its own', async () => {
		const ITestScope = createDecorator<{ readonly _serviceBrand: undefined; readonly name: string }>('embeddedEditorPartTestScope');
		const parts = await createServices(instantiationService => instantiationService.stub(ITestScope, { _serviceBrand: undefined, name: 'workbench' }));
		const owned = parts.createEditorPart({ container: createContainer(), services: new ServiceCollection([ITestScope, { _serviceBrand: undefined, name: 'owner' }]) });
		const plain = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => { owned.close(); plain.close(); } });
		// Its groups, and their editors, are created by the part's scoped instantiation service.
		const scopeOf = (part: IEmbeddedEditorPart) => (part as unknown as EditorPart).scopedInstantiationService.invokeFunction(accessor => accessor.get(ITestScope).name);

		assert.deepStrictEqual({ owned: scopeOf(owned), plain: scopeOf(plain) }, { owned: 'owner', plain: 'workbench' });
	});

	test('a part belongs to the window its container is in, such as an auxiliary window; the main part and parts in the main window are unchanged', async () => {
		const parts = await createServices();
		const iframe = mainWindow.document.body.appendChild(mainWindow.document.createElement('iframe'));
		disposables.add({ dispose: () => iframe.remove() });
		const auxiliaryWindow = iframe.contentWindow!;
		ensureCodeWindow(auxiliaryWindow, 4242);
		disposables.add(registerWindow(auxiliaryWindow));
		const auxiliaryContainer = auxiliaryWindow.document.body.appendChild(auxiliaryWindow.document.createElement('div'));

		const inAuxiliaryWindow = parts.createEditorPart({ container: auxiliaryContainer });
		const inMainWindow = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => { inAuxiliaryWindow.close(); inMainWindow.close(); } });

		assert.deepStrictEqual({ auxiliary: inAuxiliaryWindow.windowId, main: inMainWindow.windowId, mainPart: parts.mainPart.windowId }, { auxiliary: 4242, main: mainWindow.vscodeWindowId, mainPart: mainWindow.vscodeWindowId });
	});

	test('region role and label are applied', async () => {
		const parts = await createServices();
		const container = createContainer();
		const part = parts.createEditorPart({ container, label: 'Side' });
		disposables.add({ dispose: () => part.close() });

		assert.deepStrictEqual({
			role: elementOf(part).getAttribute('role'),
			label: elementOf(part).getAttribute('aria-label')
		}, { role: 'region', label: 'Side' });
	});

	test('does not announce an auxiliary part and does not shift labels', async () => {
		const parts = await createServices();

		let auxiliaryEvents = 0;
		disposables.add(parts.onDidCreateAuxiliaryEditorPart(() => auxiliaryEvents++));

		const part = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => part.close() });

		assert.deepStrictEqual({ auxiliaryEvents, labels: parts.parts.length }, { auxiliaryEvents: 0, labels: 2 });
	});

	test('is excluded from the persisted state', async () => {
		const parts = await createServices();

		const createState = () => (parts as unknown as { createState(): { auxiliary: unknown[]; mru: number[] } }).createState();
		const part = parts.createEditorPart({ container: createContainer() });
		await part.activeGroup.openEditor(createInput('/embedded/a.txt'));

		const state = createState();
		assert.deepStrictEqual({ auxiliary: state.auxiliary.length, mru: state.mru }, { auxiliary: 0, mru: [0] });

		part.close();
	});

	test('applying a working set does not close an owned part', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		const input = createInput('/embedded/ws.txt');
		await part.activeGroup.openEditor(input);

		const workingSet = parts.saveWorkingSet('test');
		await parts.applyWorkingSet(workingSet);
		await parts.applyWorkingSet('empty');

		assert.deepStrictEqual({
			stillListed: parts.parts.includes(part as never),
			editors: part.activeGroup.editors.length
		}, { stillListed: true, editors: 1 });

		part.close();
	});

	test('active part falls back to the primary part when focus is in no part', async () => {
		const parts = await createServices();

		const primary = parts.createEditorPart({ container: createContainer(), primary: true });
		const other = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => { primary.close(); other.close(); } });

		assert.ok(sameAs(parts.getPart(mainWindow.document.body.appendChild(mainWindow.document.createElement('i'))), primary));
	});

	test('restoring state keeps owned parts from becoming the most recent part', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => part.close() });
		const markMostRecent = (target: unknown) => (parts as unknown as { doUpdateMostRecentActive(part: unknown, makeMostRecentlyActive: boolean): void }).doUpdateMostRecentActive(target, true);
		markMostRecent(part);
		markMostRecent(parts.testMainPart);

		// Only a state with auxiliary parts rebuilds the MRU list
		parts.createAuxiliaryEditorPart = () => Promise.reject(new Error('not created'));
		await (parts as unknown as { restoreState(state: { auxiliary: unknown[]; mru: number[] }): Promise<void> }).restoreState({ auxiliary: [{}], mru: [0] });

		assert.strictEqual(parts.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)[0].id, parts.mainPart.activeGroup.id);
	});

	test('close merges editors into the main part', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		const input = createInput('/embedded/merge.txt');
		input.setDirty();
		await part.activeGroup.openEditor(input);

		const closed = part.close();

		assert.deepStrictEqual({
			closed,
			merged: parts.mainPart.groups.some(group => group.contains(input)),
			listed: parts.parts.includes(part as never)
		}, { closed: true, merged: true, listed: false });
	});

	test('its last group stays, also as closing all editors closes empty groups: its owner closes it', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => part.close() });
		await part.activeGroup.openEditor(createInput('/embedded/last.txt'));
		part.removeGroup(part.activeGroup);
		const afterRemove = { listed: parts.parts.includes(part as never), groups: part.groups.length };
		await part.activeGroup.closeAllEditors();
		await part.activeGroup.closeAllEditors();

		assert.deepStrictEqual({ afterRemove, afterCloseAll: { listed: parts.parts.includes(part as never), groups: part.groups.length, closeEmptyGroups: part.partOptions.closeEmptyGroups } }, {
			afterRemove: { listed: true, groups: 1 },
			afterCloseAll: { listed: true, groups: 1, closeEmptyGroups: true },
		});
	});

	test('a part that limits its editors opens the others where it says, however they get to it, and keeps no group for them; other parts take every editor', async () => {
		let instantiationService!: TestInstantiationService;
		const parts = await createServices(service => instantiationService = service);
		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		const others = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => others.close() });
		const limited = parts.createEditorPart({ container: createContainer(), redirectEditor: editor => editor.resource?.path.startsWith('/limited/') ? undefined : others.activeGroup });
		disposables.add({ dispose: () => limited.close() });
		others.layout(800, 400, 0, 0);
		limited.layout(800, 200, 400, 0);
		// Pinned, so that no editor replaces another as a preview.
		const pinned = { pinned: true };
		const where = (input: TestFileEditorInput) => parts.mainPart.groups.some(group => group.contains(input)) ? 'main' : others.groups.some(group => group.contains(input)) ? 'others' : limited.groups.some(group => group.contains(input)) ? 'limited' : 'none';

		const own = createInput('/limited/own.txt');
		await limited.activeGroup.openEditor(own, pinned);
		// The focus in the part makes it the active part, as with the focus in a terminal.
		parts.activateGroup(limited.activeGroup.id);
		limited.activeGroup.focus();
		const active = createInput('/active.txt');
		await editorService.openEditor(active, pinned);
		parts.activateGroup(limited.activeGroup.id);
		limited.activeGroup.focus();
		const side = createInput('/side.txt');
		await editorService.openEditor(side, pinned, SIDE_GROUP);
		const moved = createInput('/moved.txt');
		await parts.mainPart.activeGroup.openEditor(moved, pinned);
		parts.mainPart.activeGroup.moveEditor(moved, limited.activeGroup);
		const back = createInput('/back.txt');
		await others.activeGroup.openEditor(back, pinned);
		others.activeGroup.moveEditors([{ editor: back }], limited.activeGroup);
		const copied = createInput('/copied.txt');
		await parts.mainPart.activeGroup.openEditor(copied, pinned);
		parts.mainPart.activeGroup.copyEditor(copied, limited.activeGroup);
		// A drop that splits a group of the part creates a group for the editor first.
		const dropped = createInput('/dropped.txt');
		await parts.mainPart.activeGroup.openEditor(dropped, pinned);
		parts.mainPart.activeGroup.moveEditors([{ editor: dropped }], limited.addGroup(limited.activeGroup, GroupDirection.RIGHT));
		await timeout(0);
		const main = createInput('/main.txt');
		await editorService.openEditor(main, pinned, parts.mainPart.activeGroup);

		assert.deepStrictEqual({
			own: where(own), active: where(active), side: where(side), moved: where(moved), back: where(back), copied: [where(copied), others.activeGroup.editors.some(editor => editor.resource?.path === '/copied.txt')], dropped: where(dropped), main: where(main),
			limitedGroups: limited.groups.length, limitedEditors: limited.groups.flatMap(group => group.editors.map(editor => editor.resource?.path)),
		}, {
			own: 'limited', active: 'others', side: 'others', moved: 'others', back: 'others', copied: ['main', true], dropped: 'others', main: 'main',
			limitedGroups: 1, limitedEditors: ['/limited/own.txt'],
		});
	});

	test('its groups are marked as embedded for their menus, unlike those of the main part', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => part.close() });
		const embedded = (editorPart: IEditorPart) => parts.getScopedInstantiationService(editorPart).invokeFunction(accessor => accessor.get(IContextKeyService).getContextKeyValue(EditorPartEmbeddedContext.key));

		assert.deepStrictEqual({ embedded: embedded(part), elsewhere: parts.mainPart.activeGroup.scopedContextKeyService.getContextKeyValue(EditorPartEmbeddedContext.key) }, { embedded: true, elsewhere: undefined });
	});

	test('state and group view options are applied', async () => {
		const parts = await createServices();

		const first = parts.createEditorPart({ container: createContainer(), groupViewOptions: { preferredFocus: true } as never });
		first.activeGroup.openEditor(createInput('/embedded/s.txt'));
		await first.activeGroup.openEditor(createInput('/embedded/s2.txt'));
		const state = first.createState();
		first.close();

		const second = parts.createEditorPart({ container: createContainer(), state });
		disposables.add({ dispose: () => second.close() });

		assert.strictEqual(second.groups.length, 1);
	});

	suite('bindEditorPartsToWindow', () => {

		function createWindow() {
			const onBeforeUnload = disposables.add(new Emitter<BeforeAuxiliaryWindowUnloadEvent>());
			const onUnload = disposables.add(new Emitter<void>());

			return { onBeforeUnload, onUnload, window: { onBeforeUnload: onBeforeUnload.event, onUnload: onUnload.event } as unknown as IAuxiliaryWindow };
		}

		test('vetoes unload for editors that cannot move and closes parts on unload', async () => {
			const parts = await createServices();
			const { onBeforeUnload, onUnload, window } = createWindow();

			const movable = parts.createEditorPart({ container: createContainer() });
			const pinned = parts.createEditorPart({ container: createContainer() });
			const input = createInput('/embedded/pinned.txt');
			input.canMove = () => 'cannot move';
			await movable.activeGroup.openEditor(createInput('/embedded/free.txt'));
			await pinned.activeGroup.openEditor(input);

			const binding = bindEditorPartsToWindow(window, [movable, pinned] satisfies IEmbeddedEditorPart[], parts);
			disposables.add(binding);

			let vetoes: string[] = [];
			onBeforeUnload.fire({ veto: (reason: string | true) => { if (typeof reason === 'string') { vetoes.push(reason); } } } as never);
			assert.deepStrictEqual(vetoes, ['cannot move']);

			input.canMove = () => true;
			vetoes = [];
			onBeforeUnload.fire({ veto: (reason: string | true) => { if (typeof reason === 'string') { vetoes.push(reason); } } } as never);
			assert.deepStrictEqual(vetoes, []);

			onUnload.fire();
			assert.deepStrictEqual({
				movableListed: parts.parts.includes(movable as never),
				pinnedListed: parts.parts.includes(pinned as never)
			}, { movableListed: false, pinnedListed: false });
		});
	});
});
