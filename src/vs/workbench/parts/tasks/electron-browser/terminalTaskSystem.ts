/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import fs = require('fs');
import path = require('path');

import * as nls from 'vs/nls';
import * as Objects from 'vs/base/common/objects';
import * as Types from 'vs/base/common/types';
import { CharCode } from 'vs/base/common/charCode';
import * as Platform from 'vs/base/common/platform';
import * as Async from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IStringDictionary } from 'vs/base/common/collections';
import Severity from 'vs/base/common/severity';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TerminateResponse } from 'vs/base/common/processes';
import * as TPath from 'vs/base/common/paths';

import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ValidationStatus } from 'vs/base/common/parsers';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ProblemMatcher } from 'vs/platform/markers/common/problemMatcher';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { IOutputService, IOutputChannel } from 'vs/workbench/parts/output/common/output';
import { StartStopProblemCollector, WatchingProblemCollector, ProblemCollectorEvents } from 'vs/workbench/parts/tasks/common/problemCollectors';
import { ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, TaskRunnerConfiguration, TaskDescription, ShowOutput, TelemetryEvent, Triggers, TaskSystemEvents, TaskEvent, TaskType, CommandOptions } from 'vs/workbench/parts/tasks/common/taskSystem';
import * as FileConfig from '../node/processRunnerConfiguration';

interface TerminalData {
	terminal: ITerminalInstance;
	promise: TPromise<ITaskSummary>;
}

