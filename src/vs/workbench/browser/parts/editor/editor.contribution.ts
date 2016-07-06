/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import nls = require('vs/nls');
import {Action, IAction} from 'vs/base/common/actions';
import {IEditorQuickOpenEntry, IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor} from 'vs/workbench/browser/quickopen';
import {StatusbarItemDescriptor, StatusbarAlignment, IStatusbarRegistry, Extensions as StatusExtensions} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {IEditorRegistry, Extensions as EditorExtensions} from 'vs/workbench/common/editor';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {StringEditor} from 'vs/workbench/browser/parts/editor/stringEditor';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {UntitledEditorInput} from 'vs/workbench/common/editor/untitledEditorInput';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {IInstantiationService, ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KbExpr, IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {TextDiffEditor} from 'vs/workbench/browser/parts/editor/textDiffEditor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {BinaryResourceDiffEditor} from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IConfigurationRegistry, Extensions as ConfigurationExtensions} from 'vs/platform/configuration/common/configurationRegistry';
import {ChangeEncodingAction, ChangeEOLAction, ChangeModeAction, EditorStatus} from 'vs/workbench/browser/parts/editor/editorStatus';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, ActionBarContributor} from 'vs/workbench/browser/actionBarRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {SyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {EditorStacksModel} from 'vs/workbench/common/editor/editorStacksModel';
import {CloseEditorsInGroupAction, CloseEditorsInOtherGroupsAction, CloseAllEditorsAction, MoveGroupLeftAction, MoveGroupRightAction, SplitEditorAction, KeepEditorAction, CloseOtherEditorsInGroupAction, OpenToSideAction,
	NavigateBetweenGroupsAction, FocusFirstGroupAction, FocusSecondGroupAction, FocusThirdGroupAction, EvenGroupWidthsAction, MaximizeGroupAction, MinimizeOtherGroupsAction, FocusPreviousGroup, FocusNextGroup, ShowEditorsInLeftGroupAction,
	toEditorQuickOpenEntry, CloseLeftEditorsInGroupAction, CloseRightEditorsInGroupAction, OpenNextEditor, OpenPreviousEditor, NavigateBackwardsAction, NavigateForwardAction, ReopenClosedEditorAction, OpenPreviousRecentlyUsedEditorInGroupAction, NAVIGATE_IN_LEFT_GROUP_PREFIX,
	GlobalQuickOpenAction, OpenPreviousEditorFromHistoryAction, QuickOpenNavigateNextAction, QuickOpenNavigatePreviousAction, ShowAllEditorsAction, NAVIGATE_ALL_EDITORS_GROUP_PREFIX, ClearEditorHistoryAction, ShowEditorsInCenterGroupAction,
	NAVIGATE_IN_CENTER_GROUP_PREFIX, ShowEditorsInRightGroupAction, NAVIGATE_IN_RIGHT_GROUP_PREFIX, RemoveFromEditorHistoryAction, FocusLastEditorInStackAction, OpenNextRecentlyUsedEditorInGroupAction
} from 'vs/workbench/browser/parts/editor/editorActions';

// Register String Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
	new EditorDescriptor(
		StringEditor.ID,
		nls.localize('textEditor', "Text Editor"),
		'vs/workbench/browser/parts/editor/stringEditor',
		'StringEditor'
	),
	[
		new SyncDescriptor(StringEditorInput),
		new SyncDescriptor(UntitledEditorInput),
		new SyncDescriptor(ResourceEditorInput)
	]
);

// Register Text Diff Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
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
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
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

// Register Editor Status
let statusBar = (<IStatusbarRegistry>Registry.as(StatusExtensions.Statusbar));
statusBar.registerStatusbarItem(new StatusbarItemDescriptor(EditorStatus, StatusbarAlignment.RIGHT, 100 /* High Priority */));

// Register Status Actions
let registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_M) }), 'Change Language Mode');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEOLAction, ChangeEOLAction.ID, ChangeEOLAction.LABEL), 'Change End of Line Sequence');
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEncodingAction, ChangeEncodingAction.ID, ChangeEncodingAction.LABEL), 'Change File Encoding');

