/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import { Action, IAction } from 'vs/base/common/actions';
import { IEditorQuickOpenEntry, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { StatusbarItemDescriptor, StatusbarAlignment, IStatusbarRegistry, Extensions as StatusExtensions } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { EditorInput, IEditorInputFactory, SideBySideEditorInput, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions } from 'vs/workbench/common/editor';
import { TextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TextDiffEditor } from 'vs/workbench/browser/parts/editor/textDiffEditor';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { BinaryResourceDiffEditor } from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import { ChangeEncodingAction, ChangeEOLAction, ChangeModeAction, EditorStatus } from 'vs/workbench/browser/parts/editor/editorStatus';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor } from 'vs/workbench/browser/actions';
import { SyncActionDescriptor, MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import {
	CloseEditorsInOtherGroupsAction, CloseAllEditorsAction, MoveGroupLeftAction, MoveGroupRightAction, SplitEditorAction, JoinTwoGroupsAction, OpenToSideAction, RevertAndCloseEditorAction,
	NavigateBetweenGroupsAction, FocusActiveGroupAction, FocusFirstGroupAction, FocusSecondGroupAction, FocusThirdGroupAction, EvenGroupWidthsAction, MaximizeGroupAction, MinimizeOtherGroupsAction, FocusPreviousGroup, FocusNextGroup, ShowEditorsInGroupOneAction,
	toEditorQuickOpenEntry, CloseLeftEditorsInGroupAction, OpenNextEditor, OpenPreviousEditor, NavigateBackwardsAction, NavigateForwardAction, NavigateLastAction, ReopenClosedEditorAction, OpenPreviousRecentlyUsedEditorInGroupAction,
	OpenPreviousEditorFromHistoryAction, ShowAllEditorsAction, ClearEditorHistoryAction, ShowEditorsInGroupTwoAction, MoveEditorRightInGroupAction, OpenNextEditorInGroup, OpenPreviousEditorInGroup, OpenNextRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorAction,
	ShowEditorsInGroupThreeAction, FocusLastEditorInStackAction, OpenNextRecentlyUsedEditorInGroupAction, MoveEditorToPreviousGroupAction, MoveEditorToNextGroupAction, MoveEditorToFirstGroupAction, MoveEditorToSecondGroupAction, MoveEditorToThirdGroupAction, MoveEditorLeftInGroupAction, ClearRecentFilesAction, OpenLastEditorInGroup
} from 'vs/workbench/browser/parts/editor/editorActions';
import * as editorCommands from 'vs/workbench/browser/parts/editor/editorCommands';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getQuickNavigateHandler, inQuickOpenContext } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { isMacintosh } from 'vs/base/common/platform';
import { GroupOnePicker, GroupTwoPicker, GroupThreePicker, AllEditorsPicker } from 'vs/workbench/browser/parts/editor/editorPicker';
import { Schemas } from 'vs/base/common/network';

// Register String Editor
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		TextResourceEditor,
		TextResourceEditor.ID,
		nls.localize('textEditor', "Text Editor"),
	),
	[
		new SyncDescriptor(UntitledEditorInput),
		new SyncDescriptor(ResourceEditorInput)
	]
);

// Register Text Diff Editor
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		TextDiffEditor,
		TextDiffEditor.ID,
		nls.localize('textDiffEditor', "Text Diff Editor")
	),
	[
		new SyncDescriptor(DiffEditorInput)
	]
);

// Register Binary Resource Diff Editor
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		BinaryResourceDiffEditor,
		BinaryResourceDiffEditor.ID,
		nls.localize('binaryDiffEditor', "Binary Diff Editor")
	),
	[
		new SyncDescriptor(DiffEditorInput)
	]
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		SideBySideEditor,
		SideBySideEditor.ID,
		nls.localize('sideBySideEditor', "Side by Side Editor")
	),
	[
		new SyncDescriptor(SideBySideEditorInput)
	]
);

interface ISerializedUntitledEditorInput {
	resource: string;
	resourceJSON: object;
	modeId: string;
	encoding: string;
}

// Register Editor Input Factory
class UntitledEditorInputFactory implements IEditorInputFactory {

	constructor(
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
			modeId: untitledEditorInput.getModeId(),
			encoding: untitledEditorInput.getEncoding()
		};