class TerminalDecoder {
	// See https://en.wikipedia.org/wiki/ANSI_escape_code & http://stackoverflow.com/questions/25189651/how-to-remove-ansi-control-chars-vt100-from-a-java-string &
	// https://www.npmjs.com/package/strip-ansi
	private static ANSI_CONTROL_SEQUENCE: RegExp = /\x1b[[()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

	private remaining: string;

	public write(data: string): string[] {
		let result: string[] = [];
		let value = this.remaining
			? this.remaining + data.replace(TerminalDecoder.ANSI_CONTROL_SEQUENCE, '')
			: data.replace(TerminalDecoder.ANSI_CONTROL_SEQUENCE, '');

		if (value.length < 1) {
			return result;
		}
		let start = 0;
		let ch: number;
		while (start < value.length && ((ch = value.charCodeAt(start)) === CharCode.CarriageReturn || ch === CharCode.LineFeed)) {
			start++;
		}
		let idx = start;
		while (idx < value.length) {
			ch = value.charCodeAt(idx);
			if (ch === CharCode.CarriageReturn || ch === CharCode.LineFeed) {
				result.push(value.substring(start, idx));
				idx++;
				while (idx < value.length && ((ch = value.charCodeAt(idx)) === CharCode.CarriageReturn || ch === CharCode.LineFeed)) {
					idx++;
				}
				start = idx;
			} else {
				idx++;
			}
		}
		this.remaining = start < value.length ? value.substr(start) : null;
		return result;
	}

	public end(): string {
		return this.remaining;
	}
}
export class TerminalTaskSystem extends EventEmitter implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private validationStatus: ValidationStatus;
	private buildTaskIdentifier: string;
	private testTaskIdentifier: string;
	private configuration: TaskRunnerConfiguration;

	private outputChannel: IOutputChannel;
	private activeTasks: IStringDictionary<TerminalData>;

	constructor(private fileConfig: FileConfig.ExternalTaskRunnerConfiguration, private terminalService: ITerminalService, private outputService: IOutputService,
		private markerService: IMarkerService, private modelService: IModelService, private configurationResolverService: IConfigurationResolverService,
		private telemetryService: ITelemetryService, outputChannelId: string) {
		super();

		this.outputChannel = this.outputService.getChannel(outputChannelId);
		this.clearOutput();
		this.activeTasks = Object.create(null);

		let parseResult = FileConfig.parse(fileConfig, this);
		this.validationStatus = parseResult.validationStatus;
		this.configuration = parseResult.configuration;
		this.buildTaskIdentifier = parseResult.defaultBuildTaskIdentifier;
		this.testTaskIdentifier = parseResult.defaultTestTaskIdentifier;

		if (!this.validationStatus.isOK()) {
			this.showOutput();
		}
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

	public build(): ITaskExecuteResult {
		if (!this.buildTaskIdentifier) {
			throw new TaskError(Severity.Info, nls.localize('TerminalTaskSystem.noBuildTask', 'No build task defined in tasks.json'), TaskErrors.NoBuildTask);
		}
		return this.run(this.buildTaskIdentifier, Triggers.shortcut);
	}

	public rebuild(): ITaskExecuteResult {
		throw new Error('Task - Rebuild: not implemented yet');
	}

	public clean(): ITaskExecuteResult {
		throw new Error('Task - Clean: not implemented yet');
	}

	public runTest(): ITaskExecuteResult {
		if (!this.testTaskIdentifier) {
			throw new TaskError(Severity.Info, nls.localize('TerminalTaskSystem.noTestTask', 'No test task defined in tasks.json'), TaskErrors.NoTestTask);
		}
		return this.run(this.testTaskIdentifier, Triggers.shortcut);
	}

	public run(taskIdentifier: string, trigger: string = Triggers.command): ITaskExecuteResult {
		let task = this.configuration.tasks[taskIdentifier];
		if (!task) {
			throw new TaskError(Severity.Info, nls.localize('TerminalTaskSystem.noTask', 'Task \'{0}\' not found', taskIdentifier), TaskErrors.TaskNotFound);
		}
		let telemetryEvent: TelemetryEvent = {
			trigger: trigger,
			command: 'other',
			success: true
		};
		try {
			let result = this.executeTask(task, telemetryEvent);
			result.promise = result.promise.then((summary) => {
				this.telemetryService.publicLog(TerminalTaskSystem.TelemetryEventName, telemetryEvent);
				return summary;
			}, (error) => {
				telemetryEvent.success = false;
				this.telemetryService.publicLog(TerminalTaskSystem.TelemetryEventName, telemetryEvent);
				return TPromise.wrapError<ITaskSummary>(error);
			});
			return result;
		} catch (error) {
			telemetryEvent.success = false;
			this.telemetryService.publicLog(TerminalTaskSystem.TelemetryEventName, telemetryEvent);
			if (error instanceof TaskError) {
				throw error;
			} else if (error instanceof Error) {
				this.log(error.message);
				throw new TaskError(Severity.Error, error.message, TaskErrors.UnknownError);
			} else {
				this.log(error.toString());
				throw new TaskError(Severity.Error, nls.localize('TerminalTaskSystem.unknownError', 'A unknown error has occurred while executing a task. See task output log for details.'), TaskErrors.UnknownError);
			}
		}
	}

	public isActive(): TPromise<boolean> {
		return TPromise.as(this.isActiveSync());
	}

	public isActiveSync(): boolean {
		return Object.keys(this.activeTasks).length > 0;
	}

	public canAutoTerminate(): boolean {
		return Object.keys(this.activeTasks).every(key => this.configuration.tasks[key].isBackground);
	}

	public terminate(): TPromise<TerminateResponse> {
		Object.keys(this.activeTasks).forEach((key) => {
			let data = this.activeTasks[key];
			data.terminal.dispose();
		});
		this.activeTasks = Object.create(null);
		return TPromise.as<TerminateResponse>({ success: true });
	}

	public tasks(): TPromise<TaskDescription[]> {
		let result: TaskDescription[];
		if (!this.configuration || !this.configuration.tasks) {
			result = [];
		} else {
			result = Object.keys(this.configuration.tasks).map(key => this.configuration.tasks[key]);
		}
		return TPromise.as(result);
	}

	private executeTask(task: TaskDescription, telemetryEvent: TelemetryEvent): ITaskExecuteResult {
		let terminalData = this.activeTasks[task.id];
		if (terminalData && terminalData.promise) {
			if (task.showOutput === ShowOutput.Always) {
				terminalData.terminal.setVisible(true);
			}
			return { kind: TaskExecuteKind.Active, active: { same: true, background: task.isBackground }, promise: terminalData.promise };
		} else {
			let terminal: ITerminalInstance = undefined;
			let promise: TPromise<ITaskSummary> = undefined;
			if (task.isBackground) {
				promise = new TPromise<ITaskSummary>((resolve, reject) => {
					let watchingProblemMatcher = new WatchingProblemCollector(this.resolveMatchers(task.problemMatchers), this.markerService, this.modelService);
					let toUnbind: IDisposable[] = [];
					let event: TaskEvent = { taskId: task.id, taskName: task.name, type: TaskType.Watching };
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
					let decoder = new TerminalDecoder();
					terminal = this.createTerminal(task);
					terminal.onData((data: string) => {
						decoder.write(data).forEach(line => {
							watchingProblemMatcher.processLine(line);
							if (delayer === null) {
								delayer = new Async.Delayer(3000);
							}
							delayer.trigger(() => {
								watchingProblemMatcher.forceDelivery();
								delayer = null;
							});
						});
					});
					terminal.onExit((exitCode) => {
						watchingProblemMatcher.dispose();
						toUnbind = dispose(toUnbind);
						toUnbind = null;
						for (let i = 0; i < eventCounter; i++) {
							this.emit(TaskSystemEvents.Inactive, event);
						}
						eventCounter = 0;
						if (exitCode && exitCode === 1 && watchingProblemMatcher.numberOfMatches === 0 && task.showOutput !== ShowOutput.Never) {
							this.terminalService.setActiveInstance(terminal);
							this.terminalService.showPanel(false);
						}
						resolve({ exitCode });
					});
				});
			} else {
				promise = new TPromise<ITaskSummary>((resolve, reject) => {
					terminal = this.createTerminal(task);
					this.emit(TaskSystemEvents.Active, event);
					let decoder = new TerminalDecoder();
					let startStopProblemMatcher = new StartStopProblemCollector(this.resolveMatchers(task.problemMatchers), this.markerService, this.modelService);
					terminal.onData((data: string) => {
						decoder.write(data).forEach((line) => {
							startStopProblemMatcher.processLine(line);
						});
					});
					terminal.onExit((exitCode) => {
						startStopProblemMatcher.processLine(decoder.end());
						startStopProblemMatcher.done();
						startStopProblemMatcher.dispose();
						this.emit(TaskSystemEvents.Inactive, event);
						delete this.activeTasks[task.id];
						terminal.reuseTerminal();
						resolve({ exitCode });
					});
					this.terminalService.setActiveInstance(terminal);
					if (task.showOutput === ShowOutput.Always) {
						this.terminalService.showPanel(false);
					}
				});
			}
			this.terminalService.setActiveInstance(terminal);
			if (task.showOutput === ShowOutput.Always) {
				this.terminalService.showPanel(false);
			}
			this.activeTasks[task.id] = { terminal, promise };
			return { kind: TaskExecuteKind.Started, started: {}, promise: promise };
		}
	}

	private createTerminal(task: TaskDescription): ITerminalInstance {
		let options = this.resolveOptions(this.configuration.options);
		let { command, args } = this.resolveCommandAndArgs(task);
		let terminalName = nls.localize('TerminalTaskSystem.terminalName', 'Task - {0}', task.name);
		let waitOnExit = task.showOutput !== ShowOutput.Never || !task.isBackground;
		if (this.configuration.isShellCommand) {
			if (Platform.isWindows && ((options.cwd && TPath.isUNC(options.cwd)) || (!options.cwd && TPath.isUNC(process.cwd())))) {
				throw new TaskError(Severity.Error, nls.localize('TerminalTaskSystem', 'Can\'t execute a shell command on an UNC drive.'), TaskErrors.UnknownError);
			}
			let shellConfig: IShellLaunchConfig = { executable: null, args: null };
			if (options.cwd) {
				shellConfig.cwd = options.cwd;
			}
			if (options.env) {
				let env: IStringDictionary<string> = Object.create(null);
				Object.keys(process.env).forEach((key) => {
					env[key] = process.env[key];
				});
				Object.keys(options.env).forEach((key) => {
					env[key] = options.env[key];
				});
				shellConfig.env = env;
			}
			(this.terminalService.configHelper as TerminalConfigHelper).mergeDefaultShellPathAndArgs(shellConfig);
			let shellArgs = shellConfig.args.slice(0);
			let toAdd: string[] = [];
			let commandLine: string;
			if (Platform.isWindows) {
				toAdd.push('/d', '/c');
				let quotedCommand: boolean = false;
				let quotedArg: boolean = false;
				let quoted = this.ensureDoubleQuotes(command);
				let commandPieces: string[] = [];
				commandPieces.push(quoted.value);
				quotedCommand = quoted.quoted;
				if (args) {
					args.forEach((arg) => {
						quoted = this.ensureDoubleQuotes(arg);
						commandPieces.push(quoted.value);
						quotedArg = quotedArg && quoted.quoted;
					});
				}
				if (quotedCommand) {
					if (quotedArg) {
						commandLine = '"' + commandPieces.join(' ') + '"';
					} else {
						if (commandPieces.length > 1) {
							commandLine = '"' + commandPieces[0] + '"' + ' ' + commandPieces.slice(1).join(' ');
						} else {
							commandLine = '"' + commandPieces[0] + '"';
						}
					}
				} else {
					commandLine = commandPieces.join(' ');
				}
			} else {
				toAdd.push('-c');
				commandLine = `${command} ${args.join(' ')}`;
			}
			toAdd.forEach(element => {
				if (!shellArgs.some(arg => arg.toLowerCase() === element)) {
					shellArgs.push(element);
				}
			});
			shellArgs.push(commandLine);
			const shellLaunchConfig: IShellLaunchConfig = {
				name: terminalName,
				executable: shellConfig.executable,
				args: shellArgs,
				waitOnExit
			};
			return this.terminalService.createInstance(shellLaunchConfig);
		} else {
			let cwd = options && options.cwd ? options.cwd : process.cwd();
			// On Windows executed process must be described absolute. Since we allowed command without an
			// absolute path (e.g. "command": "node") we need to find the executable in the CWD or PATH.
			let executable = Platform.isWindows && !this.configuration.isShellCommand ? this.findExecutable(command, cwd) : command;
			const shellLaunchConfig: IShellLaunchConfig = {
				name: terminalName,
				executable: executable,
				args,
				waitOnExit
			};
			return this.terminalService.createInstance(shellLaunchConfig);
		}
	}

	private resolveCommandAndArgs(task: TaskDescription): { command: string, args: string[] } {
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
		let command: string = this.resolveVariable(this.configuration.command);
		return { command, args };
	}

	private findExecutable(command: string, cwd: string): string {
		// If we have an absolute path then we take it.
		if (path.isAbsolute(command)) {
			return command;
		}
		let dir = path.dirname(command);
		if (dir !== '.') {
			// We have a directory. So leave the command as is.
			return command;
		}
		// We have a simple file name. We get the path variable from the env
		// and try to find the executable on the path.
		if (!process.env.PATH) {
			return command;
		}
		let paths: string[] = (process.env.PATH as string).split(path.delimiter);
		for (let pathEntry of paths) {
			// The path entry is absolute.
			let fullPath: string;
			if (path.isAbsolute(pathEntry)) {
				fullPath = path.join(pathEntry, command);
			} else {
				fullPath = path.join(cwd, pathEntry, command);
			}
			if (fs.existsSync(fullPath)) {
				return fullPath;
			}
			let withExtension = fullPath + '.com';
			if (fs.existsSync(withExtension)) {
				return withExtension;
			}
			withExtension = fullPath + '.exe';
			if (fs.existsSync(withExtension)) {
				return withExtension;
			}
		}
		return command;
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

	private static doubleQuotes = /^[^"].* .*[^"]$/;
	private ensureDoubleQuotes(value: string) {
		if (TerminalTaskSystem.doubleQuotes.test(value)) {
			return {
				value: '"' + value + '"',
				quoted: true
			};
		} else {
			return {
				value: value,
				quoted: value.length > 0 && value[0] === '"' && value[value.length - 1] === '"'
			};
		}
	}

	private static WellKnowCommands: IStringDictionary<boolean> = {
		'ant': true,
		'cmake': true,
		'eslint': true,
		'gradle': true,
		'grunt': true,
		'gulp': true,
		'jake': true,
		'jenkins': true,
		'jshint': true,
		'make': true,
		'maven': true,
		'msbuild': true,
		'msc': true,
		'nmake': true,
		'npm': true,
		'rake': true,
		'tsc': true,
		'xbuild': true
	};

	public getSanitizedCommand(cmd: string): string {
		let result = cmd.toLowerCase();
		let index = result.lastIndexOf(path.sep);
		if (index !== -1) {
			result = result.substring(index + 1);
		}
		if (TerminalTaskSystem.WellKnowCommands[result]) {
			return result;
		}
		return 'other';
	}
}