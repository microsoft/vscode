/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IEditorPaneRegistry, EditorPaneDescriptor } from 'vs/workbench/browser/editor';
import { IEditorFactoryRegistry, EditorExtensions } from 'vs/workbench/common/editor';
import {
	TextCompareEditorActiveContext, ActiveEditorPinnedContext, EditorGroupEditorsCountContext, ActiveEditorStickyContext, ActiveEditorAvailableEditorIdsContext,
	MultipleEditorGroupsContext, ActiveEditorDirtyContext, ActiveEditorGroupLockedContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext,
	ActiveEditorGroupEmptyContext, EditorTabsVisibleContext, ActiveEditorLastInGroupContext
} from 'vs/workbench/common/contextkeys';
import { SideBySideEditorInput, SideBySideEditorInputSerializer } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { TextResourceEditor } from 'vs/workbench/browser/parts/editor/textResourceEditor';
import { SideBySideEditor } from 'vs/workbench/browser/parts/editor/sideBySideEditor';
import { DiffEditorInput, DiffEditorInputSerializer } from 'vs/workbench/common/editor/diffEditorInput';
import { UntitledTextEditorInput } from 'vs/workbench/services/untitled/common/untitledTextEditorInput';
import { TextResourceEditorInput } from 'vs/workbench/common/editor/textResourceEditorInput';
import { TextDiffEditor } from 'vs/workbench/browser/parts/editor/textDiffEditor';
import { BinaryResourceDiffEditor } from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import { ChangeEncodingAction, ChangeEOLAction, ChangeLanguageAction, EditorStatus } from 'vs/workbench/browser/parts/editor/editorStatus';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions, CATEGORIES } from 'vs/workbench/common/actions';
import { SyncActionDescriptor, MenuRegistry, MenuId, IMenuItem, registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import {
	CloseEditorsInOtherGroupsAction, CloseAllEditorsAction, MoveGroupLeftAction, MoveGroupRightAction, SplitEditorAction, JoinTwoGroupsAction, RevertAndCloseEditorAction,
	NavigateBetweenGroupsAction, FocusActiveGroupAction, FocusFirstGroupAction, ResetGroupSizesAction, MaximizeGroupAction, MinimizeOtherGroupsAction, FocusPreviousGroup, FocusNextGroup,
	CloseLeftEditorsInGroupAction, OpenNextEditor, OpenPreviousEditor, NavigateBackwardsAction, NavigateForwardAction, NavigatePreviousAction, ReopenClosedEditorAction,
	QuickAccessPreviousRecentlyUsedEditorInGroupAction, QuickAccessPreviousEditorFromHistoryAction, ShowAllEditorsByAppearanceAction, ClearEditorHistoryAction, MoveEditorRightInGroupAction, OpenNextEditorInGroup,
	OpenPreviousEditorInGroup, OpenNextRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorAction, MoveEditorToPreviousGroupAction,
	MoveEditorToNextGroupAction, MoveEditorToFirstGroupAction, MoveEditorLeftInGroupAction, ClearRecentFilesAction, OpenLastEditorInGroup,
	ShowEditorsInActiveGroupByMostRecentlyUsedAction, MoveEditorToLastGroupAction, OpenFirstEditorInGroup, MoveGroupUpAction, MoveGroupDownAction, FocusLastGroupAction, SplitEditorLeftAction, SplitEditorRightAction,
	SplitEditorUpAction, SplitEditorDownAction, MoveEditorToLeftGroupAction, MoveEditorToRightGroupAction, MoveEditorToAboveGroupAction, MoveEditorToBelowGroupAction, CloseAllEditorGroupsAction,
	JoinAllGroupsAction, FocusLeftGroup, FocusAboveGroup, FocusRightGroup, FocusBelowGroup, EditorLayoutSingleAction, EditorLayoutTwoColumnsAction, EditorLayoutThreeColumnsAction, EditorLayoutTwoByTwoGridAction,
	EditorLayoutTwoRowsAction, EditorLayoutThreeRowsAction, EditorLayoutTwoColumnsBottomAction, EditorLayoutTwoRowsRightAction, NewEditorGroupLeftAction, NewEditorGroupRightAction,
	NewEditorGroupAboveAction, NewEditorGroupBelowAction, SplitEditorOrthogonalAction, CloseEditorInAllGroupsAction, NavigateToLastEditLocationAction, ToggleGroupSizesAction, ShowAllEditorsByMostRecentlyUsedAction,
	QuickAccessPreviousRecentlyUsedEditorAction, OpenPreviousRecentlyUsedEditorInGroupAction, OpenNextRecentlyUsedEditorInGroupAction, QuickAccessLeastRecentlyUsedEditorAction, QuickAccessLeastRecentlyUsedEditorInGroupAction,
	ReOpenInTextEditorAction, DuplicateGroupDownAction, DuplicateGroupLeftAction, DuplicateGroupRightAction, DuplicateGroupUpAction, ToggleEditorTypeAction, SplitEditorToAboveGroupAction, SplitEditorToBelowGroupAction,
	SplitEditorToFirstGroupAction, SplitEditorToLastGroupAction, SplitEditorToLeftGroupAction, SplitEditorToNextGroupAction, SplitEditorToPreviousGroupAction, SplitEditorToRightGroupAction, NavigateForwardInEditsAction,
	NavigateBackwardsInEditsAction, NavigateForwardInNavigationsAction, NavigateBackwardsInNavigationsAction, NavigatePreviousInNavigationsAction, NavigatePreviousInEditsAction, NavigateToLastNavigationLocationAction
} from 'vs/workbench/browser/parts/editor/editorActions';
import {
	CLOSE_EDITORS_AND_GROUP_COMMAND_ID, CLOSE_EDITORS_IN_GROUP_COMMAND_ID, CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, CLOSE_EDITOR_COMMAND_ID, CLOSE_EDITOR_GROUP_COMMAND_ID, CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
	CLOSE_PINNED_EDITOR_COMMAND_ID, CLOSE_SAVED_EDITORS_COMMAND_ID, GOTO_NEXT_CHANGE, GOTO_PREVIOUS_CHANGE, KEEP_EDITOR_COMMAND_ID, PIN_EDITOR_COMMAND_ID, SHOW_EDITORS_IN_GROUP, SPLIT_EDITOR_DOWN, SPLIT_EDITOR_LEFT,
	SPLIT_EDITOR_RIGHT, SPLIT_EDITOR_UP, TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE, TOGGLE_DIFF_SIDE_BY_SIDE, TOGGLE_KEEP_EDITORS_COMMAND_ID, UNPIN_EDITOR_COMMAND_ID, setup as registerEditorCommands, REOPEN_WITH_COMMAND_ID,
	TOGGLE_LOCK_GROUP_COMMAND_ID, UNLOCK_GROUP_COMMAND_ID, SPLIT_EDITOR_IN_GROUP, JOIN_EDITOR_IN_GROUP, FOCUS_FIRST_SIDE_EDITOR, FOCUS_SECOND_SIDE_EDITOR, TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT
} from 'vs/workbench/browser/parts/editor/editorCommands';
import { inQuickPickContext, getQuickNavigateHandler } from 'vs/workbench/browser/quickaccess';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ContextKeyExpr, ContextKeyExpression } from 'vs/platform/contextkey/common/contextkey';
import { isMacintosh } from 'vs/base/common/platform';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { FloatingClickMenu } from 'vs/workbench/browser/codeeditor';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { EditorAutoSave } from 'vs/workbench/browser/parts/editor/editorAutoSave';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IQuickAccessRegistry, Extensions as QuickAccessExtensions } from 'vs/platform/quickinput/common/quickAccess';
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess, AllEditorsByMostRecentlyUsedQuickAccess } from 'vs/workbench/browser/parts/editor/editorQuickAccess';
import { FileAccess } from 'vs/base/common/network';
import { Codicon } from 'vs/base/common/codicons';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { UntitledTextEditorInputSerializer, UntitledTextEditorWorkingCopyEditorHandler } from 'vs/workbench/services/untitled/common/untitledTextEditorHandler';
import { DynamicEditorConfigurations } from 'vs/workbench/browser/parts/editor/editorConfiguration';

