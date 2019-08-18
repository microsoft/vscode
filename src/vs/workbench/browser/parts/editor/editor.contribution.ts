/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import * as nls from 'vs/nls';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Action, IAction } from 'vs/base/common/actions';
import { IEditorQuickOpenEntry, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { EditorInput, IEditorInputFactory, SideBySideEditorInput, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions, TextCompareEditorActiveContext, EditorPinnedContext, EditorGroupEditorsCountContext } from 'vs/workbench/common/editor';
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
import { SyncActionDescriptor, MenuRegistry, MenuId, IMenuItem } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import {
	CloseEditorsInOtherGroupsAction, CloseAllEditorsAction, MoveGroupLeftAction, MoveGroupRightAction, SplitEditorAction, JoinTwoGroupsAction, OpenToSideFromQuickOpenAction, RevertAndCloseEditorAction,
	NavigateBetweenGroupsAction, FocusActiveGroupAction, FocusFirstGroupAction, ResetGroupSizesAction, MaximizeGroupAction, MinimizeOtherGroupsAction, FocusPreviousGroup, FocusNextGroup,
	toEditorQuickOpenEntry, CloseLeftEditorsInGroupAction, OpenNextEditor, OpenPreviousEditor, NavigateBackwardsAction, NavigateForwardAction, NavigateLastAction, ReopenClosedEditorAction,
	OpenPreviousRecentlyUsedEditorInGroupAction, OpenPreviousEditorFromHistoryAction, ShowAllEditorsAction, ClearEditorHistoryAction, MoveEditorRightInGroupAction, OpenNextEditorInGroup,
	OpenPreviousEditorInGroup, OpenNextRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorAction, OpenNextRecentlyUsedEditorInGroupAction, MoveEditorToPreviousGroupAction,
	MoveEditorToNextGroupAction, MoveEditorToFirstGroupAction, MoveEditorLeftInGroupAction, ClearRecentFilesAction, OpenLastEditorInGroup,
	ShowEditorsInActiveGroupAction, MoveEditorToLastGroupAction, OpenFirstEditorInGroup, MoveGroupUpAction, MoveGroupDownAction, FocusLastGroupAction, SplitEditorLeftAction, SplitEditorRightAction,
	SplitEditorUpAction, SplitEditorDownAction, MoveEditorToLeftGroupAction, MoveEditorToRightGroupAction, MoveEditorToAboveGroupAction, MoveEditorToBelowGroupAction, CloseAllEditorGroupsAction,
	JoinAllGroupsAction, FocusLeftGroup, FocusAboveGroup, FocusRightGroup, FocusBelowGroup, EditorLayoutSingleAction, EditorLayoutTwoColumnsAction, EditorLayoutThreeColumnsAction, EditorLayoutTwoByTwoGridAction,
	EditorLayoutTwoRowsAction, EditorLayoutThreeRowsAction, EditorLayoutTwoColumnsBottomAction, EditorLayoutTwoRowsRightAction, NewEditorGroupLeftAction, NewEditorGroupRightAction,
	NewEditorGroupAboveAction, NewEditorGroupBelowAction, SplitEditorOrthogonalAction, CloseEditorInAllGroupsAction, NavigateToLastEditLocationAction, ToggleGroupSizesAction
} from 'vs/workbench/browser/parts/editor/editorActions';
import * as editorCommands from 'vs/workbench/browser/parts/editor/editorCommands';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { getQuickNavigateHandler, inQuickOpenContext } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { isMacintosh } from 'vs/base/common/platform';
import { AllEditorsPicker, ActiveEditorGroupPicker } from 'vs/workbench/browser/parts/editor/editorPicker';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { OpenWorkspaceButtonContribution } from 'vs/workbench/browser/parts/editor/editorWidgets';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { toLocalResource } from 'vs/base/common/resources';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';

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
	modeId: string | undefined;
	encoding: string;
}

// Register Editor Input Factory
class UntitledEditorInputFactory implements IEditorInputFactory {

	constructor(
		@ITextFileService private readonly textFileService: ITextFileService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) { }

