/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EditorGroupView_1;
import './media/editorgroupview.css';
import { EditorGroupModel, isGroupEditorCloseEvent, isGroupEditorOpenEvent, isSerializedEditorGroupModel } from '../../../common/editor/editorGroupModel.js';
import { EditorResourceAccessor, DEFAULT_EDITOR_ASSOCIATION, SideBySideEditor, EditorCloseContext, TEXT_DIFF_EDITOR_ID } from '../../../common/editor.js';
import { ActiveEditorGroupLockedContext, ActiveEditorDirtyContext, EditorGroupEditorsCountContext, ActiveEditorStickyContext, ActiveEditorPinnedContext, ActiveEditorLastInGroupContext, ActiveEditorFirstInGroupContext, ResourceContextKey, applyAvailableEditorIds, ActiveEditorAvailableEditorIdsContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, TextCompareEditorVisibleContext, TextCompareEditorActiveContext, ActiveEditorContext, ActiveEditorReadonlyContext, ActiveEditorCanRevertContext, ActiveEditorCanToggleReadonlyContext, ActiveCompareEditorCanSwapContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey } from '../../../common/contextkeys.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { Emitter, Relay } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Dimension, trackFocus, addDisposableListener, EventType, EventHelper, findParentWithClass, isAncestor, isMouseEvent, isActiveElement, getWindow, getActiveElement, $ } from '../../../../base/browser/dom.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { editorBackground, contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_GROUP_HEADER_TABS_BACKGROUND, EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND, EDITOR_GROUP_EMPTY_BACKGROUND, EDITOR_GROUP_HEADER_BORDER } from '../../../common/theme.js';
import { EditorPanes } from './editorPanes.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { EditorProgressIndicator } from '../../../services/progress/browser/progressIndicator.js';
import { localize } from '../../../../nls.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DeferredPromise, Promises, RunOnceWorker } from '../../../../base/common/async.js';
import { EventType as TouchEventType } from '../../../../base/browser/touch.js';
import { fillActiveEditorViewState } from './editor.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { hash } from '../../../../base/common/hash.js';
import { getMimeTypes } from '../../../../editor/common/services/languagesAssociations.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { EditorActivation } from '../../../../platform/editor/common/editor.js';
import { IFileDialogService, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isLinux, isMacintosh, isNative, isWindows } from '../../../../base/common/platform.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { EditorGroupWatermark } from './editorGroupWatermark.js';
import { EditorTitleControl } from './editorTitleControl.js';
import { EditorPane } from './editorPane.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { IFileService } from '../../../../platform/files/common/files.js';
let EditorGroupView = EditorGroupView_1 = class EditorGroupView extends Themable {
    //#region factory
    static createNew(editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
        return instantiationService.createInstance(EditorGroupView_1, null, editorPartsView, groupsView, groupsLabel, groupIndex, options);
    }
    static createFromSerialized(serialized, editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
        return instantiationService.createInstance(EditorGroupView_1, serialized, editorPartsView, groupsView, groupsLabel, groupIndex, options);
    }
    static createCopy(copyFrom, editorPartsView, groupsView, groupsLabel, groupIndex, instantiationService, options) {
        return instantiationService.createInstance(EditorGroupView_1, copyFrom, editorPartsView, groupsView, groupsLabel, groupIndex, options);
    }
    constructor(from, editorPartsView, groupsView, groupsLabel, _index, options, instantiationService, contextKeyService, themeService, telemetryService, keybindingService, menuService, contextMenuService, fileDialogService, editorService, filesConfigurationService, uriIdentityService, logService, editorResolverService, hostService, dialogService, fileService) {
        super(themeService);
        this.editorPartsView = editorPartsView;
        this.groupsView = groupsView;
        this.groupsLabel = groupsLabel;
        this._index = _index;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.telemetryService = telemetryService;
        this.keybindingService = keybindingService;
        this.menuService = menuService;
        this.contextMenuService = contextMenuService;
        this.fileDialogService = fileDialogService;
        this.editorService = editorService;
        this.filesConfigurationService = filesConfigurationService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this.editorResolverService = editorResolverService;
        this.hostService = hostService;
        this.dialogService = dialogService;
        this.fileService = fileService;
        //#region events
        this._onDidFocus = this._register(new Emitter());
        this.onDidFocus = this._onDidFocus.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        this._onDidModelChange = this._register(new Emitter());
        this.onDidModelChange = this._onDidModelChange.event;
        this._onDidActiveEditorChange = this._register(new Emitter());
        this.onDidActiveEditorChange = this._onDidActiveEditorChange.event;
        this._onDidOpenEditorFail = this._register(new Emitter());
        this.onDidOpenEditorFail = this._onDidOpenEditorFail.event;
        this._onWillCloseEditor = this._register(new Emitter());
        this.onWillCloseEditor = this._onWillCloseEditor.event;
        this._onDidCloseEditor = this._register(new Emitter());
        this.onDidCloseEditor = this._onDidCloseEditor.event;
        this._onWillMoveEditor = this._register(new Emitter());
        this.onWillMoveEditor = this._onWillMoveEditor.event;
        this._onWillOpenEditor = this._register(new Emitter());
        this.onWillOpenEditor = this._onWillOpenEditor.event;
        this.disposedEditorsWorker = this._register(new RunOnceWorker(editors => this.handleDisposedEditors(editors), 0));
        this.mapEditorToPendingConfirmation = new Map();
        this.containerToolBarMenuDisposable = this._register(new MutableDisposable());
        this.whenRestoredPromise = new DeferredPromise();
        this.whenRestored = this.whenRestoredPromise.p;
        this._disposed = false;
        //#endregion
        //#region ISerializableView
        this.element = $('div');
        this._onDidChange = this._register(new Relay());
        this.onDidChange = this._onDidChange.event;
        if (from instanceof EditorGroupView_1) {
            this.model = this._register(from.model.clone());
        }
        else if (isSerializedEditorGroupModel(from)) {
            this.model = this._register(instantiationService.createInstance(EditorGroupModel, from));
        }
        else {
            this.model = this._register(instantiationService.createInstance(EditorGroupModel, undefined));
        }
        //#region create()
        {
            // Scoped context key service
            this.scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
            // Container
            this.element.classList.add(...coalesce(['editor-group-container', this.model.isLocked ? 'locked' : undefined]));
            // Container listeners
            this.registerContainerListeners();
            // Container toolbar
            this.createContainerToolbar();
            // Container context menu
            this.createContainerContextMenu();
            // Watermark & shortcuts
            this._register(this.instantiationService.createInstance(EditorGroupWatermark, this.element));
            // Progress bar
            this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
            this.progressBar.hide();
            // Scoped instantiation service
            this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService], [IEditorProgressService, this._register(new EditorProgressIndicator(this.progressBar, this))])));
            // Context keys
            this.resourceContext = this._register(this.scopedInstantiationService.createInstance(ResourceContextKey));
            this.handleGroupContextKeys();
            // Title container
            this.titleContainer = $('.title');
            this.element.appendChild(this.titleContainer);
            // Title control
            this.titleControl = this._register(this.scopedInstantiationService.createInstance(EditorTitleControl, this.titleContainer, this.editorPartsView, this.groupsView, this, this.model));
            // Editor container
            this.editorContainer = $('.editor-container');
            this.element.appendChild(this.editorContainer);
            // Editor pane
            this.editorPane = this._register(this.scopedInstantiationService.createInstance(EditorPanes, this.element, this.editorContainer, this));
            this._onDidChange.input = this.editorPane.onDidChangeSizeConstraints;
            // Track Focus
            this.doTrackFocus();
            // Update containers
            this.updateTitleContainer();
            this.updateContainer();
            // Update styles
            this.updateStyles();
        }
        //#endregion
        // Restore editors if provided
        const restoreEditorsPromise = this.restoreEditors(from, options) ?? Promise.resolve();
        // Signal restored once editors have restored
        restoreEditorsPromise.finally(() => {
            this.whenRestoredPromise.complete();
        });
        // Register Listeners
        this.registerListeners();
    }
    handleGroupContextKeys() {
        const groupActiveEditorDirtyContext = this.editorPartsView.bind(ActiveEditorDirtyContext, this);
        const groupActiveEditorPinnedContext = this.editorPartsView.bind(ActiveEditorPinnedContext, this);
        const groupActiveEditorFirstContext = this.editorPartsView.bind(ActiveEditorFirstInGroupContext, this);
        const groupActiveEditorLastContext = this.editorPartsView.bind(ActiveEditorLastInGroupContext, this);
        const groupActiveEditorStickyContext = this.editorPartsView.bind(ActiveEditorStickyContext, this);
        const groupEditorsCountContext = this.editorPartsView.bind(EditorGroupEditorsCountContext, this);
        const groupLockedContext = this.editorPartsView.bind(ActiveEditorGroupLockedContext, this);
        const multipleEditorsSelectedContext = MultipleEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
        const twoEditorsSelectedContext = TwoEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
        const selectedEditorsHaveFileOrUntitledResourceContext = SelectedEditorsInGroupFileOrUntitledResourceContextKey.bindTo(this.scopedContextKeyService);
        const groupActiveEditorContext = this.editorPartsView.bind(ActiveEditorContext, this);
        const groupActiveEditorIsReadonly = this.editorPartsView.bind(ActiveEditorReadonlyContext, this);
        const groupActiveEditorCanRevert = this.editorPartsView.bind(ActiveEditorCanRevertContext, this);
        const groupActiveEditorCanToggleReadonly = this.editorPartsView.bind(ActiveEditorCanToggleReadonlyContext, this);
        const groupActiveCompareEditorCanSwap = this.editorPartsView.bind(ActiveCompareEditorCanSwapContext, this);
        const groupTextCompareEditorVisibleContext = this.editorPartsView.bind(TextCompareEditorVisibleContext, this);
        const groupTextCompareEditorActiveContext = this.editorPartsView.bind(TextCompareEditorActiveContext, this);
        const groupActiveEditorAvailableEditorIds = this.editorPartsView.bind(ActiveEditorAvailableEditorIdsContext, this);
        const groupActiveEditorCanSplitInGroupContext = this.editorPartsView.bind(ActiveEditorCanSplitInGroupContext, this);
        const groupActiveEditorIsSideBySideEditorContext = this.editorPartsView.bind(SideBySideEditorActiveContext, this);
        const activeEditorListener = this._register(new MutableDisposable());
        const observeActiveEditor = () => {
            activeEditorListener.clear();
            this.scopedContextKeyService.bufferChangeEvents(() => {
                const activeEditor = this.activeEditor;
                const activeEditorPane = this.activeEditorPane;
                this.resourceContext.set(EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }));
                applyAvailableEditorIds(groupActiveEditorAvailableEditorIds, activeEditor, this.editorResolverService);
                if (activeEditor) {
                    groupActiveEditorCanSplitInGroupContext.set(activeEditor.hasCapability(32 /* EditorInputCapabilities.CanSplitInGroup */));
                    groupActiveEditorIsSideBySideEditorContext.set(activeEditor.typeId === SideBySideEditorInput.ID);
                    groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
                    activeEditorListener.value = activeEditor.onDidChangeDirty(() => {
                        groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
                    });
                }
                else {
                    groupActiveEditorCanSplitInGroupContext.set(false);
                    groupActiveEditorIsSideBySideEditorContext.set(false);
                    groupActiveEditorDirtyContext.set(false);
                }
                if (activeEditorPane) {
                    groupActiveEditorContext.set(activeEditorPane.getId());
                    groupActiveEditorCanRevert.set(!activeEditorPane.input.hasCapability(4 /* EditorInputCapabilities.Untitled */));
                    groupActiveEditorIsReadonly.set(!!activeEditorPane.input.isReadonly());
                    const primaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
                    const secondaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.SECONDARY });
                    groupActiveCompareEditorCanSwap.set(activeEditorPane.input instanceof DiffEditorInput && !activeEditorPane.input.original.isReadonly() && !!primaryEditorResource && (this.fileService.hasProvider(primaryEditorResource) || primaryEditorResource.scheme === Schemas.untitled) && !!secondaryEditorResource && (this.fileService.hasProvider(secondaryEditorResource) || secondaryEditorResource.scheme === Schemas.untitled));
                    groupActiveEditorCanToggleReadonly.set(!!primaryEditorResource && this.fileService.hasProvider(primaryEditorResource) && !this.fileService.hasCapability(primaryEditorResource, 2048 /* FileSystemProviderCapabilities.Readonly */));
                    const activePaneDiffEditor = activeEditorPane?.getId() === TEXT_DIFF_EDITOR_ID;
                    groupTextCompareEditorActiveContext.set(activePaneDiffEditor);
                    groupTextCompareEditorVisibleContext.set(activePaneDiffEditor);
                }
                else {
                    groupActiveEditorContext.reset();
                    groupActiveEditorCanRevert.reset();
                    groupActiveEditorIsReadonly.reset();
                    groupActiveCompareEditorCanSwap.reset();
                    groupActiveEditorCanToggleReadonly.reset();
                }
            });
        };
        // Update group contexts based on group changes
        const updateGroupContextKeys = (e) => {
            switch (e.kind) {
                case 3 /* GroupModelChangeKind.GROUP_LOCKED */:
                    groupLockedContext.set(this.isLocked);
                    break;
                case 8 /* GroupModelChangeKind.EDITOR_ACTIVE */:
                    groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
                    groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
                    groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
                    groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
                    break;
                case 6 /* GroupModelChangeKind.EDITOR_CLOSE */:
                    groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
                    groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
                    break;
                case 5 /* GroupModelChangeKind.EDITOR_OPEN */:
                case 7 /* GroupModelChangeKind.EDITOR_MOVE */:
                    groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
                    groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
                    break;
                case 11 /* GroupModelChangeKind.EDITOR_PIN */:
                    if (e.editor && e.editor === this.model.activeEditor) {
                        groupActiveEditorPinnedContext.set(this.model.isPinned(this.model.activeEditor));
                    }
                    break;
                case 13 /* GroupModelChangeKind.EDITOR_STICKY */:
                    if (e.editor && e.editor === this.model.activeEditor) {
                        groupActiveEditorStickyContext.set(this.model.isSticky(this.model.activeEditor));
                    }
                    break;
                case 4 /* GroupModelChangeKind.EDITORS_SELECTION */:
                    multipleEditorsSelectedContext.set(this.model.selectedEditors.length > 1);
                    twoEditorsSelectedContext.set(this.model.selectedEditors.length === 2);
                    selectedEditorsHaveFileOrUntitledResourceContext.set(this.model.selectedEditors.every(e => e.resource && (this.fileService.hasProvider(e.resource) || e.resource.scheme === Schemas.untitled)));
                    break;
            }
            // Group editors count context
            groupEditorsCountContext.set(this.count);
        };
        this._register(this.onDidModelChange(e => updateGroupContextKeys(e)));
        // Track the active editor and update context key that reflects
        // the dirty state of this editor
        this._register(this.onDidActiveEditorChange(() => observeActiveEditor()));
        // Update context keys on startup
        observeActiveEditor();
        updateGroupContextKeys({ kind: 8 /* GroupModelChangeKind.EDITOR_ACTIVE */ });
        updateGroupContextKeys({ kind: 3 /* GroupModelChangeKind.GROUP_LOCKED */ });
    }
    registerContainerListeners() {
        // Open new file via doubleclick on empty container
        this._register(addDisposableListener(this.element, EventType.DBLCLICK, e => {
            if (this.isEmpty) {
                EventHelper.stop(e);
                this.editorService.openEditor({
                    resource: undefined,
                    options: {
                        pinned: true,
                        override: DEFAULT_EDITOR_ASSOCIATION.id
                    }
                }, this.id);
            }
        }));
        // Close empty editor group via middle mouse click
        this._register(addDisposableListener(this.element, EventType.AUXCLICK, e => {
            if (this.isEmpty && e.button === 1 /* Middle Button */) {
                EventHelper.stop(e, true);
                this.groupsView.removeGroup(this);
            }
        }));
    }
    createContainerToolbar() {
        // Toolbar Container
        const toolbarContainer = $('.editor-group-container-toolbar');
        this.element.appendChild(toolbarContainer);
        // Toolbar
        const containerToolbar = this._register(new ActionBar(toolbarContainer, {
            ariaLabel: localize('ariaLabelGroupActions', "Empty editor group actions"),
            highlightToggledItems: true
        }));
        // Toolbar actions
        const containerToolbarMenu = this._register(this.menuService.createMenu(MenuId.EmptyEditorGroup, this.scopedContextKeyService));
        const updateContainerToolbar = () => {
            // Clear old actions
            this.containerToolBarMenuDisposable.value = toDisposable(() => containerToolbar.clear());
            // Create new actions
            const actions = getActionBarActions(containerToolbarMenu.getActions({ arg: { groupId: this.id }, shouldForwardArgs: true }), 'navigation');
            for (const action of [...actions.primary, ...actions.secondary]) {
                const keybinding = this.keybindingService.lookupKeybinding(action.id);
                containerToolbar.push(action, { icon: true, label: false, keybinding: keybinding?.getLabel() });
            }
        };
        updateContainerToolbar();
        this._register(containerToolbarMenu.onDidChange(updateContainerToolbar));
    }
    createContainerContextMenu() {
        this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, e => this.onShowContainerContextMenu(e)));
        this._register(addDisposableListener(this.element, TouchEventType.Contextmenu, () => this.onShowContainerContextMenu()));
    }
    onShowContainerContextMenu(e) {
        if (!this.isEmpty) {
            return; // only for empty editor groups
        }
        // Find target anchor
        let anchor = this.element;
        if (e) {
            anchor = new StandardMouseEvent(getWindow(this.element), e);
        }
        // Show it
        this.contextMenuService.showContextMenu({
            menuId: MenuId.EmptyEditorGroupContext,
            contextKeyService: this.contextKeyService,
            getAnchor: () => anchor,
            onHide: () => this.focus()
        });
    }
    doTrackFocus() {
        // Container
        const containerFocusTracker = this._register(trackFocus(this.element));
        this._register(containerFocusTracker.onDidFocus(() => {
            if (this.isEmpty) {
                this._onDidFocus.fire(); // only when empty to prevent duplicate events from `editorPane.onDidFocus`
            }
        }));
        // Title Container
        const handleTitleClickOrTouch = (e) => {
            let target;
            if (isMouseEvent(e)) {
                if (e.button !== 0 /* middle/right mouse button */ || (isMacintosh && e.ctrlKey /* macOS context menu */)) {
                    return undefined;
                }
                target = e.target;
            }
            else {
                target = e.initialTarget;
            }
            if (findParentWithClass(target, 'monaco-action-bar', this.titleContainer) ||
                findParentWithClass(target, 'monaco-breadcrumb-item', this.titleContainer)) {
                return; // not when clicking on actions or breadcrumbs
            }
            // timeout to keep focus in editor after mouse up
            setTimeout(() => {
                this.focus();
            });
        };
        this._register(addDisposableListener(this.titleContainer, EventType.MOUSE_DOWN, e => handleTitleClickOrTouch(e)));
        this._register(addDisposableListener(this.titleContainer, TouchEventType.Tap, e => handleTitleClickOrTouch(e)));
        // Editor pane
        this._register(this.editorPane.onDidFocus(() => {
            this._onDidFocus.fire();
        }));
    }
    updateContainer() {
        // Empty Container: add some empty container attributes
        if (this.isEmpty) {
            this.element.classList.add('empty');
            this.element.tabIndex = 0;
            this.element.setAttribute('aria-label', localize('emptyEditorGroup', "{0} (empty)", this.ariaLabel));
        }
        // Non-Empty Container: revert empty container attributes
        else {
            this.element.classList.remove('empty');
            this.element.removeAttribute('tabIndex');
            this.element.removeAttribute('aria-label');
        }
        // Update styles
        this.updateStyles();
    }
    updateTitleContainer() {
        this.titleContainer.classList.toggle('tabs', this.groupsView.partOptions.showTabs === 'multiple');
        this.titleContainer.classList.toggle('show-file-icons', this.groupsView.partOptions.showIcons);
    }
    restoreEditors(from, groupViewOptions) {
        if (this.count === 0) {
            return; // nothing to show
        }
        // Determine editor options
        let options;
        if (from instanceof EditorGroupView_1) {
            options = fillActiveEditorViewState(from); // if we copy from another group, ensure to copy its active editor viewstate
        }
        else {
            options = Object.create(null);
        }
        const activeEditor = this.model.activeEditor;
        if (!activeEditor) {
            return;
        }
        options.pinned = this.model.isPinned(activeEditor); // preserve pinned state
        options.sticky = this.model.isSticky(activeEditor); // preserve sticky state
        options.preserveFocus = true; // handle focus after editor is restored
        const internalOptions = {
            preserveWindowOrder: true, // handle window order after editor is restored
            skipTitleUpdate: true, // update the title later for all editors at once
        };
        const activeElement = getActiveElement();
        // Show active editor (intentionally not using async to keep
        // `restoreEditors` from executing in same stack)
        const result = this.doShowEditor(activeEditor, { active: true, isNew: false /* restored */ }, options, internalOptions).then(() => {
            // Set focused now if this is the active group and focus has
            // not changed meanwhile. This prevents focus from being
            // stolen accidentally on startup when the user already
            // clicked somewhere.
            if (this.groupsView.activeGroup === this && activeElement && isActiveElement(activeElement) && !groupViewOptions?.preserveFocus) {
                this.focus();
            }
        });
        // Restore editors in title control
        this.titleControl.openEditors(this.editors);
        return result;
    }
    //#region event handling
    registerListeners() {
        // Model Events
        this._register(this.model.onDidModelChange(e => this.onDidGroupModelChange(e)));
        // Option Changes
        this._register(this.groupsView.onDidChangeEditorPartOptions(e => this.onDidChangeEditorPartOptions(e)));
        // Visibility
        this._register(this.groupsView.onDidVisibilityChange(e => this.onDidVisibilityChange(e)));
        // Focus
        this._register(this.onDidFocus(() => this.onDidGainFocus()));
    }
    onDidGroupModelChange(e) {
        // Re-emit to outside
        this._onDidModelChange.fire(e);
        // Handle within
        switch (e.kind) {
            case 3 /* GroupModelChangeKind.GROUP_LOCKED */:
                this.element.classList.toggle('locked', this.isLocked);
                break;
            case 4 /* GroupModelChangeKind.EDITORS_SELECTION */:
                this.onDidChangeEditorSelection();
                break;
        }
        if (!e.editor) {
            return;
        }
        switch (e.kind) {
            case 5 /* GroupModelChangeKind.EDITOR_OPEN */:
                if (isGroupEditorOpenEvent(e)) {
                    this.onDidOpenEditor(e.editor, e.editorIndex);
                }
                break;
            case 6 /* GroupModelChangeKind.EDITOR_CLOSE */:
                if (isGroupEditorCloseEvent(e)) {
                    this.handleOnDidCloseEditor(e.editor, e.editorIndex, e.context, e.sticky);
                }
                break;
            case 15 /* GroupModelChangeKind.EDITOR_WILL_DISPOSE */:
                this.onWillDisposeEditor(e.editor);
                break;
            case 14 /* GroupModelChangeKind.EDITOR_DIRTY */:
                this.onDidChangeEditorDirty(e.editor);
                break;
            case 12 /* GroupModelChangeKind.EDITOR_TRANSIENT */:
                this.onDidChangeEditorTransient(e.editor);
                break;
            case 9 /* GroupModelChangeKind.EDITOR_LABEL */:
                this.onDidChangeEditorLabel(e.editor);
                break;
        }
    }
    onDidOpenEditor(editor, editorIndex) {
        /* __GDPR__
            "editorOpened" : {
                "owner": "isidorn",
                "${include}": [
                    "${EditorTelemetryDescriptor}"
                ]
            }
        */
        this.telemetryService.publicLog('editorOpened', this.toEditorTelemetryDescriptor(editor));
        // Update container
        this.updateContainer();
    }
    handleOnDidCloseEditor(editor, editorIndex, context, sticky) {
        // Before close
        this._onWillCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });
        // Handle event
        const editorsToClose = [editor];
        // Include both sides of side by side editors when being closed
        if (editor instanceof SideBySideEditorInput) {
            editorsToClose.push(editor.primary, editor.secondary);
        }
        // For each editor to close, we call dispose() to free up any resources.
        // However, certain editors might be shared across multiple editor groups
        // (including being visible in side by side / diff editors) and as such we
        // only dispose when they are not opened elsewhere.
        for (const editor of editorsToClose) {
            if (this.canDispose(editor)) {
                editor.dispose();
            }
        }
        // Update container
        this.updateContainer();
        // Event
        this._onDidCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });
    }
    canDispose(editor) {
        for (const groupView of this.editorPartsView.groups) {
            if (groupView instanceof EditorGroupView_1 && groupView.model.contains(editor, {
                strictEquals: true, // only if this input is not shared across editor groups
                supportSideBySide: SideBySideEditor.ANY // include any side of an opened side by side editor
            })) {
                return false;
            }
        }
        return true;
    }
    toResourceTelemetryDescriptor(resource) {
        if (!resource) {
            return undefined;
        }
        const path = resource ? resource.scheme === Schemas.file ? resource.fsPath : resource.path : undefined;
        if (!path) {
            return undefined;
        }
        // Remove query parameters from the resource extension
        let resourceExt = extname(resource);
        const queryStringLocation = resourceExt.indexOf('?');
        resourceExt = queryStringLocation !== -1 ? resourceExt.substr(0, queryStringLocation) : resourceExt;
        return {
            mimeType: new TelemetryTrustedValue(getMimeTypes(resource).join(', ')),
            scheme: resource.scheme,
            ext: resourceExt,
            path: hash(path)
        };
    }
    toEditorTelemetryDescriptor(editor) {
        const descriptor = editor.getTelemetryDescriptor();
        const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
        if (URI.isUri(resource)) {
            descriptor['resource'] = this.toResourceTelemetryDescriptor(resource);
            /* __GDPR__FRAGMENT__
                "EditorTelemetryDescriptor" : {
                    "resource": { "${inline}": [ "${URIDescriptor}" ] }
                }
            */
            return descriptor;
        }
        else if (resource) {
            if (resource.primary) {
                descriptor['resource'] = this.toResourceTelemetryDescriptor(resource.primary);
            }
            if (resource.secondary) {
                descriptor['resourceSecondary'] = this.toResourceTelemetryDescriptor(resource.secondary);
            }
            /* __GDPR__FRAGMENT__
                "EditorTelemetryDescriptor" : {
                    "resource": { "${inline}": [ "${URIDescriptor}" ] },
                    "resourceSecondary": { "${inline}": [ "${URIDescriptor}" ] }
                }
            */
            return descriptor;
        }
        return descriptor;
    }
    onWillDisposeEditor(editor) {
        // To prevent race conditions, we handle disposed editors in our worker with a timeout
        // because it can happen that an input is being disposed with the intent to replace
        // it with some other input right after.
        this.disposedEditorsWorker.work(editor);
    }
    handleDisposedEditors(disposedEditors) {
        // Split between visible and hidden editors
        let activeEditor;
        const inactiveEditors = [];
        for (const disposedEditor of disposedEditors) {
            const editorFindResult = this.model.findEditor(disposedEditor);
            if (!editorFindResult) {
                continue; // not part of the model anymore
            }
            const editor = editorFindResult[0];
            if (!editor.isDisposed()) {
                continue; // editor got reopened meanwhile
            }
            if (this.model.isActive(editor)) {
                activeEditor = editor;
            }
            else {
                inactiveEditors.push(editor);
            }
        }
        // Close all inactive editors first to prevent UI flicker
        for (const inactiveEditor of inactiveEditors) {
            this.doCloseEditor(inactiveEditor, true);
        }
        // Close active one last
        if (activeEditor) {
            this.doCloseEditor(activeEditor, true);
        }
    }
    onDidChangeEditorPartOptions(event) {
        // Title container
        this.updateTitleContainer();
        // Title control
        this.titleControl.updateOptions(event.oldPartOptions, event.newPartOptions);
        // Title control switch between singleEditorTabs, multiEditorTabs and multiRowEditorTabs
        if (event.oldPartOptions.showTabs !== event.newPartOptions.showTabs ||
            event.oldPartOptions.tabHeight !== event.newPartOptions.tabHeight ||
            (event.oldPartOptions.showTabs === 'multiple' && event.oldPartOptions.pinnedTabsOnSeparateRow !== event.newPartOptions.pinnedTabsOnSeparateRow)) {
            // Re-layout
            this.relayout();
            // Ensure to show active editor if any
            if (this.model.activeEditor) {
                this.titleControl.openEditors(this.model.getEditors(1 /* EditorsOrder.SEQUENTIAL */));
            }
        }
        // Styles
        this.updateStyles();
        // Pin preview editor once user disables preview
        if (event.oldPartOptions.enablePreview && !event.newPartOptions.enablePreview) {
            if (this.model.previewEditor) {
                this.pinEditor(this.model.previewEditor);
            }
        }
    }
    onDidChangeEditorDirty(editor) {
        // Always show dirty editors pinned
        this.pinEditor(editor);
        // Forward to title control
        this.titleControl.updateEditorDirty(editor);
    }
    onDidChangeEditorTransient(editor) {
        const transient = this.model.isTransient(editor);
        // Transient state overrides the `enablePreview` setting,
        // so when an editor leaves the transient state, we have
        // to ensure its preview state is also cleared.
        if (!transient && !this.groupsView.partOptions.enablePreview) {
            this.pinEditor(editor);
        }
    }
    onDidChangeEditorLabel(editor) {
        // Forward to title control
        this.titleControl.updateEditorLabel(editor);
    }
    onDidChangeEditorSelection() {
        // Forward to title control
        this.titleControl.updateEditorSelections();
    }
    onDidVisibilityChange(visible) {
        // Forward to active editor pane
        this.editorPane.setVisible(visible);
    }
    onDidGainFocus() {
        if (this.activeEditor) {
            // We aggressively clear the transient state of editors
            // as soon as the group gains focus. This is to ensure
            // that the transient state is not staying around when
            // the user interacts with the editor.
            this.model.setTransient(this.activeEditor, false);
        }
    }
    //#endregion
    //#region IEditorGroupView
    get index() {
        return this._index;
    }
    get label() {
        if (this.groupsLabel) {
            return localize('groupLabelLong', "{0}: Group {1}", this.groupsLabel, this._index + 1);
        }
        return localize('groupLabel', "Group {0}", this._index + 1);
    }
    get ariaLabel() {
        if (this.groupsLabel) {
            return localize('groupAriaLabelLong', "{0}: Editor Group {1}", this.groupsLabel, this._index + 1);
        }
        return localize('groupAriaLabel', "Editor Group {0}", this._index + 1);
    }
    get disposed() {
        return this._disposed;
    }
    get isEmpty() {
        return this.count === 0;
    }
    get titleHeight() {
        return this.titleControl.getHeight();
    }
    notifyIndexChanged(newIndex) {
        if (this._index !== newIndex) {
            this._index = newIndex;
            this.model.setIndex(newIndex);
        }
    }
    notifyLabelChanged(newLabel) {
        if (this.groupsLabel !== newLabel) {
            this.groupsLabel = newLabel;
            this.model.setLabel(newLabel);
        }
    }
    setActive(isActive) {
        this.active = isActive;
        // Clear selection when group no longer active
        if (!isActive && this.activeEditor && this.selectedEditors.length > 1) {
            this.setSelection(this.activeEditor, []);
        }
        // Update container
        this.element.classList.toggle('active', isActive);
        this.element.classList.toggle('inactive', !isActive);
        // Update title control
        this.titleControl.setActive(isActive);
        // Update styles
        this.updateStyles();
        // Update model
        this.model.setActive(undefined /* entire group got active */);
    }
    //#endregion
    //#region basics()
    get id() {
        return this.model.id;
    }
    get windowId() {
        return this.groupsView.windowId;
    }
    get editors() {
        return this.model.getEditors(1 /* EditorsOrder.SEQUENTIAL */);
    }
    get count() {
        return this.model.count;
    }
    get stickyCount() {
        return this.model.stickyCount;
    }
    get activeEditorPane() {
        return this.editorPane ? this.editorPane.activeEditorPane ?? undefined : undefined;
    }
    get activeEditor() {
        return this.model.activeEditor;
    }
    get selectedEditors() {
        return this.model.selectedEditors;
    }
    get previewEditor() {
        return this.model.previewEditor;
    }
    isPinned(editorOrIndex) {
        return this.model.isPinned(editorOrIndex);
    }
    isSticky(editorOrIndex) {
        return this.model.isSticky(editorOrIndex);
    }
    isSelected(editor) {
        return this.model.isSelected(editor);
    }
    isTransient(editorOrIndex) {
        return this.model.isTransient(editorOrIndex);
    }
    isActive(editor) {
        return this.model.isActive(editor);
    }
    async setSelection(activeSelectedEditor, inactiveSelectedEditors) {
        if (!this.isActive(activeSelectedEditor)) {
            // The active selected editor is not yet opened, so we go
            // through `openEditor` to show it. We pass the inactive
            // selection as internal options
            await this.openEditor(activeSelectedEditor, { activation: EditorActivation.ACTIVATE }, { inactiveSelection: inactiveSelectedEditors });
        }
        else {
            this.model.setSelection(activeSelectedEditor, inactiveSelectedEditors);
        }
    }
    contains(candidate, options) {
        return this.model.contains(candidate, options);
    }
    getEditors(order, options) {
        return this.model.getEditors(order, options);
    }
    findEditors(resource, options) {
        const canonicalResource = this.uriIdentityService.asCanonicalUri(resource);
        return this.getEditors(options?.order ?? 1 /* EditorsOrder.SEQUENTIAL */).filter(editor => {
            if (editor.resource && isEqual(editor.resource, canonicalResource)) {
                return true;
            }
            // Support side by side editor primary side if specified
            if (options?.supportSideBySide === SideBySideEditor.PRIMARY || options?.supportSideBySide === SideBySideEditor.ANY) {
                const primaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
                if (primaryResource && isEqual(primaryResource, canonicalResource)) {
                    return true;
                }
            }
            // Support side by side editor secondary side if specified
            if (options?.supportSideBySide === SideBySideEditor.SECONDARY || options?.supportSideBySide === SideBySideEditor.ANY) {
                const secondaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY });
                if (secondaryResource && isEqual(secondaryResource, canonicalResource)) {
                    return true;
                }
            }
            return false;
        });
    }
    getEditorByIndex(index) {
        return this.model.getEditorByIndex(index);
    }
    getIndexOfEditor(editor) {
        return this.model.indexOf(editor);
    }
    isFirst(editor) {
        return this.model.isFirst(editor);
    }
    isLast(editor) {
        return this.model.isLast(editor);
    }
    focus() {
        // Pass focus to editor panes
        if (this.activeEditorPane) {
            this.activeEditorPane.focus();
        }
        else {
            this.element.focus();
        }
        // Event
        this._onDidFocus.fire();
    }
    pinEditor(candidate = this.activeEditor || undefined) {
        if (candidate && !this.model.isPinned(candidate)) {
            // Update model
            const editor = this.model.pin(candidate);
            // Forward to title control
            if (editor) {
                this.titleControl.pinEditor(editor);
            }
        }
    }
    stickEditor(candidate = this.activeEditor || undefined) {
        this.doStickEditor(candidate, true);
    }
    unstickEditor(candidate = this.activeEditor || undefined) {
        this.doStickEditor(candidate, false);
    }
    doStickEditor(candidate, sticky) {
        if (candidate && this.model.isSticky(candidate) !== sticky) {
            const oldIndexOfEditor = this.getIndexOfEditor(candidate);
            // Update model
            const editor = sticky ? this.model.stick(candidate) : this.model.unstick(candidate);
            if (!editor) {
                return;
            }
            // If the index of the editor changed, we need to forward this to
            // title control and also make sure to emit this as an event
            const newIndexOfEditor = this.getIndexOfEditor(editor);
            if (newIndexOfEditor !== oldIndexOfEditor) {
                this.titleControl.moveEditor(editor, oldIndexOfEditor, newIndexOfEditor, true);
            }
            // Forward sticky state to title control
            if (sticky) {
                this.titleControl.stickEditor(editor);
            }
            else {
                this.titleControl.unstickEditor(editor);
            }
        }
    }
    //#endregion
    //#region openEditor()
    async openEditor(editor, options, internalOptions) {
        return this.doOpenEditor(editor, options, {
            // Appply given internal open options
            ...internalOptions,
            // Allow to match on a side-by-side editor when same
            // editor is opened on both sides. In that case we
            // do not want to open a new editor but reuse that one.
            supportSideBySide: SideBySideEditor.BOTH
        });
    }
    async doOpenEditor(editor, options, internalOptions) {
        // Guard against invalid editors. Disposed editors
        // should never open because they emit no events
        // e.g. to indicate dirty changes.
        if (!editor || editor.isDisposed()) {
            return;
        }
        // Fire the event letting everyone know we are about to open an editor
        this._onWillOpenEditor.fire({ editor, groupId: this.id });
        // Determine options
        const pinned = options?.sticky
            || (!this.groupsView.partOptions.enablePreview && !options?.transient)
            || editor.isDirty()
            || (options?.pinned ?? typeof options?.index === 'number' /* unless specified, prefer to pin when opening with index */)
            || (typeof options?.index === 'number' && this.model.isSticky(options.index))
            || editor.hasCapability(512 /* EditorInputCapabilities.Scratchpad */);
        const openEditorOptions = {
            index: options ? options.index : undefined,
            pinned,
            sticky: options?.sticky || (typeof options?.index === 'number' && this.model.isSticky(options.index)),
            transient: !!options?.transient,
            inactiveSelection: internalOptions?.inactiveSelection,
            active: this.count === 0 || !options?.inactive,
            supportSideBySide: internalOptions?.supportSideBySide
        };
        if (!openEditorOptions.active && !openEditorOptions.pinned && this.model.activeEditor && !this.model.isPinned(this.model.activeEditor)) {
            // Special case: we are to open an editor inactive and not pinned, but the current active
            // editor is also not pinned, which means it will get replaced with this one. As such,
            // the editor can only be active.
            openEditorOptions.active = true;
        }
        let activateGroup = false;
        let restoreGroup = false;
        if (options?.activation === EditorActivation.ACTIVATE) {
            // Respect option to force activate an editor group.
            activateGroup = true;
        }
        else if (options?.activation === EditorActivation.RESTORE) {
            // Respect option to force restore an editor group.
            restoreGroup = true;
        }
        else if (options?.activation === EditorActivation.PRESERVE) {
            // Respect option to preserve active editor group.
            activateGroup = false;
            restoreGroup = false;
        }
        else if (openEditorOptions.active) {
            // Finally, we only activate/restore an editor which is
            // opening as active editor.
            // If preserveFocus is enabled, we only restore but never
            // activate the group.
            activateGroup = !options?.preserveFocus;
            restoreGroup = !activateGroup;
        }
        // Actually move the editor if a specific index is provided and we figure
        // out that the editor is already opened at a different index. This
        // ensures the right set of events are fired to the outside.
        if (typeof openEditorOptions.index === 'number') {
            const indexOfEditor = this.model.indexOf(editor);
            if (indexOfEditor !== -1 && indexOfEditor !== openEditorOptions.index) {
                this.doMoveEditorInsideGroup(editor, openEditorOptions);
            }
        }
        // Update model and make sure to continue to use the editor we get from
        // the model. It is possible that the editor was already opened and we
        // want to ensure that we use the existing instance in that case.
        const { editor: openedEditor, isNew } = this.model.openEditor(editor, openEditorOptions);
        // Conditionally lock the group
        if (isNew && // only if this editor was new for the group
            this.count === 1 && // only when this editor was the first editor in the group
            this.editorPartsView.groups.length > 1 // only allow auto locking if more than 1 group is opened
        ) {
            // only when the editor identifier is configured as such
            if (openedEditor.editorId && this.groupsView.partOptions.autoLockGroups?.has(openedEditor.editorId)) {
                this.lock(true);
            }
        }
        // Show editor
        const showEditorResult = this.doShowEditor(openedEditor, { active: !!openEditorOptions.active, isNew }, options, internalOptions);
        // Finally make sure the group is active or restored as instructed
        if (activateGroup) {
            this.groupsView.activateGroup(this);
        }
        else if (restoreGroup) {
            this.groupsView.restoreGroup(this);
        }
        return showEditorResult;
    }
    doShowEditor(editor, context, options, internalOptions) {
        // Show in editor control if the active editor changed
        let openEditorPromise;
        if (context.active) {
            openEditorPromise = (async () => {
                const { pane, changed, cancelled, error } = await this.editorPane.openEditor(editor, options, internalOptions, { newInGroup: context.isNew });
                // Return early if the operation was cancelled by another operation
                if (cancelled) {
                    return undefined;
                }
                // Editor change event
                if (changed) {
                    this._onDidActiveEditorChange.fire({ editor });
                }
                // Indicate error as an event but do not bubble them up
                if (error) {
                    this._onDidOpenEditorFail.fire(editor);
                }
                // Without an editor pane, recover by closing the active editor
                // (if the input is still the active one)
                if (!pane && this.activeEditor === editor) {
                    this.doCloseEditor(editor, options?.preserveFocus, { fromError: true });
                }
                return pane;
            })();
        }
        else {
            openEditorPromise = Promise.resolve(undefined); // inactive: return undefined as result to signal this
        }
        // Show in title control after editor control because some actions depend on it
        // but respect the internal options in case title control updates should skip.
        if (!internalOptions?.skipTitleUpdate) {
            this.titleControl.openEditor(editor, internalOptions);
        }
        return openEditorPromise;
    }
    //#endregion
    //#region openEditors()
    async openEditors(editors) {
        // Guard against invalid editors. Disposed editors
        // should never open because they emit no events
        // e.g. to indicate dirty changes.
        const editorsToOpen = coalesce(editors).filter(({ editor }) => !editor.isDisposed());
        // Use the first editor as active editor
        const firstEditor = editorsToOpen.at(0);
        if (!firstEditor) {
            return;
        }
        const openEditorsOptions = {
            // Allow to match on a side-by-side editor when same
            // editor is opened on both sides. In that case we
            // do not want to open a new editor but reuse that one.
            supportSideBySide: SideBySideEditor.BOTH
        };
        await this.doOpenEditor(firstEditor.editor, firstEditor.options, openEditorsOptions);
        // Open the other ones inactive
        const inactiveEditors = editorsToOpen.slice(1);
        const startingIndex = this.getIndexOfEditor(firstEditor.editor) + 1;
        await Promises.settled(inactiveEditors.map(({ editor, options }, index) => {
            return this.doOpenEditor(editor, {
                ...options,
                inactive: true,
                pinned: true,
                index: startingIndex + index
            }, {
                ...openEditorsOptions,
                // optimization: update the title control later
                // https://github.com/microsoft/vscode/issues/130634
                skipTitleUpdate: true
            });
        }));
        // Update the title control all at once with all editors
        this.titleControl.openEditors(inactiveEditors.map(({ editor }) => editor));
        // Opening many editors at once can put any editor to be
        // the active one depending on options. As such, we simply
        // return the active editor pane after this operation.
        return this.editorPane.activeEditorPane ?? undefined;
    }
    //#endregion
    //#region moveEditor()
    moveEditors(editors, target) {
        // Optimization: knowing that we move many editors, we
        // delay the title update to a later point for this group
        // through a method that allows for bulk updates but only
        // when moving to a different group where many editors
        // are more likely to occur.
        const internalOptions = {
            skipTitleUpdate: this !== target
        };
        let moveFailed = false;
        const movedEditors = new Set();
        for (const { editor, options } of editors) {
            if (this.moveEditor(editor, target, options, internalOptions)) {
                movedEditors.add(editor);
            }
            else {
                moveFailed = true;
            }
        }
        // Update the title control all at once with all editors
        // in source and target if the title update was skipped
        if (internalOptions.skipTitleUpdate) {
            target.titleControl.openEditors(Array.from(movedEditors));
            this.titleControl.closeEditors(Array.from(movedEditors));
        }
        return !moveFailed;
    }
    moveEditor(editor, target, options, internalOptions) {
        // Move within same group
        if (this === target) {
            this.doMoveEditorInsideGroup(editor, options);
            return true;
        }
        // Move across groups
        else {
            return this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: false });
        }
    }
    doMoveEditorInsideGroup(candidate, options) {
        const moveToIndex = options ? options.index : undefined;
        if (typeof moveToIndex !== 'number') {
            return; // do nothing if we move into same group without index
        }
        // Update model and make sure to continue to use the editor we get from
        // the model. It is possible that the editor was already opened and we
        // want to ensure that we use the existing instance in that case.
        const currentIndex = this.model.indexOf(candidate);
        const editor = this.model.getEditorByIndex(currentIndex);
        if (!editor) {
            return;
        }
        // Move when index has actually changed
        if (currentIndex !== moveToIndex) {
            const oldStickyCount = this.model.stickyCount;
            // Update model
            this.model.moveEditor(editor, moveToIndex);
            this.model.pin(editor);
            // Forward to title control
            this.titleControl.moveEditor(editor, currentIndex, moveToIndex, oldStickyCount !== this.model.stickyCount);
            this.titleControl.pinEditor(editor);
        }
        // Support the option to stick the editor even if it is moved.
        // It is important that we call this method after we have moved
        // the editor because the result of moving the editor could have
        // caused a change in sticky state.
        if (options?.sticky) {
            this.stickEditor(editor);
        }
    }
    doMoveOrCopyEditorAcrossGroups(editor, target, openOptions, internalOptions) {
        const keepCopy = internalOptions?.keepCopy;
        // Validate that we can move
        if (!keepCopy || editor.hasCapability(8 /* EditorInputCapabilities.Singleton */) /* singleton editors will always move */) {
            const canMoveVeto = editor.canMove(this.id, target.id);
            if (typeof canMoveVeto === 'string') {
                this.dialogService.error(canMoveVeto, localize('moveErrorDetails', "Try saving or reverting the editor first and then try again."));
                return false;
            }
        }
        // When moving/copying an editor, try to preserve as much view state as possible
        // by checking for the editor to be a text editor and creating the options accordingly
        // if so
        const options = fillActiveEditorViewState(this, editor, {
            ...openOptions,
            pinned: true, // always pin moved editor
            sticky: openOptions?.sticky ?? (!keepCopy && this.model.isSticky(editor)) // preserve sticky state only if editor is moved or explicitly wanted (https://github.com/microsoft/vscode/issues/99035)
        });
        // Indicate will move event
        if (!keepCopy) {
            this._onWillMoveEditor.fire({
                groupId: this.id,
                editor,
                target: target.id
            });
        }
        // A move to another group is an open first...
        target.doOpenEditor(keepCopy ? editor.copy() : editor, options, internalOptions);
        // ...and a close afterwards (unless we copy)
        if (!keepCopy) {
            this.doCloseEditor(editor, true /* do not focus next one behind if any */, { ...internalOptions, context: EditorCloseContext.MOVE });
        }
        return true;
    }
    //#endregion
    //#region copyEditor()
    copyEditors(editors, target) {
        // Optimization: knowing that we move many editors, we
        // delay the title update to a later point for this group
        // through a method that allows for bulk updates but only
        // when moving to a different group where many editors
        // are more likely to occur.
        const internalOptions = {
            skipTitleUpdate: this !== target
        };
        for (const { editor, options } of editors) {
            this.copyEditor(editor, target, options, internalOptions);
        }
        // Update the title control all at once with all editors
        // in target if the title update was skipped
        if (internalOptions.skipTitleUpdate) {
            const copiedEditors = editors.map(({ editor }) => editor);
            target.titleControl.openEditors(copiedEditors);
        }
    }
    copyEditor(editor, target, options, internalOptions) {
        // Move within same group because we do not support to show the same editor
        // multiple times in the same group
        if (this === target) {
            this.doMoveEditorInsideGroup(editor, options);
        }
        // Copy across groups
        else {
            this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: true });
        }
    }
    //#endregion
    //#region closeEditor()
    async closeEditor(editor = this.activeEditor || undefined, options) {
        return this.doCloseEditorWithConfirmationHandling(editor, options);
    }
    async doCloseEditorWithConfirmationHandling(editor = this.activeEditor || undefined, options, internalOptions) {
        if (!editor) {
            return false;
        }
        // Check for confirmation and veto
        const veto = await this.handleCloseConfirmation([editor]);
        if (veto) {
            return false;
        }
        // Do close
        this.doCloseEditor(editor, options?.preserveFocus, internalOptions);
        return true;
    }
    doCloseEditor(editor, preserveFocus = (this.groupsView.activeGroup !== this), internalOptions) {
        // Forward to title control unless skipped via internal options
        if (!internalOptions?.skipTitleUpdate) {
            this.titleControl.beforeCloseEditor(editor);
        }
        // Closing the active editor of the group is a bit more work
        if (this.model.isActive(editor)) {
            this.doCloseActiveEditor(preserveFocus, internalOptions);
        }
        // Closing inactive editor is just a model update
        else {
            this.doCloseInactiveEditor(editor, internalOptions);
        }
        // Forward to title control unless skipped via internal options
        if (!internalOptions?.skipTitleUpdate) {
            this.titleControl.closeEditor(editor);
        }
    }
    doCloseActiveEditor(preserveFocus = (this.groupsView.activeGroup !== this), internalOptions) {
        const editorToClose = this.activeEditor;
        const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.element);
        // Optimization: if we are about to close the last editor in this group and settings
        // are configured to close the group since it will be empty, we first set the last
        // active group as empty before closing the editor. This reduces the amount of editor
        // change events that this operation emits and will reduce flicker. Without this
        // optimization, this group (if active) would first trigger a active editor change
        // event because it became empty, only to then trigger another one when the next
        // group gets active.
        const closeEmptyGroup = this.groupsView.partOptions.closeEmptyGroups;
        if (closeEmptyGroup && this.active && this.count === 1) {
            const mostRecentlyActiveGroups = this.groupsView.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */);
            const nextActiveGroup = mostRecentlyActiveGroups[1]; // [0] will be the current one, so take [1]
            if (nextActiveGroup) {
                if (restoreFocus) {
                    nextActiveGroup.focus();
                }
                else {
                    this.groupsView.activateGroup(nextActiveGroup, true);
                }
            }
        }
        // Update model
        if (editorToClose) {
            this.model.closeEditor(editorToClose, internalOptions?.context);
        }
        // Open next active if there are more to show
        const nextActiveEditor = this.model.activeEditor;
        if (nextActiveEditor) {
            let activation = undefined;
            if (preserveFocus && this.groupsView.activeGroup !== this) {
                // If we are opening the next editor in an inactive group
                // without focussing it, ensure we preserve the editor
                // group sizes in case that group is minimized.
                // https://github.com/microsoft/vscode/issues/117686
                activation = EditorActivation.PRESERVE;
            }
            const options = {
                preserveFocus,
                activation,
                // When closing an editor due to an error we can end up in a loop where we continue closing
                // editors that fail to open (e.g. when the file no longer exists). We do not want to show
                // repeated errors in this case to the user. As such, if we open the next editor and we are
                // in a scope of a previous editor failing, we silence the input errors until the editor is
                // opened by setting ignoreError: true.
                ignoreError: internalOptions?.fromError
            };
            const internalEditorOpenOptions = {
                // When closing an editor, we reveal the next one in the group.
                // However, this can be a result of moving an editor to another
                // window so we explicitly disable window reordering in this case.
                preserveWindowOrder: true
            };
            this.doOpenEditor(nextActiveEditor, options, internalEditorOpenOptions);
        }
        // Otherwise we are empty, so clear from editor control and send event
        else {
            // Forward to editor pane
            if (editorToClose) {
                this.editorPane.closeEditor(editorToClose);
            }
            // Restore focus to group container as needed unless group gets closed
            if (restoreFocus && !closeEmptyGroup) {
                this.focus();
            }
            // Events
            this._onDidActiveEditorChange.fire({ editor: undefined });
            // Remove empty group if we should
            if (closeEmptyGroup) {
                this.groupsView.removeGroup(this, preserveFocus);
            }
        }
    }
    shouldRestoreFocus(target) {
        const activeElement = getActiveElement();
        if (activeElement === target.ownerDocument.body) {
            return true; // always restore focus if nothing is focused currently
        }
        // otherwise check for the active element being an ancestor of the target
        return isAncestor(activeElement, target);
    }
    doCloseInactiveEditor(editor, internalOptions) {
        // Update model
        this.model.closeEditor(editor, internalOptions?.context);
    }
    async handleCloseConfirmation(editors) {
        if (!editors.length) {
            return false; // no veto
        }
        const editor = editors.shift();
        // To prevent multiple confirmation dialogs from showing up one after the other
        // we check if a pending confirmation is currently showing and if so, join that
        let handleCloseConfirmationPromise = this.mapEditorToPendingConfirmation.get(editor);
        if (!handleCloseConfirmationPromise) {
            handleCloseConfirmationPromise = this.doHandleCloseConfirmation(editor);
            this.mapEditorToPendingConfirmation.set(editor, handleCloseConfirmationPromise);
        }
        let veto;
        try {
            veto = await handleCloseConfirmationPromise;
        }
        finally {
            this.mapEditorToPendingConfirmation.delete(editor);
        }
        // Return for the first veto we got
        if (veto) {
            return veto;
        }
        // Otherwise continue with the remainders
        return this.handleCloseConfirmation(editors);
    }
    async doHandleCloseConfirmation(editor, options) {
        if (!this.shouldConfirmClose(editor)) {
            return false; // no veto
        }
        if (editor instanceof SideBySideEditorInput && this.model.contains(editor.primary)) {
            return false; // primary-side of editor is still opened somewhere else
        }
        // Note: we explicitly decide to ask for confirm if closing a normal editor even
        // if it is opened in a side-by-side editor in the group. This decision is made
        // because it may be less obvious that one side of a side by side editor is dirty
        // and can still be changed.
        // The only exception is when the same editor is opened on both sides of a side
        // by side editor (https://github.com/microsoft/vscode/issues/138442)
        if (this.editorPartsView.groups.some(groupView => {
            if (groupView === this) {
                return false; // skip (we already handled our group above)
            }
            const otherGroup = groupView;
            if (otherGroup.contains(editor, { supportSideBySide: SideBySideEditor.BOTH })) {
                return true; // exact editor still opened (either single, or split-in-group)
            }
            if (editor instanceof SideBySideEditorInput && otherGroup.contains(editor.primary)) {
                return true; // primary side of side by side editor still opened
            }
            return false;
        })) {
            return false; // editor is still editable somewhere else
        }
        // In some cases trigger save before opening the dialog depending
        // on auto-save configuration.
        // However, make sure to respect `skipAutoSave` option in case the automated
        // save fails which would result in the editor never closing.
        // Also, we only do this if no custom confirmation handling is implemented.
        let confirmation = 2 /* ConfirmResult.CANCEL */;
        let saveReason = 1 /* SaveReason.EXPLICIT */;
        let autoSave = false;
        if (!editor.hasCapability(4 /* EditorInputCapabilities.Untitled */) && !options?.skipAutoSave && !editor.closeHandler) {
            // Auto-save on focus change: save, because a dialog would steal focus
            // (see https://github.com/microsoft/vscode/issues/108752)
            if (this.filesConfigurationService.getAutoSaveMode(editor).mode === 3 /* AutoSaveMode.ON_FOCUS_CHANGE */) {
                autoSave = true;
                confirmation = 0 /* ConfirmResult.SAVE */;
                saveReason = 3 /* SaveReason.FOCUS_CHANGE */;
            }
            // Auto-save on window change: save, because on Windows and Linux, a
            // native dialog triggers the window focus change
            // (see https://github.com/microsoft/vscode/issues/134250)
            else if ((isNative && (isWindows || isLinux)) && this.filesConfigurationService.getAutoSaveMode(editor).mode === 4 /* AutoSaveMode.ON_WINDOW_CHANGE */) {
                autoSave = true;
                confirmation = 0 /* ConfirmResult.SAVE */;
                saveReason = 4 /* SaveReason.WINDOW_CHANGE */;
            }
        }
        // No auto-save on focus change or custom confirmation handler: ask user
        if (!autoSave) {
            // Switch to editor that we want to handle for confirmation unless showing already
            if (!this.activeEditor?.matches(editor)) {
                await this.doOpenEditor(editor);
            }
            // Ensure our window has focus since we are about to show a dialog
            await this.hostService.focus(getWindow(this.element));
            // Let editor handle confirmation if implemented
            let handlerDidError = false;
            if (typeof editor.closeHandler?.confirm === 'function') {
                try {
                    confirmation = await editor.closeHandler.confirm([{ editor, groupId: this.id }]);
                }
                catch (e) {
                    this.logService.error(e);
                    handlerDidError = true;
                }
            }
            // Show a file specific confirmation if there is no handler or it errored
            if (typeof editor.closeHandler?.confirm !== 'function' || handlerDidError) {
                let name;
                if (editor instanceof SideBySideEditorInput) {
                    name = editor.primary.getName(); // prefer shorter names by using primary's name in this case
                }
                else {
                    name = editor.getName();
                }
                confirmation = await this.fileDialogService.showSaveConfirm([name]);
            }
        }
        // It could be that the editor's choice of confirmation has changed
        // given the check for confirmation is long running, so we check
        // again to see if anything needs to happen before closing for good.
        // This can happen for example if `autoSave: onFocusChange` is configured
        // so that the save happens when the dialog opens.
        // However, we only do this unless a custom confirm handler is installed
        // that may not be fit to be asked a second time right after.
        if (!editor.closeHandler && !this.shouldConfirmClose(editor)) {
            return confirmation === 2 /* ConfirmResult.CANCEL */;
        }
        // Otherwise, handle accordingly
        switch (confirmation) {
            case 0 /* ConfirmResult.SAVE */: {
                const result = await editor.save(this.id, { reason: saveReason });
                if (!result && autoSave) {
                    // Save failed and we need to signal this back to the user, so
                    // we handle the dirty editor again but this time ensuring to
                    // show the confirm dialog
                    // (see https://github.com/microsoft/vscode/issues/108752)
                    return this.doHandleCloseConfirmation(editor, { skipAutoSave: true });
                }
                return editor.isDirty(); // veto if still dirty
            }
            case 1 /* ConfirmResult.DONT_SAVE */:
                try {
                    // first try a normal revert where the contents of the editor are restored
                    await editor.revert(this.id);
                    return editor.isDirty(); // veto if still dirty
                }
                catch (error) {
                    this.logService.error(error);
                    // if that fails, since we are about to close the editor, we accept that
                    // the editor cannot be reverted and instead do a soft revert that just
                    // enables us to close the editor. With this, a user can always close a
                    // dirty editor even when reverting fails.
                    await editor.revert(this.id, { soft: true });
                    return editor.isDirty(); // veto if still dirty
                }
            case 2 /* ConfirmResult.CANCEL */:
                return true; // veto
        }
    }
    shouldConfirmClose(editor) {
        if (editor.closeHandler) {
            try {
                return editor.closeHandler.showConfirm(); // custom handling of confirmation on close
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        return editor.isDirty() && !editor.isSaving(); // editor must be dirty and not saving
    }
    //#endregion
    //#region closeEditors()
    async closeEditors(args, options) {
        if (this.isEmpty) {
            return true;
        }
        const editors = this.doGetEditorsToClose(args);
        // Check for confirmation and veto
        const veto = await this.handleCloseConfirmation(editors.slice(0));
        if (veto) {
            return false;
        }
        // Do close
        this.doCloseEditors(editors, options);
        return true;
    }
    doGetEditorsToClose(args) {
        if (Array.isArray(args)) {
            return args;
        }
        const filter = args;
        const hasDirection = typeof filter.direction === 'number';
        let editorsToClose = this.model.getEditors(hasDirection ? 1 /* EditorsOrder.SEQUENTIAL */ : 0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */, filter); // in MRU order only if direction is not specified
        // Filter: saved or saving only
        if (filter.savedOnly) {
            editorsToClose = editorsToClose.filter(editor => !editor.isDirty() || editor.isSaving());
        }
        // Filter: direction (left / right)
        else if (hasDirection && filter.except) {
            editorsToClose = (filter.direction === 0 /* CloseDirection.LEFT */) ?
                editorsToClose.slice(0, this.model.indexOf(filter.except, editorsToClose)) :
                editorsToClose.slice(this.model.indexOf(filter.except, editorsToClose) + 1);
        }
        // Filter: except
        else if (filter.except) {
            editorsToClose = editorsToClose.filter(editor => filter.except && !editor.matches(filter.except));
        }
        return editorsToClose;
    }
    doCloseEditors(editors, options) {
        // Close all inactive editors first
        let closeActiveEditor = false;
        for (const editor of editors) {
            if (!this.isActive(editor)) {
                this.doCloseInactiveEditor(editor);
            }
            else {
                closeActiveEditor = true;
            }
        }
        // Close active editor last if contained in editors list to close
        if (closeActiveEditor) {
            this.doCloseActiveEditor(options?.preserveFocus);
        }
        // Forward to title control
        if (editors.length) {
            this.titleControl.closeEditors(editors);
        }
    }
    closeAllEditors(options) {
        if (this.isEmpty) {
            // If the group is empty and the request is to close all editors, we still close
            // the editor group is the related setting to close empty groups is enabled for
            // a convenient way of removing empty editor groups for the user.
            if (this.groupsView.partOptions.closeEmptyGroups) {
                this.groupsView.removeGroup(this);
            }
            return true;
        }
        // We can go ahead and close "sync" when we exclude confirming editors
        if (options?.excludeConfirming) {
            this.doCloseAllEditors(options);
            return true;
        }
        // Otherwise go through potential confirmation "async"
        return this.handleCloseConfirmation(this.model.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */, options)).then(veto => {
            if (veto) {
                return false;
            }
            this.doCloseAllEditors(options);
            return true;
        });
    }
    doCloseAllEditors(options) {
        let editors = this.model.getEditors(1 /* EditorsOrder.SEQUENTIAL */, options);
        if (options?.excludeConfirming) {
            editors = editors.filter(editor => !this.shouldConfirmClose(editor));
        }
        // Close all inactive editors first
        const editorsToClose = [];
        for (const editor of editors) {
            if (!this.isActive(editor)) {
                this.doCloseInactiveEditor(editor);
            }
            editorsToClose.push(editor);
        }
        // Close active editor last (unless we skip it, e.g. because it is sticky)
        if (this.activeEditor && editorsToClose.includes(this.activeEditor)) {
            this.doCloseActiveEditor();
        }
        // Forward to title control
        if (editorsToClose.length) {
            this.titleControl.closeEditors(editorsToClose);
        }
    }
    //#endregion
    //#region replaceEditors()
    async replaceEditors(editors) {
        // Extract active vs. inactive replacements
        let activeReplacement;
        const inactiveReplacements = [];
        for (let { editor, replacement, forceReplaceDirty, options } of editors) {
            const index = this.getIndexOfEditor(editor);
            if (index >= 0) {
                const isActiveEditor = this.isActive(editor);
                // make sure we respect the index of the editor to replace
                if (options) {
                    options.index = index;
                }
                else {
                    options = { index };
                }
                options.inactive = !isActiveEditor;
                options.pinned = options.pinned ?? true; // unless specified, prefer to pin upon replace
                const editorToReplace = { editor, replacement, forceReplaceDirty, options };
                if (isActiveEditor) {
                    activeReplacement = editorToReplace;
                }
                else {
                    inactiveReplacements.push(editorToReplace);
                }
            }
        }
        // Handle inactive first
        for (const { editor, replacement, forceReplaceDirty, options } of inactiveReplacements) {
            // Open inactive editor
            await this.doOpenEditor(replacement, options);
            // Close replaced inactive editor unless they match
            if (!editor.matches(replacement)) {
                let closed = false;
                if (forceReplaceDirty) {
                    this.doCloseEditor(editor, true, { context: EditorCloseContext.REPLACE });
                    closed = true;
                }
                else {
                    closed = await this.doCloseEditorWithConfirmationHandling(editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE });
                }
                if (!closed) {
                    return; // canceled
                }
            }
        }
        // Handle active last
        if (activeReplacement) {
            // Open replacement as active editor
            const openEditorResult = this.doOpenEditor(activeReplacement.replacement, activeReplacement.options);
            // Close replaced active editor unless they match
            if (!activeReplacement.editor.matches(activeReplacement.replacement)) {
                if (activeReplacement.forceReplaceDirty) {
                    this.doCloseEditor(activeReplacement.editor, true, { context: EditorCloseContext.REPLACE });
                }
                else {
                    await this.doCloseEditorWithConfirmationHandling(activeReplacement.editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE });
                }
            }
            await openEditorResult;
        }
    }
    //#endregion
    //#region Locking
    get isLocked() {
        return this.model.isLocked;
    }
    lock(locked) {
        this.model.lock(locked);
    }
    //#endregion
    //#region Editor Actions
    createEditorActions(disposables, menuId = MenuId.EditorTitle) {
        let actions = { primary: [], secondary: [] };
        let onDidChange;
        // Editor actions require the editor control to be there, so we retrieve it via service
        const activeEditorPane = this.activeEditorPane;
        if (activeEditorPane instanceof EditorPane) {
            const editorScopedContextKeyService = activeEditorPane.scopedContextKeyService ?? this.scopedContextKeyService;
            const editorTitleMenu = disposables.add(this.menuService.createMenu(menuId, editorScopedContextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: 0 }));
            onDidChange = editorTitleMenu.onDidChange;
            const shouldInlineGroup = (action, group) => group === 'navigation' && action.actions.length <= 1;
            actions = getActionBarActions(editorTitleMenu.getActions({ arg: this.resourceContext.get(), shouldForwardArgs: true, renderShortTitle: true }), 'navigation', shouldInlineGroup);
        }
        else {
            // If there is no active pane in the group (it's the last group and it's empty)
            // Trigger the change event when the active editor changes
            const onDidChangeEmitter = disposables.add(new Emitter());
            onDidChange = onDidChangeEmitter.event;
            disposables.add(this.onDidActiveEditorChange(() => onDidChangeEmitter.fire()));
        }
        return { actions, onDidChange };
    }
    //#endregion
    //#region Themable
    updateStyles() {
        const isEmpty = this.isEmpty;
        // Container
        if (isEmpty) {
            this.element.style.backgroundColor = this.getColor(EDITOR_GROUP_EMPTY_BACKGROUND) || '';
        }
        else {
            this.element.style.backgroundColor = '';
        }
        // Title control
        const borderColor = this.getColor(EDITOR_GROUP_HEADER_BORDER) || this.getColor(contrastBorder);
        if (!isEmpty && borderColor) {
            this.titleContainer.classList.add('title-border-bottom');
            this.titleContainer.style.setProperty('--title-border-bottom-color', borderColor);
        }
        else {
            this.titleContainer.classList.remove('title-border-bottom');
            this.titleContainer.style.removeProperty('--title-border-bottom-color');
        }
        const { showTabs } = this.groupsView.partOptions;
        this.titleContainer.style.backgroundColor = this.getColor(showTabs === 'multiple' ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND) || '';
        // Editor container
        this.editorContainer.style.backgroundColor = this.getColor(editorBackground) || '';
    }
    get minimumWidth() { return this.editorPane.minimumWidth; }
    get minimumHeight() { return this.editorPane.minimumHeight; }
    get maximumWidth() { return this.editorPane.maximumWidth; }
    get maximumHeight() { return this.editorPane.maximumHeight; }
    get proportionalLayout() {
        if (!this.lastLayout) {
            return true;
        }
        return !(this.lastLayout.width === this.minimumWidth || this.lastLayout.height === this.minimumHeight);
    }
    layout(width, height, top, left) {
        this.lastLayout = { width, height, top, left };
        this.element.classList.toggle('max-height-478px', height <= 478);
        // Layout the title control first to receive the size it occupies
        const titleControlSize = this.titleControl.layout({
            container: new Dimension(width, height),
            available: new Dimension(width, height - this.editorPane.minimumHeight)
        });
        // Update progress bar location
        this.progressBar.getContainer().style.top = `${Math.max(this.titleHeight.offset - 2, 0)}px`;
        // Pass the container width and remaining height to the editor layout
        const editorHeight = Math.max(0, height - titleControlSize.height);
        this.editorContainer.style.height = `${editorHeight}px`;
        this.editorPane.layout({ width, height: editorHeight, top: top + titleControlSize.height, left });
    }
    relayout() {
        if (this.lastLayout) {
            const { width, height, top, left } = this.lastLayout;
            this.layout(width, height, top, left);
        }
    }
    setBoundarySashes(sashes) {
        this.editorPane.setBoundarySashes(sashes);
    }
    toJSON() {
        return this.model.serialize();
    }
    //#endregion
    dispose() {
        this._disposed = true;
        this._onWillDispose.fire();
        super.dispose();
    }
};
EditorGroupView = EditorGroupView_1 = __decorate([
    __param(6, IInstantiationService),
    __param(7, IContextKeyService),
    __param(8, IThemeService),
    __param(9, ITelemetryService),
    __param(10, IKeybindingService),
    __param(11, IMenuService),
    __param(12, IContextMenuService),
    __param(13, IFileDialogService),
    __param(14, IEditorService),
    __param(15, IFilesConfigurationService),
    __param(16, IUriIdentityService),
    __param(17, ILogService),
    __param(18, IEditorResolverService),
    __param(19, IHostService),
    __param(20, IDialogService),
    __param(21, IFileService)
], EditorGroupView);
export { EditorGroupView };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yR3JvdXBWaWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvckdyb3VwVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQTJFLHVCQUF1QixFQUFFLHNCQUFzQixFQUFFLDRCQUE0QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdE8sT0FBTyxFQUFnSixzQkFBc0IsRUFBZ0QsMEJBQTBCLEVBQUUsZ0JBQWdCLEVBQUUsa0JBQWtCLEVBQXVJLG1CQUFtQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDM2QsT0FBTyxFQUFFLDhCQUE4QixFQUFFLHdCQUF3QixFQUFFLDhCQUE4QixFQUFFLHlCQUF5QixFQUFFLHlCQUF5QixFQUFFLDhCQUE4QixFQUFFLCtCQUErQixFQUFFLGtCQUFrQixFQUFFLHVCQUF1QixFQUFFLHFDQUFxQyxFQUFFLGtDQUFrQyxFQUFFLDZCQUE2QixFQUFFLCtCQUErQixFQUFFLDhCQUE4QixFQUFFLG1CQUFtQixFQUFFLDJCQUEyQixFQUFFLDRCQUE0QixFQUFFLG9DQUFvQyxFQUFFLGlDQUFpQyxFQUFFLHFDQUFxQyxFQUFFLGdDQUFnQyxFQUFFLHNEQUFzRCxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFbnZCLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxPQUFPLEVBQVMsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUscUJBQXFCLEVBQUUs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