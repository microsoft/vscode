/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';

registerSharedProcessRemoteService(ILocalizationsService, 'localizations', { supportsDelayedInstantiation: true });