	serialize(editorInput: EditorInput): string | undefined {
		if (!this.textFileService.isHotExitEnabled) {
			return undefined; // never restore untitled unless hot exit is enabled
		}

		const untitledEditorInput = <UntitledEditorInput>editorInput;

		let resource = untitledEditorInput.getResource();
		if (untitledEditorInput.hasAssociatedFilePath) {
			resource = toLocalResource(resource, this.environmentService.configuration.remoteAuthority); // untitled with associated file path use the local schema
		}

		const serialized: ISerializedUntitledEditorInput = {
			resource: resource.toString(), // Keep for backwards compatibility
			resourceJSON: resource.toJSON(),
			modeId: untitledEditorInput.getMode(),
			encoding: untitledEditorInput.getEncoding()
		};

		return JSON.stringify(serialized);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): UntitledEditorInput {
		return instantiationService.invokeFunction<UntitledEditorInput>(accessor => {
			const deserialized: ISerializedUntitledEditorInput = JSON.parse(serializedEditorInput);
			const resource = !!deserialized.resourceJSON ? URI.revive(<UriComponents>deserialized.resourceJSON) : URI.parse(deserialized.resource);
			const mode = deserialized.modeId;
			const encoding = deserialized.encoding;

			return accessor.get(IEditorService).createInput({ resource, mode, encoding, forceUntitled: true }) as UntitledEditorInput;
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

	serialize(editorInput: EditorInput): string | undefined {
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

		return undefined;
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput | undefined {
		const deserialized: ISerializedSideBySideEditorInput = JSON.parse(serializedEditorInput);

		const registry = Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories);
		const detailsInputFactory = registry.getEditorInputFactory(deserialized.detailsTypeId);
		const masterInputFactory = registry.getEditorInputFactory(deserialized.masterTypeId);

		if (detailsInputFactory && masterInputFactory) {
			const detailsInput = detailsInputFactory.deserialize(instantiationService, deserialized.detailsSerialized);
			const masterInput = masterInputFactory.deserialize(instantiationService, deserialized.masterSerialized);

			if (detailsInput && masterInput) {
				return new SideBySideEditorInput(deserialized.name, withNullAsUndefined(deserialized.description), detailsInput, masterInput);
			}
		}

		return undefined;
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(SideBySideEditorInput.ID, SideBySideEditorInputFactory);

// Register Editor Contributions
registerEditorContribution(OpenWorkspaceButtonContribution);

// Register Editor Status
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorStatus, LifecyclePhase.Ready);

// Register Status Actions
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_M) }), 'Change Language Mode');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEOLAction, ChangeEOLAction.ID, ChangeEOLAction.LABEL), 'Change End of Line Sequence');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEncodingAction, ChangeEncodingAction.ID, ChangeEncodingAction.LABEL), 'Change File Encoding');