		return JSON.stringify(serialized);
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): UntitledEditorInput {
		return instantiationService.invokeFunction<UntitledEditorInput>(accessor => {
			const deserialized: ISerializedUntitledEditorInput = JSON.parse(serializedEditorInput);
			const resource = !!deserialized.resourceJSON ? URI.revive(deserialized.resourceJSON) : URI.parse(deserialized.resource);
			const filePath = resource.scheme === Schemas.file ? resource.fsPath : void 0;
			const language = deserialized.modeId;
			const encoding = deserialized.encoding;

			return accessor.get(IWorkbenchEditorService).createInput({ resource, filePath, language, encoding }) as UntitledEditorInput;
		});
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(UntitledEditorInput.ID, UntitledEditorInputFactory);

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
			const registry = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories);
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

		const registry = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories);
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

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(SideBySideEditorInput.ID, SideBySideEditorInputFactory);

// Register Editor Status
const statusBar = Registry.as<IStatusbarRegistry>(StatusExtensions.Statusbar);
statusBar.registerStatusbarItem(new StatusbarItemDescriptor(EditorStatus, StatusbarAlignment.RIGHT, 100 /* towards the left of the right hand side */));

// Register Status Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_M) }), 'Change Language Mode');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEOLAction, ChangeEOLAction.ID, ChangeEOLAction.LABEL), 'Change End of Line Sequence');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEncodingAction, ChangeEncodingAction.ID, ChangeEncodingAction.LABEL), 'Change File Encoding');

export class QuickOpenActionContributor extends ActionBarContributor {
	private openToSideActionInstance: OpenToSideAction;

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
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

const editorPickerContextKey = 'inEditorsPicker';
const editorPickerContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(editorPickerContextKey));

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		GroupOnePicker,
		GroupOnePicker.ID,
		editorCommands.NAVIGATE_IN_GROUP_ONE_PREFIX,
		editorPickerContextKey,
		[
			{
				prefix: editorCommands.NAVIGATE_IN_GROUP_ONE_PREFIX,
				needsEditor: false,
				description: nls.localize('groupOnePicker', "Show Editors in First Group")
			},
			{
				prefix: editorCommands.NAVIGATE_IN_GROUP_TWO_PREFIX,
				needsEditor: false,
				description: nls.localize('groupTwoPicker', "Show Editors in Second Group")
			},
			{
				prefix: editorCommands.NAVIGATE_IN_GROUP_THREE_PREFIX,
				needsEditor: false,
				description: nls.localize('groupThreePicker', "Show Editors in Third Group")
			}
		]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		GroupTwoPicker,
		GroupTwoPicker.ID,
		editorCommands.NAVIGATE_IN_GROUP_TWO_PREFIX,
		editorPickerContextKey,
		[]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		GroupThreePicker,
		GroupThreePicker.ID,
		editorCommands.NAVIGATE_IN_GROUP_THREE_PREFIX,
		editorPickerContextKey,
		[]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		AllEditorsPicker,
		AllEditorsPicker.ID,
		editorCommands.NAVIGATE_ALL_EDITORS_GROUP_PREFIX,
		editorPickerContextKey,
		[
			{
				prefix: editorCommands.NAVIGATE_ALL_EDITORS_GROUP_PREFIX,
				needsEditor: false,
				description: nls.localize('allEditorsPicker', "Show All Opened Editors")
			}
		]
	)
);

