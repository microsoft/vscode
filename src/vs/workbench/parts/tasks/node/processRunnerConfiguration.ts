/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

import * as Objects from 'vs/base/common/objects';
import { IStringDictionary } from 'vs/base/common/collections';
import * as Platform from 'vs/base/common/platform';
import * as Types from 'vs/base/common/types';
import * as UUID from 'vs/base/common/uuid';
import { Config as ProcessConfig } from 'vs/base/common/processes';

import { ValidationStatus, ValidationState, ILogger } from 'vs/base/common/parsers';
import { NamedProblemMatcher, ProblemMatcher, ProblemMatcherParser, Config as ProblemMatcherConfig, registry as ProblemMatcherRegistry, isNamedProblemMatcher } from 'vs/platform/markers/common/problemMatcher';
import * as TaskSystem from 'vs/workbench/parts/tasks/common/taskSystem';

/**
 * Defines the problem handling strategy
 */
export class ProblemHandling {
	/**
	 * Cleans all problems for the owner defined in the
	 * error pattern.
	 */
	public static clean: string = 'cleanMatcherMatchers';
}

export namespace ShowOutput {
	// let always: string = 'always';
	// let silent: string = 'silent';
	// let never: string = 'never';
}

/**
 * The description of a task.
 */
export interface TaskDescription {

	/**
	 * The task's name
	 */
	taskName: string;

	/**
	 * Additional arguments passed to the command when this task is
	 * executed.
	 */
	args?: string[];

	/**
	 * Whether the executed command is kept alive and is watching the file system.
	 */
	isWatching?:boolean;

	/**
	 * Whether the task should prompt on close for confirmation if running.
	 */
	promptOnClose?: boolean;

	/**
	 * Whether this task maps to the default build command.
	 */
	isBuildCommand?:boolean;

	/**
	 * Whether this task maps to the default test command.
	 */
	isTestCommand?: boolean;

	/**
	 * Controls whether the output view of the running tasks is brought to front or not.
	 * See BaseTaskRunnerConfiguration#showOutput for details.
	 */
	showOutput?: string;

	/**
	 * Controls whether the executed command is printed to the output windows as well.
	 */
	echoCommand?: boolean;

	/**
	 * See BaseTaskRunnerConfiguration#suppressTaskName for details.
	 */
	suppressTaskName?: boolean;

	/**
	 * The problem matcher(s) to use to capture problems in the tasks
	 * output.
	 */
	problemMatcher?: ProblemMatcherConfig.ProblemMatcherType;
}

/**
 * The base task runner configuration
 */
export interface BaseTaskRunnerConfiguration extends TaskSystem.TaskConfiguration {

	/**
	 * The command to be executed. Can be an external program or a shell
	 * command.
	 */
	command?: string;

	/**
	 * Specifies whether the command is a shell command and therefore must
	 * be executed in a shell interpreter (e.g. cmd.exe, bash, ...).
	 *
	 * Defaults to false if omitted.
	 */
	isShellCommand?: boolean;

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: ProcessConfig.CommandOptions;

	/**
	 * The arguments passed to the command. Can be omitted.
	 */
	args?: string[];

	/**
	 * Controls whether the output view of the running tasks is brought to front or not.
	 * Valid values are:
	 *   "always": bring the output window always to front when a task is executed.
	 *   "silent": only bring it to front if no problem matcher is defined for the task executed.
	 *   "never": never bring the output window to front.
	 *
	 * If omitted "always" is used.
	 */
	showOutput?: string;

	/**
	 * Controls whether the executed command is printed to the output windows as well.
	 */
	echoCommand?: boolean;

	/**
	 * If set to false the task name is added as an additional argument to the
	 * command when executed. If set to true the task name is suppressed. If
	 * omitted false is used.
	 */
	suppressTaskName?: boolean;

	/**
	 * Some commands require that the task argument is highlighted with a special
	 * prefix (e.g. /t: for msbuild). This property can be used to control such
	 * a prefix.
	 */
	taskSelector?:string;

