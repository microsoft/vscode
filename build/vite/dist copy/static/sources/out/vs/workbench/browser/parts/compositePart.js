/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/compositepart.css';
import { localize } from '../../../nls.js';
import { defaultGenerator } from '../../../base/common/idGenerator.js';
import { dispose, DisposableStore, MutableDisposable, } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { isCancellationError } from '../../../base/common/errors.js';
import { prepareActions } from '../../../base/browser/ui/actionbar/actionbar.js';
import { ProgressBar } from '../../../base/browser/ui/progressbar/progressbar.js';
import { Part } from '../part.js';
import { ServiceCollection } from '../../../platform/instantiation/common/serviceCollection.js';
import { IEditorProgressService } from '../../../platform/progress/common/progress.js';
import { Dimension, append, $, hide, show } from '../../../base/browser/dom.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { createActionViewItem } from '../../../platform/actions/browser/menuEntryActionViewItem.js';
import { AbstractProgressScope, ScopedProgressIndicator } from '../../services/progress/browser/progressIndicator.js';
import { WorkbenchToolBar } from '../../../platform/actions/browser/toolbar.js';
import { defaultProgressBarStyles } from '../../../platform/theme/browser/defaultStyles.js';
import { createInstantHoverDelegate, getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
export class CompositePart extends Part {
    constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, registry, activeCompositeSettingsKey, defaultCompositeId, nameForTelemetry, compositeCSSClass, titleForegroundColor, titleBorderColor, id, options) {
        super(id, options, themeService, storageService, layoutService);
        this.notificationService = notificationService;
        this.storageService = storageService;
        this.contextMenuService = contextMenuService;
        this.keybindingService = keybindingService;
        this.hoverService = hoverService;
        this.instantiationService = instantiationService;
        this.registry = registry;
        this.activeCompositeSettingsKey = activeCompositeSettingsKey;
        this.defaultCompositeId = defaultCompositeId;
        this.nameForTelemetry = nameForTelemetry;
        this.compositeCSSClass = compositeCSSClass;
        this.titleForegroundColor = titleForegroundColor;
        this.titleBorderColor = titleBorderColor;
        this.onDidCompositeOpen = this._register(new Emitter());
        this.onDidCompositeClose = this._register(new Emitter());
        this.mapCompositeToCompositeContainer = new Map();
        this.mapActionsBindingToComposite = new Map();
        this.instantiatedCompositeItems = new Map();
        this.actionsListener = this._register(new MutableDisposable());
        this.lastActiveCompositeId = storageService.get(activeCompositeSettingsKey, 1 /* StorageScope.WORKSPACE */, this.defaultCompositeId);
        this.toolbarHoverDelegate = this._register(createInstantHoverDelegate());
        this.trailingSeparator = options.trailingSeparator ?? false;
    }
    openComposite(id, focus) {
        // Check if composite already visible and just focus in that case
        if (this.activeComposite?.getId() === id) {
            if (focus) {
                this.activeComposite.focus();
            }
            // Fullfill promise with composite that is being opened
            return this.activeComposite;
        }
        // We cannot open the composite if we have not been created yet
        if (!this.element) {
            return;
        }
        // Open
        return this.doOpenComposite(id, focus);
    }
    doOpenComposite(id, focus = false) {
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
        if (this.activeComposite?.getId() === composite.getId()) {
            if (focus) {
                composite.focus();
            }
            this.onDidCompositeOpen.fire({ composite, focus });
            return composite;
        }
        // Show Composite and Focus
        this.showComposite(composite);
        if (focus) {
            composite.focus();
        }
        // Return with the composite that is being opened
        if (composite) {
            this.onDidCompositeOpen.fire({ composite, focus });
        }
        return composite;
    }
    createComposite(id, isActive) {
        // Check if composite is already created
        const compositeItem = this.instantiatedCompositeItems.get(id);
        if (compositeItem) {
            return compositeItem.composite;
        }
        // Instantiate composite from registry otherwise
        const compositeDescriptor = this.registry.getComposite(id);
        if (compositeDescriptor) {
            const that = this;
            const compositeProgressIndicator = new ScopedProgressIndicator(assertReturnsDefined(this.progressBar), this._register(new class extends AbstractProgressScope {
                constructor() {
                    super(compositeDescriptor.id, !!isActive);
                    this._register(that.onDidCompositeOpen.event(e => this.onScopeOpened(e.composite.getId())));
                    this._register(that.onDidCompositeClose.event(e => this.onScopeClosed(e.getId())));
                }
            }()));
            const compositeInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IEditorProgressService, compositeProgressIndicator] // provide the editor progress service for any editors instantiated within the composite
            )));
            const composite = compositeDescriptor.instantiate(compositeInstantiationService);
            const disposable = new DisposableStore();
            // Remember as Instantiated
            this.instantiatedCompositeItems.set(id, { composite, disposable, progress: compositeProgressIndicator });
            // Register to title area update events from the composite
            disposable.add(composite.onTitleAreaUpdate(() => this.onTitleAreaUpdate(composite.getId()), this));
            disposable.add(compositeInstantiationService);
            return composite;
        }
        throw new Error(`Unable to find composite with id ${id}`);
    }
    showComposite(composite) {
        // Remember Composite
        this.activeComposite = composite;
        // Store in preferences
        const id = this.activeComposite.getId();
        if (id !== this.defaultCompositeId) {
            this.storageService.store(this.activeCompositeSettingsKey, id, 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(this.activeCompositeSettingsKey, 1 /* StorageScope.WORKSPACE */);
        }
        // Remember
        this.lastActiveCompositeId = this.activeComposite.getId();
        // Composites created for the first time
        let compositeContainer = this.mapCompositeToCompositeContainer.get(composite.getId());
        if (!compositeContainer) {
            // Build Container off-DOM
            compositeContainer = $('.composite');
            compositeContainer.classList.add(...this.compositeCSSClass.split(' '));
            compositeContainer.id = composite.getId();
            composite.create(compositeContainer);
            composite.updateStyles();
            // Remember composite container
            this.mapCompositeToCompositeContainer.set(composite.getId(), compositeContainer);
        }
        // Fill Content and Actions
        // Make sure that the user meanwhile did not open another composite or closed the part containing the composite
        if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
            return undefined;
        }
        // Take Composite on-DOM and show
        this.contentArea?.appendChild(compositeContainer);
        show(compositeContainer);
        // Setup action runner
        if (this.toolBar) {
            this.toolBar.actionRunner = composite.getActionRunner();
        }
        // Update title with composite title if it differs from descriptor
        const descriptor = this.registry.getComposite(composite.getId());
        if (descriptor && descriptor.name !== composite.getTitle()) {
            this.updateTitle(composite.getId(), composite.getTitle());
        }
        // Handle Composite Actions
        let actionsBinding = this.mapActionsBindingToComposite.get(composite.getId());
        if (!actionsBinding) {
            actionsBinding = this.collectCompositeActions(composite);
            this.mapActionsBindingToComposite.set(composite.getId(), actionsBinding);
        }
        actionsBinding();
        // Action Run Handling
        if (this.toolBar) {
            this.actionsListener.value = this.toolBar.actionRunner.onDidRun(e => {
                // Check for Error
                if (e.error && !isCancellationError(e.error)) {
                    this.notificationService.error(e.error);
                }
            });
        }
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
        // Make sure boundary sashes are propagated
        if (this.boundarySashes) {
            composite.setBoundarySashes(this.boundarySashes);
        }
    }
    onTitleAreaUpdate(compositeId) {
        // Title
        const composite = this.instantiatedCompositeItems.get(compositeId);
        if (composite) {
            this.updateTitle(compositeId, composite.composite.getTitle());
        }
        // Active Composite
        if (this.activeComposite?.getId() === compositeId) {
            // Actions
            const actionsBinding = this.collectCompositeActions(this.activeComposite);
            this.mapActionsBindingToComposite.set(this.activeComposite.getId(), actionsBinding);
            actionsBinding();
        }
        // Otherwise invalidate actions binding for next time when the composite becomes visible
        else {
            this.mapActionsBindingToComposite.delete(compositeId);
        }
    }
    updateTitle(compositeId, compositeTitle) {
        const compositeDescriptor = this.registry.getComposite(compositeId);
        if (!compositeDescriptor || !this.titleLabel) {
            return;
        }
        if (!compositeTitle) {
            compositeTitle = compositeDescriptor.name;
        }
        const keybinding = this.keybindingService.lookupKeybinding(compositeId);
        this.titleLabel.updateTitle(compositeId, compositeTitle, keybinding?.getLabel() ?? undefined);
        this.toolBar?.setAriaLabel(localize('ariaCompositeToolbarLabel', "{0} actions", compositeTitle));
    }
    collectCompositeActions(composite) {
        // From Composite
        const menuIds = composite?.getMenuIds();
        const primaryActions = composite?.getActions().slice(0) || [];
        const secondaryActions = composite?.getSecondaryActions().slice(0) || [];
        // Update context
        if (this.toolBar) {
            this.toolBar.context = this.actionsContextProvider();
        }
        // Return fn to set into toolbar
        return () => {
            this.toolBar?.setActions(prepareActions(primaryActions), prepareActions(secondaryActions), menuIds);
            this.titleArea?.classList.toggle('has-actions', primaryActions.length > 0 || secondaryActions.length > 0);
        };
    }
    getActiveComposite() {
        return this.activeComposite;
    }
    getLastActiveCompositeId() {
        return this.lastActiveCompositeId;
    }
    hideActiveComposite() {
        if (!this.activeComposite) {
            return undefined; // Nothing to do
        }
        const composite = this.activeComposite;
        this.activeComposite = undefined;
        const compositeContainer = this.mapCompositeToCompositeContainer.get(composite.getId());
        // Indicate to Composite
        composite.setVisible(false);
        // Take Container Off-DOM and hide
        if (compositeContainer) {
            compositeContainer.remove();
            hide(compositeContainer);
        }
        // Clear any running Progress
        this.progressBar?.stop().hide();
        // Empty Actions
        if (this.toolBar) {
            this.collectCompositeActions()();
        }
        this.onDidCompositeClose.fire(composite);
        return composite;
    }
    createTitleArea(parent) {
        if (!this.options.hasTitle) {
            return undefined;
        }
        // Title Area Container
        const titleArea = append(parent, $('.composite'));
        titleArea.classList.add('title');
        // Left Title Label
        this.titleLabel = this.createTitleLabel(titleArea);
        // Right Actions Container
        const titleActionsContainer = append(titleArea, $('.title-actions'));
        // Toolbar
        this.toolBar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, titleActionsContainer, {
            actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
            orientation: 0 /* ActionsOrientation.HORIZONTAL */,
            getKeyBinding: action => this.keybindingService.lookupKeybinding(action.id),
            anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
            toggleMenuTitle: localize('viewsAndMoreActions', "Views and More Actions..."),
            telemetrySource: this.nameForTelemetry,
            hoverDelegate: this.toolbarHoverDelegate,
            trailingSeparator: this.trailingSeparator,
        }));
        this.collectCompositeActions()();
        return titleArea;
    }
    createTitleLabel(parent) {
        const titleContainer = append(parent, $('.title-label'));
        const titleLabel = append(titleContainer, $('h2'));
        this.titleLabelElement = titleLabel;
        const hover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), titleLabel, ''));
        const $this = this;
        return {
            updateTitle: (id, title, keybinding) => {
                // The title label is shared for all composites in the base CompositePart
                if (!this.activeComposite || this.activeComposite.getId() === id) {
                    titleLabel.textContent = title;
                    hover.update(keybinding ? localize('titleTooltip', "{0} ({1})", title, keybinding) : title);
                }
            },
            updateStyles: () => {
                titleLabel.style.color = $this.titleForegroundColor ? $this.getColor($this.titleForegroundColor) || '' : '';
                const borderColor = $this.titleBorderColor ? $this.getColor($this.titleBorderColor) : undefined;
                parent.style.borderBottom = borderColor ? `1px solid ${borderColor}` : '';
            }
        };
    }
    createHeaderArea() {
        return $('.composite');
    }
    createFooterArea() {
        return $('.composite');
    }
    updateStyles() {
        super.updateStyles();
        // Forward to title label if present
        this.titleLabel?.updateStyles();
    }
    actionViewItemProvider(action, options) {
        // Check Active Composite
        if (this.activeComposite) {
            return this.activeComposite.getActionViewItem(action, options);
        }
        return createActionViewItem(this.instantiationService, action, options);
    }
    actionsContextProvider() {
        // Check Active Composite
        if (this.activeComposite) {
            return this.activeComposite.getActionsContext();
        }
        return null;
    }
    createContentArea(parent) {
        const contentContainer = append(parent, $('.content'));
        this.progressBar = this._register(new ProgressBar(contentContainer, defaultProgressBarStyles));
        this.progressBar.hide();
        return contentContainer;
    }
    getProgressIndicator(id) {
        const compositeItem = this.instantiatedCompositeItems.get(id);
        return compositeItem ? compositeItem.progress : undefined;
    }
    getTitleAreaDropDownAnchorAlignment() {
        return 1 /* AnchorAlignment.RIGHT */;
    }
    layout(width, height, top, left) {
        super.layout(width, height, top, left);
        // Layout contents
        this.contentAreaSize = Dimension.lift(super.layoutContents(width, height).contentSize);
        // Layout composite
        this.activeComposite?.layout(this.contentAreaSize);
    }
    setBoundarySashes(sashes) {
        this.boundarySashes = sashes;
        this.activeComposite?.setBoundarySashes(sashes);
    }
    removeComposite(compositeId) {
        if (this.activeComposite?.getId() === compositeId) {
            return false; // do not remove active composite
        }
        this.mapCompositeToCompositeContainer.delete(compositeId);
        this.mapActionsBindingToComposite.delete(compositeId);
        const compositeItem = this.instantiatedCompositeItems.get(compositeId);
        if (compositeItem) {
            compositeItem.composite.dispose();
            dispose(compositeItem.disposable);
            this.instantiatedCompositeItems.delete(compositeId);
        }
        return true;
    }
    dispose() {
        this.mapCompositeToCompositeContainer.clear();
        this.mapActionsBindingToComposite.clear();
        this.instantiatedCompositeItems.forEach(compositeItem => {
            compositeItem.composite.dispose();
            dispose(compositeItem.disposable);
        });
        this.instantiatedCompositeItems.clear();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9zaXRlUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2NvbXBvc2l0ZVBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTywyQkFBMkIsQ0FBQztBQUNuQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDdkUsT0FBTyxFQUFlLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEdBQUcsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckUsT0FBTyxFQUF1QyxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN0SCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFbEYsT0FBTyxFQUFFLElBQUksRUFBZ0IsTUFBTSxZQUFZLENBQUM7QUFPaEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEcsT0FBTyxFQUFzQixzQkFBc0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBSTNHLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFaEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDckUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDcEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0RBQXNELENB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