/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IIssueService, IssueReporterData, ProcessExplorerData } from '../common/issue';
import { Event } from 'vs/base/common/event';

export interface IIssueChannel extends IChannel {
	call(command: 'openIssueReporter', arg: IssueReporterData): Promise<void>;
	call(command: 'getStatusInfo'): Promise<any>;
	call(command: string, arg?: any): Promise<any>;
}

export class IssueChannel implements IIssueChannel {

	constructor(private service: IIssueService) { }

	listen<T>(event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'openIssueReporter':
				return this.service.openReporter(arg);
			case 'openProcessExplorer':
				return this.service.openProcessExplorer(arg);
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class IssueChannelClient implements IIssueService {

	_serviceBrand: any;

	constructor(private channel: IIssueChannel) { }

	openReporter(data: IssueReporterData): Promise<void> {
		return this.channel.call('openIssueReporter', data);
	}

	openProcessExplorer(data: ProcessExplorerData): Promise<void> {
		return this.channel.call('openProcessExplorer', data);
	}
}