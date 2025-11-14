/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Schemas, matchesScheme } from '../../../../base/common/network.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { isNumber, isObject, isString, isUndefined } from '../../../../base/common/types.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandHandler, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorResolution, IEditorOptions, IResourceEditorInput, ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService, IOpenEvent } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess } from './editorQuickAccess.js';
import { SideBySideEditor } from './sideBySideEditor.js';
import { TextDiffEditor } from './textDiffEditor.js';
import { ActiveEditorCanSplitInGroupContext, ActiveEditorGroupEmptyContext, ActiveEditorGroupLockedContext, ActiveEditorStickyContext, MultipleEditorGroupsContext, SideBySideEditorActiveContext, TextCompareEditorActiveContext } from '../../../common/contextkeys.js';
import { CloseDirection, EditorInputCapabilities, EditorsOrder, IResourceDiffEditorInput, IUntitledTextResourceEditorInput, isEditorInputWithOptionsAndGroup } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { EditorGroupColumn, columnToEditorGroup } from '../../../services/editor/common/editorGroupColumn.js';
import { EditorGroupLayout, GroupDirection, GroupLocation, GroupsOrder, IEditorGroup, IEditorGroupsService, IEditorReplacement, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IUntitledTextEditorService } from '../../../services/untitled/common/untitledTextEditorService.js';
import { DIFF_FOCUS_OTHER_SIDE, DIFF_FOCUS_PRIMARY_SIDE, DIFF_FOCUS_SECONDARY_SIDE, registerDiffEditorCommands } from './diffEditorCommands.js';
import { IResolvedEditorCommandsContext, resolveCommandsContext } from './editorCommandsContext.js';
import { prepareMoveCopyEditors } from './editor.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IMultiDiffEditorOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';

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

export interface SelectedEditorsMoveCopyArguments {
	to?: 'first' | 'last' | 'left' | 'right' | 'up' | 'down' | 'center' | 'position' | 'previous' | 'next';
	by?: 'tab' | 'group';
	value?: number;
}

