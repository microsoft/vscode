/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/platform';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import { Action, IAction } from 'vs/base/common/actions';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IEditorQuickOpenEntry, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { StatusbarItemDescriptor, StatusbarAlignment, IStatusbarRegistry, Extensions as StatusExtensions } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { EditorInput, IEditorRegistry, Extensions as EditorExtensions, IEditorInputFactory, SideBySideEditorInput } from 'vs/workbench/common/editor';
import { StringEditorInput } from 'vs/workbench/common/editor/stringEditorInput';
import { TextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TextDiffEditor } from 'vs/workbench/browser/parts/editor/textDiffEditor';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { BinaryResourceDiffEditor } from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ChangeEncodingAction, ChangeEOLAction, ChangeModeAction, EditorStatus } from 'vs/workbench/browser/parts/editor/editorStatus';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actionBarRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import {
	CloseEditorsInGroupAction, CloseEditorsInOtherGroupsAction, CloseAllEditorsAction, MoveGroupLeftAction, MoveGroupRightAction, SplitEditorAction, KeepEditorAction, CloseOtherEditorsInGroupAction, OpenToSideAction,
	NavigateBetweenGroupsAction, FocusActiveGroupAction, FocusFirstGroupAction, FocusSecondGroupAction, FocusThirdGroupAction, EvenGroupWidthsAction, MaximizeGroupAction, MinimizeOtherGroupsAction, FocusPreviousGroup, FocusNextGroup, ShowEditorsInGroupOneAction,
	toEditorQuickOpenEntry, CloseLeftEditorsInGroupAction, CloseRightEditorsInGroupAction, OpenNextEditor, OpenPreviousEditor, NavigateBackwardsAction, NavigateForwardAction, ReopenClosedEditorAction, OpenPreviousRecentlyUsedEditorInGroupAction, NAVIGATE_IN_GROUP_ONE_PREFIX,
	OpenPreviousEditorFromHistoryAction, ShowAllEditorsAction, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, ClearEditorHistoryAction, ShowEditorsInGroupTwoAction, MoveEditorRightInGroupAction, OpenNextEditorInGroup, OpenPreviousEditorInGroup,
	NAVIGATE_IN_GROUP_TWO_PREFIX, ShowEditorsInGroupThreeAction, NAVIGATE_IN_GROUP_THREE_PREFIX, FocusLastEditorInStackAction, OpenNextRecentlyUsedEditorInGroupAction, MoveEditorToPreviousGroupAction, MoveEditorToNextGroupAction, MoveEditorLeftInGroupAction
} from 'vs/workbench/browser/parts/editor/editorActions';
import * as editorCommands from 'vs/workbench/browser/parts/editor/editorCommands';

// Register String Editor
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		TextResourceEditor.ID,
		nls.localize('textEditor', "Text Editor"),
		'vs/workbench/browser/parts/editor/textResourceEditor',
		'TextResourceEditor'
	),
	[
		new SyncDescriptor(StringEditorInput),
		new SyncDescriptor(UntitledEditorInput),
		new SyncDescriptor(ResourceEditorInput)
	]
);

// Register Text Diff Editor
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		TextDiffEditor.ID,
		nls.localize('textDiffEditor', "Text Diff Editor"),
		'vs/workbench/browser/parts/editor/textDiffEditor',
		'TextDiffEditor'
	),
	[
		new SyncDescriptor(DiffEditorInput)
	]
);

// Register Binary Resource Diff Editor
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		BinaryResourceDiffEditor.ID,
		nls.localize('binaryDiffEditor', "Binary Diff Editor"),
		'vs/workbench/browser/parts/editor/binaryDiffEditor',
		'BinaryResourceDiffEditor'
	),
	[
		new SyncDescriptor(DiffEditorInput)
	]
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		SideBySideEditor.ID,
		nls.localize('sideBySideEditor', "Side by Side Editor"),
		'vs/workbench/browser/parts/editor/sideBySideEditor',
		'SideBySideEditor'
	),
	[
		new SyncDescriptor(SideBySideEditorInput)
	]
);

interface ISerializedUntitledEditorInput {
	resource: string;
	resourceJSON: any;
	modeId: string;
}

// Register Editor Input Factory
class UntitledEditorInputFactory implements IEditorInputFactory {

	constructor(
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ITextFileService private textFileService: ITextFileService
	) {
	}

