/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IRequestContext, IRequestOptions } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ILogService } from 'vs/platform/log/common/log';
import { RequestService } from 'vs/platform/request/browser/requestService';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestChannelClient } from 'vs/platform/request/common/requestIpc';

export class SharedProcessRequestService implements IRequestService {

	declare readonly _serviceBrand: undefined;

	private readonly browserRequestService: IRequestService;
	private readonly mainRequestService: IRequestService;

	constructor(
		mainProcessService: IMainProcessService,
		private readonly configurationService: IConfigurationService,
		private readonly logService: ILogService,
	) {
		this.browserRequestService = new RequestService(configurationService, logService);
		this.mainRequestService = new RequestChannelClient(mainProcessService.getChannel('request'));
	}

	request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		return this.getRequestService().request(options, token);
	}

	async resolveProxy(url: string): Promise<string | undefined> {
		return this.getRequestService().resolveProxy(url);
	}

	private getRequestService(): IRequestService {
		if (this.configurationService.getValue('developer.sharedProcess.redirectRequestsToMain') === true) {
			this.logService.trace('Using main request service');
			return this.mainRequestService;
		}
		this.logService.trace('Using browser request service');
		return this.browserRequestService;
	}
}
