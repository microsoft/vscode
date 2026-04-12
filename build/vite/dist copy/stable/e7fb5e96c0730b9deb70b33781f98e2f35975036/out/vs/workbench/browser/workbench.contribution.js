/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isStandalone } from '../../base/browser/browser.js';
import { isLinux, isMacintosh, isNative, isWeb, isWindows } from '../../base/common/platform.js';
import { localize } from '../../nls.js';
import { Extensions as ConfigurationExtensions } from '../../platform/configuration/common/configurationRegistry.js';
import product from '../../platform/product/common/product.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { ConfigurationMigrationWorkbenchContribution, DynamicWindowConfiguration, DynamicWorkbenchSecurityConfiguration, Extensions, problemsConfigurationNodeBase, windowConfigurationNodeBase, workbenchConfigurationNodeBase } from '../common/configuration.js';
import { registerWorkbenchContribution2 } from '../common/contributions.js';
import { CustomEditorLabelService } from '../services/editor/common/customEditorLabelService.js';
import { defaultWindowTitle, defaultWindowTitleSeparator } from './parts/titlebar/windowTitle.js';
const registry = Registry.as(ConfigurationExtensions.Configuration);
// Configuration
(function registerConfiguration() {
    // Migration support
    registerWorkbenchContribution2(ConfigurationMigrationWorkbenchContribution.ID, ConfigurationMigrationWorkbenchContribution, 4 /* WorkbenchPhase.Eventually */);
    // Dynamic Configuration
    registerWorkbenchContribution2(DynamicWorkbenchSecurityConfiguration.ID, DynamicWorkbenchSecurityConfiguration, 3 /* WorkbenchPhase.AfterRestored */);
    // Workbench
    registry.registerConfiguration({
        ...workbenchConfigurationNodeBase,
        'properties': {
            'workbench.externalBrowser': {
                type: 'string',
                markdownDescription: localize('browser', "Configure the browser to use for opening http or https links externally. This can either be the name of the browser (`edge`, `chrome`, `firefox`) or an absolute path to the browser's executable. Will use the system default if not set."),
                included: isNative,
                restricted: true
            },
            'workbench.editor.titleScrollbarSizing': {
                type: 'string',
                enum: ['default', 'large'],
                enumDescriptions: [
                    localize('workbench.editor.titleScrollbarSizing.default', "The default size."),
                    localize('workbench.editor.titleScrollbarSizing.large', "Increases the size, so it can be grabbed more easily with the mouse.")
                ],
                description: localize('tabScrollbarHeight', "Controls the height of the scrollbars used for tabs and breadcrumbs in the editor title area."),
                default: 'default',
            },
            'workbench.editor.titleScrollbarVisibility': {
                type: 'string',
                enum: ['auto', 'visible', 'hidden'],
                enumDescriptions: [
                    localize('workbench.editor.titleScrollbarVisibility.auto', "The horizontal scrollbar will be visible only when necessary."),
                    localize('workbench.editor.titleScrollbarVisibility.visible', "The horizontal scrollbar will always be visible."),
                    localize('workbench.editor.titleScrollbarVisibility.hidden', "The horizontal scrollbar will always be hidden.")
                ],
                description: localize('titleScrollbarVisibility', "Controls the visibility of the scrollbars used for tabs and breadcrumbs in the editor title area."),
                default: 'auto',
            },
            ["workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */]: {
                'type': 'string',
                'enum': ["multiple" /* EditorTabsMode.MULTIPLE */, "single" /* EditorTabsMode.SINGLE */, "none" /* EditorTabsMode.NONE */],
                'enumDescriptions': [
                    localize('workbench.editor.showTabs.multiple', "Each editor is displayed as a tab in the editor title area."),
                    localize('workbench.editor.showTabs.single', "The active editor is displayed as a single large tab in the editor title area."),
                    localize('workbench.editor.showTabs.none', "The editor title area is not displayed."),
                ],
                'description': localize('showEditorTabs', "Controls whether opened editors should show as individual tabs, one single large tab or if the title area should not be shown."),
                'default': 'multiple'
            },
            ["workbench.editor.editorActionsLocation" /* LayoutSettings.EDITOR_ACTIONS_LOCATION */]: {
                'type': 'string',
                'enum': ["default" /* EditorActionsLocation.DEFAULT */, "titleBar" /* EditorActionsLocation.TITLEBAR */, "hidden" /* EditorActionsLocation.HIDDEN */],
                'markdownEnumDescriptions': [
                    localize({ comment: ['{0} will be a setting name rendered as a link'], key: 'workbench.editor.editorActionsLocation.default' }, "Show editor actions in the window title bar when {0} is set to {1}. Otherwise, editor actions are shown in the editor tab bar.", '`#workbench.editor.showTabs#`', '`none`'),
                    localize({ comment: ['{0} will be a setting name rendered as a link'], key: 'workbench.editor.editorActionsLocation.titleBar' }, "Show editor actions in the window title bar. If {0} is set to {1}, editor actions are hidden.", '`#window.customTitleBarVisibility#`', '`never`'),
                    localize('workbench.editor.editorActionsLocation.hidden', "Editor actions are not shown."),
                ],
                'markdownDescription': localize('editorActionsLocation', "Controls where the editor actions are shown."),
                'default': 'default'
            },
            'workbench.editor.alwaysShowEditorActions': {
                'type': 'boolean',
                'markdownDescription': localize('alwaysShowEditorActions', "Controls whether to always show the editor actions, even when the editor group is not active."),
                'default': false
            },
            'workbench.editor.wrapTabs': {
                'type': 'boolean',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'wrapTabs' }, "Controls whether tabs should be wrapped over multiple lines when exceeding available space or whether a scrollbar should appear instead. This value is ignored when {0} is not set to '{1}'.", '`#workbench.editor.showTabs#`', '`multiple`'),
                'default': false
            },
            'workbench.editor.scrollToSwitchTabs': {
                'type': 'boolean',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'scrollToSwitchTabs' }, "Controls whether scrolling over tabs will open them or not. By default tabs will only reveal upon scrolling, but not open. You can press and hold the Shift-key while scrolling to change this behavior for that duration. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`'),
                'default': false
            },
            'workbench.editor.highlightModifiedTabs': {
                'type': 'boolean',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'highlightModifiedTabs' }, "Controls whether a top border is drawn on tabs for editors that have unsaved changes. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', `multiple`),
                'default': false
            },
            'workbench.editor.decorations.badges': {
                'type': 'boolean',
                'markdownDescription': localize('decorations.badges', "Controls whether editor file decorations should use badges."),
                'default': true
            },
            'workbench.editor.decorations.colors': {
                'type': 'boolean',
                'markdownDescription': localize('decorations.colors', "Controls whether editor file decorations should use colors."),
                'default': true
            },
            [CustomEditorLabelService.SETTING_ID_ENABLED]: {
                'type': 'boolean',
                'markdownDescription': localize('workbench.editor.label.enabled', "Controls whether the custom workbench editor labels should be applied."),
                'default': true,
            },
            [CustomEditorLabelService.SETTING_ID_PATTERNS]: {
                'type': 'object',
                'markdownDescription': (() => {
                    let customEditorLabelDescription = localize('workbench.editor.label.patterns', "Controls the rendering of the editor label. Each __Item__ is a pattern that matches a file path. Both relative and absolute file paths are supported. The relative path must include the WORKSPACE_FOLDER (e.g `WORKSPACE_FOLDER/src/**.tsx` or `*/src/**.tsx`). Absolute patterns must start with a `/`. In case multiple patterns match, the longest matching path will be picked. Each __Value__ is the template for the rendered editor when the __Item__ matches. Variables are substituted based on the context:");
                    customEditorLabelDescription += '\n- ' + [
                        localize('workbench.editor.label.dirname', "`${dirname}`: name of the folder in which the file is located (e.g. `WORKSPACE_FOLDER/folder/file.txt -> folder`)."),
                        localize('workbench.editor.label.nthdirname', "`${dirname(N)}`: name of the nth parent folder in which the file is located (e.g. `N=2: WORKSPACE_FOLDER/static/folder/file.txt -> WORKSPACE_FOLDER`). Folders can be picked from the start of the path by using negative numbers (e.g. `N=-1: WORKSPACE_FOLDER/folder/file.txt -> WORKSPACE_FOLDER`). If the __Item__ is an absolute pattern path, the first folder (`N=-1`) refers to the first folder in the absolute path, otherwise it corresponds to the workspace folder."),
                        localize('workbench.editor.label.filename', "`${filename}`: name of the file without the file extension (e.g. `WORKSPACE_FOLDER/folder/file.txt -> file`)."),
                        localize('workbench.editor.label.extname', "`${extname}`: the file extension (e.g. `WORKSPACE_FOLDER/folder/file.txt -> txt`)."),
                        localize('workbench.editor.label.nthextname', "`${extname(N)}`: the nth extension of the file separated by '.' (e.g. `N=2: WORKSPACE_FOLDER/folder/file.ext1.ext2.ext3 -> ext1`). Extension can be picked from the start of the extension by using negative numbers (e.g. `N=-1: WORKSPACE_FOLDER/folder/file.ext1.ext2.ext3 -> ext2`)."),
                    ].join('\n- '); // intentionally concatenated to not produce a string that is too long for translations
                    customEditorLabelDescription += '\n\n' + localize('customEditorLabelDescriptionExample', "Example: `\"**/static/**/*.html\": \"${filename} - ${dirname} (${extname})\"` will render a file `WORKSPACE_FOLDER/static/folder/file.html` as `file - folder (html)`.");
                    return customEditorLabelDescription;
                })(),
                additionalProperties: {
                    type: ['string', 'null'],
                    markdownDescription: localize('workbench.editor.label.template', "The template which should be rendered when the pattern matches. May include the variables ${dirname}, ${filename} and ${extname}."),
                    minLength: 1,
                    pattern: '.*[a-zA-Z0-9].*'
                },
                'default': {}
            },
            'workbench.editor.labelFormat': {
                'type': 'string',
                'enum': ['default', 'short', 'medium', 'long'],
                'enumDescriptions': [
                    localize('workbench.editor.labelFormat.default', "Show the name of the file. When tabs are enabled and two files have the same name in one group the distinguishing sections of each file's path are added. When tabs are disabled, the path relative to the workspace folder is shown if the editor is active."),
                    localize('workbench.editor.labelFormat.short', "Show the name of the file followed by its directory name."),
                    localize('workbench.editor.labelFormat.medium', "Show the name of the file followed by its path relative to the workspace folder."),
                    localize('workbench.editor.labelFormat.long', "Show the name of the file followed by its absolute path.")
                ],
                'default': 'default',
                'description': localize('tabDescription', "Controls the format of the label for an editor."),
            },
            'workbench.editor.untitled.labelFormat': {
                'type': 'string',
                'enum': ['content', 'name'],
                'enumDescriptions': [
                    localize('workbench.editor.untitled.labelFormat.content', "The name of the untitled file is derived from the contents of its first line unless it has an associated file path. It will fallback to the name in case the line is empty or contains no word characters."),
                    localize('workbench.editor.untitled.labelFormat.name', "The name of the untitled file is not derived from the contents of the file."),
                ],
                'default': 'content',
                'description': localize('untitledLabelFormat', "Controls the format of the label for an untitled editor."),
            },
            'workbench.editor.empty.hint': {
                'type': 'string',
                'enum': ['text', 'hidden'],
                'default': 'text',
                'markdownDescription': localize("workbench.editor.empty.hint", "Controls if the empty editor text hint should be visible in the editor.")
            },
            'workbench.editor.languageDetection': {
                type: 'boolean',
                default: true,
                description: localize('workbench.editor.languageDetection', "Controls whether the language in a text editor is automatically detected unless the language has been explicitly set by the language picker. This can also be scoped by language so you can specify which languages you do not want to be switched off of. This is useful for languages like Markdown that often contain other languages that might trick language detection into thinking it's the embedded language and not Markdown."),
                scope: 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */
            },
            'workbench.editor.historyBasedLanguageDetection': {
                type: 'boolean',
                default: true,
                description: localize('workbench.editor.historyBasedLanguageDetection', "Enables use of editor history in language detection. This causes automatic language detection to favor languages that have been recently opened and allows for automatic language detection to operate with smaller inputs."),
            },
            'workbench.editor.preferHistoryBasedLanguageDetection': {
                type: 'boolean',
                default: false,
                description: localize('workbench.editor.preferBasedLanguageDetection', "When enabled, a language detection model that takes into account editor history will be given higher precedence."),
            },
            'workbench.editor.languageDetectionHints': {
                type: 'object',
                default: { 'untitledEditors': true, 'notebookEditors': true },
                description: localize('workbench.editor.showLanguageDetectionHints', "When enabled, shows a status bar Quick Fix when the editor language doesn't match detected content language."),
                additionalProperties: false,
                properties: {
                    untitledEditors: {
                        type: 'boolean',
                        description: localize('workbench.editor.showLanguageDetectionHints.editors', "Show in untitled text editors"),
                    },
                    notebookEditors: {
                        type: 'boolean',
                        description: localize('workbench.editor.showLanguageDetectionHints.notebook', "Show in notebook editors"),
                    }
                }
            },
            'workbench.editor.tabActionLocation': {
                type: 'string',
                enum: ['left', 'right'],
                default: 'right',
                markdownDescription: localize({ comment: ['{0} will be a setting name rendered as a link'], key: 'tabActionLocation' }, "Controls the position of the editor's tabs action buttons (close, unpin). This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`')
            },
            'workbench.editor.tabActionCloseVisibility': {
                type: 'boolean',
                default: true,
                description: localize('workbench.editor.tabActionCloseVisibility', "Controls the visibility of the tab close action button.")
            },
            'workbench.editor.tabActionUnpinVisibility': {
                type: 'boolean',
                default: true,
                description: localize('workbench.editor.tabActionUnpinVisibility', "Controls the visibility of the tab unpin action button.")
            },
            'workbench.editor.showTabIndex': {
                'type': 'boolean',
                'default': false,
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'showTabIndex' }, "When enabled, will show the tab index. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`')
            },
            'workbench.editor.tabSizing': {
                'type': 'string',
                'enum': ['fit', 'shrink', 'fixed'],
                'default': 'fit',
                'enumDescriptions': [
                    localize('workbench.editor.tabSizing.fit', "Always keep tabs large enough to show the full editor label."),
                    localize('workbench.editor.tabSizing.shrink', "Allow tabs to get smaller when the available space is not enough to show all tabs at once."),
                    localize('workbench.editor.tabSizing.fixed', "Make all tabs the same size, while allowing them to get smaller when the available space is not enough to show all tabs at once.")
                ],
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'tabSizing' }, "Controls the size of editor tabs. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`')
            },
            'workbench.editor.tabSizingFixedMinWidth': {
                'type': 'number',
                'default': 50,
                'minimum': 38,
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'workbench.editor.tabSizingFixedMinWidth' }, "Controls the minimum width of tabs when {0} size is set to {1}.", '`#workbench.editor.tabSizing#`', '`fixed`')
            },
            'workbench.editor.tabSizingFixedMaxWidth': {
                'type': 'number',
                'default': 160,
                'minimum': 38,
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'workbench.editor.tabSizingFixedMaxWidth' }, "Controls the maximum width of tabs when {0} size is set to {1}.", '`#workbench.editor.tabSizing#`', '`fixed`')
            },
            'window.density.editorTabHeight': {
                'type': 'string',
                'enum': ['default', 'compact'],
                'default': 'default',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'workbench.editor.tabHeight' }, "Controls the height of editor tabs. Also applies to the title control bar when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`')
            },
            'workbench.editor.pinnedTabSizing': {
                'type': 'string',
                'enum': ['normal', 'compact', 'shrink'],
                'default': 'normal',
                'enumDescriptions': [
                    localize('workbench.editor.pinnedTabSizing.normal', "A pinned tab inherits the look of non pinned tabs."),
                    localize('workbench.editor.pinnedTabSizing.compact', "A pinned tab will show in a compact form with only icon or first letter of the editor name."),
                    localize('workbench.editor.pinnedTabSizing.shrink', "A pinned tab shrinks to a compact fixed size showing parts of the editor name.")
                ],
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'pinnedTabSizing' }, "Controls the size of pinned editor tabs. Pinned tabs are sorted to the beginning of all opened tabs and typically do not close until unpinned. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`')
            },
            'workbench.editor.pinnedTabsOnSeparateRow': {
                'type': 'boolean',
                'default': false,
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'workbench.editor.pinnedTabsOnSeparateRow' }, "When enabled, displays pinned tabs in a separate row above all other tabs. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`'),
            },
            'workbench.editor.preventPinnedEditorClose': {
                'type': 'string',
                'enum': ['keyboardAndMouse', 'keyboard', 'mouse', 'never'],
                'default': 'keyboardAndMouse',
                'enumDescriptions': [
                    localize('workbench.editor.preventPinnedEditorClose.always', "Always prevent closing the pinned editor when using mouse middle click or keyboard."),
                    localize('workbench.editor.preventPinnedEditorClose.onlyKeyboard', "Prevent closing the pinned editor when using the keyboard."),
                    localize('workbench.editor.preventPinnedEditorClose.onlyMouse', "Prevent closing the pinned editor when using mouse middle click."),
                    localize('workbench.editor.preventPinnedEditorClose.never', "Never prevent closing a pinned editor.")
                ],
                description: localize('workbench.editor.preventPinnedEditorClose', "Controls whether pinned editors should close when keyboard or middle mouse click is used for closing."),
            },
            'workbench.editor.splitSizing': {
                'type': 'string',
                'enum': ['auto', 'distribute', 'split'],
                'default': 'auto',
                'enumDescriptions': [
                    localize('workbench.editor.splitSizingAuto', "Splits the active editor group to equal parts, unless all editor groups are already in equal parts. In that case, splits all the editor groups to equal parts."),
                    localize('workbench.editor.splitSizingDistribute', "Splits all the editor groups to equal parts."),
                    localize('workbench.editor.splitSizingSplit', "Splits the active editor group to equal parts.")
                ],
                'description': localize('splitSizing', "Controls the size of editor groups when splitting them.")
            },
            'workbench.editor.splitOnDragAndDrop': {
                'type': 'boolean',
                'default': true,
                'description': localize('splitOnDragAndDrop', "Controls if editor groups can be split from drag and drop operations by dropping an editor or file on the edges of the editor area.")
            },
            'workbench.editor.dragToOpenWindow': {
                'type': 'boolean',
                'default': true,
                'markdownDescription': localize('dragToOpenWindow', "Controls if editors can be dragged out of the window to open them in a new window. Press and hold the `Alt` key while dragging to toggle this dynamically.")
            },
            'workbench.editor.focusRecentEditorAfterClose': {
                'type': 'boolean',
                'description': localize('focusRecentEditorAfterClose', "Controls whether editors are closed in most recently used order or from left to right."),
                'default': true
            },
            'workbench.editor.showIcons': {
                'type': 'boolean',
                'description': localize('showIcons', "Controls whether opened editors should show with an icon or not. This requires a file icon theme to be enabled as well."),
                'default': true
            },
            'workbench.editor.enablePreview': {
                'type': 'boolean',
                'description': localize('enablePreview', "Controls whether preview mode is used when editors open. There is a maximum of one preview mode editor per editor group. This editor displays its filename in italics on its tab or title label and in the Open Editors view. Its contents will be replaced by the next editor opened in preview mode. Making a change in a preview mode editor will persist it, as will a double-click on its label, or the 'Keep Open' option in its label context menu. Opening a file from Explorer with a double-click persists its editor immediately."),
                'default': true
            },
            'workbench.editor.enablePreviewFromQuickOpen': {
                'type': 'boolean',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'enablePreviewFromQuickOpen' }, "Controls whether editors opened from Quick Open show as preview editors. Preview editors do not stay open, and are reused until explicitly set to be kept open (via double-click or editing). When enabled, hold Ctrl before selection to open an editor as a non-preview. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`'),
                'default': false
            },
            'workbench.editor.enablePreviewFromCodeNavigation': {
                'type': 'boolean',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'enablePreviewFromCodeNavigation' }, "Controls whether editors remain in preview when a code navigation is started from them. Preview editors do not stay open, and are reused until explicitly set to be kept open (via double-click or editing). This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`'),
                'default': false
            },
            'workbench.editor.closeOnFileDelete': {
                'type': 'boolean',
                'description': localize('closeOnFileDelete', "Controls whether editors showing a file that was opened during the session should close automatically when getting deleted or renamed by some other process. Disabling this will keep the editor open  on such an event. Note that deleting from within the application will always close the editor and that editors with unsaved changes will never close to preserve your data."),
                'default': false
            },
            'workbench.editor.openPositioning': {
                'type': 'string',
                'enum': ['left', 'right', 'first', 'last'],
                'default': 'right',
                'markdownDescription': localize({ comment: ['{0}, {1}, {2}, {3} will be a setting name rendered as a link'], key: 'editorOpenPositioning' }, "Controls where editors open. Select {0} or {1} to open editors to the left or right of the currently active one. Select {2} or {3} to open editors independently from the currently active one.", '`left`', '`right`', '`first`', '`last`')
            },
            'workbench.editor.openSideBySideDirection': {
                'type': 'string',
                'enum': ['right', 'down'],
                'default': 'right',
                'markdownDescription': localize('sideBySideDirection', "Controls the default direction of editors that are opened side by side (for example, from the Explorer). By default, editors will open on the right hand side of the currently active one. If changed to `down`, the editors will open below the currently active one. This also impacts the split editor action in the editor toolbar.")
            },
            'workbench.editor.closeEmptyGroups': {
                'type': 'boolean',
                'description': localize('closeEmptyGroups', "Controls the behavior of empty editor groups when the last tab in the group is closed. When enabled, empty groups will automatically close. When disabled, empty groups will remain part of the grid."),
                'default': true
            },
            'workbench.editor.revealIfOpen': {
                'type': 'boolean',
                'description': localize('revealIfOpen', "Controls whether an editor is revealed in any of the visible groups if opened. If disabled, an editor will prefer to open in the currently active editor group. If enabled, an already opened editor will be revealed instead of opened again in the currently active editor group. Note that there are some cases where this setting is ignored, such as when forcing an editor to open in a specific group or to the side of the currently active group."),
                'default': false
            },
            'workbench.editor.useModal': {
                'type': 'string',
                'enum': ['off', 'some', 'all'],
                'enumDescriptions': [
                    localize('useModal.off', "Editors never open in a modal overlay."),
                    localize('useModal.some', "Certain editors such as Settings and Keyboard Shortcuts may open in a centered modal overlay."),
                    localize('useModal.all', "All editors open in a centered modal overlay."),
                ],
                'description': localize('useModal', "Controls whether editors open in a modal overlay."),
                'default': 'some'
            },
            'workbench.editor.swipeToNavigate': {
                'type': 'boolean',
                'description': localize('swipeToNavigate', "Navigate between open files using three-finger swipe horizontally. Note that System Preferences > Trackpad > More Gestures > 'Swipe between pages' must be set to 'Swipe with two or three fingers'."),
                'default': false,
                'included': isMacintosh && !isWeb
            },
            'workbench.editor.mouseBackForwardToNavigate': {
                'type': 'boolean',
                'description': localize('mouseBackForwardToNavigate', "Enables the use of mouse buttons four and five for commands 'Go Back' and 'Go Forward'."),
                'default': true
            },
            'workbench.editor.navigationScope': {
                'type': 'string',
                'enum': ['default', 'editorGroup', 'editor'],
                'default': 'default',
                'markdownDescription': localize('navigationScope', "Controls the scope of history navigation in editors for commands such as 'Go Back' and 'Go Forward'."),
                'enumDescriptions': [
                    localize('workbench.editor.navigationScopeDefault', "Navigate across all opened editors and editor groups."),
                    localize('workbench.editor.navigationScopeEditorGroup', "Navigate only in editors of the active editor group."),
                    localize('workbench.editor.navigationScopeEditor', "Navigate only in the active editor.")
                ],
            },
            'workbench.editor.restoreViewState': {
                'type': 'boolean',
                'markdownDescription': localize('restoreViewState', "Restores the last editor view state (such as scroll position) when re-opening editors after they have been closed. Editor view state is stored per editor group and discarded when a group closes. Use the {0} setting to use the last known view state across all editor groups in case no previous view state was found for a editor group.", '`#workbench.editor.sharedViewState#`'),
                'default': true,
                'scope': 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */
            },
            'workbench.editor.sharedViewState': {
                'type': 'boolean',
                'description': localize('sharedViewState', "Preserves the most recent editor view state (such as scroll position) across all editor groups and restores that if no specific editor view state is found for the editor group."),
                'default': false
            },
            'workbench.editor.restoreEditors': {
                'type': 'boolean',
                'description': localize('restoreOnStartup', "Controls whether editors are restored on startup. When disabled, only dirty editors will be restored from the previous session."),
                'default': true
            },
            'workbench.editor.splitInGroupLayout': {
                'type': 'string',
                'enum': ['vertical', 'horizontal'],
                'default': 'horizontal',
                'markdownDescription': localize('splitInGroupLayout', "Controls the layout for when an editor is split in an editor group to be either vertical or horizontal."),
                'enumDescriptions': [
                    localize('workbench.editor.splitInGroupLayoutVertical', "Editors are positioned from top to bottom."),
                    localize('workbench.editor.splitInGroupLayoutHorizontal', "Editors are positioned from left to right.")
                ]
            },
            'workbench.editor.centeredLayoutAutoResize': {
                'type': 'boolean',
                'default': true,
                'description': localize('centeredLayoutAutoResize', "Controls if the centered layout should automatically resize to maximum width when more than one group is open. Once only one group is open it will resize back to the original centered width.")
            },
            'workbench.editor.centeredLayoutFixedWidth': {
                'type': 'boolean',
                'default': false,
                'description': localize('centeredLayoutDynamicWidth', "Controls whether the centered layout tries to maintain constant width when the window is resized.")
            },
            'workbench.editor.doubleClickTabToToggleEditorGroupSizes': {
                'type': 'string',
                'enum': ['maximize', 'expand', 'off'],
                'default': 'expand',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'doubleClickTabToToggleEditorGroupSizes' }, "Controls how the editor group is resized when double clicking on a tab. This value is ignored when {0} is not set to {1}.", '`#workbench.editor.showTabs#`', '`multiple`'),
                'enumDescriptions': [
                    localize('workbench.editor.doubleClickTabToToggleEditorGroupSizes.maximize', "All other editor groups are hidden and the current editor group is maximized to take up the entire editor area."),
                    localize('workbench.editor.doubleClickTabToToggleEditorGroupSizes.expand', "The editor group takes as much space as possible by making all other editor groups as small as possible."),
                    localize('workbench.editor.doubleClickTabToToggleEditorGroupSizes.off', "No editor group is resized when double clicking on a tab.")
                ]
            },
            'workbench.editor.limit.enabled': {
                'type': 'boolean',
                'default': false,
                'description': localize('limitEditorsEnablement', "Controls if the number of opened editors should be limited or not. When enabled, less recently used editors will close to make space for newly opening editors.")
            },
            'workbench.editor.limit.value': {
                'type': 'number',
                'default': 10,
                'exclusiveMinimum': 0,
                'markdownDescription': localize('limitEditorsMaximum', "Controls the maximum number of opened editors. Use the {0} setting to control this limit per editor group or across all groups.", '`#workbench.editor.limit.perEditorGroup#`')
            },
            'workbench.editor.limit.excludeDirty': {
                'type': 'boolean',
                'default': false,
                'description': localize('limitEditorsExcludeDirty', "Controls if the maximum number of opened editors should exclude dirty editors for counting towards the configured limit.")
            },
            'workbench.editor.limit.perEditorGroup': {
                'type': 'boolean',
                'default': false,
                'description': localize('perEditorGroup', "Controls if the limit of maximum opened editors should apply per editor group or across all editor groups.")
            },
            'workbench.localHistory.enabled': {
                'type': 'boolean',
                'default': true,
                'description': localize('localHistoryEnabled', "Controls whether local file history is enabled. When enabled, the file contents of an editor that is saved will be stored to a backup location to be able to restore or review the contents later. Changing this setting has no effect on existing local file history entries."),
                'scope': 5 /* ConfigurationScope.RESOURCE */
            },
            'workbench.localHistory.maxFileSize': {
                'type': 'number',
                'default': 256,
                'minimum': 1,
                'description': localize('localHistoryMaxFileSize', "Controls the maximum size of a file (in KB) to be considered for local file history. Files that are larger will not be added to the local file history. Changing this setting has no effect on existing local file history entries."),
                'scope': 5 /* ConfigurationScope.RESOURCE */
            },
            'workbench.localHistory.maxFileEntries': {
                'type': 'number',
                'default': 50,
                'minimum': 0,
                'description': localize('localHistoryMaxFileEntries', "Controls the maximum number of local file history entries per file. When the number of local file history entries exceeds this number for a file, the oldest entries will be discarded."),
                'scope': 5 /* ConfigurationScope.RESOURCE */
            },
            'workbench.localHistory.exclude': {
                'type': 'object',
                'patternProperties': {
                    '.*': { 'type': 'boolean' }
                },
                'markdownDescription': localize('exclude', "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) for excluding files from the local file history. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths. Changing this setting has no effect on existing local file history entries."),
                'scope': 5 /* ConfigurationScope.RESOURCE */
            },
            'workbench.localHistory.mergeWindow': {
                'type': 'number',
                'default': 10,
                'minimum': 1,
                'markdownDescription': localize('mergeWindow', "Configure an interval in seconds during which the last entry in local file history is replaced with the entry that is being added. This helps reduce the overall number of entries that are added, for example when auto save is enabled. This setting is only applied to entries that have the same source of origin. Changing this setting has no effect on existing local file history entries."),
                'scope': 5 /* ConfigurationScope.RESOURCE */
            },
            'workbench.commandPalette.history': {
                'type': 'number',
                'description': localize('commandHistory', "Controls the number of recently used commands to keep in history for the command palette. Set to 0 to disable command history."),
                'default': 50,
                'minimum': 0
            },
            'workbench.commandPalette.preserveInput': {
                'type': 'boolean',
                'description': localize('preserveInput', "Controls whether the last typed input to the command palette should be restored when opening it the next time."),
                'default': false
            },
            'workbench.commandPalette.experimental.suggestCommands': {
                'type': 'boolean',
                tags: ['experimental'],
                'description': localize('suggestCommands', "Controls whether the command palette should have a list of commonly used commands."),
                'default': false
            },
            'workbench.commandPalette.experimental.askChatLocation': {
                'type': 'string',
                tags: ['experimental'],
                'description': localize('askChatLocation', "Controls where the command palette should ask chat questions."),
                'default': 'chatView',
                enum: ['chatView', 'quickChat'],
                enumDescriptions: [
                    localize('askChatLocation.chatView', "Ask chat questions in the Chat view."),
                    localize('askChatLocation.quickChat', "Ask chat questions in Quick Chat.")
                ]
            },
            'workbench.commandPalette.showAskInChat': {
                'type': 'boolean',
                tags: ['experimental'],
                'description': localize('showAskInChat', "Controls whether the command palette shows 'Ask in Chat' option at the bottom."),
                'default': true
            },
            'workbench.commandPalette.experimental.enableNaturalLanguageSearch': {
                'type': 'boolean',
                tags: ['experimental'],
                'description': localize('enableNaturalLanguageSearch', "Controls whether the command palette should include similar commands. You must have an extension installed that provides Natural Language support."),
                'default': true
            },
            'workbench.quickOpen.closeOnFocusLost': {
                'type': 'boolean',
                'description': localize('closeOnFocusLost', "Controls whether Quick Open should close automatically once it loses focus."),
                'default': true
            },
            'workbench.quickOpen.preserveInput': {
                'type': 'boolean',
                'description': localize('workbench.quickOpen.preserveInput', "Controls whether the last typed input to Quick Open should be restored when opening it the next time."),
                'default': false
            },
            'workbench.settings.openDefaultSettings': {
                'type': 'boolean',
                'description': localize('openDefaultSettings', "Controls whether opening settings also opens an editor showing all default settings."),
                'default': false
            },
            'workbench.settings.useSplitJSON': {
                'type': 'boolean',
                'markdownDescription': localize('useSplitJSON', "Controls whether to use the split JSON editor when editing settings as JSON."),
                'default': false
            },
            'workbench.settings.openDefaultKeybindings': {
                'type': 'boolean',
                'description': localize('openDefaultKeybindings', "Controls whether opening keybinding settings also opens an editor showing all default keybindings."),
                'default': false
            },
            'workbench.settings.alwaysShowAdvancedSettings': {
                'type': 'boolean',
                'description': localize('alwaysShowAdvancedSettings', "Controls whether advanced settings are always shown in the settings editor without requiring the `@tag:advanced` filter."),
                'default': product.quality !== 'stable'
            },
            'workbench.sideBar.location': {
                'type': 'string',
                'enum': ['left', 'right'],
                'default': 'left',
                'description': localize('sideBarLocation', "Controls the location of the primary side bar and activity bar. They can either show on the left or right of the workbench. The secondary side bar will show on the opposite side of the workbench.")
            },
            'workbench.panel.showLabels': {
                'type': 'boolean',
                'default': true,
                'description': localize('panelShowLabels', "Controls whether activity items in the panel title are shown as label or icon."),
            },
            'workbench.panel.defaultLocation': {
                'type': 'string',
                'enum': ['left', 'bottom', 'top', 'right'],
                'default': 'bottom',
                'description': localize('panelDefaultLocation', "Controls the default location of the panel (Terminal, Debug Console, Output, Problems) in a new workspace. It can either show at the bottom, top, right, or left of the editor area."),
            },
            'workbench.panel.opensMaximized': {
                'type': 'string',
                'enum': ['always', 'never', 'preserve'],
                'default': 'preserve',
                'description': localize('panelOpensMaximized', "Controls whether the panel opens maximized. It can either always open maximized, never open maximized, or open to the last state it was in before being closed."),
                'enumDescriptions': [
                    localize('workbench.panel.opensMaximized.always', "Always maximize the panel when opening it."),
                    localize('workbench.panel.opensMaximized.never', "Never maximize the panel when opening it."),
                    localize('workbench.panel.opensMaximized.preserve', "Open the panel to the state that it was in, before it was closed.")
                ]
            },
            'workbench.secondarySideBar.defaultVisibility': {
                'type': 'string',
                'enum': ['hidden', 'visibleInWorkspace', 'visible', 'maximizedInWorkspace', 'maximized'],
                'default': 'visibleInWorkspace',
                'description': localize('secondarySideBarDefaultVisibility', "Controls the default visibility of the secondary side bar in workspaces or empty windows that are opened for the first time. Can be overridden by the agent sessions startup editor setting."),
                'enumDescriptions': [
                    localize('workbench.secondarySideBar.defaultVisibility.hidden', "The secondary side bar is hidden by default."),
                    localize('workbench.secondarySideBar.defaultVisibility.visibleInWorkspace', "The secondary side bar is visible by default if a workspace is opened."),
                    localize('workbench.secondarySideBar.defaultVisibility.visible', "The secondary side bar is visible by default."),
                    localize('workbench.secondarySideBar.defaultVisibility.maximizedInWorkspace', "The secondary side bar is visible and maximized by default if a workspace is opened."),
                    localize('workbench.secondarySideBar.defaultVisibility.maximized', "The secondary side bar is visible and maximized by default.")
                ]
            },
            'workbench.secondarySideBar.forceMaximized': {
                'type': 'boolean',
                'default': false,
                tags: ['experimental'],
                'description': localize('secondarySideBarForceMaximized', "Controls whether the secondary side bar is enforced to always show maximized on startup and when there are no open editors, in layouts that support a maximized secondary side bar."),
            },
            'workbench.secondarySideBar.showLabels': {
                'type': 'boolean',
                'default': true,
                'markdownDescription': localize('secondarySideBarShowLabels', "Controls whether activity items in the secondary side bar title are shown as label or icon. This setting only has an effect when {0} is not set to {1}.", '`#workbench.activityBar.location#`', '`top`'),
            },
            'workbench.statusBar.visible': {
                'type': 'boolean',
                'default': true,
                'description': localize('statusBarVisibility', "Controls the visibility of the status bar at the bottom of the workbench.")
            },
            ["workbench.notifications.position" /* NotificationsSettings.NOTIFICATIONS_POSITION */]: {
                'type': 'string',
                'enum': ["bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */, "bottom-left" /* NotificationsPosition.BOTTOM_LEFT */, "top-right" /* NotificationsPosition.TOP_RIGHT */],
                'default': "bottom-right" /* NotificationsPosition.BOTTOM_RIGHT */,
                'description': localize('notificationsPosition', "Controls the position of the notification toasts and notification center."),
                'enumDescriptions': [
                    localize('workbench.notifications.position.bottom-right', "Show notifications in the bottom right corner."),
                    localize('workbench.notifications.position.bottom-left', "Show notifications in the bottom left corner."),
                    localize('workbench.notifications.position.top-right', "Show notifications in the top right corner, similar to OS-level notifications.")
                ],
                'tags': ['experimental'],
                'experiment': {
                    'mode': 'auto'
                }
            },
            ["workbench.notifications.showInTitleBar" /* NotificationsSettings.NOTIFICATIONS_BUTTON */]: {
                'type': 'boolean',
                'default': true,
                'description': localize('notificationsButton', "Controls the visibility of the Notifications button in the title bar. Only applies when notifications are positioned at the top right.")
            },
            ["workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */]: {
                'type': 'string',
                'enum': ['default', 'top', 'bottom', 'hidden'],
                'default': 'default',
                'markdownDescription': localize({ comment: ['This is the description for a setting'], key: 'activityBarLocation' }, "Controls the location of the Activity Bar relative to the Primary and Secondary Side Bars."),
                'enumDescriptions': [
                    localize('workbench.activityBar.location.default', "Show the Activity Bar on the side of the Primary Side Bar and on top of the Secondary Side Bar."),
                    localize('workbench.activityBar.location.top', "Show the Activity Bar on top of the Primary and Secondary Side Bars."),
                    localize('workbench.activityBar.location.bottom', "Show the Activity Bar at the bottom of the Primary and Secondary Side Bars."),
                    localize('workbench.activityBar.location.hide', "Hide the Activity Bar in the Primary and Secondary Side Bars.")
                ],
            },
            ["workbench.activityBar.autoHide" /* LayoutSettings.ACTIVITY_BAR_AUTO_HIDE */]: {
                'type': 'boolean',
                'default': false,
                'markdownDescription': localize({ comment: ['This is the description for a setting'], key: 'activityBarAutoHide' }, "Controls whether the Activity Bar is automatically hidden when there is only one view container to show. This applies to the Primary and Secondary Side Bars when {0} is set to {1} or {2}.", '`#workbench.activityBar.location#`', '`top`', '`bottom`'),
            },
            ["workbench.activityBar.compact" /* LayoutSettings.ACTIVITY_BAR_COMPACT */]: {
                'type': 'boolean',
                'default': false,
                'markdownDescription': localize({ comment: ['This is the description for a setting'], key: 'activityBarCompact' }, "Controls whether the Activity Bar uses a compact layout with smaller icons and reduced width. This setting only applies when {0} is set to {1}.", '`#workbench.activityBar.location#`', '`default`'),
            },
            'workbench.activityBar.iconClickBehavior': {
                'type': 'string',
                'enum': ['toggle', 'focus'],
                'default': 'toggle',
                'markdownDescription': localize({ comment: ['{0}, {1} will be a setting name rendered as a link'], key: 'activityBarIconClickBehavior' }, "Controls the behavior of clicking an Activity Bar icon in the workbench. This value is ignored when {0} is not set to {1}.", '`#workbench.activityBar.location#`', '`default`'),
                'enumDescriptions': [
                    localize('workbench.activityBar.iconClickBehavior.toggle', "Hide the Primary Side Bar if the clicked item is already visible."),
                    localize('workbench.activityBar.iconClickBehavior.focus', "Focus the Primary Side Bar if the clicked item is already visible.")
                ]
            },
            'workbench.view.alwaysShowHeaderActions': {
                'type': 'boolean',
                'default': false,
                'description': localize('viewVisibility', "Controls the visibility of view header actions. View header actions may either be always visible, or only visible when that view is focused or hovered over.")
            },
            'workbench.view.showQuietly': {
                'type': 'object',
                'description': localize('workbench.view.showQuietly', "If an extension requests a hidden view to be shown, display a clickable status bar indicator instead."),
                'scope': 4 /* ConfigurationScope.WINDOW */,
                'properties': {
                    'workbench.panel.output': {
                        'type': 'boolean',
                        'description': localize('workbench.panel.output', "Output view")
                    }
                },
                'additionalProperties': false
            },
            'workbench.fontAliasing': {
                'type': 'string',
                'enum': ['default', 'antialiased', 'none', 'auto'],
                'default': 'default',
                'description': localize('fontAliasing', "Controls font aliasing method in the workbench."),
                'enumDescriptions': [
                    localize('workbench.fontAliasing.default', "Sub-pixel font smoothing. On most non-retina displays this will give the sharpest text."),
                    localize('workbench.fontAliasing.antialiased', "Smooth the font on the level of the pixel, as opposed to the subpixel. Can make the font appear lighter overall."),
                    localize('workbench.fontAliasing.none', "Disables font smoothing. Text will show with jagged sharp edges."),
                    localize('workbench.fontAliasing.auto', "Applies `default` or `antialiased` automatically based on the DPI of displays.")
                ],
                'included': isMacintosh
            },
            'workbench.settings.editor': {
                'type': 'string',
                'enum': ['ui', 'json'],
                'enumDescriptions': [
                    localize('settings.editor.ui', "Use the settings UI editor."),
                    localize('settings.editor.json', "Use the JSON file editor."),
                ],
                'description': localize('settings.editor.desc', "Determines which Settings editor to use by default."),
                'default': 'ui',
                'scope': 4 /* ConfigurationScope.WINDOW */
            },
            'workbench.settings.showAISearchToggle': {
                'type': 'boolean',
                'default': true,
                'description': localize('settings.showAISearchToggle', "Controls whether the AI search results toggle is shown in the search bar in the Settings editor after doing a search and once AI search results are available."),
            },
            'workbench.hover.delay': {
                'type': 'number',
                'description': localize('workbench.hover.delay', "Controls the delay in milliseconds after which the hover is shown for workbench items (ex. some extension provided tree view items). Already visible items may require a refresh before reflecting this setting change."),
                // Testing has indicated that on Windows and Linux 500 ms matches the native hovers most closely.
                // On Mac, the delay is 1500.
                'default': isMacintosh ? 1500 : 500,
                'minimum': 0
            },
            'workbench.hover.reducedDelay': {
                'type': 'number',
                'description': localize('workbench.hover.reducedDelay', "Controls the reduced delay in milliseconds used for showing hovers in specific contexts where faster feedback is beneficial."),
                'default': 500,
                'minimum': 0
            },
            'workbench.reduceMotion': {
                type: 'string',
                description: localize('workbench.reduceMotion', "Controls whether the workbench should render with fewer animations."),
                'enumDescriptions': [
                    localize('workbench.reduceMotion.on', "Always render with reduced motion."),
                    localize('workbench.reduceMotion.off', "Do not render with reduced motion"),
                    localize('workbench.reduceMotion.auto', "Render with reduced motion based on OS configuration."),
                ],
                default: 'auto',
                tags: ['accessibility'],
                enum: ['on', 'off', 'auto']
            },
            'workbench.reduceTransparency': {
                type: 'string',
                description: localize('workbench.reduceTransparency', "Controls whether the workbench should render with fewer transparency and blur effects for improved performance."),
                'enumDescriptions': [
                    localize('workbench.reduceTransparency.on', "Always render without transparency and blur effects."),
                    localize('workbench.reduceTransparency.off', "Do not reduce transparency and blur effects."),
                    localize('workbench.reduceTransparency.auto', "Reduce transparency and blur effects based on OS configuration."),
                ],
                default: 'off',
                tags: ['accessibility'],
                enum: ['on', 'off', 'auto']
            },
            'workbench.navigationControl.enabled': {
                'type': 'boolean',
                'default': true,
                'markdownDescription': isWeb ?
                    localize('navigationControlEnabledWeb', "Controls whether the navigation control in the title bar is shown.") :
                    localize({ key: 'navigationControlEnabled', comment: ['{0}, {1} is a placeholder for a setting identifier.'] }, "Controls whether the navigation control is shown in the custom title bar. This setting only has an effect when {0} is not set to {1}.", '`#window.customTitleBarVisibility#`', '`never`')
            },
            ["workbench.layoutControl.enabled" /* LayoutSettings.LAYOUT_ACTIONS */]: {
                'type': 'boolean',
                'default': true,
                'markdownDescription': isWeb ?
                    localize('layoutControlEnabledWeb', "Controls whether the layout control in the title bar is shown.") :
                    localize({ key: 'layoutControlEnabled', comment: ['{0}, {1} is a placeholder for a setting identifier.'] }, "Controls whether the layout control is shown in the custom title bar. This setting only has an effect when {0} is not set to {1}.", '`#window.customTitleBarVisibility#`', '`never`')
            },
            'workbench.layoutControl.type': {
                'type': 'string',
                'enum': ['menu', 'toggles', 'both'],
                'enumDescriptions': [
                    localize('layoutcontrol.type.menu', "Shows a single button with a dropdown of layout options."),
                    localize('layoutcontrol.type.toggles', "Shows several buttons for toggling the visibility of the panels and side bar."),
                    localize('layoutcontrol.type.both', "Shows both the dropdown and toggle buttons."),
                ],
                'default': 'both',
                'description': localize('layoutControlType', "Controls whether the layout control in the custom title bar is displayed as a single menu button or with multiple UI toggles."),
            },
            'workbench.tips.enabled': {
                'type': 'boolean',
                'default': true,
                'description': localize('tips.enabled', "When enabled, will show the watermark tips when no editor is open.")
            },
            ["workbench.shadows" /* LayoutSettings.SHADOWS */]: {
                'type': 'boolean',
                'default': true,
                'description': localize('shadows', "Controls whether shadow effects are shown around the side panels and other workbench elements.")
            },
        }
    });
    // Window
    let windowTitleDescription = localize('windowTitle', "Controls the window title based on the current context such as the opened workspace or active editor. Variables are substituted based on the context:");
    windowTitleDescription += '\n- ' + [
        localize('activeEditorShort', "`${activeEditorShort}`: the file name (e.g. myFile.txt)."),
        localize('activeEditorMedium', "`${activeEditorMedium}`: the path of the file relative to the workspace folder (e.g. myFolder/myFileFolder/myFile.txt)."),
        localize('activeEditorLong', "`${activeEditorLong}`: the full path of the file (e.g. /Users/Development/myFolder/myFileFolder/myFile.txt)."),
        localize('activeEditorLanguageId', "`${activeEditorLanguageId}`: the language identifier of the active editor (e.g. typescript)."),
        localize('activeFolderShort', "`${activeFolderShort}`: the name of the folder the file is contained in (e.g. myFileFolder)."),
        localize('activeFolderMedium', "`${activeFolderMedium}`: the path of the folder the file is contained in, relative to the workspace folder (e.g. myFolder/myFileFolder)."),
        localize('activeFolderLong', "`${activeFolderLong}`: the full path of the folder the file is contained in (e.g. /Users/Development/myFolder/myFileFolder)."),
        localize('folderName', "`${folderName}`: name of the workspace folder the file is contained in (e.g. myFolder)."),
        localize('folderPath', "`${folderPath}`: file path of the workspace folder the file is contained in (e.g. /Users/Development/myFolder)."),
        localize('rootName', "`${rootName}`: name of the workspace with optional remote name and workspace indicator if applicable (e.g. myFolder, myRemoteFolder [SSH] or myWorkspace (Workspace))."),
        localize('rootNameShort', "`${rootNameShort}`: shortened name of the workspace without suffixes (e.g. myFolder, myRemoteFolder or myWorkspace)."),
        localize('rootPath', "`${rootPath}`: file path of the opened workspace or folder (e.g. /Users/Development/myWorkspace)."),
        localize('profileName', "`${profileName}`: name of the profile in which the workspace is opened (e.g. Data Science (Profile)). Ignored if default profile is used."),
        localize('appName', "`${appName}`: e.g. VS Code."),
        localize('remoteName', "`${remoteName}`: e.g. SSH"),
        localize('dirty', "`${dirty}`: an indicator for when the active editor has unsaved changes."),
        localize('focusedView', "`${focusedView}`: the name of the view that is currently focused."),
        localize('activeRepositoryName', "`${activeRepositoryName}`: the name of the active repository (e.g. vscode)."),
        localize('activeRepositoryBranchName', "`${activeRepositoryBranchName}`: the name of the active branch in the active repository (e.g. main)."),
        localize('activeEditorState', "`${activeEditorState}`: provides information about the state of the active editor (e.g. modified). This will be appended by default when in screen reader mode with {0} enabled.", '`accessibility.windowTitleOptimized`'),
        localize('separator', "`${separator}`: a conditional separator (\" - \") that only shows when surrounded by variables with values or static text.")
    ].join('\n- '); // intentionally concatenated to not produce a string that is too long for translations
    registry.registerConfiguration({
        ...windowConfigurationNodeBase,
        'properties': {
            'window.title': {
                'type': 'string',
                'default': defaultWindowTitle,
                'markdownDescription': windowTitleDescription
            },
            'window.titleSeparator': {
                'type': 'string',
                'default': defaultWindowTitleSeparator,
                'markdownDescription': localize("window.titleSeparator", "Separator used by {0}.", '`#window.title#`')
            },
            ["window.commandCenter" /* LayoutSettings.COMMAND_CENTER */]: {
                type: 'boolean',
                default: true,
                markdownDescription: isWeb ?
                    localize('window.commandCenterWeb', "Show command launcher together with the window title.") :
                    localize({ key: 'window.commandCenter', comment: ['{0}, {1} is a placeholder for a setting identifier.'] }, "Show command launcher together with the window title. This setting only has an effect when {0} is not set to {1}.", '`#window.customTitleBarVisibility#`', '`never`')
            },
            'window.menuBarVisibility': {
                'type': 'string',
                'enum': ['classic', 'visible', 'toggle', 'hidden', 'compact'],
                'markdownEnumDescriptions': [
                    localize('window.menuBarVisibility.classic', "Menu is displayed at the top of the window and only hidden in full screen mode."),
                    localize('window.menuBarVisibility.visible', "Menu is always visible at the top of the window even in full screen mode."),
                    isMacintosh ?
                        localize('window.menuBarVisibility.toggle.mac', "Menu is hidden but can be displayed at the top of the window by executing the `Focus Application Menu` command.") :
                        localize('window.menuBarVisibility.toggle', "Menu is hidden but can be displayed at the top of the window via the Alt key."),
                    localize('window.menuBarVisibility.hidden', "Menu is always hidden."),
                    isWeb ?
                        localize('window.menuBarVisibility.compact.web', "Menu is displayed as a compact button in the side bar.") :
                        localize({ key: 'window.menuBarVisibility.compact', comment: ['{0}, {1} is a placeholder for a setting identifier.'] }, "Menu is displayed as a compact button in the side bar. This value is ignored when {0} is {1} and {2} is either {3} or {4}.", '`#window.titleBarStyle#`', '`native`', '`#window.menuStyle#`', '`native`', '`inherit`')
                ],
                'default': isWeb ? 'compact' : 'classic',
                'scope': 1 /* ConfigurationScope.APPLICATION */,
                'markdownDescription': isMacintosh ?
                    localize('menuBarVisibility.mac', "Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and executing `Focus Application Menu` will show it. A setting of 'compact' will move the menu into the side bar.") :
                    localize('menuBarVisibility', "Control the visibility of the menu bar. A setting of 'toggle' means that the menu bar is hidden and a single press of the Alt key will show it. A setting of 'compact' will move the menu into the side bar."),
                'included': isWindows || isLinux || isWeb
            },
            'window.enableMenuBarMnemonics': {
                'type': 'boolean',
                'default': true,
                'scope': 1 /* ConfigurationScope.APPLICATION */,
                'description': localize('enableMenuBarMnemonics', "Controls whether the main menus can be opened via Alt-key shortcuts. Disabling mnemonics allows to bind these Alt-key shortcuts to editor commands instead."),
                'included': isWindows || isLinux
            },
            'window.customMenuBarAltFocus': {
                'type': 'boolean',
                'default': true,
                'scope': 1 /* ConfigurationScope.APPLICATION */,
                'markdownDescription': localize('customMenuBarAltFocus', "Controls whether the menu bar will be focused by pressing the Alt-key. This setting has no effect on toggling the menu bar with the Alt-key."),
                'included': isWindows || isLinux
            },
            'window.openFilesInNewWindow': {
                'type': 'string',
                'enum': ['on', 'off', 'default'],
                'enumDescriptions': [
                    localize('window.openFilesInNewWindow.on', "Files will open in a new window."),
                    localize('window.openFilesInNewWindow.off', "Files will open in the window with the files' folder open or the last active window."),
                    isMacintosh ?
                        localize('window.openFilesInNewWindow.defaultMac', "Files will open in the window with the files' folder open or the last active window unless opened via the Dock or from Finder.") :
                        localize('window.openFilesInNewWindow.default', "Files will open in a new window unless picked from within the application (e.g. via the File menu).")
                ],
                'default': 'off',
                'scope': 1 /* ConfigurationScope.APPLICATION */,
                'markdownDescription': isMacintosh ?
                    localize('openFilesInNewWindowMac', "Controls whether files should open in a new window when using a command line or file dialog.\nNote that there can still be cases where this setting is ignored (e.g. when using the `--new-window` or `--reuse-window` command line option).") :
                    localize('openFilesInNewWindow', "Controls whether files should open in a new window when using a command line or file dialog.\nNote that there can still be cases where this setting is ignored (e.g. when using the `--new-window` or `--reuse-window` command line option).")
            },
            'window.openFoldersInNewWindow': {
                'type': 'string',
                'enum': ['on', 'off', 'default'],
                'enumDescriptions': [
                    localize('window.openFoldersInNewWindow.on', "Folders will open in a new window."),
                    localize('window.openFoldersInNewWindow.off', "Folders will replace the last active window."),
                    localize('window.openFoldersInNewWindow.default', "Folders will open in a new window unless a folder is picked from within the application (e.g. via the File menu).")
                ],
                'default': 'default',
                'scope': 1 /* ConfigurationScope.APPLICATION */,
                'markdownDescription': localize('openFoldersInNewWindow', "Controls whether folders should open in a new window or replace the last active window.\nNote that there can still be cases where this setting is ignored (e.g. when using the `--new-window` or `--reuse-window` command line option).")
            },
            'window.confirmBeforeClose': {
                'type': 'string',
                'enum': ['always', 'keyboardOnly', 'never'],
                'enumDescriptions': [
                    isWeb ?
                        localize('window.confirmBeforeClose.always.web', "Always try to ask for confirmation. Note that browsers may still decide to close a tab or window without confirmation.") :
                        localize('window.confirmBeforeClose.always', "Always ask for confirmation."),
                    isWeb ?
                        localize('window.confirmBeforeClose.keyboardOnly.web', "Only ask for confirmation if a keybinding was used to close the window. Note that detection may not be possible in some cases.") :
                        localize('window.confirmBeforeClose.keyboardOnly', "Only ask for confirmation if a keybinding was used."),
                    isWeb ?
                        localize('window.confirmBeforeClose.never.web', "Never explicitly ask for confirmation unless data loss is imminent.") :
                        localize('window.confirmBeforeClose.never', "Never explicitly ask for confirmation.")
                ],
                'default': (isWeb && !isStandalone()) ? 'keyboardOnly' : 'never', // on by default in web, unless PWA, never on desktop
                'markdownDescription': isWeb ?
                    localize('confirmBeforeCloseWeb', "Controls whether to show a confirmation dialog before closing the browser tab or window. Note that even if enabled, browsers may still decide to close a tab or window without confirmation and that this setting is only a hint that may not work in all cases.") :
                    localize('confirmBeforeClose', "Controls whether to show a confirmation dialog before closing a window or quitting the application."),
                'scope': 1 /* ConfigurationScope.APPLICATION */
            }
        }
    });
    // Dynamic Window Configuration
    registerWorkbenchContribution2(DynamicWindowConfiguration.ID, DynamicWindowConfiguration, 4 /* WorkbenchPhase.Eventually */);
    // Problems
    registry.registerConfiguration({
        ...problemsConfigurationNodeBase,
        'properties': {
            'problems.visibility': {
                'type': 'boolean',
                'default': true,
                'description': localize('problems.visibility', "Controls whether the problems are visible throughout the editor and workbench."),
            },
        }
    });
    // Zen Mode
    registry.registerConfiguration({
        'id': 'zenMode',
        'order': 9,
        'title': localize('zenModeConfigurationTitle', "Zen Mode"),
        'type': 'object',
        'properties': {
            'zenMode.fullScreen': {
                'type': 'boolean',
                'default': true,
                'description': localize('zenMode.fullScreen', "Controls whether turning on Zen Mode also puts the workbench into full screen mode.")
            },
            'zenMode.centerLayout': {
                'type': 'boolean',
                'default': true,
                'description': localize('zenMode.centerLayout', "Controls whether turning on Zen Mode also centers the layout.")
            },
            'zenMode.showTabs': {
                'type': 'string',
                'enum': ['multiple', 'single', 'none'],
                'description': localize('zenMode.showTabs', "Controls whether turning on Zen Mode should show multiple editor tabs, a single editor tab, or hide the editor title area completely."),
                'enumDescriptions': [
                    localize('zenMode.showTabs.multiple', "Each editor is displayed as a tab in the editor title area."),
                    localize('zenMode.showTabs.single', "The active editor is displayed as a single large tab in the editor title area."),
                    localize('zenMode.showTabs.none', "The editor title area is not displayed."),
                ],
                'default': 'multiple'
            },
            'zenMode.hideStatusBar': {
                'type': 'boolean',
                'default': true,
                'description': localize('zenMode.hideStatusBar', "Controls whether turning on Zen Mode also hides the status bar at the bottom of the workbench.")
            },
            'zenMode.hideActivityBar': {
                'type': 'boolean',
                'default': true,
                'description': localize('zenMode.hideActivityBar', "Controls whether turning on Zen Mode also hides the activity bar either at the left or right of the workbench.")
            },
            'zenMode.hideLineNumbers': {
                'type': 'boolean',
                'default': true,
                'description': localize('zenMode.hideLineNumbers', "Controls whether turning on Zen Mode also hides the editor line numbers.")
            },
            'zenMode.restore': {
                'type': 'boolean',
                'default': true,
                'description': localize('zenMode.restore', "Controls whether a window should restore to Zen Mode if it was exited in Zen Mode.")
            },
            'zenMode.silentNotifications': {
                'type': 'boolean',
                'default': true,
                'description': localize('zenMode.silentNotifications', "Controls whether notifications do not disturb mode should be enabled while in Zen Mode. If true, only error notifications will pop out.")
            }
        }
    });
})();
Registry.as(Extensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: 'workbench.activityBar.visible', migrateFn: (value) => {
            const result = [];
            if (value !== undefined) {
                result.push(['workbench.activityBar.visible', { value: undefined }]);
            }
            if (value === false) {
                result.push(["workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, { value: "hidden" /* ActivityBarPosition.HIDDEN */ }]);
            }
            return result;
        }
    }]);