	/**
	 * The problem matcher(s) to used if a global command is exucuted (e.g. no tasks
	 * are defined). A tasks.json file can either contain a global problemMatcher
	 * property or a tasks property but not both.
	 */
	problemMatcher?: ProblemMatcherConfig.ProblemMatcherType;

	/**
	 * Specifies whether a global command is a watching the filesystem. A task.json
	 * file can iether contains a global isWatching property or a tasks property
	 * but not both.
	 */
	isWatching?: boolean;

	/**
	 * Whether the task should prompt on close for confirmation if running.
	 */
	promptOnClose?: boolean;

	/**
	 * The configuration of the available tasks. A tasks.json file can either
	 * contain a global problemMatcher property or a tasks property but not both.
	 */
	tasks?: TaskDescription[];

	/**
	 * Problem matcher declarations
	 */
	declares?: ProblemMatcherConfig.NamedProblemMatcher[];
}

/**
 * A configuration of an external build system. BuildConfiguration.buildSystem
 * must be set to 'program'
 */
export interface ExternalTaskRunnerConfiguration extends BaseTaskRunnerConfiguration {

	/**
	 * The config's version number
	 */
	version: string;

	/**
	 * Windows specific task configuration
	 */
	windows?: BaseTaskRunnerConfiguration;

	/**
	 * Mac specific task configuration
	 */
	osx?: BaseTaskRunnerConfiguration;

	/**
	 * Linux speciif task configuration
	 */
	linux?: BaseTaskRunnerConfiguration;
}

enum ProblemMatcherKind {
	Unknown,
	String,
	ProblemMatcher,
	Array
}

interface Globals {
	command?: string;
	isShellCommand?: boolean;
	taskSelector?: string;
	suppressTaskName?: boolean;
	showOutput?: TaskSystem.ShowOutput;
	echoCommand?: boolean;
}

interface ParseContext {
	isMain: boolean;
	globals: Globals;
}

export interface ParseResult {
	validationStatus: ValidationStatus;
	configuration: TaskSystem.TaskRunnerConfiguration;
	defaultBuildTaskIdentifier: string;
	defaultTestTaskIdentifier: string;
}

export interface ILogger {
	log(value:string):void;
}

class ConfigurationParser {

	private validationStatus: ValidationStatus;
	private defaultBuildTaskIdentifier: string;
	private defaultTestTaskIdentifier: string;

	private logger:ILogger;
	private namedProblemMatchers: IStringDictionary<NamedProblemMatcher>;

	constructor(logger: ILogger) {
		this.logger = logger;
		this.validationStatus = new ValidationStatus();
		this.namedProblemMatchers = Object.create(null);
	}

	private log(value: string): void {
		this.logger.log(value);
	}

	public run(fileConfig: ExternalTaskRunnerConfiguration): ParseResult {
		return {
			validationStatus: this.validationStatus,
			configuration: this.createTaskRunnerConfiguration(fileConfig),
			defaultBuildTaskIdentifier: this.defaultBuildTaskIdentifier,
			defaultTestTaskIdentifier: this.defaultTestTaskIdentifier
		};
	}

	private createTaskRunnerConfiguration(fileConfig: ExternalTaskRunnerConfiguration): TaskSystem.TaskRunnerConfiguration {
		let globals = this.createGlobals(fileConfig);
		let result = this.createBaseTaskRunnerConfiguration(fileConfig, { isMain: true, globals: globals });
		if (!this.validationStatus.isFatal()) {
			let osConfig: TaskSystem.BaseTaskRunnerConfiguration = null;
			let osContext: ParseContext = { isMain: false, globals: globals };
			if (fileConfig.windows && Platform.platform === Platform.Platform.Windows) {
				osConfig = this.createBaseTaskRunnerConfiguration(fileConfig.windows, osContext);
			} else if (fileConfig.osx && Platform.platform === Platform.Platform.Mac) {
				osConfig = this.createBaseTaskRunnerConfiguration(fileConfig.osx, osContext);
			} else if (fileConfig.linux && Platform.platform === Platform.Platform.Linux) {
				osConfig = this.createBaseTaskRunnerConfiguration(fileConfig.linux, osContext);
			}
			if (!this.validationStatus.isFatal()) {
				if (osConfig) {
					this.mergeTaskRunnerConigurations(result, osConfig);
				}
				if (Types.isUndefined(result.options.cwd)) {
					result.options.cwd = '${workspaceRoot}';
				}
			}
		}
		if (!result.command) {
			this.validationStatus.state = ValidationState.Fatal;
			this.log(nls.localize('ConfigurationParser.noCommand', 'Error: no valid command name provided.'));
			return null;
		}
		return <TaskSystem.TaskRunnerConfiguration>result;
	}