//#region Editor Registrations

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TextResourceEditor,
		TextResourceEditor.ID,
		localize('textEditor', "Text Editor"),
	),
	[
		new SyncDescriptor(UntitledTextEditorInput),
		new SyncDescriptor(TextResourceEditorInput)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TextDiffEditor,
		TextDiffEditor.ID,
		localize('textDiffEditor', "Text Diff Editor")
	),
	[
		new SyncDescriptor(DiffEditorInput)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		BinaryResourceDiffEditor,
		BinaryResourceDiffEditor.ID,
		localize('binaryDiffEditor', "Binary Diff Editor")
	),
	[
		new SyncDescriptor(DiffEditorInput)
	]
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		SideBySideEditor,
		SideBySideEditor.ID,
		localize('sideBySideEditor', "Side by Side Editor")
	),
	[
		new SyncDescriptor(SideBySideEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(UntitledTextEditorInput.ID, UntitledTextEditorInputSerializer);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(SideBySideEditorInput.ID, SideBySideEditorInputSerializer);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(DiffEditorInput.ID, DiffEditorInputSerializer);

//#endregion

//#region Workbench Contributions

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorAutoSave, 'EditorAutoSave', LifecyclePhase.Ready);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(EditorStatus, 'EditorStatus', LifecyclePhase.Ready);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(UntitledTextEditorWorkingCopyEditorHandler, 'UntitledTextEditorWorkingCopyEditorHandler', LifecyclePhase.Ready);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DynamicEditorConfigurations, 'DynamicEditorConfigurations', LifecyclePhase.Ready);

registerEditorContribution(FloatingClickMenu.ID, FloatingClickMenu);

//#endregion

//#region Quick Access

const quickAccessRegistry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess);
const editorPickerContextKey = 'inEditorsPicker';
const editorPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(editorPickerContextKey));

quickAccessRegistry.registerQuickAccessProvider({
	ctor: ActiveGroupEditorsByMostRecentlyUsedQuickAccess,
	prefix: ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX,
	contextKey: editorPickerContextKey,
	placeholder: localize('editorQuickAccessPlaceholder', "Type the name of an editor to open it."),
	helpEntries: [{ description: localize('activeGroupEditorsByMostRecentlyUsedQuickAccess', "Show Editors in Active Group by Most Recently Used"), commandId: ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID }]
});

quickAccessRegistry.registerQuickAccessProvider({
	ctor: AllEditorsByAppearanceQuickAccess,
	prefix: AllEditorsByAppearanceQuickAccess.PREFIX,
	contextKey: editorPickerContextKey,
	placeholder: localize('editorQuickAccessPlaceholder', "Type the name of an editor to open it."),
	helpEntries: [{ description: localize('allEditorsByAppearanceQuickAccess', "Show All Opened Editors By Appearance"), commandId: ShowAllEditorsByAppearanceAction.ID }]
});

