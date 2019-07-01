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
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { Extensions as EditorInputExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { WebviewEditorInputFactory } from 'vs/workbench/contrib/webview/browser/webviewEditorInputFactory';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE, webviewDeveloperCategory } from 'vs/workbench/contrib/webview/common/webview';
import { HideWebViewEditorFindCommand, ReloadWebviewAction, ShowWebViewEditorFindWidgetCommand } from '../browser/webviewCommands';
import { WebviewEditor } from '../browser/webviewEditor';
import { WebviewEditorInput } from '../browser/webviewEditorInput';
import { IWebviewEditorService, WebviewEditorService } from '../browser/webviewEditorService';

(Registry.as<IEditorRegistry>(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewEditorInput)]);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(
	WebviewEditorInputFactory.ID,
	WebviewEditorInputFactory);

registerSingleton(IWebviewEditorService, WebviewEditorService, true);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

function registerWebViewCommands(editorId: string): void {
	const contextKeyExpr = ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', editorId), ContextKeyExpr.not('editorFocus') /* https://github.com/Microsoft/vscode/issues/58668 */);

	const showNextFindWidgetCommand = new ShowWebViewEditorFindWidgetCommand({
		id: ShowWebViewEditorFindWidgetCommand.ID,
		precondition: contextKeyExpr,
		kbOpts: {
			primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
			weight: KeybindingWeight.EditorContrib
		}
	});
	showNextFindWidgetCommand.register();

	(new HideWebViewEditorFindCommand({
		id: HideWebViewEditorFindCommand.ID,
		precondition: ContextKeyExpr.and(
			contextKeyExpr,
			KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_VISIBLE),
		kbOpts: {
			primary: KeyCode.Escape,
			weight: KeybindingWeight.EditorContrib
		}
	})).register();
}

registerWebViewCommands(WebviewEditor.ID);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(ReloadWebviewAction, ReloadWebviewAction.ID, ReloadWebviewAction.LABEL),
	'Reload Webviews',
	webviewDeveloperCategory);