	public serialize(editorInput: EditorInput): string {
		if (!this.textFileService.isHotExitEnabled) {
			return null; // never restore untitled unless hot exit is enabled
		}

		const untitledEditorInput = <UntitledEditorInput>editorInput;

		let resource = untitledEditorInput.getResource();
		if (untitledEditorInput.hasAssociatedFilePath) {
			resource = URI.file(resource.fsPath); // untitled with associated file path use the file schema
		}

		const serialized: ISerializedUntitledEditorInput = {
			resource: resource.toString(), // Keep for backwards compatibility
			resourceJSON: resource.toJSON(),
			modeId: untitledEditorInput.getModeId()
		};

		return JSON.stringify(serialized);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const deserialized: ISerializedUntitledEditorInput = JSON.parse(serializedEditorInput);

		return this.untitledEditorService.createOrGet(!!deserialized.resourceJSON ? URI.revive(deserialized.resourceJSON) : URI.parse(deserialized.resource), deserialized.modeId);
	}
}

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditorInputFactory(UntitledEditorInput.ID, UntitledEditorInputFactory);

interface ISerializedSideBySideEditorInput {
	name: string;
	description: string;

	detailsSerialized: string;
	masterSerialized: string;

	detailsTypeId: string;
	masterTypeId: string;
}

// Register Side by Side Editor Input Factory
class SideBySideEditorInputFactory implements IEditorInputFactory {

	public serialize(editorInput: EditorInput): string {
		const input = <SideBySideEditorInput>editorInput;

		if (input.details && input.master) {
			const registry = Registry.as<IEditorRegistry>(EditorExtensions.Editors);
			const detailsInputFactory = registry.getEditorInputFactory(input.details.getTypeId());
			const masterInputFactory = registry.getEditorInputFactory(input.master.getTypeId());

			if (detailsInputFactory && masterInputFactory) {
				const detailsSerialized = detailsInputFactory.serialize(input.details);
				const masterSerialized = masterInputFactory.serialize(input.master);

				if (detailsSerialized && masterSerialized) {
					return JSON.stringify(<ISerializedSideBySideEditorInput>{
						name: input.getName(),
						description: input.getDescription(),
						detailsSerialized,
						masterSerialized,
						detailsTypeId: input.details.getTypeId(),
						masterTypeId: input.master.getTypeId()
					});
				}
			}
		}

		return null;
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		const deserialized: ISerializedSideBySideEditorInput = JSON.parse(serializedEditorInput);

		const registry = Registry.as<IEditorRegistry>(EditorExtensions.Editors);
		const detailsInputFactory = registry.getEditorInputFactory(deserialized.detailsTypeId);
		const masterInputFactory = registry.getEditorInputFactory(deserialized.masterTypeId);

		if (detailsInputFactory && masterInputFactory) {
			const detailsInput = detailsInputFactory.deserialize(instantiationService, deserialized.detailsSerialized);
			const masterInput = masterInputFactory.deserialize(instantiationService, deserialized.masterSerialized);

			if (detailsInput && masterInput) {
				return new SideBySideEditorInput(deserialized.name, deserialized.description, detailsInput, masterInput);
			}
		}

		return null;
	}
}

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditorInputFactory(SideBySideEditorInput.ID, SideBySideEditorInputFactory);

// Register Editor Status
const statusBar = Registry.as<IStatusbarRegistry>(StatusExtensions.Statusbar);
statusBar.registerStatusbarItem(new StatusbarItemDescriptor(EditorStatus, StatusbarAlignment.RIGHT, 100 /* High Priority */));

// Register Status Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_M) }), 'Change Language Mode');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEOLAction, ChangeEOLAction.ID, ChangeEOLAction.LABEL), 'Change End of Line Sequence');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEncodingAction, ChangeEncodingAction.ID, ChangeEncodingAction.LABEL), 'Change File Encoding');

export class QuickOpenActionContributor extends ActionBarContributor {
	private openToSideActionInstance: OpenToSideAction;

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActions(context: any): boolean {
		const entry = this.getEntry(context);

		return !!entry;
	}

	public getActions(context: any): IAction[] {
		const actions: Action[] = [];

		const entry = this.getEntry(context);
		if (entry) {
			if (!this.openToSideActionInstance) {
				this.openToSideActionInstance = this.instantiationService.createInstance(OpenToSideAction);
			} else {
				this.openToSideActionInstance.updateClass();
			}

			actions.push(this.openToSideActionInstance);
		}

		return actions;
	}

	private getEntry(context: any): IEditorQuickOpenEntry {
		if (!context || !context.element) {
			return null;
		}

		return toEditorQuickOpenEntry(context.element);
	}
}

