/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import product from 'vs/platform/node/product';
import { isMacintosh, isLinux, language } from 'vs/base/common/platform';
import { IEditorGroupsService, GroupDirection, GroupLocation, IFindGroupScope } from 'vs/workbench/services/group/common/editorGroupsService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts, Position as PartPosition } from 'vs/workbench/services/part/common/partService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { shell } from 'electron';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IPanel } from 'vs/workbench/common/panel';
import { IssueType } from 'vs/platform/issue/common/issue';
import { IWorkbenchIssueService } from 'vs/workbench/services/issue/common/issue';

// --- actions

export class OpenIssueReporterAction extends Action {
	static readonly ID = 'workbench.action.openIssueReporter';
	static readonly LABEL = nls.localize({ key: 'reportIssueInEnglish', comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		return this.issueService.openReporter()
			.then(() => true);
	}
}

export class OpenProcessExplorer extends Action {
	static readonly ID = 'workbench.action.openProcessExplorer';
	static readonly LABEL = nls.localize('openProcessExplorer', "Open Process Explorer");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		return this.issueService.openProcessExplorer()
			.then(() => true);
	}
}

export class ReportPerformanceIssueUsingReporterAction extends Action {
	static readonly ID = 'workbench.action.reportPerformanceIssueUsingReporter';
	static readonly LABEL = nls.localize('reportPerformanceIssue', "Report Performance Issue");

	constructor(
		id: string,
		label: string,
		@IWorkbenchIssueService private readonly issueService: IWorkbenchIssueService
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		// TODO: Reporter should send timings table as well
		return this.issueService.openReporter({ issueType: IssueType.PerformanceIssue })
			.then(() => true);
	}
}

export class KeybindingsReferenceAction extends Action {

	static readonly ID = 'workbench.action.keybindingsReference';
	static readonly LABEL = nls.localize('keybindingsReference', "Keyboard Shortcuts Reference");

	private static readonly URL = isLinux ? product.keyboardShortcutsUrlLinux : isMacintosh ? product.keyboardShortcutsUrlMac : product.keyboardShortcutsUrlWin;
	static readonly AVAILABLE = !!KeybindingsReferenceAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(KeybindingsReferenceAction.URL);
		return Promise.resolve();
	}
}

export class OpenDocumentationUrlAction extends Action {

	static readonly ID = 'workbench.action.openDocumentationUrl';
	static readonly LABEL = nls.localize('openDocumentationUrl', "Documentation");

	private static readonly URL = product.documentationUrl;
	static readonly AVAILABLE = !!OpenDocumentationUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenDocumentationUrlAction.URL);
		return Promise.resolve();
	}
}

export class OpenIntroductoryVideosUrlAction extends Action {

	static readonly ID = 'workbench.action.openIntroductoryVideosUrl';
	static readonly LABEL = nls.localize('openIntroductoryVideosUrl', "Introductory Videos");

	private static readonly URL = product.introductoryVideosUrl;
	static readonly AVAILABLE = !!OpenIntroductoryVideosUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenIntroductoryVideosUrlAction.URL);
		return Promise.resolve();
	}
}

export class OpenTipsAndTricksUrlAction extends Action {

	static readonly ID = 'workbench.action.openTipsAndTricksUrl';
	static readonly LABEL = nls.localize('openTipsAndTricksUrl', "Tips and Tricks");

	private static readonly URL = product.tipsAndTricksUrl;
	static readonly AVAILABLE = !!OpenTipsAndTricksUrlAction.URL;

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<void> {
		window.open(OpenTipsAndTricksUrlAction.URL);
		return Promise.resolve();
	}
}

export const enum Direction {
	Next,
	Previous,
}

export abstract class BaseNavigationAction extends Action {

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService protected editorGroupService: IEditorGroupsService,
		@IPanelService protected panelService: IPanelService,
		@IPartService protected partService: IPartService,
		@IViewletService protected viewletService: IViewletService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);

		const isSidebarPositionLeft = this.partService.getSideBarPosition() === PartPosition.LEFT;
		const isPanelPositionDown = this.partService.getPanelPosition() === PartPosition.BOTTOM;

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
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			return false;
		}

		const activePanelId = this.panelService.getActivePanel().getId();

		return this.panelService.openPanel(activePanelId, true);
	}

	protected navigateToSidebar(): Promise<IViewlet | boolean> {
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return Promise.resolve(false);
		}

		const activeViewletId = this.viewletService.getActiveViewlet().getId();

		return this.viewletService.openViewlet(activeViewletId, true)
			.then(value => value === null ? false : value);
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

