/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { IEditorGroupsService, GroupDirection, GroupLocation, IFindGroupScope } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions, CATEGORIES } from 'vs/workbench/common/actions';
import { Direction } from 'vs/base/browser/ui/grid/grid';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { IComposite } from 'vs/workbench/common/composite';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';

abstract class BaseNavigationAction extends Action {

	constructor(
		id: string,
		label: string,
		protected direction: Direction,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IPaneCompositePartService protected paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService protected layoutService: IWorkbenchLayoutService,
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		const isEditorFocus = this.layoutService.hasFocus(Parts.EDITOR_PART);
		const isPanelFocus = this.layoutService.hasFocus(Parts.PANEL_PART);
		const isSidebarFocus = this.layoutService.hasFocus(Parts.SIDEBAR_PART);

		let neighborPart: Parts | undefined;
		if (isEditorFocus) {
			const didNavigate = this.navigateAcrossEditorGroup(this.toGroupDirection(this.direction));
			if (didNavigate) {
				return;
			}

			neighborPart = this.layoutService.getVisibleNeighborPart(Parts.EDITOR_PART, this.direction);
		}

		if (isPanelFocus) {
			neighborPart = this.layoutService.getVisibleNeighborPart(Parts.PANEL_PART, this.direction);
		}

		if (isSidebarFocus) {
			neighborPart = this.layoutService.getVisibleNeighborPart(Parts.SIDEBAR_PART, this.direction);
		}

		if (neighborPart === Parts.EDITOR_PART) {
			if (!this.navigateBackToEditorGroup(this.toGroupDirection(this.direction))) {
				this.navigateToEditorGroup(this.direction === Direction.Right ? GroupLocation.FIRST : GroupLocation.LAST);
			}
		} else if (neighborPart === Parts.SIDEBAR_PART) {
			this.navigateToSidebar();
		} else if (neighborPart === Parts.PANEL_PART) {
			this.navigateToPanel();
		}
	}

	private async navigateToPanel(): Promise<IComposite | boolean> {
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			return false;
		}

		const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
		if (!activePanel) {
			return false;
		}

		const activePanelId = activePanel.getId();

		const res = await this.paneCompositeService.openPaneComposite(activePanelId, ViewContainerLocation.Panel, true);
		if (!res) {
			return false;
		}

		return res;
	}

	private async navigateToSidebar(): Promise<IPaneComposite | boolean> {
		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return false;
		}

		const activeViewlet = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
		if (!activeViewlet) {
			return false;
		}
		const activeViewletId = activeViewlet.getId();

		const viewlet = await this.paneCompositeService.openPaneComposite(activeViewletId, ViewContainerLocation.Sidebar, true);
		return !!viewlet;
	}

	private navigateAcrossEditorGroup(direction: GroupDirection): boolean {
		return this.doNavigateToEditorGroup({ direction });
	}

	private navigateToEditorGroup(location: GroupLocation): boolean {
		return this.doNavigateToEditorGroup({ location });
	}

	private navigateBackToEditorGroup(direction: GroupDirection): boolean {
		if (!this.editorGroupService.activeGroup) {
			return false;
		}

		const oppositeDirection = this.toOppositeDirection(direction);

		// Check to see if there is a group in between the last active group and the direction of movement
		const groupInBetween = this.editorGroupService.findGroup({ direction: oppositeDirection }, this.editorGroupService.activeGroup);
		if (!groupInBetween) {
			// No group in between means we can return focus to the last active editor group
			this.editorGroupService.activeGroup.focus();
			return true;
		}

		return false;
	}

	private toGroupDirection(direction: Direction): GroupDirection {
		switch (direction) {
			case Direction.Down: return GroupDirection.DOWN;
			case Direction.Left: return GroupDirection.LEFT;
			case Direction.Right: return GroupDirection.RIGHT;
			case Direction.Up: return GroupDirection.UP;
		}
	}

	private toOppositeDirection(direction: GroupDirection): GroupDirection {
		switch (direction) {
			case GroupDirection.UP: return GroupDirection.DOWN;
			case GroupDirection.RIGHT: return GroupDirection.LEFT;
			case GroupDirection.LEFT: return GroupDirection.RIGHT;
			case GroupDirection.DOWN: return GroupDirection.UP;
		}
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
	static readonly LABEL = localize('navigateLeft', "Navigate to the View on the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super(id, label, Direction.Left, editorGroupService, paneCompositeService, layoutService);
	}
}

class NavigateRightAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateRight';
	static readonly LABEL = localize('navigateRight', "Navigate to the View on the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super(id, label, Direction.Right, editorGroupService, paneCompositeService, layoutService);
	}
}

class NavigateUpAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateUp';
	static readonly LABEL = localize('navigateUp', "Navigate to the View Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super(id, label, Direction.Up, editorGroupService, paneCompositeService, layoutService);
	}
}

class NavigateDownAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateDown';
	static readonly LABEL = localize('navigateDown', "Navigate to the View Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
	) {
		super(id, label, Direction.Down, editorGroupService, paneCompositeService, layoutService);
	}
}

function findVisibleNeighbour(layoutService: IWorkbenchLayoutService, part: Parts, next: boolean): Parts {
	const neighbour = part === Parts.EDITOR_PART ? (next ? Parts.PANEL_PART : Parts.SIDEBAR_PART) : part === Parts.PANEL_PART ? (next ? Parts.STATUSBAR_PART : Parts.EDITOR_PART) :
		part === Parts.STATUSBAR_PART ? (next ? Parts.ACTIVITYBAR_PART : Parts.PANEL_PART) : part === Parts.ACTIVITYBAR_PART ? (next ? Parts.SIDEBAR_PART : Parts.STATUSBAR_PART) :
			part === Parts.SIDEBAR_PART ? (next ? Parts.EDITOR_PART : Parts.ACTIVITYBAR_PART) : Parts.EDITOR_PART;
	if (layoutService.isVisible(neighbour) || neighbour === Parts.EDITOR_PART) {
		return neighbour;
	}

	return findVisibleNeighbour(layoutService, neighbour, next);
}

function focusNextOrPreviousPart(layoutService: IWorkbenchLayoutService, editorService: IEditorService, next: boolean): void {
	// Need to ask if the active editor has focus since the layoutService is not aware of some custom editor focus behavior(notebooks)
	// Also need to ask the layoutService for the case if no editor is opened
	const editorFocused = editorService.activeEditorPane?.hasFocus() || layoutService.hasFocus(Parts.EDITOR_PART);
	const currentlyFocusedPart = editorFocused ? Parts.EDITOR_PART : layoutService.hasFocus(Parts.ACTIVITYBAR_PART) ? Parts.ACTIVITYBAR_PART :
		layoutService.hasFocus(Parts.STATUSBAR_PART) ? Parts.STATUSBAR_PART : layoutService.hasFocus(Parts.SIDEBAR_PART) ? Parts.SIDEBAR_PART : layoutService.hasFocus(Parts.PANEL_PART) ? Parts.PANEL_PART : undefined;
	let partToFocus = Parts.EDITOR_PART;
	if (currentlyFocusedPart) {
		partToFocus = findVisibleNeighbour(layoutService, currentlyFocusedPart, next);
	}

	layoutService.focusPart(partToFocus);
}

export class FocusNextPart extends Action {
	static readonly ID = 'workbench.action.focusNextPart';
	static readonly LABEL = localize('focusNextPart', "Focus Next Part");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		focusNextOrPreviousPart(this.layoutService, this.editorService, true);
	}
}

export class FocusPreviousPart extends Action {
	static readonly ID = 'workbench.action.focusPreviousPart';
	static readonly LABEL = localize('focusPreviousPart', "Focus Previous Part");

	constructor(
		id: string,
		label: string,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(id, label);
	}

	override async run(): Promise<void> {
		focusNextOrPreviousPart(this.layoutService, this.editorService, false);
	}
}

// --- Actions Registration

const actionsRegistry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);

actionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateUpAction, undefined), 'View: Navigate to the View Above', CATEGORIES.View.value);
actionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateDownAction, undefined), 'View: Navigate to the View Below', CATEGORIES.View.value);
actionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateLeftAction, undefined), 'View: Navigate to the View on the Left', CATEGORIES.View.value);
actionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateRightAction, undefined), 'View: Navigate to the View on the Right', CATEGORIES.View.value);
actionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(FocusNextPart, { primary: KeyCode.F6 }), 'View: Focus Next Part', CATEGORIES.View.value);
actionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(FocusPreviousPart, { primary: KeyMod.Shift | KeyCode.F6 }), 'View: Focus Previous Part', CATEGORIES.View.value);
