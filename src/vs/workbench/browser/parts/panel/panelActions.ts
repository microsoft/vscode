/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import { localize } from 'vs/nls';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Action } from 'vs/base/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor, MenuId, MenuRegistry, registerAction2, Action2, IAction2Options } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchExtensions, CATEGORIES } from 'vs/workbench/common/actions';
import { IWorkbenchLayoutService, PanelAlignment, Parts, Position, positionToString } from 'vs/workbench/services/layout/browser/layoutService';
import { ActivityAction, ToggleCompositePinnedAction, ICompositeBar } from 'vs/workbench/browser/parts/compositeBarActions';
import { IActivity } from 'vs/workbench/common/activity';
import { AuxiliaryBarVisibleContext, PanelAlignmentContext, PanelMaximizedContext, PanelPositionContext, PanelVisibleContext } from 'vs/workbench/common/contextkeys';
import { ContextKeyExpr, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ViewContainerLocationToString, ViewContainerLocation, IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ICommandActionTitle } from 'vs/platform/action/common/action';

const maximizeIcon = registerIcon('panel-maximize', Codicon.chevronUp, localize('maximizeIcon', 'Icon to maximize a panel.'));
const restoreIcon = registerIcon('panel-restore', Codicon.chevronDown, localize('restoreIcon', 'Icon to restore a panel.'));
const closeIcon = registerIcon('panel-close', Codicon.close, localize('closeIcon', 'Icon to close a panel.'));
const panelIcon = registerIcon('panel-layout-icon', Codicon.layoutPanel, localize('togglePanelOffIcon', 'Icon to toggle the panel off when it is on.'));
const panelOffIcon = registerIcon('panel-layout-icon-off', Codicon.layoutPanelOff, localize('togglePanelOnIcon', 'Icon to toggle the panel on when it is off.'));

export class TogglePanelAction extends Action {

	static readonly ID = 'workbench.action.togglePanel';
	static readonly LABEL = localize('togglePanelVisibility', "Toggle Panel Visibility");

	constructor(
		id: string,
		name: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, name, layoutService.isVisible(Parts.PANEL_PART) ? 'panel expanded' : 'panel');
	}

	override async run(): Promise<void> {
		this.layoutService.setPartHidden(this.layoutService.isVisible(Parts.PANEL_PART), Parts.PANEL_PART);
	}
}

class FocusPanelAction extends Action {

	static readonly ID = 'workbench.action.focusPanel';
	static readonly LABEL = localize('focusPanel', "Focus into Panel");

	constructor(
		id: string,
		label: string,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {

		// Show panel
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			this.layoutService.setPartHidden(false, Parts.PANEL_PART);
		}

		// Focus into active panel
		const panel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
		if (panel) {
			panel.focus();
		}
	}
}

const PositionPanelActionId = {
	LEFT: 'workbench.action.positionPanelLeft',
	RIGHT: 'workbench.action.positionPanelRight',
	BOTTOM: 'workbench.action.positionPanelBottom',
};

const AlignPanelActionId = {
	LEFT: 'workbench.action.alignPanelLeft',
	RIGHT: 'workbench.action.alignPanelRight',
	CENTER: 'workbench.action.alignPanelCenter',
	JUSTIFY: 'workbench.action.alignPanelJustify',
};

interface PanelActionConfig<T> {
	id: string;
	when: ContextKeyExpression;
	title: ICommandActionTitle;
	shortLabel: string;
	value: T;
}

function createPanelActionConfig<T>(id: string, title: ICommandActionTitle, shortLabel: string, value: T, when: ContextKeyExpression): PanelActionConfig<T> {
	return {
		id,
		title,
		shortLabel,
		value,
		when,
	};
}

function createPositionPanelActionConfig(id: string, title: ICommandActionTitle, shortLabel: string, position: Position): PanelActionConfig<Position> {
	return createPanelActionConfig<Position>(id, title, shortLabel, position, PanelPositionContext.notEqualsTo(positionToString(position)));
}

function createAlignmentPanelActionConfig(id: string, title: ICommandActionTitle, shortLabel: string, alignment: PanelAlignment): PanelActionConfig<PanelAlignment> {
	return createPanelActionConfig<PanelAlignment>(id, title, shortLabel, alignment, PanelAlignmentContext.notEqualsTo(alignment));
}


