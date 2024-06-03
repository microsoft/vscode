/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';

import * as Objects from 'vs/base/common/objects';
import { IStringDictionary } from 'vs/base/common/collections';
import { IJSONSchemaMap } from 'vs/base/common/jsonSchema';
import { Platform } from 'vs/base/common/platform';
import * as Types from 'vs/base/common/types';
import * as UUID from 'vs/base/common/uuid';

import { ValidationStatus, IProblemReporter as IProblemReporterBase } from 'vs/base/common/parsers';
import {
	INamedProblemMatcher, ProblemMatcherParser, Config as ProblemMatcherConfig,
	isNamedProblemMatcher, ProblemMatcherRegistry, ProblemMatcher
} from 'vs/workbench/contrib/tasks/common/problemMatcher';

import { IWorkspaceFolder, IWorkspace } from 'vs/platform/workspace/common/workspace';
import * as Tasks from './tasks';
import { ITaskDefinitionRegistry, TaskDefinitionRegistry } from './taskDefinitionRegistry';
import { ConfiguredInput } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { URI } from 'vs/base/common/uri';
import { ShellExecutionSupportedContext, ProcessExecutionSupportedContext } from 'vs/workbench/contrib/tasks/common/taskService';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const enum ShellQuoting {
	/**
	 * Default is character escaping.
	 */
	escape = 1,

	/**
	 * Default is strong quoting
	 */
	strong = 2,

	/**
	 * Default is weak quoting.
	 */
	weak = 3
}

export interface IShellQuotingOptions {
	/**
	 * The character used to do character escaping.
	 */
	escape?: string | {
		escapeChar: string;
		charsToEscape: string;
	};

	/**
	 * The character used for string quoting.
	 */
	strong?: string;

	/**
	 * The character used for weak quoting.
	 */
	weak?: string;
}

export interface IShellConfiguration {
	executable?: string;
	args?: string[];
	quoting?: IShellQuotingOptions;
}

export interface ICommandOptionsConfig {
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
	shell?: IShellConfiguration;
}

export interface IPresentationOptionsConfig {
	/**
	 * Controls whether the terminal executing a task is brought to front or not.
	 * Defaults to `RevealKind.Always`.
	 */
	reveal?: string;

	/**
	 * Controls whether the problems panel is revealed when running this task or not.
	 * Defaults to `RevealKind.Never`.
	 */
	revealProblems?: string;

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

	/**
	 * Controls whether to show the "Terminal will be reused by tasks, press any key to close it" message.
	 */
	showReuseMessage?: boolean;

	/**
	 * Controls whether the terminal should be cleared before running the task.
	 */
	clear?: boolean;

	/**
	 * Controls whether the task is executed in a specific terminal group using split panes.
	 */
	group?: string;

	/**
	 * Controls whether the terminal that the task runs in is closed when the task completes.
	 */
	close?: boolean;
}

export interface IRunOptionsConfig {
	reevaluateOnRerun?: boolean;
	runOn?: string;
	instanceLimit?: number;
}

export interface ITaskIdentifier {
	type?: string;
	[name: string]: any;
}

export namespace ITaskIdentifier {
	export function is(value: any): value is ITaskIdentifier {
		const candidate: ITaskIdentifier = value;
		return candidate !== undefined && Types.isString(value.type);
	}
}

export interface ILegacyTaskProperties {
	/**
	 * @deprecated Use `isBackground` instead.
	 * Whether the executed command is kept alive and is watching the file system.
	 */
	isWatching?: boolean;

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
}

export interface ILegacyCommandProperties {

	/**
	 * Whether this is a shell or process
	 */
	type?: string;

	/**
	 * @deprecated Use presentation options
	 * Controls whether the output view of the running tasks is brought to front or not.
	 * See BaseTaskRunnerConfiguration#showOutput for details.
	 */
	showOutput?: string;

	/**
	 * @deprecated Use presentation options
	 * Controls whether the executed command is printed to the output windows as well.
	 */
	echoCommand?: boolean;

	/**
	 * @deprecated Use presentation instead
	 */
	terminal?: IPresentationOptionsConfig;

	/**
	 * @deprecated Use inline commands.
	 * See BaseTaskRunnerConfiguration#suppressTaskName for details.
	 */
	suppressTaskName?: boolean;

	/**
	 * Some commands require that the task argument is highlighted with a special
	 * prefix (e.g. /t: for msbuild). This property can be used to control such
	 * a prefix.
	 */
	taskSelector?: string;

	/**
	 * @deprecated use the task type instead.
	 * Specifies whether the command is a shell command and therefore must
	 * be executed in a shell interpreter (e.g. cmd.exe, bash, ...).
	 *
	 * Defaults to false if omitted.
	 */
	isShellCommand?: boolean | IShellConfiguration;
}

export type CommandString = string | string[] | { value: string | string[]; quoting: 'escape' | 'strong' | 'weak' };

export namespace CommandString {
	export function value(value: CommandString): string {
		if (Types.isString(value)) {
			return value;
		} else if (Types.isStringArray(value)) {
			return value.join(' ');
		} else {
			if (Types.isString(value.value)) {
				return value.value;
			} else {
				return value.value.join(' ');
			}
		}
	}
}

export interface IBaseCommandProperties {

	/**
	 * The command to be executed. Can be an external program or a shell
	 * command.
	 */
	command?: CommandString;

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: ICommandOptionsConfig;

	/**
	 * The arguments passed to the command or additional arguments passed to the
	 * command when using a global command.
	 */
	args?: CommandString[];
}


export interface ICommandProperties extends IBaseCommandProperties {

	/**
	 * Windows specific command properties
	 */
	windows?: IBaseCommandProperties;

	/**
	 * OSX specific command properties
	 */
	osx?: IBaseCommandProperties;

	/**
	 * linux specific command properties
	 */
	linux?: IBaseCommandProperties;
}

export interface IGroupKind {
	kind?: string;
	isDefault?: boolean | string;
}

export interface IConfigurationProperties {
	/**
	 * The task's name
	 */
	taskName?: string;

	/**
	 * The UI label used for the task.
	 */
	label?: string;

	/**
	 * An optional identifier which can be used to reference a task
	 * in a dependsOn or other attributes.
	 */
	identifier?: string;

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
	group?: string | IGroupKind;

	/**
	 * A description of the task.
	 */
	detail?: string;

	/**
	 * The other tasks the task depend on
	 */
	dependsOn?: string | ITaskIdentifier | Array<string | ITaskIdentifier>;

	/**
	 * The order the dependsOn tasks should be executed in.
	 */
	dependsOrder?: string;

	/**
	 * Controls the behavior of the used terminal
	 */
	presentation?: IPresentationOptionsConfig;

	/**
	 * Controls shell options.
	 */
	options?: ICommandOptionsConfig;

	/**
	 * The problem matcher(s) to use to capture problems in the tasks
	 * output.
	 */
	problemMatcher?: ProblemMatcherConfig.ProblemMatcherType;

	/**
	 * Task run options. Control run related properties.
	 */
	runOptions?: IRunOptionsConfig;

	/**
	 * The icon for this task in the terminal tabs list
	 */
	icon?: { id: string; color?: string };

	/**
	 * The icon's color in the terminal tabs list
	 */
	color?: string;

	/**
	 * Do not show this task in the run task quickpick
	 */
	hide?: boolean;
}

export interface ICustomTask extends ICommandProperties, IConfigurationProperties {
	/**
	 * Custom tasks have the type CUSTOMIZED_TASK_TYPE
	 */
	type?: string;

}

export interface IConfiguringTask extends IConfigurationProperties {
	/**
	 * The contributed type of the task
	 */
	type?: string;
}

/**
 * The base task runner configuration
 */
export interface IBaseTaskRunnerConfiguration {

	/**
	 * The command to be executed. Can be an external program or a shell
	 * command.
	 */
	command?: CommandString;

	/**
	 * @deprecated Use type instead
	 *
	 * Specifies whether the command is a shell command and therefore must
	 * be executed in a shell interpreter (e.g. cmd.exe, bash, ...).
	 *
	 * Defaults to false if omitted.
	 */
	isShellCommand?: boolean;

	/**
	 * The task type
	 */
	type?: string;

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: ICommandOptionsConfig;

	/**
	 * The arguments passed to the command. Can be omitted.
	 */
	args?: CommandString[];

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
	 * The group
	 */
	group?: string | IGroupKind;

	/**
	 * Controls the behavior of the used terminal
	 */
	presentation?: IPresentationOptionsConfig;

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
	 * The problem matcher(s) to used if a global command is executed (e.g. no tasks
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
	tasks?: Array<ICustomTask | IConfiguringTask>;

	/**
	 * Problem matcher declarations.
	 */
	declares?: ProblemMatcherConfig.INamedProblemMatcher[];

	/**
	 * Optional user input variables.
	 */
	inputs?: ConfiguredInput[];
}

/**
 * A configuration of an external build system. BuildConfiguration.buildSystem
 * must be set to 'program'
 */
export interface IExternalTaskRunnerConfiguration extends IBaseTaskRunnerConfiguration {

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
	windows?: IBaseTaskRunnerConfiguration;