const actionBarRegistry = Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, QuickOpenActionContributor);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/browser/parts/editor/editorPicker',
		'GroupOnePicker',
		NAVIGATE_IN_GROUP_ONE_PREFIX,
		[
			{
				prefix: NAVIGATE_IN_GROUP_ONE_PREFIX,
				needsEditor: false,
				description: nls.localize('groupOnePicker', "Show Editors in First Group")
			},
			{
				prefix: NAVIGATE_IN_GROUP_TWO_PREFIX,
				needsEditor: false,
				description: nls.localize('groupTwoPicker', "Show Editors in Second Group")
			},
			{
				prefix: NAVIGATE_IN_GROUP_THREE_PREFIX,
				needsEditor: false,
				description: nls.localize('groupThreePicker', "Show Editors in Third Group")
			}
		]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/browser/parts/editor/editorPicker',
		'GroupTwoPicker',
		NAVIGATE_IN_GROUP_TWO_PREFIX,
		[]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/browser/parts/editor/editorPicker',
		'GroupThreePicker',
		NAVIGATE_IN_GROUP_THREE_PREFIX,
		[]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/browser/parts/editor/editorPicker',
		'AllEditorsPicker',
		NAVIGATE_ALL_EDITORS_GROUP_PREFIX,
		[
			{
				prefix: NAVIGATE_ALL_EDITORS_GROUP_PREFIX,
				needsEditor: false,
				description: nls.localize('allEditorsPicker', "Show All Opened Editors")
			}
		]
	)
);

// Register Editor Actions
const category = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextEditorInGroup, OpenNextEditorInGroup.ID, OpenNextEditorInGroup.LABEL), 'View: Open Next Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditorInGroup, OpenPreviousEditorInGroup.ID, OpenPreviousEditorInGroup.LABEL), 'View: Open Next Recently Used Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextRecentlyUsedEditorInGroupAction, OpenNextRecentlyUsedEditorInGroupAction.ID, OpenNextRecentlyUsedEditorInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyCode.Tab } }), 'Open Next Recently Used Editor in Group');
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousRecentlyUsedEditorInGroupAction, OpenPreviousRecentlyUsedEditorInGroupAction.ID, OpenPreviousRecentlyUsedEditorInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab } }), 'Open Previous Recently Used Editor in Group');
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllEditorsAction, ShowAllEditorsAction.ID, ShowAllEditorsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_P), mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Tab } }), 'View: Show All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInGroupOneAction, ShowEditorsInGroupOneAction.ID, ShowEditorsInGroupOneAction.LABEL), 'View: Show Editors in First Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInGroupTwoAction, ShowEditorsInGroupTwoAction.ID, ShowEditorsInGroupTwoAction.LABEL), 'View: Show Editors in Second Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInGroupThreeAction, ShowEditorsInGroupThreeAction.ID, ShowEditorsInGroupThreeAction.LABEL), 'View: Show Editors in Third Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextEditor, OpenNextEditor.ID, OpenNextEditor.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.PageDown, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET] } }), 'View: Open Next Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditor, OpenPreviousEditor.ID, OpenPreviousEditor.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.PageUp, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET] } }), 'View: Open Previous Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ReopenClosedEditorAction, ReopenClosedEditorAction.ID, ReopenClosedEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_T }), 'View: Reopen Closed Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(KeepEditorAction, KeepEditorAction.ID, KeepEditorAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.Enter) }), 'View: Keep Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseAllEditorsAction, CloseAllEditorsAction.ID, CloseAllEditorsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_W) }), 'View: Close All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseLeftEditorsInGroupAction, CloseLeftEditorsInGroupAction.ID, CloseLeftEditorsInGroupAction.LABEL), 'View: Close Editors to the Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseRightEditorsInGroupAction, CloseRightEditorsInGroupAction.ID, CloseRightEditorsInGroupAction.LABEL), 'View: Close Editors to the Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, CloseEditorsInGroupAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_W) }), 'View: Close All Editors in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseOtherEditorsInGroupAction, CloseOtherEditorsInGroupAction.ID, CloseOtherEditorsInGroupAction.LABEL, { primary: null, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_T } }), 'View: Close Other Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorsInOtherGroupsAction, CloseEditorsInOtherGroupsAction.ID, CloseEditorsInOtherGroupsAction.LABEL), 'View: Close Editors in Other Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorAction, SplitEditorAction.ID, SplitEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH }), 'View: Split Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBetweenGroupsAction, NavigateBetweenGroupsAction.ID, NavigateBetweenGroupsAction.LABEL), 'View: Navigate Between Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusActiveGroupAction, FocusActiveGroupAction.ID, FocusActiveGroupAction.LABEL), 'View: Focus Active Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFirstGroupAction, FocusFirstGroupAction.ID, FocusFirstGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_1 }), 'View: Focus First Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusSecondGroupAction, FocusSecondGroupAction.ID, FocusSecondGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_2 }), 'View: Focus Second Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusThirdGroupAction, FocusThirdGroupAction.ID, FocusThirdGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_3 }), 'View: Focus Third Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusLastEditorInStackAction, FocusLastEditorInStackAction.ID, FocusLastEditorInStackAction.LABEL, { primary: KeyMod.Alt | KeyCode.KEY_0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_0 } }), 'View: Focus Last Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EvenGroupWidthsAction, EvenGroupWidthsAction.ID, EvenGroupWidthsAction.LABEL), 'View: Even Editor Group Widths', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MaximizeGroupAction, MaximizeGroupAction.ID, MaximizeGroupAction.LABEL), 'View: Maximize Editor Group and Hide Sidebar', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MinimizeOtherGroupsAction, MinimizeOtherGroupsAction.ID, MinimizeOtherGroupsAction.LABEL), 'View: Minimize Other Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorLeftInGroupAction, MoveEditorLeftInGroupAction.ID, MoveEditorLeftInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageUp, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow) } }), 'View: Move Editor Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorRightInGroupAction, MoveEditorRightInGroupAction.ID, MoveEditorRightInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageDown, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow) } }), 'View: Move Editor Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupLeftAction, MoveGroupLeftAction.ID, MoveGroupLeftAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.LeftArrow) }), 'View: Move Editor Group Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupRightAction, MoveGroupRightAction.ID, MoveGroupRightAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.RightArrow) }), 'View: Move Editor Group Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToPreviousGroupAction, MoveEditorToPreviousGroupAction.ID, MoveEditorToPreviousGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow } }), 'View: Move Editor into Previous Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToNextGroupAction, MoveEditorToNextGroupAction.ID, MoveEditorToNextGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow } }), 'View: Move Editor into Next Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousGroup, FocusPreviousGroup.ID, FocusPreviousGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.LeftArrow) }), 'View: Focus Previous Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextGroup, FocusNextGroup.ID, FocusNextGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.RightArrow) }), 'View: Focus Next Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateForwardAction, NavigateForwardAction.ID, NavigateForwardAction.LABEL, { primary: null, win: { primary: KeyMod.Alt | KeyCode.RightArrow }, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_MINUS }, linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS } }), 'Go Forward');
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBackwardsAction, NavigateBackwardsAction.ID, NavigateBackwardsAction.LABEL, { primary: null, win: { primary: KeyMod.Alt | KeyCode.LeftArrow }, mac: { primary: KeyMod.WinCtrl | KeyCode.US_MINUS }, linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_MINUS } }), 'Go Back');
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditorFromHistoryAction, OpenPreviousEditorFromHistoryAction.ID, OpenPreviousEditorFromHistoryAction.LABEL), 'Open Previous Editor from History');
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearEditorHistoryAction, ClearEditorHistoryAction.ID, ClearEditorHistoryAction.LABEL), 'Clear Editor History');

