/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IActiveNotebookEditorDelegate, ICellViewModel, INotebookEditorDelegate } from '../../browser/notebookBrowser.js';
import { CellTitleToolbarPart } from '../../browser/view/cellParts/cellToolbars.js';
import { setupInstantiationService } from './testNotebookEditor.js';

suite('Notebook cell toolbars', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const menu of ['title', 'delete'] as const) {
		test(`${menu} overflow menu escapes the notebook clipping container`, () => {
			const instantiationService = setupInstantiationService(disposables);
			const commandService = new class extends mock<ICommandService>() { };
			instantiationService.stub(ICommandService, commandService);
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(IMenuService, disposables.add(new MenuService(commandService, new MockKeybindingService(), disposables.add(new InMemoryStorageService()))));

			let delegate: IContextMenuDelegate | undefined;
			instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
				override showContextMenu(value: IContextMenuDelegate): void {
					delegate = value;
				}
			});

			const titleMenu = MenuId.for(`test.notebook.cellToolbar.${menu}.title`);
			const deleteMenu = MenuId.for(`test.notebook.cellToolbar.${menu}.delete`);
			disposables.add(MenuRegistry.appendMenuItem(menu === 'title' ? titleMenu : deleteMenu, {
				command: { id: 'test.notebook.cellToolbar.action', title: 'Cell Action' },
				group: 'secondary'
			}));

			const container = $('.cell-title-toolbar');
			document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			const classes = new Set<string>();
			const editor = new class extends mock<INotebookEditorDelegate>() {
				override readonly onDidScroll = Event.None;
				override readonly onDidChangeLayout = Event.None;
				override hasModel(): this is IActiveNotebookEditorDelegate { return false; }
				override getCellByHandle() { return undefined; }
			};
			const toolbar = disposables.add(instantiationService.createInstance(CellTitleToolbarPart, container, {
				toggle: (className, force) => {
					if (force) {
						classes.add(className);
					} else {
						classes.delete(className);
					}
				}
			}, titleMenu, deleteMenu, editor));
			toolbar.didRenderCell(new class extends mock<ICellViewModel>() { });
			const button = container.querySelector<HTMLElement>('.codicon-toolbar-more');
			assert.ok(button);
			button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			assert.ok(delegate);
			const activeWhileOpen = classes.has('cell-toolbar-dropdown-active');
			delegate.onHide?.(true);

			assert.deepStrictEqual({
				localMenuContainer: delegate.domForShadowRoot,
				actions: delegate.getActions().map(action => action.id),
				activeWhileOpen,
				activeAfterClosing: classes.has('cell-toolbar-dropdown-active')
			}, {
				localMenuContainer: undefined,
				actions: ['test.notebook.cellToolbar.action'],
				activeWhileOpen: true,
				activeAfterClosing: false
			});
		});
	}
});