	/**
	 * Mac specific task configuration
	 */
	osx?: IBaseTaskRunnerConfiguration;

	/**
	 * Linux specific task configuration
	 */
	linux?: IBaseTaskRunnerConfiguration;
}

enum ProblemMatcherKind {
	Unknown,
	String,
	ProblemMatcher,
	Array
}

type TaskConfigurationValueWithErrors<T> = {
	value?: T;
	errors?: string[];
};

const EMPTY_ARRAY: any[] = [];
Object.freeze(EMPTY_ARRAY);

function assignProperty<T, K extends keyof T>(target: T, source: Partial<T>, key: K) {
	const sourceAtKey = source[key];
	if (sourceAtKey !== undefined) {
		target[key] = sourceAtKey!;
	}
}

function fillProperty<T, K extends keyof T>(target: T, source: Partial<T>, key: K) {
	const sourceAtKey = source[key];
	if (target[key] === undefined && sourceAtKey !== undefined) {
		target[key] = sourceAtKey!;
	}
}


interface IParserType<T> {
	isEmpty(value: T | undefined): boolean;
	assignProperties(target: T | undefined, source: T | undefined): T | undefined;
	fillProperties(target: T | undefined, source: T | undefined): T | undefined;
	fillDefaults(value: T | undefined, context: IParseContext): T | undefined;
	freeze(value: T): Readonly<T> | undefined;
}

interface IMetaData<T, U> {
	property: keyof T;
	type?: IParserType<U>;
}


function _isEmpty<T>(this: void, value: T | undefined, properties: IMetaData<T, any>[] | undefined, allowEmptyArray: boolean = false): boolean {
	if (value === undefined || value === null || properties === undefined) {
		return true;
	}
	for (const meta of properties) {
		const property = value[meta.property];
		if (property !== undefined && property !== null) {
			if (meta.type !== undefined && !meta.type.isEmpty(property)) {
				return false;
			} else if (!Array.isArray(property) || (property.length > 0) || allowEmptyArray) {
				return false;
			}
		}
	}
	return true;
}

function _assignProperties<T>(this: void, target: T | undefined, source: T | undefined, properties: IMetaData<T, any>[]): T | undefined {
	if (!source || _isEmpty(source, properties)) {
		return target;
	}
	if (!target || _isEmpty(target, properties)) {
		return source;
	}
	for (const meta of properties) {
		const property = meta.property;
		let value: any;
		if (meta.type !== undefined) {
			value = meta.type.assignProperties(target[property], source[property]);
		} else {
			value = source[property];
		}
		if (value !== undefined && value !== null) {
			target[property] = value;
		}
	}
	return target;
}

function _fillProperties<T>(this: void, target: T | undefined, source: T | undefined, properties: IMetaData<T, any>[] | undefined, allowEmptyArray: boolean = false): T | undefined {
	if (!source || _isEmpty(source, properties)) {
		return target;
	}
	if (!target || _isEmpty(target, properties, allowEmptyArray)) {
		return source;
	}
	for (const meta of properties!) {
		const property = meta.property;
		let value: any;
		if (meta.type) {
			value = meta.type.fillProperties(target[property], source[property]);
		} else if (target[property] === undefined) {
			value = source[property];
		}
		if (value !== undefined && value !== null) {
			target[property] = value;
		}
	}
	return target;
}

function _fillDefaults<T>(this: void, target: T | undefined, defaults: T | undefined, properties: IMetaData<T, any>[], context: IParseContext): T | undefined {
	if (target && Object.isFrozen(target)) {
		return target;
	}
	if (target === undefined || target === null || defaults === undefined || defaults === null) {
		if (defaults !== undefined && defaults !== null) {
			return Objects.deepClone(defaults);
		} else {
			return undefined;
		}
	}
	for (const meta of properties) {
		const property = meta.property;
		if (target[property] !== undefined) {
			continue;
		}
		let value: any;
		if (meta.type) {
			value = meta.type.fillDefaults(target[property], context);
		} else {
			value = defaults[property];
		}

		if (value !== undefined && value !== null) {
			target[property] = value;
		}
	}
	return target;
}

function _freeze<T>(this: void, target: T, properties: IMetaData<T, any>[]): Readonly<T> | undefined {
	if (target === undefined || target === null) {
		return undefined;
	}
	if (Object.isFrozen(target)) {
		return target;
	}
	for (const meta of properties) {
		if (meta.type) {
			const value = target[meta.property];
			if (value) {
				meta.type.freeze(value);
			}
		}
	}
	Object.freeze(target);
	return target;
}

export namespace RunOnOptions {
	export function fromString(value: string | undefined): Tasks.RunOnOptions {
		if (!value) {
			return Tasks.RunOnOptions.default;
		}
		switch (value.toLowerCase()) {
			case 'folderopen':
				return Tasks.RunOnOptions.folderOpen;
			case 'default':
			default:
				return Tasks.RunOnOptions.default;
		}
	}
}

export namespace RunOptions {
	const properties: IMetaData<Tasks.IRunOptions, void>[] = [{ property: 'reevaluateOnRerun' }, { property: 'runOn' }, { property: 'instanceLimit' }];
	export function fromConfiguration(value: IRunOptionsConfig | undefined): Tasks.IRunOptions {
		return {
			reevaluateOnRerun: value ? value.reevaluateOnRerun : true,
			runOn: value ? RunOnOptions.fromString(value.runOn) : Tasks.RunOnOptions.default,
			instanceLimit: value ? value.instanceLimit : 1
		};
	}

	export function assignProperties(target: Tasks.IRunOptions, source: Tasks.IRunOptions | undefined): Tasks.IRunOptions {
		return _assignProperties(target, source, properties)!;
	}

	export function fillProperties(target: Tasks.IRunOptions, source: Tasks.IRunOptions | undefined): Tasks.IRunOptions {
		return _fillProperties(target, source, properties)!;
	}
}

export interface IParseContext {
	workspaceFolder: IWorkspaceFolder;
	workspace: IWorkspace | undefined;
	problemReporter: IProblemReporter;
	namedProblemMatchers: IStringDictionary<INamedProblemMatcher>;
	uuidMap: UUIDMap;
	engine: Tasks.ExecutionEngine;
	schemaVersion: Tasks.JsonSchemaVersion;
	platform: Platform;
	taskLoadIssues: string[];
	contextKeyService: IContextKeyService;
}


namespace ShellConfiguration {

	const properties: IMetaData<Tasks.IShellConfiguration, void>[] = [{ property: 'executable' }, { property: 'args' }, { property: 'quoting' }];

	export function is(value: any): value is IShellConfiguration {
		const candidate: IShellConfiguration = value;
		return candidate && (Types.isString(candidate.executable) || Types.isStringArray(candidate.args));
	}

	export function from(this: void, config: IShellConfiguration | undefined, context: IParseContext): Tasks.IShellConfiguration | undefined {
		if (!is(config)) {
			return undefined;
		}
		const result: IShellConfiguration = {};
		if (config.executable !== undefined) {
			result.executable = config.executable;
		}
		if (config.args !== undefined) {
			result.args = config.args.slice();
		}
		if (config.quoting !== undefined) {
			result.quoting = Objects.deepClone(config.quoting);
		}

		return result;
	}

	export function isEmpty(this: void, value: Tasks.IShellConfiguration): boolean {
		return _isEmpty(value, properties, true);
	}

	export function assignProperties(this: void, target: Tasks.IShellConfiguration | undefined, source: Tasks.IShellConfiguration | undefined): Tasks.IShellConfiguration | undefined {
		return _assignProperties(target, source, properties);
	}

	export function fillProperties(this: void, target: Tasks.IShellConfiguration, source: Tasks.IShellConfiguration): Tasks.IShellConfiguration | undefined {
		return _fillProperties(target, source, properties, true);
	}

	export function fillDefaults(this: void, value: Tasks.IShellConfiguration, context: IParseContext): Tasks.IShellConfiguration {
		return value;
	}

	export function freeze(this: void, value: Tasks.IShellConfiguration): Readonly<Tasks.IShellConfiguration> | undefined {
		if (!value) {
			return undefined;
		}
		return Object.freeze(value);
	}
}

namespace CommandOptions {

	const properties: IMetaData<Tasks.CommandOptions, Tasks.IShellConfiguration>[] = [{ property: 'cwd' }, { property: 'env' }, { property: 'shell', type: ShellConfiguration }];
	const defaults: ICommandOptionsConfig = { cwd: '${workspaceFolder}' };

