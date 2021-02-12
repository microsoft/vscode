/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIssueService } from 'vs/platform/issue/electron-sandbox/issue';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

// @ts-ignore: interface is implemented via proxy
export class IssueService implements IIssueService {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		return ProxyChannel.toService<IIssueService>(mainProcessService.getChannel('issue'));
	}
}

registerSingleton(IIssueService, IssueService, true);
