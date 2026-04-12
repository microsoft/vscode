/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { Schemas, matchesScheme } from '../../../../base/common/network.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { isNumber, isObject, isString, isUndefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorResolution } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess } from './editorQuickAccess.js';
import { SideBySideEditor } from './sideBySideEditor.js';
import { TextDiffEditor } from './textDiffEditor.js';
import { ActiveEditorCanSplitInGroupContext, ActiveEditorGroupEmptyContext, ActiveEditorGroupLockedContext, ActiveEditorStickyContext, EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, IsSessionsWindowContext, MultipleEditorGroupsContext, SideBySideEditorActiveContext, TextCompareEditorActiveContext } from '../../../common/contextkeys.js';
import { isEditorInputWithOptionsAndGroup } from '../../../common/editor.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { columnToEditorGroup } from '../../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { DIFF_FOCUS_OTHER_SIDE, DIFF_FOCUS_PRIMARY_SIDE, DIFF_FOCUS_SECONDARY_SIDE, registerDiffEditorCommands } from './diffEditorCommands.js';
import { resolveCommandsContext } from './editorCommandsContext.js';
import { prepareMoveCopyEditors } from './editor.js';
export const CLOSE_SAVED_EDITORS_COMMAND_ID = 'workbench.action.closeUnmodifiedEditors';
export const CLOSE_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.action.closeEditorsInGroup';
export const CLOSE_EDITORS_AND_GROUP_COMMAND_ID = 'workbench.action.closeEditorsAndGroup';
export const CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID = 'workbench.action.closeEditorsToTheRight';
export const CLOSE_EDITOR_COMMAND_ID = 'workbench.action.closeActiveEditor';
export const CLOSE_PINNED_EDITOR_COMMAND_ID = 'workbench.action.closeActivePinnedEditor';
export const CLOSE_EDITOR_GROUP_COMMAND_ID = 'workbench.action.closeGroup';
export const CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID = 'workbench.action.closeOtherEditors';
export const MOVE_ACTIVE_EDITOR_COMMAND_ID = 'moveActiveEditor';
export const COPY_ACTIVE_EDITOR_COMMAND_ID = 'copyActiveEditor';
export const LAYOUT_EDITOR_GROUPS_COMMAND_ID = 'layoutEditorGroups';
export const KEEP_EDITOR_COMMAND_ID = 'workbench.action.keepEditor';
export const TOGGLE_KEEP_EDITORS_COMMAND_ID = 'workbench.action.toggleKeepEditors';
export const TOGGLE_LOCK_GROUP_COMMAND_ID = 'workbench.action.toggleEditorGroupLock';
export const LOCK_GROUP_COMMAND_ID = 'workbench.action.lockEditorGroup';
export const UNLOCK_GROUP_COMMAND_ID = 'workbench.action.unlockEditorGroup';
export const SHOW_EDITORS_IN_GROUP = 'workbench.action.showEditorsInGroup';
export const REOPEN_WITH_COMMAND_ID = 'workbench.action.reopenWithEditor';
export const REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID = 'reopenActiveEditorWith';
export const PIN_EDITOR_COMMAND_ID = 'workbench.action.pinEditor';
export const UNPIN_EDITOR_COMMAND_ID = 'workbench.action.unpinEditor';
export const SPLIT_EDITOR = 'workbench.action.splitEditor';
export const SPLIT_EDITOR_UP = 'workbench.action.splitEditorUp';
export const SPLIT_EDITOR_DOWN = 'workbench.action.splitEditorDown';
export const SPLIT_EDITOR_LEFT = 'workbench.action.splitEditorLeft';
export const SPLIT_EDITOR_RIGHT = 'workbench.action.splitEditorRight';
export const MOVE_EDITOR_INTO_ABOVE_GROUP = 'workbench.action.moveEditorToAboveGroup';
export const MOVE_EDITOR_INTO_BELOW_GROUP = 'workbench.action.moveEditorToBelowGroup';
export const MOVE_EDITOR_INTO_LEFT_GROUP = 'workbench.action.moveEditorToLeftGroup';
export const MOVE_EDITOR_INTO_RIGHT_GROUP = 'workbench.action.moveEditorToRightGroup';
export const TOGGLE_MAXIMIZE_EDITOR_GROUP = 'workbench.action.toggleMaximizeEditorGroup';
export const SPLIT_EDITOR_IN_GROUP = 'workbench.action.splitEditorInGroup';
export const TOGGLE_SPLIT_EDITOR_IN_GROUP = 'workbench.action.toggleSplitEditorInGroup';
export const JOIN_EDITOR_IN_GROUP = 'workbench.action.joinEditorInGroup';
export const TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT = 'workbench.action.toggleSplitEditorInGroupLayout';
export const FOCUS_FIRST_SIDE_EDITOR = 'workbench.action.focusFirstSideEditor';
export const FOCUS_SECOND_SIDE_EDITOR = 'workbench.action.focusSecondSideEditor';
export const FOCUS_OTHER_SIDE_EDITOR = 'workbench.action.focusOtherSideEditor';
export const FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID = 'workbench.action.focusLeftGroupWithoutWrap';
export const FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID = 'workbench.action.focusRightGroupWithoutWrap';
export const FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID = 'workbench.action.focusAboveGroupWithoutWrap';
export const FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID = 'workbench.action.focusBelowGroupWithoutWrap';
export const OPEN_EDITOR_AT_INDEX_COMMAND_ID = 'workbench.action.openEditorAtIndex';
export const MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID = 'workbench.action.moveEditorToNewWindow';
export const COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID = 'workbench.action.copyEditorToNewWindow';
export const MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID = 'workbench.action.moveEditorGroupToNewWindow';
export const COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID = 'workbench.action.copyEditorGroupToNewWindow';
export const NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID = 'workbench.action.newEmptyEditorWindow';
export const CLOSE_MODAL_EDITOR_COMMAND_ID = 'workbench.action.closeModalEditor';
export const MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID = 'workbench.action.moveModalEditorToMain';
export const MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID = 'workbench.action.moveModalEditorToWindow';
export const TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID = 'workbench.action.toggleModalEditorMaximized';
export const NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID = 'workbench.action.navigateModalEditorPrevious';
export const NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID = 'workbench.action.navigateModalEditorNext';
export const TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID = 'workbench.action.toggleModalEditorSidebar';
export const API_OPEN_EDITOR_COMMAND_ID = '_workbench.open';
export const API_OPEN_DIFF_EDITOR_COMMAND_ID = '_workbench.diff';
export const API_OPEN_WITH_EDITOR_COMMAND_ID = '_workbench.openWith';
export const EDITOR_CORE_NAVIGATION_COMMANDS = [
    SPLIT_EDITOR,
    CLOSE_EDITOR_COMMAND_ID,
    UNPIN_EDITOR_COMMAND_ID,
    UNLOCK_GROUP_COMMAND_ID,
    TOGGLE_MAXIMIZE_EDITOR_GROUP
];
const isSelectedEditorsMoveCopyArg = function (arg) {
    if (!isObject(arg)) {
        return false;
    }
    if (!isString(arg.to)) {
        return false;
    }
    if (!isUndefined(arg.by) && !isString(arg.by)) {
        return false;
    }
    if (!isUndefined(arg.value) && !isNumber(arg.value)) {
        return false;
    }
    return true;
};
function registerEditorMoveCopyCommand() {
    const moveCopyJSONSchema = {
        'type': 'object',
        'required': ['to'],
        'properties': {
            'to': {
                'type': 'string',
                'enum': ['left', 'right']
            },
            'by': {
                'type': 'string',
                'enum': ['tab', 'group']
            },
            'value': {
                'type': 'number'
            }
        }
    };
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: MOVE_ACTIVE_EDITOR_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: EditorContextKeys.editorTextFocus,
        primary: 0,
        handler: (accessor, args) => moveCopySelectedEditors(true, args, accessor),
        metadata: {
            description: localize('editorCommand.activeEditorMove.description', "Move the active editor by tabs or groups"),
            args: [
                {
                    name: localize('editorCommand.activeEditorMove.arg.name', "Active editor move argument"),
                    description: localize('editorCommand.activeEditorMove.arg.description', "Argument Properties:\n\t* 'to': String value providing where to move.\n\t* 'by': String value providing the unit for move (by tab or by group).\n\t* 'value': Number value providing how many positions or an absolute position to move."),
                    constraint: isSelectedEditorsMoveCopyArg,
                    schema: moveCopyJSONSchema
                }
            ]
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: COPY_ACTIVE_EDITOR_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: EditorContextKeys.editorTextFocus,
        primary: 0,
        handler: (accessor, args) => moveCopySelectedEditors(false, args, accessor),
        metadata: {
            description: localize('editorCommand.activeEditorCopy.description', "Copy the active editor by groups"),
            args: [
                {
                    name: localize('editorCommand.activeEditorCopy.arg.name', "Active editor copy argument"),
                    description: localize('editorCommand.activeEditorCopy.arg.description', "Argument Properties:\n\t* 'to': String value providing where to copy.\n\t* 'value': Number value providing how many positions or an absolute position to copy."),
                    constraint: isSelectedEditorsMoveCopyArg,
                    schema: moveCopyJSONSchema
                }
            ]
        }
    });
    [
        { id: MOVE_EDITOR_INTO_ABOVE_GROUP, to: 'up' },
        { id: MOVE_EDITOR_INTO_BELOW_GROUP, to: 'down' },
        { id: MOVE_EDITOR_INTO_LEFT_GROUP, to: 'left' },
        { id: MOVE_EDITOR_INTO_RIGHT_GROUP, to: 'right' }
    ].forEach(({ id, to }) => {
        CommandsRegistry.registerCommand(id, function (accessor, ...args) {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            if (resolvedContext.groupedEditors.length) {
                moveCopyEditorsToGroup(true, { to, by: 'group' }, resolvedContext.groupedEditors[0].group, resolvedContext.groupedEditors[0].editors, accessor);
            }
        });
    });
    function moveCopySelectedEditors(isMove, args = Object.create(null), accessor) {
        args.to = args.to || 'right';
        args.by = args.by || 'tab';
        args.value = typeof args.value === 'number' ? args.value : 1;
        const activeGroup = accessor.get(IEditorGroupsService).activeGroup;
        const selectedEditors = activeGroup.selectedEditors;
        if (selectedEditors.length > 0) {
            switch (args.by) {
                case 'tab':
                    if (isMove) {
                        return moveTabs(args, activeGroup, selectedEditors);
                    }
                    break;
                case 'group':
                    return moveCopyEditorsToGroup(isMove, args, activeGroup, selectedEditors, accessor);
            }
        }
    }
    function moveTabs(args, group, editors) {
        const to = args.to;
        if (to === 'first' || to === 'right') {
            editors = [...editors].reverse();
        }
        else if (to === 'position' && (args.value ?? 1) < group.getIndexOfEditor(editors[0])) {
            editors = [...editors].reverse();
        }
        for (const editor of editors) {
            moveTab(args, group, editor);
        }
    }
    function moveTab(args, group, editor) {
        let index = group.getIndexOfEditor(editor);
        switch (args.to) {
            case 'first':
                index = 0;
                break;
            case 'last':
                index = group.count - 1;
                break;
            case 'left':
                index = index - (args.value ?? 1);
                break;
            case 'right':
                index = index + (args.value ?? 1);
                break;
            case 'center':
                index = Math.round(group.count / 2) - 1;
                break;
            case 'position':
                index = (args.value ?? 1) - 1;
                break;
        }
        index = index < 0 ? 0 : index >= group.count ? group.count - 1 : index;
        group.moveEditor(editor, group, { index });
    }
    function moveCopyEditorsToGroup(isMove, args, sourceGroup, editors, accessor) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const configurationService = accessor.get(IConfigurationService);
        let targetGroup;
        switch (args.to) {
            case 'left':
                targetGroup = editorGroupsService.findGroup({ direction: 2 /* GroupDirection.LEFT */ }, sourceGroup);
                if (!targetGroup) {
                    targetGroup = editorGroupsService.addGroup(sourceGroup, 2 /* GroupDirection.LEFT */);
                }
                break;
            case 'right':
                targetGroup = editorGroupsService.findGroup({ direction: 3 /* GroupDirection.RIGHT */ }, sourceGroup);
                if (!targetGroup) {
                    targetGroup = editorGroupsService.addGroup(sourceGroup, 3 /* GroupDirection.RIGHT */);
                }
                break;
            case 'up':
                targetGroup = editorGroupsService.findGroup({ direction: 0 /* GroupDirection.UP */ }, sourceGroup);
                if (!targetGroup) {
                    targetGroup = editorGroupsService.addGroup(sourceGroup, 0 /* GroupDirection.UP */);
                }
                break;
            case 'down':
                targetGroup = editorGroupsService.findGroup({ direction: 1 /* GroupDirection.DOWN */ }, sourceGroup);
                if (!targetGroup) {
                    targetGroup = editorGroupsService.addGroup(sourceGroup, 1 /* GroupDirection.DOWN */);
                }
                break;
            case 'first':
                targetGroup = editorGroupsService.findGroup({ location: 0 /* GroupLocation.FIRST */ }, sourceGroup);
                break;
            case 'last':
                targetGroup = editorGroupsService.findGroup({ location: 1 /* GroupLocation.LAST */ }, sourceGroup);
                break;
            case 'previous':
                targetGroup = editorGroupsService.findGroup({ location: 3 /* GroupLocation.PREVIOUS */ }, sourceGroup);
                if (!targetGroup) {
                    const oppositeDirection = preferredSideBySideGroupDirection(configurationService) === 3 /* GroupDirection.RIGHT */ ? 2 /* GroupDirection.LEFT */ : 0 /* GroupDirection.UP */;
                    targetGroup = editorGroupsService.addGroup(sourceGroup, oppositeDirection);
                }
                break;
            case 'next':
                targetGroup = editorGroupsService.findGroup({ location: 2 /* GroupLocation.NEXT */ }, sourceGroup);
                if (!targetGroup) {
                    targetGroup = editorGroupsService.addGroup(sourceGroup, preferredSideBySideGroupDirection(configurationService));
                }
                break;
            case 'center':
                targetGroup = editorGroupsService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */)[(editorGroupsService.count / 2) - 1];
                break;
            case 'position':
                targetGroup = editorGroupsService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */)[(args.value ?? 1) - 1];
                break;
        }
        if (targetGroup) {
            const editorsWithOptions = prepareMoveCopyEditors(sourceGroup, editors);
            if (isMove) {
                sourceGroup.moveEditors(editorsWithOptions, targetGroup);
            }
            else if (sourceGroup.id !== targetGroup.id) {
                sourceGroup.copyEditors(editorsWithOptions, targetGroup);
            }
            targetGroup.focus();
        }
    }
}
function registerEditorGroupsLayoutCommands() {
    function applyEditorLayout(accessor, layout) {
        if (!layout || typeof layout !== 'object') {
            return;
        }
        const editorGroupsService = accessor.get(IEditorGroupsService);
        editorGroupsService.applyLayout(layout);
    }
    CommandsRegistry.registerCommand(LAYOUT_EDITOR_GROUPS_COMMAND_ID, (accessor, args) => {
        applyEditorLayout(accessor, args);
    });
    // API Commands
    CommandsRegistry.registerCommand({
        id: 'vscode.setEditorLayout',
        handler: (accessor, args) => applyEditorLayout(accessor, args),
        metadata: {
            'description': `Set the editor layout. Editor layout is represented as a tree of groups in which the first group is the root group of the layout.
					The orientation of the first group is 0 (horizontal) by default unless specified otherwise. The other orientations are 1 (vertical).
					The orientation of subsequent groups is the opposite of the orientation of the group that contains it.
					Here are some examples: A layout representing 1 row and 2 columns: { orientation: 0, groups: [{}, {}] }.
					A layout representing 3 rows and 1 column: { orientation: 1, groups: [{}, {}, {}] }.
					A layout representing 3 rows and 1 column in which the second row has 2 columns: { orientation: 1, groups: [{}, { groups: [{}, {}] }, {}] }
					`,
            args: [{
                    name: 'args',
                    schema: {
                        'type': 'object',
                        'required': ['groups'],
                        'properties': {
                            'orientation': {
                                'type': 'number',
                                'default': 0,
                                'description': `The orientation of the root group in the layout. 0 for horizontal, 1 for vertical.`,
                                'enum': [0, 1],
                                'enumDescriptions': [
                                    localize('editorGroupLayout.horizontal', "Horizontal"),
                                    localize('editorGroupLayout.vertical', "Vertical")
                                ],
                            },
                            'groups': {
                                '$ref': '#/definitions/editorGroupsSchema',
                                'default': [{}, {}]
                            }
                        }
                    }
                }]
        }
    });
    CommandsRegistry.registerCommand({
        id: 'vscode.getEditorLayout',
        handler: (accessor) => {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            return editorGroupsService.getLayout();
        },
        metadata: {
            description: 'Get Editor Layout',
            args: [],
            returns: 'An editor layout object, in the same format as vscode.setEditorLayout'
        }
    });
}
function registerOpenEditorAPICommands() {
    function mixinContext(context, options, column) {
        if (!context) {
            return [options, column];
        }
        return [
            { ...context.editorOptions, ...(options ?? Object.create(null)) },
            context.sideBySide ? SIDE_GROUP : column
        ];
    }
    // partial, renderer-side API command to open editor only supporting
    // arguments that do not need to be converted from the extension host
    // complements https://github.com/microsoft/vscode/blob/2b164efb0e6a5de3826bff62683eaeafe032284f/src/vs/workbench/api/common/extHostApiCommands.ts#L373
    CommandsRegistry.registerCommand({
        id: 'vscode.open',
        handler: (accessor, arg) => {
            accessor.get(ICommandService).executeCommand(API_OPEN_EDITOR_COMMAND_ID, arg);
        },
        metadata: {
            description: 'Opens the provided resource in the editor.',
            args: [{ name: 'Uri' }]
        }
    });
    CommandsRegistry.registerCommand(API_OPEN_EDITOR_COMMAND_ID, async function (accessor, resourceArg, columnAndOptions, label, context) {
        const editorService = accessor.get(IEditorService);
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const openerService = accessor.get(IOpenerService);
        const pathService = accessor.get(IPathService);
        const configurationService = accessor.get(IConfigurationService);
        const untitledTextEditorService = accessor.get(IUntitledTextEditorService);
        const resourceOrString = typeof resourceArg === 'string' ? resourceArg : URI.from(resourceArg, true);
        const [columnArg, optionsArg] = columnAndOptions ?? [];
        // use editor options or editor view column or resource scheme
        // as a hint to use the editor service for opening directly
        if (optionsArg || typeof columnArg === 'number' || matchesScheme(resourceOrString, Schemas.untitled)) {
            const [options, column] = mixinContext(context, optionsArg, columnArg);
            const resource = URI.isUri(resourceOrString) ? resourceOrString : URI.parse(resourceOrString);
            let input;
            if (untitledTextEditorService.isUntitledWithAssociatedResource(resource)) {
                // special case for untitled: we are getting a resource with meaningful
                // path from an extension to use for the untitled editor. as such, we
                // have to assume it as an associated resource to use when saving. we
                // do so by setting the `forceUntitled: true` and changing the scheme
                // to a file based one. the untitled editor service takes care to
                // associate the path properly then.
                input = { resource: resource.with({ scheme: pathService.defaultUriScheme }), forceUntitled: true, options, label };
            }
            else {
                // use any other resource as is
                input = { resource, options, label };
            }
            await editorService.openEditor(input, columnToEditorGroup(editorGroupsService, configurationService, column));
        }
        // do not allow to execute commands from here
        else if (matchesScheme(resourceOrString, Schemas.command)) {
            return;
        }
        // finally, delegate to opener service
        else {
            await openerService.open(resourceOrString, { openToSide: context?.sideBySide, editorOptions: context?.editorOptions });
        }
    });
    // partial, renderer-side API command to open diff editor only supporting
    // arguments that do not need to be converted from the extension host
    // complements https://github.com/microsoft/vscode/blob/2b164efb0e6a5de3826bff62683eaeafe032284f/src/vs/workbench/api/common/extHostApiCommands.ts#L397
    CommandsRegistry.registerCommand({
        id: 'vscode.diff',
        handler: (accessor, left, right, label) => {
            accessor.get(ICommandService).executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, left, right, label);
        },
        metadata: {
            description: 'Opens the provided resources in the diff editor to compare their contents.',
            args: [
                { name: 'left', description: 'Left-hand side resource of the diff editor' },
                { name: 'right', description: 'Right-hand side resource of the diff editor' },
                { name: 'title', description: 'Human readable title for the diff editor' },
            ]
        }
    });
    CommandsRegistry.registerCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, async function (accessor, originalResource, modifiedResource, labelAndOrDescription, columnAndOptions, context) {
        const editorService = accessor.get(IEditorService);
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const configurationService = accessor.get(IConfigurationService);
        const [columnArg, optionsArg] = columnAndOptions ?? [];
        const [options, column] = mixinContext(context, optionsArg, columnArg);
        let label = undefined;
        let description = undefined;
        if (typeof labelAndOrDescription === 'string') {
            label = labelAndOrDescription;
        }
        else if (labelAndOrDescription) {
            label = labelAndOrDescription.label;
            description = labelAndOrDescription.description;
        }
        await editorService.openEditor({
            original: { resource: URI.from(originalResource, true) },
            modified: { resource: URI.from(modifiedResource, true) },
            label,
            description,
            options
        }, columnToEditorGroup(editorGroupsService, configurationService, column));
    });
    CommandsRegistry.registerCommand(API_OPEN_WITH_EDITOR_COMMAND_ID, async (accessor, resource, id, columnAndOptions) => {
        const editorService = accessor.get(IEditorService);
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const configurationService = accessor.get(IConfigurationService);
        const [columnArg, optionsArg] = columnAndOptions ?? [];
        await editorService.openEditor({ resource: URI.from(resource, true), options: { pinned: true, ...optionsArg, override: id } }, columnToEditorGroup(editorGroupsService, configurationService, columnArg));
    });
    // partial, renderer-side API command to open diff editor only supporting
    // arguments that do not need to be converted from the extension host
    // complements https://github.com/microsoft/vscode/blob/2b164efb0e6a5de3826bff62683eaeafe032284f/src/vs/workbench/api/common/extHostApiCommands.ts#L397
    CommandsRegistry.registerCommand({
        id: 'vscode.changes',
        handler: (accessor, title, resources) => {
            accessor.get(ICommandService).executeCommand('_workbench.changes', title, resources);
        },
        metadata: {
            description: 'Opens a list of resources in the changes editor to compare their contents.',
            args: [
                { name: 'title', description: 'Human readable title for the diff editor' },
                { name: 'resources', description: 'List of resources to open in the changes editor' }
            ]
        }
    });
    CommandsRegistry.registerCommand('_workbench.changes', async (accessor, title, resources) => {
        const editorService = accessor.get(IEditorService);
        const editor = [];
        for (const [label, original, modified] of resources) {
            editor.push({
                resource: URI.revive(label),
                original: { resource: URI.revive(original) },
                modified: { resource: URI.revive(modified) },
            });
        }
        await editorService.openEditor({ resources: editor, label: title });
    });
    CommandsRegistry.registerCommand('_workbench.openMultiDiffEditor', async (accessor, options) => {
        const editorService = accessor.get(IEditorService);
        const resources = options.resources?.map(r => ({ original: { resource: URI.revive(r.originalUri) }, modified: { resource: URI.revive(r.modifiedUri) } }));
        const revealUri = options.reveal?.modifiedUri ? URI.revive(options.reveal.modifiedUri) : undefined;
        const revealResource = revealUri && resources ? resources.find(r => isEqual(r.modified.resource, revealUri)) : undefined;
        if (options.reveal && !revealResource) {
            console.error('Reveal resource not found');
        }
        const multiDiffEditorOptions = {
            viewState: revealResource ? {
                revealData: {
                    resource: {
                        original: revealResource.original.resource,
                        modified: revealResource.modified.resource,
                    },
                    range: options.reveal?.range,
                }
            } : undefined
        };
        await editorService.openEditor({
            multiDiffSource: options.multiDiffSourceUri ? URI.revive(options.multiDiffSourceUri) : undefined,
            resources,
            label: options.title,
            options: multiDiffEditorOptions,
        });
    });
}
function registerOpenEditorAtIndexCommands() {
    const openEditorAtIndex = (accessor, editorIndex) => {
        const editorService = accessor.get(IEditorService);
        const activeEditorPane = editorService.activeEditorPane;
        if (activeEditorPane && typeof editorIndex === 'number') {
            const editor = activeEditorPane.group.getEditorByIndex(editorIndex);
            if (editor) {
                editorService.openEditor(editor);
            }
        }
    };
    // This command takes in the editor index number to open as an argument
    CommandsRegistry.registerCommand({
        id: OPEN_EDITOR_AT_INDEX_COMMAND_ID,
        handler: openEditorAtIndex
    });
    // Keybindings to focus a specific index in the tab folder if tabs are enabled
    for (let i = 0; i < 9; i++) {
        const editorIndex = i;
        const visibleIndex = i + 1;
        KeybindingsRegistry.registerCommandAndKeybindingRule({
            id: OPEN_EDITOR_AT_INDEX_COMMAND_ID + visibleIndex,
            weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            when: undefined,
            primary: 512 /* KeyMod.Alt */ | toKeyCode(visibleIndex),
            mac: { primary: 256 /* KeyMod.WinCtrl */ | toKeyCode(visibleIndex) },
            handler: accessor => openEditorAtIndex(accessor, editorIndex)
        });
    }
    function toKeyCode(index) {
        switch (index) {
            case 0: return 21 /* KeyCode.Digit0 */;
            case 1: return 22 /* KeyCode.Digit1 */;
            case 2: return 23 /* KeyCode.Digit2 */;
            case 3: return 24 /* KeyCode.Digit3 */;
            case 4: return 25 /* KeyCode.Digit4 */;
            case 5: return 26 /* KeyCode.Digit5 */;
            case 6: return 27 /* KeyCode.Digit6 */;
            case 7: return 28 /* KeyCode.Digit7 */;
            case 8: return 29 /* KeyCode.Digit8 */;
            case 9: return 30 /* KeyCode.Digit9 */;
        }
        throw new Error('invalid index');
    }
}
function registerFocusEditorGroupAtIndexCommands() {
    // Keybindings to focus a specific group (2-8) in the editor area
    for (let groupIndex = 1; groupIndex < 8; groupIndex++) {
        KeybindingsRegistry.registerCommandAndKeybindingRule({
            id: toCommandId(groupIndex),
            weight: 200 /* KeybindingWeight.WorkbenchContrib */,
            when: undefined,
            primary: 2048 /* KeyMod.CtrlCmd */ | toKeyCode(groupIndex),
            handler: accessor => {
                const editorGroupsService = accessor.get(IEditorGroupsService);
                const configurationService = accessor.get(IConfigurationService);
                // To keep backwards compatibility (pre-grid), allow to focus a group
                // that does not exist as long as it is the next group after the last
                // opened group. Otherwise we return.
                if (groupIndex > editorGroupsService.count) {
                    return;
                }
                // Group exists: just focus
                const groups = editorGroupsService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */);
                if (groups[groupIndex]) {
                    return groups[groupIndex].focus();
                }
                // Group does not exist: create new by splitting the active one of the last group
                const direction = preferredSideBySideGroupDirection(configurationService);
                const lastGroup = editorGroupsService.findGroup({ location: 1 /* GroupLocation.LAST */ });
                if (!lastGroup) {
                    return;
                }
                const newGroup = editorGroupsService.addGroup(lastGroup, direction);
                // Focus
                newGroup.focus();
            }
        });
    }
    function toCommandId(index) {
        switch (index) {
            case 1: return 'workbench.action.focusSecondEditorGroup';
            case 2: return 'workbench.action.focusThirdEditorGroup';
            case 3: return 'workbench.action.focusFourthEditorGroup';
            case 4: return 'workbench.action.focusFifthEditorGroup';
            case 5: return 'workbench.action.focusSixthEditorGroup';
            case 6: return 'workbench.action.focusSeventhEditorGroup';
            case 7: return 'workbench.action.focusEighthEditorGroup';
        }
        throw new Error('Invalid index');
    }
    function toKeyCode(index) {
        switch (index) {
            case 1: return 23 /* KeyCode.Digit2 */;
            case 2: return 24 /* KeyCode.Digit3 */;
            case 3: return 25 /* KeyCode.Digit4 */;
            case 4: return 26 /* KeyCode.Digit5 */;
            case 5: return 27 /* KeyCode.Digit6 */;
            case 6: return 28 /* KeyCode.Digit7 */;
            case 7: return 29 /* KeyCode.Digit8 */;
        }
        throw new Error('Invalid index');
    }
}
export function splitEditor(editorGroupsService, direction, resolvedContext) {
    if (!resolvedContext.groupedEditors.length) {
        return;
    }
    // Only support splitting from one source group
    const { group, editors } = resolvedContext.groupedEditors[0];
    const preserveFocus = resolvedContext.preserveFocus;
    const newGroup = editorGroupsService.addGroup(group, direction);
    for (const editorToCopy of editors) {
        // Split editor (if it can be split)
        if (editorToCopy && !editorToCopy.hasCapability(8 /* EditorInputCapabilities.Singleton */)) {
            group.copyEditor(editorToCopy, newGroup, { preserveFocus });
        }
    }
    // Focus
    newGroup.focus();
}
function registerSplitEditorCommands() {
    [
        { id: SPLIT_EDITOR_UP, direction: 0 /* GroupDirection.UP */ },
        { id: SPLIT_EDITOR_DOWN, direction: 1 /* GroupDirection.DOWN */ },
        { id: SPLIT_EDITOR_LEFT, direction: 2 /* GroupDirection.LEFT */ },
        { id: SPLIT_EDITOR_RIGHT, direction: 3 /* GroupDirection.RIGHT */ }
    ].forEach(({ id, direction }) => {
        CommandsRegistry.registerCommand(id, function (accessor, ...args) {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            splitEditor(accessor.get(IEditorGroupsService), direction, resolvedContext);
        });
    });
}
function registerCloseEditorCommands() {
    // A special handler for "Close Editor" depending on context
    // - keybindining: do not close sticky editors, rather open the next non-sticky editor
    // - menu: always close editor, even sticky ones
    function closeEditorHandler(accessor, forceCloseStickyEditors, ...args) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        let keepStickyEditors = undefined;
        if (forceCloseStickyEditors) {
            keepStickyEditors = false; // explicitly close sticky editors
        }
        else if (args.length) {
            keepStickyEditors = false; // we have a context, as such this command was used e.g. from the tab context menu
        }
        else {
            keepStickyEditors = editorGroupsService.partOptions.preventPinnedEditorClose === 'keyboard' || editorGroupsService.partOptions.preventPinnedEditorClose === 'keyboardAndMouse'; // respect setting otherwise
        }
        // Skip over sticky editor and select next if we are configured to do so
        if (keepStickyEditors) {
            const activeGroup = editorGroupsService.activeGroup;
            const activeEditor = activeGroup.activeEditor;
            if (activeEditor && activeGroup.isSticky(activeEditor)) {
                // Open next recently active in same group
                const nextNonStickyEditorInGroup = activeGroup.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */, { excludeSticky: true })[0];
                if (nextNonStickyEditorInGroup) {
                    return activeGroup.openEditor(nextNonStickyEditorInGroup);
                }
                // Open next recently active across all groups
                const nextNonStickyEditorInAllGroups = editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */, { excludeSticky: true })[0];
                if (nextNonStickyEditorInAllGroups) {
                    return Promise.resolve(editorGroupsService.getGroup(nextNonStickyEditorInAllGroups.groupId)?.openEditor(nextNonStickyEditorInAllGroups.editor));
                }
            }
        }
        // With context: proceed to close editors as instructed
        const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
        const preserveFocus = resolvedContext.preserveFocus;
        return Promise.all(resolvedContext.groupedEditors.map(async ({ group, editors }) => {
            const editorsToClose = editors.filter(editor => !keepStickyEditors || !group.isSticky(editor));
            await group.closeEditors(editorsToClose, { preserveFocus });
        }));
    }
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: CLOSE_EDITOR_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: 2048 /* KeyMod.CtrlCmd */ | 53 /* KeyCode.KeyW */,
        win: { primary: 2048 /* KeyMod.CtrlCmd */ | 62 /* KeyCode.F4 */, secondary: [2048 /* KeyMod.CtrlCmd */ | 53 /* KeyCode.KeyW */] },
        handler: (accessor, ...args) => {
            return closeEditorHandler(accessor, false, ...args);
        }
    });
    CommandsRegistry.registerCommand(CLOSE_PINNED_EDITOR_COMMAND_ID, (accessor, ...args) => {
        return closeEditorHandler(accessor, true /* force close pinned editors */, ...args);
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 53 /* KeyCode.KeyW */),
        handler: (accessor, ...args) => {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
                await group.closeAllEditors({ excludeSticky: true });
            }));
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: CLOSE_EDITOR_GROUP_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ContextKeyExpr.and(ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext),
        primary: 2048 /* KeyMod.CtrlCmd */ | 53 /* KeyCode.KeyW */,
        win: { primary: 2048 /* KeyMod.CtrlCmd */ | 62 /* KeyCode.F4 */, secondary: [2048 /* KeyMod.CtrlCmd */ | 53 /* KeyCode.KeyW */] },
        handler: (accessor, ...args) => {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            const commandsContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
            if (commandsContext.groupedEditors.length) {
                editorGroupsService.removeGroup(commandsContext.groupedEditors[0].group);
            }
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: CLOSE_SAVED_EDITORS_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 51 /* KeyCode.KeyU */),
        handler: (accessor, ...args) => {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
                await group.closeEditors({ savedOnly: true, excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
            }));
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 50 /* KeyCode.KeyT */ },
        handler: (accessor, ...args) => {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            return Promise.all(resolvedContext.groupedEditors.map(async ({ group, editors }) => {
                const editorsToClose = group.getEditors(1 /* EditorsOrder.SEQUENTIAL */, { excludeSticky: true }).filter(editor => !editors.includes(editor));
                for (const editorToKeep of editors) {
                    if (editorToKeep) {
                        group.pinEditor(editorToKeep);
                    }
                }
                await group.closeEditors(editorsToClose, { preserveFocus: resolvedContext.preserveFocus });
            }));
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: async (accessor, ...args) => {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            if (resolvedContext.groupedEditors.length) {
                const { group, editors } = resolvedContext.groupedEditors[0];
                if (group.activeEditor) {
                    group.pinEditor(group.activeEditor);
                }
                await group.closeEditors({ direction: 1 /* CloseDirection.RIGHT */, except: editors[0], excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
            }
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: REOPEN_WITH_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => {
            return reopenEditorWith(accessor, EditorResolution.PICK, ...args);
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, override, ...args) => {
            return reopenEditorWith(accessor, override ?? EditorResolution.PICK, ...args);
        }
    });
    async function reopenEditorWith(accessor, editorOverride, ...args) {
        const editorService = accessor.get(IEditorService);
        const editorResolverService = accessor.get(IEditorResolverService);
        const telemetryService = accessor.get(ITelemetryService);
        const resolvedContext = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
        const editorReplacements = new Map();
        for (const { group, editors } of resolvedContext.groupedEditors) {
            for (const editor of editors) {
                const untypedEditor = editor.toUntyped();
                if (!untypedEditor) {
                    return; // Resolver can only resolve untyped editors
                }
                untypedEditor.options = { ...editorService.activeEditorPane?.options, override: editorOverride };
                const resolvedEditor = await editorResolverService.resolveEditor(untypedEditor, group);
                if (!isEditorInputWithOptionsAndGroup(resolvedEditor)) {
                    return;
                }
                let editorReplacementsInGroup = editorReplacements.get(group);
                if (!editorReplacementsInGroup) {
                    editorReplacementsInGroup = [];
                    editorReplacements.set(group, editorReplacementsInGroup);
                }
                editorReplacementsInGroup.push({
                    editor: editor,
                    replacement: resolvedEditor.editor,
                    forceReplaceDirty: editor.resource?.scheme === Schemas.untitled,
                    options: resolvedEditor.options
                });
                telemetryService.publicLog2('workbenchEditorReopen', {
                    scheme: editor.resource?.scheme ?? '',
                    ext: editor.resource ? extname(editor.resource) : '',
                    from: editor.editorId ?? '',
                    to: resolvedEditor.editor.editorId ?? ''
                });
            }
        }
        // Replace editor with resolved one and make active
        for (const [group, replacements] of editorReplacements) {
            await group.replaceEditors(replacements);
            await group.openEditor(replacements[0].replacement);
        }
    }
    CommandsRegistry.registerCommand(CLOSE_EDITORS_AND_GROUP_COMMAND_ID, async (accessor, ...args) => {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
        if (resolvedContext.groupedEditors.length) {
            const { group } = resolvedContext.groupedEditors[0];
            await group.closeAllEditors();
            if (group.count === 0 && editorGroupsService.getGroup(group.id) /* could be gone by now */) {
                editorGroupsService.removeGroup(group); // only remove group if it is now empty
            }
        }
    });
}
function registerFocusEditorGroupWihoutWrapCommands() {
    const commands = [
        {
            id: FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID,
            direction: 2 /* GroupDirection.LEFT */
        },
        {
            id: FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID,
            direction: 3 /* GroupDirection.RIGHT */
        },
        {
            id: FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID,
            direction: 0 /* GroupDirection.UP */,
        },
        {
            id: FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID,
            direction: 1 /* GroupDirection.DOWN */
        }
    ];
    for (const command of commands) {
        CommandsRegistry.registerCommand(command.id, async (accessor) => {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            const group = editorGroupsService.findGroup({ direction: command.direction }, editorGroupsService.activeGroup, false) ?? editorGroupsService.activeGroup;
            group.focus();
        });
    }
}
function registerSplitEditorInGroupCommands() {
    async function splitEditorInGroup(accessor, resolvedContext) {
        const instantiationService = accessor.get(IInstantiationService);
        if (!resolvedContext.groupedEditors.length) {
            return;
        }
        const { group, editors } = resolvedContext.groupedEditors[0];
        const editor = editors[0];
        if (!editor) {
            return;
        }
        await group.replaceEditors([{
                editor,
                replacement: instantiationService.createInstance(SideBySideEditorInput, undefined, undefined, editor, editor),
                forceReplaceDirty: true
            }]);
    }
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: SPLIT_EDITOR_IN_GROUP,
                title: localize2('splitEditorInGroup', 'Split Editor in Group'),
                category: Categories.View,
                precondition: ActiveEditorCanSplitInGroupContext,
                f1: true,
                keybinding: {
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    when: ActiveEditorCanSplitInGroupContext,
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 93 /* KeyCode.Backslash */)
                }
            });
        }
        run(accessor, ...args) {
            return splitEditorInGroup(accessor, resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService)));
        }
    });
    async function joinEditorInGroup(resolvedContext) {
        if (!resolvedContext.groupedEditors.length) {
            return;
        }
        const { group, editors } = resolvedContext.groupedEditors[0];
        const editor = editors[0];
        if (!editor) {
            return;
        }
        if (!(editor instanceof SideBySideEditorInput)) {
            return;
        }
        let options = undefined;
        const activeEditorPane = group.activeEditorPane;
        if (activeEditorPane instanceof SideBySideEditor && group.activeEditor === editor) {
            for (const pane of [activeEditorPane.getPrimaryEditorPane(), activeEditorPane.getSecondaryEditorPane()]) {
                if (pane?.hasFocus()) {
                    options = { viewState: pane.getViewState() };
                    break;
                }
            }
        }
        await group.replaceEditors([{
                editor,
                replacement: editor.primary,
                options
            }]);
    }
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: JOIN_EDITOR_IN_GROUP,
                title: localize2('joinEditorInGroup', 'Join Editor in Group'),
                category: Categories.View,
                precondition: SideBySideEditorActiveContext,
                f1: true,
                keybinding: {
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    when: SideBySideEditorActiveContext,
                    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 93 /* KeyCode.Backslash */)
                }
            });
        }
        run(accessor, ...args) {
            return joinEditorInGroup(resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService)));
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: TOGGLE_SPLIT_EDITOR_IN_GROUP,
                title: localize2('toggleJoinEditorInGroup', 'Toggle Split Editor in Group'),
                category: Categories.View,
                precondition: ContextKeyExpr.or(ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext),
                f1: true
            });
        }
        async run(accessor, ...args) {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            if (!resolvedContext.groupedEditors.length) {
                return;
            }
            const { editors } = resolvedContext.groupedEditors[0];
            if (editors[0] instanceof SideBySideEditorInput) {
                await joinEditorInGroup(resolvedContext);
            }
            else if (editors[0]) {
                await splitEditorInGroup(accessor, resolvedContext);
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
                title: localize2('toggleSplitEditorInGroupLayout', 'Toggle Layout of Split Editor in Group'),
                category: Categories.View,
                precondition: SideBySideEditorActiveContext,
                f1: true
            });
        }
        async run(accessor) {
            const configurationService = accessor.get(IConfigurationService);
            const currentSetting = configurationService.getValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING);
            let newSetting;
            if (currentSetting !== 'horizontal') {
                newSetting = 'horizontal';
            }
            else {
                newSetting = 'vertical';
            }
            return configurationService.updateValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING, newSetting);
        }
    });
}
function registerFocusSideEditorsCommands() {
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: FOCUS_FIRST_SIDE_EDITOR,
                title: localize2('focusLeftSideEditor', 'Focus First Side in Active Editor'),
                category: Categories.View,
                precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
                f1: true
            });
        }
        async run(accessor) {
            const editorService = accessor.get(IEditorService);
            const commandService = accessor.get(ICommandService);
            const activeEditorPane = editorService.activeEditorPane;
            if (activeEditorPane instanceof SideBySideEditor) {
                activeEditorPane.getSecondaryEditorPane()?.focus();
            }
            else if (activeEditorPane instanceof TextDiffEditor) {
                await commandService.executeCommand(DIFF_FOCUS_SECONDARY_SIDE);
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: FOCUS_SECOND_SIDE_EDITOR,
                title: localize2('focusRightSideEditor', 'Focus Second Side in Active Editor'),
                category: Categories.View,
                precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
                f1: true
            });
        }
        async run(accessor) {
            const editorService = accessor.get(IEditorService);
            const commandService = accessor.get(ICommandService);
            const activeEditorPane = editorService.activeEditorPane;
            if (activeEditorPane instanceof SideBySideEditor) {
                activeEditorPane.getPrimaryEditorPane()?.focus();
            }
            else if (activeEditorPane instanceof TextDiffEditor) {
                await commandService.executeCommand(DIFF_FOCUS_PRIMARY_SIDE);
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: FOCUS_OTHER_SIDE_EDITOR,
                title: localize2('focusOtherSideEditor', 'Focus Other Side in Active Editor'),
                category: Categories.View,
                precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
                f1: true
            });
        }
        async run(accessor) {
            const editorService = accessor.get(IEditorService);
            const commandService = accessor.get(ICommandService);
            const activeEditorPane = editorService.activeEditorPane;
            if (activeEditorPane instanceof SideBySideEditor) {
                if (activeEditorPane.getPrimaryEditorPane()?.hasFocus()) {
                    activeEditorPane.getSecondaryEditorPane()?.focus();
                }
                else {
                    activeEditorPane.getPrimaryEditorPane()?.focus();
                }
            }
            else if (activeEditorPane instanceof TextDiffEditor) {
                await commandService.executeCommand(DIFF_FOCUS_OTHER_SIDE);
            }
        }
    });
}
function registerOtherEditorCommands() {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: KEEP_EDITOR_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 3 /* KeyCode.Enter */),
        handler: async (accessor, ...args) => {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            for (const { group, editors } of resolvedContext.groupedEditors) {
                for (const editor of editors) {
                    group.pinEditor(editor);
                }
            }
        }
    });
    CommandsRegistry.registerCommand({
        id: TOGGLE_KEEP_EDITORS_COMMAND_ID,
        handler: accessor => {
            const configurationService = accessor.get(IConfigurationService);
            const currentSetting = configurationService.getValue('workbench.editor.enablePreview');
            const newSetting = currentSetting !== true;
            configurationService.updateValue('workbench.editor.enablePreview', newSetting);
        }
    });
    function setEditorGroupLock(accessor, locked, ...args) {
        const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
        const group = resolvedContext.groupedEditors[0]?.group;
        group?.lock(locked ?? !group.isLocked);
    }
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: TOGGLE_LOCK_GROUP_COMMAND_ID,
                title: localize2('toggleEditorGroupLock', 'Toggle Editor Group Lock'),
                category: Categories.View,
                f1: true
            });
        }
        async run(accessor, ...args) {
            setEditorGroupLock(accessor, undefined, ...args);
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: LOCK_GROUP_COMMAND_ID,
                title: localize2('lockEditorGroup', 'Lock Editor Group'),
                category: Categories.View,
                precondition: ActiveEditorGroupLockedContext.toNegated(),
                f1: true
            });
        }
        async run(accessor, ...args) {
            setEditorGroupLock(accessor, true, ...args);
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: UNLOCK_GROUP_COMMAND_ID,
                title: localize2('unlockEditorGroup', 'Unlock Editor Group'),
                precondition: ActiveEditorGroupLockedContext,
                category: Categories.View,
                f1: true
            });
        }
        async run(accessor, ...args) {
            setEditorGroupLock(accessor, false, ...args);
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: PIN_EDITOR_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ActiveEditorStickyContext.toNegated(),
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */),
        handler: async (accessor, ...args) => {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            for (const { group, editors } of resolvedContext.groupedEditors) {
                for (const editor of editors) {
                    group.stickEditor(editor);
                }
            }
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: UNPIN_EDITOR_COMMAND_ID,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: ActiveEditorStickyContext,
        primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */),
        handler: async (accessor, ...args) => {
            const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
            for (const { group, editors } of resolvedContext.groupedEditors) {
                for (const editor of editors) {
                    group.unstickEditor(editor);
                }
            }
        }
    });
    KeybindingsRegistry.registerCommandAndKeybindingRule({
        id: SHOW_EDITORS_IN_GROUP,
        weight: 200 /* KeybindingWeight.WorkbenchContrib */,
        when: undefined,
        primary: undefined,
        handler: (accessor, ...args) => {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            const quickInputService = accessor.get(IQuickInputService);
            const commandsContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
            const group = commandsContext.groupedEditors[0]?.group;
            if (group) {
                editorGroupsService.activateGroup(group); // we need the group to be active
            }
            return quickInputService.quickAccess.show(ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX);
        }
    });
}
function registerModalEditorCommands() {
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
                title: localize2('moveToMainWindow', 'Open Modal Editor in Main Window'),
                category: Categories.View,
                f1: true,
                icon: Codicon.openInProduct,
                precondition: EditorPartModalContext,
                menu: {
                    id: MenuId.ModalEditorTitle,
                    group: 'navigation',
                    order: 0,
                    when: IsSessionsWindowContext.negate()
                }
            });
        }
        async run(accessor) {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            for (const part of editorGroupsService.parts) {
                if (isModalEditorPart(part)) {
                    await part.close({ mergeAllEditorsToMainPart: true });
                    break;
                }
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
                title: localize2('moveModalEditorToWindow', 'Open Modal Editor in New Window'),
                category: Categories.View,
                f1: true,
                icon: Codicon.emptyWindow,
                precondition: EditorPartModalContext,
                menu: {
                    id: MenuId.ModalEditorTitle,
                    group: 'navigation',
                    order: 0,
                    when: IsSessionsWindowContext
                }
            });
        }
        async run(accessor) {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            for (const part of editorGroupsService.parts) {
                if (isModalEditorPart(part)) {
                    const auxiliaryEditorPart = await editorGroupsService.createAuxiliaryEditorPart();
                    for (const group of part.getGroups(1 /* GroupsOrder.MOST_RECENTLY_ACTIVE */)) {
                        group.moveEditors(group.editors.map(editor => ({ editor, options: { preserveFocus: true } })), auxiliaryEditorPart.activeGroup);
                    }
                    auxiliaryEditorPart.activeGroup.focus();
                    await part.close();
                    break;
                }
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID,
                title: localize2('toggleModalEditorSidebar', 'Toggle Modal Editor Sidebar'),
                category: Categories.View,
                f1: true,
                precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalSidebarContext),
            });
        }
        run(accessor) {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            for (const part of editorGroupsService.parts) {
                if (isModalEditorPart(part)) {
                    part.toggleSidebar();
                    break;
                }
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
                title: localize2('toggleModalEditorMaximized', 'Maximize Modal Editor'),
                category: Categories.View,
                f1: true,
                precondition: EditorPartModalContext,
                icon: Codicon.screenFull,
                toggled: {
                    condition: EditorPartModalMaximizedContext,
                    title: localize('restoreModalEditorSize', "Restore Modal Editor")
                },
                menu: {
                    id: MenuId.ModalEditorTitle,
                    group: 'navigation',
                    order: 1
                }
            });
        }
        run(accessor) {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            for (const part of editorGroupsService.parts) {
                if (isModalEditorPart(part)) {
                    part.toggleMaximized();
                    break;
                }
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: CLOSE_MODAL_EDITOR_COMMAND_ID,
                title: localize2('closeModalEditor', 'Close Modal Editor'),
                category: Categories.View,
                f1: true,
                icon: Codicon.close,
                precondition: EditorPartModalContext,
                keybinding: [{
                        primary: 9 /* KeyCode.Escape */,
                        weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10, // higher when no text editor is focused...
                        when: EditorContextKeys.focus.toNegated()
                    }, {
                        primary: 9 /* KeyCode.Escape */,
                        weight: 100 /* KeybindingWeight.EditorContrib */ - 1, // ...lower to prevent accidental close when text editor is focused
                        when: EditorContextKeys.focus
                    }],
                menu: {
                    id: MenuId.ModalEditorTitle,
                    group: 'navigation',
                    order: 2
                }
            });
        }
        async run(accessor) {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            for (const part of editorGroupsService.parts) {
                if (isModalEditorPart(part)) {
                    await part.close();
                    break;
                }
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
                title: localize2('navigateModalEditorPrevious', 'Navigate to Previous Item in Modal Editor'),
                category: Categories.View,
                precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext),
                keybinding: {
                    primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                    when: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext)
                }
            });
        }
        run(accessor) {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            for (const part of editorGroupsService.parts) {
                if (isModalEditorPart(part)) {
                    const nav = part.navigation;
                    if (nav && nav.current > 0) {
                        nav.navigate(nav.current - 1);
                    }
                    break;
                }
            }
        }
    });
    registerAction2(class extends Action2 {
        constructor() {
            super({
                id: NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
                title: localize2('navigateModalEditorNext', 'Navigate to Next Item in Modal Editor'),
                category: Categories.View,
                precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext),
                keybinding: {
                    primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                    when: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext)
                }
            });
        }
        run(accessor) {
            const editorGroupsService = accessor.get(IEditorGroupsService);
            for (const part of editorGroupsService.parts) {
                if (isModalEditorPart(part)) {
                    const nav = part.navigation;
                    if (nav && nav.current < nav.total - 1) {
                        nav.navigate(nav.current + 1);
                    }
                    break;
                }
            }
        }
    });
}
function isModalEditorPart(obj) {
    const part = obj;
    return !!part
        && typeof part.close === 'function'
        && typeof part.onWillClose === 'function'
        && typeof part.toggleMaximized === 'function'
        && typeof part.maximized === 'boolean'
        && typeof part.updateOptions === 'function'
        && !!part.modalElement
        && part.windowId === mainWindow.vscodeWindowId;
}
export function setup() {
    registerEditorMoveCopyCommand();
    registerEditorGroupsLayoutCommands();
    registerDiffEditorCommands();
    registerOpenEditorAPICommands();
    registerOpenEditorAtIndexCommands();
    registerCloseEditorCommands();
    registerOtherEditorCommands();
    registerSplitEditorInGroupCommands();
    registerFocusSideEditorsCommands();
    registerFocusEditorGroupAtIndexCommands();
    registerSplitEditorCommands();
    registerFocusEditorGroupWihoutWrapCommands();
    registerModalEditorCommands();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQ29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBbUIsTUFBTSxxQ0FBcUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBbUIsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBNEQsTUFBTSw4Q0FBOEMsQ0FB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O0FBQ3pFLE1BQU0sQ0FBQyxNQUFNLG1DQUFtQyxHQUFHLGlEQUFpRCxDQUFDO0FBRXJHLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLHVDQUF1QyxDQUFDO0FBQy9FLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLHdDQUF3QyxDQUFDO0FBQ2pGLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLHVDQUF1QyxDQUFDO0FBRS9FLE1BQU0sQ0FBQyxNQUFNLHdDQUF3QyxHQUFHLDRDQUE0QyxDQUFDO0FBQ3JHLE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHLDZDQUE2QyxDQUFDO0FBQ3ZHLE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHLDZDQUE2QyxDQUFDO0FBQ3ZHLE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHLDZDQUE2QyxDQUFDO0FBRXZHLE1BQU0sQ0FBQyxNQUFNLCtCQUErQixHQUFHLG9DQUFvQyxDQUFDO0FBRXBGLE1BQU0sQ0FBQyxNQUFNLHNDQUFzQyxHQUFHLHdDQUF3QyxDQUFDO0FBQy9GLE1BQU0sQ0FBQyxNQUFNLHNDQUFzQyxHQUFHLHdDQUF3QyxDQUFDO0FBRS9GLE1BQU0sQ0FBQyxNQUFNLDRDQUE0QyxHQUFHLDZDQUE2QyxDQUFDO0FBQzFHLE1BQU0sQ0FBQyxNQUFNLDRDQUE0QyxHQUFHLDZDQUE2QyxDQUFDO0FBRTFHLE1BQU0sQ0FBQyxNQUFNLGtDQUFrQyxHQUFHLHVDQUF1QyxDQUFDO0FBRTFGLE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLG1DQUFtQyxDQUFDO0FBQ2pGLE1BQU0sQ0FBQyxNQUFNLG9DQUFvQyxHQUFHLHdDQUF3QyxDQUFDO0FBQzdGLE1BQU0sQ0FBQyxNQUFNLHNDQUFzQyxHQUFHLDBDQUEwQyxDQUFDO0FBQ2pHLE1BQU0sQ0FBQyxNQUFNLHdDQUF3QyxHQUFHLDZDQUE2QyxDQUFDO0FBQ3RHLE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHLDhDQUE4QyxDQUFDO0FBQ3hHLE1BQU0sQ0FBQyxNQUFNLHFDQUFxQyxHQUFHLDBDQUEwQyxDQUFD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