	export function from(this: void, options: ICommandOptionsConfig, context: IParseContext): Tasks.CommandOptions | undefined {
		const result: Tasks.CommandOptions = {};
		if (options.cwd !== undefined) {
			if (Types.isString(options.cwd)) {
				result.cwd = options.cwd;
			} else {
				context.taskLoadIssues.push(nls.localize('ConfigurationParser.invalidCWD', 'Warning: options.cwd must be of type string. Ignoring value {0}\n', options.cwd));
			}
		}
		if (options.env !== undefined) {
			result.env = Objects.deepClone(options.env);
		}
		result.shell = ShellConfiguration.from(options.shell, context);
		return isEmpty(result) ? undefined : result;
	}

	export function isEmpty(value: Tasks.CommandOptions | undefined): boolean {
		return _isEmpty(value, properties);
	}

	export function assignProperties(target: Tasks.CommandOptions | undefined, source: Tasks.CommandOptions | undefined): Tasks.CommandOptions | undefined {
		if ((source === undefined) || isEmpty(source)) {
			return target;
		}
		if ((target === undefined) || isEmpty(target)) {
			return source;
		}
		assignProperty(target, source, 'cwd');
		if (target.env === undefined) {
			target.env = source.env;
		} else if (source.env !== undefined) {
			const env: { [key: string]: string } = Object.create(null);
			if (target.env !== undefined) {
				Object.keys(target.env).forEach(key => env[key] = target.env![key]);
			}
			if (source.env !== undefined) {
				Object.keys(source.env).forEach(key => env[key] = source.env![key]);
			}
			target.env = env;
		}
		target.shell = ShellConfiguration.assignProperties(target.shell, source.shell);
		return target;
	}

	export function fillProperties(target: Tasks.CommandOptions | undefined, source: Tasks.CommandOptions | undefined): Tasks.CommandOptions | undefined {
		return _fillProperties(target, source, properties);
	}

	export function fillDefaults(value: Tasks.CommandOptions | undefined, context: IParseContext): Tasks.CommandOptions | undefined {
		return _fillDefaults(value, defaults, properties, context);
	}

	export function freeze(value: Tasks.CommandOptions): Readonly<Tasks.CommandOptions> | undefined {
		return _freeze(value, properties);
	}
}

namespace CommandConfiguration {

	export namespace PresentationOptions {
		const properties: IMetaData<Tasks.IPresentationOptions, void>[] = [{ property: 'echo' }, { property: 'reveal' }, { property: 'revealProblems' }, { property: 'focus' }, { property: 'panel' }, { property: 'showReuseMessage' }, { property: 'clear' }, { property: 'group' }, { property: 'close' }];

		interface IPresentationOptionsShape extends ILegacyCommandProperties {
			presentation?: IPresentationOptionsConfig;
		}

		export function from(this: void, config: IPresentationOptionsShape, context: IParseContext): Tasks.IPresentationOptions | undefined {
			let echo: boolean;
			let reveal: Tasks.RevealKind;
			let revealProblems: Tasks.RevealProblemKind;
			let focus: boolean;
			let panel: Tasks.PanelKind;
			let showReuseMessage: boolean;
			let clear: boolean;
			let group: string | undefined;
			let close: boolean | undefined;
			let hasProps = false;
			if (Types.isBoolean(config.echoCommand)) {
				echo = config.echoCommand;
				hasProps = true;
			}
			if (Types.isString(config.showOutput)) {
				reveal = Tasks.RevealKind.fromString(config.showOutput);
				hasProps = true;
			}
			const presentation = config.presentation || config.terminal;
			if (presentation) {
				if (Types.isBoolean(presentation.echo)) {
					echo = presentation.echo;
				}
				if (Types.isString(presentation.reveal)) {
					reveal = Tasks.RevealKind.fromString(presentation.reveal);
				}
				if (Types.isString(presentation.revealProblems)) {
					revealProblems = Tasks.RevealProblemKind.fromString(presentation.revealProblems);
				}
				if (Types.isBoolean(presentation.focus)) {
					focus = presentation.focus;
				}
				if (Types.isString(presentation.panel)) {
					panel = Tasks.PanelKind.fromString(presentation.panel);
				}
				if (Types.isBoolean(presentation.showReuseMessage)) {
					showReuseMessage = presentation.showReuseMessage;
				}
				if (Types.isBoolean(presentation.clear)) {
					clear = presentation.clear;
				}
				if (Types.isString(presentation.group)) {
					group = presentation.group;
				}
				if (Types.isBoolean(presentation.close)) {
					close = presentation.close;
				}
				hasProps = true;
			}
			if (!hasProps) {
				return undefined;
			}
			return { echo: echo!, reveal: reveal!, revealProblems: revealProblems!, focus: focus!, panel: panel!, showReuseMessage: showReuseMessage!, clear: clear!, group, close: close };
		}

		export function assignProperties(target: Tasks.IPresentationOptions, source: Tasks.IPresentationOptions | undefined): Tasks.IPresentationOptions | undefined {
			return _assignProperties(target, source, properties);
		}

		export function fillProperties(target: Tasks.IPresentationOptions, source: Tasks.IPresentationOptions | undefined): Tasks.IPresentationOptions | undefined {
			return _fillProperties(target, source, properties);
		}

		export function fillDefaults(value: Tasks.IPresentationOptions, context: IParseContext): Tasks.IPresentationOptions | undefined {
			const defaultEcho = context.engine === Tasks.ExecutionEngine.Terminal ? true : false;
			return _fillDefaults(value, { echo: defaultEcho, reveal: Tasks.RevealKind.Always, revealProblems: Tasks.RevealProblemKind.Never, focus: false, panel: Tasks.PanelKind.Shared, showReuseMessage: true, clear: false }, properties, context);
		}

		export function freeze(value: Tasks.IPresentationOptions): Readonly<Tasks.IPresentationOptions> | undefined {
			return _freeze(value, properties);
		}

		export function isEmpty(this: void, value: Tasks.IPresentationOptions): boolean {
			return _isEmpty(value, properties);
		}
	}

	namespace ShellString {
		export function from(this: void, value: CommandString | undefined): Tasks.CommandString | undefined {
			if (value === undefined || value === null) {
				return undefined;
			}
			if (Types.isString(value)) {
				return value;
			} else if (Types.isStringArray(value)) {
				return value.join(' ');
			} else {
				const quoting = Tasks.ShellQuoting.from(value.quoting);
				const result = Types.isString(value.value) ? value.value : Types.isStringArray(value.value) ? value.value.join(' ') : undefined;
				if (result) {
					return {
						value: result,
						quoting: quoting
					};
				} else {
					return undefined;
				}
			}
		}
	}

	interface IBaseCommandConfigurationShape extends IBaseCommandProperties, ILegacyCommandProperties {
	}

	interface ICommandConfigurationShape extends IBaseCommandConfigurationShape {
		windows?: IBaseCommandConfigurationShape;
		osx?: IBaseCommandConfigurationShape;
		linux?: IBaseCommandConfigurationShape;
	}

	const properties: IMetaData<Tasks.ICommandConfiguration, any>[] = [
		{ property: 'runtime' }, { property: 'name' }, { property: 'options', type: CommandOptions },
		{ property: 'args' }, { property: 'taskSelector' }, { property: 'suppressTaskName' },
		{ property: 'presentation', type: PresentationOptions }
	];

	export function from(this: void, config: ICommandConfigurationShape, context: IParseContext): Tasks.ICommandConfiguration | undefined {
		let result: Tasks.ICommandConfiguration = fromBase(config, context)!;

		let osConfig: Tasks.ICommandConfiguration | undefined = undefined;
		if (config.windows && context.platform === Platform.Windows) {
			osConfig = fromBase(config.windows, context);
		} else if (config.osx && context.platform === Platform.Mac) {
			osConfig = fromBase(config.osx, context);
		} else if (config.linux && context.platform === Platform.Linux) {
			osConfig = fromBase(config.linux, context);
		}
		if (osConfig) {
			result = assignProperties(result, osConfig, context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0);
		}
		return isEmpty(result) ? undefined : result;
	}

	function fromBase(this: void, config: IBaseCommandConfigurationShape, context: IParseContext): Tasks.ICommandConfiguration | undefined {
		const name: Tasks.CommandString | undefined = ShellString.from(config.command);
		let runtime: Tasks.RuntimeType;
		if (Types.isString(config.type)) {
			if (config.type === 'shell' || config.type === 'process') {
				runtime = Tasks.RuntimeType.fromString(config.type);
			}
		}
		if (Types.isBoolean(config.isShellCommand) || ShellConfiguration.is(config.isShellCommand)) {
			runtime = Tasks.RuntimeType.Shell;
		} else if (config.isShellCommand !== undefined) {
			runtime = !!config.isShellCommand ? Tasks.RuntimeType.Shell : Tasks.RuntimeType.Process;
		}

		const result: Tasks.ICommandConfiguration = {
			name: name,
			runtime: runtime!,
			presentation: PresentationOptions.from(config, context)!
		};

		if (config.args !== undefined) {
			result.args = [];
			for (const arg of config.args) {
				const converted = ShellString.from(arg);
				if (converted !== undefined) {
					result.args.push(converted);
				} else {
					context.taskLoadIssues.push(
						nls.localize(
							'ConfigurationParser.inValidArg',
							'Error: command argument must either be a string or a quoted string. Provided value is:\n{0}',
							arg ? JSON.stringify(arg, undefined, 4) : 'undefined'
						));
				}
			}
		}
		if (config.options !== undefined) {
			result.options = CommandOptions.from(config.options, context);
			if (result.options && result.options.shell === undefined && ShellConfiguration.is(config.isShellCommand)) {
				result.options.shell = ShellConfiguration.from(config.isShellCommand, context);
				if (context.engine !== Tasks.ExecutionEngine.Terminal) {
					context.taskLoadIssues.push(nls.localize('ConfigurationParser.noShell', 'Warning: shell configuration is only supported when executing tasks in the terminal.'));
				}
			}
		}

		if (Types.isString(config.taskSelector)) {
			result.taskSelector = config.taskSelector;
		}
		if (Types.isBoolean(config.suppressTaskName)) {
			result.suppressTaskName = config.suppressTaskName;
		}

		return isEmpty(result) ? undefined : result;
	}

