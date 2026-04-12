/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Dimension } from '../../../../base/browser/dom.js';
import { isObject } from '../../../../base/common/types.js';
import { BooleanVerifier, EnumVerifier, NumberVerifier, ObjectVerifier, SetVerifier, verifyObject } from '../../../../base/common/verifier.js';
import { coalesce } from '../../../../base/common/arrays.js';
export const DEFAULT_EDITOR_MIN_DIMENSIONS = new Dimension(220, 70);
export const DEFAULT_EDITOR_MAX_DIMENSIONS = new Dimension(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
export const DEFAULT_EDITOR_PART_OPTIONS = {
    showTabs: 'multiple',
    highlightModifiedTabs: false,
    tabActionLocation: 'right',
    tabActionCloseVisibility: true,
    tabActionUnpinVisibility: true,
    showTabIndex: false,
    alwaysShowEditorActions: false,
    tabSizing: 'fit',
    tabSizingFixedMinWidth: 50,
    tabSizingFixedMaxWidth: 160,
    pinnedTabSizing: 'normal',
    pinnedTabsOnSeparateRow: false,
    tabHeight: 'default',
    preventPinnedEditorClose: 'keyboardAndMouse',
    titleScrollbarSizing: 'default',
    titleScrollbarVisibility: 'auto',
    focusRecentEditorAfterClose: true,
    showIcons: true,
    hasIcons: true, // 'vs-seti' is our default icon theme
    enablePreview: true,
    openPositioning: 'right',
    openSideBySideDirection: 'right',
    closeEmptyGroups: true,
    labelFormat: 'default',
    splitSizing: 'auto',
    splitOnDragAndDrop: true,
    allowDropIntoGroup: true,
    dragToOpenWindow: true,
    centeredLayoutFixedWidth: false,
    doubleClickTabToToggleEditorGroupSizes: 'expand',
    editorActionsLocation: 'default',
    wrapTabs: false,
    enablePreviewFromQuickOpen: false,
    scrollToSwitchTabs: false,
    enablePreviewFromCodeNavigation: false,
    closeOnFileDelete: false,
    swipeToNavigate: false,
    mouseBackForwardToNavigate: true,
    restoreViewState: true,
    splitInGroupLayout: 'horizontal',
    revealIfOpen: false,
    // Properties that are Objects have to be defined as getters
    // to ensure no consumer modifies the default values
    get limit() { return { enabled: false, value: 10, perEditorGroup: false, excludeDirty: false }; },
    get decorations() { return { badges: true, colors: true }; },
    get autoLockGroups() { return new Set(); }
};
export function impactsEditorPartOptions(event) {
    return event.affectsConfiguration('workbench.editor') || event.affectsConfiguration('workbench.iconTheme') || event.affectsConfiguration('window.density');
}
export function getEditorPartOptions(configurationService, themeService) {
    const options = {
        ...DEFAULT_EDITOR_PART_OPTIONS,
        hasIcons: themeService.getFileIconTheme().hasFileIcons
    };
    const config = configurationService.getValue();
    if (config?.workbench?.editor) {
        // Assign all primitive configuration over
        Object.assign(options, config.workbench.editor);
        // Special handle array types and convert to Set
        if (isObject(config.workbench.editor.autoLockGroups)) {
            options.autoLockGroups = DEFAULT_EDITOR_PART_OPTIONS.autoLockGroups;
            for (const [editorId, enablement] of Object.entries(config.workbench.editor.autoLockGroups)) {
                if (enablement === true) {
                    options.autoLockGroups.add(editorId);
                }
            }
        }
        else {
            options.autoLockGroups = DEFAULT_EDITOR_PART_OPTIONS.autoLockGroups;
        }
    }
    const windowConfig = configurationService.getValue();
    if (windowConfig?.window?.density?.editorTabHeight) {
        options.tabHeight = windowConfig.window.density.editorTabHeight;
    }
    return validateEditorPartOptions(options);
}
function validateEditorPartOptions(options) {
    // Migrate: Show tabs (config migration kicks in very late and can cause flicker otherwise)
    if (typeof options.showTabs === 'boolean') {
        options.showTabs = options.showTabs ? 'multiple' : 'single';
    }
    return verifyObject({
        'wrapTabs': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['wrapTabs']),
        'scrollToSwitchTabs': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['scrollToSwitchTabs']),
        'highlightModifiedTabs': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['highlightModifiedTabs']),
        'tabActionCloseVisibility': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabActionCloseVisibility']),
        'tabActionUnpinVisibility': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabActionUnpinVisibility']),
        'showTabIndex': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['showTabIndex']),
        'alwaysShowEditorActions': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['alwaysShowEditorActions']),
        'pinnedTabsOnSeparateRow': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['pinnedTabsOnSeparateRow']),
        'focusRecentEditorAfterClose': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['focusRecentEditorAfterClose']),
        'showIcons': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['showIcons']),
        'enablePreview': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['enablePreview']),
        'enablePreviewFromQuickOpen': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['enablePreviewFromQuickOpen']),
        'enablePreviewFromCodeNavigation': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['enablePreviewFromCodeNavigation']),
        'closeOnFileDelete': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['closeOnFileDelete']),
        'closeEmptyGroups': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['closeEmptyGroups']),
        'revealIfOpen': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['revealIfOpen']),
        'swipeToNavigate': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['swipeToNavigate']),
        'mouseBackForwardToNavigate': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['mouseBackForwardToNavigate']),
        'restoreViewState': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['restoreViewState']),
        'splitOnDragAndDrop': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['splitOnDragAndDrop']),
        'allowDropIntoGroup': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['allowDropIntoGroup']),
        'dragToOpenWindow': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['dragToOpenWindow']),
        'centeredLayoutFixedWidth': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['centeredLayoutFixedWidth']),
        'hasIcons': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['hasIcons']),
        'tabSizingFixedMinWidth': new NumberVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabSizingFixedMinWidth']),
        'tabSizingFixedMaxWidth': new NumberVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabSizingFixedMaxWidth']),
        'showTabs': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['showTabs'], ['multiple', 'single', 'none']),
        'tabActionLocation': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabActionLocation'], ['left', 'right']),
        'tabSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabSizing'], ['fit', 'shrink', 'fixed']),
        'pinnedTabSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['pinnedTabSizing'], ['normal', 'compact', 'shrink']),
        'tabHeight': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['tabHeight'], ['default', 'compact']),
        'preventPinnedEditorClose': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['preventPinnedEditorClose'], ['keyboardAndMouse', 'keyboard', 'mouse', 'never']),
        'titleScrollbarSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['titleScrollbarSizing'], ['default', 'large']),
        'titleScrollbarVisibility': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['titleScrollbarVisibility'], ['auto', 'visible', 'hidden']),
        'openPositioning': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['openPositioning'], ['left', 'right', 'first', 'last']),
        'openSideBySideDirection': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['openSideBySideDirection'], ['right', 'down']),
        'labelFormat': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['labelFormat'], ['default', 'short', 'medium', 'long']),
        'splitInGroupLayout': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['splitInGroupLayout'], ['vertical', 'horizontal']),
        'splitSizing': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['splitSizing'], ['distribute', 'split', 'auto']),
        'doubleClickTabToToggleEditorGroupSizes': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['doubleClickTabToToggleEditorGroupSizes'], ['maximize', 'expand', 'off']),
        'editorActionsLocation': new EnumVerifier(DEFAULT_EDITOR_PART_OPTIONS['editorActionsLocation'], ['default', 'titleBar', 'hidden']),
        'autoLockGroups': new SetVerifier(DEFAULT_EDITOR_PART_OPTIONS['autoLockGroups']),
        'limit': new ObjectVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit'], {
            'enabled': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['enabled']),
            'value': new NumberVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['value']),
            'perEditorGroup': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['perEditorGroup']),
            'excludeDirty': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['limit']['excludeDirty'])
        }),
        'decorations': new ObjectVerifier(DEFAULT_EDITOR_PART_OPTIONS['decorations'], {
            'badges': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['decorations']['badges']),
            'colors': new BooleanVerifier(DEFAULT_EDITOR_PART_OPTIONS['decorations']['colors'])
        }),
    }, options);
}
export function fillActiveEditorViewState(group, expectedActiveEditor, presetOptions) {
    if (!expectedActiveEditor || !group.activeEditor || expectedActiveEditor.matches(group.activeEditor)) {
        const options = {
            ...presetOptions,
            viewState: group.activeEditorPane?.getViewState()
        };
        return options;
    }
    return presetOptions || Object.create(null);
}
export function prepareMoveCopyEditors(sourceGroup, editors, preserveFocus) {
    if (editors.length === 0) {
        return [];
    }
    const editorsWithOptions = [];
    let activeEditor;
    const inactiveEditors = [];
    for (const editor of editors) {
        if (!activeEditor && sourceGroup.isActive(editor)) {
            activeEditor = editor;
        }
        else {
            inactiveEditors.push(editor);
        }
    }
    if (!activeEditor) {
        activeEditor = inactiveEditors.shift(); // just take the first editor as active if none is active
    }
    // ensure inactive editors are then sorted by inverse visual order
    // so that we can preserve the order in the target group. we inverse
    // because editors will open to the side of the active editor as
    // inactive editors, and the active editor is always the reference
    inactiveEditors.sort((a, b) => sourceGroup.getIndexOfEditor(b) - sourceGroup.getIndexOfEditor(a));
    const sortedEditors = coalesce([activeEditor, ...inactiveEditors]);
    for (let i = 0; i < sortedEditors.length; i++) {
        const editor = sortedEditors[i];
        editorsWithOptions.push({
            editor,
            options: {
                pinned: true,
                sticky: sourceGroup.isSticky(editor),
                inactive: i > 0,
                preserveFocus
            }
        });
    }
    return editorsWithOptions;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFNNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRzVELE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRy9JLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQU03RCxNQUFNLENBQUMsTUFBTSw2QkFBNkIsR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDcEUsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxTQUFTLENBQUMsTUFBTSxDQUFDLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRS9HLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUF1QjtJQUM5RCxRQUFRLEVBQUUsVUFBVTtJQUNwQixxQkFBcUIsRUFBRSxLQUFLO0lBQzVCLGlCQUFpQixFQUFFLE9BQU87SUFDMUIsd0JBQXdCLEVBQUUsSUFBSTtJQUM5Qix3QkFBd0IsRUFBRSxJQUFJO0lBQzlCLFlBQVksRUFBRSxLQUFLO0lBQ25CLHVCQUF1QixFQUFFLEtBQUs7SUFDOUIsU0FBUyxFQUFFLEtBQUs7SUFDaEIsc0JBQXNCLEVBQUUsRUFBRTtJQUMxQixzQkFBc0IsRUFBRSxHQUFHO0lBQzNCLGVBQWUsRUFBRSxRQUFRO0lBQ3pCLHVCQUF1QixFQUFFLEtBQUs7SUFDOUIsU0FBUyxFQUFFLFNBQVM7SUFD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