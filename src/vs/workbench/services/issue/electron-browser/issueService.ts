/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIssueService } from 'vs/platform/issue/node/issue';
import { IMainProcessService2 } from 'vs/platform/ipc/electron-sandbox/mainProcessService';
import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class IssueService {

	_serviceBrand: undefined;

	constructor(@IMainProcessService2 mainProcessService: IMainProcessService2) {
		return createChannelSender<IIssueService>(mainProcessService.getChannel('issue'));
	}
}

registerSingleton(IIssueService, IssueService, true);