	export function hasCommand(value: Tasks.ICommandConfiguration): boolean {
		return value && !!value.name;
	}

	export function isEmpty(value: Tasks.ICommandConfiguration | undefined): boolean {
		return _isEmpty(value, properties);
	}

	export function assignProperties(target: Tasks.ICommandConfiguration, source: Tasks.ICommandConfiguration, overwriteArgs: boolean): Tasks.ICommandConfiguration {
		if (isEmpty(source)) {
			return target;
		}
		if (isEmpty(target)) {
			return source;
		}
		assignProperty(target, source, 'name');
		assignProperty(target, source, 'runtime');
		assignProperty(target, source, 'taskSelector');
		assignProperty(target, source, 'suppressTaskName');
		if (source.args !== undefined) {
			if (target.args === undefined || overwriteArgs) {
				target.args = source.args;
			} else {
				target.args = target.args.concat(source.args);
			}
		}
		target.presentation = PresentationOptions.assignProperties(target.presentation!, source.presentation)!;
		target.options = CommandOptions.assignProperties(target.options, source.options);
		return target;
	}

	export function fillProperties(target: Tasks.ICommandConfiguration, source: Tasks.ICommandConfiguration): Tasks.ICommandConfiguration | undefined {
		return _fillProperties(target, source, properties);
	}

	export function fillGlobals(target: Tasks.ICommandConfiguration, source: Tasks.ICommandConfiguration | undefined, taskName: string | undefined): Tasks.ICommandConfiguration {
		if ((source === undefined) || isEmpty(source)) {
			return target;
		}
		target = target || {
			name: undefined,
			runtime: undefined,
			presentation: undefined
		};
		if (target.name === undefined) {
			fillProperty(target, source, 'name');
			fillProperty(target, source, 'taskSelector');
			fillProperty(target, source, 'suppressTaskName');
			let args: Tasks.CommandString[] = source.args ? source.args.slice() : [];
			if (!target.suppressTaskName && taskName) {
				if (target.taskSelector !== undefined) {
					args.push(target.taskSelector + taskName);
				} else {
					args.push(taskName);
				}
			}
			if (target.args) {
				args = args.concat(target.args);
			}
			target.args = args;
		}
		fillProperty(target, source, 'runtime');

		target.presentation = PresentationOptions.fillProperties(target.presentation!, source.presentation)!;
		target.options = CommandOptions.fillProperties(target.options, source.options);

		return target;
	}

	export function fillDefaults(value: Tasks.ICommandConfiguration | undefined, context: IParseContext): void {
		if (!value || Object.isFrozen(value)) {
			return;
		}
		if (value.name !== undefined && value.runtime === undefined) {
			value.runtime = Tasks.RuntimeType.Process;
		}
		value.presentation = PresentationOptions.fillDefaults(value.presentation!, context)!;
		if (!isEmpty(value)) {
			value.options = CommandOptions.fillDefaults(value.options, context);
		}
		if (value.args === undefined) {
			value.args = EMPTY_ARRAY;
		}
		if (value.suppressTaskName === undefined) {
			value.suppressTaskName = (context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0);
		}
	}

	export function freeze(value: Tasks.ICommandConfiguration): Readonly<Tasks.ICommandConfiguration> | undefined {
		return _freeze(value, properties);
	}
}

export namespace ProblemMatcherConverter {

	export function namedFrom(this: void, declares: ProblemMatcherConfig.INamedProblemMatcher[] | undefined, context: IParseContext): IStringDictionary<INamedProblemMatcher> {
		const result: IStringDictionary<INamedProblemMatcher> = Object.create(null);

		if (!Array.isArray(declares)) {
			return result;
		}
		(<ProblemMatcherConfig.INamedProblemMatcher[]>declares).forEach((value) => {
			const namedProblemMatcher = (new ProblemMatcherParser(context.problemReporter)).parse(value);
			if (isNamedProblemMatcher(namedProblemMatcher)) {
				result[namedProblemMatcher.name] = namedProblemMatcher;
			} else {
				context.problemReporter.error(nls.localize('ConfigurationParser.noName', 'Error: Problem Matcher in declare scope must have a name:\n{0}\n', JSON.stringify(value, undefined, 4)));
			}
		});
		return result;
	}

	export function fromWithOsConfig(this: void, external: IConfigurationProperties & { [key: string]: any }, context: IParseContext): TaskConfigurationValueWithErrors<ProblemMatcher[]> {
		let result: TaskConfigurationValueWithErrors<ProblemMatcher[]> = {};
		if (external.windows && external.windows.problemMatcher && context.platform === Platform.Windows) {
			result = from(external.windows.problemMatcher, context);
		} else if (external.osx && external.osx.problemMatcher && context.platform === Platform.Mac) {
			result = from(external.osx.problemMatcher, context);
		} else if (external.linux && external.linux.problemMatcher && context.platform === Platform.Linux) {
			result = from(external.linux.problemMatcher, context);
		} else if (external.problemMatcher) {
			result = from(external.problemMatcher, context);
		}
		return result;
	}

	export function from(this: void, config: ProblemMatcherConfig.ProblemMatcherType | undefined, context: IParseContext): TaskConfigurationValueWithErrors<ProblemMatcher[]> {
		const result: ProblemMatcher[] = [];
		if (config === undefined) {
			return { value: result };
		}
		const errors: string[] = [];
		function addResult(matcher: TaskConfigurationValueWithErrors<ProblemMatcher>) {
			if (matcher.value) {
				result.push(matcher.value);
			}
			if (matcher.errors) {
				errors.push(...matcher.errors);
			}
		}
		const kind = getProblemMatcherKind(config);
		if (kind === ProblemMatcherKind.Unknown) {
			const error = nls.localize(
				'ConfigurationParser.unknownMatcherKind',
				'Warning: the defined problem matcher is unknown. Supported types are string | ProblemMatcher | Array<string | ProblemMatcher>.\n{0}\n',
				JSON.stringify(config, null, 4));
			context.problemReporter.warn(error);
		} else if (kind === ProblemMatcherKind.String || kind === ProblemMatcherKind.ProblemMatcher) {
			addResult(resolveProblemMatcher(config as ProblemMatcherConfig.ProblemMatcher, context));
		} else if (kind === ProblemMatcherKind.Array) {
			const problemMatchers = <(string | ProblemMatcherConfig.ProblemMatcher)[]>config;
			problemMatchers.forEach(problemMatcher => {
				addResult(resolveProblemMatcher(problemMatcher, context));
			});
		}
		return { value: result, errors };
	}

	function getProblemMatcherKind(this: void, value: ProblemMatcherConfig.ProblemMatcherType): ProblemMatcherKind {
		if (Types.isString(value)) {
			return ProblemMatcherKind.String;
		} else if (Array.isArray(value)) {
			return ProblemMatcherKind.Array;
		} else if (!Types.isUndefined(value)) {
			return ProblemMatcherKind.ProblemMatcher;
		} else {
			return ProblemMatcherKind.Unknown;
		}
	}

	function resolveProblemMatcher(this: void, value: string | ProblemMatcherConfig.ProblemMatcher, context: IParseContext): TaskConfigurationValueWithErrors<ProblemMatcher> {
		if (Types.isString(value)) {
			let variableName = <string>value;
			if (variableName.length > 1 && variableName[0] === '$') {
				variableName = variableName.substring(1);
				const global = ProblemMatcherRegistry.get(variableName);
				if (global) {
					return { value: Objects.deepClone(global) };
				}
				let localProblemMatcher: ProblemMatcher & Partial<INamedProblemMatcher> = context.namedProblemMatchers[variableName];
				if (localProblemMatcher) {
					localProblemMatcher = Objects.deepClone(localProblemMatcher);
					// remove the name
					delete localProblemMatcher.name;
					return { value: localProblemMatcher };
				}
			}
			return { errors: [nls.localize('ConfigurationParser.invalidVariableReference', 'Error: Invalid problemMatcher reference: {0}\n', value)] };
		} else {
			const json = <ProblemMatcherConfig.ProblemMatcher>value;
			return { value: new ProblemMatcherParser(context.problemReporter).parse(json) };
		}
	}
}

export namespace GroupKind {
	export function from(this: void, external: string | IGroupKind | undefined): Tasks.TaskGroup | undefined {
		if (external === undefined) {
			return undefined;
		} else if (Types.isString(external) && Tasks.TaskGroup.is(external)) {
			return { _id: external, isDefault: false };
		} else if (Types.isString(external.kind) && Tasks.TaskGroup.is(external.kind)) {
			const group: string = external.kind;
			const isDefault: boolean | string = Types.isUndefined(external.isDefault) ? false : external.isDefault;

			return { _id: group, isDefault };
		}
		return undefined;
	}

