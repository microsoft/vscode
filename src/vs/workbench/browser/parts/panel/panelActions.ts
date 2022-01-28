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
import { PanelAlignmentContext, PanelMaximizedContext, PanelPositionContext, PanelVisibleContext } from 'vs/workbench/common/contextkeys';
import { ContextKeyExpr, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ViewContainerLocationToString, ViewContainerLocation, IViewDescriptorService, IViewsService } from 'vs/workbench/common/views';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { INotificationService } from 'vs/platform/notification/common/notification';

const maximizeIcon = registerIcon('panel-maximize', Codicon.chevronUp, localize('maximizeIcon', 'Icon to maximize a panel.'));
const restoreIcon = registerIcon('panel-restore', Codicon.chevronDown, localize('restoreIcon', 'Icon to restore a panel.'));
const closeIcon = registerIcon('panel-close', Codicon.close, localize('closeIcon', 'Icon to close a panel.'));

export class TogglePanelAction extends Action {

	static readonly ID = 'workbench.action.togglePanel';
	static readonly LABEL = localize('togglePanel', "Toggle Panel");

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
		let panel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
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
	alias: string;
	label: string;
	shortLabel: string;
	value: T;
}

function createPanelActionConfig<T>(id: string, alias: string, label: string, shortLabel: string, value: T, when: ContextKeyExpression): PanelActionConfig<T> {
	return {
		id,
		alias,
		label,
		shortLabel,
		value,
		when,
	};
}

function createPositionPanelActionConfig(id: string, alias: string, label: string, shortLabel: string, position: Position): PanelActionConfig<Position> {
	return createPanelActionConfig<Position>(id, alias, label, shortLabel, position, PanelPositionContext.notEqualsTo(positionToString(position)));
}

function createAlignmentPanelActionConfig(id: string, alias: string, label: string, shortLabel: string, alignment: PanelAlignment): PanelActionConfig<PanelAlignment> {
	return createPanelActionConfig<PanelAlignment>(id, alias, label, shortLabel, alignment, PanelAlignmentContext.notEqualsTo(alignment));
}


export const PositionPanelActionConfigs: PanelActionConfig<Position>[] = [
	createPositionPanelActionConfig(PositionPanelActionId.LEFT, 'View: Move Panel Left', localize('positionPanelLeft', 'Move Panel Left'), localize('positionPanelLeftShort', "Left"), Position.LEFT),
	createPositionPanelActionConfig(PositionPanelActionId.RIGHT, 'View: Move Panel Right', localize('positionPanelRight', 'Move Panel Right'), localize('positionPanelRightShort', "Right"), Position.RIGHT),
	createPositionPanelActionConfig(PositionPanelActionId.BOTTOM, 'View: Move Panel To Bottom', localize('positionPanelBottom', 'Move Panel To Bottom'), localize('positionPanelBottomShort', "Bottom"), Position.BOTTOM),
];


export const AlignPanelActionConfigs: PanelActionConfig<PanelAlignment>[] = [
	createAlignmentPanelActionConfig(AlignPanelActionId.LEFT, 'View: Set Panel Alignment to Left', localize('alignPanelLeft', 'Set Panel Alignment to Left'), localize('alignPanelLeftShort', "Left"), 'left'),
	createAlignmentPanelActionConfig(AlignPanelActionId.RIGHT, 'View: Set Panel Alignment to Right', localize('alignPanelRight', 'Set Panel Alignment to Right'), localize('alignPanelRightShort', "Right"), 'right'),
	createAlignmentPanelActionConfig(AlignPanelActionId.CENTER, 'View: Set Panel Alignment to Center', localize('alignPanelCenter', 'Set Panel Alignment to Center'), localize('alignPanelCenterShort', "Center"), 'center'),
	createAlignmentPanelActionConfig(AlignPanelActionId.JUSTIFY, 'View: Set Panel Alignment to Justify', localize('alignPanelJustify', 'Set Panel Alignment to Justify'), localize('alignPanelJustifyShort', "Justify"), 'justify'),
];

