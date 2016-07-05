/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/output.contribution';
import nls = require('vs/nls');
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {CommonEditorRegistry, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import platform = require('vs/platform/platform');
import {SyncActionDescriptor} from 'vs/platform/actions/common/actions';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {IWorkbenchActionRegistry, Extensions as ActionExtensions} from 'vs/workbench/common/actionRegistry';
import {OutputService} from 'vs/workbench/parts/output/common/outputServices';
import {ClearOutputEditorAction, ToggleOutputAction} from 'vs/workbench/parts/output/browser/outputActions';
import {OUTPUT_MIME, OUTPUT_MODE_ID, OUTPUT_PANEL_ID, IOutputService} from 'vs/workbench/parts/output/common/output';
import panel = require('vs/workbench/browser/panel');

// Register Service
registerSingleton(IOutputService, OutputService);

// Register Output Mode
ModesRegistry.registerCompatMode({
	id: OUTPUT_MODE_ID,
	extensions: [],
	aliases: [null],
	mimetypes: [OUTPUT_MIME],
	moduleId: 'vs/workbench/parts/output/common/outputMode',
	ctorName: 'OutputMode'
});

// Register Output Panel
(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/output/browser/outputPanel',
	'OutputPanel',
	OUTPUT_PANEL_ID,
	nls.localize('output', "Output"),
	'output'
));

// register toggle output action globally
let actionRegistry = <IWorkbenchActionRegistry>platform.Registry.as(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleOutputAction, ToggleOutputAction.ID, ToggleOutputAction.LABEL, {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_U,
	linux: {
		primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_H)  // On Ubuntu Ctrl+Shift+U is taken by some global OS command
	}
}), 'View: Toggle Output', nls.localize('viewCategory', "View"));

// Contribute to Context Menu of Output Window
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(ClearOutputEditorAction, ClearOutputEditorAction.ID, nls.localize('clearOutput.label', "Clear Output"), void 0, 'Clear Output'));