export class NavigateLeftAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateLeft';
	static readonly LABEL = nls.localize('navigateLeft', "Navigate to the View on the Left");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
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

export class NavigateRightAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateRight';
	static readonly LABEL = nls.localize('navigateRight', "Navigate to the View on the Right");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
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

export class NavigateUpAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateUp';
	static readonly LABEL = nls.localize('navigateUp', "Navigate to the View Above");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
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

export class NavigateDownAction extends BaseNavigationAction {

	static readonly ID = 'workbench.action.navigateDown';
	static readonly LABEL = nls.localize('navigateDown', "Navigate to the View Below");

	constructor(
		id: string,
		label: string,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@IViewletService viewletService: IViewletService
	) {
		super(id, label, editorGroupService, panelService, partService, viewletService);
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

// Resize focused view actions
export abstract class BaseResizeViewAction extends Action {

	// This is a media-size percentage
	protected static RESIZE_INCREMENT = 6.5;

	constructor(
		id: string,
		label: string,
		@IPartService protected partService: IPartService
	) {
		super(id, label);
	}

	protected resizePart(sizeChange: number): void {
		const isEditorFocus = this.partService.hasFocus(Parts.EDITOR_PART);
		const isSidebarFocus = this.partService.hasFocus(Parts.SIDEBAR_PART);
		const isPanelFocus = this.partService.hasFocus(Parts.PANEL_PART);

		let part: Parts | undefined;
		if (isSidebarFocus) {
			part = Parts.SIDEBAR_PART;
		} else if (isPanelFocus) {
			part = Parts.PANEL_PART;
		} else if (isEditorFocus) {
			part = Parts.EDITOR_PART;
		}

		if (part) {
			this.partService.resizePart(part, sizeChange);
		}
	}
}

export class IncreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.increaseViewSize';
	static readonly LABEL = nls.localize('increaseViewSize', "Increase Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService
	) {
		super(id, label, partService);
	}

	run(): Promise<boolean> {
		this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
	}
}

export class DecreaseViewSizeAction extends BaseResizeViewAction {

	static readonly ID = 'workbench.action.decreaseViewSize';
	static readonly LABEL = nls.localize('decreaseViewSize', "Decrease Current View Size");

	constructor(
		id: string,
		label: string,
		@IPartService partService: IPartService

	) {
		super(id, label, partService);
	}

	run(): Promise<boolean> {
		this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT);
		return Promise.resolve(true);
	}
}

export class OpenTwitterUrlAction extends Action {

	static readonly ID = 'workbench.action.openTwitterUrl';
	static LABEL = nls.localize('openTwitterUrl', "Join Us on Twitter", product.applicationName);

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.twitterUrl) {
			return Promise.resolve(shell.openExternal(product.twitterUrl));
		}

		return Promise.resolve(false);
	}
}

export class OpenRequestFeatureUrlAction extends Action {

	static readonly ID = 'workbench.action.openRequestFeatureUrl';
	static LABEL = nls.localize('openUserVoiceUrl', "Search Feature Requests");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.requestFeatureUrl) {
			return Promise.resolve(shell.openExternal(product.requestFeatureUrl));
		}

		return Promise.resolve(false);
	}
}

export class OpenLicenseUrlAction extends Action {

	static readonly ID = 'workbench.action.openLicenseUrl';
	static LABEL = nls.localize('openLicenseUrl', "View License");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.licenseUrl) {
			if (language) {
				const queryArgChar = product.licenseUrl.indexOf('?') > 0 ? '&' : '?';
				return Promise.resolve(shell.openExternal(`${product.licenseUrl}${queryArgChar}lang=${language}`));
			} else {
				return Promise.resolve(shell.openExternal(product.licenseUrl));
			}
		}

		return Promise.resolve(false);
	}
}

export class OpenPrivacyStatementUrlAction extends Action {

	static readonly ID = 'workbench.action.openPrivacyStatementUrl';
	static LABEL = nls.localize('openPrivacyStatement', "Privacy Statement");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	run(): Promise<boolean> {
		if (product.privacyStatementUrl) {
			if (language) {
				const queryArgChar = product.privacyStatementUrl.indexOf('?') > 0 ? '&' : '?';
				return Promise.resolve(shell.openExternal(`${product.privacyStatementUrl}${queryArgChar}lang=${language}`));
			} else {
				return Promise.resolve(shell.openExternal(product.privacyStatementUrl));
			}
		}


		return Promise.resolve(false);
	}
}