// Register Editor Actions
const category = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextEditorInGroup, OpenNextEditorInGroup.ID, OpenNextEditorInGroup.LABEL), 'View: Open Next Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditorInGroup, OpenPreviousEditorInGroup.ID, OpenPreviousEditorInGroup.LABEL), 'View: Open Previous Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenLastEditorInGroup, OpenLastEditorInGroup.ID, OpenLastEditorInGroup.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_9 }), 'View: Open Last Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextRecentlyUsedEditorAction, OpenNextRecentlyUsedEditorAction.ID, OpenNextRecentlyUsedEditorAction.LABEL), 'View: Open Next Recently Used Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorAction.ID, OpenPreviousRecentlyUsedEditorAction.LABEL), 'View: Open Previous Recently Used Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllEditorsAction, ShowAllEditorsAction.ID, ShowAllEditorsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_P), mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Tab } }), 'View: Show All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInGroupOneAction, ShowEditorsInGroupOneAction.ID, ShowEditorsInGroupOneAction.LABEL), 'View: Show Editors in First Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInGroupTwoAction, ShowEditorsInGroupTwoAction.ID, ShowEditorsInGroupTwoAction.LABEL), 'View: Show Editors in Second Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInGroupThreeAction, ShowEditorsInGroupThreeAction.ID, ShowEditorsInGroupThreeAction.LABEL), 'View: Show Editors in Third Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextEditor, OpenNextEditor.ID, OpenNextEditor.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.PageDown, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET] } }), 'View: Open Next Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditor, OpenPreviousEditor.ID, OpenPreviousEditor.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.PageUp, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET] } }), 'View: Open Previous Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ReopenClosedEditorAction, ReopenClosedEditorAction.ID, ReopenClosedEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_T }), 'View: Reopen Closed Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearRecentFilesAction, ClearRecentFilesAction.ID, ClearRecentFilesAction.LABEL), 'File: Clear Recently Opened', nls.localize('file', "File"));
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseAllEditorsAction, CloseAllEditorsAction.ID, CloseAllEditorsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_W) }), 'View: Close All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseLeftEditorsInGroupAction, CloseLeftEditorsInGroupAction.ID, CloseLeftEditorsInGroupAction.LABEL), 'View: Close Editors to the Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorsInOtherGroupsAction, CloseEditorsInOtherGroupsAction.ID, CloseEditorsInOtherGroupsAction.LABEL), 'View: Close Editors in Other Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorAction, SplitEditorAction.ID, SplitEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH }), 'View: Split Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(JoinTwoGroupsAction, JoinTwoGroupsAction.ID, JoinTwoGroupsAction.LABEL), 'View: Join Editors of Two Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBetweenGroupsAction, NavigateBetweenGroupsAction.ID, NavigateBetweenGroupsAction.LABEL), 'View: Navigate Between Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusActiveGroupAction, FocusActiveGroupAction.ID, FocusActiveGroupAction.LABEL), 'View: Focus Active Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFirstGroupAction, FocusFirstGroupAction.ID, FocusFirstGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_1 }), 'View: Focus First Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusSecondGroupAction, FocusSecondGroupAction.ID, FocusSecondGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_2 }), 'View: Focus Second Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusThirdGroupAction, FocusThirdGroupAction.ID, FocusThirdGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_3 }), 'View: Focus Third Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusLastEditorInStackAction, FocusLastEditorInStackAction.ID, FocusLastEditorInStackAction.LABEL, { primary: KeyMod.Alt | KeyCode.KEY_0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_0 } }), 'View: Open Last Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EvenGroupWidthsAction, EvenGroupWidthsAction.ID, EvenGroupWidthsAction.LABEL), 'View: Even Editor Group Widths', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MaximizeGroupAction, MaximizeGroupAction.ID, MaximizeGroupAction.LABEL), 'View: Maximize Editor Group and Hide Sidebar', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MinimizeOtherGroupsAction, MinimizeOtherGroupsAction.ID, MinimizeOtherGroupsAction.LABEL), 'View: Minimize Other Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorLeftInGroupAction, MoveEditorLeftInGroupAction.ID, MoveEditorLeftInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageUp, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow) } }), 'View: Move Editor Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorRightInGroupAction, MoveEditorRightInGroupAction.ID, MoveEditorRightInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageDown, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow) } }), 'View: Move Editor Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupLeftAction, MoveGroupLeftAction.ID, MoveGroupLeftAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.LeftArrow) }), 'View: Move Editor Group Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupRightAction, MoveGroupRightAction.ID, MoveGroupRightAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.RightArrow) }), 'View: Move Editor Group Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToPreviousGroupAction, MoveEditorToPreviousGroupAction.ID, MoveEditorToPreviousGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow } }), 'View: Move Editor into Previous Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToNextGroupAction, MoveEditorToNextGroupAction.ID, MoveEditorToNextGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow } }), 'View: Move Editor into Next Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToFirstGroupAction, MoveEditorToFirstGroupAction.ID, MoveEditorToFirstGroupAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_1, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_1 } }), 'View: Move Editor into First Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToSecondGroupAction, MoveEditorToSecondGroupAction.ID, MoveEditorToSecondGroupAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_2, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_2 } }), 'View: Move Editor into Second Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToThirdGroupAction, MoveEditorToThirdGroupAction.ID, MoveEditorToThirdGroupAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_3, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_3 } }), 'View: Move Editor into Third Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousGroup, FocusPreviousGroup.ID, FocusPreviousGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.LeftArrow) }), 'View: Focus Previous Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextGroup, FocusNextGroup.ID, FocusNextGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.RightArrow) }), 'View: Focus Next Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateForwardAction, NavigateForwardAction.ID, NavigateForwardAction.LABEL, { primary: null, win: { primary: KeyMod.Alt | KeyCode.RightArrow }, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_MINUS }, linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS } }), 'Go Forward');
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBackwardsAction, NavigateBackwardsAction.ID, NavigateBackwardsAction.LABEL, { primary: null, win: { primary: KeyMod.Alt | KeyCode.LeftArrow }, mac: { primary: KeyMod.WinCtrl | KeyCode.US_MINUS }, linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_MINUS } }), 'Go Back');
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateLastAction, NavigateLastAction.ID, NavigateLastAction.LABEL), 'Go Last');
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditorFromHistoryAction, OpenPreviousEditorFromHistoryAction.ID, OpenPreviousEditorFromHistoryAction.LABEL), 'Open Previous Editor from History');
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearEditorHistoryAction, ClearEditorHistoryAction.ID, ClearEditorHistoryAction.LABEL), 'Clear Editor History');
registry.registerWorkbenchAction(new SyncActionDescriptor(RevertAndCloseEditorAction, RevertAndCloseEditorAction.ID, RevertAndCloseEditorAction.LABEL), 'View: Revert and Close Editor', category);