	export function to(group: Tasks.TaskGroup | string): IGroupKind | string {
		if (Types.isString(group)) {
			return group;
		} else if (!group.isDefault) {
			return group._id;
		}
		return {
			kind: group._id,
			isDefault: group.isDefault,
		};
	}
}

namespace TaskDependency {
	function uriFromSource(context: IParseContext, source: TaskConfigSource): URI | string {
		switch (source) {
			case TaskConfigSource.User: return Tasks.USER_TASKS_GROUP_KEY;
			case TaskConfigSource.TasksJson: return context.workspaceFolder.uri;
			default: return context.workspace && context.workspace.configuration ? context.workspace.configuration : context.workspaceFolder.uri;
		}
	}

	export function from(this: void, external: string | ITaskIdentifier, context: IParseContext, source: TaskConfigSource): Tasks.ITaskDependency | undefined {
		if (Types.isString(external)) {
			return { uri: uriFromSource(context, source), task: external };
		} else if (ITaskIdentifier.is(external)) {
			return {
				uri: uriFromSource(context, source),
				task: Tasks.TaskDefinition.createTaskIdentifier(external as Tasks.ITaskIdentifier, context.problemReporter)
			};
		} else {
			return undefined;
		}
	}
}

namespace DependsOrder {
	export function from(order: string | undefined): Tasks.DependsOrder {
		switch (order) {
			case Tasks.DependsOrder.sequence:
				return Tasks.DependsOrder.sequence;
			case Tasks.DependsOrder.parallel:
			default:
				return Tasks.DependsOrder.parallel;
		}
	}
}

namespace ConfigurationProperties {

	const properties: IMetaData<Tasks.IConfigurationProperties, any>[] = [
		{ property: 'name' },
		{ property: 'identifier' },
		{ property: 'group' },
		{ property: 'isBackground' },
		{ property: 'promptOnClose' },
		{ property: 'dependsOn' },
		{ property: 'presentation', type: CommandConfiguration.PresentationOptions },
		{ property: 'problemMatchers' },
		{ property: 'options' },
		{ property: 'icon' },
		{ property: 'hide' }
	];

	export function from(this: void, external: IConfigurationProperties & { [key: string]: any }, context: IParseContext,
		includeCommandOptions: boolean, source: TaskConfigSource, properties?: IJSONSchemaMap): TaskConfigurationValueWithErrors<Tasks.IConfigurationProperties> {
		if (!external) {
			return {};
		}
		const result: Tasks.IConfigurationProperties & { [key: string]: any } = {};

		if (properties) {
			for (const propertyName of Object.keys(properties)) {
				if (external[propertyName] !== undefined) {
					result[propertyName] = Objects.deepClone(external[propertyName]);
				}
			}
		}

		if (Types.isString(external.taskName)) {
			result.name = external.taskName;
		}
		if (Types.isString(external.label) && context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
			result.name = external.label;
		}
		if (Types.isString(external.identifier)) {
			result.identifier = external.identifier;
		}
		result.icon = external.icon;
		result.hide = external.hide;
		if (external.isBackground !== undefined) {
			result.isBackground = !!external.isBackground;
		}
		if (external.promptOnClose !== undefined) {
			result.promptOnClose = !!external.promptOnClose;
		}
		result.group = GroupKind.from(external.group);
		if (external.dependsOn !== undefined) {
			if (Array.isArray(external.dependsOn)) {
				result.dependsOn = external.dependsOn.reduce((dependencies: Tasks.ITaskDependency[], item): Tasks.ITaskDependency[] => {
					const dependency = TaskDependency.from(item, context, source);
					if (dependency) {
						dependencies.push(dependency);
					}
					return dependencies;
				}, []);
			} else {
				const dependsOnValue = TaskDependency.from(external.dependsOn, context, source);
				result.dependsOn = dependsOnValue ? [dependsOnValue] : undefined;
			}
		}
		result.dependsOrder = DependsOrder.from(external.dependsOrder);
		if (includeCommandOptions && (external.presentation !== undefined || (external as ILegacyCommandProperties).terminal !== undefined)) {
			result.presentation = CommandConfiguration.PresentationOptions.from(external, context);
		}
		if (includeCommandOptions && (external.options !== undefined)) {
			result.options = CommandOptions.from(external.options, context);
		}
		const configProblemMatcher = ProblemMatcherConverter.fromWithOsConfig(external, context);
		if (configProblemMatcher.value !== undefined) {
			result.problemMatchers = configProblemMatcher.value;
		}
		if (external.detail) {
			result.detail = external.detail;
		}
		return isEmpty(result) ? {} : { value: result, errors: configProblemMatcher.errors };
	}

	export function isEmpty(this: void, value: Tasks.IConfigurationProperties): boolean {
		return _isEmpty(value, properties);
	}
}
const label = 'Workspace';

namespace ConfiguringTask {

	const grunt = 'grunt.';
	const jake = 'jake.';
	const gulp = 'gulp.';
	const npm = 'vscode.npm.';
	const typescript = 'vscode.typescript.';

	interface ICustomizeShape {
		customize: string;
	}

	export function from(this: void, external: IConfiguringTask, context: IParseContext, index: number, source: TaskConfigSource, registry?: Partial<ITaskDefinitionRegistry>): Tasks.ConfiguringTask | undefined {
		if (!external) {
			return undefined;
		}
		const type = external.type;
		const customize = (external as ICustomizeShape).customize;
		if (!type && !customize) {
			context.problemReporter.error(nls.localize('ConfigurationParser.noTaskType', 'Error: tasks configuration must have a type property. The configuration will be ignored.\n{0}\n', JSON.stringify(external, null, 4)));
			return undefined;
		}
		const typeDeclaration = type ? registry?.get?.(type) || TaskDefinitionRegistry.get(type) : undefined;
		if (!typeDeclaration) {
			const message = nls.localize('ConfigurationParser.noTypeDefinition', 'Error: there is no registered task type \'{0}\'. Did you miss installing an extension that provides a corresponding task provider?', type);
			context.problemReporter.error(message);
			return undefined;
		}
		let identifier: Tasks.ITaskIdentifier | undefined;
		if (Types.isString(customize)) {
			if (customize.indexOf(grunt) === 0) {
				identifier = { type: 'grunt', task: customize.substring(grunt.length) };
			} else if (customize.indexOf(jake) === 0) {
				identifier = { type: 'jake', task: customize.substring(jake.length) };
			} else if (customize.indexOf(gulp) === 0) {
				identifier = { type: 'gulp', task: customize.substring(gulp.length) };
			} else if (customize.indexOf(npm) === 0) {
				identifier = { type: 'npm', script: customize.substring(npm.length + 4) };
			} else if (customize.indexOf(typescript) === 0) {
				identifier = { type: 'typescript', tsconfig: customize.substring(typescript.length + 6) };
			}
		} else {
			if (Types.isString(external.type)) {
				identifier = external as Tasks.ITaskIdentifier;
			}
		}
		if (identifier === undefined) {
			context.problemReporter.error(nls.localize(
				'ConfigurationParser.missingType',
				'Error: the task configuration \'{0}\' is missing the required property \'type\'. The task configuration will be ignored.', JSON.stringify(external, undefined, 0)
			));
			return undefined;
		}
		const taskIdentifier: Tasks.KeyedTaskIdentifier | undefined = Tasks.TaskDefinition.createTaskIdentifier(identifier, context.problemReporter);
		if (taskIdentifier === undefined) {
			context.problemReporter.error(nls.localize(
				'ConfigurationParser.incorrectType',
				'Error: the task configuration \'{0}\' is using an unknown type. The task configuration will be ignored.', JSON.stringify(external, undefined, 0)
			));
			return undefined;
		}
		const configElement: Tasks.ITaskSourceConfigElement = {
			workspaceFolder: context.workspaceFolder,
			file: '.vscode/tasks.json',
			index,
			element: external
		};
		let taskSource: Tasks.FileBasedTaskSource;
		switch (source) {
			case TaskConfigSource.User: {
				taskSource = { kind: Tasks.TaskSourceKind.User, config: configElement, label };
				break;
			}
			case TaskConfigSource.WorkspaceFile: {
				taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: configElement, label };
				break;
			}
			default: {
				taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: configElement, label };
				break;
			}
		}
		const result: Tasks.ConfiguringTask = new Tasks.ConfiguringTask(
			`${typeDeclaration.extensionId}.${taskIdentifier._key}`,
			taskSource,
			undefined,
			type,
			taskIdentifier,
			RunOptions.fromConfiguration(external.runOptions),
			{ hide: external.hide }
		);
		const configuration = ConfigurationProperties.from(external, context, true, source, typeDeclaration.properties);
		result.addTaskLoadMessages(configuration.errors);
		if (configuration.value) {
			result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
			if (result.configurationProperties.name) {
				result._label = result.configurationProperties.name;
			} else {
				let label = result.configures.type;
				if (typeDeclaration.required && typeDeclaration.required.length > 0) {
					for (const required of typeDeclaration.required) {
						const value = result.configures[required];
						if (value) {
							label = label + ': ' + value;
							break;
						}
					}
				}
				result._label = label;
			}
			if (!result.configurationProperties.identifier) {
				result.configurationProperties.identifier = taskIdentifier._key;
			}
		}
		return result;
	}
}

