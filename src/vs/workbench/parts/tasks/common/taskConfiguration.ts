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

export interface ShellConfiguration {
	executable: string;
	args?: string[];
}

export interface CommandOptions {
	/**
	 * The current working directory of the executed program or shell.
	 * If omitted VSCode's current workspace root is used.
	 */
	cwd?: string;

	/**
	 * The additional environment of the executed program or shell. If omitted
	 * the parent process' environment is used.
	 */
	env?: IStringDictionary<string>;

	/**
	 * The shell configuration;
	 */
	shell?: ShellConfiguration;
}

export interface PlatformTaskDescription {

	/**
	 * Whether the task is a shell task or a process task.
	 */
	type?: string;

	/**
	 * The command to be executed. Can be an external program or a shell
	 * command.
	 */
	command?: string;

	/**
	 * @deprecated use the task type instead.
	 * Specifies whether the command is a shell command and therefore must
	 * be executed in a shell interpreter (e.g. cmd.exe, bash, ...).
	 *
	 * Defaults to false if omitted.
	 */
	isShellCommand?: boolean | ShellConfiguration;

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: CommandOptions;

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
	 * Defines the group the task belongs too.
	 */
	group?: string;

	/**
	 * @deprecated Use `group` instead.
	 * Whether this task maps to the default build command.
	 */
	isBuildCommand?: boolean;

	/**
	 * @deprecated Use `group` instead.
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
	options?: CommandOptions;

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
	 * Controls the behavior of the used terminal
	 */
	terminal?: {
		/**
		 * The terminal should echo the run command.
		 */
		echo?: boolean;
		/**
		 * Controls whether or not the terminal is reveal if a task
		 * is executed.
		 */
		reveal?: string;
	};

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
	 * Determines the runner to use
	 */
	runner?: string;

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
	engine: Tasks.ExecutionEngine;
	schemaVersion: Tasks.JsonSchemaVersion;
}

namespace CommandOptions {
	export function from(this: void, options: CommandOptions, context: ParseContext): Tasks.CommandOptions {
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
		result.shell = ShellConfiguration.from(options.shell, context);
		return isEmpty(result) ? undefined : result;
	}

	export function isEmpty(value: Tasks.CommandOptions): boolean {
		return !value || value.cwd === void 0 && value.env === void 0 && value.shell === void 0;
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
		target.shell = ShellConfiguration.merge(target.shell, source.shell);
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
		ShellConfiguration.fillDefaults(value.shell);
		return value;
	}

	export function freeze(value: Tasks.CommandOptions): void {
		Object.freeze(value);
		if (value.env) {
			Object.freeze(value.env);
		}
		ShellConfiguration.freeze(value.shell);
	}
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
	interface TerminalBehavior {
		echo?: boolean;
		reveal?: string;
	}

	interface BaseCommandConfiguationShape {
		command?: string;
		type?: string;
		isShellCommand?: boolean | ShellConfiguration;
		args?: string[];
		options?: CommandOptions;
		echoCommand?: boolean;
		showOutput?: string;
		terminal?: TerminalBehavior;
		taskSelector?: string;
	}

	interface CommandConfiguationShape extends BaseCommandConfiguationShape {
		windows?: BaseCommandConfiguationShape;
		osx?: BaseCommandConfiguationShape;
		linux?: BaseCommandConfiguationShape;
	}

	export namespace TerminalBehavior {
		export function from(this: void, config: BaseCommandConfiguationShape, context: ParseContext): Tasks.TerminalBehavior {
			let echo: boolean = undefined;
			let reveal: Tasks.RevealKind = undefined;
			if (Types.isBoolean(config.echoCommand)) {
				echo = config.echoCommand;
			}
			if (Types.isString(config.showOutput)) {
				reveal = Tasks.RevealKind.fromString(config.showOutput);
			}
			if (config.terminal) {
				if (Types.isBoolean(config.terminal.echo)) {
					echo = config.terminal.echo;
				}
				if (Types.isString(config.terminal.reveal)) {
					reveal = Tasks.RevealKind.fromString(config.terminal.reveal);
				}
			}
			if (echo === void 0 && reveal === void 0) {
				return undefined;
			}
			return { echo, reveal };
		}