	private createGlobals(fileConfig: ExternalTaskRunnerConfiguration) : Globals {
		let result = this.parseGlobals(fileConfig);
		let osGlobals: Globals = null;
		if (fileConfig.windows && Platform.platform === Platform.Platform.Windows) {
			osGlobals = this.parseGlobals(fileConfig.windows);
		} else if (fileConfig.osx && Platform.platform === Platform.Platform.Mac) {
			osGlobals = this.parseGlobals(fileConfig.osx);
		} else if (fileConfig.linux && Platform.platform === Platform.Platform.Linux) {
			osGlobals = this.parseGlobals(fileConfig.linux);
		}
		if (osGlobals) {
			Objects.mixin(result, osGlobals, true);
		}
		if (Types.isUndefined(result.isShellCommand)) {
			result.isShellCommand = false;
		}
		if (Types.isUndefined(result.showOutput)) {
			result.showOutput = TaskSystem.ShowOutput.Always;
		}
		if (Types.isUndefined(result.echoCommand)) {
			result.echoCommand = false;
		}
		if (Types.isUndefined(result.suppressTaskName)) {
			result.suppressTaskName = false;
		}
		return result;
	}

	private parseGlobals(fileConfig: BaseTaskRunnerConfiguration): Globals {
		let result: Globals = {};
		if (Types.isString(fileConfig.command)) {
			result.command = fileConfig.command;
		}
		if (Types.isBoolean(fileConfig.isShellCommand)) {
			result.isShellCommand = fileConfig.isShellCommand;
		}
		if (Types.isString(fileConfig.showOutput)) {
			result.showOutput = TaskSystem.ShowOutput.fromString(fileConfig.showOutput);
		}
		if (!Types.isUndefined(fileConfig.echoCommand)) {
			result.echoCommand = !!fileConfig.echoCommand;
		}
		if (!Types.isUndefined(fileConfig.suppressTaskName)) {
			result.suppressTaskName = !!fileConfig.suppressTaskName;
		}
		if (Types.isString(fileConfig.taskSelector)) {
			result.taskSelector = fileConfig.taskSelector;
		}
		return result;
	}

	private mergeTaskRunnerConigurations(result: TaskSystem.BaseTaskRunnerConfiguration, osConfig: TaskSystem.BaseTaskRunnerConfiguration): void {
		if (osConfig.command) {
			result.command = osConfig.command;
		}
		if (osConfig.args) {
			result.args = result.args ? result.args.concat(osConfig.args) : osConfig.args;
		}
		if (!Types.isUndefined(osConfig.isShellCommand)) {
			result.isShellCommand = osConfig.isShellCommand;
		}
		if (osConfig.options) {
			if (Types.isString(osConfig.options.cwd)) {
				result.options.cwd = osConfig.options.cwd;
			}
			if (osConfig.options.env) {
				let osEnv = osConfig.options.env;
				let env = result.options.env;
				if (env) {
					Object.keys(osEnv).forEach((key) => {
						env[key] = osEnv[key];
					});
				} else {
					result.options.env = osEnv;
				}
			}
		}
		if (osConfig.tasks) {
			let taskNames: IStringDictionary<string> = Object.create(null);
			Object.keys(result.tasks).forEach(key => {
				let task = result.tasks[key];
				taskNames[task.name] = task.id;
			});

			let osTaskNames: IStringDictionary<string> = Object.create(null);
			Object.keys(osConfig.tasks).forEach(key => {
				let task = osConfig.tasks[key];
				osTaskNames[task.name] = task.id;
			});

			Object.keys(osTaskNames).forEach(taskName => {
				let id = taskNames[taskName];
				let osId = osTaskNames[taskName];
				// Same name exists globally
				if (id) {
					delete result.tasks[id];
				}
				result.tasks[osId] = osConfig.tasks[osId];
			});
		}
	}

