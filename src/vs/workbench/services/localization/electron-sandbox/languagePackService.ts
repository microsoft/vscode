/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePack';
import { registerSharedProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';

registerSharedProcessRemoteService(ILanguagePackService, 'languagePacks', { supportsDelayedInstantiation: true });