// Register keybinding for "Next Change" & "Previous Change" in visible diff editor
KeybindingsRegistry.registerCommandDesc({
	id: 'workbench.action.compareEditor.nextChange',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: KbExpr.has('textCompareEditorVisible'),
	primary: null,
	handler: accessor => navigateInDiffEditor(accessor, true)
});

KeybindingsRegistry.registerCommandDesc({
	id: 'workbench.action.compareEditor.previousChange',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	when: KbExpr.has('textCompareEditorVisible'),
	primary: null,
	handler: accessor => navigateInDiffEditor(accessor, false)
});

function navigateInDiffEditor(accessor: ServicesAccessor, next: boolean): void {
	let editorService = accessor.get(IWorkbenchEditorService);
	const candidates = [editorService.getActiveEditor(), ...editorService.getVisibleEditors()].filter(e => e instanceof TextDiffEditor);

	if (candidates.length > 0) {
		next ? (<TextDiffEditor>candidates[0]).getDiffNavigator().next() : (<TextDiffEditor>candidates[0]).getDiffNavigator().previous();
	}
}

KeybindingsRegistry.registerCommandDesc({
	id: '_workbench.printStacksModel',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	handler(accessor: ServicesAccessor) {
		console.log(`${accessor.get(IEditorGroupService).getStacksModel().toString()}\n\n`);
	},
	when: undefined,
	primary: undefined
});

KeybindingsRegistry.registerCommandDesc({
	id: '_workbench.validateStacksModel',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(0),
	handler(accessor: ServicesAccessor) {
		(<EditorStacksModel>accessor.get(IEditorGroupService).getStacksModel()).validate();
	},
	when: undefined,
	primary: undefined
});

export class QuickOpenActionContributor extends ActionBarContributor {
	private openToSideActionInstance: OpenToSideAction;

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActions(context: any): boolean {
		let entry = this.getEntry(context);

		return !!entry;
	}

	public getActions(context: any): IAction[] {
		let actions: Action[] = [];

		let entry = this.getEntry(context);
		if (entry) {
			if (!this.openToSideActionInstance) {
				this.openToSideActionInstance = this.instantiationService.createInstance(OpenToSideAction);
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

const actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
actionBarRegistry.registerActionBarContributor(Scope.VIEWER, QuickOpenActionContributor);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/browser/parts/editor/editorPicker',
		'LeftEditorGroupPicker',
		NAVIGATE_IN_LEFT_GROUP_PREFIX,
		[
			{
				prefix: NAVIGATE_IN_LEFT_GROUP_PREFIX,
				needsEditor: false,
				description: nls.localize('leftEditorGroupPicker', "Show Editors in Left Group")
			}
		]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/browser/parts/editor/editorPicker',
		'CenterEditorGroupPicker',
		NAVIGATE_IN_CENTER_GROUP_PREFIX,
		[
			{
				prefix: NAVIGATE_IN_CENTER_GROUP_PREFIX,
				needsEditor: false,
				description: nls.localize('centerEditorGroupPicker', "Show Editors in Center Group")
			}
		]
	)
);

Registry.as<IQuickOpenRegistry>(QuickOpenExtensions.Quickopen).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		'vs/workbench/browser/parts/editor/editorPicker',
		'RightEditorGroupPicker',
		NAVIGATE_IN_RIGHT_GROUP_PREFIX,
		[
			{
				prefix: NAVIGATE_IN_RIGHT_GROUP_PREFIX,
				needsEditor: false,
				description: nls.localize('rightEditorGroupPicker', "Show Editors in Right Group")
			}
		]
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

const quickOpenKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
	secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E]
};

function navigateKeybinding(shift: boolean): IKeybindings {
	if (shift) {
		return {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
			secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab],
			mac: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_P,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E, KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab]
			}
		};
	} else {
		return {
			primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
			secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E, KeyMod.CtrlCmd | KeyCode.Tab],
			mac: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_P,
				secondary: [KeyMod.CtrlCmd | KeyCode.KEY_E, KeyMod.WinCtrl | KeyCode.Tab]
			}
		};
	}
}

