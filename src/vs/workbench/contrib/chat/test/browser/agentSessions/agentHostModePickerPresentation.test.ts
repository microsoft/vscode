/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { IAction, toAction } from '../../../../../../base/common/actions.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { ActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../platform/contextview/browser/contextViewService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../platform/opener/test/common/nullOpenerService.js';
import { createModePickerModeItems, createModePickerPermissionsItems, getModePermissionsPickerAccessibilityProvider, getModePermissionsPickerOptions } from '../../../browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { ChatPermissionLevel } from '../../../common/constants.js';

suite('Combined mode and permissions picker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(openPermissions = false) {
		const container = dom.append(document.body, dom.$('div'));
		store.add({ dispose: () => container.remove() });
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(ILayoutService, new class extends mock<ILayoutService>() {
			override readonly mainContainer = container;
			override readonly activeContainer = container;
			override readonly onDidLayoutContainer = Event.None;
			override getContainer() { return container; }
		}());
		instantiationService.set(IContextKeyService, store.add(new MockContextKeyService()));
		instantiationService.set(IKeybindingService, new MockKeybindingService());
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		instantiationService.set(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
		const service = store.add(instantiationService.createInstance(ActionWidgetService));
		const selections: string[] = [];
		let closes = 0;
		let sandboxed = false;
		const permissionItems: IActionListItem<IAction>[] = [
			...['Manual permissions', 'Assisted permissions', 'Allow all'].map(label => ({
				kind: ActionListItemKind.Action,
				label,
				detail: `${label} description`,
				hover: { content: `${label} details` },
				item: toAction({
					id: label, label,
					checked: label === 'Manual permissions',
					run: () => {
						service.hide();
						selections.push(label);
					},
				}),
			})),
			{ kind: ActionListItemKind.Separator },
			{
				kind: ActionListItemKind.Action,
				label: 'Sandboxing for terminal',
				group: { title: '', icon: Codicon.shield },
				item: toAction({ id: 'sandbox', label: 'Sandboxing for terminal', run: () => { } }),
				standaloneToggle: {
					label: 'Sandboxing for terminal',
					checked: false,
					onChange: value => { sandboxed = value; },
				},
			},
		];
		const items = [
			...createModePickerModeItems([
				{
					kind: ActionListItemKind.Action,
					label: 'Interactive',
					detail: 'Works with you, turn by turn',
					item: toAction({ id: 'interactive', label: 'Interactive', checked: true, run: () => { } }),
				},
				{
					kind: ActionListItemKind.Action,
					label: 'Plan',
					detail: 'Creates a plan before making changes',
					item: toAction({ id: 'plan', label: 'Plan', checked: false, run: () => { } }),
				},
			], true),
			{ kind: ActionListItemKind.Separator },
			...createModePickerPermissionsItems<IAction>({
				label: 'Manual permissions',
				level: ChatPermissionLevel.Default,
				sandboxed: false,
			}, permissionItems, async () => {
				service.hide();
				selections.push('settings');
			}),
		];
		const show = () => service.show('combinedPermissions', false, items, {
			onSelect: action => action.run(),
			onHide: () => { closes++; },
		}, { x: 350, y: 450, width: 150, height: 24 }, undefined, [], getModePermissionsPickerAccessibilityProvider<IAction>(true), getModePermissionsPickerOptions(openPermissions));
		show();
		const permissionHeader = () => container.querySelector<HTMLElement>('.agent-host-mode-permissions')!;
		const popup = container.querySelector<HTMLElement>('.agent-host-mode-permissions-popup')!;
		const labels = () => Array.from(popup.querySelectorAll('.monaco-list-row.action > .title'), label => label.textContent);
		return { container, service, popup, permissionHeader, labels, selections, show, items, getCloses: () => closes, isSandboxed: () => sandboxed };
	}

	function highlightedLabels(popup: HTMLElement): (string | null)[] {
		return Array.from(popup.querySelectorAll('.focus-group-highlighted > .title'), title => title.textContent);
	}

	function selectedLabels(popup: HTMLElement): (string | null)[] {
		return Array.from(popup.querySelectorAll('[role="menuitemradio"][aria-checked="true"] > .title'), title => title.textContent);
	}

	function getRow(popup: HTMLElement, label: string): HTMLElement {
		const row = Array.from(popup.querySelectorAll<HTMLElement>('.monaco-list-row.action')).find(row => row.querySelector('.title')?.textContent === label);
		assert.ok(row);
		return row;
	}

	function hoverRow(popup: HTMLElement, label: string): void {
		const row = getRow(popup, label);
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
	}

	test('opens the same menu with permissions collapsed or expanded for its originating button', () => {
		assert.deepStrictEqual([false, true].map(openPermissions => {
			const options = getModePermissionsPickerOptions(openPermissions);
			return {
				collapsed: [...options.collapsedByDefault ?? []],
				focusGroup: options.initialFocusGroup,
				widgetClassName: options.widgetClassName,
			};
		}), [
			{ collapsed: ['agentHostModePicker.permissions'], focusGroup: undefined, widgetClassName: 'agent-host-mode-permissions-popup' },
			{ collapsed: [], focusGroup: 'agentHostModePicker.permissions', widgetClassName: 'agent-host-mode-permissions-popup' },
		]);
	});

	test('expands and collapses permissions within the same bottom-anchored popup', async () => {
		const { service, popup, permissionHeader, labels, getCloses } = setup();
		const collapsed = popup.getBoundingClientRect();
		const initial = { labels: labels(), expanded: permissionHeader().ariaExpanded };
		service.focusItemById('agentHostModePicker.permissions');
		service.acceptSelected();
		await timeout(0);
		const expanded = popup.getBoundingClientRect();
		const afterExpansion = { labels: labels(), expanded: permissionHeader().ariaExpanded };
		service.acceptSelected();
		await timeout(0);
		const final = popup.getBoundingClientRect();
		assert.deepStrictEqual({
			initial,
			afterExpansion,
			final: { labels: labels(), expanded: permissionHeader().ariaExpanded },
			grew: expanded.height > collapsed.height,
			anchorStable: collapsed.bottom === expanded.bottom && expanded.bottom === final.bottom,
			widthStable: collapsed.width === expanded.width && expanded.width === final.width,
			samePopup: popup.isConnected,
			closes: getCloses(),
			lists: popup.querySelectorAll('.actionList').length,
		}, {
			initial: { labels: ['Interactive', 'Plan', 'Permissions'], expanded: 'false' },
			afterExpansion: { labels: ['Interactive', 'Plan', 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', 'Sandboxing for terminal'], expanded: 'true' },
			final: { labels: ['Interactive', 'Plan', 'Permissions'], expanded: 'false' },
			grew: true,
			anchorStable: true,
			widthStable: true,
			samePopup: true,
			closes: 0,
			lists: 1,
		});
	});

	test('opening permissions directly focuses the current permission without highlighting the disclosure', () => {
		const { container, popup, permissionHeader, labels } = setup(true);
		const list = popup.querySelector<HTMLElement>('.monaco-list')!;
		const permission = getRow(popup, 'Manual permissions');
		assert.deepStrictEqual({
			expanded: permissionHeader().ariaExpanded,
			headerFocused: permissionHeader().classList.contains('focused'),
			permissionFocused: permission.classList.contains('focused'),
			activeDescendant: list.getAttribute('aria-activedescendant') === permission.id,
			highlights: highlightedLabels(popup),
			listFocused: dom.getActiveElement() === list,
			labels: labels(),
			popups: container.querySelectorAll('.action-widget.agent-host-mode-permissions-popup').length,
			lists: popup.querySelectorAll('.actionList').length,
		}, {
			expanded: 'true',
			headerFocused: false,
			permissionFocused: true,
			activeDescendant: true,
			highlights: ['Interactive', 'Manual permissions'],
			listFocused: true,
			labels: ['Interactive', 'Plan', 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', 'Sandboxing for terminal'],
			popups: 1,
			lists: 1,
		});
	});

	test('opening permissions stays quiet when the sandbox state immediately refreshes', () => {
		const { service, popup, items, selections } = setup(true);
		service.updateItems(items.map(item => item.standaloneToggle
			? { ...item, standaloneToggle: { ...item.standaloneToggle, disabled: true } }
			: item));
		const panel = popup.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const refreshed = {
			hoverDisplay: panel.style.display,
			hoverText: panel.textContent,
			focused: getRow(popup, 'Manual permissions').classList.contains('focused'),
			highlights: highlightedLabels(popup),
			selections: selectedLabels(popup),
		};
		service.focusNext();

		assert.deepStrictEqual({ refreshed, hoverAfterNavigation: panel.textContent, activated: selections }, {
			refreshed: {
				hoverDisplay: 'none',
				hoverText: '',
				focused: true,
				highlights: ['Interactive', 'Manual permissions'],
				selections: ['Interactive', 'Manual permissions'],
			},
			hoverAfterNavigation: 'Assisted permissions details',
			activated: [],
		});
	});

	test('sandbox shields remain neutral after opening or expanding permissions', () => {
		const states = [false, true].map(openPermissions => {
			const { container, service, popup } = setup(openPermissions);
			container.style.setProperty('--vscode-editorLightBulb-foreground', '#ffcc00');
			container.style.setProperty('--vscode-menu-foreground', '#123456');
			if (!openPermissions) {
				service.focusItemById('agentHostModePicker.permissions');
				service.expandSection();
			}
			const row = getRow(popup, 'Sandboxing for terminal');
			const icon = row.querySelector<HTMLElement>('.codicon-shield')!;
			return {
				openPermissions,
				inlineColor: icon.style.color,
				inheritsRowColor: dom.getWindow(icon).getComputedStyle(icon).color === dom.getWindow(row).getComputedStyle(row).color,
			};
		});
		assert.deepStrictEqual(states, [false, true].map(openPermissions => ({ openPermissions, inlineColor: '', inheritsRowColor: true })));
	});

	test('the permissions disclosure remains keyboard-accessible after opening on the current permission', () => {
		const { service, permissionHeader, selections, getCloses } = setup(true);
		service.focusPrevious();
		const headerFocused = permissionHeader().classList.contains('focused');
		service.collapseSection();
		const collapsed = permissionHeader().ariaExpanded;
		service.expandSection();
		service.focusNext();
		service.acceptSelected();

		assert.deepStrictEqual({ headerFocused, collapsed, selections, closes: getCloses() }, {
			headerFocused: true,
			collapsed: 'false',
			selections: ['Manual permissions'],
			closes: 1,
		});
	});

	test('labels the mode section and initially highlights the selected option in each group', () => {
		const { container, popup } = setup(true);
		container.style.setProperty('--vscode-list-hoverBackground', '#234567');
		const highlights = Array.from(popup.querySelectorAll('.focus-group-highlighted'), row => ({
			label: row.querySelector('.title')?.textContent,
			background: dom.getWindow(row).getComputedStyle(row).backgroundColor,
		}));

		assert.deepStrictEqual({
			header: popup.querySelector('.group-header')?.textContent,
			selections: selectedLabels(popup),
			highlights,
			disclosureIsChoice: popup.querySelector('.agent-host-mode-permissions')?.getAttribute('role') === 'menuitemradio',
		}, {
			header: 'Agent mode',
			selections: ['Interactive', 'Manual permissions'],
			highlights: [
				{ label: 'Interactive', background: 'rgb(35, 69, 103)' },
				{ label: 'Manual permissions', background: 'rgb(35, 69, 103)' },
			],
			disclosureIsChoice: false,
		});
	});

	for (const contrastBorder of [undefined, '#ff00ff']) {
		test(`initial and retained highlights match hover and keyboard focus${contrastBorder ? ' with contrast borders' : ''}`, () => {
			const { container, service, popup } = setup(true);
			container.style.setProperty('--vscode-list-hoverBackground', '#234567');
			container.style.setProperty('--vscode-list-hoverForeground', '#fedcba');
			container.style.setProperty('--vscode-list-inactiveSelectionBackground', '#765432');
			container.style.setProperty('--vscode-list-inactiveSelectionForeground', '#abcdef');
			container.style.setProperty('--vscode-descriptionForeground', '#987654');
			if (contrastBorder) {
				container.style.setProperty('--vscode-menu-selectionBorder', contrastBorder);
			}

			const readStyle = (row: HTMLElement) => {
				const window = dom.getWindow(row);
				const style = window.getComputedStyle(row);
				const detail = window.getComputedStyle(row.querySelector('.detail')!);
				return {
					background: style.backgroundColor,
					foreground: style.color,
					fontWeight: style.fontWeight,
					outline: style.outline,
					outlineOffset: style.outlineOffset,
					detailColor: detail.color,
					detailOpacity: detail.opacity,
				};
			};
			const states = [['Interactive', 'interactive'], ['Manual permissions', 'Manual permissions']].map(([label, id]) => {
				const row = getRow(popup, label);
				const initial = readStyle(row);
				hoverRow(popup, label);
				const hovered = readStyle(row);
				hoverRow(popup, 'Permissions');
				const retained = readStyle(row);
				service.focusItemById(id);
				return { initial, hovered, retained, keyboard: readStyle(row) };
			});

			assert.deepStrictEqual(states, states.map(({ hovered }) => ({
				initial: hovered,
				hovered,
				retained: hovered,
				keyboard: hovered,
			})));
		});
	}

	test('hover immediately moves only its group highlight without selecting an option', () => {
		const { container, popup, selections } = setup(true);
		container.style.setProperty('--vscode-list-hoverBackground', '#234567');
		const highlights = [highlightedLabels(popup)];
		for (const label of ['Plan', 'Allow all', 'Interactive', 'Assisted permissions', 'Sandboxing for terminal', 'Permissions']) {
			hoverRow(popup, label);
			highlights.push(highlightedLabels(popup));
		}
		const manual = getRow(popup, 'Manual permissions');
		assert.deepStrictEqual({
			highlights,
			selections: selectedLabels(popup),
			activated: selections,
			oldPermissionHighlightCleared: dom.getWindow(manual).getComputedStyle(manual).backgroundColor !== 'rgb(35, 69, 103)',
		}, {
			highlights: [
				['Interactive', 'Manual permissions'],
				['Plan', 'Manual permissions'],
				['Plan', 'Allow all'],
				['Interactive', 'Allow all'],
				['Interactive', 'Assisted permissions'],
				['Interactive', 'Sandboxing for terminal'],
				['Interactive', 'Sandboxing for terminal'],
			],
			selections: ['Interactive', 'Manual permissions'],
			activated: [],
			oldPermissionHighlightCleared: true,
		});
	});

	test('keyboard navigation moves group highlights across collapse and expansion and reopening resets them', () => {
		const { container, service, popup, show } = setup(true);
		service.focusItemById('plan');
		const highlights = [highlightedLabels(popup)];
		service.collapseSection();
		highlights.push(highlightedLabels(popup));
		service.focusNext();
		highlights.push(highlightedLabels(popup));
		service.focusNext();
		service.focusNext();
		highlights.push(highlightedLabels(popup));
		service.collapseSection();
		highlights.push(highlightedLabels(popup));
		const collapsedSelections = selectedLabels(popup);
		service.expandSection();
		highlights.push(highlightedLabels(popup));
		service.focusNext();
		highlights.push(highlightedLabels(popup));
		service.hide();
		show();
		const reopened = container.querySelector<HTMLElement>('.agent-host-mode-permissions-popup')!;

		assert.deepStrictEqual({
			highlights,
			collapsedSelections,
			reopenedHighlights: highlightedLabels(reopened),
			reopenedSelections: selectedLabels(reopened),
		}, {
			highlights: [
				['Plan', 'Manual permissions'],
				['Plan', 'Manual permissions'],
				['Plan', 'Manual permissions'],
				['Plan', 'Assisted permissions'],
				['Plan'],
				['Plan', 'Assisted permissions'],
				['Plan', 'Manual permissions'],
			],
			collapsedSelections: ['Interactive'],
			reopenedHighlights: ['Interactive', 'Manual permissions'],
			reopenedSelections: ['Interactive', 'Manual permissions'],
		});
	});

	test('the permissions disclosure never retains a group highlight, including while collapsed', () => {
		const { container, service, popup, permissionHeader } = setup(true);
		container.style.setProperty('--vscode-list-hoverBackground', '#234567');
		hoverRow(popup, 'Allow all');
		hoverRow(popup, 'Permissions');
		const hoveredHeader = {
			focused: permissionHeader().classList.contains('focused'),
			retained: permissionHeader().classList.contains('focus-group-highlighted'),
			highlights: highlightedLabels(popup),
		};
		service.collapseSection();
		hoverRow(popup, 'Plan');
		const collapsed = {
			focused: permissionHeader().classList.contains('focused'),
			retained: permissionHeader().classList.contains('focus-group-highlighted'),
			highlights: highlightedLabels(popup),
			headerBackground: dom.getWindow(popup).getComputedStyle(permissionHeader()).backgroundColor,
		};
		service.focusItemById('agentHostModePicker.permissions');
		service.expandSection();
		hoverRow(popup, 'Plan');
		assert.deepStrictEqual({
			hoveredHeader,
			collapsed,
			reexpanded: highlightedLabels(popup),
			selection: selectedLabels(popup),
		}, {
			hoveredHeader: { focused: true, retained: false, highlights: ['Interactive', 'Allow all'] },
			collapsed: { focused: false, retained: false, highlights: ['Plan'], headerBackground: 'rgba(0, 0, 0, 0)' },
			reexpanded: ['Plan', 'Allow all'],
			selection: ['Interactive', 'Manual permissions'],
		});
	});

	test('leaves standalone mode menus and their accessibility unchanged', () => {
		const modes: IActionListItem<IAction>[] = [{
			kind: ActionListItemKind.Action,
			label: 'Interactive',
			item: toAction({ id: 'interactive', label: 'Interactive', checked: true, run: () => { } }),
		}];
		assert.deepStrictEqual({
			modes: createModePickerModeItems(modes, false),
			accessibility: getModePermissionsPickerAccessibilityProvider(false),
		}, { modes, accessibility: {} });
	});

	test('keyboard expansion and the sandbox toggle do not close the menu', () => {
		const { service, permissionHeader, isSandboxed, getCloses } = setup();
		service.focusItemById('agentHostModePicker.permissions');
		service.expandSection();
		service.focusItemById('sandbox');
		service.acceptSelected();
		const expanded = permissionHeader().ariaExpanded;
		service.collapseSection();
		assert.deepStrictEqual({
			sandboxed: isSandboxed(),
			expanded,
			collapsed: permissionHeader().ariaExpanded,
			headerFocused: permissionHeader().classList.contains('focused'),
			closes: getCloses(),
		}, { sandboxed: true, expanded: 'true', collapsed: 'false', headerFocused: true, closes: 0 });
	});

	test('permission selections and the gear retain single ownership of popup closure', () => {
		const permissionPicker = setup(true);
		permissionPicker.service.focusItemById('Allow all');
		permissionPicker.service.acceptSelected();
		const settingsPicker = setup(true);
		settingsPicker.permissionHeader().querySelector<HTMLElement>('.action-list-item-toolbar .action-label')!.click();
		assert.deepStrictEqual({
			permission: { selections: permissionPicker.selections, closes: permissionPicker.getCloses() },
			settings: { selections: settingsPicker.selections, closes: settingsPicker.getCloses() },
		}, {
			permission: { selections: ['Allow all'], closes: 1 },
			settings: { selections: ['settings'], closes: 1 },
		});
	});
});
