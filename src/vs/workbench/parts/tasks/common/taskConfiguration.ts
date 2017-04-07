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

import { ValidationStatus, IProblemReporter as IProblemReporterBase } from 'vs/base/common/parsers';
import {
	NamedProblemMatcher, ProblemMatcher, ProblemMatcherParser, Config as ProblemMatcherConfig,
	isNamedProblemMatcher, ProblemMatcherRegistry
} from 'vs/platform/markers/common/problemMatcher';

import * as Tasks from './tasks';

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

export interface PlatformTaskDescription {
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
	 * The arguments passed to the command or additional arguments passed to the
	 * command when using a global command.
	 */
	args?: string[];
}

/**
 * The description of a task.
 */
export interface TaskDescription extends PlatformTaskDescription {

	/**
	 * The task's name
	 */
	taskName: string;

	/**
	 * A unique optional identifier in case the name
	 * can't be used as such.
	 */
	identifier?: string;

	/**
	 * Windows specific task configuration
	 */
	windows?: PlatformTaskDescription;

	/**
	 * Mac specific task configuration
	 */
	osx?: PlatformTaskDescription;

	/**
	 * Linux speciif task configuration
	 */
	linux?: PlatformTaskDescription;

	/**
	 * @deprecated Use `isBackground` instead.
	 * Whether the executed command is kept alive and is watching the file system.
	 */
	isWatching?: boolean;

	/**
	 * Whether the executed command is kept alive and runs in the background.
	 */
	isBackground?: boolean;

	/**
	 * Whether the task should prompt on close for confirmation if running.
	 */
	promptOnClose?: boolean;

	/**
	 * Whether this task maps to the default build command.
	 */
	isBuildCommand?: boolean;

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
	 * The other tasks the task depend on
	 */
	dependsOn?: string | string[];

	/**
	 * The problem matcher(s) to use to capture problems in the tasks
	 * output.
	 */
	problemMatcher?: ProblemMatcherConfig.ProblemMatcherType;
}

/**
 * The base task runner configuration
 */
export interface BaseTaskRunnerConfiguration {

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
	taskSelector?: string;

	/**
	 * The problem matcher(s) to used if a global command is exucuted (e.g. no tasks
	 * are defined). A tasks.json file can either contain a global problemMatcher
	 * property or a tasks property but not both.
	 */
	problemMatcher?: ProblemMatcherConfig.ProblemMatcherType;

	/**
	 * @deprecated Use `isBackground` instead.
	 *
	 * Specifies whether a global command is a watching the filesystem. A task.json
	 * file can either contain a global isWatching property or a tasks property
	 * but not both.
	 */
	isWatching?: boolean;

	/**
	 * Specifies whether a global command is a background task.
	 */
	isBackground?: boolean;

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

	_runner?: string;

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

const EMPTY_ARRAY: any[] = [];
Object.freeze(EMPTY_ARRAY);

function mergeProperty<T, K extends keyof T>(target: T, source: T, key: K) {
	if (source[key] !== void 0) {
		target[key] = source[key];
	}
}

interface ParseContext {
	problemReporter: IProblemReporter;
	namedProblemMatchers: IStringDictionary<NamedProblemMatcher>;
	isTermnial: boolean;
}

namespace CommandOptions {
	export function from(this: void, options: ProcessConfig.CommandOptions, context: ParseContext): Tasks.CommandOptions {
		let result: Tasks.CommandOptions = {};
		if (options.cwd !== void 0) {
			if (Types.isString(options.cwd)) {
				result.cwd = options.cwd;
			} else {
				context.problemReporter.warn(nls.localize('ConfigurationParser.invalidCWD', 'Warning: options.cwd must be of type string. Ignoring value {0}\n', options.cwd));
			}
		}
		if (options.env !== void 0) {
			result.env = Objects.clone(options.env);
		}
		return isEmpty(result) ? undefined : result;
	}

	export function isEmpty(value: Tasks.CommandOptions): boolean {
		return !value || value.cwd === void 0 && value.env === void 0;
	}

	export function merge(target: Tasks.CommandOptions, source: Tasks.CommandOptions): Tasks.CommandOptions {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		mergeProperty(target, source, 'cwd');
		if (target.env === void 0) {
			target.env = source.env;
		} else if (source.env !== void 0) {
			let env: { [key: string]: string; } = Object.create(null);
			Object.keys(target.env).forEach(key => env[key] = target.env[key]);
			Object.keys(source.env).forEach(key => env[key = source.env[key]]);
			target.env = env;
		}
		return target;
	}

