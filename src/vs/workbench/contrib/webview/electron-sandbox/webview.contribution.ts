/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../platform/actions/common/actions';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IWebviewService } from '../browser/webview';
import * as webviewCommands from './webviewCommands';
import { ElectronWebviewService } from './webviewService';

registerSingleton(IWebviewService, ElectronWebviewService, InstantiationType.Delayed);

registerAction2(webviewCommands.OpenWebviewDeveloperToolsAction);
