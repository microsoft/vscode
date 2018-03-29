/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as fs from 'fs';
import * as path from 'path';

import * as nls from 'vs/nls';
import * as Objects from 'vs/base/common/objects';
import * as Types from 'vs/base/common/types';
import * as Platform from 'vs/base/common/platform';
import * as Async from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IStringDictionary } from 'vs/base/common/collections';
import { LinkedMap, Touch } from 'vs/base/common/map';
import Severity from 'vs/base/common/severity';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as TPath from 'vs/base/common/paths';

import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ProblemMatcher, ProblemMatcherRegistry /*, ProblemPattern, getResource */ } from 'vs/workbench/parts/tasks/common/problemMatcher';

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { IOutputService, IOutputChannel } from 'vs/workbench/parts/output/common/output';
import { StartStopProblemCollector, WatchingProblemCollector, ProblemCollectorEventKind } from 'vs/workbench/parts/tasks/common/problemCollectors';
import {
	Task, CustomTask, ContributedTask, RevealKind, CommandOptions, ShellConfiguration, RuntimeType, PanelKind,
	TaskEvent, TaskEventKind, ShellQuotingOptions, ShellQuoting, CommandString
} from 'vs/workbench/parts/tasks/common/tasks';
import {
	ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, ITaskResolver,
	TelemetryEvent, Triggers, TaskTerminateResponse
} from 'vs/workbench/parts/tasks/common/taskSystem';

interface TerminalData {
	terminal: ITerminalInstance;
	lastTask: string;
}

interface ActiveTerminalData {
	terminal: ITerminalInstance;
	task: Task;
	promise: TPromise<ITaskSummary>;
}

export class TerminalTaskSystem implements ITaskSystem {

	public static TelemetryEventName: string = 'taskService';

	private static shellQuotes: IStringDictionary<ShellQuotingOptions> = {
		'cmd': {
			strong: '"'
		},
		'powershell': {
			escape: {
				escapeChar: '`',
				charsToEscape: ' "\'()'
			},
			strong: '\'',
			weak: '"'
		},
		'bash': {
			escape: {
				escapeChar: '\\',
				charsToEscape: ' "\''
			},
			strong: '\'',
			weak: '"'
		},
		'zsh': {
			escape: {
				escapeChar: '\\',
				charsToEscape: ' "\''
			},
			strong: '\'',
			weak: '"'
		}
	};

	private static osShellQuotes: IStringDictionary<ShellQuotingOptions> = {
		'linux': TerminalTaskSystem.shellQuotes['bash'],
		'darwin': TerminalTaskSystem.shellQuotes['bash'],
		'win32': TerminalTaskSystem.shellQuotes['powershell']
	};

	private outputChannel: IOutputChannel;
	private activeTasks: IStringDictionary<ActiveTerminalData>;
	private terminals: IStringDictionary<TerminalData>;
	private idleTaskTerminals: LinkedMap<string, string>;
	private sameTaskTerminals: IStringDictionary<string>;

	private readonly _onDidStateChange: Emitter<TaskEvent>;

	constructor(private terminalService: ITerminalService, private outputService: IOutputService,
		private markerService: IMarkerService, private modelService: IModelService,
		private configurationResolverService: IConfigurationResolverService,
		private telemetryService: ITelemetryService,
		private contextService: IWorkspaceContextService,
		outputChannelId: string) {

		this.outputChannel = this.outputService.getChannel(outputChannelId);
		this.activeTasks = Object.create(null);
		this.terminals = Object.create(null);
		this.idleTaskTerminals = new LinkedMap<string, string>();
		this.sameTaskTerminals = Object.create(null);

		this._onDidStateChange = new Emitter();
	}

	public get onDidStateChange(): Event<TaskEvent> {
		return this._onDidStateChange.event;
	}

	public log(value: string): void {
		this.outputChannel.append(value + '\n');
	}

	protected showOutput(): void {
		this.outputService.showChannel(this.outputChannel.id, true);
	}