export class QuickOpenActionContributor extends ActionBarContributor {
	private openToSideActionInstance: OpenToSideFromQuickOpenAction;

	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}

	hasActions(context: any): boolean {
		const entry = this.getEntry(context);

		return !!entry;
	}

	getActions(context: any): ReadonlyArray<IAction> {
		const actions: Action[] = [];

		const entry = this.getEntry(context);
		if (entry) {
			if (!this.openToSideActionInstance) {
				this.openToSideActionInstance = this.instantiationService.createInstance(OpenToSideFromQuickOpenAction);
			} else {
				this.openToSideActionInstance.updateClass();
			}

			actions.push(this.openToSideActionInstance);
		}

		return actions;
	}

	private getEntry(context: any): IEditorQuickOpenEntry | null {
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
		ActiveEditorGroupPicker,
		ActiveEditorGroupPicker.ID,
		editorCommands.NAVIGATE_IN_ACTIVE_GROUP_PREFIX,
		editorPickerContextKey,
		[
			{
				prefix: editorCommands.NAVIGATE_IN_ACTIVE_GROUP_PREFIX,
				needsEditor: false,
				description: nls.localize('groupOnePicker', "Show Editors in Active Group")
			}
		]
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
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenLastEditorInGroup, OpenLastEditorInGroup.ID, OpenLastEditorInGroup.LABEL, { primary: KeyMod.Alt | KeyCode.KEY_0, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_9], mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_0, secondary: [KeyMod.CtrlCmd | KeyCode.KEY_9] } }), 'View: Open Last Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenFirstEditorInGroup, OpenFirstEditorInGroup.ID, OpenFirstEditorInGroup.LABEL), 'View: Open First Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextRecentlyUsedEditorAction, OpenNextRecentlyUsedEditorAction.ID, OpenNextRecentlyUsedEditorAction.LABEL), 'View: Open Next Recently Used Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorAction.ID, OpenPreviousRecentlyUsedEditorAction.LABEL), 'View: Open Previous Recently Used Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllEditorsAction, ShowAllEditorsAction.ID, ShowAllEditorsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_P), mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Tab } }), 'View: Show All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInActiveGroupAction, ShowEditorsInActiveGroupAction.ID, ShowEditorsInActiveGroupAction.LABEL), 'View: Show Editors in Active Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextEditor, OpenNextEditor.ID, OpenNextEditor.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.PageDown, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET] } }), 'View: Open Next Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditor, OpenPreviousEditor.ID, OpenPreviousEditor.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.PageUp, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET] } }), 'View: Open Previous Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ReopenClosedEditorAction, ReopenClosedEditorAction.ID, ReopenClosedEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_T }), 'View: Reopen Closed Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearRecentFilesAction, ClearRecentFilesAction.ID, ClearRecentFilesAction.LABEL), 'File: Clear Recently Opened', nls.localize('file', "File"));
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseAllEditorsAction, CloseAllEditorsAction.ID, CloseAllEditorsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_W) }), 'View: Close All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseAllEditorGroupsAction, CloseAllEditorGroupsAction.ID, CloseAllEditorGroupsAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_W) }), 'View: Close All Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseLeftEditorsInGroupAction, CloseLeftEditorsInGroupAction.ID, CloseLeftEditorsInGroupAction.LABEL), 'View: Close Editors to the Left in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorsInOtherGroupsAction, CloseEditorsInOtherGroupsAction.ID, CloseEditorsInOtherGroupsAction.LABEL), 'View: Close Editors in Other Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorInAllGroupsAction, CloseEditorInAllGroupsAction.ID, CloseEditorInAllGroupsAction.LABEL), 'View: Close Editor in All Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorAction, SplitEditorAction.ID, SplitEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH }), 'View: Split Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorOrthogonalAction, SplitEditorOrthogonalAction.ID, SplitEditorOrthogonalAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_BACKSLASH) }), 'View: Split Editor Orthogonal', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorLeftAction, SplitEditorLeftAction.ID, SplitEditorLeftAction.LABEL), 'View: Split Editor Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorRightAction, SplitEditorRightAction.ID, SplitEditorRightAction.LABEL), 'View: Split Editor Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorUpAction, SplitEditorUpAction.ID, SplitEditorUpAction.LABEL), 'Split Editor Up', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorDownAction, SplitEditorDownAction.ID, SplitEditorDownAction.LABEL), 'View: Split Editor Down', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(JoinTwoGroupsAction, JoinTwoGroupsAction.ID, JoinTwoGroupsAction.LABEL), 'View: Join Editor Group with Next Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(JoinAllGroupsAction, JoinAllGroupsAction.ID, JoinAllGroupsAction.LABEL), 'View: Join All Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBetweenGroupsAction, NavigateBetweenGroupsAction.ID, NavigateBetweenGroupsAction.LABEL), 'View: Navigate Between Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ResetGroupSizesAction, ResetGroupSizesAction.ID, ResetGroupSizesAction.LABEL), 'View: Reset Editor Group Sizes', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleGroupSizesAction, ToggleGroupSizesAction.ID, ToggleGroupSizesAction.LABEL), 'View: Toggle Editor Group Sizes', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MaximizeGroupAction, MaximizeGroupAction.ID, MaximizeGroupAction.LABEL), 'View: Maximize Editor Group and Hide Side Bar', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MinimizeOtherGroupsAction, MinimizeOtherGroupsAction.ID, MinimizeOtherGroupsAction.LABEL), 'View: Maximize Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorLeftInGroupAction, MoveEditorLeftInGroupAction.ID, MoveEditorLeftInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageUp, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow) } }), 'View: Move Editor Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorRightInGroupAction, MoveEditorRightInGroupAction.ID, MoveEditorRightInGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageDown, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow) } }), 'View: Move Editor Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupLeftAction, MoveGroupLeftAction.ID, MoveGroupLeftAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.LeftArrow) }), 'View: Move Editor Group Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupRightAction, MoveGroupRightAction.ID, MoveGroupRightAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.RightArrow) }), 'View: Move Editor Group Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupUpAction, MoveGroupUpAction.ID, MoveGroupUpAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.UpArrow) }), 'View: Move Editor Group Up', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupDownAction, MoveGroupDownAction.ID, MoveGroupDownAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.DownArrow) }), 'View: Move Editor Group Down', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToPreviousGroupAction, MoveEditorToPreviousGroupAction.ID, MoveEditorToPreviousGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow } }), 'View: Move Editor into Previous Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToNextGroupAction, MoveEditorToNextGroupAction.ID, MoveEditorToNextGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow } }), 'View: Move Editor into Next Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToFirstGroupAction, MoveEditorToFirstGroupAction.ID, MoveEditorToFirstGroupAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_1, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_1 } }), 'View: Move Editor into First Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToLastGroupAction, MoveEditorToLastGroupAction.ID, MoveEditorToLastGroupAction.LABEL, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_9, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_9 } }), 'View: Move Editor into Last Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToLeftGroupAction, MoveEditorToLeftGroupAction.ID, MoveEditorToLeftGroupAction.LABEL), 'View: Move Editor into Left Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToRightGroupAction, MoveEditorToRightGroupAction.ID, MoveEditorToRightGroupAction.LABEL), 'View: Move Editor into Right Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToAboveGroupAction, MoveEditorToAboveGroupAction.ID, MoveEditorToAboveGroupAction.LABEL), 'View: Move Editor into Above Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveEditorToBelowGroupAction, MoveEditorToBelowGroupAction.ID, MoveEditorToBelowGroupAction.LABEL), 'View: Move Editor into Below Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusActiveGroupAction, FocusActiveGroupAction.ID, FocusActiveGroupAction.LABEL), 'View: Focus Active Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFirstGroupAction, FocusFirstGroupAction.ID, FocusFirstGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_1 }), 'View: Focus First Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusLastGroupAction, FocusLastGroupAction.ID, FocusLastGroupAction.LABEL), 'View: Focus Last Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousGroup, FocusPreviousGroup.ID, FocusPreviousGroup.LABEL), 'View: Focus Previous Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextGroup, FocusNextGroup.ID, FocusNextGroup.LABEL), 'View: Focus Next Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusLeftGroup, FocusLeftGroup.ID, FocusLeftGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.LeftArrow) }), 'View: Focus Left Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusRightGroup, FocusRightGroup.ID, FocusRightGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.RightArrow) }), 'View: Focus Right Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusAboveGroup, FocusAboveGroup.ID, FocusAboveGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.UpArrow) }), 'View: Focus Above Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusBelowGroup, FocusBelowGroup.ID, FocusBelowGroup.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.DownArrow) }), 'View: Focus Below Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NewEditorGroupLeftAction, NewEditorGroupLeftAction.ID, NewEditorGroupLeftAction.LABEL), 'View: New Editor Group to the Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NewEditorGroupRightAction, NewEditorGroupRightAction.ID, NewEditorGroupRightAction.LABEL), 'View: New Editor Group to the Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NewEditorGroupAboveAction, NewEditorGroupAboveAction.ID, NewEditorGroupAboveAction.LABEL), 'View: New Editor Group Above', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NewEditorGroupBelowAction, NewEditorGroupBelowAction.ID, NewEditorGroupBelowAction.LABEL), 'View: New Editor Group Below', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateForwardAction, NavigateForwardAction.ID, NavigateForwardAction.LABEL, { primary: 0, win: { primary: KeyMod.Alt | KeyCode.RightArrow }, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_MINUS }, linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS } }), 'Go Forward');
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBackwardsAction, NavigateBackwardsAction.ID, NavigateBackwardsAction.LABEL, { primary: 0, win: { primary: KeyMod.Alt | KeyCode.LeftArrow }, mac: { primary: KeyMod.WinCtrl | KeyCode.US_MINUS }, linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_MINUS } }), 'Go Back');
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateToLastEditLocationAction, NavigateToLastEditLocationAction.ID, NavigateToLastEditLocationAction.LABEL, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_Q) }), 'Go to Last Edit Location');
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateLastAction, NavigateLastAction.ID, NavigateLastAction.LABEL), 'Go Last');
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditorFromHistoryAction, OpenPreviousEditorFromHistoryAction.ID, OpenPreviousEditorFromHistoryAction.LABEL), 'Open Previous Editor from History');
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearEditorHistoryAction, ClearEditorHistoryAction.ID, ClearEditorHistoryAction.LABEL), 'Clear Editor History');
registry.registerWorkbenchAction(new SyncActionDescriptor(RevertAndCloseEditorAction, RevertAndCloseEditorAction.ID, RevertAndCloseEditorAction.LABEL), 'View: Revert and Close Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutSingleAction, EditorLayoutSingleAction.ID, EditorLayoutSingleAction.LABEL), 'View: Single Column Editor Layout', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutTwoColumnsAction, EditorLayoutTwoColumnsAction.ID, EditorLayoutTwoColumnsAction.LABEL), 'View: Two Columns Editor Layout', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutThreeColumnsAction, EditorLayoutThreeColumnsAction.ID, EditorLayoutThreeColumnsAction.LABEL), 'View: Three Columns Editor Layout', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutTwoRowsAction, EditorLayoutTwoRowsAction.ID, EditorLayoutTwoRowsAction.LABEL), 'View: Two Rows Editor Layout', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutThreeRowsAction, EditorLayoutThreeRowsAction.ID, EditorLayoutThreeRowsAction.LABEL), 'View: Three Rows Editor Layout', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutTwoByTwoGridAction, EditorLayoutTwoByTwoGridAction.ID, EditorLayoutTwoByTwoGridAction.LABEL), 'View: Grid Editor Layout (2x2)', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutTwoRowsRightAction, EditorLayoutTwoRowsRightAction.ID, EditorLayoutTwoRowsRightAction.LABEL), 'View: Two Rows Right Editor Layout', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EditorLayoutTwoColumnsBottomAction, EditorLayoutTwoColumnsBottomAction.ID, EditorLayoutTwoColumnsBottomAction.LABEL), 'View: Two Columns Bottom Editor Layout', category);

// Register Editor Picker Actions including quick navigate support
const openNextEditorKeybinding = { primary: KeyMod.CtrlCmd | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyCode.Tab } };
const openPreviousEditorKeybinding = { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab } };
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextRecentlyUsedEditorInGroupAction, OpenNextRecentlyUsedEditorInGroupAction.ID, OpenNextRecentlyUsedEditorInGroupAction.LABEL, openNextEditorKeybinding), 'View: Open Next Recently Used Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousRecentlyUsedEditorInGroupAction, OpenPreviousRecentlyUsedEditorInGroupAction.ID, OpenPreviousRecentlyUsedEditorInGroupAction.LABEL, openPreviousEditorKeybinding), 'View: Open Previous Recently Used Editor in Group', category);

