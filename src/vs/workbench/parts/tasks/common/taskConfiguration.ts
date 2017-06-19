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
	 * The id of the customized task
	 */
	customize?: string;

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
	presentation?: {
		/**
		 * Controls whether the terminal executing a task is brought to front or not.
		 * Defaults to `RevealKind.Always`.
		 */
		reveal?: string;

		/**
		 * Controls whether the executed command is printed to the output window or terminal as well.
		 */
		echo?: boolean;

		/**
		 * Controls whether the terminal is focus when this task is executed
		 */
		focus?: boolean;

		/**
		 * Controls whether the task runs in a new terminal
		 */
		panel?: string;
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

function assignProperty<T, K extends keyof T>(target: T, source: T, key: K) {
	if (source[key] !== void 0) {
		target[key] = source[key];
	}
}

function fillProperty<T, K extends keyof T>(target: T, source: T, key: K) {
	if (target[key] === void 0 && source[key] !== void 0) {
		target[key] = source[key];
	}
}


interface ParserType<T> {
	isEmpty(value: T): boolean;
	assignProperties(target: T, source: T): T;
	fillProperties(target: T, source: T): T;
	fillDefaults(value: T, context: ParseContext): T;
	freeze(value: T): Readonly<T>;
}

interface MetaData<T, U> {
	property: keyof T;
	type?: ParserType<U>;
}


function _isEmpty<T>(this: void, value: T, properties: MetaData<T, any>[]): boolean {
	if (value === void 0 || value === null) {
		return true;
	}
	for (let meta of properties) {
		let property = value[meta.property];
		if (property !== void 0 && property !== null) {
			if (meta.type !== void 0 && !meta.type.isEmpty(property)) {
				return false;
			} else if (!Array.isArray(property) || property.length > 0) {
				return false;
			}
		}
	}
	return true;
}

function _assignProperties<T>(this: void, target: T, source: T, properties: MetaData<T, any>[]): T {
	if (_isEmpty(source, properties)) {
		return target;
	}
	if (_isEmpty(target, properties)) {
		return source;
	}
	for (let meta of properties) {
		let property = meta.property;
		let value: any;
		if (meta.type !== void 0) {
			value = meta.type.assignProperties(target[property], source[property]);
		} else {
			value = source[property];
		}
		if (value !== void 0 && value !== null) {
			target[property] = value;
		}
	}
	return target;
}

function _fillProperties<T>(this: void, target: T, source: T, properties: MetaData<T, any>[]): T {
	if (_isEmpty(source, properties)) {
		return target;
	}
	if (_isEmpty(target, properties)) {
		return source;
	}
	for (let meta of properties) {
		let property = meta.property;
		if (target[property] !== void 0) {
			continue;
		}
		let value: any;
		if (meta.type) {
			value = meta.type.fillProperties(target[property], source[property]);
		} else {
			value = source[property];
		}

		if (value !== void 0 && value !== null) {
			target[property] = value;
		}
	}
	return target;
}

function _fillDefaults<T>(this: void, target: T, defaults: T, properties: MetaData<T, any>[], context: ParseContext): T {
	if (target && Object.isFrozen(target)) {
		return target;
	}
	if (target === void 0 || target === null) {
		if (defaults !== void 0 && defaults !== null) {
			return Objects.deepClone(defaults);
		} else {
			return undefined;
		}
	}
	for (let meta of properties) {
		let property = meta.property;
		if (target[property] !== void 0) {
			continue;
		}
		let value: any;
		if (meta.type) {
			value = meta.type.fillDefaults(target[property], context);
		} else {
			value = defaults[property];
		}

		if (value !== void 0 && value !== null) {
			target[property] = value;
		}
	}
	return target;
}

function _freeze<T>(this: void, target: T, properties: MetaData<T, any>[]): Readonly<T> {
	if (target === void 0 || target === null) {
		return undefined;
	}
	if (Object.isFrozen(target)) {
		return target;
	}
	for (let meta of properties) {
		if (meta.type) {
			let value = target[meta.property];
			if (value) {
				meta.type.freeze(value);
			}
		}
	}
	Object.freeze(target);
	return target;
}

interface ParseContext {
	problemReporter: IProblemReporter;
	namedProblemMatchers: IStringDictionary<NamedProblemMatcher>;
	uuidMap: UUIDMap;
	engine: Tasks.ExecutionEngine;
	schemaVersion: Tasks.JsonSchemaVersion;
}


namespace ShellConfiguration {

	const properties: MetaData<Tasks.ShellConfiguration, void>[] = [{ property: 'executable' }, { property: 'args' }];

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

	export function isEmpty(this: void, value: Tasks.ShellConfiguration): boolean {
		return _isEmpty(value, properties);
	}

	export function assignProperties(this: void, target: Tasks.ShellConfiguration, source: Tasks.ShellConfiguration): Tasks.ShellConfiguration {
		return _assignProperties(target, source, properties);
	}

	export function fillProperties(this: void, target: Tasks.ShellConfiguration, source: Tasks.ShellConfiguration): Tasks.ShellConfiguration {
		return _fillProperties(target, source, properties);
	}

	export function fillDefaults(this: void, value: Tasks.ShellConfiguration, context: ParseContext): Tasks.ShellConfiguration {
		return value;
	}

	export function freeze(this: void, value: Tasks.ShellConfiguration): Readonly<Tasks.ShellConfiguration> {
		if (!value) {
			return undefined;
		}
		return Object.freeze(value);
	}
}

namespace CommandOptions {

	const properties: MetaData<Tasks.CommandOptions, Tasks.ShellConfiguration>[] = [{ property: 'cwd' }, { property: 'env' }, { property: 'shell', type: ShellConfiguration }];
	const defaults: CommandOptions = { cwd: '${workspaceRoot}' };

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
		return _isEmpty(value, properties);
	}

	export function assignProperties(target: Tasks.CommandOptions, source: Tasks.CommandOptions): Tasks.CommandOptions {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		assignProperty(target, source, 'cwd');
		if (target.env === void 0) {
			target.env = source.env;
		} else if (source.env !== void 0) {
			let env: { [key: string]: string; } = Object.create(null);
			Object.keys(target.env).forEach(key => env[key] = target.env[key]);
			Object.keys(source.env).forEach(key => env[key] = source.env[key]);
			target.env = env;
		}
		target.shell = ShellConfiguration.assignProperties(target.shell, source.shell);
		return target;
	}

	export function fillProperties(target: Tasks.CommandOptions, source: Tasks.CommandOptions): Tasks.CommandOptions {
		return _fillProperties(target, source, properties);
	}

	export function fillDefaults(value: Tasks.CommandOptions, context: ParseContext): Tasks.CommandOptions {
		return _fillDefaults(value, defaults, properties, context);
	}

	export function freeze(value: Tasks.CommandOptions): Readonly<Tasks.CommandOptions> {
		return _freeze(value, properties);
	}
}

