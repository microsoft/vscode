/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { isMacintosh } from 'vs/base/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { WebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewEditor';
import { IWebviewService, webviewDeveloperCategory } from 'vs/workbench/contrib/webview/common/webview';
import * as webviewCommands from 'vs/workbench/contrib/webview/electron-browser/webviewCommands';
import { ElectronWebviewService } from 'vs/workbench/contrib/webview/electron-browser/webviewService';

registerSingleton(IWebviewService, ElectronWebviewService, true);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(webviewCommands.OpenWebviewDeveloperToolsAction, webviewCommands.OpenWebviewDeveloperToolsAction.ID, webviewCommands.OpenWebviewDeveloperToolsAction.LABEL),
	webviewCommands.OpenWebviewDeveloperToolsAction.ALIAS,
	webviewDeveloperCategory);

function registerWebViewCommands(editorId: string): void {
	const contextKeyExpr = ContextKeyExpr.and(ContextKeyExpr.equals('activeEditor', editorId), ContextKeyExpr.not('editorFocus') /* https://github.com/Microsoft/vscode/issues/58668 */);

	(new webviewCommands.SelectAllWebviewEditorCommand({
		id: webviewCommands.SelectAllWebviewEditorCommand.ID,
		precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
		kbOpts: {
			primary: KeyMod.CtrlCmd | KeyCode.KEY_A,
			weight: KeybindingWeight.EditorContrib
		}
	})).register();

	// These commands are only needed on MacOS where we have to disable the menu bar commands
	if (isMacintosh) {
		(new webviewCommands.CopyWebviewEditorCommand({
			id: webviewCommands.CopyWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_C,
				weight: KeybindingWeight.EditorContrib
			}
		})).register();

		(new webviewCommands.PasteWebviewEditorCommand({
			id: webviewCommands.PasteWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_V,
				weight: KeybindingWeight.EditorContrib
			}
		})).register();

		(new webviewCommands.CutWebviewEditorCommand({
			id: webviewCommands.CutWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_X,
				weight: KeybindingWeight.EditorContrib
			}
		})).register();

		(new webviewCommands.UndoWebviewEditorCommand({
			id: webviewCommands.UndoWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Z,
				weight: KeybindingWeight.EditorContrib
			}
		})).register();

		(new webviewCommands.RedoWebviewEditorCommand({
			id: webviewCommands.RedoWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(contextKeyExpr, ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Y,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z],
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z },
				weight: KeybindingWeight.EditorContrib
			}
		})).register();
	}
}

registerWebViewCommands(WebviewEditor.ID);