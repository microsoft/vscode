/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IOptions} from 'vs/workbench/common/options';
import {EventType, OptionsChangeEvent} from 'vs/workbench/common/events';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspace, BaseWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class LegacyWorkspaceContextService extends BaseWorkspaceContextService {

	constructor(
		private eventService: IEventService,
		workspace: IWorkspace,
		private options: IOptions
	) {
		super(workspace);
	}

	public getOptions(): IOptions {
		return this.options;
	}

	public updateOptions(key: string, value: any): void {
		let oldValue = this.options[key];
		this.options[key] = value;

		this.eventService.emit(EventType.WORKBENCH_OPTIONS_CHANGED, new OptionsChangeEvent(key, oldValue, value));
	}
}