namespace CustomTask {
	export function from(this: void, external: ICustomTask, context: IParseContext, index: number, source: TaskConfigSource): Tasks.CustomTask | undefined {
		if (!external) {
			return undefined;
		}
		let type = external.type;
		if (type === undefined || type === null) {
			type = Tasks.CUSTOMIZED_TASK_TYPE;
		}
		if (type !== Tasks.CUSTOMIZED_TASK_TYPE && type !== 'shell' && type !== 'process') {
			context.problemReporter.error(nls.localize('ConfigurationParser.notCustom', 'Error: tasks is not declared as a custom task. The configuration will be ignored.\n{0}\n', JSON.stringify(external, null, 4)));
			return undefined;
		}
		let taskName = external.taskName;
		if (Types.isString(external.label) && context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
			taskName = external.label;
		}
		if (!taskName) {
			context.problemReporter.error(nls.localize('ConfigurationParser.noTaskName', 'Error: a task must provide a label property. The task will be ignored.\n{0}\n', JSON.stringify(external, null, 4)));
			return undefined;
		}

		let taskSource: Tasks.FileBasedTaskSource;
		switch (source) {
			case TaskConfigSource.User: {
				taskSource = { kind: Tasks.TaskSourceKind.User, config: { index, element: external, file: '.vscode/tasks.json', workspaceFolder: context.workspaceFolder }, label };
				break;
			}
			case TaskConfigSource.WorkspaceFile: {
				taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: { index, element: external, file: '.vscode/tasks.json', workspaceFolder: context.workspaceFolder, workspace: context.workspace }, label };
				break;
			}
			default: {
				taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: { index, element: external, file: '.vscode/tasks.json', workspaceFolder: context.workspaceFolder }, label };
				break;
			}
		}

		const result: Tasks.CustomTask = new Tasks.CustomTask(
			context.uuidMap.getUUID(taskName),
			taskSource,
			taskName,
			Tasks.CUSTOMIZED_TASK_TYPE,
			undefined,
			false,
			RunOptions.fromConfiguration(external.runOptions),
			{
				name: taskName,
				identifier: taskName,
			}
		);
		const configuration = ConfigurationProperties.from(external, context, false, source);
		result.addTaskLoadMessages(configuration.errors);
		if (configuration.value) {
			result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
		}
		const supportLegacy: boolean = true; //context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
		if (supportLegacy) {
			const legacy: ILegacyTaskProperties = external as ILegacyTaskProperties;
			if (result.configurationProperties.isBackground === undefined && legacy.isWatching !== undefined) {
				result.configurationProperties.isBackground = !!legacy.isWatching;
			}
			if (result.configurationProperties.group === undefined) {
				if (legacy.isBuildCommand === true) {
					result.configurationProperties.group = Tasks.TaskGroup.Build;
				} else if (legacy.isTestCommand === true) {
					result.configurationProperties.group = Tasks.TaskGroup.Test;
				}
			}
		}
		const command: Tasks.ICommandConfiguration = CommandConfiguration.from(external, context)!;
		if (command) {
			result.command = command;
		}
		if (external.command !== undefined) {
			// if the task has its own command then we suppress the
			// task name by default.
			command.suppressTaskName = true;
		}
		return result;
	}

	export function fillGlobals(task: Tasks.CustomTask, globals: IGlobals): void {
		// We only merge a command from a global definition if there is no dependsOn
		// or there is a dependsOn and a defined command.
		if (CommandConfiguration.hasCommand(task.command) || task.configurationProperties.dependsOn === undefined) {
			task.command = CommandConfiguration.fillGlobals(task.command, globals.command, task.configurationProperties.name);
		}
		if (task.configurationProperties.problemMatchers === undefined && globals.problemMatcher !== undefined) {
			task.configurationProperties.problemMatchers = Objects.deepClone(globals.problemMatcher);
			task.hasDefinedMatchers = true;
		}
		// promptOnClose is inferred from isBackground if available
		if (task.configurationProperties.promptOnClose === undefined && task.configurationProperties.isBackground === undefined && globals.promptOnClose !== undefined) {
			task.configurationProperties.promptOnClose = globals.promptOnClose;
		}
	}

	export function fillDefaults(task: Tasks.CustomTask, context: IParseContext): void {
		CommandConfiguration.fillDefaults(task.command, context);
		if (task.configurationProperties.promptOnClose === undefined) {
			task.configurationProperties.promptOnClose = task.configurationProperties.isBackground !== undefined ? !task.configurationProperties.isBackground : true;
		}
		if (task.configurationProperties.isBackground === undefined) {
			task.configurationProperties.isBackground = false;
		}
		if (task.configurationProperties.problemMatchers === undefined) {
			task.configurationProperties.problemMatchers = EMPTY_ARRAY;
		}
	}

	export function createCustomTask(contributedTask: Tasks.ContributedTask, configuredProps: Tasks.ConfiguringTask | Tasks.CustomTask): Tasks.CustomTask {
		const result: Tasks.CustomTask = new Tasks.CustomTask(
			configuredProps._id,
			Object.assign({}, configuredProps._source, { customizes: contributedTask.defines }),
			configuredProps.configurationProperties.name || contributedTask._label,
			Tasks.CUSTOMIZED_TASK_TYPE,
			contributedTask.command,
			false,
			contributedTask.runOptions,
			{
				name: configuredProps.configurationProperties.name || contributedTask.configurationProperties.name,
				identifier: configuredProps.configurationProperties.identifier || contributedTask.configurationProperties.identifier,
				icon: configuredProps.configurationProperties.icon,
				hide: configuredProps.configurationProperties.hide
			},

		);
		result.addTaskLoadMessages(configuredProps.taskLoadMessages);
		const resultConfigProps: Tasks.IConfigurationProperties = result.configurationProperties;

		assignProperty(resultConfigProps, configuredProps.configurationProperties, 'group');
		assignProperty(resultConfigProps, configuredProps.configurationProperties, 'isBackground');
		assignProperty(resultConfigProps, configuredProps.configurationProperties, 'dependsOn');
		assignProperty(resultConfigProps, configuredProps.configurationProperties, 'problemMatchers');
		assignProperty(resultConfigProps, configuredProps.configurationProperties, 'promptOnClose');
		assignProperty(resultConfigProps, configuredProps.configurationProperties, 'detail');
		result.command.presentation = CommandConfiguration.PresentationOptions.assignProperties(
			result.command.presentation!, configuredProps.configurationProperties.presentation)!;
		result.command.options = CommandOptions.assignProperties(result.command.options, configuredProps.configurationProperties.options);
		result.runOptions = RunOptions.assignProperties(result.runOptions, configuredProps.runOptions);

		const contributedConfigProps: Tasks.IConfigurationProperties = contributedTask.configurationProperties;
		fillProperty(resultConfigProps, contributedConfigProps, 'group');
		fillProperty(resultConfigProps, contributedConfigProps, 'isBackground');
		fillProperty(resultConfigProps, contributedConfigProps, 'dependsOn');
		fillProperty(resultConfigProps, contributedConfigProps, 'problemMatchers');
		fillProperty(resultConfigProps, contributedConfigProps, 'promptOnClose');
		fillProperty(resultConfigProps, contributedConfigProps, 'detail');
		result.command.presentation = CommandConfiguration.PresentationOptions.fillProperties(
			result.command.presentation, contributedConfigProps.presentation)!;
		result.command.options = CommandOptions.fillProperties(result.command.options, contributedConfigProps.options);
		result.runOptions = RunOptions.fillProperties(result.runOptions, contributedTask.runOptions);

		if (contributedTask.hasDefinedMatchers === true) {
			result.hasDefinedMatchers = true;
		}

		return result;
	}
}

export interface ITaskParseResult {
	custom: Tasks.CustomTask[];
	configured: Tasks.ConfiguringTask[];
}

export namespace TaskParser {

