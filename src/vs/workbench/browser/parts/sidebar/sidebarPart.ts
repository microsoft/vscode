/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebarpart';
import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Registry } from 'vs/platform/platform';
import { Action } from 'vs/base/common/actions';
import { CompositePart } from 'vs/workbench/browser/parts/compositePart';
import { Viewlet, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPartService, Parts, Position as SideBarPosition } from 'vs/workbench/services/part/common/partService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { Scope } from 'vs/workbench/browser/actionBarRegistry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { highContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';

export class SidebarPart extends CompositePart<Viewlet> {

	public static activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';

	public _serviceBrand: any;

	private blockOpeningViewlet: boolean;

	constructor(
		id: string,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPartService partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(
			messageService,
			storageService,
			telemetryService,
			contextMenuService,
			partService,
			keybindingService,
			instantiationService,
			themeService,
			Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets),
			SidebarPart.activeViewletSettingsKey,
			'sideBar',
			'viewlet',
			Scope.VIEWLET,
			SIDE_BAR_TITLE_FOREGROUND,
			id,
			{ hasTitle: true }
		);
	}

	public get onDidViewletOpen(): Event<IViewlet> {
		return this._onDidCompositeOpen.event;
	}

	public get onDidViewletClose(): Event<IViewlet> {
		return this._onDidCompositeClose.event;
	}

	public updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();

		container.style('background-color', this.getColor(SIDE_BAR_BACKGROUND));

		const useBorder = this.isHighContrastTheme;
		const isPositionLeft = this.partService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style('border-right-width', useBorder && isPositionLeft ? '1px' : null);
		container.style('border-right-style', useBorder && isPositionLeft ? 'solid' : null);
		container.style('border-right-color', useBorder && isPositionLeft ? this.getColor(highContrastBorder) : null);
		container.style('border-left-width', useBorder && !isPositionLeft ? '1px' : null);
		container.style('border-left-style', useBorder && !isPositionLeft ? 'solid' : null);
		container.style('border-left-color', useBorder && !isPositionLeft ? this.getColor(highContrastBorder) : null);
	}

	public openViewlet(id: string, focus?: boolean): TPromise<Viewlet> {
		if (this.blockOpeningViewlet) {
			return TPromise.as(null); // Workaround against a potential race condition
		}

		// First check if sidebar is hidden and show if so
		let promise = TPromise.as(null);
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			try {
				this.blockOpeningViewlet = true;
				promise = this.partService.setSideBarHidden(false);
			} finally {
				this.blockOpeningViewlet = false;
			}
		}

		return promise.then(() => this.openComposite(id, focus));
	}

	public getActiveViewlet(): IViewlet {
		return <IViewlet>this.getActiveComposite();
	}

	public getLastActiveViewletId(): string {
		return this.getLastActiveCompositetId();
	}

	public hideActiveViewlet(): TPromise<void> {
		return this.hideActiveComposite().then(composite => void 0);
	}
}

class FocusSideBarAction extends Action {

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

	public run(): TPromise<any> {

		// Show side bar
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return this.partService.setSideBarHidden(false);
		}

		// Focus into active viewlet
		let viewlet = this.viewletService.getActiveViewlet();
		if (viewlet) {
			viewlet.focus();
		}
		return TPromise.as(true);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusSideBarAction, FocusSideBarAction.ID, FocusSideBarAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_0
}), 'View: Focus into Side Bar', nls.localize('viewCategory', "View"));