	private createBaseTaskRunnerConfiguration(fileConfig: BaseTaskRunnerConfiguration, context: ParseContext): TaskSystem.BaseTaskRunnerConfiguration {
		let globals = context.globals;
		let result: TaskSystem.BaseTaskRunnerConfiguration = {
			isShellCommand: globals.isShellCommand,
			args: [],
		};
		if (Types.isString(fileConfig.command)) {
			result.command = fileConfig.command;
		}
		if (!Types.isUndefined(fileConfig.isShellCommand)) {
			result.isShellCommand = fileConfig.isShellCommand;
		}
		let argsIsValid:boolean = Types.isUndefined(fileConfig.args);
		if (Types.isStringArray(fileConfig.args)) {
			argsIsValid = true;
			result.args = fileConfig.args.slice();
		}
		if (!argsIsValid) {
			this.validationStatus.state = ValidationState.Fatal;
			this.log(nls.localize('ConfigurationParser.noargs', 'Error: command arguments must be an array of strings. Provided value is:\n{0}', fileConfig.args ? JSON.stringify(fileConfig.args, null, 4) : 'undefined'));
		}
		result.options = this.createCommandOptions(fileConfig.options);
		if (context.isMain) {
			this.namedProblemMatchers = this.createNamedProblemMatchers(fileConfig);
		}
		let hasGlobalMatcher = !Types.isUndefined(fileConfig.problemMatcher);
		let hasTasks = Types.isArray(fileConfig.tasks);
		if (hasTasks) {
			result.tasks = this.createTasks(fileConfig.tasks, context);
			if (hasGlobalMatcher) {
				this.validationStatus.state = ValidationState.Warning;
				this.log(nls.localize('ConfigurationParser.globalMatcher', 'Warning: global matchers and tasks can\'t be mixed. Ignoring global matchers.'));
			}
		} else if (context.isMain) {
			let isWatching: boolean = false;
			if (!Types.isUndefined(fileConfig.isWatching)) {
				isWatching = !!fileConfig.isWatching;
			}
			let promptOnClose: boolean = true;
			if (!Types.isUndefined(fileConfig.promptOnClose)) {
				promptOnClose = !!fileConfig.promptOnClose;
			} else {
				promptOnClose = !isWatching;
			}
			let task: TaskSystem.TaskDescription = {
				id: UUID.generateUuid(),
				name: globals.command,
				showOutput: globals.showOutput,
				suppressTaskName: true,
				isWatching: isWatching,
				promptOnClose: promptOnClose,
				echoCommand: globals.echoCommand,
			};
			if (hasGlobalMatcher) {
				let problemMatchers = this.createProblemMatchers(fileConfig.problemMatcher);
				task.problemMatchers = problemMatchers;
			} else {
				task.problemMatchers = [];
			}
			// ToDo@dirkb: this is very special for the tsc watch mode. We should find
			// a exensible solution for this.
			for (let matcher of task.problemMatchers) {
				if ((<any>matcher).tscWatch) {
					(<any>task).tscWatch = true;
					break;
				}
			}
			this.defaultBuildTaskIdentifier = task.id;
			result.tasks = Object.create(null);
			result.tasks[task.id] = task;
		}
		return result;
	}

	private createCommandOptions(fileOptions: ProcessConfig.CommandOptions): TaskSystem.CommandOptions {
		let result: TaskSystem.CommandOptions = {};
		if (fileOptions) {
			if (!Types.isUndefined(fileOptions.cwd)) {
				if (Types.isString(fileOptions.cwd)) {
					result.cwd = fileOptions.cwd;
				} else {
					this.validationStatus.state = ValidationState.Warning;
					this.log(nls.localize('ConfigurationParser.invalidCWD', 'Warning: options.cwd must be of type string. Ignoring value {0}\n', fileOptions.cwd));
				}
			}
			if (!Types.isUndefined(fileOptions.env)) {
				result.env = Objects.clone(fileOptions.env);
			}
		}
		return result;
	}