const quickOpenNavigateNextInEditorPickerId = 'workbench.action.quickOpenNavigateNextInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigateNextInEditorPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickOpenNavigateNextInEditorPickerId, true),
	when: editorPickerContext,
	primary: openNextEditorKeybinding.primary,
	mac: openNextEditorKeybinding.mac
});

const quickOpenNavigatePreviousInEditorPickerId = 'workbench.action.quickOpenNavigatePreviousInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickOpenNavigatePreviousInEditorPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
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
		command: { id: NavigateBackwardsAction.ID, title: NavigateBackwardsAction.LABEL, iconLocation: { dark: URI.parse(require.toUrl('vs/workbench/browser/parts/editor/media/back-tb.png')) } },
		group: 'navigation'
	});

	MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
		command: { id: NavigateForwardAction.ID, title: NavigateForwardAction.LABEL, iconLocation: { dark: URI.parse(require.toUrl('vs/workbench/browser/parts/editor/media/forward-tb.png')) } },
		group: 'navigation'
	});
}

// Empty Editor Group Context Menu
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: editorCommands.SPLIT_EDITOR_UP, title: nls.localize('splitUp', "Split Up") }, group: '2_split', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: editorCommands.SPLIT_EDITOR_DOWN, title: nls.localize('splitDown', "Split Down") }, group: '2_split', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: editorCommands.SPLIT_EDITOR_LEFT, title: nls.localize('splitLeft', "Split Left") }, group: '2_split', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: editorCommands.SPLIT_EDITOR_RIGHT, title: nls.localize('splitRight', "Split Right") }, group: '2_split', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: editorCommands.CLOSE_EDITOR_GROUP_COMMAND_ID, title: nls.localize('close', "Close") }, group: '3_close', order: 10, when: ContextKeyExpr.has('multipleEditorGroups') });

