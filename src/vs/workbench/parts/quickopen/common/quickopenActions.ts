/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Action } from 'vs/base/common/actions';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IConfigurationService } from "vs/platform/configuration/common/configuration";

export const ALL_COMMANDS_PREFIX = '>';

export class ShowTasksAction extends Action {

	public static ID = 'workbench.action.showTasks';
	public static LABEL = nls.localize('showTasks', "Show task menu");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		const value = `${ALL_COMMANDS_PREFIX}tasks`;
		this.quickOpenService.show(value);

		return TPromise.as(null);
	}
}

export class ShowTasksDocumentationAction extends Action {

	public static ID = 'workbench.action.showTaskDocumentation';
	public static LABEL = nls.localize('showTaskDocumentation', "Show task documentation");

	constructor(
		id: string,
		label: string,
	) {
		super(id, label);
	}

	public run(context?: any): TPromise<any> {
		window.open('https://go.microsoft.com/fwlink/?LinkId=733558');
		return TPromise.as(null);
	}
}
