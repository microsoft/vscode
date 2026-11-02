/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { registerWindow } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Context, ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPart } from '../../../../browser/parts/editor/editorPart.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { BeforeAuxiliaryWindowUnloadEvent, IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { bindEditorPartsToWindow } from '../../browser/editorPartWindowBinding.js';
import { GroupDirection, GroupsOrder, IContentPart, IEditorGroupsService, IEditorPart } from '../../common/editorGroupsService.js';

suite('Content Part', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForContentPart';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForContentPart';

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

	async function createServices(options?: { configure?: (instantiationService: TestInstantiationService) => void; realContextKeys?: boolean }) {
		const instantiationService = workbenchInstantiationService({
			contextKeyService: instantiationService => options?.realContextKeys
				? disposables.add(new ContextKeyService(new TestConfigurationService()))
				: instantiationService.createInstance(MockScopableContextKeyService)
		}, disposables);
		options?.configure?.(instantiationService);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		return parts;
	}

	function elementOf(part: IContentPart): HTMLElement {
		return part.element as HTMLElement;
	}

	function sameAs(actual: unknown, expected: IContentPart): boolean {
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
		const ITestScope = createDecorator<{ readonly _serviceBrand: undefined; readonly name: string }>('contentPartTestScope');
		const parts = await createServices({ configure: instantiationService => instantiationService.stub(ITestScope, { _serviceBrand: undefined, name: 'workbench' }) });
		const owned = parts.createEditorPart({ container: createContainer(), services: new ServiceCollection([ITestScope, { _serviceBrand: undefined, name: 'owner' }]) });
		const plain = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => { owned.close(); plain.close(); } });

		// Its groups, and their editors, are created by the part's scoped instantiation service
		const scopeOf = (part: IContentPart) => (part as unknown as EditorPart).scopedInstantiationService.invokeFunction(accessor => accessor.get(ITestScope).name);

		assert.deepStrictEqual({ owned: scopeOf(owned), plain: scopeOf(plain) }, { owned: 'owner', plain: 'workbench' });
	});

	test('a part belongs to the window its container is in', async () => {
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

	test('region role, label and editor classes are applied; its root is found as its own part', async () => {
		const parts = await createServices();
		const part = parts.createEditorPart({ container: createContainer(), label: 'Side' });
		disposables.add({ dispose: () => part.close() });

		assert.deepStrictEqual({
			role: elementOf(part).getAttribute('role'),
			label: elementOf(part).getAttribute('aria-label'),
			classes: elementOf(part).classList.contains('part') && elementOf(part).classList.contains('editor'),
			root: sameAs(parts.getPart(elementOf(part)), part)
		}, { role: 'region', label: 'Side', classes: true, root: true });
	});

	test('does not announce an auxiliary part and does not shift labels', async () => {
		const parts = await createServices();

		let auxiliaryEvents = 0;
		disposables.add(parts.onDidCreateAuxiliaryEditorPart(() => auxiliaryEvents++));

		const part = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => part.close() });

		assert.deepStrictEqual({ auxiliaryEvents, parts: parts.parts.length }, { auxiliaryEvents: 0, parts: 2 });
	});

	test('is excluded from the persisted state and from working sets', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		await part.activeGroup.openEditor(createInput('/content/a.txt'));
		const state = (parts as unknown as { createState(): { auxiliary: unknown[]; mru: number[] } }).createState();

		const workingSet = parts.saveWorkingSet('test');
		await parts.applyWorkingSet(workingSet);
		await parts.applyWorkingSet('empty');

		assert.deepStrictEqual({
			auxiliary: state.auxiliary.length,
			mru: state.mru,
			stillListed: parts.parts.includes(part as never),
			editors: part.activeGroup.editors.length
		}, { auxiliary: 0, mru: [0], stillListed: true, editors: 1 });

		parts.deleteWorkingSet(workingSet);
		part.close();
	});

	test('the first part of a window is its main part: the active part when focus is in no part', async () => {
		const parts = await createServices();
		const iframe = mainWindow.document.body.appendChild(mainWindow.document.createElement('iframe'));
		disposables.add({ dispose: () => iframe.remove() });
		const otherWindow = iframe.contentWindow!;
		ensureCodeWindow(otherWindow, 4343);
		disposables.add(registerWindow(otherWindow));
		const containerIn = (window: Window) => window.document.body.appendChild(window.document.createElement('div'));

		const first = parts.createEditorPart({ container: containerIn(otherWindow) });
		const second = parts.createEditorPart({ container: containerIn(otherWindow) });
		disposables.add({ dispose: () => { second.close(); first.close(); } });
		second.activeGroup.focus();

		assert.ok(sameAs(parts.getPart(containerIn(otherWindow)), first));
	});

	test('close merges editors into the main part and releases the part, after notifying its owner', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		const input = createInput('/content/merge.txt');
		input.setDirty();
		await part.activeGroup.openEditor(input);
		let listedWhenNotified = false;
		disposables.add(part.onWillClose(() => listedWhenNotified = parts.parts.includes(part as never)));

		const closed = part.close();

		assert.deepStrictEqual({
			closed,
			listedWhenNotified,
			merged: parts.mainPart.groups.some(group => group.contains(input)),
			listed: parts.parts.includes(part as never)
		}, { closed: true, listedWhenNotified: true, merged: true, listed: false });
	});

	test('its last group stays, also as closing all editors closes empty groups: its owner closes it', async () => {
		const parts = await createServices();

		const part = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => part.close() });
		await part.activeGroup.openEditor(createInput('/content/last.txt'));
		part.removeGroup(part.activeGroup);
		const afterRemove = { listed: parts.parts.includes(part as never), groups: part.groups.length };
		await part.activeGroup.closeAllEditors();

		assert.deepStrictEqual({ afterRemove, afterCloseAll: { listed: parts.parts.includes(part as never), groups: part.groups.length } }, {
			afterRemove: { listed: true, groups: 1 },
			afterCloseAll: { listed: true, groups: 1 },
		});
	});

	test('every group of a part created with state is announced, and the state is applied', async () => {
		const parts = await createServices();
		const first = parts.createEditorPart({ container: createContainer() });
		first.addGroup(first.activeGroup, GroupDirection.RIGHT);
		const state = first.createState();
		first.close();

		const added: number[] = [];
		disposables.add(parts.onDidAddGroup(group => added.push(group.id)));
		const second = parts.createEditorPart({ container: createContainer(), state });
		disposables.add({ dispose: () => second.close() });

		assert.deepStrictEqual({ groups: second.groups.length, added }, { groups: 2, added: second.getGroups(GroupsOrder.CREATION_TIME).map(group => group.id) });
	});

	test('part options override settings in that part only; otherwise it behaves like the main part', async () => {
		const parts = await createServices();
		const custom = parts.createEditorPart({ container: createContainer(), partOptions: { showTabs: 'single' } });
		const plain = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => { custom.close(); plain.close(); } });

		assert.deepStrictEqual({
			custom: custom.partOptions.showTabs,
			plain: plain.partOptions.showTabs,
			main: parts.mainPart.partOptions.showTabs,
			autoLockGroups: [...plain.partOptions.autoLockGroups ?? []].sort()
		}, {
			custom: 'single',
			plain: parts.mainPart.partOptions.showTabs,
			main: parts.mainPart.partOptions.showTabs,
			autoLockGroups: [...parts.mainPart.partOptions.autoLockGroups ?? []].sort()
		});
	});

	test('its groups have the context keys of groups of the main part, so the same menus show', async () => {
		let contextKeyService!: IContextKeyService;
		const parts = await createServices({ realContextKeys: true, configure: instantiationService => contextKeyService = instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService)) });
		const mainContainer = parts.testMainPart.getContainer()!;
		mainWindow.document.body.appendChild(mainContainer);
		disposables.add({ dispose: () => mainContainer.remove() });

		const part = parts.createEditorPart({ container: createContainer() });
		disposables.add({ dispose: () => part.close() });
		await part.activeGroup.openEditor(createInput('/content/keys.txt'));
		await parts.mainPart.activeGroup.openEditor(createInput('/main/keys.txt'));

		const keysOf = (part: IEditorPart) => Object.keys((contextKeyService.getContext(parts.getGroup(part.activeGroup.id)!.element) as Context).collectAllValues()).sort();

		assert.deepStrictEqual(keysOf(part), keysOf(parts.mainPart));
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
			const input = createInput('/content/pinned.txt');
			input.canMove = () => 'cannot move';
			await movable.activeGroup.openEditor(createInput('/content/free.txt'));
			await pinned.activeGroup.openEditor(input);

			disposables.add(bindEditorPartsToWindow(window, [movable, pinned], parts));

			const veto = () => {
				const vetoes: string[] = [];
				onBeforeUnload.fire({ veto: (reason: string | true) => { if (typeof reason === 'string') { vetoes.push(reason); } } } as never);
				return vetoes;
			};

			const vetoed = veto();
			input.canMove = () => true;
			const allowed = veto();
			onUnload.fire();

			assert.deepStrictEqual({
				vetoed,
				allowed,
				movableListed: parts.parts.includes(movable as never),
				pinnedListed: parts.parts.includes(pinned as never)
			}, { vetoed: ['cannot move'], allowed: [], movableListed: false, pinnedListed: false });
		});
	});
});