	public run(task: Task, resolver: ITaskResolver, trigger: string = Triggers.command): ITaskExecuteResult {
		let terminalData = this.activeTasks[Task.getMapKey(task)];
		if (terminalData && terminalData.promise) {
			let reveal = RevealKind.Always;
			let focus = false;
			if (CustomTask.is(task) || ContributedTask.is(task)) {
				reveal = task.command.presentation.reveal;
				focus = task.command.presentation.focus;
			}
			if (reveal === RevealKind.Always || focus) {
				this.terminalService.setActiveInstance(terminalData.terminal);
				this.terminalService.showPanel(focus);
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


	public revealTask(task: Task): boolean {
		let terminalData = this.activeTasks[Task.getMapKey(task)];
		if (!terminalData) {
			return false;
		}
		this.terminalService.setActiveInstance(terminalData.terminal);
		if (CustomTask.is(task) || ContributedTask.is(task)) {
			this.terminalService.showPanel(task.command.presentation.focus);
		}
		return true;
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

	public terminate(task: Task): TPromise<TaskTerminateResponse> {
		let activeTerminal = this.activeTasks[Task.getMapKey(task)];
		if (!activeTerminal) {
			return TPromise.as<TaskTerminateResponse>({ success: false, task: undefined });
		}
		return new TPromise<TaskTerminateResponse>((resolve, reject) => {
			let terminal = activeTerminal.terminal;
			const onExit = terminal.onExit(() => {
				let task = activeTerminal.task;
				try {
					onExit.dispose();
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Terminated, task));
				} catch (error) {
					// Do nothing.
				}
				resolve({ success: true, task: task });
			});
			terminal.dispose();
		});
	}

	public terminateAll(): TPromise<TaskTerminateResponse[]> {
		let promises: TPromise<TaskTerminateResponse>[] = [];
		Object.keys(this.activeTasks).forEach((key) => {
			let terminalData = this.activeTasks[key];
			let terminal = terminalData.terminal;
			promises.push(new TPromise<TaskTerminateResponse>((resolve, reject) => {
				const onExit = terminal.onExit(() => {
					let task = terminalData.task;
					try {
						onExit.dispose();
						this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Terminated, task));
					} catch (error) {
						// Do nothing.
					}
					resolve({ success: true, task: terminalData.task });
				});
			}));
			terminal.dispose();
		});
		this.activeTasks = Object.create(null);
		return TPromise.join<TaskTerminateResponse>(promises);
	}