	export function fillDefaults(value: Tasks.CommandOptions): Tasks.CommandOptions {
		if (value && Object.isFrozen(value)) {
			return value;
		}
		if (value === void 0) {
			value = {};
		}
		if (value.cwd === void 0) {
			value.cwd = '${workspaceRoot}';
		}
		return value;
	}

	export function freeze(value: Tasks.CommandOptions): void {
		Object.freeze(value);
		if (value.env) {
			Object.freeze(value.env);
		}
	}
}

interface ShellConfiguration {
	executable: string;
	args?: string[];
}

namespace ShellConfiguration {
	export function is(value: any): value is ShellConfiguration {
		let candidate: ShellConfiguration = value;
		return candidate && Types.isString(candidate.executable) && (candidate.args === void 0 || Types.isStringArray(candidate.args));
	}

	export function from(this: void, config: ShellConfiguration, context: ParseContext): Tasks.ShellConfiguration {
		if (!is(config)) {
			return undefined;
		}
		let result: ShellConfiguration = { executable: config.executable };
		if (config.args !== void 0) {
			result.args = config.args.slice();
		}
		return result;
	}

	export function isEmpty(value: Tasks.ShellConfiguration): boolean {
		return !value || value.executable === void 0 && (value.args === void 0 || value.args.length === 0);
	}

	export function merge(target: Tasks.ShellConfiguration, source: Tasks.ShellConfiguration): Tasks.ShellConfiguration {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		mergeProperty(target, source, 'executable');
		mergeProperty(target, source, 'args');
		return target;
	}

	export function fillDefaults(value: Tasks.ShellConfiguration): void {
	}

	export function freeze(value: Tasks.ShellConfiguration): void {
		if (!value) {
			return;
		}
		Object.freeze(value);
	}
}

namespace CommandConfiguration {
	interface BaseCommandConfiguationShape {
		command?: string;
		isShellCommand?: boolean | ShellConfiguration;
		args?: string[];
		options?: ProcessConfig.CommandOptions;
		echoCommand?: boolean;
		taskSelector?: string;
	}

	interface CommandConfiguationShape extends BaseCommandConfiguationShape {
		windows?: BaseCommandConfiguationShape;
		osx?: BaseCommandConfiguationShape;
		linux?: BaseCommandConfiguationShape;
	}

	export function from(this: void, config: CommandConfiguationShape, context: ParseContext): Tasks.CommandConfiguration {
		let result: Tasks.CommandConfiguration = fromBase(config, context);

		let osConfig: Tasks.CommandConfiguration = undefined;
		if (config.windows && Platform.platform === Platform.Platform.Windows) {
			osConfig = fromBase(config.windows, context);
		} else if (config.osx && Platform.platform === Platform.Platform.Mac) {
			osConfig = fromBase(config.osx, context);
		} else if (config.linux && Platform.platform === Platform.Platform.Linux) {
			osConfig = fromBase(config.linux, context);
		}
		if (osConfig) {
			result = merge(result, osConfig);
		}
		fillDefaults(result);
		return isEmpty(result) ? undefined : result;
	}

	function fromBase(this: void, config: BaseCommandConfiguationShape, context: ParseContext): Tasks.CommandConfiguration {
		let result: Tasks.CommandConfiguration = {
			name: undefined,
			isShellCommand: undefined,
			echo: undefined
		};
		if (Types.isString(config.command)) {
			result.name = config.command;
		}
		if (Types.isBoolean(config.isShellCommand)) {
			result.isShellCommand = config.isShellCommand;
		} else if (ShellConfiguration.is(config.isShellCommand)) {
			result.isShellCommand = ShellConfiguration.from(config.isShellCommand, context);
			if (!context.isTermnial) {
				context.problemReporter.warn(nls.localize('ConfigurationParser.noShell', 'Warning: shell configuration is only supported when executing tasks in the terminal.'));
			}
		} else if (config.isShellCommand !== void 0) {
			result.isShellCommand = !!config.isShellCommand;
		}
		if (config.args !== void 0) {
			if (Types.isStringArray(config.args)) {
				result.args = config.args.slice(0);
			} else {
				context.problemReporter.fatal(nls.localize('ConfigurationParser.noargs', 'Error: command arguments must be an array of strings. Provided value is:\n{0}', config.args ? JSON.stringify(config.args, undefined, 4) : 'undefined'));
			}
		}
		if (config.options !== void 0) {
			result.options = CommandOptions.from(config.options, context);
		}
		if (Types.isBoolean(config.echoCommand)) {
			result.echo = config.echoCommand;
		}
		if (Types.isString(config.taskSelector)) {
			result.taskSelector = config.taskSelector;
		}
		return isEmpty(result) ? undefined : result;
	}

