/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/workbench';

import {TPromise, ValueCallback} from 'vs/base/common/winjs.base';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import strings = require('vs/base/common/strings');
import DOM = require('vs/base/browser/dom');
import {Box, Builder, $} from 'vs/base/browser/builder';
import {Delayer} from 'vs/base/common/async';
import assert = require('vs/base/common/assert');
import timer = require('vs/base/common/timer');
import errors = require('vs/base/common/errors');
import {Registry} from 'vs/platform/platform';
import {isWindows, isLinux} from 'vs/base/common/platform';
import {IOptions} from 'vs/workbench/common/options';
import {IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions} from 'vs/workbench/common/contributions';
import {BaseEditor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IEditorRegistry, Extensions as EditorExtensions, TextEditorOptions, EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {Part} from 'vs/workbench/browser/part';
import {HistoryService} from 'vs/workbench/services/history/browser/history';
import {ActivitybarPart} from 'vs/workbench/browser/parts/activitybar/activitybarPart';
import {EditorPart} from 'vs/workbench/browser/parts/editor/editorPart';
import {SidebarPart} from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import {PanelPart} from 'vs/workbench/browser/parts/panel/panelPart';
import {StatusbarPart} from 'vs/workbench/browser/parts/statusbar/statusbarPart';
import {WorkbenchLayout, LayoutOptions} from 'vs/workbench/browser/layout';
import {IActionBarRegistry, Extensions as ActionBarExtensions} from 'vs/workbench/browser/actionBarRegistry';
import {ViewletRegistry, Extensions as ViewletExtensions} from 'vs/workbench/browser/viewlet';
import {PanelRegistry, Extensions as PanelExtensions} from 'vs/workbench/browser/panel';
import {QuickOpenController} from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import {DiffEditorInput, toDiffLabel} from 'vs/workbench/common/editor/diffEditorInput';
import {getServices} from 'vs/platform/instantiation/common/extensions';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {WorkbenchEditorService} from 'vs/workbench/services/editor/browser/editorService';
import {Position, Parts, IPartService} from 'vs/workbench/services/part/common/partService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {ContextMenuService} from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import {WorkbenchKeybindingService} from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import {IConfigurationEditingService} from 'vs/workbench/services/configuration/common/configurationEditing';
import {ConfigurationEditingService} from 'vs/workbench/services/configuration/node/configurationEditingService';
import {ContextKeyService} from 'vs/platform/contextkey/browser/contextKeyService';
import {IWorkspace} from 'vs/platform/workspace/common/workspace';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {ContextKeyExpr, RawContextKey, IContextKeyService, IContextKey} from 'vs/platform/contextkey/common/contextkey';
import {IActivityService} from 'vs/workbench/services/activity/common/activityService';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {WorkbenchMessageService} from 'vs/workbench/services/message/browser/messageService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IHistoryService} from 'vs/workbench/services/history/common/history';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {SyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {ILifecycleService} from 'vs/platform/lifecycle/common/lifecycle';
import {IMessageService} from 'vs/platform/message/common/message';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {IStatusbarService} from 'vs/platform/statusbar/common/statusbar';
import {IMenuService} from 'vs/platform/actions/common/actions';
import {MenuService} from 'vs/platform/actions/common/menuService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEnvironmentService} from 'vs/platform/environment/common/environment';

export const MessagesVisibleContext = new RawContextKey<boolean>('globalMessageVisible', false);
export const EditorsVisibleContext = new RawContextKey<boolean>('editorIsOpen', false);
export const NoEditorsVisibleContext:ContextKeyExpr = EditorsVisibleContext.toNegated();

interface WorkbenchParams {
	workspace?: IWorkspace;
	options: IOptions;
	serviceCollection: ServiceCollection;
}

export interface IWorkbenchCallbacks {
	onServicesCreated?: () => void;
	onWorkbenchStarted?: (customKeybindingsCount: number) => void;
}

const Identifiers = {
	WORKBENCH_CONTAINER: 'workbench.main.container',
	ACTIVITYBAR_PART: 'workbench.parts.activitybar',
	SIDEBAR_PART: 'workbench.parts.sidebar',
	PANEL_PART: 'workbench.parts.panel',
	EDITOR_PART: 'workbench.parts.editor',
	STATUSBAR_PART: 'workbench.parts.statusbar'
};

/**
 * The workbench creates and lays out all parts that make up the workbench.
 */
export class Workbench implements IPartService {

	private static sidebarPositionSettingKey = 'workbench.sidebar.position';
	private static statusbarHiddenSettingKey = 'workbench.statusbar.hidden';
	private static sidebarHiddenSettingKey = 'workbench.sidebar.hidden';
	private static panelHiddenSettingKey = 'workbench.panel.hidden';

	public _serviceBrand: any;

	private container: HTMLElement;
	private workbenchParams: WorkbenchParams;
	private workbenchContainer: Builder;
	private workbench: Builder;
	private workbenchStarted: boolean;
	private workbenchCreated: boolean;
	private workbenchShutdown: boolean;
	private editorService: WorkbenchEditorService;
	private contextKeyService: IContextKeyService;
	private keybindingService: IKeybindingService;
	private activitybarPart: ActivitybarPart;
	private sidebarPart: SidebarPart;
	private panelPart: PanelPart;
	private editorPart: EditorPart;
	private statusbarPart: StatusbarPart;
	private quickOpen: QuickOpenController;
	private workbenchLayout: WorkbenchLayout;
	private toDispose: IDisposable[];
	private toShutdown: { shutdown: () => void; }[];
	private callbacks: IWorkbenchCallbacks;
	private creationPromise: TPromise<boolean>;
	private creationPromiseComplete: ValueCallback;
	private sideBarHidden: boolean;
	private statusBarHidden: boolean;
	private sideBarPosition: Position;
	private panelHidden: boolean;
	private editorBackgroundDelayer: Delayer<void>;
	private messagesVisibleContext: IContextKey<boolean>;
	private editorsVisibleContext: IContextKey<boolean>;
	private hasFilesToCreateOpenOrDiff: boolean;

	constructor(
		container: HTMLElement,
		workspace: IWorkspace,
		options: IOptions,
		serviceCollection: ServiceCollection,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IEventService private eventService: IEventService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IMessageService private messageService: IMessageService,
		@IThreadService private threadService: IThreadService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		this.container = container;

		this.workbenchParams = {
			workspace: workspace,
			options,
			serviceCollection
		};

		this.hasFilesToCreateOpenOrDiff = (options.filesToCreate && options.filesToCreate.length > 0) || (options.filesToOpen && options.filesToOpen.length > 0) || (options.filesToDiff && options.filesToDiff.length > 0);

		this.toDispose = [];
		this.toShutdown = [];
		this.editorBackgroundDelayer = new Delayer<void>(50);

		this.creationPromise = new TPromise<boolean>((c, e, p) => {
			this.creationPromiseComplete = c;
		});
	}

	/**
	 * Starts the workbench and creates the HTML elements on the container. A workbench can only be started
	 * once. Use the shutdown function to free up resources created by the workbench on startup.
	 */
	public startup(callbacks?: IWorkbenchCallbacks): void {
		assert.ok(!this.workbenchStarted, 'Can not start a workbench that was already started');
		assert.ok(!this.workbenchShutdown, 'Can not start a workbench that was shutdown');

		try {
			this.workbenchStarted = true;
			this.callbacks = callbacks;

			// Create Workbench
			this.createWorkbench();

			// Services
			this.initServices();
			if (this.callbacks && this.callbacks.onServicesCreated) {
				this.callbacks.onServicesCreated();
			}

			// Contexts
			this.messagesVisibleContext = MessagesVisibleContext.bindTo(this.contextKeyService);
			this.editorsVisibleContext = EditorsVisibleContext.bindTo(this.contextKeyService);

			// Register Listeners
			this.registerListeners();

			// Settings
			this.initSettings();

			// Create Workbench and Parts
			this.renderWorkbench();

			// Workbench Layout
			this.createWorkbenchLayout();

			// Register Emitters
			this.registerEmitters();

			// Load composits and editors in parallel
			const compositeAndEditorPromises: TPromise<any>[] = [];

			// Load Viewlet
			const viewletRegistry = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets));
			let viewletId = viewletRegistry.getDefaultViewletId();
			if (!this.environmentService.isBuilt) {
				viewletId = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE, viewletRegistry.getDefaultViewletId()); // help developers and restore last view
			}

			if (!this.sideBarHidden && !!viewletId) {
				const viewletTimerEvent = timer.start(timer.Topic.STARTUP, strings.format('Opening Viewlet: {0}', viewletId));
				compositeAndEditorPromises.push(this.sidebarPart.openViewlet(viewletId, false).then(() => viewletTimerEvent.stop()));
			}

			// Load Panel
			const panelRegistry = (<PanelRegistry>Registry.as(PanelExtensions.Panels));
			const panelId = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, panelRegistry.getDefaultPanelId());
			if (!this.panelHidden && !!panelId) {
				compositeAndEditorPromises.push(this.panelPart.openPanel(panelId, false));
			}

			// Load Editors
			const editorTimerEvent = timer.start(timer.Topic.STARTUP, strings.format('Restoring Editor(s)'));
			compositeAndEditorPromises.push(this.resolveEditorsToOpen().then(inputsWithOptions => {
				let editorOpenPromise: TPromise<BaseEditor[]>;
				if (inputsWithOptions.length) {
					const editors = inputsWithOptions.map((inputWithOptions, index) => {
						return {
							input: inputWithOptions.input,
							options: inputWithOptions.options,
							position: Position.LEFT
						};
					});

					editorOpenPromise = this.editorPart.openEditors(editors);
				} else {
					editorOpenPromise = this.editorPart.restoreEditors();
				}

				return editorOpenPromise.then(() => {
					this.onEditorsChanged(); // make sure we show the proper background in the editor area
					editorTimerEvent.stop();
				});
			}));

			// Flag workbench as created once done
			const workbenchDone = (error?: Error) => {
				this.workbenchCreated = true;
				this.creationPromiseComplete(true);

				if (this.callbacks && this.callbacks.onWorkbenchStarted) {
					this.callbacks.onWorkbenchStarted(this.keybindingService.customKeybindingsCount());
				}

				if (error) {
					errors.onUnexpectedError(error);
				}
			};

			// Join viewlet, panel and editor promises
			TPromise.join(compositeAndEditorPromises).then(() => workbenchDone(), error => workbenchDone(error));
		} catch (error) {

			// Print out error
			console.error(errors.toErrorMessage(error, true));

			// Rethrow
			throw error;
		}
	}

	private resolveEditorsToOpen(): TPromise<{ input: EditorInput, options?: EditorOptions }[]> {

		// Files to open, diff or create
		if (this.hasFilesToCreateOpenOrDiff) {
			const wbopt = this.workbenchParams.options;
			const filesToCreate = wbopt.filesToCreate || [];
			const filesToOpen = wbopt.filesToOpen || [];
			const filesToDiff = wbopt.filesToDiff;

			// Files to diff is exclusive
			if (filesToDiff && filesToDiff.length) {
				return TPromise.join<EditorInput>(filesToDiff.map(resourceInput => this.editorService.createInput(resourceInput))).then((inputsToDiff) => {
					return [{ input: new DiffEditorInput(toDiffLabel(filesToDiff[0].resource, filesToDiff[1].resource, this.contextService), null, inputsToDiff[0], inputsToDiff[1]) }];
				});
			}

			// Otherwise: Open/Create files
			else {
				const inputs: EditorInput[] = [];
				const options: EditorOptions[] = [];

				// Files to create
				inputs.push(...filesToCreate.map(resourceInput => this.untitledEditorService.createOrGet(resourceInput.resource)));
				options.push(...filesToCreate.map(r => null)); // fill empty options for files to create because we dont have options there

				// Files to open
				return TPromise.join<EditorInput>(filesToOpen.map(resourceInput => this.editorService.createInput(resourceInput))).then((inputsToOpen) => {
					inputs.push(...inputsToOpen);
					options.push(...filesToOpen.map(resourceInput => TextEditorOptions.from(resourceInput)));

					return inputs.map((input, index) => { return { input, options: options[index] }; });
				});
			}
		}

		// Empty workbench
		else if (!this.workbenchParams.workspace) {
			return TPromise.as([{ input: this.untitledEditorService.createOrGet() }]);
		}

		return TPromise.as([]);
	}

	private initServices(): void {
		const {serviceCollection} = this.workbenchParams;

		this.toDispose.push(this.lifecycleService.onShutdown(this.shutdownComponents, this));

		// Services we contribute
		serviceCollection.set(IPartService, this);

		// Status bar
		this.statusbarPart = this.instantiationService.createInstance(StatusbarPart, Identifiers.STATUSBAR_PART);
		this.toDispose.push(this.statusbarPart);
		this.toShutdown.push(this.statusbarPart);
		serviceCollection.set(IStatusbarService, this.statusbarPart);

		// Keybindings
		this.contextKeyService = this.instantiationService.createInstance(ContextKeyService);
		serviceCollection.set(IContextKeyService, this.contextKeyService);

		this.keybindingService = this.instantiationService.createInstance(WorkbenchKeybindingService, <any>window);
		serviceCollection.set(IKeybindingService, this.keybindingService);

		// Context Menu
		serviceCollection.set(IContextMenuService, this.instantiationService.createInstance(ContextMenuService));

		// Menus/Actions
		serviceCollection.set(IMenuService, new SyncDescriptor(MenuService));

		// Viewlet service (sidebar part)
		this.sidebarPart = this.instantiationService.createInstance(SidebarPart, Identifiers.SIDEBAR_PART);
		this.toDispose.push(this.sidebarPart);
		this.toShutdown.push(this.sidebarPart);
		serviceCollection.set(IViewletService, this.sidebarPart);

		// Panel service (panel part)
		this.panelPart = this.instantiationService.createInstance(PanelPart, Identifiers.PANEL_PART);
		this.toDispose.push(this.panelPart);
		this.toShutdown.push(this.panelPart);
		serviceCollection.set(IPanelService, this.panelPart);

		// Activity service (activitybar part)
		this.activitybarPart = this.instantiationService.createInstance(ActivitybarPart, Identifiers.ACTIVITYBAR_PART);
		this.toDispose.push(this.activitybarPart);
		this.toShutdown.push(this.activitybarPart);
		serviceCollection.set(IActivityService, this.activitybarPart);

		// Editor service (editor part)
		this.editorPart = this.instantiationService.createInstance(EditorPart, Identifiers.EDITOR_PART, !this.hasFilesToCreateOpenOrDiff);
		this.toDispose.push(this.editorPart);
		this.toShutdown.push(this.editorPart);
		this.editorService = this.instantiationService.createInstance(WorkbenchEditorService, this.editorPart);
		serviceCollection.set(IWorkbenchEditorService, this.editorService);
		serviceCollection.set(IEditorGroupService, this.editorPart);

		// History
		serviceCollection.set(IHistoryService, this.instantiationService.createInstance(HistoryService));

		// Configuration Editing
		serviceCollection.set(IConfigurationEditingService, this.instantiationService.createInstance(ConfigurationEditingService));

		// Quick open service (quick open controller)
		this.quickOpen = this.instantiationService.createInstance(QuickOpenController);
		this.toDispose.push(this.quickOpen);
		this.toShutdown.push(this.quickOpen);
		serviceCollection.set(IQuickOpenService, this.quickOpen);

		// Contributed services
		const contributedServices = getServices();
		for (let contributedService of contributedServices) {
			serviceCollection.set(contributedService.id, contributedService.descriptor);
		}

		// Set the some services to registries that have been created eagerly
		<IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar).setInstantiationService(this.instantiationService);
		<IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench).setInstantiationService(this.instantiationService);
		<IEditorRegistry>Registry.as(EditorExtensions.Editors).setInstantiationService(this.instantiationService);
	}

	private initSettings(): void {

		// Sidebar visibility
		this.sideBarHidden = this.storageService.getBoolean(Workbench.sidebarHiddenSettingKey, StorageScope.WORKSPACE, false);
		if (!this.contextService.getWorkspace()) {
			this.sideBarHidden = true; // we hide sidebar in single-file-mode
		}

		const viewletRegistry = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets));
		if (!viewletRegistry.getDefaultViewletId()) {
			this.sideBarHidden = true; // can only hide sidebar if we dont have a default Viewlet id
		}

		// Panel part visibility
		const panelRegistry = (<PanelRegistry>Registry.as(PanelExtensions.Panels));
		this.panelHidden = this.storageService.getBoolean(Workbench.panelHiddenSettingKey, StorageScope.WORKSPACE, true);
		if (!this.contextService.getWorkspace() || !panelRegistry.getDefaultPanelId()) {
			this.panelHidden = true; // we hide panel part in single-file-mode or if there is no default panel
		}

		// Sidebar position
		const rawPosition = this.storageService.get(Workbench.sidebarPositionSettingKey, StorageScope.GLOBAL, 'left');
		this.sideBarPosition = (rawPosition === 'left') ? Position.LEFT : Position.RIGHT;

		// Statusbar visibility
		this.statusBarHidden = this.storageService.getBoolean(Workbench.statusbarHiddenSettingKey, StorageScope.GLOBAL, false);
	}

	/**
	 * Returns whether the workbench has been started.
	 */
	public isStarted(): boolean {
		return this.workbenchStarted && !this.workbenchShutdown;
	}

	/**
	 * Returns whether the workbench has been fully created.
	 */
	public isCreated(): boolean {
		return this.workbenchCreated && this.workbenchStarted;
	}

	public joinCreation(): TPromise<boolean> {
		return this.creationPromise;
	}

	public hasFocus(part: Parts): boolean {
		const activeElement = document.activeElement;
		if (!activeElement) {
			return false;
		}

		let container: Builder = null;
		switch (part) {
			case Parts.ACTIVITYBAR_PART:
				container = this.activitybarPart.getContainer();
				break;
			case Parts.SIDEBAR_PART:
				container = this.sidebarPart.getContainer();
				break;
			case Parts.PANEL_PART:
				container = this.panelPart.getContainer();
				break;
			case Parts.EDITOR_PART:
				container = this.editorPart.getContainer();
				break;
			case Parts.STATUSBAR_PART:
				container = this.statusbarPart.getContainer();
				break;
		}

		return DOM.isAncestor(activeElement, container.getHTMLElement());
	}

	public isVisible(part: Parts): boolean {
		switch (part) {
			case Parts.SIDEBAR_PART:
				return !this.sideBarHidden;
			case Parts.PANEL_PART:
				return !this.panelHidden;
			case Parts.STATUSBAR_PART:
				return !this.statusBarHidden;
		}

		return true; // any other part cannot be hidden
	}

	public isStatusBarHidden(): boolean {
		return this.statusBarHidden;
	}

	public setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.statusBarHidden = hidden;

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout(true);
		}

		this.storageService.store(Workbench.statusbarHiddenSettingKey, hidden ? 'true' : 'false');
	}

	public isSideBarHidden(): boolean {
		return this.sideBarHidden;
	}

	public setSideBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.sideBarHidden = hidden;

		// Adjust CSS
		if (hidden) {
			this.workbench.addClass('nosidebar');
		} else {
			this.workbench.removeClass('nosidebar');
		}

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout(true);
		}

		// If sidebar becomes hidden, also hide the current active Viewlet if any
		if (hidden && this.sidebarPart.getActiveViewlet()) {
			this.sidebarPart.hideActiveViewlet();

			// Pass Focus to Editor if Sidebar is now hidden
			const editor = this.editorPart.getActiveEditor();
			if (editor) {
				editor.focus();
			}
		}

		// If sidebar becomes visible, show last active Viewlet or default viewlet
		else if (!hidden && !this.sidebarPart.getActiveViewlet()) {
			const registry = (<ViewletRegistry>Registry.as(ViewletExtensions.Viewlets));
			const viewletToOpen = this.sidebarPart.getLastActiveViewletId() || registry.getDefaultViewletId();
			if (viewletToOpen) {
				this.sidebarPart.openViewlet(viewletToOpen, true).done(null, errors.onUnexpectedError);
			}
		}

		// Remember in settings
		this.storageService.store(Workbench.sidebarHiddenSettingKey, hidden ? 'true' : 'false', StorageScope.WORKSPACE);
	}

	public isPanelHidden(): boolean {
		return this.panelHidden;
	}

	public setPanelHidden(hidden: boolean, skipLayout?: boolean): void {
		this.panelHidden = hidden;

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout(true);
		}

		// If panel part becomes hidden, also hide the current active panel if any
		if (hidden && this.panelPart.getActivePanel()) {
			this.panelPart.hideActivePanel();

			// Pass Focus to Editor if Panel part is now hidden
			const editor = this.editorPart.getActiveEditor();
			if (editor) {
				editor.focus();
			}
		}

		// If panel part becomes visible, show last active panel or default panel
		else if (!hidden && !this.panelPart.getActivePanel()) {
			const registry = (<PanelRegistry>Registry.as(PanelExtensions.Panels));
			const panelToOpen = this.panelPart.getLastActivePanelId() || registry.getDefaultPanelId();
			if (panelToOpen) {
				this.panelPart.openPanel(panelToOpen, true).done(null, errors.onUnexpectedError);
			}
		}

		// Remember in settings
		this.storageService.store(Workbench.panelHiddenSettingKey, hidden ? 'true' : 'false', StorageScope.WORKSPACE);
	}

	public getSideBarPosition(): Position {
		return this.sideBarPosition;
	}

	public setSideBarPosition(position: Position): void {
		if (this.sideBarHidden) {
			this.setSideBarHidden(false, true /* Skip Layout */);
		}

		const newPositionValue = (position === Position.LEFT) ? 'left' : 'right';
		const oldPositionValue = (this.sideBarPosition === Position.LEFT) ? 'left' : 'right';
		this.sideBarPosition = position;

		// Adjust CSS
		this.activitybarPart.getContainer().removeClass(oldPositionValue);
		this.sidebarPart.getContainer().removeClass(oldPositionValue);
		this.activitybarPart.getContainer().addClass(newPositionValue);
		this.sidebarPart.getContainer().addClass(newPositionValue);

		// Layout
		this.workbenchLayout.layout(true);

		// Remember in settings
		this.storageService.store(Workbench.sidebarPositionSettingKey, position === Position.LEFT ? 'left' : 'right', StorageScope.GLOBAL);
	}

	public dispose(): void {
		if (this.isStarted()) {
			this.shutdownComponents();
			this.workbenchShutdown = true;
		}

		this.toDispose = dispose(this.toDispose);
	}

	/**
	 * Asks the workbench and all its UI components inside to lay out according to
	 * the containers dimension the workbench is living in.
	 */
	public layout(): void {
		if (this.isStarted()) {
			this.workbenchLayout.layout();
		}
	}

	private shutdownComponents(): void {

		// Pass shutdown on to each participant
		this.toShutdown.forEach(s => s.shutdown());
	}

	private registerEmitters(): void {

		// Part Emitters
		this.hookPartListeners(this.activitybarPart);
		this.hookPartListeners(this.editorPart);
		this.hookPartListeners(this.sidebarPart);
		this.hookPartListeners(this.panelPart);
	}

	private hookPartListeners(part: Part): void {
		this.toDispose.push(this.eventService.addEmitter2(part, part.getId()));
	}

	private registerListeners(): void {

		// Listen to editor changes
		this.toDispose.push(this.editorPart.onEditorsChanged(() => this.onEditorsChanged()));

		// Handle message service and quick open events
		if (this.messageService instanceof WorkbenchMessageService) {
			this.toDispose.push((<WorkbenchMessageService>this.messageService).onMessagesShowing(() => this.messagesVisibleContext.set(true)));
			this.toDispose.push((<WorkbenchMessageService>this.messageService).onMessagesCleared(() => this.messagesVisibleContext.reset()));

			this.toDispose.push(this.quickOpen.onShow(() => (<WorkbenchMessageService>this.messageService).suspend())); // when quick open is open, don't show messages behind
			this.toDispose.push(this.quickOpen.onHide(() => (<WorkbenchMessageService>this.messageService).resume()));  // resume messages once quick open is closed again
		}
	}

	private onEditorsChanged(): void {
		const visibleEditors = this.editorService.getVisibleEditors().length;

		// We update the editorpart class to indicate if an editor is opened or not
		// through a delay to accomodate for fast editor switching

		const editorContainer = this.editorPart.getContainer();
		if (visibleEditors === 0) {
			this.editorsVisibleContext.reset();
			this.editorBackgroundDelayer.trigger(() => editorContainer.addClass('empty'));
		} else {
			this.editorsVisibleContext.set(true);
			this.editorBackgroundDelayer.trigger(() => editorContainer.removeClass('empty'));
		}
	}

	private createWorkbenchLayout(): void {
		const options = new LayoutOptions();
		options.setMargin(new Box(0, 0, 0, 0));

		this.workbenchLayout = this.instantiationService.createInstance(WorkbenchLayout,
			$(this.container),							// Parent
			this.workbench,								// Workbench Container
			{
				activitybar: this.activitybarPart,		// Activity Bar
				editor: this.editorPart,				// Editor
				sidebar: this.sidebarPart,				// Sidebar
				panel: this.panelPart,					// Panel Part
				statusbar: this.statusbarPart,			// Statusbar
			},
			this.quickOpen,								// Quickopen
			options										// Layout Options
		);

		this.toDispose.push(this.workbenchLayout);
	}

	private createWorkbench(): void {

		// Create Workbench DIV Off-DOM
		this.workbenchContainer = $('.monaco-workbench-container');
		this.workbench = $().div({ 'class': 'monaco-workbench ' + (isWindows ? 'windows' : isLinux ? 'linux' : 'mac'), id: Identifiers.WORKBENCH_CONTAINER }).appendTo(this.workbenchContainer);
	}

	private renderWorkbench(): void {

		// Apply sidebar state as CSS class
		if (this.sideBarHidden) {
			this.workbench.addClass('nosidebar');
		}

		// Apply no-workspace state as CSS class
		if (!this.workbenchParams.workspace) {
			this.workbench.addClass('no-workspace');
		}

		// Create Parts
		this.createActivityBarPart();
		this.createSidebarPart();
		this.createEditorPart();
		this.createPanelPart();
		this.createStatusbarPart();

		// Add Workbench to DOM
		this.workbenchContainer.build(this.container);
	}

	private createActivityBarPart(): void {
		const activitybarPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'activitybar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'],
				id: Identifiers.ACTIVITYBAR_PART,
				role: 'navigation'
			});

		this.activitybarPart.create(activitybarPartContainer);
	}

	private createSidebarPart(): void {
		const sidebarPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'sidebar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'],
				id: Identifiers.SIDEBAR_PART,
				role: 'complementary'
			});

		this.sidebarPart.create(sidebarPartContainer);
	}

	private createPanelPart(): void {
		const panelPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'panel', 'monaco-editor-background'],
				id: Identifiers.PANEL_PART,
				role: 'complementary'
			});

		this.panelPart.create(panelPartContainer);
	}

	private createEditorPart(): void {
		const editorContainer = $(this.workbench)
			.div({
				'class': ['part', 'editor', 'monaco-editor-background'],
				id: Identifiers.EDITOR_PART,
				role: 'main'
			});

		this.editorPart.create(editorContainer);
	}

	private createStatusbarPart(): void {
		const statusbarContainer = $(this.workbench).div({
			'class': ['part', 'statusbar'],
			id: Identifiers.STATUSBAR_PART,
			role: 'contentinfo'
		});

		this.statusbarPart.create(statusbarContainer);
	}

	public getEditorPart(): EditorPart {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

		return this.editorPart;
	}

	public getSidebarPart(): SidebarPart {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

		return this.sidebarPart;
	}

	public getPanelPart(): PanelPart {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

		return this.panelPart;
	}

	public getInstantiationService(): IInstantiationService {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

		return this.instantiationService;
	}

	public addClass(clazz: string): void {
		if (this.workbench) {
			this.workbench.addClass(clazz);
		}
	}

	public removeClass(clazz: string): void {
		if (this.workbench) {
			this.workbench.removeClass(clazz);
		}
	}

	public getWorkbenchElementId(): string {
		return Identifiers.WORKBENCH_CONTAINER;
	}
}