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
var ModalEditorPartImpl_1;
import './media/modalEditorPart.css';
import { $, addDisposableListener, append, Dimension, EventHelper, EventType, hide, isHTMLElement, setVisibility, show } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { ActionBar, prepareActions } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { Action } from '../../../../base/common/actions.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Sash } from '../../../../base/browser/ui/sash/sash.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar, WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPart } from './editorPart.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, EditorPartModalSidebarVisibleContext } from '../../../common/contextkeys.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ResourceLabel } from '../../labels.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CLOSE_MODAL_EDITOR_COMMAND_ID, MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID, MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID, NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID, NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID, TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID, TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID } from './editorCommands.js';
const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_DEFAULT_WIDTH = 1400;
const MODAL_MAX_DEFAULT_HEIGHT = 900;
const MODAL_BORDER_SIZE = 2; // 1px border on each side
const MODAL_HEADER_HEIGHT = 33; // 32px header + 1px border bottom
const MODAL_SNAP_THRESHOLD = 20;
const MODAL_MAXIMIZED_PADDING = 16;
const MODAL_SIDEBAR_MIN_WIDTH = 160;
const MODAL_SIDEBAR_DEFAULT_WIDTH = 260;
const MODAL_SIDEBAR_PADDING = 8; // matches CSS padding on sidebar container
const MODAL_SIDEBAR_BORDER_RIGHT = 1; // matches CSS border-right on sidebar container
const defaultModalEditorAllowableCommands = new Set([
    // Application
    'workbench.action.quit',
    'workbench.action.reloadWindow',
    'workbench.action.toggleFullScreen',
    // Quick access
    'workbench.action.gotoSymbol',
    'workbench.action.gotoLine',
    // Zoom
    'workbench.action.zoomIn',
    'workbench.action.zoomOut',
    'workbench.action.zoomReset',
    // File operations
    'workbench.action.files.save',
    'workbench.action.files.saveAll',
    'workbench.action.files.revert',
    // Close editors
    'workbench.action.closeActiveEditor',
    'workbench.action.closeAllEditors',
    'workbench.action.closeEditorsInGroup',
    'workbench.action.closeUnmodifiedEditors',
    // Settings
    'workbench.action.openSettings',
    'workbench.action.openSettings2',
    'workbench.action.openSettingsJson',
    'workbench.action.openGlobalSettings',
    'workbench.action.openApplicationSettingsJson',
    'workbench.action.openRawDefaultSettings',
    'workbench.action.openWorkspaceSettings',
    'workbench.action.openWorkspaceSettingsFile',
    'workbench.action.openFolderSettings',
    'workbench.action.openFolderSettingsFile',
    'workbench.action.openRemoteSettings',
    'workbench.action.openRemoteSettingsFile',
    'workbench.action.openAccessibilitySettings',
    'workbench.action.configureLanguageBasedSettings',
    // Keybindings
    'workbench.action.openGlobalKeybindings',
    'workbench.action.openDefaultKeybindingsFile',
    'workbench.action.openGlobalKeybindingsFile',
    'workbench.action.openKeyboardLayoutPicker',
    // Modal editor
    CLOSE_MODAL_EDITOR_COMMAND_ID,
    MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
    MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
    TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
    NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
    NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
    TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID,
]);
const USE_MODAL_EDITOR_SETTING = 'workbench.editor.useModal';
let ModalEditorPart = class ModalEditorPart {
    constructor(editorPartsView, instantiationService, editorService, layoutService, keybindingService, hostService, configurationService) {
        this.editorPartsView = editorPartsView;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.layoutService = layoutService;
        this.keybindingService = keybindingService;
        this.hostService = hostService;
        this.configurationService = configurationService;
    }
    async create(options) {
        const disposables = new DisposableStore();
        // Modal container
        const modalElement = $('.monaco-modal-editor-block');
        this.layoutService.mainContainer.appendChild(modalElement);
        disposables.add(toDisposable(() => modalElement.remove()));
        disposables.add(addDisposableListener(modalElement, EventType.MOUSE_DOWN, e => {
            if (e.target === modalElement) {
                EventHelper.stop(e, true);
                // Close modal when clicking outside the dialog
                void editorPart.close();
            }
        }));
        let useModalMode = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING);
        disposables.add(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
                useModalMode = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING);
            }
        }));
        disposables.add(addDisposableListener(modalElement, EventType.KEY_DOWN, e => {
            const event = new StandardKeyboardEvent(e);
            // Prevent unsupported commands unless all editors open in modal
            if (useModalMode !== 'all') {
                const resolved = this.keybindingService.softDispatch(event, this.layoutService.mainContainer);
                if (resolved.kind === 2 /* ResultKind.KbFound */ && resolved.commandId) {
                    if (resolved.commandId.startsWith('workbench.') &&
                        !defaultModalEditorAllowableCommands.has(resolved.commandId)) {
                        EventHelper.stop(event, true);
                    }
                }
            }
        }));
        // Resizable wrapper
        const resizableElement = new ResizableHTMLElement();
        disposables.add(toDisposable(() => resizableElement.dispose()));
        resizableElement.domNode.classList.add('modal-editor-resizable');
        const effectiveMinWidth = MODAL_MIN_WIDTH + (options?.sidebar ? MODAL_SIDEBAR_MIN_WIDTH : 0);
        resizableElement.minSize = new Dimension(effectiveMinWidth, MODAL_MIN_HEIGHT);
        modalElement.appendChild(resizableElement.domNode);
        const shadowElement = resizableElement.domNode.appendChild($('.modal-editor-shadow'));
        // Editor part container
        const titleId = 'modal-editor-title';
        const editorPartContainer = $('.part.editor.modal-editor-part', {
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': titleId,
        });
        shadowElement.appendChild(editorPartContainer);
        // Header
        const headerElement = editorPartContainer.appendChild($('.modal-editor-header'));
        // Sidebar toggle button (only when sidebar is configured)
        const sidebarToggleContainer = append(headerElement, $('div.modal-editor-sidebar-toggle'));
        if (!options?.sidebar) {
            hide(sidebarToggleContainer);
        }
        const sidebarToggleIcon = options?.sidebar?.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft;
        const sidebarToggleAction = disposables.add(new Action(TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID, localize('toggleSidebar', "Toggle Sidebar"), ThemeIcon.asClassName(sidebarToggleIcon), true));
        const sidebarToggleActionBar = disposables.add(new ActionBar(sidebarToggleContainer));
        sidebarToggleActionBar.push(sidebarToggleAction, { icon: true, label: false });
        // Title element
        const titleElement = append(headerElement, $('div.modal-editor-title.show-file-icons'));
        titleElement.id = titleId;
        titleElement.textContent = '';
        // Navigation widget
        const navigationContainer = append(headerElement, $('div.modal-editor-navigation'));
        hide(navigationContainer);
        disposables.add(addDisposableListener(navigationContainer, EventType.DBLCLICK, e => EventHelper.stop(e, true)));
        const previousButton = disposables.add(new Button(navigationContainer, { title: localize('previousItem', "Previous") }));
        previousButton.icon = Codicon.chevronLeft;
        previousButton.element.classList.add('modal-editor-nav-button');
        disposables.add(previousButton.onDidClick(() => {
            const navigation = editorPart.navigation;
            if (navigation && navigation.current > 0) {
                navigation.navigate(navigation.current - 1);
            }
        }));
        const navigationLabel = append(navigationContainer, $('span.modal-editor-nav-label'));
        navigationLabel.setAttribute('aria-live', 'polite');
        const nextButton = disposables.add(new Button(navigationContainer, { title: localize('nextItem', "Next") }));
        nextButton.icon = Codicon.chevronRight;
        nextButton.element.classList.add('modal-editor-nav-button');
        disposables.add(nextButton.onDidClick(() => {
            const navigation = editorPart.navigation;
            if (navigation && navigation.current < navigation.total - 1) {
                navigation.navigate(navigation.current + 1);
            }
        }));
        // Toolbar
        const actionBarContainer = append(headerElement, $('div.modal-editor-action-container'));
        // Sidebar
        const sidebarResult = this.createSidebar(editorPartContainer, options?.sidebar, disposables);
        if (sidebarResult) {
            if (sidebarResult.isVisible()) {
                editorPartContainer.classList.add('has-sidebar');
            }
            disposables.add(sidebarResult.onDidResize(() => layoutModal()));
        }
        // Create the editor part
        const editorPart = disposables.add(this.instantiationService.createInstance(ModalEditorPartImpl, mainWindow.vscodeWindowId, this.editorPartsView, modalElement, options));
        disposables.add(this.editorPartsView.registerPart(editorPart));
        editorPart.create(editorPartContainer);
        disposables.add(Event.once(editorPart.onWillClose)(() => disposables.dispose()));
        disposables.add(Event.runAndSubscribe(editorPart.onDidChangeNavigation, ((navigation) => {
            if (navigation && navigation.total > 1) {
                show(navigationContainer);
                navigationLabel.textContent = localize('navigationCounter', "{0} of {1}", navigation.current + 1, navigation.total);
                previousButton.enabled = navigation.current > 0;
                nextButton.enabled = navigation.current < navigation.total - 1;
            }
            else {
                hide(navigationContainer);
            }
        }), editorPart.navigation));
        if (sidebarResult) {
            disposables.add(Event.runAndSubscribe(sidebarResult.onDidResize, () => {
                if (sidebarResult.isVisible()) {
                    editorPart.sidebarWidth = sidebarResult.hasCustomWidth() ? sidebarResult.getWidth() : undefined;
                }
            }));
            disposables.add(editorPart.onDidToggleSidebar(() => {
                sidebarResult.setVisible(!editorPart.sidebarHidden);
                sidebarToggleAction.class = ThemeIcon.asClassName(editorPart.sidebarHidden ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft);
                layoutModal();
            }));
        }
        // Wire up sidebar toggle button
        disposables.add(sidebarToggleActionBar.onDidRun(() => editorPart.toggleSidebar()));
        // Create scoped instantiation service
        const modalEditorService = this.editorService.createScoped(editorPart, disposables);
        const scopedInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection([IEditorService, modalEditorService])));
        // Create editor toolbar
        const editorActionsToolbarContainer = append(actionBarContainer, $('div.modal-editor-editor-actions'));
        const editorActionsToolbar = disposables.add(scopedInstantiationService.createInstance(WorkbenchToolBar, editorActionsToolbarContainer, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            highlightToggledItems: true,
        }));
        const editorActionsSeparator = append(actionBarContainer, $('div.modal-editor-action-separator'));
        const editorActionsDisposables = disposables.add(new DisposableStore());
        const updateEditorActions = () => {
            editorActionsDisposables.clear();
            const editorActions = editorPart.activeGroup.createEditorActions(editorActionsDisposables, MenuId.ModalEditorEditorTitle);
            editorActionsDisposables.add(editorActions.onDidChange(() => updateEditorActions()));
            const { primary, secondary } = editorActions.actions;
            editorActionsToolbar.setActions(prepareActions(primary), prepareActions(secondary));
            const hasActions = primary.length > 0 || secondary.length > 0;
            setVisibility(hasActions, editorActionsSeparator);
        };
        disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, () => updateEditorActions()));
        disposables.add(modalEditorService.onDidEditorsChange(() => editorPart.enforceModalPartOptions()));
        // Create global toolbar
        disposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ModalEditorTitle, {
            hiddenItemStrategy: -1 /* HiddenItemStrategy.NoHide */,
            highlightToggledItems: true,
            menuOptions: { shouldForwardArgs: true }
        }));
        // Create label
        const label = disposables.add(scopedInstantiationService.createInstance(ResourceLabel, titleElement, {}));
        const labelChangeDisposable = disposables.add(new MutableDisposable());
        let trackedEditor;
        const updateLabel = () => {
            const activeEditor = editorPart.activeGroup.activeEditor;
            if (activeEditor) {
                const { labelFormat } = editorPart.partOptions;
                label.element.setResource({
                    resource: EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.BOTH }),
                    name: activeEditor.getName(),
                    description: activeEditor.getDescription(labelFormat === 'short' ? 0 /* Verbosity.SHORT */ : labelFormat === 'long' ? 2 /* Verbosity.LONG */ : 1 /* Verbosity.MEDIUM */) || ''
                }, {
                    icon: activeEditor.getIcon(),
                    extraClasses: activeEditor.getLabelExtraClasses(),
                });
                // Only (re)subscribe when the active editor changes, not on every label update
                if (trackedEditor !== activeEditor) {
                    trackedEditor = activeEditor;
                    labelChangeDisposable.value = activeEditor.onDidChangeLabel(() => updateLabel());
                }
            }
            else {
                label.element.clear();
                trackedEditor = undefined;
                labelChangeDisposable.clear();
            }
        };
        disposables.add(Event.runAndSubscribe(modalEditorService.onDidActiveEditorChange, updateLabel));
        // Handle double-click on header to toggle maximize
        disposables.add(addDisposableListener(headerElement, EventType.DBLCLICK, e => {
            EventHelper.stop(e);
            editorPart.handleHeaderDoubleClick();
        }));
        // Handle drag on header to move the modal
        const dragDisposables = disposables.add(new DisposableStore());
        let didDrag = false;
        disposables.add(addDisposableListener(headerElement, EventType.MOUSE_DOWN, e => {
            if (editorPart.maximized) {
                return; // no drag when maximized
            }
            if (e.button !== 0) {
                return; // only left button
            }
            // Ignore if target is a button or action
            const target = e.target;
            if (target.closest('.monaco-button') || target.closest('.action-item')) {
                return;
            }
            // Prevent text selection during drag
            e.preventDefault();
            dragDisposables.clear();
            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = parseFloat(resizableElement.domNode.style.left) || 0;
            const startTop = parseFloat(resizableElement.domNode.style.top) || 0;
            didDrag = false;
            const onMouseMove = (moveEvent) => {
                didDrag = true;
                EventHelper.stop(moveEvent, true);
                const containerDimension = this.layoutService.mainContainerDimension;
                const titleBarOffset = this.layoutService.mainContainerOffset.top;
                const dialogWidth = resizableElement.size.width;
                const dialogHeight = resizableElement.size.height;
                // Clamp to window bounds
                const minLeft = 0;
                const minTop = titleBarOffset;
                const maxLeft = Math.max(minLeft, containerDimension.width - dialogWidth);
                const maxTop = Math.max(minTop, containerDimension.height - dialogHeight);
                let newLeft = Math.max(minLeft, Math.min(maxLeft, startLeft + (moveEvent.clientX - startX)));
                let newTop = Math.max(minTop, Math.min(maxTop, startTop + (moveEvent.clientY - startY)));
                // Snap to center position when close
                const centerLeft = (containerDimension.width - dialogWidth) / 2;
                const centerTop = Math.max(titleBarOffset, (containerDimension.height - dialogHeight) / 2);
                if (Math.abs(newLeft - centerLeft) < MODAL_SNAP_THRESHOLD && Math.abs(newTop - centerTop) < MODAL_SNAP_THRESHOLD) {
                    newLeft = centerLeft;
                    newTop = centerTop;
                }
                resizableElement.domNode.style.left = `${newLeft}px`;
                resizableElement.domNode.style.top = `${newTop}px`;
            };
            const onMouseUp = (upEvent) => {
                EventHelper.stop(upEvent, true);
                dragDisposables.clear();
                if (didDrag) {
                    const currentLeft = parseFloat(resizableElement.domNode.style.left) || 0;
                    const currentTop = parseFloat(resizableElement.domNode.style.top) || 0;
                    // Check if snapped to center — if so, clear custom position
                    const containerDimension = this.layoutService.mainContainerDimension;
                    const titleBarOffset = this.layoutService.mainContainerOffset.top;
                    const centerLeft = (containerDimension.width - resizableElement.size.width) / 2;
                    const centerTop = Math.max(titleBarOffset, (containerDimension.height - resizableElement.size.height) / 2);
                    if (Math.abs(currentLeft - centerLeft) < 1 && Math.abs(currentTop - centerTop) < 1) {
                        editorPart.position = undefined;
                    }
                    else {
                        editorPart.position = { left: currentLeft, top: currentTop };
                    }
                }
            };
            dragDisposables.add(addDisposableListener(mainWindow, EventType.MOUSE_MOVE, onMouseMove, true));
            dragDisposables.add(addDisposableListener(mainWindow, EventType.MOUSE_UP, onMouseUp, true));
        }));
        // Focus active editor when clicking into the title area with no other click target
        disposables.add(addDisposableListener(headerElement, EventType.CLICK, e => {
            const wasDrag = didDrag;
            didDrag = false;
            if (wasDrag) {
                return; // skip focus after drag
            }
            EventHelper.stop(e);
            editorPart.activeGroup.focus();
        }));
        // Handle resize from sashes
        let isResizing = false;
        let resizeStartLeft = 0;
        let resizeStartTop = 0;
        let resizeStartSize = Dimension.None;
        disposables.add(resizableElement.onDidWillResize(() => {
            isResizing = true;
            resizeStartLeft = parseFloat(resizableElement.domNode.style.left) || 0;
            resizeStartTop = parseFloat(resizableElement.domNode.style.top) || 0;
            resizeStartSize = new Dimension(resizableElement.size.width, resizableElement.size.height);
        }));
        disposables.add(resizableElement.onDidResize(e => {
            // Clamp position and size to window bounds during active resize
            // (skip on `done` — values are already correct from prior events,
            //  and directional flags are not set on the done event)
            if (!e.done) {
                const containerDimension = this.layoutService.mainContainerDimension;
                const titleBarOffset = this.layoutService.mainContainerOffset.top;
                const deltaWidth = e.dimension.width - resizeStartSize.width;
                const deltaHeight = e.dimension.height - resizeStartSize.height;
                let newLeft = e.west ? resizeStartLeft - deltaWidth : resizeStartLeft;
                let newTop = e.north ? resizeStartTop - deltaHeight : resizeStartTop;
                let newWidth = e.dimension.width;
                let newHeight = e.dimension.height;
                if (newLeft < 0) {
                    newWidth += newLeft;
                    newLeft = 0;
                }
                if (newTop < titleBarOffset) {
                    newHeight += newTop - titleBarOffset;
                    newTop = titleBarOffset;
                }
                if (newLeft + newWidth > containerDimension.width) {
                    newWidth = containerDimension.width - newLeft;
                }
                if (newTop + newHeight > containerDimension.height) {
                    newHeight = containerDimension.height - newTop;
                }
                // Apply corrected size if it was clamped
                if (newWidth !== e.dimension.width || newHeight !== e.dimension.height) {
                    resizableElement.layout(newHeight, newWidth);
                }
                // Adjust position to keep the opposite edge fixed
                if (e.west) {
                    resizableElement.domNode.style.left = `${newLeft}px`;
                }
                if (e.north) {
                    resizableElement.domNode.style.top = `${newTop}px`;
                }
            }
            // Update editor part layout during resize
            const size = resizableElement.size;
            const sidebarWidth = sidebarResult?.getWidth() ?? 0;
            editorPart.layout(Math.max(0, size.width - MODAL_BORDER_SIZE - sidebarWidth), size.height - MODAL_BORDER_SIZE - MODAL_HEADER_HEIGHT, 0, 0);
            sidebarResult?.layout(size.height - MODAL_BORDER_SIZE - MODAL_HEADER_HEIGHT);
            if (e.done) {
                isResizing = false;
                // Check if size matches the default (from sash double-click reset)
                const defaultSize = getDefaultSize();
                if (size.width === defaultSize.width && size.height === defaultSize.height) {
                    editorPart.size = undefined;
                    editorPart.position = undefined;
                    layoutModal();
                }
                else {
                    editorPart.size = new Dimension(size.width, size.height);
                    editorPart.position = {
                        left: parseFloat(resizableElement.domNode.style.left) || 0,
                        top: parseFloat(resizableElement.domNode.style.top) || 0,
                    };
                }
            }
        }));
        // Compute default (non-custom, non-maximized) modal size
        const getDefaultSize = () => {
            const containerDimension = this.layoutService.mainContainerDimension;
            const titleBarOffset = this.layoutService.mainContainerOffset.top;
            const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
            const targetWidth = containerDimension.width * 0.8;
            const targetHeight = availableHeight * 0.8;
            const width = Math.min(targetWidth, MODAL_MAX_DEFAULT_WIDTH, containerDimension.width);
            const height = Math.min(targetHeight, MODAL_MAX_DEFAULT_HEIGHT, availableHeight);
            return new Dimension(width, height);
        };
        // Layout the modal editor part
        let isFirstLayout = true;
        const layoutModal = () => {
            if (isResizing) {
                return; // skip layout during interactive resize
            }
            const containerDimension = this.layoutService.mainContainerDimension;
            const titleBarOffset = this.layoutService.mainContainerOffset.top;
            const availableHeight = Math.max(containerDimension.height - titleBarOffset, 0);
            const defaultSize = getDefaultSize();
            let width;
            let height;
            if (editorPart.maximized) {
                const verticalPadding = Math.max(titleBarOffset /* keep away from title bar to prevent clipping issues with WCO */, MODAL_MAXIMIZED_PADDING);
                width = Math.max(containerDimension.width - MODAL_MAXIMIZED_PADDING, 0);
                height = Math.max(availableHeight - verticalPadding, 0);
            }
            else if (editorPart.size) {
                width = Math.min(editorPart.size.width, containerDimension.width);
                height = Math.min(editorPart.size.height, availableHeight);
            }
            else {
                width = defaultSize.width;
                height = defaultSize.height;
            }
            height = Math.min(height, availableHeight); // Ensure the modal never exceeds available height (below the title bar)
            // On first layout, clamp sidebar width if it would leave the editor too narrow
            if (isFirstLayout) {
                isFirstLayout = false;
                sidebarResult?.clampWidth(width);
            }
            // Update resizable element size and constraints
            resizableElement.maxSize = new Dimension(containerDimension.width, availableHeight);
            resizableElement.preferredSize = defaultSize;
            resizableElement.layout(height, width);
            // Enable/disable sashes based on maximized state
            const canResize = !editorPart.maximized;
            resizableElement.enableSashes(canResize, canResize, canResize, canResize);
            // Position: use custom position if available (clamped to bounds), otherwise center
            if (!editorPart.maximized && editorPart.position) {
                const clampedLeft = Math.max(0, Math.min(editorPart.position.left, containerDimension.width - width));
                const clampedTop = Math.max(titleBarOffset, Math.min(editorPart.position.top, titleBarOffset + availableHeight - height));
                resizableElement.domNode.style.left = `${clampedLeft}px`;
                resizableElement.domNode.style.top = `${clampedTop}px`;
            }
            else {
                const left = (containerDimension.width - width) / 2;
                const top = Math.max(titleBarOffset, (containerDimension.height - height) / 2); // center in full window, but clamp to stay below the title bar
                resizableElement.domNode.style.left = `${left}px`;
                resizableElement.domNode.style.top = `${top}px`;
            }
            editorPart.layout(Math.max(0, width - MODAL_BORDER_SIZE - (sidebarResult?.getWidth() ?? 0)), height - MODAL_BORDER_SIZE - MODAL_HEADER_HEIGHT, 0, 0);
            sidebarResult?.layout(height - MODAL_BORDER_SIZE - MODAL_HEADER_HEIGHT);
        };
        disposables.add(Event.runAndSubscribe(this.layoutService.onDidLayoutMainContainer, layoutModal));
        disposables.add(editorPart.onDidChangeMaximized(() => layoutModal()));
        disposables.add(editorPart.onDidRequestLayout(() => layoutModal()));
        // Dim window controls to match the modal overlay
        this.hostService.setWindowDimmed(mainWindow, true);
        disposables.add(toDisposable(() => this.hostService.setWindowDimmed(mainWindow, false)));
        // Focus
        editorPart.activeGroup.focus();
        return {
            part: editorPart,
            instantiationService: scopedInstantiationService,
            disposables
        };
    }
    createSidebar(container, content, disposables) {
        if (!content) {
            return undefined;
        }
        let sidebarWidth = content.sidebarWidth && content.sidebarWidth > 0 ? content.sidebarWidth : MODAL_SIDEBAR_DEFAULT_WIDTH;
        let customWidth = content.sidebarWidth !== undefined && content.sidebarWidth > 0;
        let visible = !content.sidebarHidden;
        const sidebarContainer = append(container, $('div.modal-editor-sidebar.show-file-icons'));
        sidebarContainer.style.width = `${sidebarWidth}px`;
        setVisibility(visible, sidebarContainer);
        // Let the caller render content
        const onDidLayoutEmitter = disposables.add(new Emitter());
        const contentDisposable = disposables.add(new MutableDisposable());
        contentDisposable.value = content.render(sidebarContainer, onDidLayoutEmitter.event);
        // Sash for resizing sidebar
        const sash = disposables.add(new Sash(container, {
            getVerticalSashLeft: () => sidebarWidth,
            getVerticalSashTop: () => MODAL_HEADER_HEIGHT,
            getVerticalSashHeight: () => (container.clientHeight - MODAL_HEADER_HEIGHT),
        }, { orientation: 0 /* Orientation.VERTICAL */ }));
        if (!visible) {
            sash.state = 0 /* SashState.Disabled */;
        }
        const onDidResizeEmitter = disposables.add(new Emitter());
        let sashStartWidth;
        disposables.add(sash.onDidStart(() => sashStartWidth = sidebarWidth));
        disposables.add(sash.onDidEnd(() => sashStartWidth = undefined));
        disposables.add(sash.onDidChange(e => {
            if (sashStartWidth === undefined) {
                return;
            }
            const delta = e.currentX - e.startX;
            const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
            sidebarWidth = Math.min(maxWidth, Math.max(MODAL_SIDEBAR_MIN_WIDTH, sashStartWidth + delta));
            customWidth = true;
            sidebarContainer.style.width = `${sidebarWidth}px`;
            sash.layout();
            onDidResizeEmitter.fire();
        }));
        disposables.add(sash.onDidReset(() => {
            const maxWidth = Math.max(MODAL_SIDEBAR_MIN_WIDTH, container.clientWidth - MODAL_MIN_WIDTH);
            sidebarWidth = Math.min(maxWidth, MODAL_SIDEBAR_DEFAULT_WIDTH);
            customWidth = false;
            sidebarContainer.style.width = `${sidebarWidth}px`;
            sash.layout();
            onDidResizeEmitter.fire();
        }));
        return {
            onDidResize: onDidResizeEmitter.event,
            getWidth: () => visible ? sidebarWidth : 0,
            hasCustomWidth: () => customWidth,
            clampWidth: (modalWidth) => {
                if (sidebarWidth + MODAL_MIN_WIDTH > modalWidth) {
                    sidebarWidth = Math.min(MODAL_SIDEBAR_DEFAULT_WIDTH, Math.max(MODAL_SIDEBAR_MIN_WIDTH, modalWidth - MODAL_MIN_WIDTH));
                    customWidth = false;
                    sidebarContainer.style.width = `${sidebarWidth}px`;
                    sash.layout();
                    onDidResizeEmitter.fire();
                }
            },
            isVisible: () => visible,
            setVisible: (value) => {
                visible = value;
                setVisibility(visible, sidebarContainer);
                container.classList.toggle('has-sidebar', visible);
                sash.state = visible ? 3 /* SashState.Enabled */ : 0 /* SashState.Disabled */;
                onDidResizeEmitter.fire();
            },
            layout: (height) => {
                if (visible) {
                    onDidLayoutEmitter.fire({
                        height: height - MODAL_SIDEBAR_PADDING * 2,
                        width: sidebarWidth - MODAL_SIDEBAR_PADDING * 2 - MODAL_SIDEBAR_BORDER_RIGHT
                    });
                }
                sash.layout();
            },
            updateContent: (newContent) => {
                contentDisposable.clear();
                sidebarContainer.textContent = '';
                contentDisposable.value = newContent.render(sidebarContainer, onDidLayoutEmitter.event);
            },
        };
    }
};
ModalEditorPart = __decorate([
    __param(1, IInstantiationService),
    __param(2, IEditorService),
    __param(3, IWorkbenchLayoutService),
    __param(4, IKeybindingService),
    __param(5, IHostService),
    __param(6, IConfigurationService)
], ModalEditorPart);
export { ModalEditorPart };
let ModalEditorPartImpl = class ModalEditorPartImpl extends EditorPart {
    static { ModalEditorPartImpl_1 = this; }
    static { this.COUNTER = 1; }
    get maximized() { return this._maximized; }
    get size() { return this._size; }
    set size(value) { this._size = value; }
    get position() { return this._position; }
    set position(value) { this._position = value; }
    get sidebarWidth() { return this._sidebarWidth; }
    set sidebarWidth(value) { this._sidebarWidth = value; }
    get sidebarHidden() { return this._sidebarHidden; }
    set sidebarHidden(value) { this._sidebarHidden = value; }
    get hasSidebar() { return this._hasSidebar; }
    set hasSidebar(value) { this._hasSidebar = value; }
    get navigation() { return this._navigation; }
    constructor(windowId, editorPartsView, modalElement, options, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
        const id = ModalEditorPartImpl_1.COUNTER++;
        super(editorPartsView, `workbench.parts.modalEditor.${id}`, localize('modalEditorPart', "Modal Editor Area"), windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
        this.modalElement = modalElement;
        this._onWillClose = this._register(new Emitter());
        this.onWillClose = this._onWillClose.event;
        this._onDidChangeMaximized = this._register(new Emitter());
        this.onDidChangeMaximized = this._onDidChangeMaximized.event;
        this._onDidRequestLayout = this._register(new Emitter());
        this.onDidRequestLayout = this._onDidRequestLayout.event;
        this._onDidChangeNavigation = this._register(new Emitter());
        this.onDidChangeNavigation = this._onDidChangeNavigation.event;
        this._sidebarHidden = false;
        this._hasSidebar = false;
        this._onDidToggleSidebar = this._register(new Emitter());
        this.onDidToggleSidebar = this._onDidToggleSidebar.event;
        this.optionsDisposable = this._register(new MutableDisposable());
        this.previousMainWindowActiveElement = null;
        this._maximized = options?.maximized ?? false;
        this._size = options?.size;
        this._position = options?.position;
        this._navigation = options?.navigation;
        this._hasSidebar = !!options?.sidebar;
        this._sidebarHidden = options?.sidebar?.sidebarHidden ?? false;
        this._sidebarWidth = options?.sidebar?.sidebarWidth;
        // When restoring a maximized state with custom layout,
        // initialize saved state so un-maximize can restore it
        if (this._maximized) {
            this.savedSize = this._size;
            this.savedPosition = this._position;
        }
        this.enforceModalPartOptions();
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(USE_MODAL_EDITOR_SETTING)) {
                this.enforceModalPartOptions();
            }
        }));
    }
    create(parent, options) {
        this.previousMainWindowActiveElement = mainWindow.document.activeElement;
        super.create(parent, options);
    }
    enforceModalPartOptions() {
        const useModalForAll = this.configurationService.getValue(USE_MODAL_EDITOR_SETTING) === 'all';
        const editorCount = this.groups.reduce((count, group) => count + group.count, 0);
        const showTabs = useModalForAll && editorCount > 1 ? 'multiple' : 'none';
        this.optionsDisposable.value = this.enforcePartOptions({
            showTabs,
            enablePreview: true,
            closeEmptyGroups: true,
            tabActionCloseVisibility: showTabs !== 'none',
            editorActionsLocation: 'hidden',
            tabHeight: 'default',
            wrapTabs: false,
            allowDropIntoGroup: false
        });
    }
    updateOptions(options) {
        if (typeof options?.maximized === 'boolean' && options.maximized !== this._maximized) {
            this.toggleMaximized();
        }
        this._navigation = options?.navigation;
        this._onDidChangeNavigation.fire(options?.navigation);
    }
    toggleMaximized() {
        this._maximized = !this._maximized;
        if (this._maximized) {
            this.savedSize = this._size;
            this.savedPosition = this._position;
        }
        else {
            this._size = this.savedSize;
            this._position = this.savedPosition;
            this.savedSize = undefined;
            this.savedPosition = undefined;
        }
        this._onDidChangeMaximized.fire(this._maximized);
    }
    toggleSidebar() {
        this._sidebarHidden = !this._sidebarHidden;
        this._onDidToggleSidebar.fire();
    }
    handleHeaderDoubleClick() {
        if (this._maximized) {
            // Clear saved state so that toggleMaximized restores to default
            this.savedSize = undefined;
            this.savedPosition = undefined;
            this.toggleMaximized();
        }
        else if (this._size) {
            this._size = undefined;
            this._position = undefined;
            this._onDidRequestLayout.fire();
        }
        else {
            this.toggleMaximized(); // maximize
        }
    }
    handleContextKeys() {
        const isModalEditorPartContext = EditorPartModalContext.bindTo(this.scopedContextKeyService);
        isModalEditorPartContext.set(true);
        const isMaximizedContext = EditorPartModalMaximizedContext.bindTo(this.scopedContextKeyService);
        isMaximizedContext.set(this._maximized);
        this._register(this.onDidChangeMaximized(maximized => isMaximizedContext.set(maximized)));
        const hasNavigationContext = EditorPartModalNavigationContext.bindTo(this.scopedContextKeyService);
        hasNavigationContext.set(!!this._navigation && this._navigation.total > 1);
        this._register(this.onDidChangeNavigation(navigation => hasNavigationContext.set(!!navigation && navigation.total > 1)));
        const sidebarContext = EditorPartModalSidebarContext.bindTo(this.scopedContextKeyService);
        sidebarContext.set(this._hasSidebar);
        const sidebarVisibleContext = EditorPartModalSidebarVisibleContext.bindTo(this.scopedContextKeyService);
        sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden);
        this._register(this.onDidToggleSidebar(() => sidebarVisibleContext.set(this._hasSidebar && !this._sidebarHidden)));
        super.handleContextKeys();
    }
    removeGroup(group, preserveFocus) {
        // Close modal when last group removed
        const groupView = this.assertGroupView(group);
        if (this.count === 1 && this.activeGroup === groupView) {
            this.doRemoveLastGroup();
        }
        // Otherwise delegate to parent implementation
        else {
            super.removeGroup(group, preserveFocus);
        }
    }
    doRemoveLastGroup() {
        // Activate main editor group when closing
        const activeMainGroup = this.editorPartsView.mainPart.activeGroup;
        this.editorPartsView.mainPart.activateGroup(activeMainGroup, undefined, 1 /* GroupActivationReason.PART_CLOSE */);
        // Deal with focus: removing the last modal group
        // means we return back to the main editor part.
        // But we only want to focus that if it was focused
        // before to prevent revealing the editor part if
        // it was maybe hidden before.
        const mainEditorPartContainer = this.layoutService.getContainer(mainWindow, "workbench.parts.editor" /* Parts.EDITOR_PART */);
        if (!isHTMLElement(this.previousMainWindowActiveElement) || // invalid previous element
            !this.previousMainWindowActiveElement.isConnected || // previous element no longer in the DOM
            mainEditorPartContainer?.contains(this.previousMainWindowActiveElement) // previous element is inside main editor part
        ) {
            activeMainGroup.focus();
        }
        else {
            this.previousMainWindowActiveElement.focus();
        }
        this._onWillClose.fire();
    }
    saveState() {
        return; // disabled, modal editor part state is not persisted
    }
    async close(options) {
        // Merge all editors to main part (editors stay open, no confirmation needed)
        if (options?.mergeAllEditorsToMainPart) {
            const result = this.mergeGroupsToMainPart();
            if (!result) {
                return false;
            }
        }
        // Close all editors in each group, leveraging the existing
        // confirmation infrastructure for dirty editors
        else {
            for (const group of this.groups) {
                const closed = await group.closeAllEditors();
                if (!closed) {
                    return false; // user cancelled
                }
            }
        }
        this._onWillClose.fire();
        return true;
    }
    mergeGroupsToMainPart() {
        if (!this.groups.some(group => group.count > 0)) {
            return true; // skip if we have no editors opened
        }
        // Find the most recent group that is not locked
        let targetGroup = undefined;
        for (const group of this.editorPartsView.mainPart.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
            if (!group.isLocked) {
                targetGroup = group;
                break;
            }
        }
        if (!targetGroup) {
            targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === 'right' ? 3 /* GroupDirection.RIGHT */ : 1 /* GroupDirection.DOWN */);
        }
        const result = this.mergeAllGroups(targetGroup, {
            // Try to reduce the impact of closing the modal
            // as much as possible by not changing existing editors
            // in the main window.
            preserveExistingIndex: true
        });
        targetGroup.focus();
        return result;
    }
    dispose() {
        this._navigation = undefined; // ensure to free the reference to the navigation closure
        super.dispose();
    }
};
ModalEditorPartImpl = ModalEditorPartImpl_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, IThemeService),
    __param(6, IConfigurationService),
    __param(7, IStorageService),
    __param(8, IWorkbenchLayoutService),
    __param(9, IHostService),
    __param(10, IContextKeyService)
], ModalEditorPartImpl);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kYWxFZGl0b3JQYXJ0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL21vZGFsRWRpdG9yUGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyw2QkFBNkIsQ0FBQztBQUNyQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQWMsYUFBYSxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM1SyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRixPQUFPLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sRUFBZSxJQUFJLEVBQWEsTUFBTSwwQ0FBMEMsQ0FBQztBQUN4RixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDeEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDMUYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3hFLE9BQU8sRUFBc0Isb0JBQW9CLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FB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