	export function isEmpty(value: Tasks.CommandConfiguration): boolean {
		return !value || value.name === void 0 && value.isShellCommand === void 0 && value.args === void 0 && CommandOptions.isEmpty(value.options) && value.echo === void 0;
	}

	export function onlyEcho(value: Tasks.CommandConfiguration): boolean {
		return value && value.echo !== void 0 && value.name === void 0 && value.isShellCommand === void 0 && value.args === void 0 && CommandOptions.isEmpty(value.options);
	}

	export function merge(target: Tasks.CommandConfiguration, source: Tasks.CommandConfiguration): Tasks.CommandConfiguration {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		mergeProperty(target, source, 'name');
		// Merge isShellCommand
		if (target.isShellCommand === void 0) {
			target.isShellCommand = source.isShellCommand;
		} if (Types.isBoolean(target.isShellCommand) && Types.isBoolean(source.isShellCommand)) {
			mergeProperty(target, source, 'isShellCommand');
		} else if (ShellConfiguration.is(target.isShellCommand) && ShellConfiguration.is(source.isShellCommand)) {
			ShellConfiguration.merge(target.isShellCommand, source.isShellCommand);
		} else if (Types.isBoolean(target.isShellCommand) && ShellConfiguration.is(source.isShellCommand)) {
			target.isShellCommand = source.isShellCommand;
		}

		mergeProperty(target, source, 'echo');
		mergeProperty(target, source, 'taskSelector');
		if (source.args !== void 0) {
			if (target.args === void 0) {
				target.args = source.args;
			} else {
				target.args = target.args.concat(source.args);
			}
		}
		target.options = CommandOptions.merge(target.options, source.options);
		return target;
	}

	export function fillDefaults(value: Tasks.CommandConfiguration): void {
		if (!value || Object.isFrozen(value)) {
			return;
		}
		if (value.name !== void 0 && value.isShellCommand === void 0) {
			value.isShellCommand = false;
		}
		if (value.echo === void 0) {
			value.echo = false;
		}
		if (value.args === void 0) {
			value.args = EMPTY_ARRAY;
		}
		if (!isEmpty(value)) {
			value.options = CommandOptions.fillDefaults(value.options);
		}
	}

	export function freeze(value: Tasks.CommandConfiguration): void {
		Object.freeze(value);
		if (value.args) {
			Object.freeze(value.args);
		}
		if (value.options) {
			CommandOptions.freeze(value.options);
		}
		if (ShellConfiguration.is(value.isShellCommand)) {
			ShellConfiguration.freeze(value.isShellCommand);
		}
	}
}

namespace ProblemMatcherConverter {

	export function namedFrom(this: void, declares: ProblemMatcherConfig.NamedProblemMatcher[], context: ParseContext): IStringDictionary<NamedProblemMatcher> {
		let result: IStringDictionary<NamedProblemMatcher> = Object.create(null);

		if (!Types.isArray(declares)) {
			return result;
		}
		(<ProblemMatcherConfig.NamedProblemMatcher[]>declares).forEach((value) => {
			let namedProblemMatcher = (new ProblemMatcherParser(context.problemReporter)).parse(value);
			if (isNamedProblemMatcher(namedProblemMatcher)) {
				result[namedProblemMatcher.name] = namedProblemMatcher;
			} else {
				context.problemReporter.error(nls.localize('ConfigurationParser.noName', 'Error: Problem Matcher in declare scope must have a name:\n{0}\n', JSON.stringify(value, undefined, 4)));
			}
		});
		return result;
	}

