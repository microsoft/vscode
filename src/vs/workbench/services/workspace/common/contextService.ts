/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IOptions} from 'vs/workbench/common/options';
import {EventType, OptionsChangeEvent} from 'vs/workbench/common/events';
import {IEventService} from 'vs/platform/event/common/event';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspace, IConfiguration, IWorkspaceContextService as IBaseWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {BaseWorkspaceContextService} from 'vs/platform/workspace/common/baseWorkspaceContextService';

export var IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService extends IBaseWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * Provides access to the options object the platform is running with.
	 */
	getOptions(): IOptions;

	/**
	 * Update options in the running instance.
	 */
	updateOptions(key: string, value: any): void;
}

export class WorkspaceContextService extends BaseWorkspaceContextService implements IWorkspaceContextService {
	public _serviceBrand: any;

	constructor(
		private eventService: IEventService,
		workspace: IWorkspace,
		configuration?: IConfiguration,
		options: any = {}
	) {
		super(workspace, configuration, options);
	}

	public updateOptions(key: string, value: any): void {
		let oldValue = this.options[key];
		this.options[key] = value;

		this.eventService.emit(EventType.WORKBENCH_OPTIONS_CHANGED, new OptionsChangeEvent(key, oldValue, value));
	}
}