// Register Editor Actions
const category = nls.localize('view', "View");
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextRecentlyUsedEditorInGroupAction, OpenNextRecentlyUsedEditorInGroupAction.ID, OpenNextRecentlyUsedEditorInGroupAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.Tab,
	mac: {
		primary: KeyMod.WinCtrl | KeyCode.Tab
	}
}), 'Open Next Recently Used Editor in Group');
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousRecentlyUsedEditorInGroupAction, OpenPreviousRecentlyUsedEditorInGroupAction.ID, OpenPreviousRecentlyUsedEditorInGroupAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
	mac: {
		primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab
	}
}), 'Open Previous Recently Used Editor in Group');
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowAllEditorsAction, ShowAllEditorsAction.ID, ShowAllEditorsAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_P), mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Tab } }), 'View: Show All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInLeftGroupAction, ShowEditorsInLeftGroupAction.ID, ShowEditorsInLeftGroupAction.LABEL), 'View: Show Editors in Left Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInCenterGroupAction, ShowEditorsInCenterGroupAction.ID, ShowEditorsInCenterGroupAction.LABEL), 'View: Show Editors in Center Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowEditorsInRightGroupAction, ShowEditorsInRightGroupAction.ID, ShowEditorsInRightGroupAction.LABEL), 'View: Show Editors in Left Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextEditor, OpenNextEditor.ID, OpenNextEditor.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.PageDown,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.RightArrow }
}), 'View: Open Next Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditor, OpenPreviousEditor.ID, OpenPreviousEditor.LABEL, {
	primary: KeyMod.CtrlCmd | KeyCode.PageUp,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.LeftArrow }
}), 'View: Open Previous Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(ReopenClosedEditorAction, ReopenClosedEditorAction.ID, ReopenClosedEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_T }), 'View: Reopen Closed Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(KeepEditorAction, KeepEditorAction.ID, KeepEditorAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.Enter) }), 'View: Keep Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseAllEditorsAction, CloseAllEditorsAction.ID, CloseAllEditorsAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_W) }), 'View: Close All Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseLeftEditorsInGroupAction, CloseLeftEditorsInGroupAction.ID, CloseLeftEditorsInGroupAction.LABEL), 'View: Close Editors to the Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseRightEditorsInGroupAction, CloseRightEditorsInGroupAction.ID, CloseRightEditorsInGroupAction.LABEL), 'View: Close Editors to the Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, CloseEditorsInGroupAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_W) }), 'View: Close All Editors in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseOtherEditorsInGroupAction, CloseOtherEditorsInGroupAction.ID, CloseOtherEditorsInGroupAction.LABEL, { primary: null, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_T } }), 'View: Close Other Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(CloseEditorsInOtherGroupsAction, CloseEditorsInOtherGroupsAction.ID, CloseEditorsInOtherGroupsAction.LABEL), 'View: Close Editors in Other Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(SplitEditorAction, SplitEditorAction.ID, SplitEditorAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.US_BACKSLASH }), 'View: Split Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBetweenGroupsAction, NavigateBetweenGroupsAction.ID, NavigateBetweenGroupsAction.LABEL), 'View: Navigate Between Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusFirstGroupAction, FocusFirstGroupAction.ID, FocusFirstGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_1 }), 'View: Focus Left Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusSecondGroupAction, FocusSecondGroupAction.ID, FocusSecondGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_2 }), 'View: Focus Center Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusThirdGroupAction, FocusThirdGroupAction.ID, FocusThirdGroupAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_3 }), 'View: Focus Right Editor Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusLastEditorInStackAction, FocusLastEditorInStackAction.ID, FocusLastEditorInStackAction.LABEL, { primary: KeyMod.Alt | KeyCode.KEY_0, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_0 } }), 'View: Focus Last Editor in Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(EvenGroupWidthsAction, EvenGroupWidthsAction.ID, EvenGroupWidthsAction.LABEL), 'View: Even Editor Group Widths', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MaximizeGroupAction, MaximizeGroupAction.ID, MaximizeGroupAction.LABEL), 'View: Maximize Editor Group and Hide Sidebar', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MinimizeOtherGroupsAction, MinimizeOtherGroupsAction.ID, MinimizeOtherGroupsAction.LABEL), 'View: Minimize Other Editor Groups', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupLeftAction, MoveGroupLeftAction.ID, MoveGroupLeftAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.LeftArrow) }), 'View: Move Editor Group Left', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(MoveGroupRightAction, MoveGroupRightAction.ID, MoveGroupRightAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.RightArrow) }), 'View: Move Editor Group Right', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusPreviousGroup, FocusPreviousGroup.ID, FocusPreviousGroup.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.LeftArrow) }), 'View: Focus Previous Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusNextGroup, FocusNextGroup.ID, FocusNextGroup.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.RightArrow) }), 'View: Focus Next Group', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateForwardAction, NavigateForwardAction.ID, NavigateForwardAction.LABEL, {
	primary: null,
	win: { primary: KeyMod.Alt | KeyCode.RightArrow },
	mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.US_MINUS },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS }
}), 'Go Forward');

