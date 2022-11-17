/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import * as webviewCommands from 'vs/workbench/contrib/webview/electron-sandbox/webviewCommands';
import { ElectronWebviewService } from 'vs/workbench/contrib/webview/electron-sandbox/webviewService';

registerSingleton(IWebviewService, ElectronWebviewService, InstantiationType.Delayed);

registerAction2(webviewCommands.OpenWebviewDeveloperToolsAction);
