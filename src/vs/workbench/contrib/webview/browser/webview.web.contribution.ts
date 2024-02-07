/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { BrowserWebviewUriService, IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewService } from './webviewService';
import { IWebviewUriService } from 'vs/workbench/contrib/webview/common/webview';

registerSingleton(IWebviewService, WebviewService, InstantiationType.Delayed);
registerSingleton(IWebviewUriService, BrowserWebviewUriService, InstantiationType.Delayed);