quickAccessRegistry.registerQuickAccessProvider({
	ctor: AllEditorsByMostRecentlyUsedQuickAccess,
	prefix: AllEditorsByMostRecentlyUsedQuickAccess.PREFIX,
	contextKey: editorPickerContextKey,
	placeholder: localize('editorQuickAccessPlaceholder', "Type the name of an editor to open it."),
	helpEntries: [{ description: localize('allEditorsByMostRecentlyUsedQuickAccess', "Show All Opened Editors By Most Recently Used"), commandId: ShowAllEditorsByMostRecentlyUsedAction.ID }]
});

//#endregion

//#region Actions & Commands

// Editor Status
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ChangeLanguageAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyM) }), 'Change Language Mode', undefined, ContextKeyExpr.not('notebookEditorFocused'));
registry.registerWorkbenchAction(SyncActionDescriptor.from(ChangeEOLAction), 'Change End of Line Sequence');
registry.registerWorkbenchAction(SyncActionDescriptor.from(ChangeEncodingAction), 'Change File Encoding');

// Editor Management
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenNextEditor, { primary: KeyMod.CtrlCmd | KeyCode.PageDown, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight] } }), 'View: Open Next Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenPreviousEditor, { primary: KeyMod.CtrlCmd | KeyCode.PageUp, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft] } }), 'View: Open Previous Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenNextEditorInGroup, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.PageDown), mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow) } }), 'View: Open Next Editor in Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenPreviousEditorInGroup, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.PageUp), mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow) } }), 'View: Open Previous Editor in Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenNextRecentlyUsedEditorAction), 'View: Open Next Recently Used Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenPreviousRecentlyUsedEditorAction), 'View: Open Previous Recently Used Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenNextRecentlyUsedEditorInGroupAction), 'View: Open Next Recently Used Editor In Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenPreviousRecentlyUsedEditorInGroupAction), 'View: Open Previous Recently Used Editor In Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenFirstEditorInGroup), 'View: Open First Editor in Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(OpenLastEditorInGroup, { primary: KeyMod.Alt | KeyCode.Digit0, secondary: [KeyMod.CtrlCmd | KeyCode.Digit9], mac: { primary: KeyMod.WinCtrl | KeyCode.Digit0, secondary: [KeyMod.CtrlCmd | KeyCode.Digit9] } }), 'View: Open Last Editor in Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ReopenClosedEditorAction, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT }), 'View: Reopen Closed Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ShowAllEditorsByAppearanceAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyP), mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Tab } }), 'View: Show All Editors By Appearance', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ShowAllEditorsByMostRecentlyUsedAction), 'View: Show All Editors By Most Recently Used', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ShowEditorsInActiveGroupByMostRecentlyUsedAction), 'View: Show Editors in Active Group By Most Recently Used', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ClearRecentFilesAction), 'File: Clear Recently Opened', localize('file', "File"));
registry.registerWorkbenchAction(SyncActionDescriptor.from(CloseAllEditorsAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyW) }), 'View: Close All Editors', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(CloseAllEditorGroupsAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW) }), 'View: Close All Editor Groups', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(CloseLeftEditorsInGroupAction), 'View: Close Editors to the Left in Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(CloseEditorsInOtherGroupsAction), 'View: Close Editors in Other Groups', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(CloseEditorInAllGroupsAction), 'View: Close Editor in All Groups', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorAction, { primary: KeyMod.CtrlCmd | KeyCode.Backslash }), 'View: Split Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorOrthogonalAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash) }), 'View: Split Editor Orthogonal', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorLeftAction), 'View: Split Editor Left', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorRightAction), 'View: Split Editor Right', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorUpAction), 'View: Split Editor Up', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorDownAction), 'View: Split Editor Down', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(JoinTwoGroupsAction), 'View: Join Editor Group with Next Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(JoinAllGroupsAction), 'View: Join All Editor Groups', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateBetweenGroupsAction), 'View: Navigate Between Editor Groups', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ResetGroupSizesAction), 'View: Reset Editor Group Sizes', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ToggleGroupSizesAction), 'View: Toggle Editor Group Sizes', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MaximizeGroupAction), 'View: Maximize Editor Group and Hide Side Bars', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MinimizeOtherGroupsAction), 'View: Maximize Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorLeftInGroupAction, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageUp, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow) } }), 'View: Move Editor Left', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorRightInGroupAction, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.PageDown, mac: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow) } }), 'View: Move Editor Right', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveGroupLeftAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.LeftArrow) }), 'View: Move Editor Group Left', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveGroupRightAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.RightArrow) }), 'View: Move Editor Group Right', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveGroupUpAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.UpArrow) }), 'View: Move Editor Group Up', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveGroupDownAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.DownArrow) }), 'View: Move Editor Group Down', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(DuplicateGroupLeftAction), 'View: Duplicate Editor Group Left', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(DuplicateGroupRightAction), 'View: Duplicate Editor Group Right', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(DuplicateGroupUpAction), 'View: Duplicate Editor Group Up', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(DuplicateGroupDownAction), 'View: Duplicate Editor Group Down', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToPreviousGroupAction, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.LeftArrow } }), 'View: Move Editor into Previous Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToNextGroupAction, { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.RightArrow } }), 'View: Move Editor into Next Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToFirstGroupAction, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit1, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit1 } }), 'View: Move Editor into First Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToLastGroupAction, { primary: KeyMod.Shift | KeyMod.Alt | KeyCode.Digit9, mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Digit9 } }), 'View: Move Editor into Last Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToLeftGroupAction), 'View: Move Editor into Left Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToRightGroupAction), 'View: Move Editor into Right Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToAboveGroupAction), 'View: Move Editor into Group Above', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(MoveEditorToBelowGroupAction), 'View: Move Editor into Group Below', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToPreviousGroupAction), 'View: Split Editor into Previous Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToNextGroupAction), 'View: Split Editor into Next Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToFirstGroupAction), 'View: Split Editor into First Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToLastGroupAction), 'View: Split Editor into Last Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToLeftGroupAction), 'View: Split Editor into Left Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToRightGroupAction), 'View: Split Editor into Right Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToAboveGroupAction), 'View: Split Editor into Group Above', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(SplitEditorToBelowGroupAction), 'View: Split Editor into Group Below', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusActiveGroupAction), 'View: Focus Active Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusFirstGroupAction, { primary: KeyMod.CtrlCmd | KeyCode.Digit1 }), 'View: Focus First Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusLastGroupAction), 'View: Focus Last Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusPreviousGroup), 'View: Focus Previous Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusNextGroup), 'View: Focus Next Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusLeftGroup, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.LeftArrow) }), 'View: Focus Left Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusRightGroup, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.RightArrow) }), 'View: Focus Right Editor Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusAboveGroup, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.UpArrow) }), 'View: Focus Editor Group Above', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(FocusBelowGroup, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.DownArrow) }), 'View: Focus Editor Group Below', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(NewEditorGroupLeftAction), 'View: New Editor Group to the Left', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(NewEditorGroupRightAction), 'View: New Editor Group to the Right', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(NewEditorGroupAboveAction), 'View: New Editor Group Above', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(NewEditorGroupBelowAction), 'View: New Editor Group Below', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigatePreviousAction), 'Go Previous');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateForwardInEditsAction), 'Go Forward in Edit Locations');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateBackwardsInEditsAction), 'Go Back in Edit Locations');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigatePreviousInEditsAction), 'Go Previous in Edit Locations');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateToLastEditLocationAction, { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyQ) }), 'Go to Last Edit Location');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateForwardInNavigationsAction), 'Go Forward in Navigation Locations');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateBackwardsInNavigationsAction), 'Go Back in Navigation Locations');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigatePreviousInNavigationsAction), 'Go Previous in Navigation Locations');
registry.registerWorkbenchAction(SyncActionDescriptor.from(NavigateToLastNavigationLocationAction), 'Go to Last Navigation Location');
registry.registerWorkbenchAction(SyncActionDescriptor.from(ClearEditorHistoryAction), 'Clear Editor History');
registry.registerWorkbenchAction(SyncActionDescriptor.from(RevertAndCloseEditorAction), 'View: Revert and Close Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutSingleAction), 'View: Single Column Editor Layout', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutTwoColumnsAction), 'View: Two Columns Editor Layout', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutThreeColumnsAction), 'View: Three Columns Editor Layout', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutTwoRowsAction), 'View: Two Rows Editor Layout', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutThreeRowsAction), 'View: Three Rows Editor Layout', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutTwoByTwoGridAction), 'View: Grid Editor Layout (2x2)', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutTwoRowsRightAction), 'View: Two Rows Right Editor Layout', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(EditorLayoutTwoColumnsBottomAction), 'View: Two Columns Bottom Editor Layout', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ToggleEditorTypeAction), 'View: Toggle Editor Type', CATEGORIES.View.value, ActiveEditorAvailableEditorIdsContext);
registry.registerWorkbenchAction(SyncActionDescriptor.from(ReOpenInTextEditorAction), 'View: Reopen Editor With Text Editor', CATEGORIES.View.value, ActiveEditorAvailableEditorIdsContext);
registry.registerWorkbenchAction(SyncActionDescriptor.from(QuickAccessPreviousRecentlyUsedEditorAction), 'View: Quick Open Previous Recently Used Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(QuickAccessLeastRecentlyUsedEditorAction), 'View: Quick Open Least Recently Used Editor', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(QuickAccessPreviousRecentlyUsedEditorInGroupAction, { primary: KeyMod.CtrlCmd | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyCode.Tab } }, ActiveEditorGroupEmptyContext.toNegated()), 'View: Quick Open Previous Recently Used Editor in Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(QuickAccessLeastRecentlyUsedEditorInGroupAction, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab, mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab } }, ActiveEditorGroupEmptyContext.toNegated()), 'View: Quick Open Least Recently Used Editor in Group', CATEGORIES.View.value);
registry.registerWorkbenchAction(SyncActionDescriptor.from(QuickAccessPreviousEditorFromHistoryAction), 'Quick Open Previous Editor from History');

