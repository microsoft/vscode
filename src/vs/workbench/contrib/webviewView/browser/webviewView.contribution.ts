/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWebviewViewService, WebviewViewService } from 'vs/workbench/contrib/webviewView/browser/webviewViewService';

registerSingleton(IWebviewViewService, WebviewViewService, true);