export const PositionPanelActionConfigs: PanelActionConfig<Position>[] = [
	createPositionPanelActionConfig(PositionPanelActionId.LEFT, { value: localize('positionPanelLeft', 'Move Panel Left'), original: 'Move Panel Left' }, localize('positionPanelLeftShort', "Left"), Position.LEFT),
	createPositionPanelActionConfig(PositionPanelActionId.RIGHT, { value: localize('positionPanelRight', 'Move Panel Right'), original: 'Move Panel Right' }, localize('positionPanelRightShort', "Right"), Position.RIGHT),
	createPositionPanelActionConfig(PositionPanelActionId.BOTTOM, { value: localize('positionPanelBottom', 'Move Panel To Bottom'), original: 'Move Panel To Bottom' }, localize('positionPanelBottomShort', "Bottom"), Position.BOTTOM),
];


const AlignPanelActionConfigs: PanelActionConfig<PanelAlignment>[] = [
	createAlignmentPanelActionConfig(AlignPanelActionId.LEFT, { value: localize('alignPanelLeft', 'Set Panel Alignment to Left'), original: 'Set Panel Alignment to Left' }, localize('alignPanelLeftShort', "Left"), 'left'),
	createAlignmentPanelActionConfig(AlignPanelActionId.RIGHT, { value: localize('alignPanelRight', 'Set Panel Alignment to Right'), original: 'Set Panel Alignment to Right' }, localize('alignPanelRightShort', "Right"), 'right'),
	createAlignmentPanelActionConfig(AlignPanelActionId.CENTER, { value: localize('alignPanelCenter', 'Set Panel Alignment to Center'), original: 'Set Panel Alignment to Center' }, localize('alignPanelCenterShort', "Center"), 'center'),
	createAlignmentPanelActionConfig(AlignPanelActionId.JUSTIFY, { value: localize('alignPanelJustify', 'Set Panel Alignment to Justify'), original: 'Set Panel Alignment to Justify' }, localize('alignPanelJustifyShort', "Justify"), 'justify'),
];

const positionByActionId = new Map(PositionPanelActionConfigs.map(config => [config.id, config.value]));
export class SetPanelPositionAction extends Action {
	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const position = positionByActionId.get(this.id);
		this.layoutService.setPanelPosition(position === undefined ? Position.BOTTOM : position);
	}
}

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.MenubarPanelPositionMenu,
	title: localize('positionPanel', "Panel Position"),
	group: '3_workbench_layout_move',
	order: 4
});

PositionPanelActionConfigs.forEach(positionPanelAction => {
	const { id, title, shortLabel, value, when } = positionPanelAction;

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title,
				category: CATEGORIES.View,
				f1: true
			});
		}
		run(accessor: ServicesAccessor): void {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.setPanelPosition(value === undefined ? Position.BOTTOM : value);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPanelPositionMenu, {
		command: {
			id,
			title: shortLabel,
			toggled: when.negate()
		},
		order: 5
	});
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.MenubarPanelAlignmentMenu,
	title: localize('alignPanel', "Align Panel"),
	group: '3_workbench_layout_move',
	order: 5
});

AlignPanelActionConfigs.forEach(alignPanelAction => {
	const { id, title, shortLabel, value, when } = alignPanelAction;
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title: title,
				category: CATEGORIES.View,
				toggled: when.negate(),
				f1: true
			});
		}
		run(accessor: ServicesAccessor): void {
			const layoutService = accessor.get(IWorkbenchLayoutService);
			layoutService.setPanelAlignment(value === undefined ? 'center' : value);
		}
	});

	MenuRegistry.appendMenuItem(MenuId.MenubarPanelAlignmentMenu, {
		command: {
			id,
			title: shortLabel,
			toggled: when.negate()
		},
		order: 5
	});
});

export class PanelActivityAction extends ActivityAction {

	constructor(
		activity: IActivity,
		private readonly viewContainerLocation: ViewContainerLocation,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService
	) {
		super(activity);
	}

	override async run(): Promise<void> {
		await this.paneCompositeService.openPaneComposite(this.activity.id, this.viewContainerLocation, true);
		this.activate();
	}

	setActivity(activity: IActivity): void {
		this.activity = activity;
	}
}

export class PlaceHolderPanelActivityAction extends PanelActivityAction {

	constructor(
		id: string,
		viewContainerLocation: ViewContainerLocation,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService
	) {
		super({ id, name: id }, viewContainerLocation, paneCompositeService);
	}
}

export class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {

	constructor(id: string, compositeBar: ICompositeBar) {
		super({ id, name: id, cssClass: undefined }, compositeBar);
	}

	setActivity(activity: IActivity): void {
		this.label = activity.name;
	}
}

export class SwitchPanelViewAction extends Action {

	constructor(
		id: string,
		name: string,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService
	) {
		super(id, name);
	}