	export function from(this: void, config: ProblemMatcherConfig.ProblemMatcherType, context: ParseContext): ProblemMatcher[] {
		let result: ProblemMatcher[] = [];
		if (config === void 0) {
			return result;
		}
		let kind = getProblemMatcherKind(config);
		if (kind === ProblemMatcherKind.Unknown) {
			context.problemReporter.warn(nls.localize(
				'ConfigurationParser.unknownMatcherKind',
				'Warning: the defined problem matcher is unknown. Supported types are string | ProblemMatcher | (string | ProblemMatcher)[].\n{0}\n',
				JSON.stringify(config, null, 4)));
			return result;
		} else if (kind === ProblemMatcherKind.String || kind === ProblemMatcherKind.ProblemMatcher) {
			let matcher = resolveProblemMatcher(config, context);
			if (matcher) {
				result.push(matcher);
			}
		} else if (kind === ProblemMatcherKind.Array) {
			let problemMatchers = <(string | ProblemMatcherConfig.ProblemMatcher)[]>config;
			problemMatchers.forEach(problemMatcher => {
				let matcher = resolveProblemMatcher(problemMatcher, context);
				if (matcher) {
					result.push(matcher);
				}
			});
		}
		return result;
	}

	function getProblemMatcherKind(this: void, value: ProblemMatcherConfig.ProblemMatcherType): ProblemMatcherKind {
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

	function resolveProblemMatcher(this: void, value: string | ProblemMatcherConfig.ProblemMatcher, context: ParseContext): ProblemMatcher {
		if (Types.isString(value)) {
			let variableName = <string>value;
			if (variableName.length > 1 && variableName[0] === '$') {
				variableName = variableName.substring(1);
				let global = ProblemMatcherRegistry.get(variableName);
				if (global) {
					return Objects.clone(global);
				}
				let localProblemMatcher = context.namedProblemMatchers[variableName];
				if (localProblemMatcher) {
					localProblemMatcher = Objects.clone(localProblemMatcher);
					// remove the name
					delete localProblemMatcher.name;
					return localProblemMatcher;
				}
			}
			context.problemReporter.error(nls.localize('ConfigurationParser.invalidVaraibleReference', 'Error: Invalid problemMatcher reference: {0}\n', value));
			return undefined;
		} else {
			let json = <ProblemMatcherConfig.ProblemMatcher>value;
			return new ProblemMatcherParser(context.problemReporter).parse(json);
		}
	}
}

namespace TaskDescription {

