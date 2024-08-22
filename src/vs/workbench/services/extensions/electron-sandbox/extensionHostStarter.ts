/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../../../platform/ipc/electron-sandbox/services';
import { IExtensionHostStarter, ipcExtensionHostStarterChannelName } from '../../../../platform/extensions/common/extensionHostStarter';

registerMainProcessRemoteService(IExtensionHostStarter, ipcExtensionHostStarterChannelName);
