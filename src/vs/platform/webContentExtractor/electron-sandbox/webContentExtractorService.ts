/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../ipc/electron-sandbox/services.js';
import { IWebContentExtractorService } from '../common/webContentExtractor.js';

registerMainProcessRemoteService(IWebContentExtractorService, 'webContentExtractor');
