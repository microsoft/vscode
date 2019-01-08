/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/compositepart';
import * as nls from 'vs/nls';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { Emitter } from 'vs/base/common/event';
import * as errors from 'vs/base/common/errors';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { prepareActions } from 'vs/workbench/browser/actions';
import { Action, IAction } from 'vs/base/common/actions';
import { Part, IPartOptions } from 'vs/workbench/browser/part';
import { Composite, CompositeRegistry } from 'vs/workbench/browser/composite';
import { IComposite } from 'vs/workbench/common/composite';
import { ScopedProgressService } from 'vs/workbench/services/progress/browser/progressService';
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
import { Dimension, append, $, addClass, hide, show, addClasses } from 'vs/base/browser/dom';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';

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

	protected _onDidCompositeOpen = this._register(new Emitter<{ composite: IComposite, focus: boolean }>());
	protected _onDidCompositeClose = this._register(new Emitter<IComposite>());

	protected toolBar: ToolBar;

	private instantiatedCompositeListeners: IDisposable[];
	private mapCompositeToCompositeContainer: { [compositeId: string]: HTMLElement; };
	private mapActionsBindingToComposite: { [compositeId: string]: () => void; };
	private mapProgressServiceToComposite: { [compositeId: string]: IProgressService; };
	private activeComposite: Composite | null;
	private lastActiveCompositeId: string;
	private instantiatedComposites: Composite[];
	private titleLabel: ICompositeTitleLabel;
	private progressBar: ProgressBar;
	private contentAreaSize: Dimension;
	private telemetryActionsListener: IDisposable | null;
	private currentCompositeOpenToken: string;

	constructor(
		private notificationService: INotificationService,
		protected storageService: IStorageService,
		private telemetryService: ITelemetryService,
		protected contextMenuService: IContextMenuService,
		protected partService: IPartService,
		protected keybindingService: IKeybindingService,
		protected instantiationService: IInstantiationService,
		themeService: IThemeService,
		protected readonly registry: CompositeRegistry<T>,
		private activeCompositeSettingsKey: string,
		private defaultCompositeId: string,
		private nameForTelemetry: string,
		private compositeCSSClass: string,
		private titleForegroundColor: string,
		id: string,
		options: IPartOptions
	) {
		super(id, options, themeService, storageService);

		this.instantiatedCompositeListeners = [];
		this.mapCompositeToCompositeContainer = {};
		this.mapActionsBindingToComposite = {};
		this.mapProgressServiceToComposite = {};
		this.activeComposite = null;
		this.instantiatedComposites = [];
		this.lastActiveCompositeId = storageService.get(activeCompositeSettingsKey, StorageScope.WORKSPACE, this.defaultCompositeId);
	}

	protected openComposite(id: string, focus?: boolean): Composite | undefined {
		// Check if composite already visible and just focus in that case
		if (this.activeComposite && this.activeComposite.getId() === id) {
			if (focus) {
				this.activeComposite.focus();
			}

			// Fullfill promise with composite that is being opened
			return this.activeComposite;
		}

		// Open
		return this.doOpenComposite(id, focus);
	}

	private doOpenComposite(id: string, focus: boolean = false): Composite | undefined {

		// Use a generated token to avoid race conditions from long running promises
		const currentCompositeOpenToken = defaultGenerator.nextId();
		this.currentCompositeOpenToken = currentCompositeOpenToken;

		// Hide current
		if (this.activeComposite) {
			this.hideActiveComposite();
		}

		// Update Title
		this.updateTitle(id);

		// Create composite
		const composite = this.createComposite(id, true);

		// Check if another composite opened meanwhile and return in that case
		if ((this.currentCompositeOpenToken !== currentCompositeOpenToken) || (this.activeComposite && this.activeComposite.getId() !== composite.getId())) {
			return undefined;
		}

		// Check if composite already visible and just focus in that case
		if (this.activeComposite && this.activeComposite.getId() === composite.getId()) {
			if (focus) {
				composite.focus();
			}

			this._onDidCompositeOpen.fire({ composite, focus });
			return composite;
		}

		// Show Composite and Focus
		this.showComposite(composite);
		if (focus) {
			composite.focus();
		}

		// Return with the composite that is being opened
		if (composite) {
			this._onDidCompositeOpen.fire({ composite, focus });
		}

		return composite;
	}

	protected createComposite(id: string, isActive?: boolean): Composite {

		// Check if composite is already created
		for (const composite of this.instantiatedComposites) {
			if (composite.getId() === id) {
				return composite;
			}
		}

		// Instantiate composite from registry otherwise
		const compositeDescriptor = this.registry.getComposite(id);
		if (compositeDescriptor) {
			const progressService = this.instantiationService.createInstance(ScopedProgressService, this.progressBar, compositeDescriptor.id, isActive);
			const compositeInstantiationService = this.instantiationService.createChild(new ServiceCollection([IProgressService, progressService]));

			const composite = compositeDescriptor.instantiate(compositeInstantiationService);
			this.mapProgressServiceToComposite[composite.getId()] = progressService;

			// Remember as Instantiated
			this.instantiatedComposites.push(composite);

			// Register to title area update events from the composite
			this.instantiatedCompositeListeners.push(composite.onTitleAreaUpdate(() => this.onTitleAreaUpdate(composite.getId())));

			return composite;
		}

		throw new Error(`Unable to find composite with id ${id}`);
	}

	protected showComposite(composite: Composite): void {

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

		// Composites created for the first time
		let compositeContainer = this.mapCompositeToCompositeContainer[composite.getId()];
		if (!compositeContainer) {

			// Build Container off-DOM
			compositeContainer = $('.composite');
			addClasses(compositeContainer, this.compositeCSSClass);
			compositeContainer.id = composite.getId();

			composite.create(compositeContainer);
			composite.updateStyles();

			// Remember composite container
			this.mapCompositeToCompositeContainer[composite.getId()] = compositeContainer;
		}

		// Report progress for slow loading composites (but only if we did not create the composites before already)
		const progressService = this.mapProgressServiceToComposite[composite.getId()];
		if (progressService && !compositeContainer) {
			this.mapProgressServiceToComposite[composite.getId()].showWhile(Promise.resolve(), this.partService.isRestored() ? 800 : 3200 /* less ugly initial startup */);
		}

		// Fill Content and Actions
		// Make sure that the user meanwhile did not open another composite or closed the part containing the composite
		if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
			return undefined;
		}

		// Take Composite on-DOM and show
		const contentArea = this.getContentArea();
		if (contentArea) {
			contentArea.appendChild(compositeContainer);
		}
		show(compositeContainer);

		// Setup action runner
		this.toolBar.actionRunner = composite.getActionRunner();

		// Update title with composite title if it differs from descriptor
		const descriptor = this.registry.getComposite(composite.getId());
		if (descriptor && descriptor.name !== composite.getTitle()) {
			this.updateTitle(composite.getId(), composite.getTitle() || undefined);
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
		composite.setVisible(true);

		// Make sure that the user meanwhile did not open another composite or closed the part containing the composite
		if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
			return;
		}

		// Make sure the composite is layed out
		if (this.contentAreaSize) {
			composite.layout(this.contentAreaSize);
		}
	}

	protected onTitleAreaUpdate(compositeId: string): void {

		// Active Composite
		if (this.activeComposite && this.activeComposite.getId() === compositeId) {

			// Title
			this.updateTitle(this.activeComposite.getId(), this.activeComposite.getTitle() || undefined);

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

		this.titleLabel.updateTitle(compositeId, compositeTitle, (keybinding && keybinding.getLabel()) || undefined);

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

	protected getActiveComposite(): IComposite | null {
		return this.activeComposite;
	}

	protected getLastActiveCompositetId(): string {
		return this.lastActiveCompositeId;
	}

	protected hideActiveComposite(): Composite | undefined {
		if (!this.activeComposite) {
			return undefined; // Nothing to do
		}

		const composite = this.activeComposite;
		this.activeComposite = null;

		const compositeContainer = this.mapCompositeToCompositeContainer[composite.getId()];

		// Indicate to Composite
		composite.setVisible(false);

		// Take Container Off-DOM and hide
		compositeContainer.remove();
		hide(compositeContainer);

		// Clear any running Progress
		this.progressBar.stop().hide();

		// Empty Actions
		this.toolBar.setActions([])();
		this._onDidCompositeClose.fire(composite);

		return composite;
	}

	createTitleArea(parent: HTMLElement): HTMLElement {

		// Title Area Container
		const titleArea = append(parent, $('.composite'));
		addClass(titleArea, 'title');

		// Left Title Label
		this.titleLabel = this.createTitleLabel(titleArea);

		// Right Actions Container
		const titleActionsContainer = append(titleArea, $('.title-actions'));

		// Toolbar
		this.toolBar = this._register(new ToolBar(titleActionsContainer, this.contextMenuService, {
			actionItemProvider: action => this.actionItemProvider(action as Action),
			orientation: ActionsOrientation.HORIZONTAL,
			getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
			anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment()
		}));

		return titleArea;
	}

	protected createTitleLabel(parent: HTMLElement): ICompositeTitleLabel {
		const titleContainer = append(parent, $('.title-label'));
		const titleLabel = append(titleContainer, $('h2'));

		const $this = this;
		return {
			updateTitle: (id, title, keybinding) => {
				titleLabel.innerHTML = strings.escape(title);
				titleLabel.title = keybinding ? nls.localize('titleTooltip', "{0} ({1})", title, keybinding) : title;
			},

			updateStyles: () => {
				titleLabel.style.color = $this.getColor($this.titleForegroundColor);
			}
		};
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Forward to title label
		this.titleLabel.updateStyles();
	}

	protected actionItemProvider(action: Action): IActionItem | null {

		// Check Active Composite
		if (this.activeComposite) {
			return this.activeComposite.getActionItem(action);
		}

		return null;
	}

	createContentArea(parent: HTMLElement): HTMLElement {
		const contentContainer = append(parent, $('.content'));

		this.progressBar = this._register(new ProgressBar(contentContainer));
		this._register(attachProgressBarStyler(this.progressBar, this.themeService));
		this.progressBar.hide();

		return contentContainer;
	}

	getProgressIndicator(id: string): IProgressService {
		return this.mapProgressServiceToComposite[id];
	}

	protected getActions(): IAction[] {
		return [];
	}

	protected getSecondaryActions(): IAction[] {
		return [];
	}

	protected getTitleAreaDropDownAnchorAlignment(): AnchorAlignment {
		return AnchorAlignment.RIGHT;
	}

	layout(dimension: Dimension): Dimension[] {

		// Pass to super
		const sizes = super.layout(dimension);

		// Pass Contentsize to composite
		this.contentAreaSize = sizes[1];
		if (this.activeComposite) {
			this.activeComposite.layout(this.contentAreaSize);
		}

		return sizes;
	}

	dispose(): void {
		this.mapCompositeToCompositeContainer = null!; // StrictNullOverride: nulling out ok in dispose
		this.mapProgressServiceToComposite = null!; // StrictNullOverride: nulling out ok in dispose
		this.mapActionsBindingToComposite = null!; // StrictNullOverride: nulling out ok in dispose

		for (const composite of this.instantiatedComposites) {
			composite.dispose();
		}

		this.instantiatedComposites = [];
		this.instantiatedCompositeListeners = dispose(this.instantiatedCompositeListeners);

		super.dispose();
	}
}
