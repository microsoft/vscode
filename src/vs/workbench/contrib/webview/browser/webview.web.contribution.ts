/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWebviewService } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewService } from './webviewService';

registerSingleton(IWebviewService, WebviewService, true);
