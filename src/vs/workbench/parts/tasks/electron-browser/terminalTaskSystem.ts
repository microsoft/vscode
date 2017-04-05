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
// import URI from 'vs/base/common/uri';

import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ProblemMatcher /*, ProblemPattern, getResource */ } from 'vs/platform/markers/common/problemMatcher';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { IOutputService, IOutputChannel } from 'vs/workbench/parts/output/common/output';
import { StartStopProblemCollector, WatchingProblemCollector, ProblemCollectorEvents } from 'vs/workbench/parts/tasks/common/problemCollectors';
import { Task, ShowOutput, CommandOptions, ShellConfiguration } from 'vs/workbench/parts/tasks/common/tasks';
import {
	ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, ITaskResolver,
	TelemetryEvent, Triggers, TaskSystemEvents, TaskEvent, TaskType
} from 'vs/workbench/parts/tasks/common/taskSystem';

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
		this.remaining = start < value.length ? value.substr(start) : undefined;
		return result;
	}

	public end(): string {
		return this.remaining;
	}
}

interface PrimaryTerminal {
	terminal: ITerminalInstance;
	busy: boolean;
}

interface TerminalData {
	terminal: ITerminalInstance;
	lastTask: string;
}

interface ActiveTerminalData {
	terminal: ITerminalInstance;
	task: Task;
	promise: TPromise<ITaskSummary>;
}