const isSelectedEditorsMoveCopyArg = function (arg: SelectedEditorsMoveCopyArguments): boolean {
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

function registerActiveEditorMoveCopyCommand(): void {

	const moveCopyJSONSchema: IJSONSchema = {
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
		weight: KeybindingWeight.WorkbenchContrib,
		when: EditorContextKeys.editorTextFocus,
		primary: 0,
		handler: (accessor, args) => moveCopySelectedEditors(true, args as SelectedEditorsMoveCopyArguments | undefined, accessor),
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
		weight: KeybindingWeight.WorkbenchContrib,
		when: EditorContextKeys.editorTextFocus,
		primary: 0,
		handler: (accessor, args) => moveCopySelectedEditors(false, args as SelectedEditorsMoveCopyArguments | undefined, accessor),
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

	function moveCopySelectedEditors(isMove: boolean, args: SelectedEditorsMoveCopyArguments = Object.create(null), accessor: ServicesAccessor): void {
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
					return moveCopyActiveEditorToGroup(isMove, args, activeGroup, selectedEditors, accessor);
			}
		}
	}

	function moveTabs(args: SelectedEditorsMoveCopyArguments, group: IEditorGroup, editors: EditorInput[]): void {
		const to = args.to;
		if (to === 'first' || to === 'right') {
			editors = [...editors].reverse();
		} else if (to === 'position' && (args.value ?? 1) < group.getIndexOfEditor(editors[0])) {
			editors = [...editors].reverse();
		}

		for (const editor of editors) {
			moveTab(args, group, editor);
		}
	}

	function moveTab(args: SelectedEditorsMoveCopyArguments, group: IEditorGroup, editor: EditorInput): void {
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

	function moveCopyActiveEditorToGroup(isMove: boolean, args: SelectedEditorsMoveCopyArguments, sourceGroup: IEditorGroup, editors: EditorInput[], accessor: ServicesAccessor): void {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const configurationService = accessor.get(IConfigurationService);

		let targetGroup: IEditorGroup | undefined;

		switch (args.to) {
			case 'left':
				targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.LEFT }, sourceGroup);
				if (!targetGroup) {
					targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.LEFT);
				}
				break;
			case 'right':
				targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.RIGHT }, sourceGroup);
				if (!targetGroup) {
					targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.RIGHT);
				}
				break;
			case 'up':
				targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.UP }, sourceGroup);
				if (!targetGroup) {
					targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.UP);
				}
				break;
			case 'down':
				targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.DOWN }, sourceGroup);
				if (!targetGroup) {
					targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.DOWN);
				}
				break;
			case 'first':
				targetGroup = editorGroupsService.findGroup({ location: GroupLocation.FIRST }, sourceGroup);
				break;
			case 'last':
				targetGroup = editorGroupsService.findGroup({ location: GroupLocation.LAST }, sourceGroup);
				break;
			case 'previous':
				targetGroup = editorGroupsService.findGroup({ location: GroupLocation.PREVIOUS }, sourceGroup);
				if (!targetGroup) {
					const oppositeDirection = preferredSideBySideGroupDirection(configurationService) === GroupDirection.RIGHT ? GroupDirection.LEFT : GroupDirection.UP;
					targetGroup = editorGroupsService.addGroup(sourceGroup, oppositeDirection);
				}
				break;
			case 'next':
				targetGroup = editorGroupsService.findGroup({ location: GroupLocation.NEXT }, sourceGroup);
				if (!targetGroup) {
					targetGroup = editorGroupsService.addGroup(sourceGroup, preferredSideBySideGroupDirection(configurationService));
				}
				break;
			case 'center':
				targetGroup = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)[(editorGroupsService.count / 2) - 1];
				break;
			case 'position':
				targetGroup = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)[(args.value ?? 1) - 1];
				break;
		}

		if (targetGroup) {
			const editorsWithOptions = prepareMoveCopyEditors(sourceGroup, editors);
			if (isMove) {
				sourceGroup.moveEditors(editorsWithOptions, targetGroup);
			} else if (sourceGroup.id !== targetGroup.id) {
				sourceGroup.copyEditors(editorsWithOptions, targetGroup);
			}

			targetGroup.focus();
		}
	}
}

