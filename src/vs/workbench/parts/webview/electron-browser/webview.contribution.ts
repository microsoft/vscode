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
import { EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { IEditorInputFactoryRegistry, Extensions as EditorInputExtensions } from 'vs/workbench/common/editor';
import { WebviewInputFactory } from 'vs/workbench/parts/webview/electron-browser/webviewInputFactory';
import { KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED, KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE } from './baseWebviewEditor';
import { HideWebViewEditorFindCommand, OpenWebviewDeveloperToolsAction, ReloadWebviewAction, ShowWebViewEditorFindTermCommand, ShowWebViewEditorFindWidgetCommand } from './webviewCommands';
import { WebviewEditor } from './webviewEditor';
import { IWebviewEditorService, WebviewEditorService } from './webviewEditorService';
import { WebviewEditorInput } from './webviewInput';

(Registry.as<IEditorRegistry>(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewEditorInput)]);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(
	WebviewInputFactory.ID,
	WebviewInputFactory);

registerSingleton(IWebviewEditorService, WebviewEditorService);


const webviewDeveloperCategory = localize('developer', "Developer");

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

const showNextFindWdigetCommand = new ShowWebViewEditorFindWidgetCommand({
	id: ShowWebViewEditorFindWidgetCommand.ID,
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	kbOpts: {
		primary: KeyMod.CtrlCmd | KeyCode.KEY_F
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(showNextFindWdigetCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));


const showNextFindTermCommand = new ShowWebViewEditorFindTermCommand({
	id: 'editor.action.webvieweditor.showNextFindTerm',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.DownArrow
	}
}, true);
KeybindingsRegistry.registerCommandAndKeybindingRule(showNextFindTermCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));

const showPreviousFindTermCommand = new ShowWebViewEditorFindTermCommand({
	id: 'editor.action.webvieweditor.showPreviousFindTerm',
	precondition: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED,
	kbOpts: {
		primary: KeyMod.Alt | KeyCode.UpArrow
	}
}, false);
KeybindingsRegistry.registerCommandAndKeybindingRule(showPreviousFindTermCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));


const hideCommand = new HideWebViewEditorFindCommand({
	id: HideWebViewEditorFindCommand.Id,
	precondition: ContextKeyExpr.and(
		KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
		KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE),
	kbOpts: {
		primary: KeyCode.Escape
	}
});
KeybindingsRegistry.registerCommandAndKeybindingRule(hideCommand.toCommandAndKeybindingRule(KeybindingsRegistry.WEIGHT.editorContrib()));


actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenWebviewDeveloperToolsAction, OpenWebviewDeveloperToolsAction.ID, OpenWebviewDeveloperToolsAction.LABEL),
	'Webview Tools',
	webviewDeveloperCategory);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(ReloadWebviewAction, ReloadWebviewAction.ID, ReloadWebviewAction.LABEL),
	'Reload Webview',
	webviewDeveloperCategory);