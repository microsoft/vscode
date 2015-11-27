/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import nls = require('vs/nls');
import {StatusbarItemDescriptor, StatusbarAlignment, IStatusbarRegistry, Extensions as StatusExtensions} from 'vs/workbench/browser/parts/statusbar/statusbar';
import {EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions} from 'vs/workbench/browser/parts/editor/baseEditor';
import {StringEditorInput} from 'vs/workbench/browser/parts/editor/stringEditorInput';
import {StringEditor} from 'vs/workbench/browser/parts/editor/stringEditor';
import {DiffEditorInput} from 'vs/workbench/browser/parts/editor/diffEditorInput';
import {UntitledEditorInput} from 'vs/workbench/browser/parts/editor/untitledEditorInput';
import {ResourceEditorInput} from 'vs/workbench/browser/parts/editor/resourceEditorInput';
import {TextDiffEditor} from 'vs/workbench/browser/parts/editor/textDiffEditor';
import {BinaryResourceDiffEditor} from 'vs/workbench/browser/parts/editor/binaryDiffEditor';
import {BinaryResourceEditor} from 'vs/workbench/browser/parts/editor/binaryEditor';
import {IFrameEditor} from 'vs/workbench/browser/parts/editor/iframeEditor';
import {IFrameEditorInput} from 'vs/workbench/browser/parts/editor/iframeEditorInput';
import {ChangeEncodingAction, ChangeEOLAction, ChangeModeAction, EditorStatus} from 'vs/workbench/browser/parts/editor/editorStatus';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/browser/actionRegistry';
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