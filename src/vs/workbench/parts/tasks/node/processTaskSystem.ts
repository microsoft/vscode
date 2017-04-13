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
import { EventEmitter } from 'vs/base/common/eventEmitter';

import { TerminateResponse, SuccessData, ErrorData } from 'vs/base/common/processes';
import { LineProcess, LineData } from 'vs/base/node/processes';

import { IOutputService, IOutputChannel } from 'vs/workbench/parts/output/common/output';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ProblemMatcher } from 'vs/platform/markers/common/problemMatcher';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import { StartStopProblemCollector, WatchingProblemCollector, ProblemCollectorEvents } from 'vs/workbench/parts/tasks/common/problemCollectors';
import {
	ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, TelemetryEvent, Triggers, TaskSystemEvents, TaskEvent, TaskType
} from 'vs/workbench/parts/tasks/common/taskSystem';
import { Task, CommandOptions, ShowOutput, CommandConfiguration } from 'vs/workbench/parts/tasks/common/tasks';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class ProcessTaskSystem extends EventEmitter implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private markerService: IMarkerService;
	private modelService: IModelService;
	private outputService: IOutputService;
	private telemetryService: ITelemetryService;
	private configurationResolverService: IConfigurationResolverService;

	private outputChannel: IOutputChannel;

	private errorsShown: boolean;
	private childProcess: LineProcess;
	private activeTask: Task;
	private activeTaskPromise: TPromise<ITaskSummary>;

	constructor(markerService: IMarkerService, modelService: IModelService, telemetryService: ITelemetryService,
		outputService: IOutputService, configurationResolverService: IConfigurationResolverService, outputChannelId: string) {
		super();
		this.markerService = markerService;
		this.modelService = modelService;
		this.outputService = outputService;
		this.telemetryService = telemetryService;
		this.configurationResolverService = configurationResolverService;

		this.childProcess = null;
		this.activeTask = null;
		this.activeTaskPromise = null;
		this.outputChannel = this.outputService.getChannel(outputChannelId);
		this.errorsShown = true;
	}

	public isActive(): TPromise<boolean> {
		return TPromise.as(!!this.childProcess);
	}

	public isActiveSync(): boolean {
		return !!this.childProcess;
	}

	public getActiveTasks(): Task[] {
		let result: Task[] = [];
		if (this.activeTask) {
			result.push(this.activeTask);
		}
		return result;
	}

	public run(task: Task): ITaskExecuteResult {
		if (this.activeTask) {
			return { kind: TaskExecuteKind.Active, active: { same: this.activeTask._id === task._id, background: this.activeTask.isBackground }, promise: this.activeTaskPromise };
		}
		return this.executeTask(task);
	}

	public hasErrors(value: boolean): void {
		this.errorsShown = !value;
	}

	public canAutoTerminate(): boolean {
		if (this.childProcess) {
			if (this.activeTask) {
				return !this.activeTask.promptOnClose;
			}
			return false;
		}
		return true;
	}

	public terminate(_id: string): TPromise<TerminateResponse> {
		if (!this.activeTask || this.activeTask._id !== _id) {
			return TPromise.as<TerminateResponse>({ success: false });
		}
		return this.terminateAll();
	}

	public terminateAll(): TPromise<TerminateResponse> {
		if (this.childProcess) {
			return this.childProcess.terminate();
		}
		return TPromise.as({ success: true });
	}

	private executeTask(task: Task, trigger: string = Triggers.command): ITaskExecuteResult {
		let telemetryEvent: TelemetryEvent = {
			trigger: trigger,
			command: 'other',
			success: true
		};
		try {
			let result = this.doExecuteTask(task, telemetryEvent);
			result.promise = result.promise.then((success) => {
				this.telemetryService.publicLog(ProcessTaskSystem.TelemetryEventName, telemetryEvent);
				return success;
			}, (err: any) => {
				telemetryEvent.success = false;
				this.telemetryService.publicLog(ProcessTaskSystem.TelemetryEventName, telemetryEvent);
				return TPromise.wrapError<ITaskSummary>(err);
			});
			return result;
		} catch (err) {
			telemetryEvent.success = false;
			this.telemetryService.publicLog(ProcessTaskSystem.TelemetryEventName, telemetryEvent);
			if (err instanceof TaskError) {
				throw err;
			} else if (err instanceof Error) {
				let error = <Error>err;
				this.outputChannel.append(error.message);
				throw new TaskError(Severity.Error, error.message, TaskErrors.UnknownError);
			} else {
				this.outputChannel.append(err.toString());
				throw new TaskError(Severity.Error, nls.localize('TaskRunnerSystem.unknownError', 'A unknown error has occurred while executing a task. See task output log for details.'), TaskErrors.UnknownError);
			}
		}
	}

	private doExecuteTask(task: Task, telemetryEvent: TelemetryEvent): ITaskExecuteResult {
		let taskSummary: ITaskSummary = {};
		let commandConfig: CommandConfiguration = task.command;
		if (!this.errorsShown) {
			this.showOutput();
			this.errorsShown = true;
		} else {
			this.clearOutput();
		}

		let args: string[] = commandConfig.args ? commandConfig.args.slice() : [];
		// We need to first pass the task name
		if (!task.suppressTaskName) {
			if (commandConfig.taskSelector) {
				args.push(commandConfig.taskSelector + task.name);
			} else {
				args.push(task.name);
			}
		}
		// And then additional arguments
		if (task.args) {
			args = args.concat(task.args);
		}
		args = this.resolveVariables(args);
		let command: string = this.resolveVariable(commandConfig.name);
		this.childProcess = new LineProcess(command, args, !!commandConfig.isShellCommand, this.resolveOptions(commandConfig.options));
		telemetryEvent.command = this.childProcess.getSanitizedCommand();
		// we have no problem matchers defined. So show the output log
		if (task.showOutput === ShowOutput.Always || (task.showOutput === ShowOutput.Silent && task.problemMatchers.length === 0)) {
			this.showOutput();
		}

		if (commandConfig.echo) {
			let prompt: string = Platform.isWindows ? '>' : '$';
			this.log(`running command${prompt} ${command} ${args.join(' ')}`);
		}
		if (task.isBackground) {
			let watchingProblemMatcher = new WatchingProblemCollector(this.resolveMatchers(task.problemMatchers), this.markerService, this.modelService);
			let toUnbind: IDisposable[] = [];
			let event: TaskEvent = { taskId: task._id, taskName: task.name, type: TaskType.Watching };
			let eventCounter: number = 0;
			toUnbind.push(watchingProblemMatcher.addListener2(ProblemCollectorEvents.WatchingBeginDetected, () => {
				eventCounter++;
				this.emit(TaskSystemEvents.Active, event);
			}));
			toUnbind.push(watchingProblemMatcher.addListener2(ProblemCollectorEvents.WatchingEndDetected, () => {
				eventCounter--;
				this.emit(TaskSystemEvents.Inactive, event);
			}));
			watchingProblemMatcher.aboutToStart();
			let delayer: Async.Delayer<any> = null;
			this.activeTask = task;
			this.activeTaskPromise = this.childProcess.start().then((success): ITaskSummary => {
				this.childProcessEnded();
				watchingProblemMatcher.dispose();
				toUnbind = dispose(toUnbind);
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
				toUnbind = dispose(toUnbind);
				toUnbind = null;
				for (let i = 0; i < eventCounter; i++) {
					this.emit(TaskSystemEvents.Inactive, event);
				}
				eventCounter = 0;
				return this.handleError(task, error);
			}, (progress: LineData) => {
				let line = Strings.removeAnsiEscapeCodes(progress.line);
				this.outputChannel.append(line + '\n');
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
			let result: ITaskExecuteResult = (<any>task).tscWatch
				? { kind: TaskExecuteKind.Started, started: { restartOnFileChanges: '**/*.ts' }, promise: this.activeTaskPromise }
				: { kind: TaskExecuteKind.Started, started: {}, promise: this.activeTaskPromise };
			return result;
		} else {
			let event: TaskEvent = { taskId: task._id, taskName: task.name, type: TaskType.SingleRun };
			this.emit(TaskSystemEvents.Active, event);
			let startStopProblemMatcher = new StartStopProblemCollector(this.resolveMatchers(task.problemMatchers), this.markerService, this.modelService);
			this.activeTask = task;
			this.activeTaskPromise = this.childProcess.start().then((success): ITaskSummary => {
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
				this.outputChannel.append(line + '\n');
				startStopProblemMatcher.processLine(line);
			});
			return { kind: TaskExecuteKind.Started, started: {}, promise: this.activeTaskPromise };
		}
	}

	private childProcessEnded(): void {
		this.childProcess = null;
		this.activeTask = null;
		this.activeTaskPromise = null;
	}

	private handleError(task: Task, error: ErrorData): Promise {
		let makeVisible = false;
		if (error.error && !error.terminated) {
			let args: string = task.command.args ? task.command.args.join(' ') : '';
			this.log(nls.localize('TaskRunnerSystem.childProcessError', 'Failed to launch external program {0} {1}.', task.command.name, args));
			this.outputChannel.append(error.error.message);
			makeVisible = true;
		}

		if (error.stdout) {
			this.outputChannel.append(error.stdout);
			makeVisible = true;
		}
		if (error.stderr) {
			this.outputChannel.append(error.stderr);
			makeVisible = true;
		}
		makeVisible = this.checkTerminated(task, error) || makeVisible;
		if (makeVisible) {
			this.showOutput();
		}
		return Promise.wrapError(error);
	}

	private checkTerminated(task: Task, data: SuccessData | ErrorData): boolean {
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

	private resolveVariables(value: string[]): string[] {
		return value.map(s => this.resolveVariable(s));
	}

	private resolveMatchers<T extends ProblemMatcher>(values: T[]): T[] {
		if (values.length === 0) {
			return values;
		}
		let result: T[] = [];
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
		return this.configurationResolverService.resolve(value);
	}

	public log(value: string): void {
		this.outputChannel.append(value + '\n');
	}

	private showOutput(): void {
		this.outputChannel.show(true);
	}

	private clearOutput(): void {
		this.outputChannel.clear();
	}
}