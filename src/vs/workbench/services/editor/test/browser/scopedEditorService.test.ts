/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { MockScopableContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../../common/editor/sideBySideEditorInput.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, TestEditorParts, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IAuxiliaryWindowService } from '../../../auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IStatusbarService } from '../../../statusbar/browser/statusbar.js';
import { EditorService } from '../../browser/editorService.js';
import { IContentPart, IEditorGroupsService, IEditorPart } from '../../common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../common/editorService.js';

suite('Scoped Editor Service', () => {

	const TEST_EDITOR_ID = 'MyFileEditorForScopedEditorService';
	const TEST_EDITOR_INPUT_ID = 'testEditorInputForScopedEditorService';

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

	async function createServices() {
		const instantiationService = workbenchInstantiationService({ contextKeyService: instantiationService => instantiationService.createInstance(MockScopableContextKeyService) }, disposables);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		instantiationService.stub(IStatusbarService, new class extends mock<IStatusbarService>() { override createScoped() { return this; } }());
		const editorService = disposables.add(instantiationService.createInstance(EditorService, undefined));
		instantiationService.stub(IEditorService, editorService);

		const createPart = () => {
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			const part = parts.createEditorPart({ container });
			part.layout(400, 300, 0, 0);
			disposables.add({ dispose: () => { part.close(); container.remove(); } });

			return part;
		};

		return { parts, editorService, a: createPart(), b: createPart() };
	}

	function focusIn(part: IContentPart): void {
		const focusable = (part.element as HTMLElement).appendChild(mainWindow.document.createElement('div'));
		focusable.tabIndex = 0;
		focusable.focus();
	}

	function scopedEditorServiceOf(parts: TestEditorParts, part: IEditorPart): IEditorService {
		return parts.getScopedInstantiationService(part).invokeFunction(accessor => accessor.get(IEditorService));
	}

	function nameOfPartWith(parts: TestEditorParts, named: Record<string, IEditorPart>, editor: EditorInput): string {
		for (const [name, part] of Object.entries(named)) {
			if (part.groups.some(group => group.contains(editor))) {
				return name;
			}
		}

		return parts.mainPart.groups.some(group => group.contains(editor)) ? 'main' : 'none';
	}

	test('opens without a specific group land in the part of the scoped service, also while focus is in another part', async () => {
		const { parts, a, b } = await createServices();
		const where = (editor: EditorInput) => nameOfPartWith(parts, { a, b }, editor);
		focusIn(a);
		const serviceOfB = scopedEditorServiceOf(parts, b);

		const unspecified = createInput('/unspecified.txt');
		await serviceOfB.openEditor(unspecified, { pinned: true });
		focusIn(a);
		const active = createInput('/active.txt');
		await serviceOfB.openEditor(active, { pinned: true }, ACTIVE_GROUP);
		focusIn(a);
		const side = createInput('/side.txt');
		await serviceOfB.openEditor(side, { pinned: true }, SIDE_GROUP);
		focusIn(a);
		const several = [createInput('/several1.txt'), createInput('/several2.txt')];
		await serviceOfB.openEditors(several.map(editor => ({ editor, options: { pinned: true } })));
		const explicit = createInput('/explicit.txt');
		await serviceOfB.openEditor(explicit, { pinned: true }, a.activeGroup);

		assert.deepStrictEqual({
			unspecified: where(unspecified),
			active: where(active),
			side: where(side),
			several: several.map(where),
			explicit: where(explicit),
			groupsOfA: a.groups.length,
			groupsOfB: b.groups.length
		}, {
			unspecified: 'b',
			active: 'b',
			side: 'b',
			several: ['b', 'b'],
			explicit: 'a',
			groupsOfA: 1,
			groupsOfB: 2
		});
	});

	test('while focus is in the part of the scoped service, opens resolve as before', async () => {
		const { parts, editorService, b } = await createServices();
		focusIn(b);
		const serviceOfB = scopedEditorServiceOf(parts, b);

		const viaScoped = createInput('/scoped.txt');
		await serviceOfB.openEditor(viaScoped, { pinned: true });
		focusIn(b);
		const viaGlobal = createInput('/global.txt');
		await editorService.openEditor(viaGlobal, { pinned: true });

		assert.deepStrictEqual({ scoped: nameOfPartWith(parts, { b }, viaScoped), global: nameOfPartWith(parts, { b }, viaGlobal) }, { scoped: 'b', global: 'b' });
	});

	test('the global editor service still opens in the part with focus', async () => {
		const { parts, editorService, a, b } = await createServices();
		focusIn(a);

		const input = createInput('/global-a.txt');
		await editorService.openEditor(input, { pinned: true });

		assert.strictEqual(nameOfPartWith(parts, { a, b }, input), 'a');
	});

	test('untyped editors, which are resolved by the editor resolver, also land in the part of the scoped service', async () => {
		const { parts, a, b } = await createServices();
		focusIn(a);
		const serviceOfB = scopedEditorServiceOf(parts, b);

		const pane = await serviceOfB.openEditor({ resource: URI.file('/untyped.txt'), options: { pinned: true } });

		assert.deepStrictEqual({ opened: !!pane, inB: !!pane && b.groups.some(group => group.id === pane.group.id) }, { opened: true, inB: true });
	});

	test('the main part\'s scoped service with a modal editor open still closes the modal and opens in the main part', async () => {
		const { parts } = await createServices();
		const modalPart = await parts.createModalEditorPart();
		await modalPart.activeGroup.openEditor(createInput('/modal.txt'));
		modalPart.activeGroup.focus();

		const input = createInput('/main-scoped.txt');
		await scopedEditorServiceOf(parts, parts.mainPart).openEditor(input, { pinned: true });

		assert.deepStrictEqual({ main: parts.mainPart.groups.some(group => group.contains(input)), modalOpen: !!parts.activeModalEditorPart }, { main: true, modalOpen: false });
	});

	test('the global service, and a scoped one while its part has focus, put a typed editor into its group synchronously, as before', async () => {
		const { parts, editorService, b } = await createServices();
		focusIn(b);

		const viaGlobal = createInput('/sync-global.txt');
		const globalPromise = editorService.openEditor(viaGlobal, { pinned: true });
		const globalSync = b.groups.some(group => group.contains(viaGlobal));

		const viaScoped = createInput('/sync-scoped.txt');
		const scopedPromise = scopedEditorServiceOf(parts, b).openEditor(viaScoped, { pinned: true });
		const scopedSync = b.groups.some(group => group.contains(viaScoped));

		await Promise.all([globalPromise, scopedPromise]);

		assert.deepStrictEqual({ globalSync, scopedSync }, { globalSync: true, scopedSync: true });
	});

	test('several editors opened to the side through a scoped service open beside its part\'s group, in one new group of that part', async () => {
		const { parts, a, b } = await createServices();
		focusIn(a);

		const editors = [createInput('/side1.txt'), createInput('/side2.txt')];
		await scopedEditorServiceOf(parts, b).openEditors(editors.map(editor => ({ editor, options: { pinned: true } })), SIDE_GROUP);

		const groupsWith = editors.map(editor => b.groups.findIndex(group => group.contains(editor)));
		assert.deepStrictEqual({ groupsOfA: a.groups.length, groupsOfB: b.groups.length, groupsWith }, { groupsOfA: 1, groupsOfB: 2, groupsWith: [1, 1] });
	});
});
