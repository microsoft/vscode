/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebarpart';
import { TPromise } from 'vs/base/common/winjs.base';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { CompositePart } from 'vs/workbench/browser/parts/compositePart';
import { Viewlet, ViewletRegistry, Extensions as ViewletExtensions } from 'vs/workbench/browser/viewlet';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPartService, Parts, Position as SideBarPosition } from 'vs/workbench/services/part/common/partService';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER } from 'vs/workbench/common/theme';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, EventType, addDisposableListener } from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';

export class SidebarPart extends CompositePart<Viewlet> {

	static readonly activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';

	private blockOpeningViewlet: boolean;

	constructor(
		id: string,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPartService partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(
			notificationService,
			storageService,
			telemetryService,
			contextMenuService,
			partService,
			keybindingService,
			instantiationService,
			themeService,
			Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets),
			SidebarPart.activeViewletSettingsKey,
			Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).getDefaultViewletId(),
			'sideBar',
			'viewlet',
			SIDE_BAR_TITLE_FOREGROUND,
			id,
			{ hasTitle: true, borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0 }
		);
	}

	get onDidViewletOpen(): Event<IViewlet> {
		return this._onDidCompositeOpen.event as Event<IViewlet>;
	}

	get onDidViewletClose(): Event<IViewlet> {
		return this._onDidCompositeClose.event as Event<IViewlet>;
	}

	createTitleArea(parent: HTMLElement): HTMLElement {
		const titleArea = super.createTitleArea(parent);

		this._register(addDisposableListener(titleArea, EventType.CONTEXT_MENU, e => {
			this.onTitleAreaContextMenu(new StandardMouseEvent(e));
		}));

		return titleArea;
	}

	updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();

		container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND);
		container.style.color = this.getColor(SIDE_BAR_FOREGROUND);

		const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
		const isPositionLeft = this.partService.getSideBarPosition() === SideBarPosition.LEFT;
		container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : null;
		container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : null;
		container.style.borderRightColor = isPositionLeft ? borderColor : null;
		container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : null;
		container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : null;
		container.style.borderLeftColor = !isPositionLeft ? borderColor : null;
	}

	openViewlet(id: string, focus?: boolean): TPromise<Viewlet> {
		if (this.blockOpeningViewlet) {
			return TPromise.as(null); // Workaround against a potential race condition
		}

		// First check if sidebar is hidden and show if so
		let promise = TPromise.wrap<void>(null);
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			try {
				this.blockOpeningViewlet = true;
				promise = this.partService.setSideBarHidden(false);
			} finally {
				this.blockOpeningViewlet = false;
			}
		}

		return promise.then(() => this.openComposite(id, focus)) as TPromise<Viewlet>;
	}

	getActiveViewlet(): IViewlet {
		return <IViewlet>this.getActiveComposite();
	}

	getLastActiveViewletId(): string {
		return this.getLastActiveCompositetId();
	}

	hideActiveViewlet(): TPromise<void> {
		return this.hideActiveComposite().then(composite => void 0);
	}

	layout(dimension: Dimension): Dimension[] {
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return [dimension];
		}

		return super.layout(dimension);
	}

	private onTitleAreaContextMenu(event: StandardMouseEvent): void {
		const activeViewlet = this.getActiveViewlet() as Viewlet;
		if (activeViewlet) {
			const contextMenuActions = activeViewlet ? activeViewlet.getContextMenuActions() : [];
			if (contextMenuActions.length) {
				const anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => TPromise.as(contextMenuActions),
					getActionItem: action => this.actionItemProvider(action as Action),
					actionRunner: activeViewlet.getActionRunner()
				});
			}
		}
	}
}

class FocusSideBarAction extends Action {

	static readonly ID = 'workbench.action.focusSideBar';
	static readonly LABEL = nls.localize('focusSideBar', "Focus into Side Bar");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService,
		@IPartService private partService: IPartService
	) {
		super(id, label);
	}

	run(): TPromise<any> {

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
