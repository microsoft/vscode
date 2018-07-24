/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { Extensions as EditorInputExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { WebviewEditorInputFactory } from 'vs/workbench/parts/webview/electron-browser/webviewEditorInputFactory';
import { KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE } from './baseWebviewEditor';
import { HideWebViewEditorFindCommand, OpenWebviewDeveloperToolsAction, ReloadWebviewAction, ShowWebViewEditorFindWidgetCommand, SelectAllWebviewEditorCommand } from './webviewCommands';
import { WebviewEditor } from './webviewEditor';
import { WebviewEditorInput } from './webviewEditorInput';
import { IWebviewEditorService, WebviewEditorService } from './webviewEditorService';

(Registry.as<IEditorRegistry>(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewEditorInput)]);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(
	WebviewEditorInputFactory.ID,
	WebviewEditorInputFactory);

registerSingleton(IWebviewEditorService, WebviewEditorService);


const webviewDeveloperCategory = localize('developer', "Developer");

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

const showNextFindWdigetCommand = new ShowWebViewEditorFindWidgetCommand({
	id: ShowWebViewEditorFindWidgetCommand.ID,
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
		weight: KeybindingsRegistry.WEIGHT.editorContrib()
	}
});
showNextFindWdigetCommand.register();

const hideCommand = new HideWebViewEditorFindCommand({
	id: HideWebViewEditorFindCommand.ID,
	precondition: ContextKeyExpr.and(
		KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
		KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE),
	kbOpts: {
		primary: KeyCode.Escape,
		weight: KeybindingsRegistry.WEIGHT.editorContrib()
	}
});
hideCommand.register();

const selectAllCommand = new SelectAllWebviewEditorCommand({
	id: SelectAllWebviewEditorCommand.ID,
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_A,
		weight: KeybindingsRegistry.WEIGHT.editorContrib()
	}
});
selectAllCommand.register();

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenWebviewDeveloperToolsAction, OpenWebviewDeveloperToolsAction.ID, OpenWebviewDeveloperToolsAction.LABEL),
	'Webview Tools',
	webviewDeveloperCategory);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(ReloadWebviewAction, ReloadWebviewAction.ID, ReloadWebviewAction.LABEL),
	'Reload Webview',
	webviewDeveloperCategory);