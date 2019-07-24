/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import * as nls from 'vs/nls';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Action } from 'vs/base/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/actions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchLayoutService, Parts, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { ActivityAction } from 'vs/workbench/browser/parts/compositeBarActions';
import { IActivity } from 'vs/workbench/common/activity';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ActivePanelContext, PanelPositionContext } from 'vs/workbench/common/panel';

export class ClosePanelAction extends Action {

	static readonly ID = 'workbench.action.closePanel';
	static LABEL = nls.localize('closePanel', "Close Panel");

	constructor(
		id: string,
		name: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, name, 'hide-panel-action');
	}

	run(): Promise<any> {
		this.layoutService.setPanelHidden(true);
		return Promise.resolve();
	}
}

export class TogglePanelAction extends Action {

	static readonly ID = 'workbench.action.togglePanel';
	static LABEL = nls.localize('togglePanel', "Toggle Panel");

	constructor(
		id: string,
		name: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, name, layoutService.isVisible(Parts.PANEL_PART) ? 'panel expanded' : 'panel');
	}

	run(): Promise<any> {
		this.layoutService.setPanelHidden(this.layoutService.isVisible(Parts.PANEL_PART));
		return Promise.resolve();
	}
}

class FocusPanelAction extends Action {

	static readonly ID = 'workbench.action.focusPanel';
	static readonly LABEL = nls.localize('focusPanel', "Focus into Panel");

	constructor(
		id: string,
		label: string,
		@IPanelService private readonly panelService: IPanelService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(id, label);
	}

	run(): Promise<any> {

		// Show panel
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			this.layoutService.setPanelHidden(false);
			return Promise.resolve();
		}

		// Focus into active panel
		let panel = this.panelService.getActivePanel();
		if (panel) {
			panel.focus();
		}

		return Promise.resolve();
	}
}

export class TogglePanelPositionAction extends Action {

	static readonly ID = 'workbench.action.togglePanelPosition';
	static readonly LABEL = nls.localize('toggledPanelPosition', "Toggle Panel Position");

	static readonly MOVE_TO_RIGHT_LABEL = nls.localize('moveToRight', "Move Panel Right");
	static readonly MOVE_TO_BOTTOM_LABEL = nls.localize('moveToBottom', "Move Panel to Bottom");

	private readonly toDispose = this._register(new DisposableStore());

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService
	) {
		super(id, label, layoutService.getPanelPosition() === Position.RIGHT ? 'move-panel-to-bottom' : 'move-panel-to-right');

		const setClassAndLabel = () => {
			const positionRight = this.layoutService.getPanelPosition() === Position.RIGHT;
			this.class = positionRight ? 'move-panel-to-bottom' : 'move-panel-to-right';
			this.label = positionRight ? TogglePanelPositionAction.MOVE_TO_BOTTOM_LABEL : TogglePanelPositionAction.MOVE_TO_RIGHT_LABEL;
		};

		this.toDispose.add(editorGroupsService.onDidLayout(() => setClassAndLabel()));

		setClassAndLabel();
	}

	run(): Promise<any> {
		const position = this.layoutService.getPanelPosition();

		this.layoutService.setPanelPosition(position === Position.BOTTOM ? Position.RIGHT : Position.BOTTOM);
		return Promise.resolve();
	}
}

export class ToggleMaximizedPanelAction extends Action {

	static readonly ID = 'workbench.action.toggleMaximizedPanel';
	static readonly LABEL = nls.localize('toggleMaximizedPanel', "Toggle Maximized Panel");

	private static readonly MAXIMIZE_LABEL = nls.localize('maximizePanel', "Maximize Panel Size");
	private static readonly RESTORE_LABEL = nls.localize('minimizePanel', "Restore Panel Size");