// Editor Title Context Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_EDITOR_COMMAND_ID, title: nls.localize('close', "Close") }, group: '1_close', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeOthers', "Close Others"), precondition: EditorGroupEditorsCountContext.notEqualsTo('1') }, group: '1_close', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: nls.localize('closeRight', "Close to the Right"), precondition: EditorGroupEditorsCountContext.notEqualsTo('1') }, group: '1_close', order: 30, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_SAVED_EDITORS_COMMAND_ID, title: nls.localize('closeAllSaved', "Close Saved") }, group: '1_close', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeAll', "Close All") }, group: '1_close', order: 50 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.KEEP_EDITOR_COMMAND_ID, title: nls.localize('keepOpen', "Keep Open"), precondition: EditorPinnedContext.toNegated() }, group: '3_preview', order: 10, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.SPLIT_EDITOR_UP, title: nls.localize('splitUp', "Split Up") }, group: '5_split', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.SPLIT_EDITOR_DOWN, title: nls.localize('splitDown', "Split Down") }, group: '5_split', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.SPLIT_EDITOR_LEFT, title: nls.localize('splitLeft', "Split Left") }, group: '5_split', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: editorCommands.SPLIT_EDITOR_RIGHT, title: nls.localize('splitRight', "Split Right") }, group: '5_split', order: 40 });

