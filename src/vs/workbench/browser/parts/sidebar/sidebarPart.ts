/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebarpart';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { CompositePart } from 'vs/workbench/browser/parts/compositePart';
import { Viewlet, ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
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
import { Event, Emitter } from 'vs/base/common/event';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_TITLE_FOREGROUND, SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER } from 'vs/workbench/common/theme';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, EventType, addDisposableListener, trackFocus } from 'vs/base/browser/dom';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export const SidebarFocusContext = new RawContextKey<boolean>('sideBarFocus', false);
export const ActiveViewletContext = new RawContextKey<string>('activeViewlet', '');

export class SidebarPart extends CompositePart<Viewlet> implements IViewletService {
	_serviceBrand: any;

	static readonly activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';

	private viewletRegistry: ViewletRegistry;
	private sideBarFocusContextKey: IContextKey<boolean>;
	private activeViewletContextKey: IContextKey<string>;
	private blockOpeningViewlet: boolean;
	private _onDidViewletEnable = new Emitter<{ id: string, enabled: boolean }>();

	constructor(
		id: string,
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPartService partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService private readonly extensionService: IExtensionService
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

		this.sideBarFocusContextKey = SidebarFocusContext.bindTo(contextKeyService);
		this.viewletRegistry = Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets);

		this.activeViewletContextKey = ActiveViewletContext.bindTo(contextKeyService);

		this._register(this.onDidViewletOpen(viewlet => {
			this.activeViewletContextKey.set(viewlet.getId());
		}));
		this._register(this.onDidViewletClose(viewlet => {
			if (this.activeViewletContextKey.get() === viewlet.getId()) {
				this.activeViewletContextKey.reset();
			}
		}));
	}

	get onDidViewletRegister(): Event<ViewletDescriptor> { return <Event<ViewletDescriptor>>this.viewletRegistry.onDidRegister; }
	get onDidViewletEnablementChange(): Event<{ id: string, enabled: boolean }> { return this._onDidViewletEnable.event; }

	get onDidViewletOpen(): Event<IViewlet> {
		return Event.map(this._onDidCompositeOpen.event, compositeEvent => <IViewlet>compositeEvent.composite);
	}

	get onDidViewletClose(): Event<IViewlet> {
		return this._onDidCompositeClose.event as Event<IViewlet>;
	}

	create(parent: HTMLElement): void {
		super.create(parent);

		const focusTracker = trackFocus(parent);

		focusTracker.onDidFocus(() => {
			this.sideBarFocusContextKey.set(true);
		});
		focusTracker.onDidBlur(() => {
			this.sideBarFocusContextKey.set(false);
		});
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

	layout(dimension: Dimension): Dimension[] {
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return [dimension];
		}

		return super.layout(dimension);
	}

	// Viewlet service

	getActiveViewlet(): IViewlet {
		return <IViewlet>this.getActiveComposite();
	}

	getLastActiveViewletId(): string {
		return this.getLastActiveCompositetId();
	}

	hideActiveViewlet(): void {
		this.hideActiveComposite();
	}

	setViewletEnablement(id: string, enabled: boolean): void {
		const descriptor = this.getAllViewlets().filter(desc => desc.id === id).pop();
		if (descriptor && descriptor.enabled !== enabled) {
			descriptor.enabled = enabled;
			this._onDidViewletEnable.fire({ id, enabled });
		}
	}

	openViewlet(id: string, focus?: boolean): Promise<IViewlet | null> {
		if (this.getViewlet(id)) {
			return Promise.resolve(this.doOpenViewlet(id, focus));
		}
		return this.extensionService.whenInstalledExtensionsRegistered()
			.then(() => {
				if (this.getViewlet(id)) {
					return this.doOpenViewlet(id, focus);
				}
				return null;
			});
	}

	getViewlets(): ViewletDescriptor[] {
		return this.getAllViewlets()
			.filter(v => v.enabled);
	}

	getAllViewlets(): ViewletDescriptor[] {
		return this.viewletRegistry.getViewlets()
			.sort((v1, v2) => v1.order! - v2.order!);
	}

	getDefaultViewletId(): string {
		return this.viewletRegistry.getDefaultViewletId();
	}

	getViewlet(id: string): ViewletDescriptor {
		return this.getViewlets().filter(viewlet => viewlet.id === id)[0];
	}

	private doOpenViewlet(id: string, focus?: boolean): Viewlet | null {
		if (this.blockOpeningViewlet) {
			return null; // Workaround against a potential race condition
		}

		// First check if sidebar is hidden and show if so
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			try {
				this.blockOpeningViewlet = true;
				this.partService.setSideBarHidden(false);
			} finally {
				this.blockOpeningViewlet = false;
			}
		}

		return this.openComposite(id, focus) as Viewlet;
	}

	protected getTitleAreaDropDownAnchorAlignment(): AnchorAlignment {
		return this.partService.getSideBarPosition() === SideBarPosition.LEFT ? AnchorAlignment.LEFT : AnchorAlignment.RIGHT;
	}

	private onTitleAreaContextMenu(event: StandardMouseEvent): void {
		const activeViewlet = this.getActiveViewlet() as Viewlet;
		if (activeViewlet) {
			const contextMenuActions = activeViewlet ? activeViewlet.getContextMenuActions() : [];
			if (contextMenuActions.length) {
				const anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => contextMenuActions,
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
		@IViewletService private readonly viewletService: IViewletService,
		@IPartService private readonly partService: IPartService
	) {
		super(id, label);
	}

	run(): Promise<any> {

		// Show side bar
		if (!this.partService.isVisible(Parts.SIDEBAR_PART)) {
			return Promise.resolve(this.partService.setSideBarHidden(false));
		}

		// Focus into active viewlet
		let viewlet = this.viewletService.getActiveViewlet();
		if (viewlet) {
			viewlet.focus();
		}

		return Promise.resolve(true);
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusSideBarAction, FocusSideBarAction.ID, FocusSideBarAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_0
}), 'View: Focus into Side Bar', nls.localize('viewCategory', "View"));
