/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from 'vs/base/common/platform';
import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/clipboard';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IWebviewService, webviewDeveloperCategory, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { getFocusedWebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewCommands';
import * as webviewCommands from 'vs/workbench/contrib/webview/electron-browser/webviewCommands';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';
import { ElectronWebviewService } from 'vs/workbench/contrib/webview/electron-browser/webviewService';
import { UndoCommand, RedoCommand } from 'vs/editor/browser/editorExtensions';

registerSingleton(IWebviewService, ElectronWebviewService, true);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	SyncActionDescriptor.from(webviewCommands.OpenWebviewDeveloperToolsAction),
	webviewCommands.OpenWebviewDeveloperToolsAction.ALIAS,
	webviewDeveloperCategory);

if (isMacintosh) {
	function getActiveElectronBasedWebview(accessor: ServicesAccessor): ElectronWebviewBasedWebview | undefined {
		const webview = getFocusedWebviewEditor(accessor);
		if (!webview) {
			return undefined;
		}

		if (webview instanceof ElectronWebviewBasedWebview) {
			return webview;
		} else if ('getInnerWebview' in (webview as WebviewOverlay)) {
			const innerWebview = (webview as WebviewOverlay).getInnerWebview();
			if (innerWebview instanceof ElectronWebviewBasedWebview) {
				return innerWebview;
			}
		}

		return undefined;
	}

	function withWebview(accessor: ServicesAccessor, f: (webviewe: ElectronWebviewBasedWebview) => void) {
		const webview = getActiveElectronBasedWebview(accessor);
		if (webview) {
			f(webview);
			return true;
		}
		return false;
	}

	const PRIORITY = 100;

	UndoCommand.addImplementation(PRIORITY, accessor => {
		return withWebview(accessor, webview => webview.undo());
	});

	RedoCommand.addImplementation(PRIORITY, accessor => {
		return withWebview(accessor, webview => webview.redo());
	});

	CopyAction?.addImplementation(PRIORITY, accessor => {
		return withWebview(accessor, webview => webview.copy());
	});

	PasteAction?.addImplementation(PRIORITY, accessor => {
		return withWebview(accessor, webview => webview.paste());
	});

	CutAction?.addImplementation(PRIORITY, accessor => {
		return withWebview(accessor, webview => webview.cut());
	});
}