	private readonly toDispose = this._register(new DisposableStore());

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService
	) {
		super(id, label, layoutService.isPanelMaximized() ? 'minimize-panel-action' : 'maximize-panel-action');

		this.toDispose.add(editorGroupsService.onDidLayout(() => {
			const maximized = this.layoutService.isPanelMaximized();
			this.class = maximized ? 'minimize-panel-action' : 'maximize-panel-action';
			this.label = maximized ? ToggleMaximizedPanelAction.RESTORE_LABEL : ToggleMaximizedPanelAction.MAXIMIZE_LABEL;
		}));
	}

	run(): Promise<any> {
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			this.layoutService.setPanelHidden(false);
		}

		this.layoutService.toggleMaximizedPanel();
		return Promise.resolve();
	}
}

export class PanelActivityAction extends ActivityAction {

	constructor(
		activity: IActivity,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(activity);
	}

	run(event: any): Promise<any> {
		this.panelService.openPanel(this.activity.id, true);
		this.activate();
		return Promise.resolve();
	}
}

export class SwitchPanelViewAction extends Action {

	constructor(
		id: string,
		name: string,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, name);
	}

	run(offset: number): Promise<any> {
		const pinnedPanels = this.panelService.getPinnedPanels();
		const activePanel = this.panelService.getActivePanel();
		if (!activePanel) {
			return Promise.resolve();
		}
		let targetPanelId: string | undefined;
		for (let i = 0; i < pinnedPanels.length; i++) {
			if (pinnedPanels[i].id === activePanel.getId()) {
				targetPanelId = pinnedPanels[(i + pinnedPanels.length + offset) % pinnedPanels.length].id;
				break;
			}
		}
		if (typeof targetPanelId === 'string') {
			this.panelService.openPanel(targetPanelId, true);
		}
		return Promise.resolve();
	}
}

export class PreviousPanelViewAction extends SwitchPanelViewAction {

	static readonly ID = 'workbench.action.previousPanelView';
	static LABEL = nls.localize('previousPanelView', 'Previous Panel View');

	constructor(
		id: string,
		name: string,
		@IPanelService panelService: IPanelService
	) {
		super(id, name, panelService);
	}

	run(): Promise<any> {
		return super.run(-1);
	}
}

export class NextPanelViewAction extends SwitchPanelViewAction {

	static readonly ID = 'workbench.action.nextPanelView';
	static LABEL = nls.localize('nextPanelView', 'Next Panel View');

	constructor(
		id: string,
		name: string,
		@IPanelService panelService: IPanelService
	) {
		super(id, name, panelService);
	}

	run(): Promise<any> {
		return super.run(1);
	}
}

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(TogglePanelAction, TogglePanelAction.ID, TogglePanelAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_J }), 'View: Toggle Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(FocusPanelAction, FocusPanelAction.ID, FocusPanelAction.LABEL), 'View: Focus into Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMaximizedPanelAction, ToggleMaximizedPanelAction.ID, ToggleMaximizedPanelAction.LABEL), 'View: Toggle Maximized Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL), 'View: Close Panel', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(TogglePanelPositionAction, TogglePanelPositionAction.ID, TogglePanelPositionAction.LABEL), 'View: Toggle Panel Position', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleMaximizedPanelAction, ToggleMaximizedPanelAction.ID, undefined), 'View: Toggle Panel Position', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(PreviousPanelViewAction, PreviousPanelViewAction.ID, PreviousPanelViewAction.LABEL), 'View: Previous Panel View', nls.localize('view', "View"));
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(NextPanelViewAction, NextPanelViewAction.ID, NextPanelViewAction.LABEL), 'View: Next Panel View', nls.localize('view', "View"));

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '2_workbench_layout',
	command: {
		id: TogglePanelAction.ID,
		title: nls.localize({ key: 'miShowPanel', comment: ['&& denotes a mnemonic'] }, "Show &&Panel"),
		toggled: ActivePanelContext
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '3_workbench_layout_move',
	command: {
		id: TogglePanelPositionAction.ID,
		title: TogglePanelPositionAction.MOVE_TO_RIGHT_LABEL
	},
	when: PanelPositionContext.isEqualTo('bottom'),
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
	group: '3_workbench_layout_move',
	command: {
		id: TogglePanelPositionAction.ID,
		title: TogglePanelPositionAction.MOVE_TO_BOTTOM_LABEL
	},
	when: PanelPositionContext.isEqualTo('right'),
	order: 5
});