	override async run(offset: number): Promise<void> {
		const pinnedPanels = this.paneCompositeService.getPinnedPaneCompositeIds(ViewContainerLocation.Panel);
		const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
		if (!activePanel) {
			return;
		}
		let targetPanelId: string | undefined;
		for (let i = 0; i < pinnedPanels.length; i++) {
			if (pinnedPanels[i] === activePanel.getId()) {
				targetPanelId = pinnedPanels[(i + pinnedPanels.length + offset) % pinnedPanels.length];
				break;
			}
		}
		if (typeof targetPanelId === 'string') {
			await this.paneCompositeService.openPaneComposite(targetPanelId, ViewContainerLocation.Panel, true);
		}
	}
}

export class PreviousPanelViewAction extends SwitchPanelViewAction {

	static readonly ID = 'workbench.action.previousPanelView';
	static readonly LABEL = localize('previousPanelView', 'Previous Panel View');

	constructor(
		id: string,
		name: string,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService
	) {
		super(id, name, paneCompositeService);
	}

	override run(): Promise<void> {
		return super.run(-1);
	}
}

export class NextPanelViewAction extends SwitchPanelViewAction {

	static readonly ID = 'workbench.action.nextPanelView';
	static readonly LABEL = localize('nextPanelView', 'Next Panel View');

	constructor(
		id: string,
		name: string,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService
	) {
		super(id, name, paneCompositeService);
	}

	override run(): Promise<void> {
		return super.run(1);
	}
}

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(TogglePanelAction, { primary: KeyMod.CtrlCmd | KeyCode.KeyJ }), 'View: Toggle Panel Visibility', CATEGORIES.View.value);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(FocusPanelAction), 'View: Focus into Panel', CATEGORIES.View.value);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(PreviousPanelViewAction), 'View: Previous Panel View', CATEGORIES.View.value);
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(NextPanelViewAction), 'View: Next Panel View', CATEGORIES.View.value);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.toggleMaximizedPanel',
			title: { value: localize('toggleMaximizedPanel', "Toggle Maximized Panel"), original: 'Toggle Maximized Panel' },
			tooltip: localize('maximizePanel', "Maximize Panel Size"),
			category: CATEGORIES.View,
			f1: true,
			icon: maximizeIcon,
			// the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
			precondition: ContextKeyExpr.or(PanelAlignmentContext.isEqualTo('center'), PanelPositionContext.notEqualsTo('bottom')),
			toggled: { condition: PanelMaximizedContext, icon: restoreIcon, tooltip: localize('minimizePanel', "Restore Panel Size") },
			menu: [{
				id: MenuId.PanelTitle,
				group: 'navigation',
				order: 1,
				// the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
				when: ContextKeyExpr.or(PanelAlignmentContext.isEqualTo('center'), PanelPositionContext.notEqualsTo('bottom'))
			}]
		});
	}
	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const notificationService = accessor.get(INotificationService);
		if (layoutService.getPanelAlignment() !== 'center' && layoutService.getPanelPosition() === Position.BOTTOM) {
			notificationService.warn(localize('panelMaxNotSupported', "Maximizing the panel is only supported when it is center aligned."));
			return;
		}

		if (!layoutService.isVisible(Parts.PANEL_PART)) {
			layoutService.setPartHidden(false, Parts.PANEL_PART);
			// If the panel is not already maximized, maximize it
			if (!layoutService.isPanelMaximized()) {
				layoutService.toggleMaximizedPanel();
			}
		}
		else {
			layoutService.toggleMaximizedPanel();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.closePanel',
			title: { value: localize('closePanel', "Close Panel"), original: 'Close Panel' },
			category: CATEGORIES.View,
			icon: closeIcon,
			menu: [{
				id: MenuId.CommandPalette,
				when: PanelVisibleContext,
			}, {
				id: MenuId.PanelTitle,
				group: 'navigation',
				order: 2
			}]
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.PANEL_PART);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.closeAuxiliaryBar',
			title: { value: localize('closeSecondarySideBar', "Close Secondary Side Bar"), original: 'Close Secondary Side Bar' },
			category: CATEGORIES.View,
			icon: closeIcon,
			menu: [{
				id: MenuId.CommandPalette,
				when: AuxiliaryBarVisibleContext,
			}, {
				id: MenuId.AuxiliaryBarTitle,
				group: 'navigation',
				order: 2
			}]
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.AUXILIARYBAR_PART);
	}
});

