/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getActiveElement } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Emitter } from '../../../base/common/event.js';
import { decodeKeybinding, ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { OS } from '../../../base/common/platform.js';
import { mock } from '../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IMenu, IMenuChangeEvent, IMenuService, MenuId, MenuItemAction, SubmenuItemAction } from '../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MockKeybindingService } from '../../../platform/keybinding/test/common/mockKeybindingService.js';
import { INotificationService, NotificationMessage } from '../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../platform/notification/test/common/testNotificationService.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../platform/telemetry/common/telemetryUtils.js';
import { TestMenuService, workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { DesktopMainEditorPart } from '../../browser/parts/desktopEditorPart.js';
import { IEmptyEditorGroup } from '../../browser/parts/emptyEditorGroupAddTab.js';
import { Menus } from '../../browser/menus.js';
import '../../browser/parts/media/editorPart.css';
import { TestContextViewService } from './testContextViewService.js';

interface IEmptyGroupAddTabHarness {
	readonly _instantiationService: IInstantiationService;
	_createEmptyGroupAddTabControl(group: IEmptyEditorGroup): IDisposable;
}

class TestKeybindingService extends MockKeybindingService {

	readonly keybindings = new Map<string, number>();
	readonly onDidUpdate = new Emitter<void>();

	override get onDidUpdateKeybindings() {
		return this.onDidUpdate.event;
	}

	override lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
		const keybinding = this.keybindings.get(commandId);
		const decoded = keybinding === undefined ? null : decodeKeybinding(keybinding, OS);
		return decoded ? USLayoutResolvedKeybinding.resolveKeybinding(decoded, OS)[0] : undefined;
	}
}

