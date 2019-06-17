/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import * as nls from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { webviewDeveloperCategory } from 'vs/workbench/contrib/webview/common/webview';

export class OpenWebviewDeveloperToolsAction extends Action {
	static readonly ID = 'workbench.action.webview.openDeveloperTools';
	static readonly LABEL = nls.localize('openToolsLabel', "Open Webview Developer Tools");

	public constructor(id: string, label: string) {
		super(id, label);
	}

	public run(): Promise<any> {
		const elements = document.querySelectorAll('webview.ready');
		for (let i = 0; i < elements.length; i++) {
			try {
				(elements.item(i) as Electron.WebviewTag).openDevTools();
			} catch (e) {
				console.error(e);
			}
		}
		return Promise.resolve(true);
	}
}

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenWebviewDeveloperToolsAction, OpenWebviewDeveloperToolsAction.ID, OpenWebviewDeveloperToolsAction.LABEL),
	'Open Webview Developer Tools',
	webviewDeveloperCategory);
