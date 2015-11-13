/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, Promise }  from 'vs/base/common/winjs.base';
import { TerminateResponse} from 'vs/base/common/processes';

import { IMode } from 'vs/editor/common/modes';
import { EventEmitter } from 'vs/base/common/eventEmitter';

import { ITaskSystem, ITaskSummary, TaskDescription, TelemetryEvent, Triggers, TaskConfiguration, ITaskRunResult }  from 'vs/workbench/parts/tasks/common/taskSystem';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IModeService } from 'vs/editor/common/services/modeService';

export interface LanguageServiceTaskConfiguration extends TaskConfiguration {
	modes:string[];
}

export class LanguageServiceTaskSystem extends EventEmitter implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private configuration: LanguageServiceTaskConfiguration;
	private telemetryService: ITelemetryService;
	private modeService: IModeService;

	constructor(configuration: LanguageServiceTaskConfiguration, telemetryService: ITelemetryService, modeService: IModeService) {
		super();
		this.configuration = configuration;
		this.telemetryService = telemetryService;
		this.modeService = modeService;
	}

	public build(): ITaskRunResult {
		return this.processMode((mode) => {
			return mode.taskSupport && mode.taskSupport.build
				? mode.taskSupport.build()
				: null;
		}, 'build', Triggers.shortcut);
	}

	public rebuild(): ITaskRunResult {
		return this.processMode((mode) => {
			return mode.taskSupport && mode.taskSupport.rebuild
				? mode.taskSupport.rebuild()
				: null;
		}, 'rebuild', Triggers.shortcut);
	}

	public clean(): ITaskRunResult {
		return this.processMode((mode) => {
			return mode.taskSupport && mode.taskSupport.clean
				? mode.taskSupport.clean()
				: null;
		}, 'clean', Triggers.shortcut);
	}

	public runTest(): ITaskRunResult {
		return { promise: TPromise.wrapError<ITaskSummary>('Not implemented yet.') };
	}

	public run(taskIdentifier:string): ITaskRunResult {
		return { promise: TPromise.wrapError<ITaskSummary>('Not implemented yet.') };
	}

	public isActive(): TPromise<boolean> {
		return TPromise.as(false);
	}

	public isActiveSync(): boolean {
		return false;
	}

	public terminate(): TPromise<TerminateResponse> {
		return TPromise.as({ success: true });
	}

	public terminateSync(): TerminateResponse {
		return { success: true };
	}

	public tasks(): TPromise<TaskDescription[]> {
		let result: TaskDescription[] = [];
		return TPromise.as(result);
	}

	private processMode(fn: (mode: IMode) => Promise, taskName: string, trigger: string): ITaskRunResult {
		let telemetryEvent: TelemetryEvent = {
			trigger: trigger,
			command: 'languageService',
			success: true
		};
		return { promise: Promise.join(this.configuration.modes.map((mode) => {
			return this.modeService.getOrCreateMode(mode);
		})).then((modes: IMode[]) => {
			let promises: Promise[] = [];
			modes.forEach((mode) => {
				let promise = fn(mode);
				if (promise) {
					promises.push(promise);
				}
			});
			return Promise.join(promises);
		}).then((value) => {
				this.telemetryService.publicLog(LanguageServiceTaskSystem.TelemetryEventName, telemetryEvent);
				return value;
			},(err) => {
				telemetryEvent.success = false;
				this.telemetryService.publicLog(LanguageServiceTaskSystem.TelemetryEventName, telemetryEvent);
				return Promise.wrapError(err);
		})};
	}
}