// Register Editor Picker Actions including quick navigate support
const openNextEditorKeybinding = { primary: KeyMod.CtrlCmd | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyCode.Tab } };
const openPreviousEditorKeybinding = { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab } };
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextRecentlyUsedEditorInGroupAction, OpenNextRecentlyUsedEditorInGroupAction.ID, OpenNextRecentlyUsedEditorInGroupAction.LABEL, openNextEditorKeybinding), 'View: Open Next Recently Used Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousRecentlyUsedEditorInGroupAction, OpenPreviousRecentlyUsedEditorInGroupAction.ID, OpenPreviousRecentlyUsedEditorInGroupAction.LABEL, openPreviousEditorKeybinding), 'View: Open Previous Recently Used Editor in Group', category);

const quickOpenNavigateNextInEditorPickerId = 'workbench.action.quickOpenNavigateNextInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInEditorPickerId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigateNextInEditorPickerId, true),
	when: editorPickerContext,
	primary: openNextEditorKeybinding.primary,
	mac: openNextEditorKeybinding.mac
});

const quickOpenNavigatePreviousInEditorPickerId = 'workbench.action.quickOpenNavigatePreviousInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInEditorPickerId,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
	handler: getQuickNavigateHandler(quickOpenNavigatePreviousInEditorPickerId, false),
	when: editorPickerContext,
	primary: openPreviousEditorKeybinding.primary,
	mac: openPreviousEditorKeybinding.mac
});


// Editor Commands
editorCommands.setup();

// Touch Bar
if (isMacintosh) {
	MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
		command: { id: NavigateBackwardsAction.ID, title: NavigateBackwardsAction.LABEL, iconPath: { dark: URI.parse(require.toUrl('vs/workbench/browser/parts/editor/media/back-tb.png')).fsPath } },
		group: 'navigation'
	});

	MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
		command: { id: NavigateForwardAction.ID, title: NavigateForwardAction.LABEL, iconPath: { dark: URI.parse(require.toUrl('vs/workbench/browser/parts/editor/media/forward-tb.png')).fsPath } },
		group: 'navigation'
	});
}

// Editor Title Context Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_EDITOR_COMMAND_ID, title: nls.localize('close', "Close") }, group: '1_close', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeOthers', "Close Others") }, group: '1_close', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: nls.localize('closeRight', "Close to the Right") }, group: '1_close', order: 30, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_SAVED_EDITORS_COMMAND_ID, title: nls.localize('closeAllSaved', "Close Saved") }, group: '1_close', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeAll', "Close All") }, group: '1_close', order: 50 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.KEEP_EDITOR_COMMAND_ID, title: nls.localize('keepOpen', "Keep Open") }, group: '3_preview', order: 10, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });

// Editor Title Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.TOGGLE_DIFF_INLINE_MODE, title: nls.localize('toggleInlineView', "Toggle Inline View") }, group: '1_diff', order: 10, when: ContextKeyExpr.has('isInDiffEditor') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.SHOW_EDITORS_IN_GROUP, title: nls.localize('showOpenedEditors', "Show Opened Editors") }, group: '3_open', order: 10, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeAll', "Close All") }, group: '5_close', order: 10, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.CLOSE_SAVED_EDITORS_COMMAND_ID, title: nls.localize('closeAllSaved', "Close Saved") }, group: '5_close', order: 20, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });

// Editor Commands for Command Palette
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.KEEP_EDITOR_COMMAND_ID, title: nls.localize('keepEditor', "Keep Editor"), category }, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeEditorsInGroup', "Close All Editors in Group"), category } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_SAVED_EDITORS_COMMAND_ID, title: nls.localize('closeSavedEditors', "Close Saved Editors in Group"), category } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeOtherEditors', "Close Other Editors"), category } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: nls.localize('closeRightEditors', "Close Editors to the Right"), category } });