	private createNamedProblemMatchers(fileConfig: BaseTaskRunnerConfiguration): IStringDictionary<NamedProblemMatcher> {
		let result:IStringDictionary<NamedProblemMatcher> = Object.create(null);
		if (!Types.isArray(fileConfig.declares)) {
			return result;
		}
		let values = fileConfig.declares;
		(<ProblemMatcherConfig.NamedProblemMatcher[]>values).forEach((value) => {
			let namedProblemMatcher = this.createNamedProblemMatcher(value);
			if (namedProblemMatcher) {
				result[namedProblemMatcher.name] = namedProblemMatcher;
			}
		});
		return result;
	}

	private createNamedProblemMatcher(value: ProblemMatcherConfig.NamedProblemMatcher): NamedProblemMatcher {
		let result = (new ProblemMatcherParser(ProblemMatcherRegistry, this.logger, this.validationStatus)).parse(value);
		if (isNamedProblemMatcher(result)) {
			return result;
		} else {
			this.validationStatus.state = ValidationState.Error;
			this.log(nls.localize('ConfigurationParser.noName', 'Error: Problem Matcher in declare scope must have a name:\n{0}\n', JSON.stringify(value, null, 4)));
			return null;
		}
	}

	private createTasks(tasks: TaskDescription[], context: ParseContext): IStringDictionary<TaskSystem.TaskDescription> {
		let result: IStringDictionary<TaskSystem.TaskDescription> = Object.create(null);
		if (!tasks) {
			return result;
		}
		let defaultBuildTask: {id:string; exact:number;} = { id: null, exact: -1};
		let defaultTestTask: {id:string; exact:number;} = { id: null, exact: -1};
		tasks.forEach((externalTask) => {
			let taskName = externalTask.taskName;
			if (!taskName) {
				this.validationStatus.state = ValidationState.Fatal;
				this.log(nls.localize('ConfigurationParser.noTaskName', 'Error: tasks must provide a taskName property. The task will be ignored.\n{0}\n', JSON.stringify(externalTask, null, 4)));
				return;
			}
			let problemMatchers = this.createProblemMatchers(externalTask.problemMatcher);
			let task: TaskSystem.TaskDescription = { id: UUID.generateUuid(), name: taskName, showOutput: context.globals.showOutput };
			if (Types.isStringArray(externalTask.args)) {
				task.args = externalTask.args.slice();
			}
			task.isWatching = false;
			if (!Types.isUndefined(externalTask.isWatching)) {
				task.isWatching = !!externalTask.isWatching;
			}
			task.promptOnClose = true;
			if (!Types.isUndefined(externalTask.promptOnClose)) {
				task.promptOnClose = !!externalTask.promptOnClose;
			} else {
				task.promptOnClose = !task.isWatching;
			}
			if (Types.isString(externalTask.showOutput)) {
				task.showOutput = TaskSystem.ShowOutput.fromString(externalTask.showOutput);
			}
			if (Types.isUndefined(task.showOutput)) {
				task.showOutput = context.globals.showOutput;
			}
			task.echoCommand = context.globals.echoCommand;
			if (!Types.isUndefined(externalTask.echoCommand)) {
				task.echoCommand = !!externalTask.echoCommand;
			}
			task.suppressTaskName = context.globals.suppressTaskName;
			if (!Types.isUndefined(externalTask.suppressTaskName)) {
				task.suppressTaskName = !!externalTask.suppressTaskName;
			}
			if (problemMatchers) {
				task.problemMatchers = problemMatchers;
			}
			// ToDo@dirkb: this is very special for the tsc watch mode. We should find
			// a exensible solution for this.
			for (let matcher of task.problemMatchers) {
				if ((<any>matcher).tscWatch) {
					(<any>task).tscWatch = true;
					break;
				}
			}
			result[task.id] = task;
			if (!Types.isUndefined(externalTask.isBuildCommand) && externalTask.isBuildCommand && defaultBuildTask.exact < 2) {
				defaultBuildTask.id = task.id;
				defaultBuildTask.exact = 2;
			} else if (taskName === 'build' && defaultBuildTask.exact < 2) {
				defaultBuildTask.id = task.id;
				defaultBuildTask.exact = 1;
			}
			if (!Types.isUndefined(externalTask.isTestCommand) && externalTask.isTestCommand && defaultTestTask.exact < 2) {
				defaultTestTask.id = task.id;
				defaultTestTask.exact = 2;
			} else if (taskName === 'test' && defaultTestTask.exact < 2) {
				defaultTestTask.id = task.id;
				defaultTestTask.exact = 1;
			}
		});
		if (defaultBuildTask.exact > 0) {
			this.defaultBuildTaskIdentifier = defaultBuildTask.id;
		}
		if (defaultTestTask.exact > 0) {
			this.defaultTestTaskIdentifier = defaultTestTask.id;
		}
		return result;
	}

