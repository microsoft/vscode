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
import { Part } from '../../../../workbench/browser/part.js';
import { IPaneCompositeBarOptions } from '../../../../workbench/browser/parts/paneCompositeBar.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts, Position } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ViewDescriptorService } from '../../../../workbench/services/views/browser/viewDescriptorService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../../../workbench/test/browser/workbenchTestServices.js';
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
});
