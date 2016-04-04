/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as Objects from 'vs/base/common/objects';
import * as Types from 'vs/base/common/types';
import * as Platform from 'vs/base/common/platform';
import { TPromise, Promise } from 'vs/base/common/winjs.base';
import * as Async from 'vs/base/common/async';
import Severity from 'vs/base/common/severity';
import * as Strings from 'vs/base/common/strings';
import { EventEmitter, ListenerUnbind } from 'vs/base/common/eventEmitter';

import { TerminateResponse, SuccessData, ErrorData } from 'vs/base/common/processes';
import { LineProcess, LineData } from 'vs/base/node/processes';

import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';

import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ValidationStatus } from 'vs/base/common/parsers';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ProblemMatcher } from 'vs/platform/markers/common/problemMatcher';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import { StartStopProblemCollector, WatchingProblemCollector, ProblemCollectorEvents } from 'vs/workbench/parts/tasks/common/problemCollectors';
import { ITaskSystem, ITaskSummary, ITaskRunResult, TaskError, TaskErrors, TaskRunnerConfiguration, TaskDescription, CommandOptions, ShowOutput, TelemetryEvent, Triggers, TaskSystemEvents, TaskEvent, TaskType } from 'vs/workbench/parts/tasks/common/taskSystem';
import * as FileConfig from './processRunnerConfiguration';