export class TerminalTaskSystem extends EventEmitter implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private outputChannel: IOutputChannel;
	private activeTasks: IStringDictionary<ActiveTerminalData>;
	private primaryTerminal: PrimaryTerminal;
	private terminals: IStringDictionary<TerminalData>;
	private idleTaskTerminals: IStringDictionary<string>;

	constructor(private terminalService: ITerminalService, private outputService: IOutputService,
		private markerService: IMarkerService, private modelService: IModelService,
		private configurationResolverService: IConfigurationResolverService,
		private telemetryService: ITelemetryService,
		private workbenchEditorService: IWorkbenchEditorService,
		outputChannelId: string) {
		super();

		this.outputChannel = this.outputService.getChannel(outputChannelId);
		this.activeTasks = Object.create(null);
		this.terminals = Object.create(null);
		this.idleTaskTerminals = Object.create(null);
	}

	public log(value: string): void {
		this.outputChannel.append(value + '\n');
	}

	protected showOutput(): void {
		this.outputChannel.show(true);
	}

	public run(task: Task, resolver: ITaskResolver, trigger: string = Triggers.command): ITaskExecuteResult {
		let terminalData = this.activeTasks[task._id];
		if (terminalData && terminalData.promise) {
			if (task.showOutput === ShowOutput.Always) {
				terminalData.terminal.setVisible(true);
			}
			return { kind: TaskExecuteKind.Active, active: { same: true, background: task.isBackground }, promise: terminalData.promise };
		}

		try {
			return { kind: TaskExecuteKind.Started, started: {}, promise: this.executeTask(Object.create(null), task, resolver, trigger) };
		} catch (error) {
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
		return Object.keys(this.activeTasks).every(key => !this.activeTasks[key].task.promptOnClose);
	}

	public getActiveTasks(): Task[] {
		return Object.keys(this.activeTasks).map(key => this.activeTasks[key].task);
	}

	public terminate(id: string): TPromise<TerminateResponse> {
		let terminalData = this.activeTasks[id];
		if (!terminalData) {
			return TPromise.as<TerminateResponse>({ success: false });
		};
		return new TPromise<TerminateResponse>((resolve, reject) => {
			let terminal = terminalData.terminal;
			const onExit = terminal.onExit(() => {
				onExit.dispose();
				resolve({ success: true });
			});
			terminal.dispose();
		});
	}

	public terminateAll(): TPromise<TerminateResponse> {
		Object.keys(this.activeTasks).forEach((key) => {
			let data = this.activeTasks[key];
			data.terminal.dispose();
		});
		this.activeTasks = Object.create(null);
		return TPromise.as<TerminateResponse>({ success: true });
	}

	private executeTask(startedTasks: IStringDictionary<TPromise<ITaskSummary>>, task: Task, resolver: ITaskResolver, trigger: string): TPromise<ITaskSummary> {
		let promises: TPromise<ITaskSummary>[] = [];
		if (task.dependsOn) {
			task.dependsOn.forEach((identifier) => {
				let task = resolver.resolve(identifier);
				if (task) {
					let promise = startedTasks[task._id];
					if (!promise) {
						promise = this.executeTask(startedTasks, task, resolver, trigger);
						startedTasks[task._id] = promise;
					}
					promises.push(promise);
				}
			});
		}

		if (task.command) {
			return TPromise.join(promises).then((summaries): ITaskSummary => {
				for (let summary of summaries) {
					if (summary.exitCode !== 0) {
						return { exitCode: summary.exitCode };
					}
				}
				return this.executeCommand(task, trigger);
			});
		} else {
			return TPromise.join(promises).then((summaries): ITaskSummary => {
				for (let summary of summaries) {
					if (summary.exitCode !== 0) {
						return { exitCode: summary.exitCode };
					}
				}
				return { exitCode: 0 };
			});
		}
	}

	private executeCommand(task: Task, trigger: string): TPromise<ITaskSummary> {
		let terminal: ITerminalInstance = undefined;
		let executedCommand: string = undefined;
		let promise: TPromise<ITaskSummary> = undefined;
		if (task.isBackground) {
			promise = new TPromise<ITaskSummary>((resolve, reject) => {
				const problemMatchers = this.resolveMatchers(task.problemMatchers);
				let watchingProblemMatcher = new WatchingProblemCollector(problemMatchers, this.markerService, this.modelService);
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
				let decoder = new TerminalDecoder();
				[terminal, executedCommand] = this.createTerminal(task);
				const registeredLinkMatchers = this.registerLinkMatchers(terminal, problemMatchers);
				const onData = terminal.onData((data: string) => {
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
				const onExit = terminal.onExit((exitCode) => {
					onData.dispose();
					onExit.dispose();
					delete this.activeTasks[task._id];
					if (this.primaryTerminal && this.primaryTerminal.terminal === terminal) {
						this.primaryTerminal.busy = false;
					}
					this.idleTaskTerminals[task._id] = terminal.id.toString();
					let remaining = decoder.end();
					if (remaining) {
						watchingProblemMatcher.processLine(remaining);
					}
					watchingProblemMatcher.dispose();
					registeredLinkMatchers.forEach(handle => terminal.deregisterLinkMatcher(handle));
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
				[terminal, executedCommand] = this.createTerminal(task);
				let event: TaskEvent = { taskId: task._id, taskName: task.name, type: TaskType.SingleRun };
				this.emit(TaskSystemEvents.Active, event);
				let decoder = new TerminalDecoder();
				let problemMatchers = this.resolveMatchers(task.problemMatchers);
				let startStopProblemMatcher = new StartStopProblemCollector(problemMatchers, this.markerService, this.modelService);
				const registeredLinkMatchers = this.registerLinkMatchers(terminal, problemMatchers);
				const onData = terminal.onData((data: string) => {
					decoder.write(data).forEach((line) => {
						startStopProblemMatcher.processLine(line);
					});
				});
				const onExit = terminal.onExit((exitCode) => {
					onData.dispose();
					onExit.dispose();
					delete this.activeTasks[task._id];
					if (this.primaryTerminal && this.primaryTerminal.terminal === terminal) {
						this.primaryTerminal.busy = false;
					}
					this.idleTaskTerminals[task._id] = terminal.id.toString();
					let remaining = decoder.end();
					if (remaining) {
						startStopProblemMatcher.processLine(remaining);
					}
					startStopProblemMatcher.done();
					startStopProblemMatcher.dispose();
					registeredLinkMatchers.forEach(handle => terminal.deregisterLinkMatcher(handle));
					this.emit(TaskSystemEvents.Inactive, event);
					resolve({ exitCode });
				});
			});
		}
		this.terminalService.setActiveInstance(terminal);
		if (task.showOutput === ShowOutput.Always) {
			this.terminalService.showPanel(false);
		}
		this.activeTasks[task._id] = { terminal, task, promise };
		return promise.then((summary) => {
			try {
				let telemetryEvent: TelemetryEvent = {
					trigger: trigger,
					command: this.getSanitizedCommand(executedCommand),
					success: true,
					exitCode: summary.exitCode
				};
				this.telemetryService.publicLog(TerminalTaskSystem.TelemetryEventName, telemetryEvent);
			} catch (error) {
			}
			return summary;
		}, (error) => {
			try {
				let telemetryEvent: TelemetryEvent = {
					trigger: trigger,
					command: this.getSanitizedCommand(executedCommand),
					success: false
				};
				this.telemetryService.publicLog(TerminalTaskSystem.TelemetryEventName, telemetryEvent);
			} catch (error) {
			}
			return TPromise.wrapError<ITaskSummary>(error);
		});
	}

	private createTerminal(task: Task): [ITerminalInstance, string] {
		let options = this.resolveOptions(task.command.options);
		let { command, args } = this.resolveCommandAndArgs(task);
		let terminalName = nls.localize('TerminalTaskSystem.terminalName', 'Task - {0}', task.name);
		let waitOnExit = task.showOutput !== ShowOutput.Never || !task.isBackground;
		let shellLaunchConfig: IShellLaunchConfig = undefined;
		if (task.command.isShellCommand) {
			if (Platform.isWindows && ((options.cwd && TPath.isUNC(options.cwd)) || (!options.cwd && TPath.isUNC(process.cwd())))) {
				throw new TaskError(Severity.Error, nls.localize('TerminalTaskSystem', 'Can\'t execute a shell command on an UNC drive.'), TaskErrors.UnknownError);
			}
			shellLaunchConfig = { name: terminalName, executable: null, args: null, waitOnExit };
			let shellSpecified: boolean = false;
			if (ShellConfiguration.is(task.command.isShellCommand)) {
				shellLaunchConfig.executable = task.command.isShellCommand.executable;
				shellSpecified = true;
				if (task.command.isShellCommand.args) {
					shellLaunchConfig.args = task.command.isShellCommand.args.slice();
				} else {
					shellLaunchConfig.args = [];
				}
			} else {
				this.terminalService.configHelper.mergeDefaultShellPathAndArgs(shellLaunchConfig);
			}
			let shellArgs = <string[]>shellLaunchConfig.args.slice(0);
			let toAdd: string[] = [];
			let commandLine = args && args.length > 0 ? `${command} ${args.join(' ')}` : `${command}`;
			if (Platform.isWindows) {
				let basename = path.basename(shellLaunchConfig.executable).toLowerCase();
				if (basename === 'powershell.exe') {
					if (!shellSpecified) {
						toAdd.push('-Command');
					}
				} else if (basename === 'bash.exe') {
					if (!shellSpecified) {
						toAdd.push('-c');
					}
				} else {
					if (!shellSpecified) {
						toAdd.push('/d', '/c');
					}
				}
			} else {
				if (!shellSpecified) {
					toAdd.push('-c');
				}
			}
			toAdd.forEach(element => {
				if (!shellArgs.some(arg => arg.toLowerCase() === element)) {
					shellArgs.push(element);
				}
			});
			shellArgs.push(commandLine);
			shellLaunchConfig.args = Platform.isWindows ? shellArgs.join(' ') : shellArgs;
			if (task.command.echo) {
				shellLaunchConfig.initialText = `> ${commandLine}`;
			}
		} else {
			let cwd = options && options.cwd ? options.cwd : process.cwd();
			// On Windows executed process must be described absolute. Since we allowed command without an
			// absolute path (e.g. "command": "node") we need to find the executable in the CWD or PATH.
			let executable = Platform.isWindows && !task.command.isShellCommand ? this.findExecutable(command, cwd) : command;
			shellLaunchConfig = {
				name: terminalName,
				executable: executable,
				args,
				waitOnExit
			};
			if (task.command.echo) {
				let getArgsToEcho = (args: string | string[]): string => {
					if (!args || args.length === 0) {
						return '';
					}
					if (Types.isString(args)) {
						return args;
					}
					return args.join(' ');
				};
				shellLaunchConfig.initialText = `> ${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)}`;
			}
		}
		if (options.cwd) {
			shellLaunchConfig.cwd = options.cwd;
		}
		if (options.env) {
			let env: IStringDictionary<string> = Object.create(null);
			Object.keys(process.env).forEach((key) => {
				env[key] = process.env[key];
			});
			Object.keys(options.env).forEach((key) => {
				env[key] = options.env[key];
			});
			shellLaunchConfig.env = env;
		}
		let terminalId = this.idleTaskTerminals[task._id];
		if (terminalId) {
			let taskTerminal = this.terminals[terminalId];
			if (taskTerminal) {
				delete this.idleTaskTerminals[task._id];
				taskTerminal.terminal.reuseTerminal(shellLaunchConfig);
				return [taskTerminal.terminal, command];
			}
		}
		if (this.primaryTerminal && !this.primaryTerminal.busy) {
			// We reuse the primary terminal. Make sure the last running task isn't referenced in the idle terminals
			let terminalData = this.terminals[this.primaryTerminal.terminal.id.toString()];
			if (terminalData) {
				delete this.idleTaskTerminals[terminalData.lastTask];
			}
			this.primaryTerminal.terminal.reuseTerminal(shellLaunchConfig);
			this.primaryTerminal.busy = true;
			return [this.primaryTerminal.terminal, command];
		}
		const result = this.terminalService.createInstance(shellLaunchConfig);
		const key = result.id.toString();
		result.onDisposed((terminal) => {
			let terminalData = this.terminals[key];
			if (terminalData) {
				delete this.terminals[key];
				delete this.idleTaskTerminals[terminalData.lastTask];
			}
			if (this.primaryTerminal && this.primaryTerminal.terminal === terminal) {
				this.primaryTerminal = undefined;
			}
		});
		this.terminals[key] = { terminal: result, lastTask: task._id };
		if (!task.isBackground && !this.primaryTerminal) {
			this.primaryTerminal = { terminal: result, busy: true };
		}
		return [result, command];
	}

	private resolveCommandAndArgs(task: Task): { command: string, args: string[] } {
		// First we need to use the command args:
		let args: string[] = task.command.args ? task.command.args.slice() : [];
		// We need to first pass the task name
		if (!task.suppressTaskName) {
			if (task.command.taskSelector) {
				args.push(task.command.taskSelector + task.name);
			} else {
				args.push(task.name);
			}
		}
		// And then additional arguments
		if (task.args) {
			args = args.concat(task.args);
		}
		args = this.resolveVariables(args);
		let command: string = this.resolveVariable(task.command.name);
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
		if (values === void 0 || values === null) {
			return [];
		}
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
		if (options === void 0 || options === null) {
			return { cwd: this.resolveVariable('${cwd}') };
		}
		let result: CommandOptions = Types.isString(options.cwd)
			? { cwd: this.resolveVariable(options.cwd) }
			: { cwd: this.resolveVariable('${cwd}') };
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

	private registerLinkMatchers(terminal: ITerminalInstance, problemMatchers: ProblemMatcher[]): number[] {
		let result: number[] = [];
		/*
		let handlePattern = (matcher: ProblemMatcher, pattern: ProblemPattern): void => {
			if (pattern.regexp instanceof RegExp && Types.isNumber(pattern.file)) {
				result.push(terminal.registerLinkMatcher(pattern.regexp, (match: string) => {
					let resource: URI = getResource(match, matcher);
					if (resource) {
						this.workbenchEditorService.openEditor({
							resource: resource
						});
					}
				}, 0));
			}
		};

		for (let problemMatcher of problemMatchers) {
			if (Array.isArray(problemMatcher.pattern)) {
				for (let pattern of problemMatcher.pattern) {
					handlePattern(problemMatcher, pattern);
				}
			} else if (problemMatcher.pattern) {
				handlePattern(problemMatcher, problemMatcher.pattern);
			}
		}
		*/
		return result;
	}

	private static doubleQuotes = /^[^"].* .*[^"]$/;
	protected ensureDoubleQuotes(value: string) {
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