	function isCustomTask(value: ICustomTask | IConfiguringTask): value is ICustomTask {
		const type = value.type;
		const customize = (value as any).customize;
		return customize === undefined && (type === undefined || type === null || type === Tasks.CUSTOMIZED_TASK_TYPE || type === 'shell' || type === 'process');
	}

	const builtinTypeContextMap: IStringDictionary<RawContextKey<boolean>> = {
		shell: ShellExecutionSupportedContext,
		process: ProcessExecutionSupportedContext
	};

	export function from(this: void, externals: Array<ICustomTask | IConfiguringTask> | undefined, globals: IGlobals, context: IParseContext, source: TaskConfigSource, registry?: Partial<ITaskDefinitionRegistry>): ITaskParseResult {
		const result: ITaskParseResult = { custom: [], configured: [] };
		if (!externals) {
			return result;
		}
		const defaultBuildTask: { task: Tasks.Task | undefined; rank: number } = { task: undefined, rank: -1 };
		const defaultTestTask: { task: Tasks.Task | undefined; rank: number } = { task: undefined, rank: -1 };
		const schema2_0_0: boolean = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
		const baseLoadIssues = Objects.deepClone(context.taskLoadIssues);
		for (let index = 0; index < externals.length; index++) {
			const external = externals[index];
			const definition = external.type ? registry?.get?.(external.type) || TaskDefinitionRegistry.get(external.type) : undefined;
			let typeNotSupported: boolean = false;
			if (definition && definition.when && !context.contextKeyService.contextMatchesRules(definition.when)) {
				typeNotSupported = true;
			} else if (!definition && external.type) {
				for (const key of Object.keys(builtinTypeContextMap)) {
					if (external.type === key) {
						typeNotSupported = !ShellExecutionSupportedContext.evaluate(context.contextKeyService.getContext(null));
						break;
					}
				}
			}

			if (typeNotSupported) {
				context.problemReporter.info(nls.localize(
					'taskConfiguration.providerUnavailable', 'Warning: {0} tasks are unavailable in the current environment.\n',
					external.type
				));
				continue;
			}

			if (isCustomTask(external)) {
				const customTask = CustomTask.from(external, context, index, source);
				if (customTask) {
					CustomTask.fillGlobals(customTask, globals);
					CustomTask.fillDefaults(customTask, context);
					if (schema2_0_0) {
						if ((customTask.command === undefined || customTask.command.name === undefined) && (customTask.configurationProperties.dependsOn === undefined || customTask.configurationProperties.dependsOn.length === 0)) {
							context.problemReporter.error(nls.localize(
								'taskConfiguration.noCommandOrDependsOn', 'Error: the task \'{0}\' neither specifies a command nor a dependsOn property. The task will be ignored. Its definition is:\n{1}',
								customTask.configurationProperties.name, JSON.stringify(external, undefined, 4)
							));
							continue;
						}
					} else {
						if (customTask.command === undefined || customTask.command.name === undefined) {
							context.problemReporter.warn(nls.localize(
								'taskConfiguration.noCommand', 'Error: the task \'{0}\' doesn\'t define a command. The task will be ignored. Its definition is:\n{1}',
								customTask.configurationProperties.name, JSON.stringify(external, undefined, 4)
							));
							continue;
						}
					}
					if (customTask.configurationProperties.group === Tasks.TaskGroup.Build && defaultBuildTask.rank < 2) {
						defaultBuildTask.task = customTask;
						defaultBuildTask.rank = 2;
					} else if (customTask.configurationProperties.group === Tasks.TaskGroup.Test && defaultTestTask.rank < 2) {
						defaultTestTask.task = customTask;
						defaultTestTask.rank = 2;
					} else if (customTask.configurationProperties.name === 'build' && defaultBuildTask.rank < 1) {
						defaultBuildTask.task = customTask;
						defaultBuildTask.rank = 1;
					} else if (customTask.configurationProperties.name === 'test' && defaultTestTask.rank < 1) {
						defaultTestTask.task = customTask;
						defaultTestTask.rank = 1;
					}
					customTask.addTaskLoadMessages(context.taskLoadIssues);
					result.custom.push(customTask);
				}
			} else {
				const configuredTask = ConfiguringTask.from(external, context, index, source, registry);
				if (configuredTask) {
					configuredTask.addTaskLoadMessages(context.taskLoadIssues);
					result.configured.push(configuredTask);
				}
			}
			context.taskLoadIssues = Objects.deepClone(baseLoadIssues);
		}
		// There is some special logic for tasks with the labels "build" and "test".
		// Even if they are not marked as a task group Build or Test, we automagically group them as such.
		// However, if they are already grouped as Build or Test, we don't need to add this grouping.
		const defaultBuildGroupName = Types.isString(defaultBuildTask.task?.configurationProperties.group) ? defaultBuildTask.task?.configurationProperties.group : defaultBuildTask.task?.configurationProperties.group?._id;
		const defaultTestTaskGroupName = Types.isString(defaultTestTask.task?.configurationProperties.group) ? defaultTestTask.task?.configurationProperties.group : defaultTestTask.task?.configurationProperties.group?._id;
		if ((defaultBuildGroupName !== Tasks.TaskGroup.Build._id) && (defaultBuildTask.rank > -1) && (defaultBuildTask.rank < 2) && defaultBuildTask.task) {
			defaultBuildTask.task.configurationProperties.group = Tasks.TaskGroup.Build;
		} else if ((defaultTestTaskGroupName !== Tasks.TaskGroup.Test._id) && (defaultTestTask.rank > -1) && (defaultTestTask.rank < 2) && defaultTestTask.task) {
			defaultTestTask.task.configurationProperties.group = Tasks.TaskGroup.Test;
		}

		return result;
	}

	export function assignTasks(target: Tasks.CustomTask[], source: Tasks.CustomTask[]): Tasks.CustomTask[] {
		if (source === undefined || source.length === 0) {
			return target;
		}
		if (target === undefined || target.length === 0) {
			return source;
		}

		if (source) {
			// Tasks are keyed by ID but we need to merge by name
			const map: IStringDictionary<Tasks.CustomTask> = Object.create(null);
			target.forEach((task) => {
				map[task.configurationProperties.name!] = task;
			});

			source.forEach((task) => {
				map[task.configurationProperties.name!] = task;
			});
			const newTarget: Tasks.CustomTask[] = [];
			target.forEach(task => {
				newTarget.push(map[task.configurationProperties.name!]);
				delete map[task.configurationProperties.name!];
			});
			Object.keys(map).forEach(key => newTarget.push(map[key]));
			target = newTarget;
		}
		return target;
	}
}

export interface IGlobals {
	command?: Tasks.ICommandConfiguration;
	problemMatcher?: ProblemMatcher[];
	promptOnClose?: boolean;
	suppressTaskName?: boolean;
}

namespace Globals {

	export function from(config: IExternalTaskRunnerConfiguration, context: IParseContext): IGlobals {
		let result = fromBase(config, context);
		let osGlobals: IGlobals | undefined = undefined;
		if (config.windows && context.platform === Platform.Windows) {
			osGlobals = fromBase(config.windows, context);
		} else if (config.osx && context.platform === Platform.Mac) {
			osGlobals = fromBase(config.osx, context);
		} else if (config.linux && context.platform === Platform.Linux) {
			osGlobals = fromBase(config.linux, context);
		}
		if (osGlobals) {
			result = Globals.assignProperties(result, osGlobals);
		}
		const command = CommandConfiguration.from(config, context);
		if (command) {
			result.command = command;
		}
		Globals.fillDefaults(result, context);
		Globals.freeze(result);
		return result;
	}

	export function fromBase(this: void, config: IBaseTaskRunnerConfiguration, context: IParseContext): IGlobals {
		const result: IGlobals = {};
		if (config.suppressTaskName !== undefined) {
			result.suppressTaskName = !!config.suppressTaskName;
		}
		if (config.promptOnClose !== undefined) {
			result.promptOnClose = !!config.promptOnClose;
		}
		if (config.problemMatcher) {
			result.problemMatcher = ProblemMatcherConverter.from(config.problemMatcher, context).value;
		}
		return result;
	}

	export function isEmpty(value: IGlobals): boolean {
		return !value || value.command === undefined && value.promptOnClose === undefined && value.suppressTaskName === undefined;
	}

	export function assignProperties(target: IGlobals, source: IGlobals): IGlobals {
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

	export function fillDefaults(value: IGlobals, context: IParseContext): void {
		if (!value) {
			return;
		}
		CommandConfiguration.fillDefaults(value.command, context);
		if (value.suppressTaskName === undefined) {
			value.suppressTaskName = (context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0);
		}
		if (value.promptOnClose === undefined) {
			value.promptOnClose = true;
		}
	}

	export function freeze(value: IGlobals): void {
		Object.freeze(value);
		if (value.command) {
			CommandConfiguration.freeze(value.command);
		}
	}
}

export namespace ExecutionEngine {