export class ProcessRunnerSystem extends EventEmitter implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private fileConfig: FileConfig.ExternalTaskRunnerConfiguration;
	private variables: SystemVariables;
	private markerService: IMarkerService;
	private modelService: IModelService;
	private outputService: IOutputService;
	private outputChannel: string;
	private telemetryService: ITelemetryService;

	private validationStatus: ValidationStatus;
	private defaultBuildTaskIdentifier: string;
	private defaultTestTaskIdentifier: string;
	private configuration: TaskRunnerConfiguration;

	private errorsShown: boolean;
	private childProcess: LineProcess;
	private activeTaskIdentifier: string;

	constructor(fileConfig:FileConfig.ExternalTaskRunnerConfiguration, variables:SystemVariables, markerService:IMarkerService, modelService: IModelService, telemetryService: ITelemetryService, outputService:IOutputService, outputChannel:string, clearOutput: boolean = true) {
		super();
		this.fileConfig = fileConfig;
		this.variables = variables;
		this.markerService = markerService;
		this.modelService = modelService;
		this.outputChannel = outputChannel;
		this.outputService = outputService;
		this.telemetryService = telemetryService;

		this.defaultBuildTaskIdentifier = null;
		this.defaultTestTaskIdentifier = null;
		this.childProcess = null;
		this.activeTaskIdentifier = null;

		if (clearOutput) {
			this.clearOutput();
		}
		this.errorsShown = false;
		let parseResult = FileConfig.parse(fileConfig, this);
		this.validationStatus = parseResult.validationStatus;
		this.configuration = parseResult.configuration;
		this.defaultBuildTaskIdentifier = parseResult.defaultBuildTaskIdentifier;
		this.defaultTestTaskIdentifier = parseResult.defaultTestTaskIdentifier;

		if (!this.validationStatus.isOK()) {
			this.outputService.showOutput(this.outputChannel, true);
		}
	}


	public build(): ITaskRunResult {
		if (!this.defaultBuildTaskIdentifier) {
			throw new TaskError(Severity.Info, nls.localize('TaskRunnerSystem.noBuildTask', 'No build task configured.'), TaskErrors.NoBuildTask);
		}
		return this.executeTask(this.defaultBuildTaskIdentifier, Triggers.shortcut);
	}

	public rebuild(): ITaskRunResult {
		throw new Error('Task - Rebuild: not implemented yet');
	}

	public clean(): ITaskRunResult {
		throw new Error('Task - Clean: not implemented yet');
	}

	public runTest(): ITaskRunResult {
		if (!this.defaultTestTaskIdentifier) {
			throw new TaskError(Severity.Info, nls.localize('TaskRunnerSystem.noTestTask', 'No test task configured.'), TaskErrors.NoTestTask);
		}
		return this.executeTask(this.defaultTestTaskIdentifier, Triggers.shortcut);
	}

	public run(taskIdentifier: string): ITaskRunResult {
		return this.executeTask(taskIdentifier);
	}

	public isActive(): TPromise<boolean> {
		return TPromise.as(!!this.childProcess);
	}

	public isActiveSync(): boolean {
		return !!this.childProcess;
	}

	public canAutoTerminate(): boolean {
		if (this.childProcess) {
			if (this.activeTaskIdentifier) {
				let task = this.configuration.tasks[this.activeTaskIdentifier];
				if (task) {
					return !task.promptOnClose;
				}
			}
			return false;
		}
		return true;
	}

	public terminate(): TPromise<TerminateResponse> {
		if (this.childProcess) {
			return this.childProcess.terminate();
		}
		return TPromise.as({ success: true });
	}

	public tasks():TPromise<TaskDescription[]> {
		let result: TaskDescription[];
		if (!this.configuration || !this.configuration.tasks) {
			result = [];
		} else {
			result = Object.keys(this.configuration.tasks).map(key => this.configuration.tasks[key]);
		}
		return TPromise.as(result);
	}

	private executeTask(taskIdentifier: string, trigger: string = Triggers.command): ITaskRunResult {
		if (this.validationStatus.isFatal()) {
			throw new TaskError(Severity.Error, nls.localize('TaskRunnerSystem.fatalError', 'The provided task configuration has validation errors. See tasks output log for details.'), TaskErrors.ConfigValidationError);
		}
		let task = this.configuration.tasks[taskIdentifier];
		if (!task) {
			throw new TaskError(Severity.Info, nls.localize('TaskRunnerSystem.norebuild', 'No task to execute found.'), TaskErrors.TaskNotFound);
		}
		let telemetryEvent: TelemetryEvent = {
			trigger: trigger,
			command: 'other',
			success: true
		};
		try {
			let result = this.doExecuteTask(task, telemetryEvent);
			result.promise = result.promise.then((success) => {
				this.telemetryService.publicLog(ProcessRunnerSystem.TelemetryEventName, telemetryEvent);
				return success;
			}, (err: any) => {
				telemetryEvent.success = false;
				this.telemetryService.publicLog(ProcessRunnerSystem.TelemetryEventName, telemetryEvent);
				return TPromise.wrapError<ITaskSummary>(err);
			});
			return result;
		} catch (err) {
			telemetryEvent.success = false;
			this.telemetryService.publicLog(ProcessRunnerSystem.TelemetryEventName, telemetryEvent);
			if (err instanceof TaskError) {
				throw err;
			} else if (err instanceof Error) {
				let error = <Error>err;
				this.outputService.append(this.outputChannel, error.message);
				throw new TaskError(Severity.Error, error.message, TaskErrors.UnknownError);
			} else {
				this.outputService.append(this.outputChannel, err.toString());
				throw new TaskError(Severity.Error, nls.localize('TaskRunnerSystem.unknownError', 'A unknown error has occurred while executing a task. See task output log for details.'), TaskErrors.UnknownError);
			}
		}
	}

	private doExecuteTask(task: TaskDescription, telemetryEvent: TelemetryEvent): ITaskRunResult {
		let taskSummary: ITaskSummary = {};
		let configuration = this.configuration;
		if (!this.validationStatus.isOK() && !this.errorsShown) {
			this.showOutput();
			this.errorsShown = true;
		} else {
			this.clearOutput();
		}

		let args: string[] = this.configuration.args ? this.configuration.args.slice() : [];
		// We need to first pass the task name
		if (!task.suppressTaskName) {
			if (this.fileConfig.taskSelector) {
				args.push(this.fileConfig.taskSelector + task.name);
			} else {
				args.push(task.name);
			}
		}
		// And then additional arguments
		if (task.args) {
			args = args.concat(task.args);
		}
		args = this.resolveVariables(args);
		let command: string = this.resolveVariable(configuration.command);
		this.childProcess = new LineProcess(command, args, configuration.isShellCommand, this.resolveOptions(configuration.options));
		telemetryEvent.command = this.childProcess.getSanitizedCommand();
		// we have no problem matchers defined. So show the output log
		if (task.showOutput === ShowOutput.Always || (task.showOutput === ShowOutput.Silent && task.problemMatchers.length === 0)) {
			this.showOutput();
		}

		if (task.echoCommand) {
			let prompt: string = Platform.isWindows ? '>' : '$';
			this.log(`running command${prompt} ${command} ${args.join(' ')}`);
		}
		if (task.isWatching) {
			let watchingProblemMatcher = new WatchingProblemCollector(this.resolveMatchers(task.problemMatchers), this.markerService, this.modelService);
			let toUnbind: ListenerUnbind[] = [];
			let event: TaskEvent = { taskId: task.id, taskName: task.name, type: TaskType.Watching };
			let eventCounter: number = 0;
			toUnbind.push(watchingProblemMatcher.on(ProblemCollectorEvents.WatchingBeginDetected, () => {
				eventCounter++;
				this.emit(TaskSystemEvents.Active, event);
			}));
			toUnbind.push(watchingProblemMatcher.on(ProblemCollectorEvents.WatchingEndDetected, () => {
				eventCounter--;
				this.emit(TaskSystemEvents.Inactive, event);
			}));
			watchingProblemMatcher.aboutToStart();
			let delayer:Async.Delayer<any> = null;
			this.activeTaskIdentifier = task.id;
			let promise = this.childProcess.start().then((success): ITaskSummary => {
				this.childProcessEnded();
				watchingProblemMatcher.dispose();
				toUnbind.forEach(unbind => unbind());
				toUnbind = null;
				for (let i = 0; i < eventCounter; i++) {
					this.emit(TaskSystemEvents.Inactive, event);
				}
				eventCounter = 0;
				if (!this.checkTerminated(task, success)) {
					this.log(nls.localize('TaskRunnerSystem.watchingBuildTaskFinished', '\nWatching build tasks has finished.'));
				}
				if (success.cmdCode && success.cmdCode === 1 && watchingProblemMatcher.numberOfMatches === 0 && task.showOutput !== ShowOutput.Never) {
					this.showOutput();
				}
				taskSummary.exitCode = success.cmdCode;
				return taskSummary;
			}, (error: ErrorData) => {
				this.childProcessEnded();
				watchingProblemMatcher.dispose();
				toUnbind.forEach(unbind => unbind());
				toUnbind = null;
				for (let i = 0; i < eventCounter; i++) {
					this.emit(TaskSystemEvents.Inactive, event);
				}
				eventCounter = 0;
				return this.handleError(task, error);
			}, (progress: LineData) => {
				let line = Strings.removeAnsiEscapeCodes(progress.line);
				this.outputService.append(this.outputChannel, line + '\n');
				watchingProblemMatcher.processLine(line);
				if (delayer === null) {
					delayer = new Async.Delayer(3000);
				}
				delayer.trigger(() => {
					watchingProblemMatcher.forceDelivery();
					return null;
				}).then(() => {
					delayer = null;
				});
			});
			let result: ITaskRunResult = (<any>task).tscWatch ? { restartOnFileChanges: '**/*.ts', promise } : { promise };
			return result;
		} else {
			let event: TaskEvent = { taskId: task.id, taskName: task.name, type: TaskType.SingleRun };
			this.emit(TaskSystemEvents.Active, event );
			let startStopProblemMatcher = new StartStopProblemCollector(this.resolveMatchers(task.problemMatchers), this.markerService, this.modelService);
			this.activeTaskIdentifier = task.id;
			let promise = this.childProcess.start().then((success): ITaskSummary => {
				this.childProcessEnded();
				startStopProblemMatcher.done();
				startStopProblemMatcher.dispose();
				this.checkTerminated(task, success);
				this.emit(TaskSystemEvents.Inactive, event);
				if (success.cmdCode && success.cmdCode === 1 && startStopProblemMatcher.numberOfMatches === 0 && task.showOutput !== ShowOutput.Never) {
					this.showOutput();
				}
				taskSummary.exitCode = success.cmdCode;
				return taskSummary;
			}, (error: ErrorData) => {
				this.childProcessEnded();
				startStopProblemMatcher.dispose();
				this.emit(TaskSystemEvents.Inactive, event);
				return this.handleError(task, error);
			}, (progress) => {
				let line = Strings.removeAnsiEscapeCodes(progress.line);
				this.outputService.append(this.outputChannel, line + '\n');
				startStopProblemMatcher.processLine(line);
			});
			return { promise };
		}
	}

	private childProcessEnded(): void {
		this.childProcess = null;
		this.activeTaskIdentifier = null;
	}

	private handleError(task: TaskDescription, error: ErrorData): Promise {
		let makeVisible = false;
		if (error.error && !error.terminated) {
			let args:string = this.configuration.args ? this.configuration.args.join(' ') : '';
			this.log(nls.localize('TaskRunnerSystem.childProcessError', 'Failed to launch external program {0} {1}.', this.configuration.command, args));
			this.outputService.append(this.outputChannel, error.error.message);
			makeVisible = true;
		}

		if (error.stdout) {
			this.outputService.append(this.outputChannel, error.stdout);
			makeVisible = true;
		}
		if (error.stderr) {
			this.outputService.append(this.outputChannel, error.stderr);
			makeVisible = true;
		}
		makeVisible = this.checkTerminated(task, error) || makeVisible;
		if (makeVisible) {
			this.showOutput();
		}
		return Promise.wrapError(error);
	}

	private checkTerminated(task: TaskDescription, data: SuccessData | ErrorData): boolean {
		if (data.terminated) {
			this.log(nls.localize('TaskRunnerSystem.cancelRequested', '\nThe task \'{0}\' was terminated per user request.', task.name));
			return true;
		}
		return false;
	}

	private resolveOptions(options: CommandOptions): CommandOptions {
		let result: CommandOptions = { cwd: this.resolveVariable(options.cwd) };
		if (options.env) {
			result.env = Object.create(null);
			Object.keys(options.env).forEach((key) => {
				let value: any = options.env[key];
				if (Types.isString(value)) {
					result.env[key] = this.resolveVariable(value);
				} else {
					result.env[key] = value.toString();
				}
			});
		}
		return result;
	}

	private resolveVariables(value:string[]): string[] {
		return value.map(s => this.resolveVariable(s));
	}

	private resolveMatchers<T extends ProblemMatcher>(values: T[]): T[] {
		if (values.length === 0) {
			return values;
		}
		let result:T[] = [];
		values.forEach((matcher) => {
			if (!matcher.filePrefix) {
				result.push(matcher);
			} else {
				let copy = Objects.clone(matcher);
				copy.filePrefix = this.resolveVariable(copy.filePrefix);
				result.push(copy);
			}
		});
		return result;
	}

	private resolveVariable(value: string): string {
		let regexp =/\$\{(.*?)\}/g;
		return value.replace(regexp, (match:string, name:string) => {
			let value = (<any>this.variables)[name];
			if (value) {
				return value;
			} else {
				return match;
			}
		});
	}

	public log(value: string): void  {
		this.outputService.append(this.outputChannel, value + '\n');
	}

	private showOutput(): void {
		this.outputService.showOutput(this.outputChannel, true);
	}

	private clearOutput(): void {
		this.outputService.clearOutput(this.outputChannel);
	}
}