	export function from(this: void, tasks: TaskDescription[], globals: Globals, context: ParseContext): Tasks.Task[] {
		if (!tasks) {
			return undefined;
		}
		let parsedTasks: Tasks.Task[] = [];
		let defaultBuildTask: { task: Tasks.Task; rank: number; } = { task: null, rank: -1 };
		let defaultTestTask: { task: Tasks.Task; rank: number; } = { task: null, rank: -1 };
		tasks.forEach((externalTask) => {
			let taskName = externalTask.taskName;
			if (!taskName) {
				context.problemReporter.fatal(nls.localize('ConfigurationParser.noTaskName', 'Error: tasks must provide a taskName property. The task will be ignored.\n{0}\n', JSON.stringify(externalTask, null, 4)));
				return;
			}
			let problemMatchers = ProblemMatcherConverter.from(externalTask.problemMatcher, context);
			let command: Tasks.CommandConfiguration = externalTask.command !== void 0
				? CommandConfiguration.from(externalTask, context)
				: externalTask.echoCommand !== void 0 ? { name: undefined, isShellCommand: undefined, echo: !!externalTask.echoCommand } : undefined;
			let identifer = Types.isString(externalTask.identifier) ? externalTask.identifier : taskName;
			let task: Tasks.Task = {
				_id: UUID.generateUuid(),
				name: taskName,
				identifier: identifer,
				command,
				showOutput: undefined
			};
			if (externalTask.command === void 0 && Types.isStringArray(externalTask.args)) {
				task.args = externalTask.args.slice();
			}
			if (externalTask.isWatching !== void 0) {
				task.isBackground = !!externalTask.isWatching;
			}
			if (externalTask.isBackground !== void 0) {
				task.isBackground = !!externalTask.isBackground;
			}
			if (externalTask.promptOnClose !== void 0) {
				task.promptOnClose = !!externalTask.promptOnClose;
			}
			if (Types.isString(externalTask.showOutput)) {
				task.showOutput = Tasks.ShowOutput.fromString(externalTask.showOutput);
			}
			if (externalTask.command !== void 0) {
				// if the task has its own command then we suppress the
				// task name by default.
				task.suppressTaskName = true;
			} else if (externalTask.suppressTaskName !== void 0) {
				task.suppressTaskName = !!externalTask.suppressTaskName;
			}
			if (externalTask.dependsOn !== void 0) {
				if (Types.isString(externalTask.dependsOn)) {
					task.dependsOn = [externalTask.dependsOn];
				} else if (Types.isStringArray(externalTask.dependsOn)) {
					task.dependsOn = externalTask.dependsOn.slice();
				}
			}
			if (problemMatchers) {
				task.problemMatchers = problemMatchers;
			}
			mergeGlobals(task, globals);
			fillDefaults(task);
			let addTask: boolean = true;
			if (context.isTermnial && task.command && task.command.name && task.command.isShellCommand && task.command.args && task.command.args.length > 0) {
				if (hasUnescapedSpaces(task.command.name) || task.command.args.some(hasUnescapedSpaces)) {
					context.problemReporter.warn(nls.localize('taskConfiguration.shellArgs', 'Warning: the task \'{0}\' is a shell command and either the command name or one of its arguments has unescaped spaces. To ensure correct command line quoting please merge args into the command.', task.name));
				}
			}
			if (context.isTermnial) {
				if ((task.command === void 0 || task.command.name === void 0) && (task.dependsOn === void 0 || task.dependsOn.length === 0)) {
					context.problemReporter.error(nls.localize(
						'taskConfiguration.noCommandOrDependsOn', 'Error: the task \'{0}\' neither specifies a command or a dependsOn property. The task will be ignored. Its definition is:\n{1}',
						task.name, JSON.stringify(externalTask, undefined, 4)
					));
					addTask = false;
				}
			} else {
				if (task.command === void 0 || task.command.name === void 0) {
					context.problemReporter.warn(nls.localize(
						'taskConfiguration.noCommand', 'Error: the task \'{0}\' doesn\'t define a command. The task will be ignored. Its definition is:\n{1}',
						task.name, JSON.stringify(externalTask, undefined, 4)
					));
					addTask = false;
				}
			}
			if (addTask) {
				parsedTasks.push(task);
				if (!Types.isUndefined(externalTask.isBuildCommand) && externalTask.isBuildCommand && defaultBuildTask.rank < 2) {
					defaultBuildTask.task = task;
					defaultBuildTask.rank = 2;
				} else if (taskName === 'build' && defaultBuildTask.rank < 2) {
					defaultBuildTask.task = task;
					defaultBuildTask.rank = 1;
				}
				if (!Types.isUndefined(externalTask.isTestCommand) && externalTask.isTestCommand && defaultTestTask.rank < 2) {
					defaultTestTask.task = task;
					defaultTestTask.rank = 2;
				} else if (taskName === 'test' && defaultTestTask.rank < 2) {
					defaultTestTask.task = task;
					defaultTestTask.rank = 1;
				}
			}
		});
		if (defaultBuildTask.task) {
			defaultBuildTask.task.group = Tasks.TaskGroup.Build;
		}
		if (defaultTestTask.task) {
			defaultTestTask.task.group = Tasks.TaskGroup.Test;
		}
		return parsedTasks.length === 0 ? undefined : parsedTasks;
	}

	export function merge(target: Tasks.Task[], source: Tasks.Task[]): Tasks.Task[] {
		if (source === void 0 || source.length === 0) {
			return target;
		}
		if (target === void 0 || target.length === 0) {
			return source;
		}

		if (source) {
			// Tasks are keyed by ID but we need to merge by name
			let map: IStringDictionary<Tasks.Task> = Object.create(null);
			target.forEach((task) => {
				map[task.name] = task;
			});

			source.forEach((task) => {
				map[task.name] = task;
			});
			let newTarget: Tasks.Task[] = [];
			target.forEach(task => {
				newTarget.push(map[task.name]);
				delete map[task.name];
			});
			Object.keys(map).forEach(key => newTarget.push(map[key]));
			target = newTarget;
		}
		return target;
	}