// Editor Title Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.TOGGLE_DIFF_SIDE_BY_SIDE, title: nls.localize('toggleSideBySideView', "Toggle Side By Side View") }, group: '1_diff', order: 10, when: ContextKeyExpr.has('isInDiffEditor') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.SHOW_EDITORS_IN_GROUP, title: nls.localize('showOpenedEditors', "Show Opened Editors") }, group: '3_open', order: 10, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: nls.localize('closeAll', "Close All") }, group: '5_close', order: 10, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: editorCommands.CLOSE_SAVED_EDITORS_COMMAND_ID, title: nls.localize('closeAllSaved', "Close Saved") }, group: '5_close', order: 20, when: ContextKeyExpr.has('config.workbench.editor.showTabs') });

interface IEditorToolItem { id: string; title: string; iconDark: string; iconLight: string; }

function appendEditorToolItem(primary: IEditorToolItem, when: ContextKeyExpr | undefined, order: number, alternative?: IEditorToolItem): void {
	const item: IMenuItem = {
		command: {
			id: primary.id,
			title: primary.title,
			iconLocation: {
				dark: URI.parse(require.toUrl(`vs/workbench/browser/parts/editor/media/${primary.iconDark}`)),
				light: URI.parse(require.toUrl(`vs/workbench/browser/parts/editor/media/${primary.iconLight}`))
			}
		},
		group: 'navigation',
		when,
		order
	};

	if (alternative) {
		item.alt = {
			id: alternative.id,
			title: alternative.title,
			iconLocation: {
				dark: URI.parse(require.toUrl(`vs/workbench/browser/parts/editor/media/${alternative.iconDark}`)),
				light: URI.parse(require.toUrl(`vs/workbench/browser/parts/editor/media/${alternative.iconLight}`))
			}
		};
	}

	MenuRegistry.appendMenuItem(MenuId.EditorTitle, item);
}

// Editor Title Menu: Split Editor
appendEditorToolItem(
	{
		id: SplitEditorAction.ID,
		title: nls.localize('splitEditorRight', "Split Editor Right"),
		iconDark: 'split-editor-horizontal-dark.svg',
		iconLight: 'split-editor-horizontal-light.svg'
	},
	ContextKeyExpr.not('splitEditorsVertically'),
	100000, // towards the end
	{
		id: editorCommands.SPLIT_EDITOR_DOWN,
		title: nls.localize('splitEditorDown', "Split Editor Down"),
		iconDark: 'split-editor-vertical-dark.svg',
		iconLight: 'split-editor-vertical-light.svg'
	}
);

appendEditorToolItem(
	{
		id: SplitEditorAction.ID,
		title: nls.localize('splitEditorDown', "Split Editor Down"),
		iconDark: 'split-editor-vertical-dark.svg',
		iconLight: 'split-editor-vertical-light.svg'
	},
	ContextKeyExpr.has('splitEditorsVertically'),
	100000, // towards the end
	{
		id: editorCommands.SPLIT_EDITOR_RIGHT,
		title: nls.localize('splitEditorRight', "Split Editor Right"),
		iconDark: 'split-editor-horizontal-dark.svg',
		iconLight: 'split-editor-horizontal-light.svg'
	}
);

// Editor Title Menu: Close Group (tabs disabled)
appendEditorToolItem(
	{
		id: editorCommands.CLOSE_EDITOR_COMMAND_ID,
		title: nls.localize('close', "Close"),
		iconDark: 'close-dark-alt.svg',
		iconLight: 'close-light-alt.svg'
	},
	ContextKeyExpr.and(ContextKeyExpr.not('config.workbench.editor.showTabs'), ContextKeyExpr.not('groupActiveEditorDirty')),
	1000000, // towards the far end
	{
		id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		title: nls.localize('closeAll', "Close All"),
		iconDark: 'close-all-dark.svg',
		iconLight: 'close-all-light.svg'
	}
);

