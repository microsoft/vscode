/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/compositepart';
import * as nls from 'vs/nls';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, $ } from 'vs/base/browser/builder';
import * as strings from 'vs/base/common/strings';
import { Emitter } from 'vs/base/common/event';
import * as types from 'vs/base/common/types';
import * as errors from 'vs/base/common/errors';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { prepareActions } from 'vs/workbench/browser/actions';
import { Action, IAction } from 'vs/base/common/actions';
import { Part, IPartOptions } from 'vs/workbench/browser/part';
import { Composite, CompositeRegistry } from 'vs/workbench/browser/composite';
import { IComposite } from 'vs/workbench/common/composite';
import { WorkbenchProgressService } from 'vs/workbench/services/progress/browser/progressService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { Dimension, EventType } from 'vs/base/browser/dom';

export interface ICompositeTitleLabel {

	/**
	 * Asks to update the title for the composite with the given ID.
	 */
	updateTitle(id: string, title: string, keybinding?: string): void;

	/**
	 * Called when theming information changes.
	 */
	updateStyles(): void;
}

export abstract class CompositePart<T extends Composite> extends Part {
	private instantiatedCompositeListeners: IDisposable[];
	private mapCompositeToCompositeContainer: { [compositeId: string]: Builder; };
	private mapActionsBindingToComposite: { [compositeId: string]: () => void; };
	private mapProgressServiceToComposite: { [compositeId: string]: IProgressService; };
	private activeComposite: Composite;
	private lastActiveCompositeId: string;
	private instantiatedComposites: Composite[];
	private titleLabel: ICompositeTitleLabel;
	protected toolBar: ToolBar;
	private progressBar: ProgressBar;
	private contentAreaSize: Dimension;
	private telemetryActionsListener: IDisposable;
	private currentCompositeOpenToken: string;
	protected _onDidCompositeOpen = new Emitter<IComposite>();
	protected _onDidCompositeClose = new Emitter<IComposite>();

	constructor(
		private notificationService: INotificationService,
		private storageService: IStorageService,
		private telemetryService: ITelemetryService,
		protected contextMenuService: IContextMenuService,
		protected partService: IPartService,
		private keybindingService: IKeybindingService,
		protected instantiationService: IInstantiationService,
		themeService: IThemeService,
		private registry: CompositeRegistry<T>,
		private activeCompositeSettingsKey: string,
		private defaultCompositeId: string,
		private nameForTelemetry: string,
		private compositeCSSClass: string,
		private titleForegroundColor: string,
		id: string,
		options: IPartOptions
	) {
		super(id, options, themeService);

		this.instantiatedCompositeListeners = [];
		this.mapCompositeToCompositeContainer = {};
		this.mapActionsBindingToComposite = {};
		this.mapProgressServiceToComposite = {};
		this.activeComposite = null;
		this.instantiatedComposites = [];
		this.lastActiveCompositeId = storageService.get(activeCompositeSettingsKey, StorageScope.WORKSPACE, this.defaultCompositeId);
	}

	protected openComposite(id: string, focus?: boolean): TPromise<Composite> {
		// Check if composite already visible and just focus in that case
		if (this.activeComposite && this.activeComposite.getId() === id) {
			if (focus) {
				this.activeComposite.focus();
			}

			// Fullfill promise with composite that is being opened
			return TPromise.as(this.activeComposite);
		}

		// Open
		return this.doOpenComposite(id, focus);
	}

