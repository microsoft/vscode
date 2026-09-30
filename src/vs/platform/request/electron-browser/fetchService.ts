/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { FETCH_CHANNEL_NAME, IFetchService } from '../common/fetch.js';
import { FetchChannelClient } from '../common/fetchIpc.js';

registerMainProcessRemoteService(IFetchService, FETCH_CHANNEL_NAME, { channelClientCtor: FetchChannelClient });
