/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from 'vs/base/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IWebviewService, webviewDeveloperCategory } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewEditor';
import * as webviewCommands from 'vs/workbench/contrib/webview/electron-browser/webviewCommands';
import { ElectronWebviewService } from 'vs/workbench/contrib/webview/electron-browser/webviewService';

registerSingleton(IWebviewService, ElectronWebviewService, true);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	SyncActionDescriptor.create(webviewCommands.OpenWebviewDeveloperToolsAction, webviewCommands.OpenWebviewDeveloperToolsAction.ID, webviewCommands.OpenWebviewDeveloperToolsAction.LABEL),
	webviewCommands.OpenWebviewDeveloperToolsAction.ALIAS,
	webviewDeveloperCategory);

function registerWebViewCommands(editorId: string): void {
	const contextKeyExpr = ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', editorId), ContextKeyExpr.not('editorFocus') /* https://github.com/Microsoft/vscode/issues/58668 */)!;

	new webviewCommands.SelectAllWebviewEditorCommand(contextKeyExpr).register();

	// These commands are only needed on MacOS where we have to disable the menu bar commands
	if (isMacintosh) {
		new webviewCommands.CopyWebviewEditorCommand(contextKeyExpr).register();
		new webviewCommands.PasteWebviewEditorCommand(contextKeyExpr).register();
		new webviewCommands.CutWebviewEditorCommand(contextKeyExpr).register();
		new webviewCommands.UndoWebviewEditorCommand(contextKeyExpr).register();
		new webviewCommands.RedoWebviewEditorCommand(contextKeyExpr).register();
	}
}

registerWebViewCommands(WebviewEditor.ID);
