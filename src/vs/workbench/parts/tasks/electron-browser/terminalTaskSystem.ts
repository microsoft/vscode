/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

import { IMarkerService, MarkerSeverity } from 'vs/platform/markers/common/markers';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ProblemMatcher, ProblemMatcherRegistry /*, ProblemPattern, getResource */ } from 'vs/workbench/parts/tasks/common/problemMatcher';

import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ITerminalService, ITerminalInstance, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { IOutputService, IOutputChannel } from 'vs/workbench/parts/output/common/output';
import { StartStopProblemCollector, WatchingProblemCollector, ProblemCollectorEventKind } from 'vs/workbench/parts/tasks/common/problemCollectors';
import {
	Task, CustomTask, ContributedTask, RevealKind, CommandOptions, ShellConfiguration, RuntimeType, PanelKind,
	TaskEvent, TaskEventKind, ShellQuotingOptions, ShellQuoting, CommandString, CommandConfiguration
} from 'vs/workbench/parts/tasks/common/tasks';
import {
	ITaskSystem, ITaskSummary, ITaskExecuteResult, TaskExecuteKind, TaskError, TaskErrors, ITaskResolver,
	TelemetryEvent, Triggers, TaskTerminateResponse, TaskSystemInfoResovler, TaskSystemInfo
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

class VariableResolver {

	constructor(public workspaceFolder: IWorkspaceFolder, public taskSystemInfo: TaskSystemInfo | undefined, private _values: Map<string, string>, private _service: IConfigurationResolverService | undefined) {
	}
	resolve(value: string): string {
		return value.replace(/\$\{(.*?)\}/g, (match: string, variable: string) => {
			let result = this._values.get(match);
			if (result) {
				return result;
			}
			if (this._service) {
				return this._service.resolve(this.workspaceFolder, match);
			}
			return match;
		});
	}
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
	private taskSystemInfoResolver: TaskSystemInfoResovler;

	private readonly _onDidStateChange: Emitter<TaskEvent>;

	constructor(private terminalService: ITerminalService, private outputService: IOutputService,
		private markerService: IMarkerService, private modelService: IModelService,
		private configurationResolverService: IConfigurationResolverService,
		private telemetryService: ITelemetryService,
		private contextService: IWorkspaceContextService,
		outputChannelId: string,
		taskSystemInfoResolver: TaskSystemInfoResovler) {

		this.outputChannel = this.outputService.getChannel(outputChannelId);
		this.activeTasks = Object.create(null);
		this.terminals = Object.create(null);
		this.idleTaskTerminals = new LinkedMap<string, string>();
		this.sameTaskTerminals = Object.create(null);

		this._onDidStateChange = new Emitter();
		this.taskSystemInfoResolver = taskSystemInfoResolver;
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
					this.log(nls.localize('dependencyFailed',
						'Couldn\'t resolve dependent task \'{0}\' in workspace folder \'{1}\'',
						Types.isString(dependency.task) ? dependency.task : JSON.stringify(dependency.task, undefined, 0),
						dependency.workspaceFolder.name
					));
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
		let variables = new Set<string>();
		this.collectTaskVariables(variables, task);
		let workspaceFolder = Task.getWorkspaceFolder(task);
		let taskSystemInfo: TaskSystemInfo;
		if (workspaceFolder) {
			taskSystemInfo = this.taskSystemInfoResolver(workspaceFolder);
		}
		let resolvedVariables: TPromise<Map<string, string>>;
		if (taskSystemInfo) {
			resolvedVariables = taskSystemInfo.resolveVariables(workspaceFolder, variables);
		} else {
			let result = new Map<string, string>();
			variables.forEach(variable => {
				result.set(variable, this.configurationResolverService.resolve(workspaceFolder, variable));
			});
			resolvedVariables = TPromise.as(result);
		}
		return resolvedVariables.then((variables) => {
			return this.executeInTerminal(task, trigger, new VariableResolver(workspaceFolder, taskSystemInfo, variables, this.configurationResolverService));
		});
	}

	private executeInTerminal(task: CustomTask | ContributedTask, trigger: string, resolver: VariableResolver): TPromise<ITaskSummary> {
		let terminal: ITerminalInstance | undefined = undefined;
		let executedCommand: string | undefined = undefined;
		let error: TaskError | undefined = undefined;
		let promise: TPromise<ITaskSummary> | undefined = undefined;
		if (task.isBackground) {
			promise = new TPromise<ITaskSummary>((resolve, reject) => {
				const problemMatchers = this.resolveMatchers(resolver, task.problemMatchers);
				let watchingProblemMatcher = new WatchingProblemCollector(problemMatchers, this.markerService, this.modelService);
				let toDispose: IDisposable[] = [];
				let eventCounter: number = 0;
				toDispose.push(watchingProblemMatcher.onDidStateChange((event) => {
					if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
						eventCounter++;
						this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Active, task));
					} else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
						eventCounter--;
						this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Inactive, task));
						if (eventCounter === 0) {
							let reveal = task.command.presentation.reveal;
							if ((reveal === RevealKind.Silent) && (watchingProblemMatcher.numberOfMatches > 0) && (watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error)) {
								this.terminalService.setActiveInstance(terminal);
								this.terminalService.showPanel(false);
							}
						}
					}
				}));
				watchingProblemMatcher.aboutToStart();
				let delayer: Async.Delayer<any> = undefined;
				[terminal, executedCommand, error] = this.createTerminal(task, resolver);
				if (error || !terminal) {
					return;
				}
				let processStartedSignaled = false;
				terminal.processReady.then(() => {
					if (!processStartedSignaled) {
						this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.ProcessStarted, task, terminal.processId));
						processStartedSignaled = true;
					}
				}, (_error) => {
					// The process never got ready. Need to think how to handle this.
				});
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
					let reveal = task.command.presentation.reveal;
					if ((reveal === RevealKind.Silent) && ((exitCode !== 0) || (watchingProblemMatcher.numberOfMatches > 0) && (watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error))) {
						this.terminalService.setActiveInstance(terminal);
						this.terminalService.showPanel(false);
					}
					watchingProblemMatcher.done();
					watchingProblemMatcher.dispose();
					registeredLinkMatchers.forEach(handle => terminal.deregisterLinkMatcher(handle));
					if (!processStartedSignaled) {
						this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.ProcessStarted, task, terminal.processId));
						processStartedSignaled = true;
					}
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.ProcessEnded, task, exitCode));
					for (let i = 0; i < eventCounter; i++) {
						let event = TaskEvent.create(TaskEventKind.Inactive, task);
						this._onDidStateChange.fire(event);
					}
					eventCounter = 0;
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.End, task));
					toDispose = dispose(toDispose);
					toDispose = null;
					resolve({ exitCode });
				});
			});
		} else {
			promise = new TPromise<ITaskSummary>((resolve, reject) => {
				[terminal, executedCommand, error] = this.createTerminal(task, resolver);
				if (error || !terminal) {
					return;
				}

				let processStartedSignaled = false;
				terminal.processReady.then(() => {
					if (!processStartedSignaled) {
						this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.ProcessStarted, task, terminal.processId));
						processStartedSignaled = true;
					}
				}, (_error) => {
					// The process never got ready. Need to think how to handle this.
				});
				this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Start, task));
				this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Active, task));
				let problemMatchers = this.resolveMatchers(resolver, task.problemMatchers);
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
					let reveal = task.command.presentation.reveal;
					if ((reveal === RevealKind.Silent) && ((exitCode !== 0) || (startStopProblemMatcher.numberOfMatches > 0) && (startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error))) {
						this.terminalService.setActiveInstance(terminal);
						this.terminalService.showPanel(false);
					}
					startStopProblemMatcher.done();
					startStopProblemMatcher.dispose();
					registeredLinkMatchers.forEach(handle => terminal.deregisterLinkMatcher(handle));
					if (!processStartedSignaled) {
						this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.ProcessStarted, task, terminal.processId));
						processStartedSignaled = true;
					}
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.ProcessEnded, task, exitCode));
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.Inactive, task));
					this._onDidStateChange.fire(TaskEvent.create(TaskEventKind.End, task));
					resolve({ exitCode });
				});
			});
		}
		if (error) {
			return TPromise.wrapError<ITaskSummary>(new Error(error.message));
		}
		if (!terminal) {
			return TPromise.wrapError<ITaskSummary>(new Error(`Failed to create terminal for task ${task._label}`));
		}
		if (task.command.presentation.reveal === RevealKind.Always) {
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

	private createTerminal(task: CustomTask | ContributedTask, resolver: VariableResolver): [ITerminalInstance, string, TaskError | undefined] {
		let platform = resolver.taskSystemInfo ? resolver.taskSystemInfo.platform : Platform.platform;
		let options = this.resolveOptions(resolver, task.command.options);
		let originalCommand = task.command.name;
		let { command, args } = this.resolveCommandAndArgs(resolver, task.command);
		let commandExecutable = CommandString.value(command);
		let workspaceFolder = Task.getWorkspaceFolder(task);
		let needsFolderQualification = workspaceFolder && this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
		let terminalName = nls.localize('TerminalTaskSystem.terminalName', 'Task - {0}', needsFolderQualification ? Task.getQualifiedLabel(task) : task.name);
		let waitOnExit: boolean | string = false;
		if (task.command.presentation.reveal !== RevealKind.Never || !task.isBackground) {
			if (task.command.presentation.panel === PanelKind.New) {
				waitOnExit = nls.localize('closeTerminal', 'Press any key to close the terminal.');
			} else if (task.command.presentation.showReuseMessage) {
				waitOnExit = nls.localize('reuseTerminal', 'Terminal will be reused by tasks, press any key to close it.');
			} else {
				waitOnExit = true;
			}
		}
		let shellLaunchConfig: IShellLaunchConfig | undefined = undefined;
		let isShellCommand = task.command.runtime === RuntimeType.Shell;
		if (isShellCommand) {
			shellLaunchConfig = { name: terminalName, executable: null, args: null, waitOnExit };
			this.terminalService.configHelper.mergeDefaultShellPathAndArgs(shellLaunchConfig, platform);
			let shellSpecified: boolean = false;
			let shellOptions: ShellConfiguration = task.command.options && task.command.options.shell;
			if (shellOptions) {
				if (shellOptions.executable) {
					shellLaunchConfig.executable = this.resolveVariable(resolver, shellOptions.executable);
					shellSpecified = true;
				}
				if (shellOptions.args) {
					shellLaunchConfig.args = this.resolveVariables(resolver, shellOptions.args.slice());
				} else {
					shellLaunchConfig.args = [];
				}
			}
			let shellArgs = <string[]>shellLaunchConfig.args.slice(0);
			let toAdd: string[] = [];
			let commandLine = this.buildShellCommandLine(shellLaunchConfig.executable, shellOptions, command, originalCommand, args);
			let windowsShellArgs: boolean = false;
			if (platform === Platform.Platform.Windows) {
				// Change Sysnative to System32 if the OS is Windows but NOT WoW64. It's
				// safe to assume that this was used by accident as Sysnative does not
				// exist and will break the terminal in non-WoW64 environments.
				if (!process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')) {
					const sysnativePath = path.join(process.env.windir, 'Sysnative').toLowerCase();
					if (shellLaunchConfig.executable.toLowerCase().indexOf(sysnativePath) === 0) {
						shellLaunchConfig.executable = path.join(process.env.windir, 'System32', shellLaunchConfig.executable.substr(sysnativePath.length));
					}
				}
				windowsShellArgs = true;
				let basename = path.basename(shellLaunchConfig.executable).toLowerCase();
				if (basename === 'cmd.exe' && ((options.cwd && TPath.isUNC(options.cwd)) || (!options.cwd && TPath.isUNC(process.cwd())))) {
					return [undefined, undefined, new TaskError(Severity.Error, nls.localize('TerminalTaskSystem', 'Can\'t execute a shell command on an UNC drive using cmd.exe.'), TaskErrors.UnknownError)];
				}
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
					// Under Mac remove -l to not start it as a login shell.
					if (Platform.isMacintosh) {
						let index = shellArgs.indexOf('-l');
						if (index !== -1) {
							shellArgs.splice(index, 1);
						}
					}
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
			let executable = Platform.isWindows && !isShellCommand ? this.findExecutable(commandExecutable, cwd, options) : commandExecutable;

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
			let p: typeof path;
			// This must be normalized to the OS
			if (platform === Platform.Platform.Windows) {
				p = path.win32 as any;
			} else if (platform === Platform.Platform.Linux || platform === Platform.Platform.Mac) {
				p = path.posix as any;
			} else {
				p = path;
			}
			if (!p.isAbsolute(cwd)) {
				let workspaceFolder = Task.getWorkspaceFolder(task);
				if (workspaceFolder.uri.scheme === 'file') {
					cwd = p.join(workspaceFolder.uri.fsPath, cwd);
				}
			}
			// This must be normalized to the OS
			shellLaunchConfig.cwd = p.normalize(cwd);
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
			if (task.command.presentation.clear) {
				terminalToReuse.terminal.clear();
			}
			return [terminalToReuse.terminal, commandExecutable, undefined];
		}

		const result = this.terminalService.createTerminal(shellLaunchConfig);
		const terminalKey = result.id.toString();
		result.onDisposed((terminal) => {
			let terminalData = this.terminals[terminalKey];
			if (terminalData) {
				delete this.terminals[terminalKey];
				delete this.sameTaskTerminals[terminalData.lastTask];
				this.idleTaskTerminals.delete(terminalData.lastTask);
				// Delete the task now as a work around for cases when the onExit isn't fired.
				// This can happen if the terminal wasn't shutdown with an "immediate" flag and is expected.
				// For correct terminal re-use, the task needs to be deleted immediately.
				// Note that this shouldn't be a problem anymore since user initiated terminal kills are now immediate.
				delete this.activeTasks[Task.getMapKey(task)];
			}
		});
		this.terminals[terminalKey] = { terminal: result, lastTask: taskKey };
		return [result, commandExecutable, undefined];
	}

	private buildShellCommandLine(shellExecutable: string, shellOptions: ShellConfiguration, command: CommandString, originalCommand: CommandString, args: CommandString[]): string {
		let basename = path.parse(shellExecutable).name.toLowerCase();
		let shellQuoteOptions = this.getQuotingOptions(basename, shellOptions);

		function needsQuotes(value: string): boolean {
			if (value.length >= 2) {
				let first = value[0] === shellQuoteOptions.strong ? shellQuoteOptions.strong : value[0] === shellQuoteOptions.weak ? shellQuoteOptions.weak : undefined;
				if (first === value[value.length - 1]) {
					return false;
				}
			}
			let quote: string;
			for (let i = 0; i < value.length; i++) {
				// We found the end quote.
				let ch = value[i];
				if (ch === quote) {
					quote = undefined;
				} else if (quote !== void 0) {
					// skip the character. We are quoted.
					continue;
				} else if (ch === shellQuoteOptions.escape) {
					// Skip the next character
					i++;
				} else if (ch === shellQuoteOptions.strong || ch === shellQuoteOptions.weak) {
					quote = ch;
				} else if (ch === ' ') {
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

		// If we have no args and the command is a string then use the command to stay backwards compatible with the old command line
		// model. To allow variable resolving with spaces we do continue if the resolved value is different than the original one
		// and the resolved one needs quoting.
		if ((!args || args.length === 0) && Types.isString(command) && (command === originalCommand as string || needsQuotes(originalCommand as string))) {
			return command;
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

	private getQuotingOptions(shellBasename: string, shellOptions: ShellConfiguration): ShellQuotingOptions {
		if (shellOptions && shellOptions.quoting) {
			return shellOptions.quoting;
		}
		return TerminalTaskSystem.shellQuotes[shellBasename] || TerminalTaskSystem.osShellQuotes[process.platform];
	}

	private collectTaskVariables(variables: Set<string>, task: CustomTask | ContributedTask): void {
		if (task.command) {
			this.collectCommandVariables(variables, task.command);
		}
		this.collectMatcherVariables(variables, task.problemMatchers);
	}

	private collectCommandVariables(variables: Set<string>, command: CommandConfiguration): void {
		this.collectVariables(variables, command.name);
		if (command.args) {
			command.args.forEach(arg => this.collectVariables(variables, arg));
		}
		variables.add('${workspaceFolder}');
		if (command.options) {
			let options = command.options;
			if (options.cwd) {
				this.collectVariables(variables, options.cwd);
			}
			if (options.env) {
				Object.keys(options.env).forEach((key) => {
					let value: any = options.env[key];
					if (Types.isString(value)) {
						this.collectVariables(variables, value);
					}
				});
			}
			if (options.shell) {
				if (options.shell.executable) {
					this.collectVariables(variables, options.shell.executable);
				}
				if (options.shell.args) {
					options.shell.args.forEach(arg => this.collectVariables(variables, arg));
				}
			}
		}
	}

	private collectMatcherVariables(variables: Set<string>, values: (string | ProblemMatcher)[]): void {
		if (values === void 0 || values === null || values.length === 0) {
			return;
		}
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
			if (matcher && matcher.filePrefix) {
				this.collectVariables(variables, matcher.filePrefix);
			}
		});
	}

	private collectVariables(variables: Set<string>, value: string | CommandString): void {
		let string: string = Types.isString(value) ? value : value.value;
		let r = /\$\{(.*?)\}/g;
		let matches: RegExpExecArray;
		do {
			matches = r.exec(string);
			if (matches) {
				variables.add(matches[0]);
			}
		} while (matches);
	}

	private resolveCommandAndArgs(resolver: VariableResolver, commandConfig: CommandConfiguration): { command: CommandString, args: CommandString[] } {
		// First we need to use the command args:
		let args: CommandString[] = commandConfig.args ? commandConfig.args.slice() : [];
		args = this.resolveVariables(resolver, args);
		let command: CommandString = this.resolveVariable(resolver, commandConfig.name);
		return { command, args };
	}

	private findExecutable(command: string, cwd: string, options: CommandOptions): string {
		// If we have an absolute path then we take it.
		if (path.isAbsolute(command)) {
			return command;
		}
		let dir = path.dirname(command);
		if (dir !== '.') {
			// We have a directory and the directory is relative (see above). Make the path absolute
			// to the current working directory.
			return path.join(cwd, command);
		}
		let paths: string[] | undefined = undefined;
		// The options can override the PATH. So consider that PATH if present.
		if (options && options.env) {
			// Path can be named in many different ways and for the execution it doesn't matter
			for (let key of Object.keys(options.env)) {
				if (key.toLowerCase() === 'path') {
					if (Types.isString(options.env[key])) {
						paths = options.env[key].split(path.delimiter);
					}
					break;
				}
			}
		}
		if (paths === void 0 && Types.isString(process.env.PATH)) {
			paths = process.env.PATH.split(path.delimiter);
		}
		// No PATH environment. Make path absolute to the cwd.
		if (paths === void 0 || paths.length === 0) {
			return path.join(cwd, command);
		}
		// We have a simple file name. We get the path variable from the env
		// and try to find the executable on the path.
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

	private resolveVariables(resolver: VariableResolver, value: string[]): string[];
	private resolveVariables(resolver: VariableResolver, value: CommandString[]): CommandString[];
	private resolveVariables(resolver: VariableResolver, value: CommandString[]): CommandString[] {
		return value.map(s => this.resolveVariable(resolver, s));
	}

	private resolveMatchers(resolver: VariableResolver, values: (string | ProblemMatcher)[]): ProblemMatcher[] {
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
			let taskSystemInfo: TaskSystemInfo = resolver.taskSystemInfo;
			let hasFilePrefix = matcher.filePrefix !== void 0;
			let hasUriProvider = taskSystemInfo !== void 0 && taskSystemInfo.uriProvider !== void 0;
			if (!hasFilePrefix && !hasUriProvider) {
				result.push(matcher);
			} else {
				let copy = Objects.deepClone(matcher);
				if (hasUriProvider) {
					copy.uriProvider = taskSystemInfo.uriProvider;
				}
				if (hasFilePrefix) {
					copy.filePrefix = this.resolveVariable(resolver, copy.filePrefix);
				}
				result.push(copy);
			}
		});
		return result;
	}

	private resolveVariable(resolver: VariableResolver, value: string): string;
	private resolveVariable(resolver: VariableResolver, value: CommandString): CommandString;
	private resolveVariable(resolver: VariableResolver, value: CommandString): CommandString {
		// TODO@Dirk Task.getWorkspaceFolder should return a WorkspaceFolder that is defined in workspace.ts
		if (Types.isString(value)) {
			return resolver.resolve(value);
		} else {
			return {
				value: resolver.resolve(value.value),
				quoting: value.quoting
			};
		}
	}

	private resolveOptions(resolver: VariableResolver, options: CommandOptions): CommandOptions {
		if (options === void 0 || options === null) {
			return { cwd: this.resolveVariable(resolver, '${workspaceFolder}') };
		}
		let result: CommandOptions = Types.isString(options.cwd)
			? { cwd: this.resolveVariable(resolver, options.cwd) }
			: { cwd: this.resolveVariable(resolver, '${workspaceFolder}') };
		if (options.env) {
			result.env = Object.create(null);
			Object.keys(options.env).forEach((key) => {
				let value: any = options.env[key];
				if (Types.isString(value)) {
					result.env[key] = this.resolveVariable(resolver, value);
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