	export function from(config: IExternalTaskRunnerConfiguration): Tasks.ExecutionEngine {
		const runner = config.runner || config._runner;
		let result: Tasks.ExecutionEngine | undefined;
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
		const schemaVersion = JsonSchemaVersion.from(config);
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

	const _default: Tasks.JsonSchemaVersion = Tasks.JsonSchemaVersion.V2_0_0;

	export function from(config: IExternalTaskRunnerConfiguration): Tasks.JsonSchemaVersion {
		const version = config.version;
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

export interface IParseResult {
	validationStatus: ValidationStatus;
	custom: Tasks.CustomTask[];
	configured: Tasks.ConfiguringTask[];
	engine: Tasks.ExecutionEngine;
}

export interface IProblemReporter extends IProblemReporterBase {
}

export class UUIDMap {

	private last: IStringDictionary<string | string[]> | undefined;
	private current: IStringDictionary<string | string[]>;

	constructor(other?: UUIDMap) {
		this.current = Object.create(null);
		if (other) {
			for (const key of Object.keys(other.current)) {
				const value = other.current[key];
				if (Array.isArray(value)) {
					this.current[key] = value.slice();
				} else {
					this.current[key] = value;
				}
			}
		}
	}

	public start(): void {
		this.last = this.current;
		this.current = Object.create(null);
	}

	public getUUID(identifier: string): string {
		const lastValue = this.last ? this.last[identifier] : undefined;
		let result: string | undefined = undefined;
		if (lastValue !== undefined) {
			if (Array.isArray(lastValue)) {
				result = lastValue.shift();
				if (lastValue.length === 0) {
					delete this.last![identifier];
				}
			} else {
				result = lastValue;
				delete this.last![identifier];
			}
		}
		if (result === undefined) {
			result = UUID.generateUuid();
		}
		const currentValue = this.current[identifier];
		if (currentValue === undefined) {
			this.current[identifier] = result;
		} else {
			if (Array.isArray(currentValue)) {
				currentValue.push(result);
			} else {
				const arrayValue: string[] = [currentValue];
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

export enum TaskConfigSource {
	TasksJson,
	WorkspaceFile,
	User
}

class ConfigurationParser {

	private workspaceFolder: IWorkspaceFolder;
	private workspace: IWorkspace | undefined;
	private problemReporter: IProblemReporter;
	private uuidMap: UUIDMap;
	private platform: Platform;

	constructor(workspaceFolder: IWorkspaceFolder, workspace: IWorkspace | undefined, platform: Platform, problemReporter: IProblemReporter, uuidMap: UUIDMap) {
		this.workspaceFolder = workspaceFolder;
		this.workspace = workspace;
		this.platform = platform;
		this.problemReporter = problemReporter;
		this.uuidMap = uuidMap;
	}

	public run(fileConfig: IExternalTaskRunnerConfiguration, source: TaskConfigSource, contextKeyService: IContextKeyService): IParseResult {
		const engine = ExecutionEngine.from(fileConfig);
		const schemaVersion = JsonSchemaVersion.from(fileConfig);
		const context: IParseContext = {
			workspaceFolder: this.workspaceFolder,
			workspace: this.workspace,
			problemReporter: this.problemReporter,
			uuidMap: this.uuidMap,
			namedProblemMatchers: {},
			engine,
			schemaVersion,
			platform: this.platform,
			taskLoadIssues: [],
			contextKeyService
		};
		const taskParseResult = this.createTaskRunnerConfiguration(fileConfig, context, source);
		return {
			validationStatus: this.problemReporter.status,
			custom: taskParseResult.custom,
			configured: taskParseResult.configured,
			engine
		};
	}

	private createTaskRunnerConfiguration(fileConfig: IExternalTaskRunnerConfiguration, context: IParseContext, source: TaskConfigSource): ITaskParseResult {
		const globals = Globals.from(fileConfig, context);
		if (this.problemReporter.status.isFatal()) {
			return { custom: [], configured: [] };
		}
		context.namedProblemMatchers = ProblemMatcherConverter.namedFrom(fileConfig.declares, context);
		let globalTasks: Tasks.CustomTask[] | undefined = undefined;
		let externalGlobalTasks: Array<IConfiguringTask | ICustomTask> | undefined = undefined;
		if (fileConfig.windows && context.platform === Platform.Windows) {
			globalTasks = TaskParser.from(fileConfig.windows.tasks, globals, context, source).custom;
			externalGlobalTasks = fileConfig.windows.tasks;
		} else if (fileConfig.osx && context.platform === Platform.Mac) {
			globalTasks = TaskParser.from(fileConfig.osx.tasks, globals, context, source).custom;
			externalGlobalTasks = fileConfig.osx.tasks;
		} else if (fileConfig.linux && context.platform === Platform.Linux) {
			globalTasks = TaskParser.from(fileConfig.linux.tasks, globals, context, source).custom;
			externalGlobalTasks = fileConfig.linux.tasks;
		}
		if (context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0 && globalTasks && globalTasks.length > 0 && externalGlobalTasks && externalGlobalTasks.length > 0) {
			const taskContent: string[] = [];
			for (const task of externalGlobalTasks) {
				taskContent.push(JSON.stringify(task, null, 4));
			}
			context.problemReporter.error(
				nls.localize(
					{ key: 'TaskParse.noOsSpecificGlobalTasks', comment: ['\"Task version 2.0.0\" refers to the 2.0.0 version of the task system. The \"version 2.0.0\" is not localizable as it is a json key and value.'] },
					'Task version 2.0.0 doesn\'t support global OS specific tasks. Convert them to a task with a OS specific command. Affected tasks are:\n{0}', taskContent.join('\n'))
			);
		}

		let result: ITaskParseResult = { custom: [], configured: [] };
		if (fileConfig.tasks) {
			result = TaskParser.from(fileConfig.tasks, globals, context, source);
		}
		if (globalTasks) {
			result.custom = TaskParser.assignTasks(result.custom, globalTasks);
		}

		if ((!result.custom || result.custom.length === 0) && (globals.command && globals.command.name)) {
			const matchers: ProblemMatcher[] = ProblemMatcherConverter.from(fileConfig.problemMatcher, context).value ?? [];
			const isBackground = fileConfig.isBackground ? !!fileConfig.isBackground : fileConfig.isWatching ? !!fileConfig.isWatching : undefined;
			const name = Tasks.CommandString.value(globals.command.name);
			const task: Tasks.CustomTask = new Tasks.CustomTask(
				context.uuidMap.getUUID(name),
				Object.assign({}, source, 'workspace', { config: { index: -1, element: fileConfig, workspaceFolder: context.workspaceFolder } }) satisfies Tasks.IWorkspaceTaskSource,
				name,
				Tasks.CUSTOMIZED_TASK_TYPE,
				{
					name: undefined,
					runtime: undefined,
					presentation: undefined,
					suppressTaskName: true
				},
				false,
				{ reevaluateOnRerun: true },
				{
					name: name,
					identifier: name,
					group: Tasks.TaskGroup.Build,
					isBackground: isBackground,
					problemMatchers: matchers
				}
			);
			const taskGroupKind = GroupKind.from(fileConfig.group);
			if (taskGroupKind !== undefined) {
				task.configurationProperties.group = taskGroupKind;
			} else if (fileConfig.group === 'none') {
				task.configurationProperties.group = undefined;
			}
			CustomTask.fillGlobals(task, globals);
			CustomTask.fillDefaults(task, context);
			result.custom = [task];
		}
		result.custom = result.custom || [];
		result.configured = result.configured || [];
		return result;
	}
}

const uuidMaps: Map<TaskConfigSource, Map<string, UUIDMap>> = new Map();
const recentUuidMaps: Map<TaskConfigSource, Map<string, UUIDMap>> = new Map();
export function parse(workspaceFolder: IWorkspaceFolder, workspace: IWorkspace | undefined, platform: Platform, configuration: IExternalTaskRunnerConfiguration, logger: IProblemReporter, source: TaskConfigSource, contextKeyService: IContextKeyService, isRecents: boolean = false): IParseResult {
	const recentOrOtherMaps = isRecents ? recentUuidMaps : uuidMaps;
	let selectedUuidMaps = recentOrOtherMaps.get(source);
	if (!selectedUuidMaps) {
		recentOrOtherMaps.set(source, new Map());
		selectedUuidMaps = recentOrOtherMaps.get(source)!;
	}
	let uuidMap = selectedUuidMaps.get(workspaceFolder.uri.toString());
	if (!uuidMap) {
		uuidMap = new UUIDMap();
		selectedUuidMaps.set(workspaceFolder.uri.toString(), uuidMap);
	}
	try {
		uuidMap.start();
		return (new ConfigurationParser(workspaceFolder, workspace, platform, logger, uuidMap)).run(configuration, source, contextKeyService);
	} finally {
		uuidMap.finish();
	}
}



export function createCustomTask(contributedTask: Tasks.ContributedTask, configuredProps: Tasks.ConfiguringTask | Tasks.CustomTask): Tasks.CustomTask {
	return CustomTask.createCustomTask(contributedTask, configuredProps);
}