appendEditorToolItem(
	{
		id: editorCommands.CLOSE_EDITOR_COMMAND_ID,
		title: nls.localize('close', "Close"),
		iconDark: 'close-dirty-dark-alt.svg',
		iconLight: 'close-dirty-light-alt.svg'
	},
	ContextKeyExpr.and(ContextKeyExpr.not('config.workbench.editor.showTabs'), ContextKeyExpr.has('groupActiveEditorDirty')),
	1000000, // towards the far end
	{
		id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		title: nls.localize('closeAll', "Close All"),
		iconDark: 'close-all-dark.svg',
		iconLight: 'close-all-light.svg'
	}
);

// Diff Editor Title Menu: Previous Change
appendEditorToolItem(
	{
		id: editorCommands.GOTO_PREVIOUS_CHANGE,
		title: nls.localize('navigate.prev.label', "Previous Change"),
		iconDark: 'previous-diff-dark.svg',
		iconLight: 'previous-diff-light.svg'
	},
	TextCompareEditorActiveContext,
	10
);

// Diff Editor Title Menu: Next Change
appendEditorToolItem(
	{
		id: editorCommands.GOTO_NEXT_CHANGE,
		title: nls.localize('navigate.next.label', "Next Change"),
		iconDark: 'next-diff-dark.svg',
		iconLight: 'next-diff-light.svg'
	},
	TextCompareEditorActiveContext,
	11
);

// Diff Editor Title Menu: Toggle Ignore Trim Whitespace (Enabled)
appendEditorToolItem(
	{
		id: editorCommands.TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
		title: nls.localize('ignoreTrimWhitespace.label', "Ignore Trim Whitespace"),
		iconDark: 'paragraph-dark.svg',
		iconLight: 'paragraph-light.svg'
	},
	ContextKeyExpr.and(TextCompareEditorActiveContext, ContextKeyExpr.notEquals('config.diffEditor.ignoreTrimWhitespace', true)),
	20
);

// Diff Editor Title Menu: Toggle Ignore Trim Whitespace (Disabled)
appendEditorToolItem(
	{
		id: editorCommands.TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
		title: nls.localize('showTrimWhitespace.label', "Show Trim Whitespace"),
		iconDark: 'paragraph-disabled-dark.svg',
		iconLight: 'paragraph-disabled-light.svg'
	},
	ContextKeyExpr.and(TextCompareEditorActiveContext, ContextKeyExpr.notEquals('config.diffEditor.ignoreTrimWhitespace', false)),
	20
);

// Editor Commands for Command Palette
const viewCategory = { value: nls.localize('view', "View"), original: 'View' };
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.KEEP_EDITOR_COMMAND_ID, title: { value: nls.localize('keepEditor', "Keep Editor"), original: 'Keep Editor' }, category: viewCategory }, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: { value: nls.localize('closeEditorsInGroup', "Close All Editors in Group"), original: 'Close All Editors in Group' }, category: viewCategory } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_SAVED_EDITORS_COMMAND_ID, title: { value: nls.localize('closeSavedEditors', "Close Saved Editors in Group"), original: 'Close Saved Editors in Group' }, category: viewCategory } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: { value: nls.localize('closeOtherEditors', "Close Other Editors in Group"), original: 'Close Other Editors in Group' }, category: viewCategory } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: editorCommands.CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: { value: nls.localize('closeRightEditors', "Close Editors to the Right in Group"), original: 'Close Editors to the Right in Group' }, category: viewCategory } });

// File menu
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
	group: '1_editor',
	command: {
		id: ReopenClosedEditorAction.ID,
		title: nls.localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
	group: 'z_clear',
	command: {
		id: ClearRecentFilesAction.ID,
		title: nls.localize({ key: 'miClearRecentOpen', comment: ['&& denotes a mnemonic'] }, "&&Clear Recently Opened")
	},
	order: 1
});