registerAction2(NavigateForwardAction);
registerAction2(NavigateBackwardsAction);

const quickAccessNavigateNextInEditorPickerId = 'workbench.action.quickOpenNavigateNextInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigateNextInEditorPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigateNextInEditorPickerId, true),
	when: editorPickerContext,
	primary: KeyMod.CtrlCmd | KeyCode.Tab,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Tab }
});

const quickAccessNavigatePreviousInEditorPickerId = 'workbench.action.quickOpenNavigatePreviousInEditorPicker';
KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: quickAccessNavigatePreviousInEditorPickerId,
	weight: KeybindingWeight.WorkbenchContrib + 50,
	handler: getQuickNavigateHandler(quickAccessNavigatePreviousInEditorPickerId, false),
	when: editorPickerContext,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab }
});

registerEditorCommands();

//#endregion Workbench Actions

//#region Menus

// macOS: Touchbar
if (isMacintosh) {
	MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
		command: { id: NavigateBackwardsAction.ID, title: NavigateBackwardsAction.LABEL, icon: { dark: FileAccess.asFileUri('vs/workbench/browser/parts/editor/media/back-tb.png', require) } },
		group: 'navigation',
		order: 0
	});

	MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
		command: { id: NavigateForwardAction.ID, title: NavigateForwardAction.LABEL, icon: { dark: FileAccess.asFileUri('vs/workbench/browser/parts/editor/media/forward-tb.png', require) } },
		group: 'navigation',
		order: 1
	});
}

