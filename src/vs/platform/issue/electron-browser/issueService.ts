/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IIssueService, IssueReporterData, ProcessExplorerData } from 'vs/platform/issue/node/issue';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class IssueService implements IIssueService {

	_serviceBrand!: ServiceIdentifier<any>;

	private channel: IChannel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel('issue');
	}

	openReporter(data: IssueReporterData): Promise<void> {
		return this.channel.call('openIssueReporter', data);
	}

	openProcessExplorer(data: ProcessExplorerData): Promise<void> {
		return this.channel.call('openProcessExplorer', data);
	}

	getSystemStatus(): Promise<string> {
		return this.channel.call('getSystemStatus');
	}
}
