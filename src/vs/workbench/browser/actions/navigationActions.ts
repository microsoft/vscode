/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { IEditorGroupsService, GroupDirection, GroupLocation, IFindGroupScope } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IWorkbenchLayoutService, Parts, Position as PartPosition } from 'vs/workbench/services/layout/browser/layoutService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';

abstract class BaseNavigationAction extends Action {

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IPanelService protected panelService: IPanelService,
		@IWorkbenchLayoutService protected layoutService: IWorkbenchLayoutService,
		@IViewletService protected viewletService: IViewletService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const isEditorFocus = this.layoutService.hasFocus(Parts.EDITOR_PART);
		const isPanelFocus = this.layoutService.hasFocus(Parts.PANEL_PART);
		const isSidebarFocus = this.layoutService.hasFocus(Parts.SIDEBAR_PART);

		const isSidebarPositionLeft = this.layoutService.getSideBarPosition() === PartPosition.LEFT;
		const isPanelPositionDown = this.layoutService.getPanelPosition() === PartPosition.BOTTOM;

		if (isEditorFocus) {
			return this.navigateOnEditorFocus(isSidebarPositionLeft, isPanelPositionDown);
		}

		if (isPanelFocus) {
			return this.navigateOnPanelFocus(isSidebarPositionLeft, isPanelPositionDown);
		}

		if (isSidebarFocus) {
			return Promise.resolve(this.navigateOnSidebarFocus(isSidebarPositionLeft, isPanelPositionDown));
		}

		return Promise.resolve(false);
	}

	protected navigateOnEditorFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IViewlet | IPanel> {
		return Promise.resolve(true);
	}

	protected navigateOnPanelFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IPanel> {
		return Promise.resolve(true);
	}

	protected navigateOnSidebarFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): boolean | IViewlet {
		return true;
	}

	protected navigateToPanel(): IPanel | boolean {
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			return false;
		}

		const activePanelId = this.panelService.getActivePanel()!.getId();

		return this.panelService.openPanel(activePanelId, true)!;
	}

	protected async navigateToSidebar(): Promise<IViewlet | boolean> {
		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return Promise.resolve(false);
		}

		const activeViewlet = this.viewletService.getActiveViewlet();
		if (!activeViewlet) {
			return Promise.resolve(false);
		}
		const activeViewletId = activeViewlet.getId();

		const value = await this.viewletService.openViewlet(activeViewletId, true);
		return value === null ? false : value;
	}

	protected navigateAcrossEditorGroup(direction: GroupDirection): boolean {
		return this.doNavigateToEditorGroup({ direction });
	}

	protected navigateToEditorGroup(location: GroupLocation): boolean {
		return this.doNavigateToEditorGroup({ location });
	}

	private doNavigateToEditorGroup(scope: IFindGroupScope): boolean {
		const targetGroup = this.editorGroupService.findGroup(scope, this.editorGroupService.activeGroup);
		if (targetGroup) {
			targetGroup.focus();

			return true;
		}

		return false;
	}
}

class NavigateLeftAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateLeft';
	static readonly LABEL = nls.localize('navigateLeft', "Navigate to the View on the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, layoutService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IViewlet> {
		const didNavigate = this.navigateAcrossEditorGroup(GroupDirection.LEFT);
		if (didNavigate) {
			return Promise.resolve(true);
		}

		if (isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return Promise.resolve(false);
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean | IViewlet> {
		if (isPanelPositionDown && isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		if (!isPanelPositionDown) {
			return Promise.resolve(this.navigateToEditorGroup(GroupLocation.LAST));
		}

		return Promise.resolve(false);
	}

	protected navigateOnSidebarFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): boolean {
		if (!isSidebarPositionLeft) {
			return this.navigateToEditorGroup(GroupLocation.LAST);
		}

		return false;
	}
}

class NavigateRightAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateRight';
	static readonly LABEL = nls.localize('navigateRight', "Navigate to the View on the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, layoutService, viewletService);
	}

	protected navigateOnEditorFocus(isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean | IViewlet | IPanel> {
		const didNavigate = this.navigateAcrossEditorGroup(GroupDirection.RIGHT);
		if (didNavigate) {
			return Promise.resolve(true);
		}

		if (!isPanelPositionDown) {
			return Promise.resolve(this.navigateToPanel());
		}

		if (!isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return Promise.resolve(false);
	}

	protected navigateOnPanelFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean | IViewlet> {
		if (!isSidebarPositionLeft) {
			return this.navigateToSidebar();
		}

		return Promise.resolve(false);
	}

	protected navigateOnSidebarFocus(isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): boolean {
		if (isSidebarPositionLeft) {
			return this.navigateToEditorGroup(GroupLocation.FIRST);
		}

		return false;
	}
}

class NavigateUpAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateUp';
	static readonly LABEL = nls.localize('navigateUp', "Navigate to the View Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, layoutService, viewletService);
	}

	protected navigateOnEditorFocus(_isSidebarPositionLeft: boolean, _isPanelPositionDown: boolean): Promise<boolean> {
		return Promise.resolve(this.navigateAcrossEditorGroup(GroupDirection.UP));
	}

	protected navigateOnPanelFocus(_isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean> {
		if (isPanelPositionDown) {
			return Promise.resolve(this.navigateToEditorGroup(GroupLocation.LAST));
		}

		return Promise.resolve(false);
	}
}

class NavigateDownAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateDown';
	static readonly LABEL = nls.localize('navigateDown', "Navigate to the View Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, layoutService, viewletService);
	}

	protected navigateOnEditorFocus(_isSidebarPositionLeft: boolean, isPanelPositionDown: boolean): Promise<boolean | IPanel> {
		const didNavigate = this.navigateAcrossEditorGroup(GroupDirection.DOWN);
		if (didNavigate) {
			return Promise.resolve(true);
		}

		if (isPanelPositionDown) {
			return Promise.resolve(this.navigateToPanel());
		}

		return Promise.resolve(false);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
const viewCategory = nls.localize('view', "View");

registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateUpAction, NavigateUpAction.ID, NavigateUpAction.LABEL, undefined), 'View: Navigate to the View Above', viewCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateDownAction, NavigateDownAction.ID, NavigateDownAction.LABEL, undefined), 'View: Navigate to the View Below', viewCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateLeftAction, NavigateLeftAction.ID, NavigateLeftAction.LABEL, undefined), 'View: Navigate to the View on the Left', viewCategory);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateRightAction, NavigateRightAction.ID, NavigateRightAction.LABEL, undefined), 'View: Navigate to the View on the Right', viewCategory);