	export function mergeGlobals(task: Tasks.Task, globals: Globals): void {
		// We only merge a command from a global definition if there is no dependsOn
		if (task.dependsOn === void 0) {
			if (CommandConfiguration.isEmpty(task.command) && !CommandConfiguration.isEmpty(globals.command) && globals.command.name !== void 0) {
				task.command = globals.command;
			}
			if (CommandConfiguration.onlyEcho(task.command)) {
				// The globals can have a echo set which would override the local echo
				// Saves the need of a additional fill method. But might be necessary
				// at some point.
				let oldEcho = task.command.echo;
				CommandConfiguration.merge(task.command, globals.command);
				task.command.echo = oldEcho;
			}
		}
		// promptOnClose is inferred from isBackground if available
		if (task.promptOnClose === void 0 && task.isBackground === void 0 && globals.promptOnClose !== void 0) {
			task.promptOnClose = globals.promptOnClose;
		}
		if (task.suppressTaskName === void 0 && globals.suppressTaskName !== void 0) {
			task.suppressTaskName = globals.suppressTaskName;
		}
		if (task.showOutput === void 0 && globals.showOutput !== void 0) {
			task.showOutput = globals.showOutput;
		}
	}

	export function fillDefaults(task: Tasks.Task): void {
		CommandConfiguration.fillDefaults(task.command);
		if (task.args === void 0 && task.command === void 0) {
			task.args = EMPTY_ARRAY;
		}
		if (task.suppressTaskName === void 0) {
			task.suppressTaskName = false;
		}
		if (task.promptOnClose === void 0) {
			task.promptOnClose = task.isBackground !== void 0 ? !task.isBackground : true;
		}
		if (task.isBackground === void 0) {
			task.isBackground = false;
		}
		if (task.showOutput === void 0) {
			task.showOutput = Tasks.ShowOutput.Always;
		}
		if (task.problemMatchers === void 0) {
			task.problemMatchers = EMPTY_ARRAY;
		}
	}

	function hasUnescapedSpaces(value: string): boolean {
		if (Platform.isWindows) {
			if (value.length >= 2 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
				return false;
			}
			return value.indexOf(' ') !== -1;
		} else {
			if (value.length >= 2 && ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') || (value.charAt(0) === '\'' && value.charAt(value.length - 1) === '\''))) {
				return false;
			}
			for (let i = 0; i < value.length; i++) {
				let ch = value.charAt(i);
				if (ch === ' ') {
					if (i === 0 || value.charAt(i) !== '\\') {
						return true;
					}
				}
			}
			return false;
		}
	}
}

interface Globals {
	command?: Tasks.CommandConfiguration;
	promptOnClose?: boolean;
	suppressTaskName?: boolean;
	showOutput?: Tasks.ShowOutput;
}

namespace Globals {

	export function from(config: ExternalTaskRunnerConfiguration, context: ParseContext): Globals {
		let result = fromBase(config, context);
		let osGlobals: Globals = undefined;
		if (config.windows && Platform.platform === Platform.Platform.Windows) {
			osGlobals = fromBase(config.windows, context);
		} else if (config.osx && Platform.platform === Platform.Platform.Mac) {
			osGlobals = fromBase(config.osx, context);
		} else if (config.linux && Platform.platform === Platform.Platform.Linux) {
			osGlobals = fromBase(config.linux, context);
		}
		if (osGlobals) {
			result = Globals.merge(result, osGlobals);
		}
		Globals.fillDefaults(result);
		let command = CommandConfiguration.from(config, context);
		if (command) {
			result.command = command;
		}
		Globals.freeze(result);
		return result;
	}

	export function fromBase(this: void, config: BaseTaskRunnerConfiguration, context: ParseContext): Globals {
		let result: Globals = {};
		if (Types.isString(config.showOutput)) {
			result.showOutput = Tasks.ShowOutput.fromString(config.showOutput);
		}
		if (config.suppressTaskName !== void 0) {
			result.suppressTaskName = !!config.suppressTaskName;
		}
		if (config.promptOnClose !== void 0) {
			result.promptOnClose = !!config.promptOnClose;
		}
		return result;
	}

	export function isEmpty(value: Globals): boolean {
		return !value || value.command === void 0 && value.promptOnClose === void 0 && value.showOutput === void 0 && value.suppressTaskName === void 0;
	}

	export function merge(target: Globals, source: Globals): Globals {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		mergeProperty(target, source, 'promptOnClose');
		mergeProperty(target, source, 'suppressTaskName');
		mergeProperty(target, source, 'showOutput');
		return target;
	}

