/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/sidebarpart';
import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import {Registry} from 'vs/platform/platform';
import {IDisposable} from 'vs/base/common/lifecycle';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import uuid = require('vs/base/common/uuid');
import events = require('vs/base/common/events');
import timer = require('vs/base/common/timer');
import strings = require('vs/base/common/strings');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import {CONTEXT as ToolBarContext, ToolBar} from 'vs/base/browser/ui/toolbar/toolbar';
import {IActionItem, ActionsOrientation} from 'vs/base/browser/ui/actionbar/actionbar';
import {ProgressBar} from 'vs/base/browser/ui/progressbar/progressbar';
import {Scope, IActionBarRegistry, Extensions, prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import {Action, IAction} from 'vs/base/common/actions';
import {Part} from 'vs/workbench/browser/part';
import {EventType as WorkbenchEventType, ViewletEvent} from 'vs/workbench/common/events';
import {Viewlet, EventType as ViewletEventType, IViewletRegistry, Extensions as ViewletExtensions} from 'vs/workbench/browser/viewlet';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/browser/actionRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {WorkbenchProgressService} from 'vs/workbench/services/progress/browser/progressService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IViewlet} from 'vs/workbench/common/viewlet';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export class SidebarPart extends Part implements IViewletService {

	public static activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';

	public serviceId = IViewletService;

	private instantiationService: IInstantiationService;
	private activeViewletListeners: { (): void; }[];
	private instantiatedViewletListeners: { (): void; }[];
	private mapViewletToViewletContainer: { [viewletId: string]: Builder; };
	private mapActionsBindingToViewlet: { [viewletId: string]: () => void; };
	private mapProgressServiceToViewlet: { [viewletId: string]: IProgressService; };
	private activeViewlet: Viewlet;
	private lastActiveViewletId: string;
	private instantiatedViewlets: Viewlet[];
	private titleLabel: Builder;
	private toolBar: ToolBar;
	private viewletLoaderPromises: { [viewletId: string]: TPromise<Viewlet>; };
	private progressBar: ProgressBar;
	private contentAreaSize: Dimension;
	private blockOpeningViewlet: boolean;
	private registry: IViewletRegistry;
	private telemetryActionsListener: IDisposable;
	private currentViewletOpenToken: string;

	constructor(
		private messageService: IMessageService,
		private storageService: IStorageService,
		private eventService: IEventService,
		private telemetryService: ITelemetryService,
		private contextMenuService: IContextMenuService,
		private partService: IPartService,
		private keybindingService: IKeybindingService,
		id: string
	) {
		super(id);

		this.activeViewletListeners = [];
		this.instantiatedViewletListeners = [];
		this.mapViewletToViewletContainer = {};
		this.mapActionsBindingToViewlet = {};
		this.mapProgressServiceToViewlet = {};
		this.activeViewlet = null;
		this.instantiatedViewlets = [];
		this.viewletLoaderPromises = {};
		this.registry = (<IViewletRegistry>Registry.as(ViewletExtensions.Viewlets));
	}

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;
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

		// Check if viewlet already visible and just focus in that case
		if (this.activeViewlet && this.activeViewlet.getId() === id) {
			if (focus) {
				this.activeViewlet.focus();
			}

			// Fullfill promise with viewlet that is being opened
			return TPromise.as(this.activeViewlet);
		}

		// Open
		return this.doOpenViewlet(id, focus);
	}

	private doOpenViewlet(id: string, focus?: boolean): TPromise<Viewlet> {
		let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Open Viewlet {0}', id.substr(id.lastIndexOf('.') + 1)));

		// Use a generated token to avoid race conditions from long running promises
		let currentViewletOpenToken = uuid.generateUuid();
		this.currentViewletOpenToken = currentViewletOpenToken;

		// Emit Viewlet Opening Event
		this.emit(WorkbenchEventType.VIEWLET_OPENING, new ViewletEvent(id));

		// Hide current
		let hidePromise: TPromise<void>;
		if (this.activeViewlet) {
			hidePromise = this.hideActiveViewlet();
		} else {
			hidePromise = TPromise.as(null);
		}

		return hidePromise.then(() => {

			// Update Title
			this.updateTitle(id);

			// Create viewlet
			return this.createViewlet(id, true).then((viewlet: Viewlet) => {

				// Check if another viewlet opened meanwhile and return in that case
				if ((this.currentViewletOpenToken !== currentViewletOpenToken) || (this.activeViewlet && this.activeViewlet.getId() !== viewlet.getId())) {
					timerEvent.stop();

					return TPromise.as(null);
				}

				// Check if viewlet already visible and just focus in that case
				if (this.activeViewlet && this.activeViewlet.getId() === viewlet.getId()) {
					if (focus) {
						viewlet.focus();
					}

					timerEvent.stop();

					// Fullfill promise with viewlet that is being opened
					return TPromise.as(viewlet);
				}

				// Show Viewlet and Focus
				return this.showViewlet(viewlet).then(() => {
					if (focus) {
						viewlet.focus();
					}

					timerEvent.stop();

					// Fullfill promise with viewlet that is being opened
					return viewlet;
				});
			});
		});
	}

	private createViewlet(id: string, isActive?: boolean): TPromise<Viewlet> {

		// Check if viewlet is already created
		for (let i = 0; i < this.instantiatedViewlets.length; i++) {
			if (this.instantiatedViewlets[i].getId() === id) {
				return TPromise.as(this.instantiatedViewlets[i]);
			}
		}

		// Instantiate viewlet from registry otherwise
		let viewletDescriptor = this.registry.getViewlet(id);
		if (viewletDescriptor) {
			let loaderPromise = this.viewletLoaderPromises[id];
			if (!loaderPromise) {
				let progressService = new WorkbenchProgressService(this.eventService, this.progressBar, viewletDescriptor.id, isActive);
				let services = {
					progressService: progressService
				};
				let viewletInstantiationService = this.instantiationService.createChild(services);

				loaderPromise = viewletInstantiationService.createInstance(viewletDescriptor).then((viewlet: Viewlet) => {
					this.mapProgressServiceToViewlet[viewlet.getId()] = progressService;

					// Remember as Instantiated
					this.instantiatedViewlets.push(viewlet);

					// Register to title area update events from the viewlet
					this.instantiatedViewletListeners.push(viewlet.addListener(ViewletEventType.INTERNAL_VIEWLET_TITLE_AREA_UPDATE, (e) => { this.onTitleAreaUpdate(e); }));

					// Remove from Promises Cache since Loaded
					delete this.viewletLoaderPromises[id];

					return viewlet;
				});

				// Report progress for slow loading viewlets
				progressService.showWhile(loaderPromise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);

				// Add to Promise Cache until Loaded
				this.viewletLoaderPromises[id] = loaderPromise;
			}

			return loaderPromise;
		}

		throw new Error(strings.format('Unable to find viewlet with id {0}', id));
	}

	private showViewlet(viewlet: Viewlet): TPromise<void> {

		// Remember Viewlet
		this.activeViewlet = viewlet;

		// Store in preferences
		this.storageService.store(SidebarPart.activeViewletSettingsKey, this.activeViewlet.getId(), StorageScope.WORKSPACE);

		// Remember
		this.lastActiveViewletId = this.activeViewlet.getId();

		// Register as Emitter to Workbench Bus
		this.activeViewletListeners.push(this.eventService.addEmitter(this.activeViewlet, this.activeViewlet.getId()));

		let createViewletPromise: TPromise<void>;

		// Viewlet created for the first time
		let viewletContainer = this.mapViewletToViewletContainer[viewlet.getId()];
		if (!viewletContainer) {

			// Build Container off-DOM
			viewletContainer = $().div({
				'class': 'viewlet',
				id: viewlet.getId()
			}, (div: Builder) => {
				createViewletPromise = viewlet.create(div);
			});

			// Remember viewlet container
			this.mapViewletToViewletContainer[viewlet.getId()] = viewletContainer;
		}

		// Viewlet already exists but is hidden
		else {
			createViewletPromise = TPromise.as(null);
		}

		// Report progress for slow loading viewlets (but only if we did not create the viewlet before already)
		let progressService = this.mapProgressServiceToViewlet[viewlet.getId()];
		if (progressService && !viewletContainer) {
			this.mapProgressServiceToViewlet[viewlet.getId()].showWhile(createViewletPromise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);
		}

		// Fill Content and Actions
		return createViewletPromise.then(() => {

			// Make sure that the user meanwhile did not open another viewlet or closed the sidebar
			if (!this.activeViewlet || viewlet.getId() !== this.activeViewlet.getId()) {
				return;
			}

			// Take Viewlet on-DOM and show
			viewletContainer.build(this.getContentArea());
			viewletContainer.show();

			// Setup action runner
			this.toolBar.actionRunner = viewlet.getActionRunner();

			// Update title with viewlet title if it differs from descriptor
			let descriptor = this.registry.getViewlet(viewlet.getId());
			if (descriptor && descriptor.name !== viewlet.getTitle()) {
				this.updateTitle(viewlet.getId(), viewlet.getTitle());
			}

			// Handle Viewlet Actions
			let actionsBinding = this.mapActionsBindingToViewlet[viewlet.getId()];
			if (!actionsBinding) {
				actionsBinding = this.collectViewletActions(viewlet);
				this.mapActionsBindingToViewlet[viewlet.getId()] = actionsBinding;
			}
			actionsBinding();

			if (this.telemetryActionsListener) {
				this.telemetryActionsListener.dispose();
				this.telemetryActionsListener = null;
			}

			// Action Run Handling
			this.telemetryActionsListener = this.toolBar.actionRunner.addListener2(events.EventType.RUN, (e: any) => {

				// Check for Error
				if (e.error && !errors.isPromiseCanceledError(e.error)) {
					this.messageService.show(Severity.Error, e.error);
				}

				// Log in telemetry
				if (this.telemetryService) {
					this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'sideBar' });
				}
			});

			// Indicate to viewlet that it is now visible
			return viewlet.setVisible(true).then(() => {

				// Make sure that the user meanwhile did not open another viewlet or closed the sidebar
				if (!this.activeViewlet || viewlet.getId() !== this.activeViewlet.getId()) {
					return;
				}

				// Make sure the viewlet is layed out
				if (this.contentAreaSize) {
					viewlet.layout(this.contentAreaSize);
				}

				// Emit Viewlet Opened Event
				this.emit(WorkbenchEventType.VIEWLET_OPENED, new ViewletEvent(this.activeViewlet.getId()));
			});
		}, (error: any) => this.onError(error));
	}

	private onTitleAreaUpdate(e: ViewletEvent): void {

		// Active Viewlet
		if (this.activeViewlet && this.activeViewlet.getId() === e.viewletId) {

			// Title
			this.updateTitle(this.activeViewlet.getId(), this.activeViewlet.getTitle());

			// Actions
			let actionsBinding = this.collectViewletActions(this.activeViewlet);
			this.mapActionsBindingToViewlet[this.activeViewlet.getId()] = actionsBinding;
			actionsBinding();
		}

		// Otherwise invalidate actions binding for next time when the viewlet becomes visible
		else {
			delete this.mapActionsBindingToViewlet[e.viewletId];
		}
	}

	private updateTitle(viewletId: string, viewletTitle?: string): void {
		let viewletDescriptor = this.registry.getViewlet(viewletId);
		if (!viewletDescriptor) {
			return;
		}

		if (!viewletTitle) {
			viewletTitle = viewletDescriptor.name;
		}

		let keybinding: string = null;
		let keys = this.keybindingService.lookupKeybindings(viewletId).map(k => this.keybindingService.getLabelFor(k));
		if (keys && keys.length) {
			keybinding = keys[0];
		}

		this.titleLabel.safeInnerHtml(viewletTitle);
		this.titleLabel.title(keybinding ? nls.localize('viewletTitleTooltip', "{0} ({1})", viewletTitle, keybinding) : viewletTitle);
	}

	private collectViewletActions(viewlet: Viewlet): () => void {

		// From Viewlet
		let primaryActions: IAction[] = viewlet.getActions();
		let secondaryActions: IAction[] = viewlet.getSecondaryActions();

		// From Contributions
		let actionBarRegistry = <IActionBarRegistry>Registry.as(Extensions.Actionbar);
		primaryActions.push(...actionBarRegistry.getActionBarActionsForContext(Scope.VIEW, viewlet));
		secondaryActions.push(...actionBarRegistry.getSecondaryActionBarActionsForContext(Scope.VIEW, viewlet));

		// Return fn to set into toolbar
		return this.toolBar.setActions(prepareActions(primaryActions), prepareActions(secondaryActions));
	}

	public getActiveViewlet(): IViewlet {
		return this.activeViewlet;
	}

	public getLastActiveViewletId(): string {
		return this.lastActiveViewletId;
	}

	public hideActiveViewlet(): TPromise<void> {
		if (!this.activeViewlet) {
			return TPromise.as(null); // Nothing to do
		}

		let viewlet = this.activeViewlet;
		this.activeViewlet = null;

		let viewletContainer = this.mapViewletToViewletContainer[viewlet.getId()];

		// Indicate to Viewlet
		return viewlet.setVisible(false).then(() => {

			// Take Container Off-DOM and hide
			viewletContainer.offDOM();
			viewletContainer.hide();

			// Clear any running Progress
			this.progressBar.stop().getContainer().hide();

			// Empty Actions
			this.toolBar.setActions([])();

			// Clear Listeners
			while (this.activeViewletListeners.length) {
				this.activeViewletListeners.pop()();
			}

			// Emit Viewlet Closed Event
			this.emit(WorkbenchEventType.VIEWLET_CLOSED, new ViewletEvent(viewlet.getId()));
		});
	}

	public createTitleArea(parent: Builder): Builder {

		// Title Area Container
		let titleArea = $(parent).div({
			'class': 'title'
		});

		// Right Actions Container
		$(titleArea).div({
			'class': 'title-actions'
		}, (div) => {

			// Toolbar
			this.toolBar = new ToolBar(div.getHTMLElement(), this.contextMenuService, {
				actionItemProvider: (action: Action) => this.actionItemProvider(action),
				orientation: ActionsOrientation.HORIZONTAL
			});
		});

		// Left Title Label
		$(titleArea).div({
			'class': 'title-label'
		}, (div) => {
			this.titleLabel = div.span();
		});

		return titleArea;
	}

	private actionItemProvider(action: Action): IActionItem {
		let actionItem: IActionItem;

		// Check Active Viewlet
		if (this.activeViewlet) {
			actionItem = this.activeViewlet.getActionItem(action);
		}

		// Check Registry
		if (!actionItem) {
			let actionBarRegistry = <IActionBarRegistry>Registry.as(Extensions.Actionbar);
			actionItem = actionBarRegistry.getActionItemForContext(Scope.VIEW, ToolBarContext, action);
		}

		return actionItem;
	}

	public createContentArea(parent: Builder): Builder {
		return $(parent).div({
			'class': 'content'
		}, (div: Builder) => {
			this.progressBar = new ProgressBar(div);
			this.progressBar.getContainer().hide();
		});
	}

	private onError(error: any): void {
		this.messageService.show(Severity.Error, types.isString(error) ? new Error(error) : error);
	}

	public layout(dimension: Dimension): Dimension[] {

		// Pass to super
		let sizes = super.layout(dimension);

		// Pass Contentsize to viewlet
		this.contentAreaSize = sizes[1];
		if (this.activeViewlet) {
			this.activeViewlet.layout(this.contentAreaSize);
		}

		return sizes;
	}

	public shutdown(): void {
		this.instantiatedViewlets.forEach(i => i.shutdown());

		super.shutdown();
	}

	public dispose(): void {
		this.mapViewletToViewletContainer = null;
		this.mapProgressServiceToViewlet = null;
		this.mapActionsBindingToViewlet = null;

		for (let i = 0; i < this.instantiatedViewlets.length; i++) {
			this.instantiatedViewlets[i].dispose();
		}

		this.instantiatedViewlets = [];

		while (this.activeViewletListeners.length) {
			this.activeViewletListeners.pop()();
		}

		while (this.instantiatedViewletListeners.length) {
			this.instantiatedViewletListeners.pop()();
		}

		this.progressBar.dispose();
		this.toolBar.dispose();

		// Super Dispose
		super.dispose();
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