Registry.as(Extensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: "workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, migrateFn: (value) => {
            const results = [];
            if (value === 'side') {
                results.push(["workbench.activityBar.location" /* LayoutSettings.ACTIVITY_BAR_LOCATION */, { value: "default" /* ActivityBarPosition.DEFAULT */ }]);
            }
            return results;
        }
    }]);
Registry.as(Extensions.ConfigurationMigration)
    .registerConfigurationMigrations([{
        key: 'workbench.editor.doubleClickTabToToggleEditorGroupSizes', migrateFn: (value) => {
            const results = [];
            if (typeof value === 'boolean') {
                value = value ? 'expand' : 'off';
                results.push(['workbench.editor.doubleClickTabToToggleEditorGroupSizes', { value }]);
            }
            return results;
        }
    }, {
        key: "workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */, migrateFn: (value) => {
            const results = [];
            if (typeof value === 'boolean') {
                value = value ? "multiple" /* EditorTabsMode.MULTIPLE */ : "single" /* EditorTabsMode.SINGLE */;
                results.push(["workbench.editor.showTabs" /* LayoutSettings.EDITOR_TABS_MODE */, { value }]);
            }
            return results;
        }
    }, {
        key: 'workbench.editor.tabCloseButton', migrateFn: (value) => {
            const result = [];
            if (value === 'left' || value === 'right') {
                result.push(['workbench.editor.tabActionLocation', { value }]);
            }
            else if (value === 'off') {
                result.push(['workbench.editor.tabActionCloseVisibility', { value: false }]);
            }
            return result;
        }
    }, {
        key: 'zenMode.hideTabs', migrateFn: (value) => {
            const result = [['zenMode.hideTabs', { value: undefined }]];
            if (value === true) {
                result.push(['zenMode.showTabs', { value: 'single' }]);
            }
            return result;
        }
    }]);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2JlbmNoLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3dvcmtiZW5jaC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDakcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN4QyxPQUFPLEVBQUUsVUFBVSxJQUFJLHVCQUF1QixFQUE4QyxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pLLE9BQU8sT0FBTyxNQUFNLDBDQUEwQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQThCLDJDQUEyQyxFQUFFLDBCQUEwQixFQUFFLHFDQUFxQyxFQUFFLFVBQVUsRUFBbUMsNkJBQTZCLEVBQUUsMkJBQTJCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNqVSxPQUFPLEVBQWtCLDhCQUE4QixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFNUYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFFakcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLDJCQUEyQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFbEcsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUM7QUFFNUYsZ0JBQWdCO0FBQ2hCLENBQUMsU0FBUyxxQkFBcUI7SUFFOUIsb0JBQW9CO0lBQ3BCLDhCQUE4QixDQUFD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