	export function fillDefaults(value: Globals): void {
		if (!value) {
			return;
		}
		if (value.suppressTaskName === void 0) {
			value.suppressTaskName = false;
		}
		if (value.showOutput === void 0) {
			value.showOutput = Tasks.ShowOutput.Always;
		}
		if (value.promptOnClose === void 0) {
			value.promptOnClose = true;
		}
	}

	export function freeze(value: Globals): void {
		Object.freeze(value);
		if (value.command) {
			CommandConfiguration.freeze(value.command);
		}
	}
}

export namespace ExecutionEngine {

	export function from(config: ExternalTaskRunnerConfiguration): Tasks.ExecutionEngine {
		return isTerminalConfig(config)
			? Tasks.ExecutionEngine.Terminal
			: isRunnerConfig(config)
				? Tasks.ExecutionEngine.Process
				: Tasks.ExecutionEngine.Unknown;
	}

	function isRunnerConfig(config: ExternalTaskRunnerConfiguration): boolean {
		return (!config._runner || config._runner === 'program') && (config.version === '0.1.0' || !config.version);
	}

	function isTerminalConfig(config: ExternalTaskRunnerConfiguration): boolean {
		return config._runner === 'terminal' || config.version === '2.0.0';
	}
}

export interface ParseResult {
	validationStatus: ValidationStatus;
	tasks: Tasks.Task[];
	engine: Tasks.ExecutionEngine;
}

export interface IProblemReporter extends IProblemReporterBase {
	clearOutput(): void;
}

class ConfigurationParser {

	private problemReporter: IProblemReporter;

	constructor(problemReporter: IProblemReporter) {
		this.problemReporter = problemReporter;
	}

	public run(fileConfig: ExternalTaskRunnerConfiguration): ParseResult {
		let engine = ExecutionEngine.from(fileConfig);
		if (engine === Tasks.ExecutionEngine.Terminal) {
			this.problemReporter.clearOutput();
		}
		let context: ParseContext = { problemReporter: this.problemReporter, namedProblemMatchers: undefined, isTermnial: engine === Tasks.ExecutionEngine.Terminal };
		return {
			validationStatus: this.problemReporter.status,
			tasks: this.createTaskRunnerConfiguration(fileConfig, context),
			engine
		};
	}

	private createTaskRunnerConfiguration(fileConfig: ExternalTaskRunnerConfiguration, context: ParseContext): Tasks.Task[] {
		let globals = Globals.from(fileConfig, context);
		if (this.problemReporter.status.isFatal()) {
			return undefined;
		}
		context.namedProblemMatchers = ProblemMatcherConverter.namedFrom(fileConfig.declares, context);
		let globalTasks: Tasks.Task[];
		if (fileConfig.windows && Platform.platform === Platform.Platform.Windows) {
			globalTasks = TaskDescription.from(fileConfig.windows.tasks, globals, context);
		} else if (fileConfig.osx && Platform.platform === Platform.Platform.Mac) {
			globalTasks = TaskDescription.from(fileConfig.osx.tasks, globals, context);
		} else if (fileConfig.linux && Platform.platform === Platform.Platform.Linux) {
			globalTasks = TaskDescription.from(fileConfig.linux.tasks, globals, context);
		}

		let tasks: Tasks.Task[];
		if (fileConfig.tasks) {
			tasks = TaskDescription.from(fileConfig.tasks, globals, context);
		}
		tasks = TaskDescription.merge(tasks, globalTasks);

		if (!tasks || tasks.length === 0) {
			if (globals.command && globals.command.name) {
				let matchers: ProblemMatcher[] = ProblemMatcherConverter.from(fileConfig.problemMatcher, context);;
				let isBackground = fileConfig.isBackground ? !!fileConfig.isBackground : fileConfig.isWatching ? !!fileConfig.isWatching : undefined;
				let task: Tasks.Task = {
					_id: UUID.generateUuid(),
					name: globals.command.name,
					identifier: UUID.generateUuid(),
					group: Tasks.TaskGroup.Build,
					command: undefined,
					isBackground: isBackground,
					showOutput: undefined,
					suppressTaskName: true, // this must be true since we infer the task from the global data.
					problemMatchers: matchers
				};
				TaskDescription.mergeGlobals(task, globals);
				TaskDescription.fillDefaults(task);
				tasks = [task];
			}
		}
		return tasks || [];
	}
}

export function parse(configuration: ExternalTaskRunnerConfiguration, logger: IProblemReporter): ParseResult {
	return (new ConfigurationParser(logger)).run(configuration);
}