/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { $ } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IMenuItem, IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IActiveNotebookEditorDelegate, ICellViewModel, INotebookEditorDelegate } from '../../browser/notebookBrowser.js';
import { CellTitleToolbarPart } from '../../browser/view/cellParts/cellToolbars.js';
import { setupInstantiationService } from './testNotebookEditor.js';

suite('Notebook cell toolbars', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let nextId = 0;

	teardown(() => sinon.restore());

	function createToolbar(titleItems: IMenuItem[] = [], deleteItems: IMenuItem[] = []) {
		const instantiationService = setupInstantiationService(disposables);
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<T>(): Promise<T> {
				throw new Error('Unexpected command execution');
			}
		};
		const executeCommand = sinon.stub(commandService, 'executeCommand').resolves();
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const menuService = disposables.add(new MenuService(commandService, new MockKeybindingService(), disposables.add(new InMemoryStorageService())));
		const createMenu = sinon.spy(menuService, 'createMenu');
		instantiationService.stub(IMenuService, menuService);

		let delegate: IContextMenuDelegate | undefined;
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(value: IContextMenuDelegate): void {
				delegate = value;
			}
		});

		const id = nextId++;
		const titleMenu = MenuId.for(`test.notebook.cellToolbar.${id}.title`);
		const deleteMenu = MenuId.for(`test.notebook.cellToolbar.${id}.delete`);
		for (const item of titleItems) {
			disposables.add(MenuRegistry.appendMenuItem(titleMenu, item));
		}
		for (const item of deleteItems) {
			disposables.add(MenuRegistry.appendMenuItem(deleteMenu, item));
		}

		const container = $('.cell-title-toolbar');
		const notebookContainer = $('.notebook-editor');
		notebookContainer.tabIndex = -1;
		notebookContainer.appendChild(container);
		document.body.appendChild(notebookContainer);
		disposables.add(toDisposable(() => notebookContainer.remove()));
		const classes = new Set<string>();
		const editor = new class extends mock<INotebookEditorDelegate>() {
			override readonly onDidScroll = Event.None;
			override readonly onDidChangeLayout = Event.None;
			override hasModel(): this is IActiveNotebookEditorDelegate { return true; }
			override getCellByHandle() { return undefined; }
			override focus(): void { notebookContainer.focus(); }
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
		const cell = new class extends mock<ICellViewModel>() { };
		toolbar.didRenderCell(cell);
		const contextKeyService = instantiationService.get(IContextKeyService);
		return {
			container, notebookContainer, classes, toolbar, titleMenu, deleteMenu, editor, cell, executeCommand,
			menus: {
				title: createMenu.withArgs(titleMenu, contextKeyService).firstCall.returnValue,
				delete: createMenu.withArgs(deleteMenu, contextKeyService).firstCall.returnValue
			},
			contextKeyService,
			getDelegate: () => {
				assert.ok(delegate);
				return delegate;
			}
		};
	}

	function action(id: string, group = 'inline'): IMenuItem {
		return { command: { id, title: id }, group };
	}

	function labels(container: HTMLElement): (string | null)[] {
		return Array.from(container.querySelectorAll('.action-label'), element => element.getAttribute('aria-label'));
	}

	function pressArrow(key: 'ArrowLeft' | 'ArrowRight'): void {
		for (const type of ['keydown', 'keyup']) {
			document.activeElement?.dispatchEvent(new KeyboardEvent(type, {
				key, keyCode: key === 'ArrowLeft' ? 37 : 39, bubbles: true
			}));
		}
	}

	for (const menu of ['title', 'delete'] as const) {
		test(`${menu} overflow menu escapes the notebook clipping container`, () => {
			const items = [action('test.notebook.cellToolbar.action', 'secondary')];
			const { container, classes, getDelegate } = createToolbar(menu === 'title' ? items : [], menu === 'delete' ? items : []);
			const button = container.querySelector<HTMLElement>('.codicon-toolbar-more');
			assert.ok(button);
			button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			const delegate = getDelegate();
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

	for (const overflow of [false, true]) {
		test(`arrow keys reach Delete Cell in both directions${overflow ? ' with overflow' : ''}`, () => {
			const { container } = createToolbar([action('Title'), ...(overflow ? [action('Secondary', 'secondary')] : [])], [action('Delete Cell')]);
			const buttons = container.querySelectorAll<HTMLElement>('.action-label');
			buttons[0].focus();
			buttons[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
			const focused = () => document.activeElement?.getAttribute('aria-label');
			const order = [focused()];
			for (let i = 0; i < buttons.length; i++) {
				pressArrow('ArrowRight');
				order.push(focused());
			}
			pressArrow('ArrowLeft');
			order.push(focused());
			pressArrow('ArrowLeft');
			order.push(focused());

			assert.deepStrictEqual({
				toolbars: container.querySelectorAll('[role="toolbar"]').length,
				labels: labels(container),
				order
			}, {
				toolbars: 1,
				labels: overflow ? ['Title', 'More Actions...', 'Delete Cell'] : ['Title', 'Delete Cell'],
				order: overflow
					? ['Title', 'More Actions...', 'Delete Cell', 'Title', 'Delete Cell', 'More Actions...']
					: ['Title', 'Delete Cell', 'Title', 'Delete Cell', 'Title']
			});
		});
	}

	test('Delete Cell receives the current cell context after rendering another cell', async () => {
		const { container, toolbar, editor, executeCommand } = createToolbar([action('Title')], [action('Delete Cell')]);
		const cell = new class extends mock<ICellViewModel>() { };
		toolbar.didRenderCell(cell);
		const button = container.querySelectorAll<HTMLElement>('.action-label')[1];
		button.click();
		await executeCommand.firstCall.returnValue;
		assert.deepStrictEqual(executeCommand.firstCall.args, ['Delete Cell', {
			ui: true, cell, notebookEditor: editor, source: 'cellToolbar', $mid: MarshalledId.NotebookCellActionContext
		}]);
	});

	for (const menu of ['title', 'delete'] as const) {
		test(`${menu} menu changes update the combined toolbar and hasActions`, () => runWithFakedTimers({}, async () => {
			const { container, toolbar, titleMenu, deleteMenu, classes } = createToolbar();
			const updated = Event.toPromise(toolbar.onDidUpdateActions);
			const registration = disposables.add(MenuRegistry.appendMenuItem(menu === 'title' ? titleMenu : deleteMenu, action('Added')));
			await updated;
			const afterAdding = { labels: labels(container), hasActions: toolbar.hasActions, active: classes.has('cell-has-toolbar-actions') };
			const removed = Event.toPromise(toolbar.onDidUpdateActions);
			registration.dispose();
			await removed;
			assert.deepStrictEqual({
				afterAdding,
				afterRemoving: { labels: labels(container), hasActions: toolbar.hasActions, active: classes.has('cell-has-toolbar-actions') }
			}, {
				afterAdding: { labels: ['Added'], hasActions: true, active: true },
				afterRemoving: { labels: [], hasActions: false, active: false }
			});
		}));

		test(`${menu} changes are deferred until the overflow menu closes`, () => runWithFakedTimers({}, async () => {
			const { container, toolbar, titleMenu, deleteMenu, menus, getDelegate } = createToolbar([action('Title'), action('Secondary', 'secondary')], [action('Delete Cell')]);
			container.querySelector<HTMLElement>('.codicon-toolbar-more')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			const changed = Event.toPromise(menus[menu].onDidChange);
			disposables.add(MenuRegistry.appendMenuItem(menu === 'title' ? titleMenu : deleteMenu, action('Added')));
			await changed;
			const whileOpen = labels(container);
			const updated = Event.toPromise(toolbar.onDidUpdateActions);
			getDelegate().onHide?.(true);
			await updated;
			assert.deepStrictEqual({ whileOpen, afterClosing: labels(container) }, {
				whileOpen: ['Title', 'More Actions...', 'Delete Cell'],
				afterClosing: menu === 'title'
					? ['Added', 'Title', 'More Actions...', 'Delete Cell']
					: ['Title', 'More Actions...', 'Added', 'Delete Cell']
			});
		}));
	}

	test('context changes update Delete Cell visibility and restore notebook focus', () => runWithFakedTimers({}, async () => {
		const { container, notebookContainer, toolbar, editor, contextKeyService } = createToolbar([action('Title')], [
			{ ...action('Delete Cell'), when: ContextKeyExpr.has('test.cellToolbar.canDelete') }
		]);
		const focus = sinon.spy(editor, 'focus');
		container.querySelector<HTMLElement>('.action-label')!.focus();
		const canDelete = contextKeyService.createKey<boolean>('test.cellToolbar.canDelete', false);
		const updated = Event.toPromise(toolbar.onDidUpdateActions);
		canDelete.set(true);
		await updated;
		const visible = labels(container);
		const focusedAfterShowing = document.activeElement === notebookContainer;
		const hidden = Event.toPromise(toolbar.onDidUpdateActions);
		canDelete.set(false);
		await hidden;
		assert.deepStrictEqual({
			visible, hidden: labels(container), hasActions: toolbar.hasActions, focusCalls: focus.callCount,
			focusedAfterShowing, focusedAfterHiding: document.activeElement === notebookContainer
		}, {
			visible: ['Title', 'Delete Cell'], hidden: ['Title'], hasActions: true, focusCalls: 1,
			focusedAfterShowing: true, focusedAfterHiding: true
		});
	}));

	test('secondary actions from both menus share one overflow menu', () => {
		const { container, getDelegate } = createToolbar([action('Title secondary', 'secondary')], [action('Delete secondary', 'secondary')]);
		container.querySelector<HTMLElement>('.codicon-toolbar-more')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		const delegate = getDelegate();
		const actions = delegate.getActions().map(action => action.id);
		delegate.onHide?.(true);
		assert.deepStrictEqual({ labels: labels(container), actions }, {
			labels: ['More Actions...'], actions: ['Title secondary', 'Delete secondary']
		});
	});

});