suite('Sessions - Desktop editor part empty group', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createEmptyGroup(disposables: Pick<DisposableStore, 'add'>) {
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-spacing-size80', '8px');
		root.style.setProperty('--vscode-codiconFontSize', '16px');
		const part = append(root, $('.part.editor'));
		const element = append(append(part, $('.content')), $('.editor-group-container.empty.active'));
		element.style.height = '400px';
		element.style.width = '400px';
		const logo = append(append(element, $('.editor-group-watermark-wrapper')), $('.editor-group-watermark'));

		const services = workbenchInstantiationService(undefined, disposables);
		const menuChanged = disposables.add(new Emitter<IMenuChangeEvent>());
		const requestedMenus: MenuId[] = [];
		const ran: string[] = [];
		const state = { hasActions: true, hasSubmenu: true, browserEnabled: true, failingCommand: undefined as string | undefined };
		let addTabMenu: IMenu | undefined;
		services.stub(IMenuService, new class extends TestMenuService {
			override createMenu(id: MenuId): IMenu {
				requestedMenus.push(id);
				const menu: IMenu = {
					onDidChange: menuChanged.event,
					dispose: () => { },
					getActions: options => {
						if (!state.hasActions) {
							return [];
						}
						const browser = services.createInstance(MenuItemAction, { id: 'test.browser', title: 'Browser', icon: Codicon.globe, precondition: state.browserEnabled ? undefined : ContextKeyExpr.false() }, undefined, options, undefined, undefined);
						const files = services.createInstance(MenuItemAction, { id: 'test.files', title: 'Files', icon: Codicon.newFile }, undefined, options, undefined, undefined);
						const canvas = new SubmenuItemAction({ submenu: MenuId.for('test.canvas'), title: 'Canvas', icon: Codicon.preview }, undefined, [
							{
								id: 'test.canvas.kusto', label: 'Kusto', tooltip: '', class: undefined, enabled: true, run: () => {
									ran.push('test.canvas.kusto');
									if (state.failingCommand === 'test.canvas.kusto') {
										throw new Error('test.canvas.kusto failed');
									}
								}
							},
						]);
						return [['navigation', state.hasSubmenu ? [browser, files, canvas] : [browser, files]]];
					},
				};
				addTabMenu = menu;
				return menu;
			}
		});
		services.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<R>(id: string): Promise<R | undefined> {
				ran.push(id);
				if (id === state.failingCommand) {
					throw new Error(`${id} failed`);
				}
				return undefined;
			}
		});
		const keybindingService = new TestKeybindingService();
		disposables.add(keybindingService.onDidUpdate);
		services.stub(IKeybindingService, keybindingService);
		const notifiedErrors: NotificationMessage[] = [];
		services.stub(INotificationService, new class extends TestNotificationService {
			override error(message: NotificationMessage) {
				notifiedErrors.push(message);
				return super.error(message);
			}
		});
		const telemetry: { readonly id: unknown; readonly from: unknown }[] = [];
		services.stub(ITelemetryService, new class extends NullTelemetryServiceShape {
			override publicLog2(eventName?: string, data?: unknown): void {
				if (eventName === 'workbenchActionExecuted' && typeof data === 'object' && data) {
					const { id, from } = data as { id?: unknown; from?: unknown };
					telemetry.push({ id, from });
				}
			}
		});
		const contextViewService = new TestContextViewService();
		services.stub(IContextViewService, contextViewService);

		const modelChanged = disposables.add(new Emitter<void>());
		let isEmpty = true;
		const setEmpty = (empty: boolean) => {
			isEmpty = empty;
			element.classList.toggle('empty', empty);
			modelChanged.fire();
		};
		const group: IEmptyEditorGroup = {
			element,
			scopedContextKeyService: services.get(IContextKeyService),
			get isEmpty() { return isEmpty; },
			onDidModelChange: modelChanged.event,
		};

		const editorPart = Object.assign(Object.create(DesktopMainEditorPart.prototype), { _instantiationService: services }) as IEmptyGroupAddTabHarness;
		const createControl = Reflect.get(DesktopMainEditorPart.prototype, '_createEmptyGroupAddTabControl') as IEmptyGroupAddTabHarness['_createEmptyGroupAddTabControl'];
		const control = createControl.call(editorPart, group);

		const addTab = () => element.querySelector<HTMLElement>(':scope > .sessions-empty-group-add-tab');
		const list = () => element.querySelector<HTMLElement>(':scope > .sessions-empty-group-add-tab-watermark');
		const entries = () => [...(list()?.querySelectorAll<HTMLElement>('.sessions-add-tab-watermark-entry') ?? [])];
		const entry = (label: string) => entries().find(row => row.querySelector('.sessions-add-tab-watermark-label')?.textContent === label)!;
		const fireMenuChanged = () => menuChanged.fire({ menu: addTabMenu!, isStructuralChange: true, isEnablementChange: false, isToggleChange: false });

		return { root, part, element, logo, control, contextViewService, keybindingService, requestedMenus, ran, notifiedErrors, telemetry, state, setEmpty, fireMenuChanged, addTab, list, entries, entry };
	}

	const isShown = (target: Element | null | undefined) => !!target && mainWindow.getComputedStyle(target).display !== 'none';

	test('renders the Add Tab menu as a top `+` and a centered watermark list only while the group is empty', () => {
		const { element, logo, control, contextViewService, requestedMenus, ran, state, setEmpty, fireMenuChanged, addTab, list, entries } = createEmptyGroup(store);
		const snapshot = () => {
			const groupBounds = element.getBoundingClientRect();
			const listElement = list();
			const plus = addTab();
			const listBounds = listElement?.querySelector('.sessions-add-tab-watermark-list')?.getBoundingClientRect();
			return {
				plus: isShown(plus) && isShown(plus!.querySelector('.tabs-bar-add-tab')) ? { top: plus!.getBoundingClientRect().top - groupBounds.top, left: plus!.getBoundingClientRect().left - groupBounds.left } : undefined,
				list: isShown(listElement) && listBounds ? {
					centered: Math.abs((listBounds.top + listBounds.height / 2) - (groupBounds.top + groupBounds.height / 2)) < 1
						&& Math.abs((listBounds.left + listBounds.width / 2) - (groupBounds.left + groupBounds.width / 2)) < 1,
					// What ends each row: rows without a keybinding end with the label or, for submenus, the chevron.
					trailing: entries().map(row => row.lastElementChild?.className),
					entries: entries().map(row => ({
						label: row.getAttribute('aria-label'),
						icon: row.querySelector('.sessions-add-tab-watermark-icon')?.classList.contains('codicon') ?? false,
						popup: row.getAttribute('aria-haspopup'),
						submenuIndicator: row.querySelector('.sessions-add-tab-watermark-submenu-indicator')?.classList.contains('codicon-chevron-right') ?? false,
					})),
				} : undefined,
				logoShown: isShown(logo),
			};
		};

		const emptyWithActions = snapshot();

		const [browserEntry, , canvasEntry] = entries();
		browserEntry.click();
		canvasEntry.click();
		const submenuOnClick = contextViewService.openSubmenu;
		contextViewService.hideContextView();

		let groupDblClicks = 0;
		const onGroupDblClick = () => groupDblClicks++;
		element.addEventListener('dblclick', onGroupDblClick);
		addTab()!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		browserEntry.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		const listDblClicks = groupDblClicks;
		// Around the list, the empty group still receives double-clicks (e.g. to open an untitled editor).
		element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		element.removeEventListener('dblclick', onGroupDblClick);

		state.hasSubmenu = false;
		fireMenuChanged();
		const emptyWithoutSubmenu = snapshot().list;
		state.hasSubmenu = true;

		state.hasActions = false;
		fireMenuChanged();
		const emptyWithoutActions = snapshot();
		state.hasActions = true;
		fireMenuChanged();

		setEmpty(false);
		const notEmpty = { ...snapshot(), rendered: !!addTab() || !!list() };
		setEmpty(true);
		const emptyAgain = { rendered: !!addTab() && !!list(), entries: entries().length };

		control.dispose();

		assert.deepStrictEqual({
			requestedMenus,
			ran,
			submenuOnClick,
			listDblClicks,
			groupDblClicks,
			emptyWithActions,
			emptyWithoutSubmenu,
			emptyWithoutActions,
			notEmpty,
			emptyAgain,
			removedOnDispose: !addTab() && !list() && !element.classList.contains('sessions-has-add-tab-watermark'),
		}, {
			// `+` and list menus for the first render and again when the group becomes empty again.
			requestedMenus: [Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEditorTabsBarAddTab],
			ran: ['test.browser'],
			submenuOnClick: { items: ['Kusto'], focused: true },
			listDblClicks: 0,
			groupDblClicks: 1,
			emptyWithActions: {
				plus: { top: 0, left: 0 },
				list: {
					centered: true,
					trailing: ['sessions-add-tab-watermark-label', 'sessions-add-tab-watermark-label', 'sessions-add-tab-watermark-submenu-indicator codicon codicon-chevron-right'],
					entries: [
						{ label: 'Browser', icon: true, popup: null, submenuIndicator: false },
						{ label: 'Files', icon: true, popup: null, submenuIndicator: false },
						{ label: 'Canvas', icon: true, popup: 'menu', submenuIndicator: true },
					],
				},
				logoShown: false,
			},
			emptyWithoutSubmenu: {
				centered: true,
				trailing: ['sessions-add-tab-watermark-label', 'sessions-add-tab-watermark-label'],
				entries: [
					{ label: 'Browser', icon: true, popup: null, submenuIndicator: false },
					{ label: 'Files', icon: true, popup: null, submenuIndicator: false },
				],
			},
			emptyWithoutActions: { plus: undefined, list: undefined, logoShown: true },
			notEmpty: { plus: undefined, list: undefined, logoShown: true, rendered: false },
			emptyAgain: { rendered: true, entries: 3 },
			removedOnDispose: true,
		});
	});

	test('centers the list beside a docked detail panel', () => {
		const { part, element, control, list } = createEmptyGroup(store);
		store.add(control);
		const center = () => {
			const bounds = list()!.querySelector('.sessions-add-tab-watermark-list')!.getBoundingClientRect();
			return Math.round(bounds.left + bounds.width / 2 - element.getBoundingClientRect().left);
		};

		const withoutPanel = center();
		const setContentRightInset = Reflect.get(DesktopMainEditorPart.prototype, 'setContentRightInset') as (this: object, inset: number) => void;
		setContentRightInset.call(Object.assign(Object.create(DesktopMainEditorPart.prototype), { element: part }), 200.4);

		assert.deepStrictEqual({ withoutPanel, inset: part.style.getPropertyValue('--sessions-editor-content-right-inset'), withPanel: center() }, {
			withoutPanel: 200,
			inset: '200px',
			withPanel: 100,
		});
	});

	test('keeps rows across unrelated menu refreshes and re-renders on real changes and keybinding updates', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { control, contextViewService, keybindingService, state, fireMenuChanged, entries, entry } = createEmptyGroup(disposables);
		disposables.add(control);

		const firstBrowserRow = entry('Browser');
		entry('Canvas').click();
		fireMenuChanged();
		const afterUnrelatedRefresh = { sameRows: entry('Browser') === firstBrowserRow, submenuStillOpen: !!contextViewService.openSubmenu };

		state.browserEnabled = false;
		fireMenuChanged();
		const afterEnablementChange = {
			rebuilt: entry('Browser') !== firstBrowserRow,
			submenuStillOpen: !!contextViewService.openSubmenu,
			browserDisabled: entry('Browser').getAttribute('aria-disabled'),
			filesDisabled: entry('Files').getAttribute('aria-disabled'),
		};

		const labelBefore = entry('Files').getAttribute('aria-label');
		keybindingService.keybindings.set('test.files', KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE);
		keybindingService.onDidUpdate.fire();
		const afterKeybindingUpdate = { labelChanged: entry('Files').getAttribute('aria-label') !== labelBefore, hasKeybinding: !!entry('Files').querySelector('.monaco-keybinding-key') };

		assert.deepStrictEqual({ rows: entries().length, afterUnrelatedRefresh, afterEnablementChange, afterKeybindingUpdate }, {
			rows: 3,
			afterUnrelatedRefresh: { sameRows: true, submenuStillOpen: true },
			afterEnablementChange: { rebuilt: true, submenuStillOpen: false, browserDisabled: 'true', filesDisabled: 'false' },
			afterKeybindingUpdate: { labelChanged: true, hasKeybinding: true },
		});
	}));

	test('opens a submenu entry beside its row on hover and from the keyboard', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { control, contextViewService, ran, entry } = createEmptyGroup(disposables);
		disposables.add(control);
		const canvasEntry = entry('Canvas');
		const key = (target: Element, keyCode: number, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
		const state = () => ({ submenu: contextViewService.openSubmenu, expanded: canvasEntry.getAttribute('aria-expanded'), rowFocused: getActiveElement() === canvasEntry });

		canvasEntry.dispatchEvent(new MouseEvent('mouseenter'));
		const beforeHoverDelay = state();
		await timeout(300);
		const afterHoverDelay = state();

		// Moving from the row into the submenu keeps it open.
		canvasEntry.dispatchEvent(new MouseEvent('mouseleave'));
		contextViewService.container!.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(500);
		const whilePointerInSubmenu = state();

		contextViewService.container!.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(500);
		const afterPointerLeaves = state();

		canvasEntry.focus();
		key(canvasEntry, 13, 'Enter');
		const afterEnter = state();
		key(getActiveElement()!, 27, 'Escape');
		const afterEscape = state();

		key(canvasEntry, 39, 'ArrowRight');
		const afterRightArrow = state();
		key(getActiveElement()!, 37, 'ArrowLeft');
		const afterLeftArrow = state();

		key(canvasEntry, 13, 'Enter');
		key(getActiveElement()!, 13, 'Enter');
		await timeout(0);
		const afterRunningItem = { ...state(), ran: [...ran] };

		assert.deepStrictEqual({ beforeHoverDelay, afterHoverDelay, whilePointerInSubmenu, afterPointerLeaves, afterEnter, afterEscape, afterRightArrow, afterLeftArrow, afterRunningItem }, {
			beforeHoverDelay: { submenu: undefined, expanded: 'false', rowFocused: false },
			afterHoverDelay: { submenu: { items: ['Kusto'], focused: false }, expanded: 'true', rowFocused: false },
			whilePointerInSubmenu: { submenu: { items: ['Kusto'], focused: false }, expanded: 'true', rowFocused: false },
			afterPointerLeaves: { submenu: undefined, expanded: 'false', rowFocused: false },
			afterEnter: { submenu: { items: ['Kusto'], focused: true }, expanded: 'true', rowFocused: false },
			afterEscape: { submenu: undefined, expanded: 'false', rowFocused: true },
			afterRightArrow: { submenu: { items: ['Kusto'], focused: true }, expanded: 'true', rowFocused: false },
			afterLeftArrow: { submenu: undefined, expanded: 'false', rowFocused: true },
			// Like a context menu, focus returns to where it was before the submenu opened.
			afterRunningItem: { submenu: undefined, expanded: 'false', rowFocused: true, ran: ['test.canvas.kusto'] },
		});
	}));

	test('gives focus back when the pointer leaves a hover-opened submenu that took focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { root, control, contextViewService, entry } = createEmptyGroup(disposables);
		disposables.add(control);
		const input = append(root, $('input.chat-input'));
		input.focus();

		entry('Canvas').dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(300);
		const focusAfterOpening = getActiveElement() === input;

		// Moving the pointer over a menu item focuses it, like in any menu.
		contextViewService.container!.dispatchEvent(new MouseEvent('mouseenter'));
		contextViewService.container!.querySelector('.action-item .action-label')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		const focusInSubmenu = contextViewService.openSubmenu?.focused;

		contextViewService.container!.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(500);

		assert.deepStrictEqual({ focusAfterOpening, focusInSubmenu, closed: !contextViewService.openSubmenu, focusReturned: getActiveElement() === input }, {
			focusAfterOpening: true,
			focusInSubmenu: true,
			closed: true,
			focusReturned: true,
		});
	}));

	test('reports failed actions and logs which actions ran', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const disposables = store.add(new DisposableStore());
		const { control, ran, notifiedErrors, telemetry, state, entry } = createEmptyGroup(disposables);
		disposables.add(control);

		entry('Browser').click();
		state.failingCommand = 'test.files';
		entry('Files').click();
		await timeout(0);

		// Items in a submenu run through the same runner, so their failures are reported too.
		state.failingCommand = 'test.canvas.kusto';
		entry('Canvas').click();
		getActiveElement()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		await timeout(0);

		assert.deepStrictEqual({
			ran,
			errors: notifiedErrors.map(error => error instanceof Error ? error.message : String(error)),
			telemetry,
		}, {
			ran: ['test.browser', 'test.files', 'test.canvas.kusto'],
			errors: ['test.files failed', 'test.canvas.kusto failed'],
			telemetry: [
				{ id: 'test.browser', from: 'emptyEditorGroupAddTab' },
				{ id: 'test.files', from: 'emptyEditorGroupAddTab' },
				{ id: 'test.canvas.kusto', from: 'emptyEditorGroupAddTab' },
			],
		});
	}));

	test('does not run disabled entries', () => {
		const { control, ran, state, fireMenuChanged, entry } = createEmptyGroup(store);
		store.add(control);
		state.browserEnabled = false;
		fireMenuChanged();

		entry('Browser').click();

		assert.deepStrictEqual({ ran, ariaDisabled: entry('Browser').getAttribute('aria-disabled') }, { ran: [], ariaDisabled: 'true' });
	});
});