const alignmentByActionId = new Map(AlignPanelActionConfigs.map(config => [config.id, config.value]));

PositionPanelActionConfigs.forEach(positionPanelAction => {
	const { id, label } = positionPanelAction;

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title: label,
				category: CATEGORIES.View,
				f1: true
			});
		}
		run(accessor: ServicesAccessor): void {
			const notificationService = accessor.get(INotificationService);
			const commandService = accessor.get(ICommandService);

			notificationService.warn(localize('deprecatedPanelMoveMessage', "Moving the panel with this command has been deprecated in favor of the \"Move Views From Panel To Side Panel\" and \"Move Views From Side Panel To Panel\" commands."));
			if (positionPanelAction.value === Position.BOTTOM) {
				commandService.executeCommand('workbench.action.moveSidePanelToPanel');
			} else {
				commandService.executeCommand('workbench.action.movePanelToSidePanel');
			}
		}
	});
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	submenu: MenuId.MenubarPanelAlignmentMenu,
	title: localize('alignPanel', "Align Panel"),
	group: '3_workbench_layout_move',
	order: 5
});

AlignPanelActionConfigs.forEach(alignPanelAction => {
	const { id, label, shortLabel, value, when } = alignPanelAction;
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title: label,
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

export class SetPanelAlignmentAction extends Action {
	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const alignment = alignmentByActionId.get(this.id);
		this.layoutService.setPanelAlignment(alignment === undefined ? 'center' : alignment);
	}
}

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
actionRegistry.registerWorkbenchAction(SyncActionDescriptor.from(TogglePanelAction, { primary: KeyMod.CtrlCmd | KeyCode.KeyJ }), 'View: Toggle Panel', CATEGORIES.View.value);
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
			precondition: PanelAlignmentContext.isEqualTo('center'),
			toggled: { condition: PanelMaximizedContext, icon: restoreIcon, tooltip: localize('minimizePanel', "Restore Panel Size") },
			menu: [{
				id: MenuId.PanelTitle,
				group: 'navigation',
				order: 1,
				// the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
				when: PanelAlignmentContext.isEqualTo('center')
			}]
		});
	}
	run(accessor: ServicesAccessor) {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const notificationService = accessor.get(INotificationService);
		if (layoutService.getPanelAlignment() !== 'center') {
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
		id: MenuId.LayoutControlMenu,
		item: {
			group: '0_workbench_layout',
			command: {
				id: TogglePanelAction.ID,
				title: localize({ key: 'miShowPanel', comment: ['&& denotes a mnemonic'] }, "Show &&Panel"),
				toggled: PanelVisibleContext
			},
			order: 4
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

// --- Move Panel Views To Side Panel

export class MovePanelToSidePanelAction extends MoveViewsBetweenPanelsAction {
	static readonly ID = 'workbench.action.movePanelToSidePanel';
	constructor() {
		super(ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar, {
			id: MovePanelToSidePanelAction.ID,
			title: {
				value: localize('movePanelToSidePanel', "Move Views From Panel To Side Panel"),
				original: 'Move Views From Panel To Side Panel'
			},
			category: CATEGORIES.View,
			f1: true,
			menu: [{
				id: MenuId.ViewContainerTitleContext,
				group: '3_workbench_layout_move',
				order: 0,
				when: ContextKeyExpr.equals('viewContainerLocation', ViewContainerLocationToString(ViewContainerLocation.Panel)),
			}]
		});
	}
}

registerAction2(MovePanelToSidePanelAction);

// --- Move Panel Views To Side Panel

export class MoveSidePanelToPanelAction extends MoveViewsBetweenPanelsAction {
	static readonly ID = 'workbench.action.moveSidePanelToPanel';

	constructor() {
		super(ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel, {
			id: MoveSidePanelToPanelAction.ID,
			title: {
				value: localize('moveSidePanelToPanel', "Move Views From Side Panel To Panel"),
				original: 'Move Views From Side Panel To Panel'
			},
			category: CATEGORIES.View,
			f1: true
		});
	}
}
registerAction2(MoveSidePanelToPanelAction);