// Empty Editor Group Toolbar
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: UNLOCK_GROUP_COMMAND_ID, title: localize('unlockGroupAction', "Unlock Group"), icon: Codicon.lock }, group: 'navigation', order: 10, when: ActiveEditorGroupLockedContext });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize('closeGroupAction', "Close Group"), icon: Codicon.close }, group: 'navigation', order: 20 });

// Empty Editor Group Context Menu
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_UP, title: localize('splitUp', "Split Up") }, group: '2_split', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize('splitDown', "Split Down") }, group: '2_split', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize('splitLeft', "Split Left") }, group: '2_split', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize('splitRight', "Split Right") }, group: '2_split', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize('toggleLockGroup', "Lock Group"), toggled: ActiveEditorGroupLockedContext }, group: '3_lock', order: 10, when: MultipleEditorGroupsContext });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize('close', "Close") }, group: '4_close', order: 10, when: MultipleEditorGroupsContext });

// Editor Title Context Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: localize('close', "Close") }, group: '1_close', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: localize('closeOthers', "Close Others"), precondition: EditorGroupEditorsCountContext.notEqualsTo('1') }, group: '1_close', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: localize('closeRight', "Close to the Right"), precondition: ActiveEditorLastInGroupContext.toNegated() }, group: '1_close', order: 30, when: EditorTabsVisibleContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize('closeAllSaved', "Close Saved") }, group: '1_close', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize('closeAll', "Close All") }, group: '1_close', order: 50 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: REOPEN_WITH_COMMAND_ID, title: localize('reopenWith', "Reopen Editor With...") }, group: '1_open', order: 10, when: ActiveEditorAvailableEditorIdsContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: KEEP_EDITOR_COMMAND_ID, title: localize('keepOpen', "Keep Open"), precondition: ActiveEditorPinnedContext.toNegated() }, group: '3_preview', order: 10, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: PIN_EDITOR_COMMAND_ID, title: localize('pin', "Pin") }, group: '3_preview', order: 20, when: ActiveEditorStickyContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: localize('unpin', "Unpin") }, group: '3_preview', order: 20, when: ActiveEditorStickyContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR_UP, title: localize('splitUp', "Split Up") }, group: '5_split', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize('splitDown', "Split Down") }, group: '5_split', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize('splitLeft', "Split Left") }, group: '5_split', order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize('splitRight', "Split Right") }, group: '5_split', order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR_IN_GROUP, title: localize('splitInGroup', "Split in Group") }, group: '6_split_in_group', order: 10, when: ActiveEditorCanSplitInGroupContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: JOIN_EDITOR_IN_GROUP, title: localize('joinInGroup', "Join in Group") }, group: '6_split_in_group', order: 10, when: SideBySideEditorActiveContext });

// Editor Title Menu
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_DIFF_SIDE_BY_SIDE, title: localize('inlineView', "Inline View"), toggled: ContextKeyExpr.equals('config.diffEditor.renderSideBySide', false) }, group: '1_diff', order: 10, when: ContextKeyExpr.has('isInDiffEditor') });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: SHOW_EDITORS_IN_GROUP, title: localize('showOpenedEditors', "Show Opened Editors") }, group: '3_open', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize('closeAll', "Close All") }, group: '5_close', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize('closeAllSaved', "Close Saved") }, group: '5_close', order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_KEEP_EDITORS_COMMAND_ID, title: localize('togglePreviewMode', "Enable Preview Editors"), toggled: ContextKeyExpr.has('config.workbench.editor.enablePreview') }, group: '7_settings', order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize('lockGroup', "Lock Group"), toggled: ActiveEditorGroupLockedContext }, group: '8_lock', order: 10, when: MultipleEditorGroupsContext });

interface IEditorToolItem { id: string; title: string; icon?: { dark?: URI; light?: URI } | ThemeIcon }

function appendEditorToolItem(primary: IEditorToolItem, when: ContextKeyExpression | undefined, order: number, alternative?: IEditorToolItem, precondition?: ContextKeyExpression | undefined): void {
	const item: IMenuItem = {
		command: {
			id: primary.id,
			title: primary.title,
			icon: primary.icon,
			precondition
		},
		group: 'navigation',
		when,
		order
	};

	if (alternative) {
		item.alt = {
			id: alternative.id,
			title: alternative.title,
			icon: alternative.icon
		};
	}

	MenuRegistry.appendMenuItem(MenuId.EditorTitle, item);
}

const SPLIT_ORDER = 100000;  // towards the end
const CLOSE_ORDER = 1000000; // towards the far end

// Editor Title Menu: Split Editor
appendEditorToolItem(
	{
		id: SplitEditorAction.ID,
		title: localize('splitEditorRight', "Split Editor Right"),
		icon: Codicon.splitHorizontal
	},
	ContextKeyExpr.not('splitEditorsVertically'),
	SPLIT_ORDER,
	{
		id: SPLIT_EDITOR_DOWN,
		title: localize('splitEditorDown', "Split Editor Down"),
		icon: Codicon.splitVertical
	}
);

appendEditorToolItem(
	{
		id: SplitEditorAction.ID,
		title: localize('splitEditorDown', "Split Editor Down"),
		icon: Codicon.splitVertical
	},
	ContextKeyExpr.has('splitEditorsVertically'),
	SPLIT_ORDER,
	{
		id: SPLIT_EDITOR_RIGHT,
		title: localize('splitEditorRight', "Split Editor Right"),
		icon: Codicon.splitHorizontal
	}
);

