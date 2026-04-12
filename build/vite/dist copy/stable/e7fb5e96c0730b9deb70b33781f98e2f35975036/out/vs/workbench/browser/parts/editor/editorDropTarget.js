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
var DropOverlay_1;
import './media/editordroptarget.css';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { $, addDisposableListener, DragAndDropObserver, EventHelper, EventType, getWindow, isAncestor } from '../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../base/browser/formattedTextRenderer.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { isMacintosh, isWeb } from '../../../../base/common/platform.js';
import { assertReturnsAllDefined, assertReturnsDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { activeContrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { isTemporaryWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CodeDataTransfers, containsDragType, Extensions as DragAndDropExtensions, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { DraggedEditorGroupIdentifier, DraggedEditorIdentifier, extractTreeDropData, ResourcesDropHandler } from '../../dnd.js';
import { prepareMoveCopyEditors } from './editor.js';
import { EDITOR_DRAG_AND_DROP_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BACKGROUND, EDITOR_DROP_INTO_PROMPT_BORDER, EDITOR_DROP_INTO_PROMPT_FOREGROUND } from '../../../common/theme.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ITreeViewsDnDService } from '../../../../editor/common/services/treeViewsDndService.js';
import { DraggedTreeItemsIdentifier } from '../../../../editor/common/services/treeViewsDnd.js';
function isDropIntoEditorEnabledGlobally(configurationService) {
    return configurationService.getValue('editor.dropIntoEditor.enabled');
}
function isDragIntoEditorEvent(e) {
    return e.shiftKey;
}
let DropOverlay = class DropOverlay extends Themable {
    static { DropOverlay_1 = this; }
    static { this.OVERLAY_ID = 'monaco-workbench-editor-drop-overlay'; }
    get disposed() { return !!this._disposed; }
    constructor(groupView, themeService, configurationService, instantiationService, editorService, editorGroupService, treeViewsDragAndDropService, contextService) {
        super(themeService);
        this.groupView = groupView;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.editorGroupService = editorGroupService;
        this.treeViewsDragAndDropService = treeViewsDragAndDropService;
        this.contextService = contextService;
        this.editorTransfer = LocalSelectionTransfer.getInstance();
        this.groupTransfer = LocalSelectionTransfer.getInstance();
        this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
        this.cleanupOverlayScheduler = this._register(new RunOnceScheduler(() => this.dispose(), 300));
        this.enableDropIntoEditor = isDropIntoEditorEnabledGlobally(this.configurationService) && this.isDropIntoActiveEditorEnabled();
        this.create();
    }
    create() {
        const overlayOffsetHeight = this.getOverlayOffsetHeight();
        // Container
        const container = this.container = $('div', { id: DropOverlay_1.OVERLAY_ID });
        container.style.top = `${overlayOffsetHeight}px`;
        // Parent
        this.groupView.element.appendChild(container);
        this.groupView.element.classList.add('dragged-over');
        this._register(toDisposable(() => {
            container.remove();
            this.groupView.element.classList.remove('dragged-over');
        }));
        // Overlay
        this.overlay = $('.editor-group-overlay-indicator');
        container.appendChild(this.overlay);
        if (this.enableDropIntoEditor) {
            this.dropIntoPromptElement = renderFormattedText(localize('dropIntoEditorPrompt', "Hold __{0}__ to drop into editor", isMacintosh ? '⇧' : 'Shift'), {});
            this.dropIntoPromptElement.classList.add('editor-group-overlay-drop-into-prompt');
            this.overlay.appendChild(this.dropIntoPromptElement);
        }
        // Overlay Event Handling
        this.registerListeners(container);
        // Styles
        this.updateStyles();
    }
    updateStyles() {
        const overlay = assertReturnsDefined(this.overlay);
        // Overlay drop background
        overlay.style.backgroundColor = this.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND) || '';
        // Overlay contrast border (if any)
        const activeContrastBorderColor = this.getColor(activeContrastBorder);
        overlay.style.outlineColor = activeContrastBorderColor || '';
        overlay.style.outlineOffset = activeContrastBorderColor ? '-2px' : '';
        overlay.style.outlineStyle = activeContrastBorderColor ? 'dashed' : '';
        overlay.style.outlineWidth = activeContrastBorderColor ? '2px' : '';
        if (this.dropIntoPromptElement) {
            this.dropIntoPromptElement.style.backgroundColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BACKGROUND) ?? '';
            this.dropIntoPromptElement.style.color = this.getColor(EDITOR_DROP_INTO_PROMPT_FOREGROUND) ?? '';
            const borderColor = this.getColor(EDITOR_DROP_INTO_PROMPT_BORDER);
            if (borderColor) {
                this.dropIntoPromptElement.style.borderWidth = '1px';
                this.dropIntoPromptElement.style.borderStyle = 'solid';
                this.dropIntoPromptElement.style.borderColor = borderColor;
            }
            else {
                this.dropIntoPromptElement.style.borderWidth = '0';
            }
        }
    }
    registerListeners(container) {
        this._register(new DragAndDropObserver(container, {
            onDragOver: e => {
                if (this.enableDropIntoEditor && isDragIntoEditorEvent(e)) {
                    this.dispose();
                    return;
                }
                const isDraggingGroup = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
                const isDraggingEditor = this.editorTransfer.hasData(DraggedEditorIdentifier.prototype);
                // Update the dropEffect to "copy" if there is no local data to be dragged because
                // in that case we can only copy the data into and not move it from its source
                if (!isDraggingEditor && !isDraggingGroup && e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'copy';
                }
                // Find out if operation is valid
                let isCopy = true;
                if (isDraggingGroup) {
                    isCopy = this.isCopyOperation(e);
                }
                else if (isDraggingEditor) {
                    const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
                    if (Array.isArray(data) && data.length > 0) {
                        isCopy = this.isCopyOperation(e, data[0].identifier);
                    }
                }
                if (!isCopy) {
                    const sourceGroupView = this.findSourceGroupView();
                    if (sourceGroupView === this.groupView) {
                        if (isDraggingGroup || (isDraggingEditor && sourceGroupView.count < 2)) {
                            this.hideOverlay();
                            return; // do not allow to drop group/editor on itself if this results in an empty group
                        }
                    }
                }
                // Position overlay and conditionally enable or disable
                // editor group splitting support based on setting and
                // keymodifiers used.
                let splitOnDragAndDrop = !!this.groupView.groupsView.partOptions.splitOnDragAndDrop;
                if (this.isToggleSplitOperation(e)) {
                    splitOnDragAndDrop = !splitOnDragAndDrop;
                }
                this.positionOverlay(e.offsetX, e.offsetY, isDraggingGroup, splitOnDragAndDrop);
                // Make sure to stop any running cleanup scheduler to remove the overlay
                if (this.cleanupOverlayScheduler.isScheduled()) {
                    this.cleanupOverlayScheduler.cancel();
                }
            },
            onDragLeave: e => this.dispose(),
            onDragEnd: e => this.dispose(),
            onDrop: e => {
                EventHelper.stop(e, true);
                // Dispose overlay
                this.dispose();
                // Handle drop if we have a valid operation
                if (this.currentDropOperation) {
                    this.handleDrop(e, this.currentDropOperation.splitDirection);
                }
            }
        }));
        this._register(addDisposableListener(container, EventType.MOUSE_OVER, () => {
            // Under some circumstances we have seen reports where the drop overlay is not being
            // cleaned up and as such the editor area remains under the overlay so that you cannot
            // type into the editor anymore. This seems related to using VMs and DND via host and
            // guest OS, though some users also saw it without VMs.
            // To protect against this issue we always destroy the overlay as soon as we detect a
            // mouse event over it. The delay is used to guarantee we are not interfering with the
            // actual DROP event that can also trigger a mouse over event.
            if (!this.cleanupOverlayScheduler.isScheduled()) {
                this.cleanupOverlayScheduler.schedule();
            }
        }));
    }
    isDropIntoActiveEditorEnabled() {
        return !!this.groupView.activeEditor?.hasCapability(128 /* EditorInputCapabilities.CanDropIntoEditor */);
    }
    findSourceGroupView() {
        // Check for group transfer
        if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
            const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
            if (Array.isArray(data) && data.length > 0) {
                return this.editorGroupService.getGroup(data[0].identifier);
            }
        }
        // Check for editor transfer
        else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
            const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
            if (Array.isArray(data) && data.length > 0) {
                return this.editorGroupService.getGroup(data[0].identifier.groupId);
            }
        }
        return undefined;
    }
    async handleDrop(event, splitDirection) {
        // Determine target group
        const ensureTargetGroup = () => {
            let targetGroup;
            if (typeof splitDirection === 'number') {
                targetGroup = this.editorGroupService.addGroup(this.groupView, splitDirection);
            }
            else {
                targetGroup = this.groupView;
            }
            return targetGroup;
        };
        // Check for group transfer
        if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
            const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
            if (Array.isArray(data) && data.length > 0) {
                const sourceGroup = this.editorGroupService.getGroup(data[0].identifier);
                if (sourceGroup) {
                    if (typeof splitDirection !== 'number' && sourceGroup === this.groupView) {
                        return;
                    }
                    // Split to new group
                    let targetGroup;
                    if (typeof splitDirection === 'number') {
                        if (this.isCopyOperation(event)) {
                            targetGroup = this.editorGroupService.copyGroup(sourceGroup, this.groupView, splitDirection);
                        }
                        else {
                            targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
                        }
                    }
                    // Merge into existing group
                    else {
                        let mergeGroupOptions = undefined;
                        if (this.isCopyOperation(event)) {
                            mergeGroupOptions = { mode: 0 /* MergeGroupMode.COPY_EDITORS */ };
                        }
                        this.editorGroupService.mergeGroup(sourceGroup, this.groupView, mergeGroupOptions);
                    }
                    if (targetGroup) {
                        this.editorGroupService.activateGroup(targetGroup);
                    }
                }
                this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
            }
        }
        // Check for editor transfer
        else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
            const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
            if (Array.isArray(data) && data.length > 0) {
                const draggedEditors = data;
                const firstDraggedEditor = data[0].identifier;
                const sourceGroup = this.editorGroupService.getGroup(firstDraggedEditor.groupId);
                if (sourceGroup) {
                    const copyEditor = this.isCopyOperation(event, firstDraggedEditor);
                    let targetGroup = undefined;
                    // Optimization: if we move the last editor of an editor group
                    // and we are configured to close empty editor groups, we can
                    // rather move the entire editor group according to the direction
                    if (this.groupView.groupsView.partOptions.closeEmptyGroups && sourceGroup.count === 1 && typeof splitDirection === 'number' && !copyEditor) {
                        targetGroup = this.editorGroupService.moveGroup(sourceGroup, this.groupView, splitDirection);
                    }
                    // In any other case do a normal move/copy operation
                    else {
                        targetGroup = ensureTargetGroup();
                        if (sourceGroup === targetGroup) {
                            return;
                        }
                        const editorsWithOptions = prepareMoveCopyEditors(this.groupView, draggedEditors.map(editor => editor.identifier.editor));
                        if (!copyEditor) {
                            sourceGroup.moveEditors(editorsWithOptions, targetGroup);
                        }
                        else {
                            sourceGroup.copyEditors(editorsWithOptions, targetGroup);
                        }
                    }
                    // Ensure target has focus
                    targetGroup.focus();
                }
                this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
            }
        }
        // Check for tree items
        else if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
            const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
            if (Array.isArray(data) && data.length > 0) {
                const editors = [];
                for (const id of data) {
                    const dataTransferItem = await this.treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
                    if (dataTransferItem) {
                        const treeDropData = await extractTreeDropData(dataTransferItem);
                        editors.push(...treeDropData.map(editor => ({ ...editor, options: { ...editor.options, pinned: true } })));
                    }
                }
                if (editors.length) {
                    this.editorService.openEditors(editors, ensureTargetGroup(), { validateTrust: true });
                }
            }
            this.treeItemsTransfer.clearData(DraggedTreeItemsIdentifier.prototype);
        }
        // Check for URI transfer
        else {
            const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: !isWeb || isTemporaryWorkspace(this.contextService.getWorkspace()) });
            dropHandler.handleDrop(event, getWindow(this.groupView.element), () => ensureTargetGroup(), targetGroup => targetGroup?.focus());
        }
    }
    isCopyOperation(e, draggedEditor) {
        if (draggedEditor?.editor.hasCapability(8 /* EditorInputCapabilities.Singleton */)) {
            return false; // Singleton editors cannot be split
        }
        return (e.ctrlKey && !isMacintosh) || (e.altKey && isMacintosh);
    }
    isToggleSplitOperation(e) {
        return (e.altKey && !isMacintosh) || (e.shiftKey && isMacintosh);
    }
    positionOverlay(mousePosX, mousePosY, isDraggingGroup, enableSplitting) {
        const preferSplitVertically = this.groupView.groupsView.partOptions.openSideBySideDirection === 'right';
        const editorControlWidth = this.groupView.element.clientWidth;
        const editorControlHeight = this.groupView.element.clientHeight - this.getOverlayOffsetHeight();
        let edgeWidthThresholdFactor;
        let edgeHeightThresholdFactor;
        if (enableSplitting) {
            if (isDraggingGroup) {
                edgeWidthThresholdFactor = preferSplitVertically ? 0.3 : 0.1; // give larger threshold when dragging group depending on preferred split direction
            }
            else {
                edgeWidthThresholdFactor = 0.1; // 10% threshold to split if dragging editors
            }
            if (isDraggingGroup) {
                edgeHeightThresholdFactor = preferSplitVertically ? 0.1 : 0.3; // give larger threshold when dragging group depending on preferred split direction
            }
            else {
                edgeHeightThresholdFactor = 0.1; // 10% threshold to split if dragging editors
            }
        }
        else {
            edgeWidthThresholdFactor = 0;
            edgeHeightThresholdFactor = 0;
        }
        const edgeWidthThreshold = editorControlWidth * edgeWidthThresholdFactor;
        const edgeHeightThreshold = editorControlHeight * edgeHeightThresholdFactor;
        const splitWidthThreshold = editorControlWidth / 3; // offer to split left/right at 33%
        const splitHeightThreshold = editorControlHeight / 3; // offer to split up/down at 33%
        // No split if mouse is above certain threshold in the center of the view
        let splitDirection;
        if (mousePosX > edgeWidthThreshold && mousePosX < editorControlWidth - edgeWidthThreshold &&
            mousePosY > edgeHeightThreshold && mousePosY < editorControlHeight - edgeHeightThreshold) {
            splitDirection = undefined;
        }
        // Offer to split otherwise
        else {
            // User prefers to split vertically: offer a larger hitzone
            // for this direction like so:
            // ----------------------------------------------
            // |		|		SPLIT UP		|			|
            // | SPLIT 	|-----------------------|	SPLIT	|
            // |		|		  MERGE			|			|
            // | LEFT	|-----------------------|	RIGHT	|
            // |		|		SPLIT DOWN		|			|
            // ----------------------------------------------
            if (preferSplitVertically) {
                if (mousePosX < splitWidthThreshold) {
                    splitDirection = 2 /* GroupDirection.LEFT */;
                }
                else if (mousePosX > splitWidthThreshold * 2) {
                    splitDirection = 3 /* GroupDirection.RIGHT */;
                }
                else if (mousePosY < editorControlHeight / 2) {
                    splitDirection = 0 /* GroupDirection.UP */;
                }
                else {
                    splitDirection = 1 /* GroupDirection.DOWN */;
                }
            }
            // User prefers to split horizontally: offer a larger hitzone
            // for this direction like so:
            // ----------------------------------------------
            // |				SPLIT UP					|
            // |--------------------------------------------|
            // |  SPLIT LEFT  |	   MERGE	|  SPLIT RIGHT  |
            // |--------------------------------------------|
            // |				SPLIT DOWN					|
            // ----------------------------------------------
            else {
                if (mousePosY < splitHeightThreshold) {
                    splitDirection = 0 /* GroupDirection.UP */;
                }
                else if (mousePosY > splitHeightThreshold * 2) {
                    splitDirection = 1 /* GroupDirection.DOWN */;
                }
                else if (mousePosX < editorControlWidth / 2) {
                    splitDirection = 2 /* GroupDirection.LEFT */;
                }
                else {
                    splitDirection = 3 /* GroupDirection.RIGHT */;
                }
            }
        }
        // Draw overlay based on split direction
        switch (splitDirection) {
            case 0 /* GroupDirection.UP */:
                this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '50%' });
                this.toggleDropIntoPrompt(false);
                break;
            case 1 /* GroupDirection.DOWN */:
                this.doPositionOverlay({ top: '50%', left: '0', width: '100%', height: '50%' });
                this.toggleDropIntoPrompt(false);
                break;
            case 2 /* GroupDirection.LEFT */:
                this.doPositionOverlay({ top: '0', left: '0', width: '50%', height: '100%' });
                this.toggleDropIntoPrompt(false);
                break;
            case 3 /* GroupDirection.RIGHT */:
                this.doPositionOverlay({ top: '0', left: '50%', width: '50%', height: '100%' });
                this.toggleDropIntoPrompt(false);
                break;
            default:
                this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
                this.toggleDropIntoPrompt(true);
        }
        // Make sure the overlay is visible now
        const overlay = assertReturnsDefined(this.overlay);
        overlay.style.opacity = '1';
        // Enable transition after a timeout to prevent initial animation
        setTimeout(() => overlay.classList.add('overlay-move-transition'), 0);
        // Remember as current split direction
        this.currentDropOperation = { splitDirection };
    }
    doPositionOverlay(options) {
        const [container, overlay] = assertReturnsAllDefined(this.container, this.overlay);
        // Container
        const offsetHeight = this.getOverlayOffsetHeight();
        if (offsetHeight) {
            container.style.height = `calc(100% - ${offsetHeight}px)`;
        }
        else {
            container.style.height = '100%';
        }
        // Overlay
        overlay.style.top = options.top;
        overlay.style.left = options.left;
        overlay.style.width = options.width;
        overlay.style.height = options.height;
    }
    getOverlayOffsetHeight() {
        // With tabs and opened editors: use the area below tabs as drop target
        if (!this.groupView.isEmpty && this.groupView.groupsView.partOptions.showTabs === 'multiple') {
            return this.groupView.titleHeight.offset;
        }
        // Without tabs or empty group: use entire editor area as drop target
        return 0;
    }
    hideOverlay() {
        const overlay = assertReturnsDefined(this.overlay);
        // Reset overlay
        this.doPositionOverlay({ top: '0', left: '0', width: '100%', height: '100%' });
        overlay.style.opacity = '0';
        overlay.classList.remove('overlay-move-transition');
        // Reset current operation
        this.currentDropOperation = undefined;
    }
    toggleDropIntoPrompt(showing) {
        if (!this.dropIntoPromptElement) {
            return;
        }
        this.dropIntoPromptElement.style.opacity = showing ? '1' : '0';
    }
    contains(element) {
        return element === this.container || element === this.overlay;
    }
    dispose() {
        super.dispose();
        this._disposed = true;
    }
};
DropOverlay = DropOverlay_1 = __decorate([
    __param(1, IThemeService),
    __param(2, IConfigurationService),
    __param(3, IInstantiationService),
    __param(4, IEditorService),
    __param(5, IEditorGroupsService),
    __param(6, ITreeViewsDnDService),
    __param(7, IWorkspaceContextService)
], DropOverlay);
let EditorDropTarget = class EditorDropTarget extends Themable {
    constructor(groupsView, container, delegate, editorGroupService, themeService, configurationService, instantiationService) {
        super(themeService);
        this.groupsView = groupsView;
        this.container = container;
        this.delegate = delegate;
        this.editorGroupService = editorGroupService;
        this.configurationService = configurationService;
        this.instantiationService = instantiationService;
        this.counter = 0;
        this.editorTransfer = LocalSelectionTransfer.getInstance();
        this.groupTransfer = LocalSelectionTransfer.getInstance();
        this.registerListeners();
    }
    get overlay() {
        if (this._overlay && !this._overlay.disposed) {
            return this._overlay;
        }
        return undefined;
    }
    registerListeners() {
        this._register(addDisposableListener(this.container, EventType.DRAG_ENTER, e => this.onDragEnter(e)));
        this._register(addDisposableListener(this.container, EventType.DRAG_LEAVE, () => this.onDragLeave()));
        for (const target of [this.container, getWindow(this.container)]) {
            this._register(addDisposableListener(target, EventType.DRAG_END, () => this.onDragEnd()));
        }
    }
    onDragEnter(event) {
        if (isDropIntoEditorEnabledGlobally(this.configurationService) && isDragIntoEditorEvent(event)) {
            return;
        }
        this.counter++;
        // Validate transfer
        if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype) &&
            !this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype) &&
            event.dataTransfer) {
            const dndContributions = Registry.as(DragAndDropExtensions.DragAndDropContribution).getAll();
            const dndContributionKeys = Array.from(dndContributions).map(e => e.dataFormatKey);
            if (!containsDragType(event, DataTransfers.FILES, CodeDataTransfers.FILES, DataTransfers.RESOURCES, CodeDataTransfers.EDITORS, ...dndContributionKeys)) { // see https://github.com/microsoft/vscode/issues/25789
                event.dataTransfer.dropEffect = 'none';
                return; // unsupported transfer
            }
        }
        // Check if dropping into group is allowed
        if (!this.groupsView.partOptions.allowDropIntoGroup) {
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'none';
            }
            return;
        }
        // Signal DND start
        this.updateContainer(true);
        const target = event.target;
        if (target) {
            // Somehow we managed to move the mouse quickly out of the current overlay, so destroy it
            if (this.overlay && !this.overlay.contains(target)) {
                this.disposeOverlay();
            }
            // Create overlay over target
            if (!this.overlay) {
                const targetGroupView = this.findTargetGroupView(target);
                if (targetGroupView) {
                    this._overlay = this.instantiationService.createInstance(DropOverlay, targetGroupView);
                }
            }
        }
    }
    onDragLeave() {
        this.counter--;
        if (this.counter === 0) {
            this.updateContainer(false);
        }
    }
    onDragEnd() {
        this.counter = 0;
        this.updateContainer(false);
        this.disposeOverlay();
    }
    findTargetGroupView(child) {
        const groups = this.editorGroupService.groups;
        return groups.find(groupView => isAncestor(child, groupView.element) || this.delegate.containsGroup?.(groupView));
    }
    updateContainer(isDraggedOver) {
        this.container.classList.toggle('dragged-over', isDraggedOver);
    }
    dispose() {
        super.dispose();
        this.disposeOverlay();
    }
    disposeOverlay() {
        if (this.overlay) {
            this.overlay.dispose();
            this._overlay = undefined;
        }
    }
};
EditorDropTarget = __decorate([
    __param(3, IEditorGroupsService),
    __param(4, IThemeService),
    __param(5, IConfigurationService),
    __param(6, IInstantiationService)
], EditorDropTarget);
export { EditorDropTarget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yRHJvcFRhcmdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JEcm9wVGFyZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDhCQUE4QixDQUFDO0FBQ3RDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLFdBQVcsRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxRQUFRLEVBQUUsTUFBTSxtREFBbUQsQ0FB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