function registerEditorGroupsLayoutCommands(): void {

	function applyEditorLayout(accessor: ServicesAccessor, layout: EditorGroupLayout): void {
		if (!layout || typeof layout !== 'object') {
			return;
		}

		const editorGroupsService = accessor.get(IEditorGroupsService);
		editorGroupsService.applyLayout(layout);
	}

	CommandsRegistry.registerCommand(LAYOUT_EDITOR_GROUPS_COMMAND_ID, (accessor: ServicesAccessor, args: EditorGroupLayout) => {
		applyEditorLayout(accessor, args);
	});

	// API Commands
	CommandsRegistry.registerCommand({
		id: 'vscode.setEditorLayout',
		handler: (accessor: ServicesAccessor, args: EditorGroupLayout) => applyEditorLayout(accessor, args),
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
		handler: (accessor: ServicesAccessor) => {
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

function registerOpenEditorAPICommands(): void {

	function mixinContext(context: IOpenEvent<unknown> | undefined, options: ITextEditorOptions | undefined, column: EditorGroupColumn | undefined): [ITextEditorOptions | undefined, EditorGroupColumn | undefined] {
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

	CommandsRegistry.registerCommand(API_OPEN_EDITOR_COMMAND_ID, async function (accessor: ServicesAccessor, resourceArg: UriComponents | string, columnAndOptions?: [EditorGroupColumn?, ITextEditorOptions?], label?: string, context?: IOpenEvent<unknown>) {
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

			let input: IResourceEditorInput | IUntitledTextResourceEditorInput;
			if (untitledTextEditorService.isUntitledWithAssociatedResource(resource)) {
				// special case for untitled: we are getting a resource with meaningful
				// path from an extension to use for the untitled editor. as such, we
				// have to assume it as an associated resource to use when saving. we
				// do so by setting the `forceUntitled: true` and changing the scheme
				// to a file based one. the untitled editor service takes care to
				// associate the path properly then.
				input = { resource: resource.with({ scheme: pathService.defaultUriScheme }), forceUntitled: true, options, label };
			} else {
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

	CommandsRegistry.registerCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, async function (accessor: ServicesAccessor, originalResource: UriComponents, modifiedResource: UriComponents, labelAndOrDescription?: string | { label: string; description: string }, columnAndOptions?: [EditorGroupColumn?, ITextEditorOptions?], context?: IOpenEvent<unknown>) {
		const editorService = accessor.get(IEditorService);
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const configurationService = accessor.get(IConfigurationService);

		const [columnArg, optionsArg] = columnAndOptions ?? [];
		const [options, column] = mixinContext(context, optionsArg, columnArg);

		let label: string | undefined = undefined;
		let description: string | undefined = undefined;
		if (typeof labelAndOrDescription === 'string') {
			label = labelAndOrDescription;
		} else if (labelAndOrDescription) {
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

	CommandsRegistry.registerCommand(API_OPEN_WITH_EDITOR_COMMAND_ID, async (accessor: ServicesAccessor, resource: UriComponents, id: string, columnAndOptions?: [EditorGroupColumn?, ITextEditorOptions?]) => {
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
		handler: (accessor, title: string, resources: [UriComponents, UriComponents?, UriComponents?][]) => {
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

	CommandsRegistry.registerCommand('_workbench.changes', async (accessor: ServicesAccessor, title: string, resources: [UriComponents, UriComponents?, UriComponents?][]) => {
		const editorService = accessor.get(IEditorService);

		const editor: (IResourceDiffEditorInput & { resource: URI })[] = [];
		for (const [label, original, modified] of resources) {
			editor.push({
				resource: URI.revive(label),
				original: { resource: URI.revive(original) },
				modified: { resource: URI.revive(modified) },
			});
		}

		await editorService.openEditor({ resources: editor, label: title });
	});

	CommandsRegistry.registerCommand('_workbench.openMultiDiffEditor', async (accessor: ServicesAccessor, options: OpenMultiFileDiffEditorOptions) => {
		const editorService = accessor.get(IEditorService);

		const resources = options.resources?.map(r => ({ original: { resource: URI.revive(r.originalUri) }, modified: { resource: URI.revive(r.modifiedUri) } }));

		const revealUri = options.reveal?.modifiedUri ? URI.revive(options.reveal.modifiedUri) : undefined;
		const revealResource = revealUri && resources ? resources.find(r => isEqual(r.modified.resource, revealUri)) : undefined;
		if (options.reveal && !revealResource) {
			console.error('Reveal resource not found');
		}

		const multiDiffEditorOptions: IMultiDiffEditorOptions = {
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

interface OpenMultiFileDiffEditorOptions {
	title: string;
	multiDiffSourceUri?: UriComponents;
	resources?: { originalUri: UriComponents; modifiedUri: UriComponents }[];
	reveal?: {
		modifiedUri: UriComponents;
		range?: IRange;
	};
}

function registerOpenEditorAtIndexCommands(): void {
	const openEditorAtIndex: ICommandHandler = (accessor: ServicesAccessor, editorIndex: unknown): void => {
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
			weight: KeybindingWeight.WorkbenchContrib,
			when: undefined,
			primary: KeyMod.Alt | toKeyCode(visibleIndex),
			mac: { primary: KeyMod.WinCtrl | toKeyCode(visibleIndex) },
			handler: accessor => openEditorAtIndex(accessor, editorIndex)
		});
	}

	function toKeyCode(index: number): KeyCode {
		switch (index) {
			case 0: return KeyCode.Digit0;
			case 1: return KeyCode.Digit1;
			case 2: return KeyCode.Digit2;
			case 3: return KeyCode.Digit3;
			case 4: return KeyCode.Digit4;
			case 5: return KeyCode.Digit5;
			case 6: return KeyCode.Digit6;
			case 7: return KeyCode.Digit7;
			case 8: return KeyCode.Digit8;
			case 9: return KeyCode.Digit9;
		}

		throw new Error('invalid index');
	}
}

function registerFocusEditorGroupAtIndexCommands(): void {

	// Keybindings to focus a specific group (2-8) in the editor area
	for (let groupIndex = 1; groupIndex < 8; groupIndex++) {
		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: toCommandId(groupIndex),
			weight: KeybindingWeight.WorkbenchContrib,
			when: undefined,
			primary: KeyMod.CtrlCmd | toKeyCode(groupIndex),
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
				const groups = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);
				if (groups[groupIndex]) {
					return groups[groupIndex].focus();
				}

				// Group does not exist: create new by splitting the active one of the last group
				const direction = preferredSideBySideGroupDirection(configurationService);
				const lastGroup = editorGroupsService.findGroup({ location: GroupLocation.LAST });
				if (!lastGroup) {
					return;
				}

				const newGroup = editorGroupsService.addGroup(lastGroup, direction);

				// Focus
				newGroup.focus();
			}
		});
	}

	function toCommandId(index: number): string {
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

	function toKeyCode(index: number): KeyCode {
		switch (index) {
			case 1: return KeyCode.Digit2;
			case 2: return KeyCode.Digit3;
			case 3: return KeyCode.Digit4;
			case 4: return KeyCode.Digit5;
			case 5: return KeyCode.Digit6;
			case 6: return KeyCode.Digit7;
			case 7: return KeyCode.Digit8;
		}

		throw new Error('Invalid index');
	}
}

export function splitEditor(editorGroupsService: IEditorGroupsService, direction: GroupDirection, resolvedContext: IResolvedEditorCommandsContext): void {
	if (!resolvedContext.groupedEditors.length) {
		return;
	}

	// Only support splitting from one source group
	const { group, editors } = resolvedContext.groupedEditors[0];
	const preserveFocus = resolvedContext.preserveFocus;
	const newGroup = editorGroupsService.addGroup(group, direction);

	for (const editorToCopy of editors) {
		// Split editor (if it can be split)
		if (editorToCopy && !editorToCopy.hasCapability(EditorInputCapabilities.Singleton)) {
			group.copyEditor(editorToCopy, newGroup, { preserveFocus });
		}
	}

	// Focus
	newGroup.focus();
}

function registerSplitEditorCommands() {
	[
		{ id: SPLIT_EDITOR_UP, direction: GroupDirection.UP },
		{ id: SPLIT_EDITOR_DOWN, direction: GroupDirection.DOWN },
		{ id: SPLIT_EDITOR_LEFT, direction: GroupDirection.LEFT },
		{ id: SPLIT_EDITOR_RIGHT, direction: GroupDirection.RIGHT }
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
	function closeEditorHandler(accessor: ServicesAccessor, forceCloseStickyEditors: boolean, ...args: unknown[]): Promise<unknown> {
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const editorService = accessor.get(IEditorService);

		let keepStickyEditors: boolean | undefined = undefined;
		if (forceCloseStickyEditors) {
			keepStickyEditors = false; // explicitly close sticky editors
		} else if (args.length) {
			keepStickyEditors = false; // we have a context, as such this command was used e.g. from the tab context menu
		} else {
			keepStickyEditors = editorGroupsService.partOptions.preventPinnedEditorClose === 'keyboard' || editorGroupsService.partOptions.preventPinnedEditorClose === 'keyboardAndMouse'; // respect setting otherwise
		}

		// Skip over sticky editor and select next if we are configured to do so
		if (keepStickyEditors) {
			const activeGroup = editorGroupsService.activeGroup;
			const activeEditor = activeGroup.activeEditor;

			if (activeEditor && activeGroup.isSticky(activeEditor)) {

				// Open next recently active in same group
				const nextNonStickyEditorInGroup = activeGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true })[0];
				if (nextNonStickyEditorInGroup) {
					return activeGroup.openEditor(nextNonStickyEditorInGroup);
				}

				// Open next recently active across all groups
				const nextNonStickyEditorInAllGroups = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true })[0];
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
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: KeyMod.CtrlCmd | KeyCode.KeyW,
		win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
		handler: (accessor, ...args: unknown[]) => {
			return closeEditorHandler(accessor, false, ...args);
		}
	});

	CommandsRegistry.registerCommand(CLOSE_PINNED_EDITOR_COMMAND_ID, (accessor, ...args: unknown[]) => {
		return closeEditorHandler(accessor, true /* force close pinned editors */, ...args);
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyW),
		handler: (accessor, ...args: unknown[]) => {
			const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
			return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
				await group.closeAllEditors({ excludeSticky: true });
			}));
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_EDITOR_GROUP_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext),
		primary: KeyMod.CtrlCmd | KeyCode.KeyW,
		win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
		handler: (accessor, ...args: unknown[]) => {
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const commandsContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));

			if (commandsContext.groupedEditors.length) {
				editorGroupsService.removeGroup(commandsContext.groupedEditors[0].group);
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_SAVED_EDITORS_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyU),
		handler: (accessor, ...args: unknown[]) => {
			const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
			return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
				await group.closeEditors({ savedOnly: true, excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
			}));
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyT },
		handler: (accessor, ...args: unknown[]) => {
			const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));

			return Promise.all(resolvedContext.groupedEditors.map(async ({ group, editors }) => {
				const editorsToClose = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).filter(editor => !editors.includes(editor));

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
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: async (accessor, ...args: unknown[]) => {
			const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
			if (resolvedContext.groupedEditors.length) {
				const { group, editors } = resolvedContext.groupedEditors[0];
				if (group.activeEditor) {
					group.pinEditor(group.activeEditor);
				}

				await group.closeEditors({ direction: CloseDirection.RIGHT, except: editors[0], excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
			}
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: REOPEN_WITH_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: (accessor, ...args: unknown[]) => {
			return reopenEditorWith(accessor, EditorResolution.PICK, ...args);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: (accessor, override?: string, ...args: unknown[]) => {
			return reopenEditorWith(accessor, override ?? EditorResolution.PICK, ...args);
		}
	});

	async function reopenEditorWith(accessor: ServicesAccessor, editorOverride: string | EditorResolution, ...args: unknown[]) {
		const editorService = accessor.get(IEditorService);
		const editorResolverService = accessor.get(IEditorResolverService);
		const telemetryService = accessor.get(ITelemetryService);

		const resolvedContext = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
		const editorReplacements = new Map<IEditorGroup, IEditorReplacement[]>();

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

				// Telemetry
				type WorkbenchEditorReopenClassification = {
					owner: 'rebornix';
					comment: 'Identify how a document is reopened';
					scheme: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'File system provider scheme for the resource' };
					ext: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'File extension for the resource' };
					from: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The editor view type the resource is switched from' };
					to: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The editor view type the resource is switched to' };
				};

				type WorkbenchEditorReopenEvent = {
					scheme: string;
					ext: string;
					from: string;
					to: string;
				};

				telemetryService.publicLog2<WorkbenchEditorReopenEvent, WorkbenchEditorReopenClassification>('workbenchEditorReopen', {
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

	CommandsRegistry.registerCommand(CLOSE_EDITORS_AND_GROUP_COMMAND_ID, async (accessor: ServicesAccessor, ...args: unknown[]) => {
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

function registerFocusEditorGroupWihoutWrapCommands(): void {

	const commands = [
		{
			id: FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID,
			direction: GroupDirection.LEFT
		},
		{
			id: FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID,
			direction: GroupDirection.RIGHT
		},
		{
			id: FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID,
			direction: GroupDirection.UP,
		},
		{
			id: FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID,
			direction: GroupDirection.DOWN
		}
	];

	for (const command of commands) {
		CommandsRegistry.registerCommand(command.id, async (accessor: ServicesAccessor) => {
			const editorGroupsService = accessor.get(IEditorGroupsService);

			const group = editorGroupsService.findGroup({ direction: command.direction }, editorGroupsService.activeGroup, false) ?? editorGroupsService.activeGroup;
			group.focus();
		});
	}
}

function registerSplitEditorInGroupCommands(): void {

	async function splitEditorInGroup(accessor: ServicesAccessor, resolvedContext: IResolvedEditorCommandsContext): Promise<void> {
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
					weight: KeybindingWeight.WorkbenchContrib,
					when: ActiveEditorCanSplitInGroupContext,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash)
				}
			});
		}
		run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			return splitEditorInGroup(accessor, resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService)));
		}
	});

	async function joinEditorInGroup(resolvedContext: IResolvedEditorCommandsContext): Promise<void> {
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

		let options: IEditorOptions | undefined = undefined;
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
					weight: KeybindingWeight.WorkbenchContrib,
					when: SideBySideEditorActiveContext,
					primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash)
				}
			});
		}
		run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
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
		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
			if (!resolvedContext.groupedEditors.length) {
				return;
			}

			const { editors } = resolvedContext.groupedEditors[0];

			if (editors[0] instanceof SideBySideEditorInput) {
				await joinEditorInGroup(resolvedContext);
			} else if (editors[0]) {
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
		async run(accessor: ServicesAccessor): Promise<void> {
			const configurationService = accessor.get(IConfigurationService);
			const currentSetting = configurationService.getValue<unknown>(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING);

			let newSetting: 'vertical' | 'horizontal';
			if (currentSetting !== 'horizontal') {
				newSetting = 'horizontal';
			} else {
				newSetting = 'vertical';
			}

			return configurationService.updateValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING, newSetting);
		}
	});
}