// Side by side: layout
appendEditorToolItem(
	{
		id: TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
		title: localize('toggleSplitEditorInGroupLayout', "Toggle Layout"),
		icon: Codicon.editorLayout
	},
	SideBySideEditorActiveContext,
	SPLIT_ORDER - 1, // left to split actions
);

// Editor Title Menu: Close (tabs disabled, normal editor)
appendEditorToolItem(
	{
		id: CLOSE_EDITOR_COMMAND_ID,
		title: localize('close', "Close"),
		icon: Codicon.close
	},
	ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext.toNegated()),
	CLOSE_ORDER,
	{
		id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		title: localize('closeAll', "Close All"),
		icon: Codicon.closeAll
	}
);

// Editor Title Menu: Close (tabs disabled, dirty editor)
appendEditorToolItem(
	{
		id: CLOSE_EDITOR_COMMAND_ID,
		title: localize('close', "Close"),
		icon: Codicon.closeDirty
	},
	ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext.toNegated()),
	CLOSE_ORDER,
	{
		id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
		title: localize('closeAll', "Close All"),
		icon: Codicon.closeAll
	}
);

// Editor Title Menu: Close (tabs disabled, sticky editor)
appendEditorToolItem(
	{
		id: UNPIN_EDITOR_COMMAND_ID,
		title: localize('unpin', "Unpin"),
		icon: Codicon.pinned
	},
	ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext),
	CLOSE_ORDER,
	{
		id: CLOSE_EDITOR_COMMAND_ID,
		title: localize('close', "Close"),
		icon: Codicon.close
	}
);

// Editor Title Menu: Close (tabs disabled, dirty & sticky editor)
appendEditorToolItem(
	{
		id: UNPIN_EDITOR_COMMAND_ID,
		title: localize('unpin', "Unpin"),
		icon: Codicon.pinnedDirty
	},
	ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext),
	CLOSE_ORDER,
	{
		id: CLOSE_EDITOR_COMMAND_ID,
		title: localize('close', "Close"),
		icon: Codicon.close
	}
);

// Unlock Group: only when group is locked
appendEditorToolItem(
	{
		id: UNLOCK_GROUP_COMMAND_ID,
		title: localize('unlockEditorGroup', "Unlock Group"),
		icon: Codicon.lock
	},
	ActiveEditorGroupLockedContext,
	CLOSE_ORDER - 1, // left to close action
);

const previousChangeIcon = registerIcon('diff-editor-previous-change', Codicon.arrowUp, localize('previousChangeIcon', 'Icon for the previous change action in the diff editor.'));
const nextChangeIcon = registerIcon('diff-editor-next-change', Codicon.arrowDown, localize('nextChangeIcon', 'Icon for the next change action in the diff editor.'));
const toggleWhitespace = registerIcon('diff-editor-toggle-whitespace', Codicon.whitespace, localize('toggleWhitespace', 'Icon for the toggle whitespace action in the diff editor.'));

// Diff Editor Title Menu: Previous Change
appendEditorToolItem(
	{
		id: GOTO_PREVIOUS_CHANGE,
		title: localize('navigate.prev.label', "Previous Change"),
		icon: previousChangeIcon
	},
	TextCompareEditorActiveContext,
	10
);

// Diff Editor Title Menu: Next Change
appendEditorToolItem(
	{
		id: GOTO_NEXT_CHANGE,
		title: localize('navigate.next.label', "Next Change"),
		icon: nextChangeIcon
	},
	TextCompareEditorActiveContext,
	11
);

// Diff Editor Title Menu: Toggle Ignore Trim Whitespace (Enabled)
appendEditorToolItem(
	{
		id: TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
		title: localize('ignoreTrimWhitespace.label', "Ignore Leading/Trailing Whitespace Differences"),
		icon: toggleWhitespace
	},
	ContextKeyExpr.and(TextCompareEditorActiveContext, ContextKeyExpr.notEquals('config.diffEditor.ignoreTrimWhitespace', true)),
	20
);

// Diff Editor Title Menu: Toggle Ignore Trim Whitespace (Disabled)
appendEditorToolItem(
	{
		id: TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
		title: localize('showTrimWhitespace.label', "Show Leading/Trailing Whitespace Differences"),
		icon: ThemeIcon.modify(toggleWhitespace, 'disabled')
	},
	ContextKeyExpr.and(TextCompareEditorActiveContext, ContextKeyExpr.notEquals('config.diffEditor.ignoreTrimWhitespace', false)),
	20
);

// Editor Commands for Command Palette
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: KEEP_EDITOR_COMMAND_ID, title: { value: localize('keepEditor', "Keep Editor"), original: 'Keep Editor' }, category: CATEGORIES.View }, when: ContextKeyExpr.has('config.workbench.editor.enablePreview') });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: PIN_EDITOR_COMMAND_ID, title: { value: localize('pinEditor', "Pin Editor"), original: 'Pin Editor' }, category: CATEGORIES.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: { value: localize('unpinEditor', "Unpin Editor"), original: 'Unpin Editor' }, category: CATEGORIES.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: { value: localize('closeEditor', "Close Editor"), original: 'Close Editor' }, category: CATEGORIES.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_PINNED_EDITOR_COMMAND_ID, title: { value: localize('closePinnedEditor', "Close Pinned Editor"), original: 'Close Pinned Editor' }, category: CATEGORIES.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: { value: localize('closeEditorsInGroup', "Close All Editors in Group"), original: 'Close All Editors in Group' }, category: CATEGORIES.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: { value: localize('closeSavedEditors', "Close Saved Editors in Group"), original: 'Close Saved Editors in Group' }, category: CATEGORIES.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: { value: localize('closeOtherEditors', "Close Other Editors in Group"), original: 'Close Other Editors in Group' }, category: CATEGORIES.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: { value: localize('closeRightEditors', "Close Editors to the Right in Group"), original: 'Close Editors to the Right in Group' }, category: CATEGORIES.View }, when: ActiveEditorLastInGroupContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_AND_GROUP_COMMAND_ID, title: { value: localize('closeEditorGroup', "Close Editor Group"), original: 'Close Editor Group' }, category: CATEGORIES.View }, when: MultipleEditorGroupsContext });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: REOPEN_WITH_COMMAND_ID, title: { value: localize('reopenWith', "Reopen Editor With..."), original: 'Reopen Editor With...' }, category: CATEGORIES.View }, when: ActiveEditorAvailableEditorIdsContext });

