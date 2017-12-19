/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IIssueService } from 'vs/platform/issue/common/issue';
import { BrowserWindow } from 'electron';

export class IssueService implements IIssueService {
	_serviceBrand: any;

	_issueWindow: BrowserWindow;

	constructor() {}

	openReporter(): TPromise<void> {
		this._issueWindow = new BrowserWindow({});
		this._issueWindow.loadURL('https://vscode-perf-issue.surge.sh/');
		return TPromise.as(null);
	}
}