registry.registerWorkbenchAction(new SyncActionDescriptor(NavigateBackwardsAction, NavigateBackwardsAction.ID, NavigateBackwardsAction.LABEL, {
	primary: null,
	win: { primary: KeyMod.Alt | KeyCode.LeftArrow },
	mac: { primary: KeyMod.WinCtrl | KeyCode.US_MINUS },
	linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.US_MINUS }
}), 'Go Back');

registry.registerWorkbenchAction(new SyncActionDescriptor(GlobalQuickOpenAction, GlobalQuickOpenAction.ID, GlobalQuickOpenAction.LABEL, quickOpenKb), 'Go to File...');
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenPreviousEditorFromHistoryAction, OpenPreviousEditorFromHistoryAction.ID, OpenPreviousEditorFromHistoryAction.LABEL), 'Open Previous Editor from History');
registry.registerWorkbenchAction(new SyncActionDescriptor(ClearEditorHistoryAction, ClearEditorHistoryAction.ID, ClearEditorHistoryAction.LABEL), 'Clear Editor History');
registry.registerWorkbenchAction(new SyncActionDescriptor(RemoveFromEditorHistoryAction, RemoveFromEditorHistoryAction.ID, RemoveFromEditorHistoryAction.LABEL), 'Remove From Editor History');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigateNextAction, QuickOpenNavigateNextAction.ID, QuickOpenNavigateNextAction.LABEL, navigateKeybinding(false), KbExpr.has('inQuickOpen')), 'Navigate Next in Quick Open');
registry.registerWorkbenchAction(new SyncActionDescriptor(QuickOpenNavigatePreviousAction, QuickOpenNavigatePreviousAction.ID, QuickOpenNavigatePreviousAction.LABEL, navigateKeybinding(true), KbExpr.has('inQuickOpen'), KeybindingsRegistry.WEIGHT.workbenchContrib(50)), 'Navigate Previous in Quick Open');

// Keybindings to focus a specific index in the tab folder if tabs are enabled
for (let i = 0; i < 9; i++) {
	const editorIndex = i;
	const visibleIndex = i + 1;

	KeybindingsRegistry.registerCommandDesc({
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
}

// Configuration
let configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'workbench',
	'order': 7,
	'title': nls.localize('workbenchConfigurationTitle', "Workbench"),
	'type': 'object',
	'properties': {
		'workbench.editor.showTabs': {
			'type': 'boolean',
			'description': nls.localize('showEditorTabs', "Controls if opened editors should show in tabs or not."),
			'default': true
		},
		'workbench.editor.enablePreview': {
			'type': 'boolean',
			'description': nls.localize('enablePreview', "Controls if opened editors show as preview. Preview editors are reused until they are kept (e.g. via double click or editing)."),
			'default': true
		},
		'workbench.editor.enablePreviewFromQuickOpen': {
			'type': 'boolean',
			'description': nls.localize('enablePreviewFromQuickOpen', "Controls if opened editors from quick open show as preview. Preview editors are reused until they are kept (e.g. via double click or editing)."),
			'default': true
		},
		'workbench.editor.openPositioning': {
			'type': 'string',
			'enum': ['left', 'right', 'first', 'last'],
			'default': 'right',
			'description': nls.localize('editorOpenPositioning', "Controls where editors open. Select 'left' or 'right' to open editors to the left or right of the current active one. Select 'first' or 'last' to open editors independently from the currently active one.")
		}
	}
});