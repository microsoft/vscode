/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../base/browser/window.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Emitter } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MenuItemAction, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IPartOptions, Part } from '../../../../workbench/browser/part.js';
import { IPaneCompositeBarOptions } from '../../../../workbench/browser/parts/paneCompositeBar.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts, Position } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ViewDescriptorService } from '../../../../workbench/services/views/browser/viewDescriptorService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../workbench/test/browser/workbenchTestServices.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
// eslint-disable-next-line local/code-import-patterns
import '../../../../workbench/contrib/modernUI/browser/media/tabs.css';
import { PanelPart } from '../../../browser/parts/panelPart.js';

interface IPanelPartTestHarness {
	readonly configurationService: {
		getValue(key: string): boolean;
	};
	readonly layoutService: {
		readonly mainContainer: HTMLElement;
		getPanelPosition(): Position;
		isPanelMaximized(): boolean;
	};
	readonly menuService: {
		getMenuActions(): [string, Array<MenuItemAction | SubmenuItemAction>][];
	};
	readonly contextKeyService: IContextKeyService;
	fillExtraContextMenuActions(actions: IAction[]): void;
	transformContextMenuActionsForComposite(actions: IAction[]): IAction[];
}

const getCompositeBarOptions = Reflect.get(PanelPart.prototype, 'getCompositeBarOptions') as (this: IPanelPartTestHarness) => IPaneCompositeBarOptions;
const transformContextMenuActionsForComposite = Reflect.get(PanelPart.prototype, 'transformContextMenuActionsForComposite') as (this: Pick<IPanelPartTestHarness, 'layoutService' | 'menuService' | 'contextKeyService'>, actions: IAction[]) => IAction[];

class MutableTestLayoutService extends TestLayoutService {

	private readonly _visibleParts = new Map<Parts, boolean>([
		[Parts.PANEL_PART, true],
		[Parts.SESSIONS_PART, true],
		[Parts.SIDEBAR_PART, true],
	]);

	private readonly _onDidChangePartVisibility = new Emitter<IPartVisibilityChangeEvent>();
	override readonly onDidChangePartVisibility = this._onDidChangePartVisibility.event;

	override isVisible(part: Parts, _targetWindow?: Window): boolean {
		return this._visibleParts.get(part) ?? false;
	}

	override getPanelAlignment(): 'justify' {
		return 'justify';
	}

	setVisible(part: Parts, visible: boolean): void {
		this._visibleParts.set(part, visible);
		this._onDidChangePartVisibility.fire({ partId: part, visible });
	}

	dispose(): void {
		this._onDidChangePartVisibility.dispose();
	}
}

function getAlignmentSubmenu(actions: readonly IAction[]): SubmenuAction {
	const submenu = actions.find(action => action instanceof SubmenuAction);
	if (!submenu) {
		throw new Error('Expected an alignment submenu');
	}

	return submenu;
}

