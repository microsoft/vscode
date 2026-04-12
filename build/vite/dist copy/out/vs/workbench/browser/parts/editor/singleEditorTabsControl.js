/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/singleeditortabscontrol.css';
import { EditorResourceAccessor, SideBySideEditor, preventEditorClose, EditorCloseMethod } from '../../../common/editor.js';
import { EditorTabsControl } from './editorTabsControl.js';
import { ResourceLabel } from '../../labels.js';
import { TAB_ACTIVE_FOREGROUND, TAB_UNFOCUSED_ACTIVE_FOREGROUND } from '../../../common/theme.js';
import { EventType as TouchEventType, Gesture } from '../../../../base/browser/touch.js';
import { addDisposableListener, EventType, EventHelper, Dimension, isAncestor, DragAndDropObserver, isHTMLElement, $ } from '../../../../base/browser/dom.js';
import { CLOSE_EDITOR_COMMAND_ID, UNLOCK_GROUP_COMMAND_ID } from './editorCommands.js';
import { Color } from '../../../../base/common/color.js';
import { assertReturnsDefined, assertReturnsAllDefined } from '../../../../base/common/types.js';
import { equals } from '../../../../base/common/objects.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { defaultBreadcrumbsWidgetStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { BreadcrumbsControlFactory } from './breadcrumbsControl.js';
export class SingleEditorTabsControl extends EditorTabsControl {
    constructor() {
        super(...arguments);
        this.activeLabel = Object.create(null);
    }
    get breadcrumbsControl() { return this.breadcrumbsControlFactory?.control; }
    create(parent) {
        super.create(parent);
        const titleContainer = this.titleContainer = parent;
        titleContainer.draggable = true;
        // Container listeners
        this.registerContainerListeners(titleContainer);
        // Gesture Support
        this._register(Gesture.addTarget(titleContainer));
        const labelContainer = $('.label-container');
        titleContainer.appendChild(labelContainer);
        // Editor Label
        this.editorLabel = this._register(this.instantiationService.createInstance(ResourceLabel, labelContainer, {})).element;
        this._register(addDisposableListener(this.editorLabel.element, EventType.CLICK, e => this.onTitleLabelClick(e)));
        // Breadcrumbs
        this.breadcrumbsControlFactory = this._register(this.instantiationService.createInstance(BreadcrumbsControlFactory, labelContainer, this.groupView, {
            showFileIcons: false,
            showSymbolIcons: true,
            showDecorationColors: false,
            widgetStyles: { ...defaultBreadcrumbsWidgetStyles, breadcrumbsBackground: Color.transparent.toString() },
            showPlaceholder: false,
            dragEditor: true,
        }));
        this._register(this.breadcrumbsControlFactory.onDidEnablementChange(() => this.handleBreadcrumbsEnablementChange()));
        titleContainer.classList.toggle('breadcrumbs', Boolean(this.breadcrumbsControl));
        this._register(toDisposable(() => titleContainer.classList.remove('breadcrumbs'))); // important to remove because the container is a shared dom node
        // Create editor actions toolbar
        this.createEditorActionsToolBar(titleContainer, ['title-actions']);
        return titleContainer;
    }
    registerContainerListeners(titleContainer) {
        // Drag & Drop support
        let lastDragEvent = undefined;
        let isNewWindowOperation = false;
        this._register(new DragAndDropObserver(titleContainer, {
            onDragStart: e => { isNewWindowOperation = this.onGroupDragStart(e, titleContainer); },
            onDrag: e => { lastDragEvent = e; },
            onDragEnd: e => { this.onGroupDragEnd(e, lastDragEvent, titleContainer, isNewWindowOperation); },
        }));
        // Pin on double click
        this._register(addDisposableListener(titleContainer, EventType.DBLCLICK, e => this.onTitleDoubleClick(e)));
        // Detect mouse click
        this._register(addDisposableListener(titleContainer, EventType.AUXCLICK, e => this.onTitleAuxClick(e)));
        // Detect touch
        this._register(addDisposableListener(titleContainer, TouchEventType.Tap, (e) => this.onTitleTap(e)));
        // Context Menu
        for (const event of [EventType.CONTEXT_MENU, TouchEventType.Contextmenu]) {
            this._register(addDisposableListener(titleContainer, event, e => {
                if (this.tabsModel.activeEditor) {
                    this.onTabContextMenu(this.tabsModel.activeEditor, e, titleContainer);
                }
            }));
        }
    }
    onTitleLabelClick(e) {
        EventHelper.stop(e, false);
        // delayed to let the onTitleClick() come first which can cause a focus change which can close quick access
        setTimeout(() => this.quickInputService.quickAccess.show());
    }
    onTitleDoubleClick(e) {
        EventHelper.stop(e);
        this.groupView.pinEditor();
    }
    onTitleAuxClick(e) {
        if (e.button === 1 /* Middle Button */ && this.tabsModel.activeEditor) {
            EventHelper.stop(e, true /* for https://github.com/microsoft/vscode/issues/56715 */);
            if (!preventEditorClose(this.tabsModel, this.tabsModel.activeEditor, EditorCloseMethod.MOUSE, this.groupsView.partOptions)) {
                this.groupView.closeEditor(this.tabsModel.activeEditor);
            }
        }
    }
    onTitleTap(e) {
        // We only want to open the quick access picker when
        // the tap occurred over the editor label, so we need
        // to check on the target
        // (https://github.com/microsoft/vscode/issues/107543)
        const target = e.initialTarget;
        if (!(isHTMLElement(target)) || !this.editorLabel || !isAncestor(target, this.editorLabel.element)) {
            return;
        }
        // TODO@rebornix gesture tap should open the quick access
        // editorGroupView will focus on the editor again when there
        // are mouse/pointer/touch down events we need to wait a bit as
        // `GesureEvent.Tap` is generated from `touchstart` and then
        // `touchend` events, which are not an atom event.
        setTimeout(() => this.quickInputService.quickAccess.show(), 50);
    }
    openEditor(editor) {
        return this.doHandleOpenEditor();
    }
    openEditors(editors) {
        return this.doHandleOpenEditor();
    }
    doHandleOpenEditor() {
        const activeEditorChanged = this.ifActiveEditorChanged(() => this.redraw());
        if (!activeEditorChanged) {
            this.ifActiveEditorPropertiesChanged(() => this.redraw());
        }
        return activeEditorChanged;
    }
    beforeCloseEditor(editor) {
        // Nothing to do before closing an editor
    }
    closeEditor(editor) {
        this.ifActiveEditorChanged(() => this.redraw());
    }
    closeEditors(editors) {
        this.ifActiveEditorChanged(() => this.redraw());
    }
    moveEditor(editor, fromIndex, targetIndex) {
        this.ifActiveEditorChanged(() => this.redraw());
    }
    pinEditor(editor) {
        this.ifEditorIsActive(editor, () => this.redraw());
    }
    stickEditor(editor) { }
    unstickEditor(editor) { }
    setActive(isActive) {
        this.redraw();
    }
    updateEditorSelections() { }
    updateEditorLabel(editor) {
        this.ifEditorIsActive(editor, () => this.redraw());
    }
    updateEditorDirty(editor) {
        this.ifEditorIsActive(editor, () => {
            const titleContainer = assertReturnsDefined(this.titleContainer);
            // Signal dirty (unless saving)
            if (editor.isDirty() && !editor.isSaving()) {
                titleContainer.classList.add('dirty');
            }
            // Otherwise, clear dirty
            else {
                titleContainer.classList.remove('dirty');
            }
        });
    }
    updateOptions(oldOptions, newOptions) {
        super.updateOptions(oldOptions, newOptions);
        if (oldOptions.labelFormat !== newOptions.labelFormat || !equals(oldOptions.decorations, newOptions.decorations)) {
            this.redraw();
        }
    }
    updateStyles() {
        this.redraw();
    }
    handleBreadcrumbsEnablementChange() {
        const titleContainer = assertReturnsDefined(this.titleContainer);
        titleContainer.classList.toggle('breadcrumbs', Boolean(this.breadcrumbsControl));
        this.redraw();
    }
    ifActiveEditorChanged(fn) {
        if (!this.activeLabel.editor && this.tabsModel.activeEditor || // active editor changed from null => editor
            this.activeLabel.editor && !this.tabsModel.activeEditor || // active editor changed from editor => null
            (!this.activeLabel.editor || !this.tabsModel.isActive(this.activeLabel.editor)) // active editor changed from editorA => editorB
        ) {
            fn();
            return true;
        }
        return false;
    }
    ifActiveEditorPropertiesChanged(fn) {
        if (!this.activeLabel.editor || !this.tabsModel.activeEditor) {
            return; // need an active editor to check for properties changed
        }
        if (this.activeLabel.pinned !== this.tabsModel.isPinned(this.tabsModel.activeEditor)) {
            fn(); // only run if pinned state has changed
        }
    }
    ifEditorIsActive(editor, fn) {
        if (this.tabsModel.isActive(editor)) {
            fn(); // only run if editor is current active
        }
    }
    redraw() {
        const editor = this.tabsModel.activeEditor ?? undefined;
        const options = this.groupsView.partOptions;
        const isEditorPinned = editor ? this.tabsModel.isPinned(editor) : false;
        const isGroupActive = this.groupsView.activeGroup === this.groupView;
        this.activeLabel = { editor, pinned: isEditorPinned };
        // Update Breadcrumbs
        if (this.breadcrumbsControl) {
            if (isGroupActive) {
                this.breadcrumbsControl.update();
                this.breadcrumbsControl.domNode.classList.toggle('preview', !isEditorPinned);
            }
            else {
                this.breadcrumbsControl.hide();
            }
        }
        // Clear if there is no editor
        const [titleContainer, editorLabel] = assertReturnsAllDefined(this.titleContainer, this.editorLabel);
        if (!editor) {
            titleContainer.classList.remove('dirty');
            editorLabel.clear();
            this.clearEditorActionsToolbar();
        }
        // Otherwise render it
        else {
            // Dirty state
            this.updateEditorDirty(editor);
            // Editor Label
            const { labelFormat } = this.groupsView.partOptions;
            let description;
            if (this.breadcrumbsControl && !this.breadcrumbsControl.isHidden()) {
                description = ''; // hide description when showing breadcrumbs
            }
            else if (labelFormat === 'default' && !isGroupActive) {
                description = ''; // hide description when group is not active and style is 'default'
            }
            else {
                description = editor.getDescription(this.getVerbosity(labelFormat)) || '';
            }
            editorLabel.setResource({
                resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }),
                name: editor.getName(),
                description
            }, {
                title: this.getHoverTitle(editor),
                italic: !isEditorPinned,
                extraClasses: ['single-tab', 'title-label'].concat(editor.getLabelExtraClasses()),
                fileDecorations: {
                    colors: Boolean(options.decorations?.colors),
                    badges: Boolean(options.decorations?.badges)
                },
                icon: editor.getIcon(),
                hideIcon: options.showIcons === false,
            });
            if (isGroupActive) {
                titleContainer.style.color = this.getColor(TAB_ACTIVE_FOREGROUND) || '';
            }
            else {
                titleContainer.style.color = this.getColor(TAB_UNFOCUSED_ACTIVE_FOREGROUND) || '';
            }
            // Update Editor Actions Toolbar
            this.updateEditorActionsToolbar();
        }
    }
    getVerbosity(style) {
        switch (style) {
            case 'short': return 0 /* Verbosity.SHORT */;
            case 'long': return 2 /* Verbosity.LONG */;
            default: return 1 /* Verbosity.MEDIUM */;
        }
    }
    prepareEditorActions(editorActions) {
        const isGroupActive = this.groupsView.activeGroup === this.groupView;
        // Active: allow all actions
        if (isGroupActive) {
            return editorActions;
        }
        // Inactive: only show "Close, "Unlock" and secondary actions
        else {
            return {
                primary: this.groupsView.partOptions.alwaysShowEditorActions ? editorActions.primary : editorActions.primary.filter(action => action.id === CLOSE_EDITOR_COMMAND_ID || action.id === UNLOCK_GROUP_COMMAND_ID),
                secondary: editorActions.secondary
            };
        }
    }
    getHeight() {
        return this.tabHeight;
    }
    layout(dimensions) {
        this.breadcrumbsControl?.layout(undefined);
        return new Dimension(dimensions.container.width, this.getHeight());
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2luZ2xlRWRpdG9yVGFic0NvbnRyb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3Ivc2luZ2xlRWRpdG9yVGFic0NvbnRyb2wudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxxQ0FBcUMsQ0FBQztBQUM3QyxPQUFPLEVBQUUsc0JBQXNCLEVBQWlDLGdCQUFnQixFQUFFLGtCQUFrQixFQUFFLGlCQUFpQixFQUFtQixNQUFNLDJCQUEyQixDQUFDO0FBRTVLLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBQzNELE9BQU8sRUFBRSxhQUFhLEVBQWtCLE1BQU0saUJBQWlCLENBQUM7QUFDaEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbEcsT0FBTyxFQUFFLFNBQVMsSUFBSSxjQUFjLEVBQWdCLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsbUJBQW1CLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzlKLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BFLE9B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