	private createProblemMatchers(problemMatcher: ProblemMatcherConfig.ProblemMatcherType): ProblemMatcher[] {
		let result: ProblemMatcher[] = [];
		if (Types.isUndefined(problemMatcher)) {
			return result;
		}
		let kind = this.getProblemMatcherKind(problemMatcher);
		if (kind === ProblemMatcherKind.Unknown) {
			this.validationStatus.state = ValidationState.Warning;
			this.log(nls.localize(
				'ConfigurationParser.unknownMatcherKind',
				'Warning: the defined problem matcher is unknown. Supported types are string | ProblemMatcher | (string | ProblemMatcher)[].\n{0}\n',
				JSON.stringify(problemMatcher, null, 4)));
			return result;
		} else if (kind === ProblemMatcherKind.String || kind === ProblemMatcherKind.ProblemMatcher) {
			let matcher = this.resolveProblemMatcher(problemMatcher);
			if (matcher) {
				result.push(matcher);
			}
		} else if (kind === ProblemMatcherKind.Array) {
			let problemMatchers = <(string | ProblemMatcherConfig.ProblemMatcher)[]>problemMatcher;
			problemMatchers.forEach(problemMatcher => {
				let matcher = this.resolveProblemMatcher(problemMatcher);
				if (matcher) {
					result.push(matcher);
				}
			});
		}
		return result;
	}

	private getProblemMatcherKind(value: ProblemMatcherConfig.ProblemMatcherType): ProblemMatcherKind {
		if (Types.isString(value)) {
			return ProblemMatcherKind.String;
		} else if (Types.isArray(value)) {
			return ProblemMatcherKind.Array;
		} else if (!Types.isUndefined(value)) {
			return ProblemMatcherKind.ProblemMatcher;
		} else {
			return ProblemMatcherKind.Unknown;
		}
	}

	private resolveProblemMatcher(value: string | ProblemMatcherConfig.ProblemMatcher): ProblemMatcher {
		if (Types.isString(value)) {
			let variableName = <string>value;
			if (variableName.length > 1 && variableName[0] === '$') {
				variableName = variableName.substring(1);
				let global = ProblemMatcherRegistry.get(variableName);
				if (global) {
					return Objects.clone(global);
				}
				let localProblemMatcher = this.namedProblemMatchers[variableName];
				if (localProblemMatcher) {
					localProblemMatcher = Objects.clone(localProblemMatcher);
					// remove the name
					delete localProblemMatcher.name;
					return localProblemMatcher;
				}
			}
			this.validationStatus.state = ValidationState.Error;
			this.log(nls.localize('ConfigurationParser.invalidVaraibleReference', 'Error: Invalid problemMatcher reference: {0}\n', value));
			return null;
		} else {
			let json = <ProblemMatcherConfig.ProblemMatcher>value;
			return new ProblemMatcherParser(ProblemMatcherRegistry, this.logger, this.validationStatus).parse(json);
		}
	}
}

export function parse(configuration: ExternalTaskRunnerConfiguration, logger: ILogger): ParseResult {
	return (new ConfigurationParser(logger)).run(configuration);
}