function createPanelTab(root: HTMLElement): {
	panel: HTMLElement;
	title: HTMLElement;
	actionItem: HTMLElement;
	actionLabel: HTMLElement;
	badge: HTMLElement;
	indicator: HTMLElement;
	secondActionItem: HTMLElement;
	secondIndicator: HTMLElement;
	titleActions: HTMLElement;
	titleActionItem: HTMLElement;
} {
	const panel = mainWindow.document.createElement('div');
	panel.className = 'part panel bottom pane-composite-part panel-labels';
	panel.style.setProperty('--part-border-color', '#345678');
	root.appendChild(panel);

	const title = mainWindow.document.createElement('div');
	title.className = 'composite title has-composite-bar';
	title.style.height = '32px';
	panel.appendChild(title);

	const compositeBarContainer = mainWindow.document.createElement('div');
	compositeBarContainer.className = 'composite-bar-container';
	title.appendChild(compositeBarContainer);

	const compositeBar = mainWindow.document.createElement('div');
	compositeBar.className = 'composite-bar';
	compositeBarContainer.appendChild(compositeBar);

	const actionBar = mainWindow.document.createElement('div');
	actionBar.className = 'monaco-action-bar';
	compositeBar.appendChild(actionBar);

	const actionsContainer = mainWindow.document.createElement('div');
	actionsContainer.className = 'actions-container';
	actionBar.appendChild(actionsContainer);

	const actionItem = mainWindow.document.createElement('div');
	actionItem.className = 'action-item checked';
	actionsContainer.appendChild(actionItem);

	const actionLabel = mainWindow.document.createElement('a');
	actionLabel.className = 'action-label';
	actionItem.appendChild(actionLabel);

	const badge = mainWindow.document.createElement('div');
	badge.className = 'badge';
	actionItem.appendChild(badge);

	const badgeContent = mainWindow.document.createElement('div');
	badgeContent.className = 'badge-content';
	badgeContent.textContent = '1';
	badge.appendChild(badgeContent);

	const indicator = mainWindow.document.createElement('div');
	indicator.className = 'active-item-indicator';
	actionItem.appendChild(indicator);

	const secondActionItem = mainWindow.document.createElement('div');
	secondActionItem.className = 'action-item';
	actionsContainer.appendChild(secondActionItem);

	const secondActionLabel = mainWindow.document.createElement('a');
	secondActionLabel.className = 'action-label';
	secondActionItem.appendChild(secondActionLabel);

	const secondIndicator = mainWindow.document.createElement('div');
	secondIndicator.className = 'active-item-indicator';
	secondActionItem.appendChild(secondIndicator);

	const titleActions = mainWindow.document.createElement('div');
	titleActions.className = 'title-actions';
	title.appendChild(titleActions);

	const titleToolbar = mainWindow.document.createElement('div');
	titleToolbar.className = 'monaco-toolbar';
	titleActions.appendChild(titleToolbar);

	const titleActionBar = mainWindow.document.createElement('div');
	titleActionBar.className = 'monaco-action-bar';
	titleToolbar.appendChild(titleActionBar);

	const titleActionsContainer = mainWindow.document.createElement('div');
	titleActionsContainer.className = 'actions-container';
	titleActionBar.appendChild(titleActionsContainer);

	const titleActionItem = mainWindow.document.createElement('div');
	titleActionItem.className = 'action-item';
	titleActionItem.style.height = '22px';
	titleActionsContainer.appendChild(titleActionItem);

	return { panel, title, actionItem, actionLabel, badge, indicator, secondActionItem, secondIndicator, titleActions, titleActionItem };
}

