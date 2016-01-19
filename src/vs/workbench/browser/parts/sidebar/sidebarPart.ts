/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebarpart';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import strings = require('vs/base/common/strings');
import {Action, IAction} from 'vs/base/common/actions';
import {CompositePart} from 'vs/workbench/browser/parts/compositePart';
import {EventType as WorkbenchEventType, CompositeEvent} from 'vs/workbench/common/events';
import {Viewlet, ViewletRegistry, Extensions as ViewletExtensions} from 'vs/workbench/browser/viewlet';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IViewlet} from 'vs/workbench/common/viewlet';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export class SidebarPart extends CompositePart<Viewlet> implements IViewletService {

	public static activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';

	public serviceId = IViewletService;

	private blockOpeningViewlet: boolean;
	private currentViewletOpenToken: string;

	constructor(
		messageService: IMessageService,
		storageService: IStorageService,
		eventService: IEventService,
		telemetryService: ITelemetryService,
		contextMenuService: IContextMenuService,
		partService: IPartService,
		keybindingService: IKeybindingService,
		id: string
	) {
		super(messageService, storageService, eventService, telemetryService, contextMenuService, partService, keybindingService,
			(<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets)), SidebarPart.activeViewletSettingsKey, 'sideBar', 'viewlet', id);
	}

	public openViewlet(id: string, focus?: boolean): TPromise<Viewlet> {
		if (this.blockOpeningViewlet) {
			return TPromise.as(null); // Workaround against a potential race condition
		}

		// First check if sidebar is hidden and show if so
		if (this.partService.isSideBarHidden()) {
			try {
				this.blockOpeningViewlet = true;
				this.partService.setSideBarHidden(false);
			} finally {
				this.blockOpeningViewlet = false;
			}
		}

		return this.openComposite(id, focus);
	}

	private get activeViewlet(): IViewlet {
		return this.getActiveViewlet();
	}

	private createViewlet(id: string, isActive?: boolean): TPromise<Viewlet> {
		return this.createComposite(id, isActive);
	}

	private showViewlet(viewlet: Viewlet): TPromise<void> {
		return this.showComposite(viewlet);
	}

	public getActiveViewlet(): IViewlet {
		return this.getActiveComposite();
	}

	public getLastActiveViewletId(): string {
		return this.getLastActiveCompositetId();
	}

	public hideActiveViewlet(): TPromise<void> {
		return this.hideActiveComposite();
	}
}

export class FocusSideBarAction extends Action {

	public static ID = 'workbench.action.focusSideBar';
	public static LABEL = nls.localize('focusSideBar', "Focus into Side Bar");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	public run(): TPromise<boolean> {

		// Show side bar
		if (this.partService.isSideBarHidden()) {
			this.partService.setSideBarHidden(false);
		}

		// Focus into active viewlet
		else {
			let viewlet = this.viewletService.getActiveViewlet();
			if (viewlet) {
				viewlet.focus();
			}
		}

		return TPromise.as(true);
	}
}

let registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusSideBarAction, FocusSideBarAction.ID, FocusSideBarAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_0
}), nls.localize('viewCategory', "View"));