// File menu
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
	group: '1_editor',
	command: {
		id: ReopenClosedEditorAction.ID,
		title: localize({ key: 'miReopenClosedEditor', comment: ['&& denotes a mnemonic'] }, "&&Reopen Closed Editor"),
		precondition: ContextKeyExpr.has('canReopenClosedEditor')
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
	group: 'z_clear',
	command: {
		id: ClearRecentFilesAction.ID,
		title: localize({ key: 'miClearRecentOpen', comment: ['&& denotes a mnemonic'] }, "&&Clear Recently Opened")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
	title: localize('miShare', "Share"),
	submenu: MenuId.MenubarShare,
	group: '45_share',
	order: 1,
});

// Layout menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '2_appearance',
	title: localize({ key: 'miEditorLayout', comment: ['&& denotes a mnemonic'] }, "Editor &&Layout"),
	submenu: MenuId.MenubarLayoutMenu,
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: SPLIT_EDITOR_UP,
		title: {
			original: 'Split Up',
			value: localize('miSplitEditorUpWithoutMnemonic', "Split Up"),
			mnemonicTitle: localize({ key: 'miSplitEditorUp', comment: ['&& denotes a mnemonic'] }, "Split &&Up"),
		}
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: SPLIT_EDITOR_DOWN,
		title: {
			original: 'Split Down',
			value: localize('miSplitEditorDownWithoutMnemonic', "Split Down"),
			mnemonicTitle: localize({ key: 'miSplitEditorDown', comment: ['&& denotes a mnemonic'] }, "Split &&Down")
		}
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: SPLIT_EDITOR_LEFT,
		title: {
			original: 'Split Left',
			value: localize('miSplitEditorLeftWithoutMnemonic', "Split Left"),
			mnemonicTitle: localize({ key: 'miSplitEditorLeft', comment: ['&& denotes a mnemonic'] }, "Split &&Left")
		}
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '1_split',
	command: {
		id: SPLIT_EDITOR_RIGHT,
		title: {
			original: 'Split Right',
			value: localize('miSplitEditorRightWithoutMnemonic', "Split Right"),
			mnemonicTitle: localize({ key: 'miSplitEditorRight', comment: ['&& denotes a mnemonic'] }, "Split &&Right")
		}
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_split_in_group',
	command: {
		id: SPLIT_EDITOR_IN_GROUP,
		title: {
			original: 'Split in Group',
			value: localize('miSplitEditorInGroupWithoutMnemonic', "Split in Group"),
			mnemonicTitle: localize({ key: 'miSplitEditorInGroup', comment: ['&& denotes a mnemonic'] }, "Split in &&Group")
		}
	},
	when: ActiveEditorCanSplitInGroupContext,
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '2_split_in_group',
	command: {
		id: JOIN_EDITOR_IN_GROUP,
		title: {
			original: 'Join in Group',
			value: localize('miJoinEditorInGroupWithoutMnemonic', "Join in Group"),
			mnemonicTitle: localize({ key: 'miJoinEditorInGroup', comment: ['&& denotes a mnemonic'] }, "Join in &&Group")
		}
	},
	when: SideBySideEditorActiveContext,
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutSingleAction.ID,
		title: {
			original: 'Single',
			value: localize('miSingleColumnEditorLayoutWithoutMnemonic', "Single"),
			mnemonicTitle: localize({ key: 'miSingleColumnEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Single")
		}
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutTwoColumnsAction.ID,
		title: {
			original: 'Two Columns',
			value: localize('miTwoColumnsEditorLayoutWithoutMnemonic', "Two Columns"),
			mnemonicTitle: localize({ key: 'miTwoColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Two Columns")
		}
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutThreeColumnsAction.ID,
		title: {
			original: 'Three Columns',
			value: localize('miThreeColumnsEditorLayoutWithoutMnemonic', "Three Columns"),
			mnemonicTitle: localize({ key: 'miThreeColumnsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&hree Columns")
		}
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutTwoRowsAction.ID,
		title: {
			original: 'Two Rows',
			value: localize('miTwoRowsEditorLayoutWithoutMnemonic', "Two Rows"),
			mnemonicTitle: localize({ key: 'miTwoRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "T&&wo Rows")
		}
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutThreeRowsAction.ID,
		title: {
			original: 'Three Rows',
			value: localize('miThreeRowsEditorLayoutWithoutMnemonic', "Three Rows"),
			mnemonicTitle: localize({ key: 'miThreeRowsEditorLayout', comment: ['&& denotes a mnemonic'] }, "Three &&Rows")
		}
	},
	order: 6
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutTwoByTwoGridAction.ID,
		title: {
			original: 'Grid (2x2)',
			value: localize('miTwoByTwoGridEditorLayoutWithoutMnemonic', "Grid (2x2)"),
			mnemonicTitle: localize({ key: 'miTwoByTwoGridEditorLayout', comment: ['&& denotes a mnemonic'] }, "&&Grid (2x2)")
		}
	},
	order: 7
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutTwoRowsRightAction.ID,
		title: {
			original: 'Two Rows Right',
			value: localize('miTwoRowsRightEditorLayoutWithoutMnemonic', "Two Rows Right"),
			mnemonicTitle: localize({ key: 'miTwoRowsRightEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two R&&ows Right")
		}
	},
	order: 8
});

MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
	group: '3_layouts',
	command: {
		id: EditorLayoutTwoColumnsBottomAction.ID,
		title: {
			original: 'Two Columns Bottom',
			value: localize('miTwoColumnsBottomEditorLayoutWithoutMnemonic', "Two Columns Bottom"),
			mnemonicTitle: localize({ key: 'miTwoColumnsBottomEditorLayout', comment: ['&& denotes a mnemonic'] }, "Two &&Columns Bottom")
		}
	},
	order: 9
});

// Main Menu Bar Contributions:

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '1_history_nav',
	command: {
		id: 'workbench.action.navigateToLastEditLocation',
		title: localize({ key: 'miLastEditLocation', comment: ['&& denotes a mnemonic'] }, "&&Last Edit Location"),
		precondition: ContextKeyExpr.has('canNavigateToLastEditLocation')
	},
	order: 3
});

// Switch Editor

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '1_sideBySide',
	command: {
		id: FOCUS_FIRST_SIDE_EDITOR,
		title: localize({ key: 'miFirstSideEditor', comment: ['&& denotes a mnemonic'] }, "&&First Side in Editor")
	},
	when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '1_sideBySide',
	command: {
		id: FOCUS_SECOND_SIDE_EDITOR,
		title: localize({ key: 'miSecondSideEditor', comment: ['&& denotes a mnemonic'] }, "&&Second Side in Editor")
	},
	when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '2_any',
	command: {
		id: 'workbench.action.nextEditor',
		title: localize({ key: 'miNextEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Editor")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '2_any',
	command: {
		id: 'workbench.action.previousEditor',
		title: localize({ key: 'miPreviousEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '3_any_used',
	command: {
		id: 'workbench.action.openNextRecentlyUsedEditor',
		title: localize({ key: 'miNextRecentlyUsedEditor', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '3_any_used',
	command: {
		id: 'workbench.action.openPreviousRecentlyUsedEditor',
		title: localize({ key: 'miPreviousRecentlyUsedEditor', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '4_group',
	command: {
		id: 'workbench.action.nextEditorInGroup',
		title: localize({ key: 'miNextEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Editor in Group")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '4_group',
	command: {
		id: 'workbench.action.previousEditorInGroup',
		title: localize({ key: 'miPreviousEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Editor in Group")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '5_group_used',
	command: {
		id: 'workbench.action.openNextRecentlyUsedEditorInGroup',
		title: localize({ key: 'miNextUsedEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Used Editor in Group")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
	group: '5_group_used',
	command: {
		id: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
		title: localize({ key: 'miPreviousUsedEditorInGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Used Editor in Group")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '2_editor_nav',
	title: localize({ key: 'miSwitchEditor', comment: ['&& denotes a mnemonic'] }, "Switch &&Editor"),
	submenu: MenuId.MenubarSwitchEditorMenu,
	order: 1
});

// Switch Group
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusFirstEditorGroup',
		title: localize({ key: 'miFocusFirstGroup', comment: ['&& denotes a mnemonic'] }, "Group &&1")
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusSecondEditorGroup',
		title: localize({ key: 'miFocusSecondGroup', comment: ['&& denotes a mnemonic'] }, "Group &&2")
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusThirdEditorGroup',
		title: localize({ key: 'miFocusThirdGroup', comment: ['&& denotes a mnemonic'] }, "Group &&3"),
		precondition: MultipleEditorGroupsContext
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusFourthEditorGroup',
		title: localize({ key: 'miFocusFourthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&4"),
		precondition: MultipleEditorGroupsContext
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '1_focus_index',
	command: {
		id: 'workbench.action.focusFifthEditorGroup',
		title: localize({ key: 'miFocusFifthGroup', comment: ['&& denotes a mnemonic'] }, "Group &&5"),
		precondition: MultipleEditorGroupsContext
	},
	order: 5
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '2_next_prev',
	command: {
		id: 'workbench.action.focusNextGroup',
		title: localize({ key: 'miNextGroup', comment: ['&& denotes a mnemonic'] }, "&&Next Group"),
		precondition: MultipleEditorGroupsContext
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '2_next_prev',
	command: {
		id: 'workbench.action.focusPreviousGroup',
		title: localize({ key: 'miPreviousGroup', comment: ['&& denotes a mnemonic'] }, "&&Previous Group"),
		precondition: MultipleEditorGroupsContext
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusLeftGroup',
		title: localize({ key: 'miFocusLeftGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Left"),
		precondition: MultipleEditorGroupsContext
	},
	order: 1
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusRightGroup',
		title: localize({ key: 'miFocusRightGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Right"),
		precondition: MultipleEditorGroupsContext
	},
	order: 2
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusAboveGroup',
		title: localize({ key: 'miFocusAboveGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Above"),
		precondition: MultipleEditorGroupsContext
	},
	order: 3
});

MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
	group: '3_directional',
	command: {
		id: 'workbench.action.focusBelowGroup',
		title: localize({ key: 'miFocusBelowGroup', comment: ['&& denotes a mnemonic'] }, "Group &&Below"),
		precondition: MultipleEditorGroupsContext
	},
	order: 4
});

MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
	group: '2_editor_nav',
	title: localize({ key: 'miSwitchGroup', comment: ['&& denotes a mnemonic'] }, "Switch &&Group"),
	submenu: MenuId.MenubarSwitchGroupMenu,
	order: 2
});

//#endregion
