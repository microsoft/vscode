/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from 'vs/platform/ipc/electron-sandbox/services';
import { IProcessMainService } from 'vs/platform/issue/common/issue';
// import { IIssueMainService } from 'vs/workbench/contrib/issue/common/issue';

// registerMainProcessRemoteService(IIssueMainService, 'issue');
registerMainProcessRemoteService(IProcessMainService, 'process');