	private doOpenComposite(id: string, focus?: boolean): TPromise<Composite> {

		// Use a generated token to avoid race conditions from long running promises
		const currentCompositeOpenToken = defaultGenerator.nextId();
		this.currentCompositeOpenToken = currentCompositeOpenToken;

		// Hide current
		let hidePromise: TPromise<Composite>;
		if (this.activeComposite) {
			hidePromise = this.hideActiveComposite();
		} else {
			hidePromise = TPromise.as(null);
		}

		return hidePromise.then(() => {

			// Update Title
			this.updateTitle(id);

			// Create composite
			const composite = this.createComposite(id, true);

			// Check if another composite opened meanwhile and return in that case
			if ((this.currentCompositeOpenToken !== currentCompositeOpenToken) || (this.activeComposite && this.activeComposite.getId() !== composite.getId())) {
				return TPromise.as(null);
			}

			// Check if composite already visible and just focus in that case
			if (this.activeComposite && this.activeComposite.getId() === composite.getId()) {
				if (focus) {
					composite.focus();
				}

				// Fullfill promise with composite that is being opened
				return TPromise.as(composite);
			}

			// Show Composite and Focus
			return this.showComposite(composite).then(() => {
				if (focus) {
					composite.focus();
				}

				// Fullfill promise with composite that is being opened
				return composite;
			});
		}).then(composite => {
			if (composite) {
				this._onDidCompositeOpen.fire(composite);
			}

			return composite;
		});
	}

	protected createComposite(id: string, isActive?: boolean): Composite {

		// Check if composite is already created
		for (let i = 0; i < this.instantiatedComposites.length; i++) {
			if (this.instantiatedComposites[i].getId() === id) {
				return this.instantiatedComposites[i];
			}
		}

		// Instantiate composite from registry otherwise
		const compositeDescriptor = this.registry.getComposite(id);
		if (compositeDescriptor) {
			const progressService = this.instantiationService.createInstance(WorkbenchProgressService, this.progressBar, compositeDescriptor.id, isActive);
			const compositeInstantiationService = this.instantiationService.createChild(new ServiceCollection([IProgressService, progressService]));

			const composite = compositeDescriptor.instantiate(compositeInstantiationService);
			this.mapProgressServiceToComposite[composite.getId()] = progressService;

			// Remember as Instantiated
			this.instantiatedComposites.push(composite);

			// Register to title area update events from the composite
			this.instantiatedCompositeListeners.push(composite.onTitleAreaUpdate(() => this.onTitleAreaUpdate(composite.getId())));

			return composite;
		}

		throw new Error(strings.format('Unable to find composite with id {0}', id));
	}