function registerFocusSideEditorsCommands(): void {

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
		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const commandService = accessor.get(ICommandService);

			const activeEditorPane = editorService.activeEditorPane;
			if (activeEditorPane instanceof SideBySideEditor) {
				activeEditorPane.getSecondaryEditorPane()?.focus();
			} else if (activeEditorPane instanceof TextDiffEditor) {
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
		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const commandService = accessor.get(ICommandService);

			const activeEditorPane = editorService.activeEditorPane;
			if (activeEditorPane instanceof SideBySideEditor) {
				activeEditorPane.getPrimaryEditorPane()?.focus();
			} else if (activeEditorPane instanceof TextDiffEditor) {
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
		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const commandService = accessor.get(ICommandService);

			const activeEditorPane = editorService.activeEditorPane;
			if (activeEditorPane instanceof SideBySideEditor) {
				if (activeEditorPane.getPrimaryEditorPane()?.hasFocus()) {
					activeEditorPane.getSecondaryEditorPane()?.focus();
				} else {
					activeEditorPane.getPrimaryEditorPane()?.focus();
				}
			} else if (activeEditorPane instanceof TextDiffEditor) {
				await commandService.executeCommand(DIFF_FOCUS_OTHER_SIDE);
			}
		}
	});
}

function registerOtherEditorCommands(): void {

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: KEEP_EDITOR_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.Enter),
		handler: async (accessor, ...args: unknown[]) => {
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

	function setEditorGroupLock(accessor: ServicesAccessor, locked: boolean | undefined, ...args: unknown[]): void {
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
		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
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
		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
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
		async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
			setEditorGroupLock(accessor, false, ...args);
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: PIN_EDITOR_COMMAND_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		when: ActiveEditorStickyContext.toNegated(),
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.Enter),
		handler: async (accessor, ...args: unknown[]) => {
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
		weight: KeybindingWeight.WorkbenchContrib,
		when: ActiveEditorStickyContext,
		primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.Enter),
		handler: async (accessor, ...args: unknown[]) => {
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
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: (accessor, ...args: unknown[]) => {
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

export function setup(): void {
	registerActiveEditorMoveCopyCommand();
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
}
