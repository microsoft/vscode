/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { ContextMenuService } from '../../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextViewService, IContextViewDelegate } from '../../../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { isMacintosh } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MenuId, MenuRegistry, isIMenuItem, IMenuService, MenuItemAction, IMenuActionOptions } from '../../../../../../platform/actions/common/actions.js';
import { BrowserViewCommandId } from '../../../../../../platform/browserView/common/browserView.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IEditorOptions } from '../../../../../../platform/editor/common/editor.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../../../common/browserEditorInput.js';
import { IBrowserViewWorkbenchService } from '../../../common/browserView.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import '../../../electron-browser/features/browserTabManagementFeatures.js';

suite('Browser Duplicate Tab', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const { url, context } of ['https://example.com/path?query=value#section', undefined].flatMap(url =>
		[undefined, { groupId: 7 }, { groupId: 7, editorIndex: 2 }].map(context => ({ url, context }))
	)) {
		test(`duplicates ${context?.editorIndex !== undefined ? 'the clicked inactive tab' : context ? 'the specified group active tab' : 'the active tab'} with URL ${url}`, async () => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const data: IBrowserEditorInputData = {
				id: 'source', url, title: 'Source', favicon: 'data:image/png;base64,AA==',
				associatedResource: URI.file('/workspace/index.html'),
			};
			let created: IBrowserEditorInputData | undefined;
			instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
				override getOrCreateLazy(options: IBrowserEditorInputData): BrowserEditorInput {
					created = options;
					return duplicate;
				}
			});
			const source = disposables.add(instantiationService.createInstance(BrowserEditorInput, data, async () => { throw new Error('Should not resolve source'); }));
			const duplicate = disposables.add(instantiationService.createInstance(BrowserEditorInput, { id: 'duplicate' }, async () => { throw new Error('Should not resolve duplicate'); }));
			const group = new class extends mock<IEditorGroup>() {
				override readonly id = 7;
				override get activeEditor() { return context?.editorIndex !== undefined ? null : source; }
				override getEditorByIndex(index: number) { return index === 2 ? source : undefined; }
				override getIndexOfEditor(editor: EditorInput) { return editor === source ? 2 : -1; }
			};
			instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override get activeGroup() {
					assert.strictEqual(context, undefined, 'Explicit context must not use the active group');
					return group;
				}
				override getGroup(id: number) { return id === group.id ? group : undefined; }
			});
			let opened: { editor: EditorInput; options: IEditorOptions | undefined; group: number | undefined } | undefined;
			instantiationService.stub(IEditorService, 'openEditor', async (editor: EditorInput, options?: IEditorOptions, group?: number) => {
				opened = { editor, options, group };
				return undefined;
			});
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(BrowserViewCommandId.DuplicateTab)!.handler(accessor, source.resource, context));
			assert.ok(created?.id && created.id !== source.id);
			assert.deepStrictEqual({ ...created, id: source.id }, data);
			assert.deepStrictEqual(opened, { editor: duplicate, options: { pinned: true, index: 3 }, group: 7 });
		});
	}

	test('ignores stale tab context and non-browser tabs', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const nonBrowser = disposables.add(new class extends EditorInput { override get typeId() { return 'test'; } override get resource() { return undefined; } }());
		const group = new class extends mock<IEditorGroup>() {
			override getEditorByIndex(index: number) { return index === 0 ? nonBrowser : undefined; }
		};
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override getGroup(id: number) { return id === 7 ? group : undefined; }
		});
		instantiationService.stub(IBrowserViewWorkbenchService, new class extends mock<IBrowserViewWorkbenchService>() {
			override getOrCreateLazy(): BrowserEditorInput { throw new Error('Should not create a browser'); }
		});
		for (const context of [{ groupId: 7, editorIndex: 0 }, { groupId: 7, editorIndex: 99 }, { groupId: 99, editorIndex: 0 }]) {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(BrowserViewCommandId.DuplicateTab)!.handler(accessor, undefined, context));
		}
	});

	test('declares the visible D hint and explicit menu mnemonic', () => {
		const item = MenuRegistry.getMenuItems(MenuId.EditorTitleContext).find(item => isIMenuItem(item) && item.command.id === BrowserViewCommandId.DuplicateTab);
		assert.ok(item && isIMenuItem(item));
		assert.deepStrictEqual(item.command.title, {
			value: 'Duplicate tab (D)', original: 'Duplicate tab (D)', mnemonicTitle: '&&Duplicate tab (D)',
		});
	});

	(isMacintosh ? test.skip : test)('D runs Duplicate Tab from a custom context menu with the clicked tab context', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const host = document.createElement('div');
		document.body.appendChild(host);
		disposables.add(toDisposable(() => host.remove()));
		const executed = new DeferredPromise<{ id: string; args: unknown[] }>();
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				await executed.complete({ id, args });
				return undefined;
			}
		});
		instantiationService.stub(IMenuService, 'getMenuActions', (_menuId: MenuId, _contextKeyService: IContextKeyService, options?: IMenuActionOptions) => {
			const item = MenuRegistry.getMenuItems(MenuId.EditorTitleContext).find(item => isIMenuItem(item) && item.command.id === BrowserViewCommandId.DuplicateTab);
			assert.ok(item && isIMenuItem(item));
			return [['1_open', [instantiationService.createInstance(MenuItemAction, item.command, undefined, options, undefined, undefined)]]];
		});
		instantiationService.stub(IContextViewService, 'showContextView', (delegate: IContextViewDelegate) => {
			const rendered = delegate.render(host);
			if (rendered) {
				disposables.add(rendered);
			}
			disposables.add(toDisposable(() => delegate.onHide?.()));
			delegate.focus?.();
			return { close: () => delegate.onHide?.() };
		});
		const service = disposables.add(instantiationService.createInstance(ContextMenuService));
		const context = { groupId: 7, editorIndex: 0 };
		const resource = URI.parse('vscode-browser://source');
		service.showContextMenu({
			menuId: MenuId.EditorTitleContext,
			menuActionOptions: { arg: resource, shouldForwardArgs: true },
			getAnchor: () => host,
			getActionsContext: () => context,
		});
		const item = host.querySelector<HTMLElement>('.action-menu-item')!;
		assert.ok(item);
		item.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', keyCode: 68, bubbles: true, cancelable: true }));
		assert.deepStrictEqual(await executed.p, { id: BrowserViewCommandId.DuplicateTab, args: [resource, context] });
	});

	test('menu visibility follows the clicked editor including file-backed browser tabs', () => {
		const item = MenuRegistry.getMenuItems(MenuId.EditorTitleContext).find(item => isIMenuItem(item) && item.command.id === BrowserViewCommandId.DuplicateTab);
		assert.ok(item?.when);
		const context = new Context(1, null);
		assert.deepStrictEqual(['workbench.editors.textResourceEditor', BrowserEditorInput.EDITOR_ID].map(editorId => {
			context.setValue('resourceScheme', 'file');
			context.setValue('activeEditor', editorId === BrowserEditorInput.EDITOR_ID ? 'workbench.editors.textResourceEditor' : BrowserEditorInput.EDITOR_ID);
			context.setValue('editorTitleContextEditorId', editorId);
			return item.when!.evaluate(context);
		}), [false, true]);
	});
});