// Keybindings to focus a specific index in the tab folder if tabs are enabled
for (let i = 0; i < 9; i++) {
	const editorIndex = i;
	const visibleIndex = i + 1;

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.openEditorAtIndex' + visibleIndex,
		weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
		when: void 0,
		primary: KeyMod.Alt | toKeyCode(visibleIndex),
		mac: { primary: KeyMod.WinCtrl | toKeyCode(visibleIndex) },
		handler: accessor => {
			const editorService = accessor.get(IWorkbenchEditorService);
			const editorGroupService = accessor.get(IEditorGroupService);

			const active = editorService.getActiveEditor();
			if (active) {
				const group = editorGroupService.getStacksModel().groupAt(active.position);
				const editor = group.getEditor(editorIndex);

				if (editor) {
					return editorService.openEditor(editor);
				}
			}
			return undefined;
		}
	});
}

function toKeyCode(index: number): KeyCode {
	switch (index) {
		case 0: return KeyCode.KEY_0;
		case 1: return KeyCode.KEY_1;
		case 2: return KeyCode.KEY_2;
		case 3: return KeyCode.KEY_3;
		case 4: return KeyCode.KEY_4;
		case 5: return KeyCode.KEY_5;
		case 6: return KeyCode.KEY_6;
		case 7: return KeyCode.KEY_7;
		case 8: return KeyCode.KEY_8;
		case 9: return KeyCode.KEY_9;
	}
	return undefined;
}

// Editor Commands
editorCommands.setup();