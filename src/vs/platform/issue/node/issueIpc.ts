/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { IIssueService, IssueReporterData, ProcessExplorerData } from '../common/issue';
import { Event } from 'vs/base/common/event';

export class IssueChannel implements IServerChannel {

	constructor(private service: IIssueService) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Thenable<any> {
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

	constructor(private channel: IChannel) { }

	openReporter(data: IssueReporterData): Thenable<void> {
		return this.channel.call('openIssueReporter', data);
	}

	openProcessExplorer(data: ProcessExplorerData): Thenable<void> {
		return this.channel.call('openProcessExplorer', data);
	}
}