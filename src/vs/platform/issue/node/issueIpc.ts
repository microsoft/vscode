/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IIssueService } from 'vs/platform/issue/node/issue';

export class IssueChannel implements IServerChannel {

	constructor(private service: IIssueService) { }

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'openIssueReporter':
				return this.service.openReporter(arg);
			case 'openProcessExplorer':
				return this.service.openProcessExplorer(arg);
			case 'getSystemStatus':
				return this.service.getSystemStatus();
		}

		throw new Error(`Call not found: ${command}`);
	}
}