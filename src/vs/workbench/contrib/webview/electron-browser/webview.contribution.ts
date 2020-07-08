/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MultiCommand, RedoCommand, SelectAllCommand, UndoCommand } from 'vs/editor/browser/editorExtensions';
import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/clipboard';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IWebviewService, webviewDeveloperCategory, WebviewOverlay } from 'vs/workbench/contrib/webview/browser/webview';
import { getActiveWebview } from 'vs/workbench/contrib/webview/browser/webviewCommands';
import * as webviewCommands from 'vs/workbench/contrib/webview/electron-browser/webviewCommands';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';
import { ElectronWebviewService } from 'vs/workbench/contrib/webview/electron-browser/webviewService';
import { isMacintosh } from 'vs/base/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

registerSingleton(IWebviewService, ElectronWebviewService, true);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	SyncActionDescriptor.from(webviewCommands.OpenWebviewDeveloperToolsAction),
	webviewCommands.OpenWebviewDeveloperToolsAction.ALIAS,
	webviewDeveloperCategory);

function getActiveElectronBasedWebview(accessor: ServicesAccessor): ElectronWebviewBasedWebview | undefined {
	const webview = getActiveWebview(accessor);
	if (!webview) {
		return undefined;
	}

	// Make sure we are really focused on the webview
	if (!['WEBVIEW', 'IFRAME'].includes(document.activeElement?.tagName ?? '')) {
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

const PRIORITY = 100;

function overrideCommandForWebview(command: MultiCommand | undefined, f: (webview: ElectronWebviewBasedWebview) => void) {
	command?.addImplementation(PRIORITY, accessor => {
		if (!isMacintosh || accessor.get(IConfigurationService).getValue<string>('window.titleBarStyle') !== 'native') {
			return false;
		}

		const webview = getActiveElectronBasedWebview(accessor);
		if (webview) {
			f(webview);
			return true;
		}
		return false;
	});
}

overrideCommandForWebview(UndoCommand, webview => webview.undo());
overrideCommandForWebview(RedoCommand, webview => webview.redo());
overrideCommandForWebview(SelectAllCommand, webview => webview.selectAll());
overrideCommandForWebview(CopyAction, webview => webview.copy());
overrideCommandForWebview(PasteAction, webview => webview.paste());
overrideCommandForWebview(CutAction, webview => webview.cut());