suite('Sessions - Panel Part', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('relayouts when Sessions visibility changes', () => {
		const layoutService = disposables.add(new MutableTestLayoutService());
		const instantiationService: TestInstantiationService = workbenchInstantiationService({}, disposables);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		const panelPart = disposables.add(instantiationService.createInstance(PanelPart));
		Part.prototype.layout.call(panelPart, 800, 200, 400, 0);
		const layout = sinon.stub(panelPart, 'layout');

		layoutService.setVisible(Parts.TITLEBAR_PART, false);
		layoutService.setVisible(Parts.SESSIONS_PART, false);
		layoutService.setVisible(Parts.SESSIONS_PART, true);

		assert.deepStrictEqual(layout.args, [
			[800, 200, 400, 0],
			[800, 200, 400, 0],
		]);
	});

	test('matches labeled panel height to editor tab density', () => {
		const configurationService = new TestConfigurationService({
			'window.density.editorTabHeight': 'default',
			'workbench.panel.showLabels': true,
		});
		const instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, disposables);
		const viewDescriptorService = disposables.add(instantiationService.createInstance(ViewDescriptorService));
		instantiationService.stub(IViewDescriptorService, viewDescriptorService);
		const panelPart = disposables.add(instantiationService.createInstance(PanelPart));
		const titleHeight = (Reflect.get(panelPart, 'options') as IPartOptions).titleHeight;

		const defaultHeight = titleHeight?.();
		configurationService.setUserConfiguration('window.density.editorTabHeight', 'compact');
		const compactHeight = titleHeight?.();
		configurationService.setUserConfiguration('workbench.panel.showLabels', false);
		const iconHeight = titleHeight?.();

		assert.deepStrictEqual({ defaultHeight, compactHeight, iconHeight }, {
			defaultHeight: 32,
			compactHeight: 28,
			iconHeight: undefined,
		});
	});

	test('replaces only view container movement with panel alignment actions', async () => {
		let alignment: 'center' | 'justify' = 'justify';
		const commands: string[] = [];
		const mainContainer = mainWindow.document.createElement('div');
		const contextKeyService = new class extends mock<IContextKeyService>() {
			override contextMatchesRules(rules: ContextKeyExpression): boolean {
				return rules === ContextKeyExpr.true();
			}
		}();
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<R = unknown>(id: string): Promise<R | undefined> {
				commands.push(id);
				if (id === 'workbench.action.alignPanelCenter') {
					alignment = 'center';
				} else if (id === 'workbench.action.alignPanelJustify') {
					alignment = 'justify';
				}
				return undefined;
			}
		}();
		const createAlignmentAction = (id: string, label: string, value: 'left' | 'right' | 'center' | 'justify') => new MenuItemAction(
			{ id, title: label, toggled: alignment === value ? ContextKeyExpr.true() : ContextKeyExpr.false() },
			undefined,
			undefined,
			undefined,
			undefined,
			contextKeyService,
			commandService,
		);
		const host: IPanelPartTestHarness = {
			configurationService: {
				getValue: () => true,
			},
			layoutService: {
				mainContainer,
				getPanelPosition: () => Position.BOTTOM,
				isPanelMaximized: () => false,
			},
			menuService: {
				getMenuActions: () => [['1_panel', [
					createAlignmentAction('workbench.action.alignPanelLeft', 'Left', 'left'),
					createAlignmentAction('workbench.action.alignPanelCenter', 'Center', 'center'),
					createAlignmentAction('workbench.action.alignPanelRight', 'Right', 'right'),
					createAlignmentAction('workbench.action.alignPanelJustify', 'Justify', 'justify'),
				]]],
			},
			contextKeyService,
			fillExtraContextMenuActions: () => { },
			transformContextMenuActionsForComposite: actions => transformContextMenuActionsForComposite.call(host, actions),
		};

		const separator = new Separator();
		const moveToAction = new SubmenuAction('moveToMenu', 'Move To', []);
		const resetLocationAction = toAction({ id: 'resetLocationAction', label: 'Reset Location', run: () => { } });
		const defaultActions = [separator, moveToAction, resetLocationAction];
		const options = getCompositeBarOptions.call(host);
		const initialActions = options.transformContextMenuActionsForComposite?.(defaultActions, 'workbench.panel.terminal') ?? [];
		const initialSubmenu = getAlignmentSubmenu(initialActions);
		await initialSubmenu.actions[0].run();

		const centeredSubmenu = getAlignmentSubmenu(options.transformContextMenuActionsForComposite?.(defaultActions, 'workbench.panel.terminal') ?? []);
		await centeredSubmenu.actions[1].run();

		mainContainer.classList.add('phone-layout');
		const phoneActions = options.transformContextMenuActionsForComposite?.(defaultActions, 'workbench.panel.terminal') ?? [];

		assert.deepStrictEqual({
			defaultActionsPreserved: {
				separator: initialActions[0] === separator,
				resetLocation: initialActions[2] === resetLocationAction,
			},
			submenu: {
				id: initialSubmenu.id,
				label: initialSubmenu.label,
				actions: initialSubmenu.actions.map(action => ({ id: action.id, label: action.label, checked: action.checked })),
			},
			centeredActions: centeredSubmenu.actions.map(action => ({ id: action.id, checked: action.checked })),
			commands,
			finalAlignment: alignment,
			phoneActionsPreserved: phoneActions === defaultActions,
		}, {
			defaultActionsPreserved: {
				separator: true,
				resetLocation: true,
			},
			submenu: {
				id: 'workbench.action.panel.align',
				label: 'Align Panel',
				actions: [
					{ id: 'workbench.action.alignPanelCenter', label: 'Center', checked: false },
					{ id: 'workbench.action.alignPanelJustify', label: 'Justify', checked: true },
				],
			},
			centeredActions: [
				{ id: 'workbench.action.alignPanelCenter', checked: true },
				{ id: 'workbench.action.alignPanelJustify', checked: false },
			],
			commands: ['workbench.action.alignPanelCenter', 'workbench.action.alignPanelJustify'],
			finalAlignment: 'justify',
			phoneActionsPreserved: true,
		});
	});

	test('keeps the panel title border override scoped to the Agents window', () => {
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add({ dispose: () => container.remove() });
		const workbench = mainWindow.document.createElement('div');
		workbench.className = 'monaco-workbench';
		container.appendChild(workbench);
		const sessions = mainWindow.document.createElement('div');
		sessions.className = 'monaco-workbench agent-sessions-workbench';
		container.appendChild(sessions);

		const workbenchTitle = createPanelTab(workbench).title;
		const sessionsTitle = createPanelTab(sessions).title;

		assert.deepStrictEqual({
			workbenchHasBorder: parseFloat(mainWindow.getComputedStyle(workbenchTitle).borderTopWidth) > 0,
			sessionsBorder: mainWindow.getComputedStyle(sessionsTitle).borderTopWidth,
		}, {
			workbenchHasBorder: true,
			sessionsBorder: '0px',
		});
	});

	test('uses the editor tab presentation for bottom panel tabs', () => {
		const root = mainWindow.document.createElement('div');
		root.className = 'monaco-workbench agent-sessions-workbench modern-ui-tabs';
		root.style.cssText = [
			'--vscode-agentsPanel-background: #112233',
			'--vscode-cornerRadius-small: 4px',
			'--vscode-cornerRadius-medium: 6px',
			'--vscode-fontSize-body1: 13px',
			'--vscode-fontWeight-regular: 400',
			'--vscode-modernEditorTab-activeBackground: #203040',
			'--vscode-spacing-size20: 2px',
			'--vscode-spacing-size40: 4px',
			'--vscode-spacing-size60: 6px',
			'--vscode-spacing-size80: 8px',
			'--vscode-spacing-size100: 10px',
			'--vscode-spacing-size240: 24px',
			'--vscode-spacing-size280: 28px',
			'--vscode-strokeThickness: 1px',
			'--modern-ui-editor-tab-border: transparent',
			'--modern-ui-connected-tab-strip-background: #445566',
			'--modern-ui-editor-tab-active-background: #203040',
			'--modern-ui-editor-tab-active-foreground: #abcdef',
		].join(';');
		mainWindow.document.body.appendChild(root);
		disposables.add({ dispose: () => root.remove() });
		const { panel, title, actionItem, actionLabel, badge, indicator, secondActionItem, secondIndicator, titleActions, titleActionItem } = createPanelTab(root);
		const targetWindow = mainWindow;
		const getTitleActionLayout = () => {
			const titleRect = title.getBoundingClientRect();
			const actionItemRect = titleActionItem.getBoundingClientRect();
			return {
				height: titleActions.getBoundingClientRect().height,
				centerOffset: actionItemRect.top + actionItemRect.height / 2 - (titleRect.top + titleRect.height / 2),
			};
		};

		const pill = {
			titleHeight: title.getBoundingClientRect().height,
			titleActions: getTitleActionLayout(),
			background: targetWindow.getComputedStyle(indicator).backgroundColor,
			foreground: targetWindow.getComputedStyle(actionLabel).color,
			itemPadding: targetWindow.getComputedStyle(actionItem).padding,
			top: targetWindow.getComputedStyle(indicator).top,
			right: targetWindow.getComputedStyle(indicator).right,
			bottom: targetWindow.getComputedStyle(indicator).bottom,
			left: targetWindow.getComputedStyle(indicator).left,
			boxHeight: indicator.getBoundingClientRect().height,
			radius: targetWindow.getComputedStyle(indicator).borderRadius,
		};

		root.classList.add('modern-ui-connected-editor-tabs');
		const connected = {
			titleHeight: title.getBoundingClientRect().height,
			titleBackground: targetWindow.getComputedStyle(title).backgroundColor,
			background: targetWindow.getComputedStyle(indicator).backgroundColor,
			foreground: targetWindow.getComputedStyle(actionLabel).color,
			labelZIndex: targetWindow.getComputedStyle(actionLabel).zIndex,
			badgeDisplay: targetWindow.getComputedStyle(badge).display,
			badgeZIndex: targetWindow.getComputedStyle(badge).zIndex,
			badgeText: badge.textContent,
			top: targetWindow.getComputedStyle(indicator).top,
			bottom: targetWindow.getComputedStyle(indicator).bottom,
			borderTopColor: targetWindow.getComputedStyle(indicator).borderTopColor,
			borderBottomWidth: targetWindow.getComputedStyle(indicator).borderBottomWidth,
			radius: targetWindow.getComputedStyle(indicator).borderRadius,
			leftShoulder: targetWindow.getComputedStyle(indicator, '::before').content,
			rightShoulder: targetWindow.getComputedStyle(indicator, '::after').content,
			firstTabOmitsLeftShoulder: actionItem === actionItem.parentElement?.firstElementChild,
		};

		actionItem.classList.remove('checked');
		secondActionItem.classList.add('checked');
		const nonFirstConnected = {
			leftShoulder: targetWindow.getComputedStyle(secondIndicator, '::before').content,
			leftShoulderBorderBottomColor: targetWindow.getComputedStyle(secondIndicator, '::before').borderBottomColor,
			leftShoulderBorderBottomWidth: targetWindow.getComputedStyle(secondIndicator, '::before').borderBottomWidth,
		};
		secondActionItem.classList.remove('checked');
		actionItem.classList.add('checked');

		title.style.height = '28px';
		const compact = {
			titleHeight: title.getBoundingClientRect().height,
			itemHeight: actionItem.getBoundingClientRect().height,
			titleActions: getTitleActionLayout(),
		};

		panel.classList.remove('panel-labels');
		title.style.removeProperty('height');
		actionItem.classList.add('icon');
		const iconMode = {
			titleHeight: title.getBoundingClientRect().height,
			titleActions: getTitleActionLayout(),
			titleBackground: targetWindow.getComputedStyle(title).backgroundColor,
			itemPadding: targetWindow.getComputedStyle(actionItem).padding,
			indicatorTop: targetWindow.getComputedStyle(indicator).top,
			indicatorBottom: targetWindow.getComputedStyle(indicator).bottom,
			indicatorHeight: targetWindow.getComputedStyle(indicator).height,
			indicatorRadius: targetWindow.getComputedStyle(indicator).borderRadius,
		};

		root.classList.remove('agent-sessions-workbench');
		const workbenchBorderTopWidth = targetWindow.getComputedStyle(title).borderTopWidth;

		assert.deepStrictEqual({ pill, connected, nonFirstConnected, compact, iconMode, workbenchBorderTopWidth }, {
			pill: {
				titleHeight: 32,
				titleActions: {
					height: 32,
					centerOffset: 0,
				},
				background: 'rgb(32, 48, 64)',
				foreground: 'rgb(171, 205, 239)',
				itemPadding: '0px 8px',
				top: '0px',
				right: '2px',
				bottom: '0px',
				left: '2px',
				boxHeight: 32,
				radius: '4px',
			},
			connected: {
				titleHeight: 32,
				titleBackground: 'rgb(68, 85, 102)',
				background: 'rgb(17, 34, 51)',
				foreground: 'rgb(171, 205, 239)',
				labelZIndex: '2',
				badgeDisplay: 'flex',
				badgeZIndex: '2',
				badgeText: '1',
				top: '-1px',
				bottom: '-1px',
				borderTopColor: 'rgb(52, 86, 120)',
				borderBottomWidth: '0px',
				radius: '7px 7px 0px 0px',
				leftShoulder: 'none',
				rightShoulder: '""',
				firstTabOmitsLeftShoulder: true,
			},
			nonFirstConnected: {
				leftShoulder: '""',
				leftShoulderBorderBottomColor: 'rgb(52, 86, 120)',
				leftShoulderBorderBottomWidth: '1px',
			},
			compact: {
				titleHeight: 28,
				itemHeight: 28,
				titleActions: {
					height: 28,
					centerOffset: 0,
				},
			},
			iconMode: {
				titleHeight: 35,
				titleActions: {
					height: 35,
					centerOffset: 0,
				},
				titleBackground: 'rgb(17, 34, 51)',
				itemPadding: '0px 6px',
				indicatorTop: '13.5px',
				indicatorBottom: '-10.5px',
				indicatorHeight: '24px',
				indicatorRadius: '4px',
			},
			workbenchBorderTopWidth: '1px',
		});
	});
});
