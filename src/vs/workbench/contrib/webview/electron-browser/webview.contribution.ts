/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ActionExtensions, IWorkbenchActionRegistry } from 'vs/workbench/common/actions';
import { IWebviewService, webviewDeveloperCategory } from 'vs/workbench/contrib/webview/common/webview';
import { WebviewService } from 'vs/workbench/contrib/webview/electron-browser/webviewService';
import { OpenWebviewDeveloperToolsAction } from 'vs/workbench/contrib/webview/electron-browser/webviewCommands';

registerSingleton(IWebviewService, WebviewService, true);

const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenWebviewDeveloperToolsAction, OpenWebviewDeveloperToolsAction.ID, OpenWebviewDeveloperToolsAction.LABEL),
	OpenWebviewDeveloperToolsAction.ALIAS,
	webviewDeveloperCategory);
