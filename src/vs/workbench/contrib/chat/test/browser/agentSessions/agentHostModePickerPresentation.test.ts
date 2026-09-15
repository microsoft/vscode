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
		}, { x: 350, y: 450, width: 150, height: 24 }, undefined, [], getModePermissionsPickerAccessibilityProvider<IAction>(true), getModePermissionsPickerOptions(openPermissions, openPermissions ? 'Manual permissions' : 'interactive'));
		show();
		const modeHeader = () => container.querySelector<HTMLElement>('.agent-host-mode-section')!;
		const permissionHeader = () => container.querySelector<HTMLElement>('.agent-host-mode-permissions')!;
		const popup = container.querySelector<HTMLElement>('.agent-host-mode-permissions-popup')!;
		const labels = () => Array.from(popup.querySelectorAll('.monaco-list-row.action > .title'), label => label.textContent);
		return { container, service, popup, modeHeader, permissionHeader, labels, selections, show, items, getCloses: () => closes, isSandboxed: () => sandboxed };
	}

	function highlightedLabels(popup: HTMLElement): (string | null)[] {
		return Array.from(popup.querySelectorAll('.monaco-list-row.action.focused > .title'), title => title.textContent);
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
			const options = getModePermissionsPickerOptions(openPermissions, openPermissions ? 'Manual permissions' : 'interactive');
			return {
				collapsed: [...options.collapsedByDefault ?? []],
				initialFocusItemId: options.initialFocusItemId,
				widgetClassName: options.widgetClassName,
			};
		}), [
			{ collapsed: ['agentHostModePicker.permissions'], initialFocusItemId: 'interactive', widgetClassName: 'agent-host-mode-permissions-popup' },
			{ collapsed: ['agentHostModePicker.mode'], initialFocusItemId: 'Manual permissions', widgetClassName: 'agent-host-mode-permissions-popup' },
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
			initial: { labels: ['Agent mode', 'Interactive', 'Plan', 'Permissions'], expanded: 'false' },
			afterExpansion: { labels: ['Agent mode', 'Interactive', 'Plan', 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', 'Sandboxing for terminal'], expanded: 'true' },
			final: { labels: ['Agent mode', 'Interactive', 'Plan', 'Permissions'], expanded: 'false' },
			grew: true,
			anchorStable: true,
			widthStable: true,
			samePopup: true,
			closes: 0,
			lists: 1,
		});
	});

	test('opening permissions collapses mode and focuses the current permission', () => {
		const { container, popup, modeHeader, permissionHeader, labels } = setup(true);
		const list = popup.querySelector<HTMLElement>('.monaco-list')!;
		const permission = getRow(popup, 'Manual permissions');
		assert.deepStrictEqual({
			modeExpanded: modeHeader().ariaExpanded,
			modeSummary: modeHeader().querySelector('.description')?.textContent,
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
			modeExpanded: 'false',
			modeSummary: 'Interactive',
			expanded: 'true',
			headerFocused: false,
			permissionFocused: true,
			activeDescendant: true,
			highlights: ['Manual permissions'],
			listFocused: true,
			labels: ['Agent mode', 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', 'Sandboxing for terminal'],
			popups: 1,
			lists: 1,
		});
	});

	test('opening mode collapses permissions and focuses the current mode', () => {
		const { popup, modeHeader, permissionHeader, labels } = setup();
		const list = popup.querySelector<HTMLElement>('.monaco-list')!;
		const mode = getRow(popup, 'Interactive');
		assert.deepStrictEqual({
			modeExpanded: modeHeader().ariaExpanded,
			modeSummary: modeHeader().querySelector('.description')?.textContent,
			permissionExpanded: permissionHeader().ariaExpanded,
			permissionSummary: permissionHeader().querySelector('.description')?.textContent,
			modeFocused: mode.classList.contains('focused'),
			activeDescendant: list.getAttribute('aria-activedescendant') === mode.id,
			highlights: highlightedLabels(popup),
			selections: selectedLabels(popup),
			labels: labels(),
		}, {
			modeExpanded: 'true',
			modeSummary: 'Interactive',
			permissionExpanded: 'false',
			permissionSummary: 'Manual',
			modeFocused: true,
			activeDescendant: true,
			highlights: ['Interactive'],
			selections: ['Interactive'],
			labels: ['Agent mode', 'Interactive', 'Plan', 'Permissions'],
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
				highlights: ['Manual permissions'],
				selections: ['Manual permissions'],
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

	test('section headers show current selections and are not radio choices', () => {
		const { container, popup, modeHeader, permissionHeader } = setup(true);
		container.style.color = '#f0f0f0';
		container.style.setProperty('--vscode-descriptionForeground', '#8c8c8c');
		container.style.setProperty('--vscode-list-hoverBackground', '#234567');
		container.style.setProperty('--vscode-spacing-size20', '2px');
		container.style.setProperty('--vscode-spacing-size40', '4px');
		container.style.setProperty('--vscode-spacing-size60', '6px');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		container.style.setProperty('--vscode-spacing-size120', '12px');
		const highlights = Array.from(popup.querySelectorAll('.monaco-list-row.action.focused'), row => ({
			label: row.querySelector('.title')?.textContent,
			background: dom.getWindow(row).getComputedStyle(row).backgroundColor,
		}));
		const permissionSummary = permissionHeader().querySelector<HTMLElement>('.description')!;
		const modeSummary = modeHeader().querySelector<HTMLElement>('.description')!;
		const permissionGear = permissionHeader().querySelector<HTMLElement>('.action-list-item-toolbar .action-label')!;
		const modeTitle = modeHeader().querySelector<HTMLElement>('.title')!;
		const permissionChoiceTitle = getRow(popup, 'Manual permissions').querySelector<HTMLElement>('.title')!;
		const modeBounds = modeHeader().getBoundingClientRect();
		const permissionBounds = permissionHeader().getBoundingClientRect();
		const modeSummaryBounds = modeSummary.getBoundingClientRect();
		const summaryBounds = permissionSummary.getBoundingClientRect();
		const gearBounds = permissionGear.getBoundingClientRect();

		assert.deepStrictEqual({
			mode: {
				label: modeHeader().querySelector('.title')?.textContent,
				summary: modeHeader().querySelector('.description')?.textContent,
				aria: modeHeader().getAttribute('aria-label'),
				expanded: modeHeader().ariaExpanded,
			},
			permissions: {
				label: permissionHeader().querySelector('.title')?.textContent,
				summary: permissionHeader().querySelector('.description')?.textContent,
				expanded: permissionHeader().ariaExpanded,
			},
			selections: selectedLabels(popup),
			highlights,
			layout: {
				titleColumnAligned: Math.abs(modeTitle.getBoundingClientRect().left - permissionChoiceTitle.getBoundingClientRect().left) < 1,
				gearBeforeSummary: gearBounds.right <= summaryBounds.left,
				gearSummaryGap: summaryBounds.left - gearBounds.right,
				rightInsets: {
					mode: modeBounds.right - modeSummaryBounds.right,
					permissions: permissionBounds.right - summaryBounds.right,
				},
			},
			colors: {
				modeHeader: dom.getWindow(modeHeader()).getComputedStyle(modeHeader()).color,
				permissionHeader: dom.getWindow(permissionHeader()).getComputedStyle(permissionHeader()).color,
				permissionGear: dom.getWindow(permissionGear).getComputedStyle(permissionGear).color,
				permissionChoice: dom.getWindow(popup).getComputedStyle(getRow(popup, 'Manual permissions')).color,
			},
			modeDisclosureIsChoice: modeHeader().getAttribute('role') === 'menuitemradio',
			disclosureIsChoice: popup.querySelector('.agent-host-mode-permissions')?.getAttribute('role') === 'menuitemradio',
		}, {
			mode: {
				label: 'Agent mode',
				summary: 'Interactive',
				aria: 'Agent mode, Current mode: Interactive',
				expanded: 'false',
			},
			permissions: {
				label: 'Permissions',
				summary: 'Manual',
				expanded: 'true',
			},
			selections: ['Manual permissions'],
			highlights: [
				{ label: 'Manual permissions', background: 'rgb(35, 69, 103)' },
			],
			layout: {
				titleColumnAligned: true,
				gearBeforeSummary: true,
				gearSummaryGap: 4,
				rightInsets: {
					mode: 20,
					permissions: 20,
				},
			},
			colors: {
				modeHeader: 'rgb(140, 140, 140)',
				permissionHeader: 'rgb(140, 140, 140)',
				permissionGear: 'rgb(140, 140, 140)',
				permissionChoice: 'rgb(240, 240, 240)',
			},
			modeDisclosureIsChoice: false,
			disclosureIsChoice: false,
		});
	});

	test('focused section headers use the standard list hover foreground', () => {
		const { container, service, modeHeader, permissionHeader } = setup(true);
		container.style.setProperty('--vscode-descriptionForeground', '#8c8c8c');
		container.style.setProperty('--vscode-list-hoverForeground', '#fedcba');
		const colors = [];
		for (const [id, header] of [['agentHostModePicker.mode', modeHeader], ['agentHostModePicker.permissions', permissionHeader]] as const) {
			service.focusItemById(id);
			colors.push({
				label: header().querySelector('.title')?.textContent,
				color: dom.getWindow(header()).getComputedStyle(header()).color,
			});
		}

		assert.deepStrictEqual(colors, [
			{ label: 'Agent mode', color: 'rgb(254, 220, 186)' },
			{ label: 'Permissions', color: 'rgb(254, 220, 186)' },
		]);
	});

	for (const contrastBorder of [undefined, '#ff00ff']) {
		test(`hover and keyboard focus highlight only one row${contrastBorder ? ' with contrast borders' : ''}`, () => {
			const { container, service, popup } = setup(true);
			service.focusItemById('agentHostModePicker.mode');
			service.expandSection();
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
			const interactive = getRow(popup, 'Interactive');
			const initial = readStyle(interactive);
			hoverRow(popup, 'Interactive');
			const hovered = readStyle(interactive);
			const hoverHighlights = highlightedLabels(popup);
			hoverRow(popup, 'Permissions');
			const released = readStyle(interactive);
			const headerHighlights = highlightedLabels(popup);
			service.focusItemById('Manual permissions');
			const keyboard = readStyle(getRow(popup, 'Manual permissions'));

			assert.deepStrictEqual({
				hoverHighlights,
				headerHighlights,
				keyboardHighlights: highlightedLabels(popup),
				hoverChangesBackground: hovered.background !== initial.background,
				releasedMatchesInitial: released.background === initial.background && released.foreground === initial.foreground && released.outline === initial.outline,
				keyboardMatchesHover: keyboard.background === hovered.background && keyboard.foreground === hovered.foreground && keyboard.outline === hovered.outline,
				selections: selectedLabels(popup),
			}, {
				hoverHighlights: ['Interactive'],
				headerHighlights: ['Permissions'],
				keyboardHighlights: ['Manual permissions'],
				hoverChangesBackground: true,
				releasedMatchesInitial: true,
				keyboardMatchesHover: true,
				selections: ['Interactive', 'Manual permissions'],
			});
		});
	}

	test('hover moves the only visual highlight without changing radio selections', () => {
		const { container, service, popup, selections } = setup(true);
		service.focusItemById('agentHostModePicker.mode');
		service.expandSection();
		container.style.setProperty('--vscode-list-hoverBackground', '#234567');
		const highlights = [highlightedLabels(popup)];
		for (const label of ['Plan', 'Allow all', 'Interactive', 'Assisted permissions', 'Sandboxing for terminal', 'Permissions']) {
			hoverRow(popup, label);
			highlights.push(highlightedLabels(popup));
		}
		assert.deepStrictEqual({
			highlights,
			selections: selectedLabels(popup),
			activated: selections,
		}, {
			highlights: [
				['Agent mode'],
				['Plan'],
				['Allow all'],
				['Interactive'],
				['Assisted permissions'],
				['Sandboxing for terminal'],
				['Permissions'],
			],
			selections: ['Interactive', 'Manual permissions'],
			activated: [],
		});
	});

	test('keyboard collapse moves focus to the section header and reopening resets the originating section', () => {
		const { container, service, popup, modeHeader, show } = setup(true);
		const initial = {
			labels: Array.from(popup.querySelectorAll('.monaco-list-row.action > .title'), label => label.textContent),
			highlights: highlightedLabels(popup),
			selections: selectedLabels(popup),
		};
		service.focusItemById('agentHostModePicker.mode');
		service.expandSection();
		service.focusItemById('plan');
		service.collapseSection();
		const collapsed = {
			expanded: modeHeader().ariaExpanded,
			headerFocused: modeHeader().classList.contains('focused'),
			highlights: highlightedLabels(popup),
			selections: selectedLabels(popup),
		};
		service.expandSection();
		service.focusNext();
		const reexpanded = {
			expanded: modeHeader().ariaExpanded,
			highlights: highlightedLabels(popup),
			selections: selectedLabels(popup),
			focused: popup.querySelector('.monaco-list-row.focused > .title')?.textContent,
		};
		service.hide();
		show();
		const reopened = container.querySelector<HTMLElement>('.agent-host-mode-permissions-popup')!;

		assert.deepStrictEqual({
			initial,
			collapsed,
			reexpanded,
			reopenedLabels: Array.from(reopened.querySelectorAll('.monaco-list-row.action > .title'), label => label.textContent),
			reopenedHighlights: highlightedLabels(reopened),
			reopenedSelections: selectedLabels(reopened),
		}, {
			initial: {
				labels: ['Agent mode', 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', 'Sandboxing for terminal'],
				highlights: ['Manual permissions'],
				selections: ['Manual permissions'],
			},
			collapsed: {
				expanded: 'false',
				headerFocused: true,
				highlights: ['Agent mode'],
				selections: ['Manual permissions'],
			},
			reexpanded: {
				expanded: 'true',
				highlights: ['Interactive'],
				selections: ['Interactive', 'Manual permissions'],
				focused: 'Interactive',
			},
			reopenedLabels: ['Agent mode', 'Permissions', 'Manual permissions', 'Assisted permissions', 'Allow all', 'Sandboxing for terminal'],
			reopenedHighlights: ['Manual permissions'],
			reopenedSelections: ['Manual permissions'],
		});
	});

	test('the permissions disclosure never retains a group highlight, including while collapsed', () => {
		const { container, service, popup, permissionHeader } = setup(true);
		service.focusItemById('agentHostModePicker.mode');
		service.expandSection();
		container.style.setProperty('--vscode-list-hoverBackground', '#234567');
		hoverRow(popup, 'Allow all');
		hoverRow(popup, 'Permissions');
		const hoveredHeader = {
			focused: permissionHeader().classList.contains('focused'),
			highlights: highlightedLabels(popup),
		};
		service.collapseSection();
		hoverRow(popup, 'Plan');
		const collapsed = {
			focused: permissionHeader().classList.contains('focused'),
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
			hoveredHeader: { focused: true, highlights: ['Permissions'] },
			collapsed: { focused: false, highlights: ['Plan'], headerBackground: 'rgba(0, 0, 0, 0)' },
			reexpanded: ['Plan'],
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