namespace CommandConfiguration {

	interface PresentationOptions {
		echo?: boolean;
		reveal?: string;
		focus?: boolean;
		panel?: string;
	}

	interface BaseCommandConfiguationShape {
		command?: string;
		type?: string;
		isShellCommand?: boolean | ShellConfiguration;
		args?: string[];
		options?: CommandOptions;
		echoCommand?: boolean;
		showOutput?: string;
		/**
		 * @deprecated Use panel instead.
		 */
		terminal?: PresentationOptions;
		presentation?: PresentationOptions;
		taskSelector?: string;
		suppressTaskName?: boolean;
	}

	interface CommandConfiguationShape extends BaseCommandConfiguationShape {
		windows?: BaseCommandConfiguationShape;
		osx?: BaseCommandConfiguationShape;
		linux?: BaseCommandConfiguationShape;
	}

	export namespace PresentationOptions {
		const properties: MetaData<Tasks.PresentationOptions, void>[] = [{ property: 'echo' }, { property: 'reveal' }, { property: 'focus' }, { property: 'panel' }];

		export function from(this: void, config: BaseCommandConfiguationShape, context: ParseContext): Tasks.PresentationOptions {
			let echo: boolean;
			let reveal: Tasks.RevealKind;
			let focus: boolean;
			let panel: Tasks.PanelKind;
			if (Types.isBoolean(config.echoCommand)) {
				echo = config.echoCommand;
			}
			if (Types.isString(config.showOutput)) {
				reveal = Tasks.RevealKind.fromString(config.showOutput);
			}
			let presentation = config.presentation || config.terminal;
			if (presentation) {
				if (Types.isBoolean(presentation.echo)) {
					echo = presentation.echo;
				}
				if (Types.isString(presentation.reveal)) {
					reveal = Tasks.RevealKind.fromString(presentation.reveal);
				}
				if (Types.isBoolean(presentation.focus)) {
					focus = presentation.focus;
				}
				if (Types.isString(presentation.panel)) {
					panel = Tasks.PanelKind.fromString(presentation.panel);
				}
			}
			if (echo === void 0 && reveal === void 0 && focus === void 0 && panel === void 0) {
				return undefined;
			}
			return { echo, reveal, focus, panel };
		}

