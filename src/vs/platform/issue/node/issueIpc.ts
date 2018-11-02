/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IIssueService, IssueReporterData, ProcessExplorerData } from '../common/issue';
import { Event } from 'vs/base/common/event';

export interface IIssueChannel extends IChannel {
	call(command: 'openIssueReporter', arg: IssueReporterData): TPromise<void>;
	call(command: 'getStatusInfo'): TPromise<any>;
	call(command: string, arg?: any): TPromise<any>;
}

export class IssueChannel implements IIssueChannel {

	constructor(private service: IIssueService) { }

	listen<T>(event: string): Event<T> {
		throw new Error('No event found');
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'openIssueReporter':
				return this.service.openReporter(arg);
			case 'openProcessExplorer':
				return this.service.openProcessExplorer(arg);
		}
		return undefined;
	}
}

export class IssueChannelClient implements IIssueService {

	_serviceBrand: any;

	constructor(private channel: IIssueChannel) { }

	openReporter(data: IssueReporterData): TPromise<void> {
		return this.channel.call('openIssueReporter', data);
	}

	openProcessExplorer(data: ProcessExplorerData): TPromise<void> {
		return this.channel.call('openProcessExplorer', data);
	}
}