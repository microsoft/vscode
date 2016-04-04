/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import NLS = require('vs/nls');

import { IStringDictionary } from 'vs/base/common/collections';
import * as Types from 'vs/base/common/types';
import * as UUID from 'vs/base/common/uuid';

import { ValidationStatus, ValidationState, ILogger, Parser } from 'vs/base/common/parsers';
import { Executable, ExecutableParser, Config  as ProcessConfig} from 'vs/base/common/processes';

import { ProblemMatcher, Config as ProblemMatcherConfig, ProblemMatcherParser } from 'vs/platform/markers/common/problemMatcher';

export namespace Config {

	/**
	 * The description of a task.
	 */
	export interface Task {

		/**
		 * The task's name.
		 */
		name?: string;

		/**
		 * The trigger to automatically activate the task.
		 */
		trigger?: string | string[];

		/**
		 * The executable
		 */
		executable?: ProcessConfig.Executable;

		/**
		 * Whether the executed command is kept alive and is watching the file system.
		 */
		isWatching?: boolean;

		/**
		 * Whether the task should prompt on close for confirmation if running.
		 */
		promptOnClose?: boolean;

		/**
		 * Controls whether the output view of the running tasks is brought to front or not.
		 * See BaseTaskRunnerConfiguration#showOutput for details.
		*/
		showOutput?: string;

		/**
		 * Controls whether the executed command is printed to the output window as well.
		 */
		echoCommand?: boolean;

		/**
		 * Settings to control the task
		 */
		settings?: string;

		/**
		 * The problem matcher(s) to use to capture problems in the tasks
		 * output.
		 */
		problemMatcher?: ProblemMatcherConfig.ProblemMatcherType;

	}
}

export enum ShowOutput {
	Always,
	Silent,
	Never
}

export namespace ShowOutput {
	export function fromString(value: string): ShowOutput {
		value = value.toLowerCase();
		if (value === 'always') {
			return ShowOutput.Always;
		} else if (value === 'silent') {
			return ShowOutput.Silent;
		} else if (value === 'never') {
			return ShowOutput.Never;
		} else {
			return undefined;
		}
	}
}

/**
 * The description of a task.
 */
export interface Task {

	/**
	 * The task's internal id
	 */
	id: string;

	/**
	 * The task's name
	 */
	name?: string;

	/**
	 * The trigger to automatically activate the task.
	 */
	trigger?: string[];

	/**
	 * The executable
	 */
	executable: Executable;

	/**
	 * Whether the executed command is kept alive and is watching the file system.
	 */
	isWatching: boolean;

	/**
	 * Whether the task should prompt on close for confirmation if running.
	 */
	promptOnClose?: boolean;

	/**
	 * Controls whether the output view of the running tasks is brought to front or not.
	 * See BaseTaskRunnerConfiguration#showOutput for details.
	 */
	showOutput: ShowOutput;

	/**
	 * Controls whether the executed command is printed to the output window as well.
	 */
	echoCommand: boolean;

	/**
	 * Settings to control the task
	 */
	settings: string;

	/**
	 * The problem matcher(s) to use to capture problems in the tasks
	 * output.
	 */
	problemMatcher: ProblemMatcher[];
}

export interface ParserSettings {
	globals?: Executable;
	emptyExecutable?: boolean;
	emptyCommand?: boolean;
}

export class TaskParser  extends Parser {

	private resolver: { get(name: string): ProblemMatcher; };

	constructor(resolver: { get(name: string): ProblemMatcher; }, logger: ILogger, validationStatus: ValidationStatus = new ValidationStatus()) {
		super(logger, validationStatus);
		this.resolver = resolver;
	}

