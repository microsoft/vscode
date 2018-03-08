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
import Event, { Emitter } from 'vs/base/common/event';

import { SuccessData, ErrorData } from 'vs/base/common/processes';
import { LineProcess, LineData } from 'vs/base/node/processes';

import { IOutputService, IOutputChannel } from 'vs/workbench/parts/output/common/output';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ProblemMatcher, ProblemMatcherRegistry } from 'vs/workbench/parts/tasks/common/problemMatcher';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import { StartStopProblemCollector, WatchingProblemCollector, ProblemCollectorEventKind } from 'vs/workbench/parts/tasks/common/problemCollectors';
import {
	ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, TelemetryEvent, Triggers,
	TaskTerminateResponse
} from 'vs/workbench/parts/tasks/common/taskSystem';
import {
	Task, CustomTask, CommandOptions, RevealKind, CommandConfiguration, RuntimeType,
	TaskEvent, TaskEventKind
} from 'vs/workbench/parts/tasks/common/tasks';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class ProcessTaskSystem implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private markerService: IMarkerService;
	private modelService: IModelService;
	private outputService: IOutputService;
	private telemetryService: ITelemetryService;
	private configurationResolverService: IConfigurationResolverService;

	private outputChannel: IOutputChannel;

	private errorsShown: boolean;
	private childProcess: LineProcess;
	private activeTask: CustomTask;
	private activeTaskPromise: TPromise<ITaskSummary>;

	private _onDidStateChange: Emitter<TaskEvent>;

	constructor(markerService: IMarkerService, modelService: IModelService, telemetryService: ITelemetryService,
		outputService: IOutputService, configurationResolverService: IConfigurationResolverService, outputChannelId: string) {
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
		this._onDidStateChange = new Emitter();
	}

	public get onDidStateChange(): Event<TaskEvent> {
		return this._onDidStateChange.event;
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

	public revealTask(task: Task): boolean {
		this.showOutput();
		return true;
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

	public terminate(task: Task): TPromise<TaskTerminateResponse> {
		if (!this.activeTask || Task.getMapKey(this.activeTask) !== Task.getMapKey(task)) {
			return TPromise.as<TaskTerminateResponse>({ success: false, task: undefined });
		}
		return this.terminateAll()[0];
	}

	public terminateAll(): TPromise<TaskTerminateResponse[]> {
		if (this.childProcess) {
			let task = this.activeTask;
			return this.childProcess.terminate().then((response) => {
				let result: TaskTerminateResponse = Objects.assign({ task: task }, response);
				this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Terminated, task));
				return [result];
			});
		}
		return TPromise.as<TaskTerminateResponse[]>([{ success: true, task: undefined }]);
	}

	private executeTask(task: Task, trigger: string = Triggers.command): ITaskExecuteResult {
		if (!CustomTask.is(task)) {
			throw new Error('The process task system can only execute custom tasks.');
		}
		let telemetryEvent: TelemetryEvent = {
			trigger: trigger,
			runner: 'output',
			taskKind: Task.getTelemetryKind(task),
			command: 'other',
			success: true
		};
		try {
			let result = this.doExecuteTask(task, telemetryEvent);
			result.promise = result.promise.then((success) => {
				/* __GDPR__
					"taskService" : {
						"${include}": [
							"${TelemetryEvent}"
						]
					}
				*/
				this.telemetryService.publicLog(ProcessTaskSystem.TelemetryEventName, telemetryEvent);
				return success;
			}, (err: any) => {
				telemetryEvent.success = false;
				/* __GDPR__
					"taskService" : {
						"${include}": [
							"${TelemetryEvent}"
						]
					}
				*/
				this.telemetryService.publicLog(ProcessTaskSystem.TelemetryEventName, telemetryEvent);
				return TPromise.wrapError<ITaskSummary>(err);
			});
			return result;
		} catch (err) {
			telemetryEvent.success = false;
			/* __GDPR__
				"taskService" : {
					"${include}": [
						"${TelemetryEvent}"
					]
				}
			*/
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

	private doExecuteTask(task: CustomTask, telemetryEvent: TelemetryEvent): ITaskExecuteResult {
		let taskSummary: ITaskSummary = {};
		let commandConfig: CommandConfiguration = task.command;
		if (!this.errorsShown) {
			this.showOutput();
			this.errorsShown = true;
		} else {
			this.clearOutput();
		}

		let args: string[] = commandConfig.args ? commandConfig.args.slice() : [];
		args = this.resolveVariables(task, args);
		let command: string = this.resolveVariable(task, commandConfig.name);
		this.childProcess = new LineProcess(command, args, commandConfig.runtime === RuntimeType.Shell, this.resolveOptions(task, commandConfig.options));
		telemetryEvent.command = this.childProcess.getSanitizedCommand();
		// we have no problem matchers defined. So show the output log
		let reveal = task.command.presentation.reveal;
		if (reveal === RevealKind.Always || (reveal === RevealKind.Silent && task.problemMatchers.length === 0)) {
			this.showOutput();
		}

		if (commandConfig.presentation.echo) {
			let prompt: string = Platform.isWindows ? '>' : '$';
			this.log(`running command${prompt} ${command} ${args.join(' ')}`);
		}
		if (task.isBackground) {
			let watchingProblemMatcher = new WatchingProblemCollector(this.resolveMatchers(task, task.problemMatchers), this.markerService, this.modelService);
			let toUnbind: IDisposable[] = [];
			let eventCounter: number = 0;
			toUnbind.push(watchingProblemMatcher.onDidStateChange((event) => {
				if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
					eventCounter++;
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Active, task));
				} else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
					eventCounter--;
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Inactive, task));
				}
			}));
			watchingProblemMatcher.aboutToStart();
			let delayer: Async.Delayer<any> = null;
			this.activeTask = task;
			const inactiveEvent = TaskEvent.create(TaskEventKind.Inactive, task);
			this.activeTaskPromise = this.childProcess.start().then((success): ITaskSummary => {
				this.childProcessEnded();
				watchingProblemMatcher.done();
				watchingProblemMatcher.dispose();
				toUnbind = dispose(toUnbind);
				toUnbind = null;
				for (let i = 0; i < eventCounter; i++) {
					this._onDidStateChange.fire(inactiveEvent);
				}
				eventCounter = 0;
				if (!this.checkTerminated(task, success)) {
					this.log(nls.localize('TaskRunnerSystem.watchingBuildTaskFinished', '\nWatching build tasks has finished.'));
				}
				if (success.cmdCode && success.cmdCode === 1 && watchingProblemMatcher.numberOfMatches === 0 && reveal !== RevealKind.Never) {
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
					this._onDidStateChange.fire(inactiveEvent);
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
			this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Active, task));
			let startStopProblemMatcher = new StartStopProblemCollector(this.resolveMatchers(task, task.problemMatchers), this.markerService, this.modelService);
			this.activeTask = task;
			const inactiveEvent = TaskEvent.create(TaskEventKind.Inactive, task);
			this.activeTaskPromise = this.childProcess.start().then((success): ITaskSummary => {
				this.childProcessEnded();
				startStopProblemMatcher.done();
				startStopProblemMatcher.dispose();
				this.checkTerminated(task, success);
				this._onDidStateChange.fire(inactiveEvent);
				if (success.cmdCode && success.cmdCode === 1 && startStopProblemMatcher.numberOfMatches === 0 && reveal !== RevealKind.Never) {
					this.showOutput();
				}
				taskSummary.exitCode = success.cmdCode;
				return taskSummary;
			}, (error: ErrorData) => {
				this.childProcessEnded();
				startStopProblemMatcher.dispose();
				this._onDidStateChange.fire(inactiveEvent);
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

	private handleError(task: CustomTask, errorData: ErrorData): Promise {
		let makeVisible = false;
		if (errorData.error && !errorData.terminated) {
			let args: string = task.command.args ? task.command.args.join(' ') : '';
			this.log(nls.localize('TaskRunnerSystem.childProcessError', 'Failed to launch external program {0} {1}.', task.command.name, args));
			this.outputChannel.append(errorData.error.message);
			makeVisible = true;
		}

		if (errorData.stdout) {
			this.outputChannel.append(errorData.stdout);
			makeVisible = true;
		}
		if (errorData.stderr) {
			this.outputChannel.append(errorData.stderr);
			makeVisible = true;
		}
		makeVisible = this.checkTerminated(task, errorData) || makeVisible;
		if (makeVisible) {
			this.showOutput();
		}

		const error: Error & ErrorData = errorData.error || new Error();
		error.stderr = errorData.stderr;
		error.stdout = errorData.stdout;
		error.terminated = errorData.terminated;
		return TPromise.wrapError(error);
	}

	private checkTerminated(task: Task, data: SuccessData | ErrorData): boolean {
		if (data.terminated) {
			this.log(nls.localize('TaskRunnerSystem.cancelRequested', '\nThe task \'{0}\' was terminated per user request.', task.name));
			return true;
		}
		return false;
	}

	private resolveOptions(task: CustomTask, options: CommandOptions): CommandOptions {
		let result: CommandOptions = { cwd: this.resolveVariable(task, options.cwd) };
		if (options.env) {
			result.env = Object.create(null);
			Object.keys(options.env).forEach((key) => {
				let value: any = options.env[key];
				if (Types.isString(value)) {
					result.env[key] = this.resolveVariable(task, value);
				} else {
					result.env[key] = value.toString();
				}
			});
		}
		return result;
	}

	private resolveVariables(task: CustomTask, value: string[]): string[] {
		return value.map(s => this.resolveVariable(task, s));
	}

	private resolveMatchers(task: CustomTask, values: (string | ProblemMatcher)[]): ProblemMatcher[] {
		if (values === void 0 || values === null || values.length === 0) {
			return [];
		}
		let result: ProblemMatcher[] = [];
		values.forEach((value) => {
			let matcher: ProblemMatcher;
			if (Types.isString(value)) {
				if (value[0] === '$') {
					matcher = ProblemMatcherRegistry.get(value.substring(1));
				} else {
					matcher = ProblemMatcherRegistry.get(value);
				}
			} else {
				matcher = value;
			}
			if (!matcher) {
				this.outputChannel.append(nls.localize('unkownProblemMatcher', 'Problem matcher {0} can\'t be resolved. The matcher will be ignored'));
				return;
			}
			if (!matcher.filePrefix) {
				result.push(matcher);
			} else {
				let copy = Objects.deepClone(matcher);
				copy.filePrefix = this.resolveVariable(task, copy.filePrefix);
				result.push(copy);
			}
		});
		return result;
	}

	private resolveVariable(task: CustomTask, value: string): string {
		return this.configurationResolverService.resolve(Task.getWorkspaceFolder(task), value);
	}

	public log(value: string): void {
		this.outputChannel.append(value + '\n');
	}

	private showOutput(): void {
		this.outputService.showChannel(this.outputChannel.id, true);
	}

	private clearOutput(): void {
		this.outputChannel.clear();
	}
}