	protected showComposite(composite: Composite): TPromise<void> {

		// Remember Composite
		this.activeComposite = composite;

		// Store in preferences
		const id = this.activeComposite.getId();
		if (id !== this.defaultCompositeId) {
			this.storageService.store(this.activeCompositeSettingsKey, id, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(this.activeCompositeSettingsKey, StorageScope.WORKSPACE);
		}

		// Remember
		this.lastActiveCompositeId = this.activeComposite.getId();

		let createCompositePromise: TPromise<void>;

		// Composites created for the first time
		let compositeContainer = this.mapCompositeToCompositeContainer[composite.getId()];
		if (!compositeContainer) {

			// Build Container off-DOM
			compositeContainer = $().div({
				'class': ['composite', this.compositeCSSClass],
				id: composite.getId()
			}, div => {
				createCompositePromise = composite.create(div).then(() => {
					composite.updateStyles();
				});
			});

			// Remember composite container
			this.mapCompositeToCompositeContainer[composite.getId()] = compositeContainer;
		}

		// Composite already exists but is hidden
		else {
			createCompositePromise = TPromise.as(null);
		}

		// Report progress for slow loading composites (but only if we did not create the composites before already)
		const progressService = this.mapProgressServiceToComposite[composite.getId()];
		if (progressService && !compositeContainer) {
			this.mapProgressServiceToComposite[composite.getId()].showWhile(createCompositePromise, this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */);
		}

		// Fill Content and Actions
		return createCompositePromise.then(() => {

			// Make sure that the user meanwhile did not open another composite or closed the part containing the composite
			if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
				return void 0;
			}

			// Take Composite on-DOM and show
			compositeContainer.build(this.getContentArea());
			compositeContainer.show();

			// Setup action runner
			this.toolBar.actionRunner = composite.getActionRunner();

			// Update title with composite title if it differs from descriptor
			const descriptor = this.registry.getComposite(composite.getId());
			if (descriptor && descriptor.name !== composite.getTitle()) {
				this.updateTitle(composite.getId(), composite.getTitle());
			}

			// Handle Composite Actions
			let actionsBinding = this.mapActionsBindingToComposite[composite.getId()];
			if (!actionsBinding) {
				actionsBinding = this.collectCompositeActions(composite);
				this.mapActionsBindingToComposite[composite.getId()] = actionsBinding;
			}
			actionsBinding();

			if (this.telemetryActionsListener) {
				this.telemetryActionsListener.dispose();
				this.telemetryActionsListener = null;
			}

			// Action Run Handling
			this.telemetryActionsListener = this.toolBar.actionRunner.onDidRun(e => {

				// Check for Error
				if (e.error && !errors.isPromiseCanceledError(e.error)) {
					this.notificationService.error(e.error);
				}

				// Log in telemetry
				if (this.telemetryService) {
					/* __GDPR__
						"workbenchActionExecuted" : {
							"id" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
							"from": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
					this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: this.nameForTelemetry });
				}
			});

			// Indicate to composite that it is now visible
			return composite.setVisible(true).then(() => {

				// Make sure that the user meanwhile did not open another composite or closed the part containing the composite
				if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
					return;
				}

				// Make sure the composite is layed out
				if (this.contentAreaSize) {
					composite.layout(this.contentAreaSize);
				}
			});
		}, error => this.onError(error));
	}

	protected onTitleAreaUpdate(compositeId: string): void {

		// Active Composite
		if (this.activeComposite && this.activeComposite.getId() === compositeId) {

			// Title
			this.updateTitle(this.activeComposite.getId(), this.activeComposite.getTitle());

			// Actions
			const actionsBinding = this.collectCompositeActions(this.activeComposite);
			this.mapActionsBindingToComposite[this.activeComposite.getId()] = actionsBinding;
			actionsBinding();
		}

		// Otherwise invalidate actions binding for next time when the composite becomes visible
		else {
			delete this.mapActionsBindingToComposite[compositeId];
		}
	}

	private updateTitle(compositeId: string, compositeTitle?: string): void {
		const compositeDescriptor = this.registry.getComposite(compositeId);
		if (!compositeDescriptor || !this.titleLabel) {
			return;
		}

		if (!compositeTitle) {
			compositeTitle = compositeDescriptor.name;
		}

		const keybinding = this.keybindingService.lookupKeybinding(compositeId);

		this.titleLabel.updateTitle(compositeId, compositeTitle, keybinding ? keybinding.getLabel() : undefined);

		this.toolBar.setAriaLabel(nls.localize('ariaCompositeToolbarLabel', "{0} actions", compositeTitle));
	}

	private collectCompositeActions(composite: Composite): () => void {

		// From Composite
		const primaryActions: IAction[] = composite.getActions().slice(0);
		const secondaryActions: IAction[] = composite.getSecondaryActions().slice(0);

		// From Part
		primaryActions.push(...this.getActions());
		secondaryActions.push(...this.getSecondaryActions());

		// Return fn to set into toolbar
		return this.toolBar.setActions(prepareActions(primaryActions), prepareActions(secondaryActions));
	}

	protected getActiveComposite(): IComposite {
		return this.activeComposite;
	}

	protected getLastActiveCompositetId(): string {
		return this.lastActiveCompositeId;
	}

	protected hideActiveComposite(): TPromise<Composite> {
		if (!this.activeComposite) {
			return TPromise.as(null); // Nothing to do
		}

		const composite = this.activeComposite;
		this.activeComposite = null;

		const compositeContainer = this.mapCompositeToCompositeContainer[composite.getId()];

		// Indicate to Composite
		return composite.setVisible(false).then(() => {

			// Take Container Off-DOM and hide
			compositeContainer.offDOM();
			compositeContainer.hide();

			// Clear any running Progress
			this.progressBar.stop().hide();

			// Empty Actions
			this.toolBar.setActions([])();
			this._onDidCompositeClose.fire(composite);

			return composite;
		});
	}

	public createTitleArea(parent: Builder): Builder {

		// Title Area Container
		const titleArea = $(parent).div({
			'class': ['composite', 'title']
		});

		$(titleArea).on(EventType.CONTEXT_MENU, (e: MouseEvent) => this.onTitleAreaContextMenu(new StandardMouseEvent(e)));

		// Left Title Label
		this.titleLabel = this.createTitleLabel(titleArea);

		// Right Actions Container
		$(titleArea).div({
			'class': 'title-actions'
		}, div => {

			// Toolbar
			this.toolBar = new ToolBar(div.getHTMLElement(), this.contextMenuService, {
				actionItemProvider: action => this.actionItemProvider(action as Action),
				orientation: ActionsOrientation.HORIZONTAL,
				getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id)
			});
		});

		return titleArea;
	}

	protected createTitleLabel(parent: Builder): ICompositeTitleLabel {
		let titleLabel: Builder;
		$(parent).div({
			'class': 'title-label'
		}, div => {
			titleLabel = div.span();
		});

		const $this = this;
		return {
			updateTitle: (id, title, keybinding) => {
				titleLabel.safeInnerHtml(title);
				titleLabel.title(keybinding ? nls.localize('titleTooltip', "{0} ({1})", title, keybinding) : title);
			},
			updateStyles: () => {
				titleLabel.style('color', $this.getColor($this.titleForegroundColor));
			}
		};
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Forward to title label
		this.titleLabel.updateStyles();
	}

	private onTitleAreaContextMenu(event: StandardMouseEvent): void {
		if (this.activeComposite) {
			const contextMenuActions = this.getTitleAreaContextMenuActions();
			if (contextMenuActions.length) {
				const anchor: { x: number, y: number } = { x: event.posx, y: event.posy };
				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => TPromise.as(contextMenuActions),
					getActionItem: action => this.actionItemProvider(action as Action),
					actionRunner: this.activeComposite.getActionRunner(),
					getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id)
				});
			}
		}
	}

	protected getTitleAreaContextMenuActions(): IAction[] {
		return this.activeComposite ? this.activeComposite.getContextMenuActions() : [];
	}

	private actionItemProvider(action: Action): IActionItem {

		// Check Active Composite
		if (this.activeComposite) {
			return this.activeComposite.getActionItem(action);
		}

		return undefined;
	}

	public createContentArea(parent: Builder): Builder {
		return $(parent).div({
			'class': 'content'
		}, div => {
			this.progressBar = new ProgressBar(div.getHTMLElement());
			this.toUnbind.push(attachProgressBarStyler(this.progressBar, this.themeService));
			this.progressBar.hide();
		});
	}

	private onError(error: any): void {
		this.notificationService.error(types.isString(error) ? new Error(error) : error);
	}

	public getProgressIndicator(id: string): IProgressService {
		return this.mapProgressServiceToComposite[id];
	}

	protected getActions(): IAction[] {
		return [];
	}

	protected getSecondaryActions(): IAction[] {
		return [];
	}

	public layout(dimension: Dimension): Dimension[] {

		// Pass to super
		const sizes = super.layout(dimension);

		// Pass Contentsize to composite
		this.contentAreaSize = sizes[1];
		if (this.activeComposite) {
			this.activeComposite.layout(this.contentAreaSize);
		}

		return sizes;
	}

	public shutdown(): void {
		this.instantiatedComposites.forEach(i => i.shutdown());

		super.shutdown();
	}

	public dispose(): void {
		this.mapCompositeToCompositeContainer = null;
		this.mapProgressServiceToComposite = null;
		this.mapActionsBindingToComposite = null;

		for (let i = 0; i < this.instantiatedComposites.length; i++) {
			this.instantiatedComposites[i].dispose();
		}

		this.instantiatedComposites = [];

		this.instantiatedCompositeListeners = dispose(this.instantiatedCompositeListeners);

		this.progressBar.dispose();
		this.toolBar.dispose();

		// Super Dispose
		super.dispose();
	}
}