// Layout menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '2_appearance',
	title: nls.localize({ key: 'miEditorLayout', comment: ['&& denotes a mnemonic'] }, "Editor &&Layout"),
	submenu: MenuId.MenubarLayoutMenu,
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: editorCommands.SPLIT_EDITOR_UP,
		title: nls.localize({ key: 'miSplitEditorUp', comment: ['&& denotes a mnemonic'] }, "Split &&Up")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: editorCommands.SPLIT_EDITOR_DOWN,
		title: nls.localize({ key: 'miSplitEditorDown', comment: ['&& denotes a mnemonic'] }, "Split &&Down")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: editorCommands.SPLIT_EDITOR_LEFT,
		title: nls.localize({ key: 'miSplitEditorLeft', comment: ['&& denotes a mnemonic'] }, "Split &&Left")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: editorCommands.SPLIT_EDITOR_RIGHT,
		title: nls.localize({ key: 'miSplitEditorRight', comment: ['&& denotes a mnemonic'] }, "Split &&Right")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutSingleAction.ID,
		title: nls.localize({ key: 'miSingleColumnEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Single")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutTwoColumnsAction.ID,
		title: nls.localize({ key: 'miTwoColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Two Columns")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutThreeColumnsAction.ID,
		title: nls.localize({ key: 'miThreeColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&hree Columns")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutTwoRowsAction.ID,
		title: nls.localize({ key: 'miTwoRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&wo Rows")
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutThreeRowsAction.ID,
		title: nls.localize({ key: 'miThreeRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "Three &&Rows")
	},
	order: 6
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutTwoByTwoGridAction.ID,
		title: nls.localize({ key: 'miTwoByTwoGridEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Grid (2x2)")
	},
	order: 7
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutTwoRowsRightAction.ID,
		title: nls.localize({ key: 'miTwoRowsRightEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two R&&ows Right")
	},
	order: 8
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_layouts',
	command: {
		id: EditorLayoutTwoColumnsBottomAction.ID,
		title: nls.localize({ key: 'miTwoColumnsBottomEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two &&Columns Bottom")
	},
	order: 9
});

// Main Menu Bar Contributions:

// Forward/Back
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '1_history_nav',
	command: {
		id: 'workbench.action.navigateBack',
		title: nls.localize({ key: 'miBack', comment: ['&& denotes a mnemonic'] }, "&&Back"),
		precondition: ContextKeyExpr.has('canNavigateBack')
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '1_history_nav',
	command: {
		id: 'workbench.action.navigateForward',
		title: nls.localize({ key: 'miForward', comment: ['&& denotes a mnemonic'] }, "&&Forward"),
		precondition: ContextKeyExpr.has('canNavigateForward')
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '1_history_nav',
	command: {
		id: 'workbench.action.navigateToLastEditLocation',
		title: nls.localize({ key: 'miLastEditLocation', comment: ['&& denotes a mnemonic'] }, "&&Last Edit Location"),
		precondition: ContextKeyExpr.has('canNavigateToLastEditLocation')
	},
	order: 3
});

// Switch Editor
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '1_any',
	command: {
		id: 'workbench.action.nextEditor',
		title: nls.localize({ key: 'miNextEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Editor")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '1_any',
	command: {
		id: 'workbench.action.previousEditor',
		title: nls.localize({ key: 'miPreviousEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '2_used',
	command: {
		id: 'workbench.action.openNextRecentlyUsedEditorInGroup',
		title: nls.localize({ key: 'miNextEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor in Group")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '2_used',
	command: {
		id: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
		title: nls.localize({ key: 'miPreviousEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor in Group")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '2_editor_nav',
	title: nls.localize({ key: 'miSwitchEditor', comment: ['&& denotes a mnemonic'] }, "Switch &&Editor"),
	submenu: MenuId.MenubarSwitchEditorMenu,
	order: 1
});

// Switch Group
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusFirstEditorGroup',
		title: nls.localize({ key: 'miFocusFirstGroup', comment: ['&& denotes a mnemonic'] }, "Group &&1")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusSecondEditorGroup',
		title: nls.localize({ key: 'miFocusSecondGroup', comment: ['&& denotes a mnemonic'] }, "Group &&2")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusThirdEditorGroup',
		title: nls.localize({ key: 'miFocusThirdGroup', comment: ['&& denotes a mnemonic'] }, "Group &&3")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusFourthEditorGroup',
		title: nls.localize({ key: 'miFocusFourthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&4")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusFifthEditorGroup',
		title: nls.localize({ key: 'miFocusFifthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&5")
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '2_next_prev',
	command: {
		id: 'workbench.action.focusNextGroup',
		title: nls.localize({ key: 'miNextGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Group")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '2_next_prev',
	command: {
		id: 'workbench.action.focusPreviousGroup',
		title: nls.localize({ key: 'miPreviousGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Group")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusLeftGroup',
		title: nls.localize({ key: 'miFocusLeftGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Left")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusRightGroup',
		title: nls.localize({ key: 'miFocusRightGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Right")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusAboveGroup',
		title: nls.localize({ key: 'miFocusAboveGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Above")
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusBelowGroup',
		title: nls.localize({ key: 'miFocusBelowGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Below")
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '2_editor_nav',
	title: nls.localize({ key: 'miSwitchGroup', comment: ['&& denotes a mnemonic'] }, "Switch &&Group"),
	submenu: MenuId.MenubarSwitchGroupMenu,
	order: 2
});