	private executeTask(startedTasks: IStringDictionary<TPromise<ITaskSummary>>, task: Task, resolver: ITaskResolver, trigger: string): TPromise<ITaskSummary> {
		let promises: TPromise<ITaskSummary>[] = [];
		if (task.dependsOn) {
			task.dependsOn.forEach((dependency) => {
				let task = resolver.resolve(dependency.workspaceFolder, dependency.task);
				if (task) {
					let key = Task.getMapKey(task);
					let promise = startedTasks[key];
					if (!promise) {
						promise = this.executeTask(startedTasks, task, resolver, trigger);
						startedTasks[key] = promise;
					}
					promises.push(promise);
				} else {
					this.log(nls.localize('dependencyFailed', 'Couldn\'t resolve dependent task \'{0}\' in workspace folder \'{1}\'', dependency.task, dependency.workspaceFolder.name));
					this.showOutput();
				}
			});
		}

		if ((ContributedTask.is(task) || CustomTask.is(task)) && (task.command)) {
			return TPromise.join(promises).then((summaries): TPromise<ITaskSummary> | ITaskSummary => {
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

	private executeCommand(task: CustomTask | ContributedTask, trigger: string): TPromise<ITaskSummary> {
		let terminal: ITerminalInstance = undefined;
		let executedCommand: string = undefined;
		let promise: TPromise<ITaskSummary> = undefined;
		if (task.isBackground) {
			promise = new TPromise<ITaskSummary>((resolve, reject) => {
				const problemMatchers = this.resolveMatchers(task, task.problemMatchers);
				let watchingProblemMatcher = new WatchingProblemCollector(problemMatchers, this.markerService, this.modelService);
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
				let delayer: Async.Delayer<any> = undefined;
				[terminal, executedCommand] = this.createTerminal(task);
				this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Start, task));
				const registeredLinkMatchers = this.registerLinkMatchers(terminal, problemMatchers);
				const onData = terminal.onLineData((line) => {
					watchingProblemMatcher.processLine(line);
					if (!delayer) {
						delayer = new Async.Delayer(3000);
					}
					delayer.trigger(() => {
						watchingProblemMatcher.forceDelivery();
						delayer = undefined;
					});
				});
				const onExit = terminal.onExit((exitCode) => {
					onData.dispose();
					onExit.dispose();
					let key = Task.getMapKey(task);
					delete this.activeTasks[key];
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Changed));
					switch (task.command.presentation.panel) {
						case PanelKind.Dedicated:
							this.sameTaskTerminals[key] = terminal.id.toString();
							break;
						case PanelKind.Shared:
							this.idleTaskTerminals.set(key, terminal.id.toString(), Touch.AsOld);
							break;
					}
					watchingProblemMatcher.done();
					watchingProblemMatcher.dispose();
					registeredLinkMatchers.forEach(handle => terminal.deregisterLinkMatcher(handle));
					toUnbind = dispose(toUnbind);
					toUnbind = null;
					for (let i = 0; i < eventCounter; i++) {
						let event = TaskEvent.create(TaskEventKind.Inactive, task);
						this._onDidStateChange.fire(event);
					}
					eventCounter = 0;
					let reveal = task.command.presentation.reveal;
					if (exitCode && exitCode === 1 && watchingProblemMatcher.numberOfMatches === 0 && reveal !== RevealKind.Never) {
						this.terminalService.setActiveInstance(terminal);
						this.terminalService.showPanel(false);
					}
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.End, task));
					resolve({ exitCode });
				});
			});
		} else {
			promise = new TPromise<ITaskSummary>((resolve, reject) => {
				[terminal, executedCommand] = this.createTerminal(task);
				this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Start, task));
				this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Active, task));
				let problemMatchers = this.resolveMatchers(task, task.problemMatchers);
				let startStopProblemMatcher = new StartStopProblemCollector(problemMatchers, this.markerService, this.modelService);
				const registeredLinkMatchers = this.registerLinkMatchers(terminal, problemMatchers);
				const onData = terminal.onLineData((line) => {
					startStopProblemMatcher.processLine(line);
				});
				const onExit = terminal.onExit((exitCode) => {
					onData.dispose();
					onExit.dispose();
					let key = Task.getMapKey(task);
					delete this.activeTasks[key];
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Changed));
					switch (task.command.presentation.panel) {
						case PanelKind.Dedicated:
							this.sameTaskTerminals[key] = terminal.id.toString();
							break;
						case PanelKind.Shared:
							this.idleTaskTerminals.set(key, terminal.id.toString(), Touch.AsOld);
							break;
					}
					startStopProblemMatcher.done();
					startStopProblemMatcher.dispose();
					registeredLinkMatchers.forEach(handle => terminal.deregisterLinkMatcher(handle));
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Inactive, task));
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.End, task));
					// See https://github.com/Microsoft/vscode/issues/31965
					if (exitCode === 0 && startStopProblemMatcher.numberOfMatches > 0) {
						exitCode = 1;
					}
					resolve({ exitCode });
				});
			});
		}
		if (!terminal) {
			return TPromise.wrapError<ITaskSummary>(new Error(`Failed to create terminal for task ${task._label}`));
		}
		if (task.command.presentation.reveal === RevealKind.Always || (task.command.presentation.reveal === RevealKind.Silent && task.problemMatchers.length === 0)) {
			this.terminalService.setActiveInstance(terminal);
			this.terminalService.showPanel(task.command.presentation.focus);
		}
		this.activeTasks[Task.getMapKey(task)] = { terminal, task, promise };
		this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Changed));
		return promise.then((summary) => {
			try {
				let telemetryEvent: TelemetryEvent = {
					trigger: trigger,
					runner: 'terminal',
					taskKind: Task.getTelemetryKind(task),
					command: this.getSanitizedCommand(executedCommand),
					success: true,
					exitCode: summary.exitCode
				};
				/* __GDPR__
					"taskService" : {
						"${include}": [
							"${TelemetryEvent}"
						]
					}
				*/
				this.telemetryService.publicLog(TerminalTaskSystem.TelemetryEventName, telemetryEvent);
			} catch (error) {
			}
			return summary;
		}, (error) => {
			try {
				let telemetryEvent: TelemetryEvent = {
					trigger: trigger,
					runner: 'terminal',
					taskKind: Task.getTelemetryKind(task),
					command: this.getSanitizedCommand(executedCommand),
					success: false
				};
				/* __GDPR__
					"taskService" : {
						"${include}": [
							"${TelemetryEvent}"
						]
					}
				*/
				this.telemetryService.publicLog(TerminalTaskSystem.TelemetryEventName, telemetryEvent);
			} catch (error) {
			}
			return TPromise.wrapError<ITaskSummary>(error);
		});
	}

	private createTerminal(task: CustomTask | ContributedTask): [ITerminalInstance, string] {
		let options = this.resolveOptions(task, task.command.options);
		let { command, args } = this.resolveCommandAndArgs(task);
		let commandExecutable = CommandString.value(command);
		let workspaceFolder = Task.getWorkspaceFolder(task);
		let needsFolderQualification = workspaceFolder && this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
		let terminalName = nls.localize('TerminalTaskSystem.terminalName', 'Task - {0}', needsFolderQualification ? Task.getQualifiedLabel(task) : task.name);
		let waitOnExit: boolean | string = false;
		if (task.command.presentation.reveal !== RevealKind.Never || !task.isBackground) {
			if (task.command.presentation.panel === PanelKind.New) {
				waitOnExit = nls.localize('closeTerminal', 'Press any key to close the terminal.');
			} else {
				waitOnExit = nls.localize('reuseTerminal', 'Terminal will be reused by tasks, press any key to close it.');
			}
		}
		let shellLaunchConfig: IShellLaunchConfig = undefined;
		let isShellCommand = task.command.runtime === RuntimeType.Shell;
		if (isShellCommand) {
			if (Platform.isWindows && ((options.cwd && TPath.isUNC(options.cwd)) || (!options.cwd && TPath.isUNC(process.cwd())))) {
				throw new TaskError(Severity.Error, nls.localize('TerminalTaskSystem', 'Can\'t execute a shell command on an UNC drive.'), TaskErrors.UnknownError);
			}
			shellLaunchConfig = { name: terminalName, executable: null, args: null, waitOnExit };
			let shellSpecified: boolean = false;
			let shellOptions: ShellConfiguration = task.command.options && task.command.options.shell;
			if (shellOptions && shellOptions.executable) {
				shellLaunchConfig.executable = this.resolveVariable(task, shellOptions.executable);
				shellSpecified = true;
				if (shellOptions.args) {
					shellLaunchConfig.args = this.resolveVariables(task, shellOptions.args.slice());
				} else {
					shellLaunchConfig.args = [];
				}
			} else {
				this.terminalService.configHelper.mergeDefaultShellPathAndArgs(shellLaunchConfig);
			}
			let shellArgs = <string[]>shellLaunchConfig.args.slice(0);
			let toAdd: string[] = [];
			let commandLine = this.buildShellCommandLine(shellLaunchConfig.executable, shellOptions, command, args);
			let windowsShellArgs: boolean = false;
			if (Platform.isWindows) {
				windowsShellArgs = true;
				let basename = path.basename(shellLaunchConfig.executable).toLowerCase();
				if (basename === 'powershell.exe' || basename === 'pwsh.exe') {
					if (!shellSpecified) {
						toAdd.push('-Command');
					}
				} else if (basename === 'bash.exe' || basename === 'zsh.exe') {
					windowsShellArgs = false;
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
			shellLaunchConfig.args = windowsShellArgs ? shellArgs.join(' ') : shellArgs;
			if (task.command.presentation.echo) {
				if (needsFolderQualification) {
					shellLaunchConfig.initialText = `\x1b[1m> Executing task in folder ${workspaceFolder.name}: ${commandLine} <\x1b[0m\n`;
				} else {
					shellLaunchConfig.initialText = `\x1b[1m> Executing task: ${commandLine} <\x1b[0m\n`;
				}
			}
		} else {
			let cwd = options && options.cwd ? options.cwd : process.cwd();
			// On Windows executed process must be described absolute. Since we allowed command without an
			// absolute path (e.g. "command": "node") we need to find the executable in the CWD or PATH.
			let executable = Platform.isWindows && !isShellCommand ? this.findExecutable(commandExecutable, cwd) : commandExecutable;

			// When we have a process task there is no need to quote arguments. So we go ahead and take the string value.
			shellLaunchConfig = {
				name: terminalName,
				executable: executable,
				args: args.map(a => Types.isString(a) ? a : a.value),
				waitOnExit
			};
			if (task.command.presentation.echo) {
				let getArgsToEcho = (args: string | string[]): string => {
					if (!args || args.length === 0) {
						return '';
					}
					if (Types.isString(args)) {
						return args;
					}
					return args.join(' ');
				};
				if (needsFolderQualification) {
					shellLaunchConfig.initialText = `\x1b[1m> Executing task in folder ${workspaceFolder.name}: ${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)} <\x1b[0m\n`;
				} else {
					shellLaunchConfig.initialText = `\x1b[1m> Executing task: ${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)} <\x1b[0m\n`;
				}
			}
		}
		if (options.cwd) {
			let cwd = options.cwd;
			if (!path.isAbsolute(cwd)) {
				let workspaceFolder = Task.getWorkspaceFolder(task);
				if (workspaceFolder.uri.scheme === 'file') {
					cwd = path.join(workspaceFolder.uri.fsPath, cwd);
				}
			}
			// This must be normalized to the OS
			shellLaunchConfig.cwd = path.normalize(cwd);
		}
		if (options.env) {
			shellLaunchConfig.env = options.env;
		}
		let prefersSameTerminal = task.command.presentation.panel === PanelKind.Dedicated;
		let allowsSharedTerminal = task.command.presentation.panel === PanelKind.Shared;

		let taskKey = Task.getMapKey(task);
		let terminalToReuse: TerminalData;
		if (prefersSameTerminal) {
			let terminalId = this.sameTaskTerminals[taskKey];
			if (terminalId) {
				terminalToReuse = this.terminals[terminalId];
				delete this.sameTaskTerminals[taskKey];
			}
		} else if (allowsSharedTerminal) {
			let terminalId = this.idleTaskTerminals.remove(taskKey) || this.idleTaskTerminals.shift();
			if (terminalId) {
				terminalToReuse = this.terminals[terminalId];
			}
		}
		if (terminalToReuse) {
			terminalToReuse.terminal.reuseTerminal(shellLaunchConfig);
			return [terminalToReuse.terminal, commandExecutable];
		}

		const result = this.terminalService.createInstance(shellLaunchConfig);
		const terminalKey = result.id.toString();
		result.onDisposed((terminal) => {
			let terminalData = this.terminals[terminalKey];
			if (terminalData) {
				delete this.terminals[terminalKey];
				delete this.sameTaskTerminals[terminalData.lastTask];
				this.idleTaskTerminals.delete(terminalData.lastTask);
			}
		});
		this.terminals[terminalKey] = { terminal: result, lastTask: taskKey };
		return [result, commandExecutable];
	}

	private buildShellCommandLine(shellExecutable: string, shellOptions: ShellConfiguration, command: CommandString, args: CommandString[]): string {
		// If we have no args and the command is a string then use the
		// command to stay backwards compatible with the old command line
		// model.
		if ((!args || args.length === 0) && Types.isString(command)) {
			return command;
		}
		let basename = path.parse(shellExecutable).name.toLowerCase();
		let shellQuoteOptions = this.getOuotingOptions(basename, shellOptions);

		function needsQuotes(value: string): boolean {
			if (value.length >= 2) {
				let first = value[0] === shellQuoteOptions.strong ? shellQuoteOptions.strong : value[0] === shellQuoteOptions.weak ? shellQuoteOptions.weak : undefined;
				if (first === value[value.length - 1]) {
					return false;
				}
			}
			for (let i = 0; i < value.length; i++) {
				if (value[i] === ' ' && value[i - 1] !== shellQuoteOptions.escape) {
					return true;
				}
			}
			return false;
		}

		function quote(value: string, kind: ShellQuoting): [string, boolean] {
			if (kind === ShellQuoting.Strong && shellQuoteOptions.strong) {
				return [shellQuoteOptions.strong + value + shellQuoteOptions.strong, true];
			} else if (kind === ShellQuoting.Weak && shellQuoteOptions.weak) {
				return [shellQuoteOptions.weak + value + shellQuoteOptions.weak, true];
			} else if (kind === ShellQuoting.Escape && shellQuoteOptions.escape) {
				if (Types.isString(shellQuoteOptions.escape)) {
					return [value.replace(/ /g, shellQuoteOptions.escape + ' '), true];
				} else {
					let buffer: string[] = [];
					for (let ch of shellQuoteOptions.escape.charsToEscape) {
						buffer.push(`\\${ch}`);
					}
					let regexp: RegExp = new RegExp('[' + buffer.join(',') + ']', 'g');
					let escapeChar = shellQuoteOptions.escape.escapeChar;
					return [value.replace(regexp, (match) => escapeChar + match), true];
				}
			}
			return [value, false];
		}

		function quoteIfNecessary(value: CommandString): [string, boolean] {
			if (Types.isString(value)) {
				if (needsQuotes(value)) {
					return quote(value, ShellQuoting.Strong);
				} else {
					return [value, false];
				}
			} else {
				return quote(value.value, value.quoting);
			}
		}

		let result: string[] = [];
		let commandQuoted = false;
		let argQuoted = false;
		let value: string;
		let quoted: boolean;
		[value, quoted] = quoteIfNecessary(command);
		result.push(value);
		commandQuoted = quoted;
		for (let arg of args) {
			[value, quoted] = quoteIfNecessary(arg);
			result.push(value);
			argQuoted = argQuoted || quoted;
		}

		let commandLine = result.join(' ');
		// There are special rules quoted command line in cmd.exe
		if (Platform.isWindows) {
			if (basename === 'cmd' && commandQuoted && argQuoted) {
				commandLine = '"' + commandLine + '"';
			} else if (basename === 'powershell' && commandQuoted) {
				commandLine = '& ' + commandLine;
			}
		}

		if (basename === 'cmd' && Platform.isWindows && commandQuoted && argQuoted) {
			commandLine = '"' + commandLine + '"';
		}
		return commandLine;
	}

	private getOuotingOptions(shellBasename: string, shellOptions: ShellConfiguration): ShellQuotingOptions {
		if (shellOptions && shellOptions.quoting) {
			return shellOptions.quoting;
		}
		return TerminalTaskSystem.shellQuotes[shellBasename] || TerminalTaskSystem.osShellQuotes[process.platform];
	}

	private resolveCommandAndArgs(task: CustomTask | ContributedTask): { command: CommandString, args: CommandString[] } {
		// First we need to use the command args:
		let args: CommandString[] = task.command.args ? task.command.args.slice() : [];
		args = this.resolveVariables(task, args);
		let command: CommandString = this.resolveVariable(task, task.command.name);
		return { command, args };
	}

	private findExecutable(command: string, cwd: string): string {
		// If we have an absolute path then we take it.
		if (path.isAbsolute(command)) {
			return command;
		}
		let dir = path.dirname(command);
		if (dir !== '.') {
			// We have a directory. Make the path absolute
			// to the current working directory
			return path.join(cwd, command);
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
		return path.join(cwd, command);
	}

	private resolveVariables(task: CustomTask | ContributedTask, value: string[]): string[];
	private resolveVariables(task: CustomTask | ContributedTask, value: CommandString[]): CommandString[];
	private resolveVariables(task: CustomTask | ContributedTask, value: CommandString[]): CommandString[] {
		return value.map(s => this.resolveVariable(task, s));
	}

	private resolveMatchers(task: CustomTask | ContributedTask, values: (string | ProblemMatcher)[]): ProblemMatcher[] {
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

	private resolveVariable(task: CustomTask | ContributedTask, value: string): string;
	private resolveVariable(task: CustomTask | ContributedTask, value: CommandString): CommandString;
	private resolveVariable(task: CustomTask | ContributedTask, value: CommandString): CommandString {
		// TODO@Dirk Task.getWorkspaceFolder should return a WorkspaceFolder that is defined in workspace.ts
		if (Types.isString(value)) {
			return this.configurationResolverService.resolve(<any>Task.getWorkspaceFolder(task), value);
		} else {
			return {
				value: this.configurationResolverService.resolve(<any>Task.getWorkspaceFolder(task), value.value),
				quoting: value.quoting
			};
		}
	}

	private resolveOptions(task: CustomTask | ContributedTask, options: CommandOptions): CommandOptions {
		if (options === void 0 || options === null) {
			return { cwd: this.resolveVariable(task, '${workspaceFolder}') };
		}
		let result: CommandOptions = Types.isString(options.cwd)
			? { cwd: this.resolveVariable(task, options.cwd) }
			: { cwd: this.resolveVariable(task, '${workspaceFolder}') };
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