	public parse(json: Config.Task, parserSettings: ParserSettings = { globals: null, emptyExecutable: false, emptyCommand: false }): Task {
		let id: string = UUID.generateUuid();
		let name: string = null;
		let trigger: string[] = null;
		let settings: string = null;

		if (this.is(json.name, Types.isString)) {
			name = json.name;
		}
		if (this.is(json.trigger, Types.isString)) {
			trigger = [<string>json.trigger];
		} else if (this.is(json.trigger, Types.isStringArray)) {
			trigger = <string[]>json.trigger;
		}
		if (name === null && trigger === null) {
			this.status.state = ValidationState.Error;
			this.log(NLS.localize('TaskParser.nameOrTrigger', 'A task must either define a name or a trigger.'));
			return null;
		}
		let executable: Executable = json.executable ? (new ExecutableParser(this.logger, this.status)).parse(json.executable, { emptyCommand: !!parserSettings.emptyCommand }) : null;
		if (!executable && parserSettings.globals) {
			executable = parserSettings.globals;
		}
		if (executable === null && !parserSettings.emptyExecutable) {
			this.status.state = ValidationState.Error;
			this.log(NLS.localize('TaskParser.noExecutable', 'A task must must define a valid executable.'));
			return null;
		}
		let isWatching: boolean = false;
		let showOutput: ShowOutput = ShowOutput.Always;
		let echoCommand: boolean = false;
		if (this.is(json.isWatching, Types.isBoolean)) {
			isWatching = json.isWatching;
		}
		let promptOnClose: boolean = true;
		if (this.is(json.promptOnClose, Types.isBoolean)) {
			promptOnClose = json.promptOnClose;
		} else {
			promptOnClose = !isWatching;
		}
		if (this.is(json.showOutput, Types.isString)) {
			showOutput = ShowOutput.fromString(json.showOutput) || ShowOutput.Always;
		}
		if (this.is(json.echoCommand, Types.isBoolean)) {
			echoCommand = json.echoCommand;
		}
		if (this.is(json.settings, Types.isString)) {
			settings = json.settings;
		}

		let problemMatcher: ProblemMatcher[] = [];
		if (Types.isArray(json.problemMatcher)) {
			(<(string | ProblemMatcherConfig.ProblemMatcher)[]>json.problemMatcher).forEach((value) => {
				let matcher = this.parseProblemMatcher(value);
				if (matcher) {
					problemMatcher.push(matcher);
				}
			});
		} else {
			let matcher = this.parseProblemMatcher(json.problemMatcher);
			if (matcher) {
				problemMatcher.push(matcher);
			}
		}
		return { id, name, trigger, executable, isWatching, promptOnClose, showOutput, echoCommand, settings, problemMatcher };
	}

	private parseProblemMatcher(json: string | ProblemMatcherConfig.ProblemMatcher): ProblemMatcher {
		if (Types.isString(json)) {
			return json.length > 0 && json.charAt(0) === '$' ? this.resolver.get(json.substr(1)) : null;
		} else if (Types.isObject(json)) {
			return new ProblemMatcherParser(this.resolver, this.logger, this.status).parse(<ProblemMatcherConfig.ProblemMatcher>json);
		} else {
			return null;
		}
	}
}

// let tasksExtPoint = ExtensionsRegistry.registerExtensionPoint<Config.Task | Config.Task[]>('tasks', {
	// TODO@Dirk: provide JSON schema here
// });

// const extensionPoint: string = 'tasks';

export class TaskRegistry {
	private tasks: IStringDictionary<Task>;

	constructor() {
		this.tasks = Object.create(null);
		/*
		tasksExtPoint.setHandler((extensions, collector) => {
			// TODO@Dirk: validate extension description here and collect errors/warnings with `collector`
			extensions.forEach(extension => {
				let extensions = extension.value;
				if (Types.isArray(extensions)) {
					(<Config.Task[]>extensions).forEach(this.onTask, this);
				} else {
					this.onTask(extensions)
				}
			});
		});
		*/
	}

	// private onDescriptions(descriptions: IExtensionDescription[]) {
	// 	descriptions.forEach(description => {
	// 		let extensions = description.contributes[extensionPoint];
	// 		if (Types.isArray(extensions)) {
	// 			(<Config.Task[]>extensions).forEach(this.onTask, this);
	// 		} else {
	// 			this.onTask(extensions);
	// 		}
	// 	});
	// }

	// private onTask(json: Config.Task): void {
	// 	let logger: ILogger = {
	// 		log: (message) => { console.warn(message); }
	// 	};
	// 	let parser = new TaskParser(ProblemMatcherRegistry, logger);
	// 	let result = parser.parse(json, { emptyExecutable: true, emptyCommand: true });
	// 	this.add(result);
	// }

	public add(task: Task): void {
		this.tasks[task.id] = task;
	}

	public get(id: string): Task {
		return this.tasks[id];
	}

	public exists(id: string): boolean {
		return !!this.tasks[id];
	}

	public remove(id: string): void {
		delete this.tasks[id];
	}

	public all(): Task[] {
		return Object.keys(this.tasks).map(key => this.tasks[key]);
	}
}
