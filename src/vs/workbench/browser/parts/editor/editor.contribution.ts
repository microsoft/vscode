/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {StatusbarItemDescriptor, StatusbarAlignment, IStatusbarRegistry, Extensions as StatusExtensions} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions, IEditorInputActionContext, IEditorInputAction, EditorInputActionContributor, EditorInputAction} from 'vs/workbench/browser/parts/editor/baseEditor';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {StringEditor} from 'vs/workbench/browser/parts/editor/stringEditor';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {UntitledEditorInput} from 'vs/workbench/common/editor/untitledEditorInput';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {IInstantiationService, ServicesAccessor} from 'vs/platform/instantiation/common/instantiation';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {KbExpr} from 'vs/platform/keybinding/common/keybindingService';
import {TextDiffEditor} from 'vs/workbench/browser/parts/editor/textDiffEditor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {BinaryResourceDiffEditor} from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import {IFrameEditor} from 'vs/workbench/browser/parts/editor/iframeEditor';
import {IFrameEditorInput} from 'vs/workbench/common/editor/iframeEditorInput';
import {ChangeEncodingAction, ChangeEOLAction, ChangeModeAction, EditorStatus} from 'vs/workbench/browser/parts/editor/editorStatus';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions} from 'vs/workbench/browser/actionBarRegistry';
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {SyncDescriptor} from 'vs/platform/instantiation/common/descriptors';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

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

// Register IFrame Editor
(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(
	new EditorDescriptor(
		IFrameEditor.ID,
		nls.localize('iframeEditor', "IFrame Editor"),
		'vs/workbench/browser/parts/editor/iframeEditor',
		'IFrameEditor'
	),
	[
		new SyncDescriptor(IFrameEditorInput)
	]
);

// Register Editor Status
let statusBar = (<IStatusbarRegistry>Registry.as(StatusExtensions.Statusbar));
statusBar.registerStatusbarItem(new StatusbarItemDescriptor(EditorStatus, StatusbarAlignment.RIGHT, 100 /* High Priority */));

// Register Actions
let registry = <IWorkbenchActionRegistry>Registry.as(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeModeAction, ChangeModeAction.ID, ChangeModeAction.LABEL, { primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyCode.KEY_M) }));
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEOLAction, ChangeEOLAction.ID, ChangeEOLAction.LABEL));
registry.registerWorkbenchAction(new SyncActionDescriptor(ChangeEncodingAction, ChangeEncodingAction.ID, ChangeEncodingAction.LABEL));


export class ViewSourceEditorInputAction extends EditorInputAction {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super('workbench.files.action.viewSourceFromEditor', nls.localize('viewSource', "View Source"), 'iframe-editor-action view-source');
	}

	public run(event?: any): TPromise<any> {
		let iFrameEditorInput = <IFrameEditorInput>this.input;
		let sideBySide = !!(event && (event.ctrlKey || event.metaKey));

		return this.editorService.openEditor({
			resource: iFrameEditorInput.getResource()
		}, sideBySide);
	}
}

export class RefreshIFrameEditorInputAction extends EditorInputAction {

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super('workbench.files.action.refreshIFrameEditor', nls.localize('reload', "Reload"), 'iframe-editor-action refresh');
	}

	public run(event?: any): TPromise<any> {
		let editor = this.editorService.getActiveEditor();
		if (editor instanceof IFrameEditor) {
			(<IFrameEditor>editor).reload(true);
			(<IFrameEditor>editor).focus();
		}

		return TPromise.as(null);
	}
}

let actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
class IFrameEditorActionContributor extends EditorInputActionContributor {

	constructor( @IInstantiationService private instantiationService: IInstantiationService) {
		super();
	}

	public hasActionsForEditorInput(context: IEditorInputActionContext): boolean {
		return context.input instanceof IFrameEditorInput;
	}

	public getActionsForEditorInput(context: IEditorInputActionContext): IEditorInputAction[] {
		return [
			this.instantiationService.createInstance(RefreshIFrameEditorInputAction),
			this.instantiationService.createInstance(ViewSourceEditorInputAction)
		];
	}
}

// Contribute to IFrame Editor Inputs
actionBarRegistry.registerActionBarContributor(Scope.EDITOR, IFrameEditorActionContributor);

// Register keybinding for "Next Change" & "Previous Change" in visible diff editor
KeybindingsRegistry.registerCommandDesc({
	id: 'workbench.action.compareEditor.nextChange',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	context: KbExpr.has('textCompareEditorVisible'),
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.RightArrow),
	handler: accessor => navigateInDiffEditor(accessor, true)
});

KeybindingsRegistry.registerCommandDesc({
	id: 'workbench.action.compareEditor.previousChange',
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	context: KbExpr.has('textCompareEditorVisible'),
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.LeftArrow),
	handler: accessor => navigateInDiffEditor(accessor, false)
});

function navigateInDiffEditor(accessor: ServicesAccessor, next: boolean): void {
	let editorService = accessor.get(IWorkbenchEditorService);
	const candidates = [editorService.getActiveEditor(), ...editorService.getVisibleEditors()].filter(e => e instanceof TextDiffEditor);

	if (candidates.length > 0) {
		next ? (<TextDiffEditor>candidates[0]).getDiffNavigator().next() : (<TextDiffEditor>candidates[0]).getDiffNavigator().previous();
	}
}