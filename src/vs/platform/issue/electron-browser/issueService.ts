/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIssueService } from 'vs/platform/issue/node/issue';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { createSimpleChannelProxy } from 'vs/platform/ipc/node/simpleIpcProxy';

export class IssueService {

	_serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return createSimpleChannelProxy<IIssueService>(mainProcessService.getChannel('issue'));
	}
}