		export function merge(target: Tasks.TerminalBehavior, source: Tasks.TerminalBehavior): Tasks.TerminalBehavior {
			if (isEmpty(source)) {
				return target;
			}
			if (isEmpty(target)) {
				return source;
			}
			mergeProperty(target, source, 'echo');
			mergeProperty(target, source, 'reveal');
			return target;
		}

		export function fillDefault(value: Tasks.TerminalBehavior): Tasks.TerminalBehavior {
			if (value && Object.isFrozen(value)) {
				return value;
			}
			if (value === void 0) {
				return { echo: false, reveal: Tasks.RevealKind.Always };
			}
			if (value.echo === void 0) {
				value.echo = false;
			}
			if (value.reveal === void 0) {
				value.reveal = Tasks.RevealKind.Always;
			}
			return value;
		}

		export function freeze(value: Tasks.TerminalBehavior): void {
			if (value === void 0) {
				return;
			}
			Object.freeze(value);
		}

		function isEmpty(this: void, value: Tasks.TerminalBehavior): boolean {
			return !value || value.echo === void 0 && value.reveal === void 0;
		}
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
			type: undefined,
			terminal: undefined
		};
		if (Types.isString(config.command)) {
			result.name = config.command;
		}
		if (Types.isString(config.type)) {
			result.type = Tasks.CommandType.fromString(config.type);
		}
		let isShellConfiguration = ShellConfiguration.is(config.isShellCommand);
		if (Types.isBoolean(config.isShellCommand) || isShellConfiguration) {
			result.type = Tasks.CommandType.Shell;
		} else if (config.isShellCommand !== void 0) {
			result.type = !!config.isShellCommand ? Tasks.CommandType.Shell : Tasks.CommandType.Process;
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
			if (result.options && result.options.shell === void 0 && isShellConfiguration) {
				result.options.shell = ShellConfiguration.from(config.isShellCommand as ShellConfiguration, context);
				if (context.engine !== Tasks.ExecutionEngine.Terminal) {
					context.problemReporter.warn(nls.localize('ConfigurationParser.noShell', 'Warning: shell configuration is only supported when executing tasks in the terminal.'));
				}
			}
		}
		let terminal = TerminalBehavior.from(config, context);
		if (terminal) {
			result.terminal = terminal;
		}
		if (Types.isString(config.taskSelector)) {
			result.taskSelector = config.taskSelector;
		}
		return isEmpty(result) ? undefined : result;
	}

	export function isEmpty(value: Tasks.CommandConfiguration): boolean {
		return !value || value.name === void 0 && value.type === void 0 && value.args === void 0 && CommandOptions.isEmpty(value.options) && value.terminal === void 0;
	}

	export function onlyTerminalBehaviour(value: Tasks.CommandConfiguration): boolean {
		return value &&
			value.terminal && (value.terminal.echo !== void 0 || value.terminal.reveal !== void 0) &&
			value.name === void 0 && value.type === void 0 && value.args === void 0 && CommandOptions.isEmpty(value.options);
	}

	export function merge(target: Tasks.CommandConfiguration, source: Tasks.CommandConfiguration): Tasks.CommandConfiguration {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		mergeProperty(target, source, 'name');
		mergeProperty(target, source, 'type');
		// Merge isShellCommand
		if (target.type === void 0) {
			target.type = source.type;
		}

		target.terminal = TerminalBehavior.merge(target.terminal, source.terminal);
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
		if (value.name !== void 0 && value.type === void 0) {
			value.type = Tasks.CommandType.Process;
		}
		value.terminal = TerminalBehavior.fillDefault(value.terminal);
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
		if (value.terminal) {
			TerminalBehavior.freeze(value.terminal);
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

interface TaskParseResult {
	tasks: Tasks.Task[] | undefined;
	annotatingTasks: Tasks.Task[] | undefined;
}

namespace TaskDescription {

	export let source: Tasks.TaskSource = {
		kind: Tasks.TaskSourceKind.Workspace,
		label: 'Workspace',
		detail: '.settins\tasks.json'
	};

	export function from(this: void, tasks: TaskDescription[], globals: Globals, context: ParseContext): TaskParseResult {
		if (!tasks) {
			return undefined;
		}
		let parsedTasks: Tasks.Task[] = [];
		let annotatingTasks: Tasks.Task[] = [];
		let defaultBuildTask: { task: Tasks.Task; rank: number; } = { task: undefined, rank: -1 };
		let defaultTestTask: { task: Tasks.Task; rank: number; } = { task: undefined, rank: -1 };
		let schema2_0_0: boolean = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
		tasks.forEach((externalTask) => {
			let taskName = externalTask.taskName;
			if (!taskName) {
				context.problemReporter.fatal(nls.localize('ConfigurationParser.noTaskName', 'Error: tasks must provide a taskName property. The task will be ignored.\n{0}\n', JSON.stringify(externalTask, null, 4)));
				return;
			}
			let problemMatchers = ProblemMatcherConverter.from(externalTask.problemMatcher, context);
			let command: Tasks.CommandConfiguration = externalTask.command !== void 0
				? CommandConfiguration.from(externalTask, context)
				: externalTask.echoCommand !== void 0
					? { name: undefined, type: undefined, terminal: CommandConfiguration.TerminalBehavior.from(externalTask, context) }
					: undefined;
			let identifer = Types.isString(externalTask.identifier) ? externalTask.identifier : taskName;
			let task: Tasks.Task = {
				_id: UUID.generateUuid(),
				_source: source,
				_label: taskName,
				name: taskName,
				identifier: identifer,
				command
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
			if (Tasks.TaskGroup.is(externalTask.group)) {
				task.group = externalTask.group;
			}
			if (task.group === void 0) {
				if (Types.isBoolean(externalTask.isBuildCommand) && externalTask.isBuildCommand) {
					task.group = Tasks.TaskGroup.Build;
				} else if (Types.isBoolean(externalTask.isTestCommand && externalTask.isTestCommand)) {
					task.group = Tasks.TaskGroup.Test;
				}
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
			if (schema2_0_0 && isAnnotating(task)) {
				mergeGlobalsIntoAnnnotation(task, globals);
				annotatingTasks.push(task);
				return;
			}
			mergeGlobals(task, globals);
			fillDefaults(task);
			let addTask: boolean = true;
			if (context.engine === Tasks.ExecutionEngine.Terminal && task.command && task.command.name && task.command.type === Tasks.CommandType.Shell && task.command.args && task.command.args.length > 0) {
				if (hasUnescapedSpaces(task.command.name) || task.command.args.some(hasUnescapedSpaces)) {
					context.problemReporter.warn(nls.localize('taskConfiguration.shellArgs', 'Warning: the task \'{0}\' is a shell command and either the command name or one of its arguments has unescaped spaces. To ensure correct command line quoting please merge args into the command.', task.name));
				}
			}
			if (schema2_0_0) {
				if ((task.command === void 0 || task.command.name === void 0) && (task.dependsOn === void 0 || task.dependsOn.length === 0)) {
					context.problemReporter.error(nls.localize(
						'taskConfiguration.noCommandOrDependsOn', 'Error: the task \'{0}\' neither specifies a command nor a dependsOn property. The task will be ignored. Its definition is:\n{1}',
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
				if (task.group === Tasks.TaskGroup.Build && defaultBuildTask.rank < 2) {
					defaultBuildTask.task = task;
					defaultBuildTask.rank = 2;
				} else if (task.group === Tasks.TaskGroup.Test && defaultTestTask.rank < 2) {
					defaultTestTask.task = task;
					defaultTestTask.rank = 2;
				} else if (task.name === 'build' && defaultBuildTask.rank < 1) {
					defaultBuildTask.task = task;
					defaultBuildTask.rank = 1;
				} else if (task.name === 'test' && defaultTestTask.rank < 1) {
					defaultTestTask.task = task;
					defaultTestTask.rank = 1;
				}
			}
		});
		if (defaultBuildTask.rank > -1 && defaultBuildTask.rank < 2) {
			defaultBuildTask.task.group = Tasks.TaskGroup.Build;
		} else if (defaultTestTask.rank > -1 && defaultTestTask.rank < 2) {
			defaultTestTask.task.group = Tasks.TaskGroup.Test;
		}
		return {
			tasks: parsedTasks.length > 0 ? parsedTasks : undefined,
			annotatingTasks: annotatingTasks.length > 0 ? annotatingTasks : undefined
		};
	}

	export function mergeTasks(target: Tasks.Task[], source: Tasks.Task[]): Tasks.Task[] {
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
			if (CommandConfiguration.onlyTerminalBehaviour(task.command)) {
				// The globals can have a echo set which would override the local echo
				// Saves the need of a additional fill method. But might be necessary
				// at some point.
				let oldTerminal = Objects.clone(task.command.terminal);
				CommandConfiguration.merge(task.command, globals.command);
				task.command.terminal = oldTerminal;
			}
		}
		// promptOnClose is inferred from isBackground if available
		if (task.promptOnClose === void 0 && task.isBackground === void 0 && globals.promptOnClose !== void 0) {
			task.promptOnClose = globals.promptOnClose;
		}
		if (task.suppressTaskName === void 0 && globals.suppressTaskName !== void 0) {
			task.suppressTaskName = globals.suppressTaskName;
		}
	}

	export function mergeGlobalsIntoAnnnotation(task: Tasks.Task, globals: Globals): void {
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

	function isAnnotating(task: Tasks.Task): boolean {
		return (task.command === void 0 || task.command.name === void 0) && (task.dependsOn === void 0 || task.dependsOn.length === 0);
	}

	export function merge(target: Tasks.Task, source: Tasks.Task): Tasks.Task {
		if (!target) {
			return source;
		}
		if (!source) {
			return target;
		}

		mergeProperty(target, source, 'group');
		target.command = CommandConfiguration.merge(target.command, source.command);
		mergeProperty(target, source, 'suppressTaskName');
		mergeProperty(target, source, 'args');
		mergeProperty(target, source, 'isBackground');
		mergeProperty(target, source, 'promptOnClose');
		mergeProperty(target, source, 'dependsOn');
		mergeProperty(target, source, 'problemMatchers');
		return target;
	}
}

interface Globals {
	command?: Tasks.CommandConfiguration;
	promptOnClose?: boolean;
	suppressTaskName?: boolean;
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
		if (config.suppressTaskName !== void 0) {
			result.suppressTaskName = !!config.suppressTaskName;
		}
		if (config.promptOnClose !== void 0) {
			result.promptOnClose = !!config.promptOnClose;
		}
		return result;
	}

	export function isEmpty(value: Globals): boolean {
		return !value || value.command === void 0 && value.promptOnClose === void 0 && value.suppressTaskName === void 0;
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
		return target;
	}

	export function fillDefaults(value: Globals): void {
		if (!value) {
			return;
		}
		if (value.suppressTaskName === void 0) {
			value.suppressTaskName = false;
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
		let runner = config.runner || config._runner;
		let result: Tasks.ExecutionEngine;
		if (runner) {
			switch (runner) {
				case 'terminal':
					result = Tasks.ExecutionEngine.Terminal;
					break;
				case 'process':
					result = Tasks.ExecutionEngine.Process;
					break;
			}
		}
		let schemaVersion = JsonSchemaVersion.from(config);
		if (schemaVersion === Tasks.JsonSchemaVersion.V0_1_0) {
			return result || Tasks.ExecutionEngine.Process;
		} else if (schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
			return Tasks.ExecutionEngine.Terminal;
		} else {
			throw new Error('Shouldn\'t happen.');
		}
	}

}

export namespace JsonSchemaVersion {

	export function from(config: ExternalTaskRunnerConfiguration): Tasks.JsonSchemaVersion {
		let version = config.version;
		if (!version) {
			return Tasks.JsonSchemaVersion.V2_0_0;
		}
		switch (version) {
			case '0.1.0':
				return Tasks.JsonSchemaVersion.V0_1_0;
			default:
				return Tasks.JsonSchemaVersion.V2_0_0;
		}
	}
}

export interface ParseResult {
	validationStatus: ValidationStatus;
	tasks: Tasks.Task[];
	annotatingTasks: Tasks.Task[];
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
		let schemaVersion = JsonSchemaVersion.from(fileConfig);
		if (engine === Tasks.ExecutionEngine.Terminal) {
			this.problemReporter.clearOutput();
		}
		let context: ParseContext = {
			problemReporter: this.problemReporter,
			namedProblemMatchers: undefined,
			engine,
			schemaVersion,
		};
		let taskParseResult = this.createTaskRunnerConfiguration(fileConfig, context);
		return {
			validationStatus: this.problemReporter.status,
			tasks: taskParseResult.tasks,
			annotatingTasks: taskParseResult.annotatingTasks,
			engine
		};
	}

	private createTaskRunnerConfiguration(fileConfig: ExternalTaskRunnerConfiguration, context: ParseContext): TaskParseResult {
		let globals = Globals.from(fileConfig, context);
		if (this.problemReporter.status.isFatal()) {
			return undefined;
		}
		context.namedProblemMatchers = ProblemMatcherConverter.namedFrom(fileConfig.declares, context);
		let globalTasks: TaskParseResult;
		if (fileConfig.windows && Platform.platform === Platform.Platform.Windows) {
			globalTasks = TaskDescription.from(fileConfig.windows.tasks, globals, context);
		} else if (fileConfig.osx && Platform.platform === Platform.Platform.Mac) {
			globalTasks = TaskDescription.from(fileConfig.osx.tasks, globals, context);
		} else if (fileConfig.linux && Platform.platform === Platform.Platform.Linux) {
			globalTasks = TaskDescription.from(fileConfig.linux.tasks, globals, context);
		}

		let result: TaskParseResult = { tasks: undefined, annotatingTasks: undefined };
		if (fileConfig.tasks) {
			result = TaskDescription.from(fileConfig.tasks, globals, context);
		}
		if (globalTasks) {
			result.tasks = TaskDescription.mergeTasks(result.tasks, globalTasks.tasks);
			result.annotatingTasks = TaskDescription.mergeTasks(result.annotatingTasks, globalTasks.annotatingTasks);
		}

		if ((!result.tasks || result.tasks.length === 0) && (globals.command && globals.command.name)) {
			let matchers: ProblemMatcher[] = ProblemMatcherConverter.from(fileConfig.problemMatcher, context);;
			let isBackground = fileConfig.isBackground ? !!fileConfig.isBackground : fileConfig.isWatching ? !!fileConfig.isWatching : undefined;
			let task: Tasks.Task = {
				_id: UUID.generateUuid(),
				_source: TaskDescription.source,
				_label: globals.command.name,
				name: globals.command.name,
				identifier: globals.command.name,
				group: Tasks.TaskGroup.Build,
				command: undefined,
				isBackground: isBackground,
				suppressTaskName: true, // this must be true since we infer the task from the global data.
				problemMatchers: matchers
			};
			TaskDescription.mergeGlobals(task, globals);
			TaskDescription.fillDefaults(task);
			result.tasks = [task];
		}
		result.tasks = result.tasks || [];
		result.annotatingTasks = result.annotatingTasks || [];
		return result;
	}
}

export function parse(configuration: ExternalTaskRunnerConfiguration, logger: IProblemReporter): ParseResult {
	return (new ConfigurationParser(logger)).run(configuration);
}

export function mergeTasks(target: Tasks.Task, source: Tasks.Task): Tasks.Task {
	return TaskDescription.merge(target, source);
}