MenuRegistry.appendMenuItems([
	{
		id: MenuId.MenubarAppearanceMenu,
		item: {
			group: '2_workbench_layout',
			command: {
				id: TogglePanelAction.ID,
				title: localize({ key: 'miShowPanel', comment: ['&& denotes a mnemonic'] }, "Show &&Panel"),
				toggled: PanelVisibleContext
			},
			order: 5
		}
	}, {
		id: MenuId.LayoutControlMenuSubmenu,
		item: {
			group: '0_workbench_layout',
			command: {
				id: TogglePanelAction.ID,
				title: localize('miShowPanelNoMnemonic', "Show Panel"),
				toggled: PanelVisibleContext
			},
			order: 4
		}
	}, {
		id: MenuId.LayoutControlMenu,
		item: {
			group: '0_workbench_toggles',
			command: {
				id: TogglePanelAction.ID,
				title: localize('togglePanel', "Toggle Panel"),
				icon: panelOffIcon,
				toggled: { condition: PanelVisibleContext, icon: panelIcon }
			},
			when: ContextKeyExpr.or(ContextKeyExpr.equals('config.workbench.layoutControl.type', 'toggles'), ContextKeyExpr.equals('config.workbench.layoutControl.type', 'both')),
			order: 1
		}
	}, {
		id: MenuId.ViewTitleContext,
		item: {
			group: '3_workbench_layout_move',
			command: {
				id: TogglePanelAction.ID,
				title: { value: localize('hidePanel', "Hide Panel"), original: 'Hide Panel' },
			},
			when: ContextKeyExpr.and(PanelVisibleContext, ContextKeyExpr.equals('viewLocation', ViewContainerLocationToString(ViewContainerLocation.Panel))),
			order: 2
		}
	}
]);

class MoveViewsBetweenPanelsAction extends Action2 {
	constructor(private readonly source: ViewContainerLocation, private readonly destination: ViewContainerLocation, desc: Readonly<IAction2Options>) {
		super(desc);
	}

	run(accessor: ServicesAccessor, ...args: any[]): void {
		const viewDescriptorService = accessor.get(IViewDescriptorService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);

		const srcContainers = viewDescriptorService.getViewContainersByLocation(this.source);
		const destContainers = viewDescriptorService.getViewContainersByLocation(this.destination);

		if (srcContainers.length) {
			const activeViewContainer = viewsService.getVisibleViewContainer(this.source);

			srcContainers.forEach(viewContainer => viewDescriptorService.moveViewContainerToLocation(viewContainer, this.destination));
			layoutService.setPartHidden(false, this.destination === ViewContainerLocation.Panel ? Parts.PANEL_PART : Parts.AUXILIARYBAR_PART);

			if (activeViewContainer && destContainers.length === 0) {
				viewsService.openViewContainer(activeViewContainer.id, true);
			}
		}
	}
}

// --- Move Panel Views To Secondary Side Bar

class MovePanelToSidePanelAction extends MoveViewsBetweenPanelsAction {
	static readonly ID = 'workbench.action.movePanelToSidePanel';
	constructor() {
		super(ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar, {
			id: MovePanelToSidePanelAction.ID,
			title: {
				value: localize('movePanelToSecondarySideBar', "Move Panel Views To Secondary Side Bar"),
				original: 'Move Panel Views To Secondary Side Bar'
			},
			category: CATEGORIES.View,
			f1: false
		});
	}
}

export class MovePanelToSecondarySideBarAction extends MoveViewsBetweenPanelsAction {
	static readonly ID = 'workbench.action.movePanelToSecondarySideBar';
	constructor() {
		super(ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar, {
			id: MovePanelToSecondarySideBarAction.ID,
			title: {
				value: localize('movePanelToSecondarySideBar', "Move Panel Views To Secondary Side Bar"),
				original: 'Move Panel Views To Secondary Side Bar'
			},
			category: CATEGORIES.View,
			f1: true
		});
	}
}

registerAction2(MovePanelToSidePanelAction);
registerAction2(MovePanelToSecondarySideBarAction);

// --- Move Secondary Side Bar Views To Panel

class MoveSidePanelToPanelAction extends MoveViewsBetweenPanelsAction {
	static readonly ID = 'workbench.action.moveSidePanelToPanel';

	constructor() {
		super(ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel, {
			id: MoveSidePanelToPanelAction.ID,
			title: {
				value: localize('moveSidePanelToPanel', "Move Secondary Side Bar Views To Panel"),
				original: 'Move Secondary Side Bar Views To Panel'
			},
			category: CATEGORIES.View,
			f1: false
		});
	}
}

export class MoveSecondarySideBarToPanelAction extends MoveViewsBetweenPanelsAction {
	static readonly ID = 'workbench.action.moveSecondarySideBarToPanel';

	constructor() {
		super(ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel, {
			id: MoveSecondarySideBarToPanelAction.ID,
			title: {
				value: localize('moveSidePanelToPanel', "Move Secondary Side Bar Views To Panel"),
				original: 'Move Secondary Side Bar Views To Panel'
			},
			category: CATEGORIES.View,
			f1: true
		});
	}
}
registerAction2(MoveSidePanelToPanelAction);
registerAction2(MoveSecondarySideBarToPanelAction);