		export function assignProperties(target: Tasks.PresentationOptions, source: Tasks.PresentationOptions): Tasks.PresentationOptions {
			return _assignProperties(target, source, properties);
		}

		export function fillProperties(target: Tasks.PresentationOptions, source: Tasks.PresentationOptions): Tasks.PresentationOptions {
			return _fillProperties(target, source, properties);
		}

		export function fillDefaults(value: Tasks.PresentationOptions, context: ParseContext): Tasks.PresentationOptions {
			let defaultEcho = context.engine === Tasks.ExecutionEngine.Terminal ? true : false;
			return _fillDefaults(value, { echo: defaultEcho, reveal: Tasks.RevealKind.Always, focus: false, panel: Tasks.PanelKind.Shared }, properties, context);
		}

		export function freeze(value: Tasks.PresentationOptions): Readonly<Tasks.PresentationOptions> {
			return _freeze(value, properties);
		}

		export function isEmpty(this: void, value: Tasks.PresentationOptions): boolean {
			return _isEmpty(value, properties);
		}
	}

	const properties: MetaData<Tasks.CommandConfiguration, CommandOptions | PresentationOptions>[] = [
		{ property: 'type' }, { property: 'name' }, { property: 'options', type: CommandOptions },
		{ property: 'args' }, { property: 'taskSelector' }, { property: 'suppressTaskName' },
		{ property: 'presentation', type: PresentationOptions }
	];

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
			result = assignProperties(result, osConfig);
		}
		return isEmpty(result) ? undefined : result;
	}

	function fromBase(this: void, config: BaseCommandConfiguationShape, context: ParseContext): Tasks.CommandConfiguration {
		let result: Tasks.CommandConfiguration = {
			name: undefined,
			type: undefined,
			presentation: undefined
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
		let panel = PresentationOptions.from(config, context);
		if (panel) {
			result.presentation = panel;
		}
		if (Types.isString(config.taskSelector)) {
			result.taskSelector = config.taskSelector;
		}
		if (Types.isBoolean(config.suppressTaskName)) {
			result.suppressTaskName = config.suppressTaskName;
		}
		return isEmpty(result) ? undefined : result;
	}

	export function isEmpty(value: Tasks.CommandConfiguration): boolean {
		return _isEmpty(value, properties);
	}

	export function onlyTerminalBehaviour(value: Tasks.CommandConfiguration): boolean {
		return value &&
			value.presentation && (value.presentation.echo !== void 0 || value.presentation.reveal !== void 0) &&
			value.name === void 0 && value.type === void 0 && value.args === void 0 && CommandOptions.isEmpty(value.options);
	}

	export function assignProperties(target: Tasks.CommandConfiguration, source: Tasks.CommandConfiguration): Tasks.CommandConfiguration {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		assignProperty(target, source, 'name');
		assignProperty(target, source, 'type');
		assignProperty(target, source, 'taskSelector');
		assignProperty(target, source, 'suppressTaskName');
		if (source.args !== void 0) {
			if (target.args === void 0) {
				target.args = source.args;
			} else {
				target.args = target.args.concat(source.args);
			}
		}
		target.presentation = PresentationOptions.assignProperties(target.presentation, source.presentation);
		target.options = CommandOptions.assignProperties(target.options, source.options);
		return target;
	}

	export function fillGlobals(target: Tasks.CommandConfiguration, source: Tasks.CommandConfiguration, taskName: string): Tasks.CommandConfiguration {
		if (isEmpty(source)) {
			return target;
		}
		target = target || {
			name: undefined,
			type: undefined,
			presentation: undefined
		};
		fillProperty(target, source, 'name');
		fillProperty(target, source, 'type');
		fillProperty(target, source, 'taskSelector');
		fillProperty(target, source, 'suppressTaskName');

		target.presentation = PresentationOptions.fillProperties(target.presentation, source.presentation);
		target.options = CommandOptions.fillProperties(target.options, source.options);

		let args: string[] = source.args ? source.args.slice() : [];
		if (!target.suppressTaskName) {
			if (target.taskSelector !== void 0) {
				args.push(target.taskSelector + taskName);
			} else {
				args.push(taskName);
			}
		}
		if (target.args) {
			args = args.concat(target.args);
		}
		target.args = args;
		return target;
	}

	export function fillDefaults(value: Tasks.CommandConfiguration, context: ParseContext): void {
		if (!value || Object.isFrozen(value)) {
			return;
		}
		if (value.name !== void 0 && value.type === void 0) {
			value.type = Tasks.CommandType.Process;
		}
		value.presentation = PresentationOptions.fillDefaults(value.presentation, context);
		if (!isEmpty(value)) {
			value.options = CommandOptions.fillDefaults(value.options, context);
		}
		if (value.args === void 0) {
			value.args = EMPTY_ARRAY;
		}
		if (value.suppressTaskName === void 0) {
			value.suppressTaskName = false;
		}
	}

	export function freeze(value: Tasks.CommandConfiguration): Readonly<Tasks.CommandConfiguration> {
		return _freeze(value, properties);
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
			let matcher = resolveProblemMatcher(config as ProblemMatcherConfig.ProblemMatcher, context);
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
		detail: '.settins\\tasks.json'
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
			let command: Tasks.CommandConfiguration = CommandConfiguration.from(externalTask, context);
			let identifer = Types.isString(externalTask.identifier) ? externalTask.identifier : taskName;
			let task: Tasks.Task = {
				_id: context.uuidMap.getUUID(taskName),
				_source: source,
				_label: taskName,
				name: taskName,
				identifier: identifer,
				command
			};
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
			if (Types.isString(externalTask.customize)) {
				task.customize = externalTask.customize;
			}
			if (externalTask.command !== void 0) {
				// if the task has its own command then we suppress the
				// task name by default.
				command.suppressTaskName = true;
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
			fillGlobals(task, globals);
			fillDefaults(task, context);
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

	export function assignTasks(target: Tasks.Task[], source: Tasks.Task[]): Tasks.Task[] {
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

	export function fillGlobals(task: Tasks.Task, globals: Globals): void {
		// We only merge a command from a global definition if there is no dependsOn
		if (task.dependsOn === void 0) {
			task.command = CommandConfiguration.fillGlobals(task.command, globals.command, task.name);
		}
		// promptOnClose is inferred from isBackground if available
		if (task.promptOnClose === void 0 && task.isBackground === void 0 && globals.promptOnClose !== void 0) {
			task.promptOnClose = globals.promptOnClose;
		}
	}

	export function mergeGlobalsIntoAnnnotation(task: Tasks.Task, globals: Globals): void {
	}

	export function fillDefaults(task: Tasks.Task, context: ParseContext): void {
		CommandConfiguration.fillDefaults(task.command, context);
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
					if (i === 0 || value.charAt(i - 1) !== '\\') {
						return true;
					}
				}
			}
			return false;
		}
	}

	function isAnnotating(task: Tasks.Task): boolean {
		return task.customize !== void 0 && (task.command === void 0 || task.command.name === void 0);
	}

	export function assignProperties(target: Tasks.Task, source: Tasks.Task): Tasks.Task {
		if (!target) {
			return source;
		}
		if (!source) {
			return target;
		}

		assignProperty(target, source, 'group');
		target.command = CommandConfiguration.assignProperties(target.command, source.command);
		assignProperty(target, source, 'isBackground');
		assignProperty(target, source, 'promptOnClose');
		assignProperty(target, source, 'dependsOn');
		assignProperty(target, source, 'problemMatchers');
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
			result = Globals.assignProperties(result, osGlobals);
		}
		let command = CommandConfiguration.from(config, context);
		if (command) {
			result.command = command;
		}
		Globals.fillDefaults(result, context);
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

	export function assignProperties(target: Globals, source: Globals): Globals {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		assignProperty(target, source, 'promptOnClose');
		assignProperty(target, source, 'suppressTaskName');
		return target;
	}

	export function fillDefaults(value: Globals, context: ParseContext): void {
		if (!value) {
			return;
		}
		CommandConfiguration.fillDefaults(value.command, context);
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

	export const _default: Tasks.ExecutionEngine = Tasks.ExecutionEngine.Process;

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

	export const _default: Tasks.JsonSchemaVersion = Tasks.JsonSchemaVersion.V0_1_0;

	export function from(config: ExternalTaskRunnerConfiguration): Tasks.JsonSchemaVersion {
		let version = config.version;
		if (!version) {
			return _default;
		}
		switch (version) {
			case '0.1.0':
				return Tasks.JsonSchemaVersion.V0_1_0;
			case '2.0.0':
				return Tasks.JsonSchemaVersion.V2_0_0;
			default:
				return _default;
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

class UUIDMap {

	private last: IStringDictionary<string | string[]>;
	private current: IStringDictionary<string | string[]>;

	constructor() {
		this.current = Object.create(null);
	}

	public start(): void {
		this.last = this.current;
		this.current = Object.create(null);
	}

	public getUUID(identifier: string): string {
		let lastValue = this.last[identifier];
		let result: string;
		if (lastValue !== void 0) {
			if (Array.isArray(lastValue)) {
				result = lastValue.shift();
				if (lastValue.length === 0) {
					delete this.last[identifier];
				}
			} else {
				result = lastValue;
				delete this.last[identifier];
			}
		}
		if (result === void 0) {
			result = UUID.generateUuid();
		}
		let currentValue = this.current[identifier];
		if (currentValue === void 0) {
			this.current[identifier] = result;
		} else {
			if (Array.isArray(currentValue)) {
				currentValue.push(result);
			} else {
				let arrayValue: string[] = [currentValue];
				arrayValue.push(result);
				this.current[identifier] = arrayValue;
			}
		}
		return result;
	}

	public finish(): void {
		this.last = undefined;
	}
}

class ConfigurationParser {

	private problemReporter: IProblemReporter;
	private uuidMap: UUIDMap;

	constructor(problemReporter: IProblemReporter, uuidMap: UUIDMap) {
		this.problemReporter = problemReporter;
		this.uuidMap = uuidMap;
	}

	public run(fileConfig: ExternalTaskRunnerConfiguration): ParseResult {
		let engine = ExecutionEngine.from(fileConfig);
		let schemaVersion = JsonSchemaVersion.from(fileConfig);
		if (engine === Tasks.ExecutionEngine.Terminal) {
			this.problemReporter.clearOutput();
		}
		let context: ParseContext = {
			problemReporter: this.problemReporter,
			uuidMap: this.uuidMap,
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
			return { tasks: [], annotatingTasks: [] };
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
			result.tasks = TaskDescription.assignTasks(result.tasks, globalTasks.tasks);
			result.annotatingTasks = TaskDescription.assignTasks(result.annotatingTasks, globalTasks.annotatingTasks);
		}

		if ((!result.tasks || result.tasks.length === 0) && (globals.command && globals.command.name)) {
			let matchers: ProblemMatcher[] = ProblemMatcherConverter.from(fileConfig.problemMatcher, context);
			let isBackground = fileConfig.isBackground ? !!fileConfig.isBackground : fileConfig.isWatching ? !!fileConfig.isWatching : undefined;
			let task: Tasks.Task = {
				_id: context.uuidMap.getUUID(globals.command.name),
				_source: TaskDescription.source,
				_label: globals.command.name,
				name: globals.command.name,
				identifier: globals.command.name,
				group: Tasks.TaskGroup.Build,
				command: {
					name: undefined,
					type: undefined,
					presentation: undefined,
					suppressTaskName: true
				},
				isBackground: isBackground,
				problemMatchers: matchers
			};
			TaskDescription.fillGlobals(task, globals);
			TaskDescription.fillDefaults(task, context);
			result.tasks = [task];
		}
		result.tasks = result.tasks || [];
		result.annotatingTasks = result.annotatingTasks || [];
		return result;
	}
}

let uuidMap: UUIDMap = new UUIDMap();
export function parse(configuration: ExternalTaskRunnerConfiguration, logger: IProblemReporter): ParseResult {
	try {
		uuidMap.start();
		return (new ConfigurationParser(logger, uuidMap)).run(configuration);
	} finally {
		uuidMap.finish();
	}
}

export function mergeTasks(target: Tasks.Task, source: Tasks.Task): Tasks.Task {
	return TaskDescription.assignProperties(target, source);
}

/*
class VersionConverter {
	constructor(private problemReporter: IProblemReporter) {
	}

	public convert(fromConfig: ExternalTaskRunnerConfiguration): ExternalTaskRunnerConfiguration {
		let result: ExternalTaskRunnerConfiguration;
		result.version = '2.0.0';
		if (Array.isArray(fromConfig.tasks)) {

		} else {
			result.tasks = [];
		}


		return result;
	}

	private convertGlobalTask(fromConfig: ExternalTaskRunnerConfiguration): TaskDescription {
		let command: string = this.getGlobalCommand(fromConfig);
		if (!command) {
			this.problemReporter.error(nls.localize('Converter.noGlobalName', 'No global command specified. Can\'t convert to 2.0.0 version.'));
			return undefined;
		}
		let result: TaskDescription = {
			taskName: command
		};
		if (fromConfig.isShellCommand) {
			result.type = 'shell';
		} else {
			result.type = 'process';
			result.args = fromConfig.args;
		}
		if (fromConfig.)

		return result;
	}

	private getGlobalCommand(fromConfig: ExternalTaskRunnerConfiguration): string {
		if (fromConfig.command) {
			return fromConfig.command;
		} else if (fromConfig.windows && fromConfig.windows.command) {
			return fromConfig.windows.command;
		} else if (fromConfig.osx && fromConfig.osx.command) {
			return fromConfig.osx.command;
		} else if (fromConfig.linux && fromConfig.linux.command) {
			return fromConfig.linux.command;
		} else {
			return undefined;
		}
	}

	private createCommandLine(command: string, args: string[], isWindows: boolean): string {
		let result: string[];
		let commandHasSpace = false;
		let argHasSpace = false;
		if (TaskDescription.hasUnescapedSpaces(command)) {
			result.push(`"${command}"`);
			commandHasSpace = true;
		} else {
			result.push(command);
		}
		if (args) {
			for (let arg of args) {
				if (TaskDescription.hasUnescapedSpaces(arg)) {
					result.push(`"${arg}"`);
					argHasSpace= true;
				} else {
					result.push(arg);
				}
			}
		}
		return result.join(' ');
	}

}
*/