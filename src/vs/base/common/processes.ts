/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import NLS = require('vs/nls');

import * as Objects from 'vs/base/common/objects';
import * as Platform from 'vs/base/common/platform';
import { IStringDictionary } from 'vs/base/common/collections';
import * as Types from 'vs/base/common/types';

import { ValidationState, IProblemReporter, Parser } from 'vs/base/common/parsers';

/**
 * Options to be passed to the external program or shell.
 */
export interface CommandOptions {
	/**
	 * The current working directory of the executed program or shell.
	 * If omitted VSCode's current workspace root is used.
	 */
	cwd?: string;

	/**
	 * The environment of the executed program or shell. If omitted
	 * the parent process' environment is used.
	 */
	env?: { [key: string]: string; };
}

export interface Executable {
	/**
	 * The command to be executed. Can be an external program or a shell
	 * command.
	 */
	command: string;

	/**
	 * Specifies whether the command is a shell command and therefore must
	 * be executed in a shell interpreter (e.g. cmd.exe, bash, ...).
	 */
	isShellCommand: boolean;

	/**
	 * The arguments passed to the command.
	 */
	args: string[];

	/**
	 * The command options used when the command is executed. Can be omitted.
	 */
	options?: CommandOptions;
}

export interface ForkOptions extends CommandOptions {
	execArgv?: string[];
}

export enum Source {
	stdout,
	stderr
}

/**
 * The data send via a success callback
 */
export interface SuccessData {
	error?: Error;
	cmdCode?: number;
	terminated?: boolean;
}

/**
 * The data send via a error callback
 */
export interface ErrorData {
	error?: Error;
	terminated?: boolean;
	stdout?: string;
	stderr?: string;
}

export interface TerminateResponse {
	success: boolean;
	code?: TerminateResponseCode;
	error?: any;
}

export enum TerminateResponseCode {
	Success = 0,
	Unknown = 1,
	AccessDenied = 2,
	ProcessNotFound = 3,
}

export namespace Config {
	/**
	 * Options to be passed to the external program or shell
	 */
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
		 * Index signature
		 */
		[key: string]: string | string[] | IStringDictionary<string>;
	}

	export interface BaseExecutable {
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
		 * The arguments passed to the command. Can be omitted.
		 */
		args?: string[];

		/**
		 * The command options used when the command is executed. Can be omitted.
		 */
		options?: CommandOptions;
	}

	export interface Executable extends BaseExecutable {

		/**
		 * Windows specific executable configuration
		 */
		windows?: BaseExecutable;

		/**
		 * Mac specific executable configuration
		 */
		osx?: BaseExecutable;

		/**
		 * Linux specific executable configuration
		 */
		linux?: BaseExecutable;

	}
}

export interface ParserOptions {
	globals?: Executable;
	emptyCommand?: boolean;
	noDefaults?: boolean;
}

export class ExecutableParser extends Parser {

	constructor(logger: IProblemReporter) {
		super(logger);
	}

	public parse(json: Config.Executable, parserOptions: ParserOptions = { globals: null, emptyCommand: false, noDefaults: false }): Executable {
		let result = this.parseExecutable(json, parserOptions.globals);
		if (this.problemReporter.status.isFatal()) {
			return result;
		}
		let osExecutable: Executable;
		if (json.windows && Platform.platform === Platform.Platform.Windows) {
			osExecutable = this.parseExecutable(json.windows);
		} else if (json.osx && Platform.platform === Platform.Platform.Mac) {
			osExecutable = this.parseExecutable(json.osx);
		} else if (json.linux && Platform.platform === Platform.Platform.Linux) {
			osExecutable = this.parseExecutable(json.linux);
		}
		if (osExecutable) {
			result = ExecutableParser.mergeExecutable(result, osExecutable);
		}
		if ((!result || !result.command) && !parserOptions.emptyCommand) {
			this.fatal(NLS.localize('ExecutableParser.commandMissing', 'Error: executable info must define a command of type string.'));
			return null;
		}
		if (!parserOptions.noDefaults) {
			Parser.merge(result, {
				command: undefined,
				isShellCommand: false,
				args: [],
				options: {}
			}, false);
		}
		return result;
	}

	public parseExecutable(json: Config.BaseExecutable, globals?: Executable): Executable {
		let command: string = undefined;
		let isShellCommand: boolean = undefined;
		let args: string[] = undefined;
		let options: CommandOptions = undefined;

		if (this.is(json.command, Types.isString)) {
			command = json.command;
		}
		if (this.is(json.isShellCommand, Types.isBoolean, ValidationState.Warning, NLS.localize('ExecutableParser.isShellCommand', 'Warning: isShellCommand must be of type boolean. Ignoring value {0}.', json.isShellCommand))) {
			isShellCommand = json.isShellCommand;
		}
		if (this.is(json.args, Types.isStringArray, ValidationState.Warning, NLS.localize('ExecutableParser.args', 'Warning: args must be of type string[]. Ignoring value {0}.', json.isShellCommand))) {
			args = json.args.slice(0);
		}
		if (this.is(json.options, Types.isObject)) {
			options = this.parseCommandOptions(json.options);
		}
		return { command, isShellCommand, args, options };
	}

	private parseCommandOptions(json: Config.CommandOptions): CommandOptions {
		let result: CommandOptions = {};
		if (!json) {
			return result;
		}
		if (this.is(json.cwd, Types.isString, ValidationState.Warning, NLS.localize('ExecutableParser.invalidCWD', 'Warning: options.cwd must be of type string. Ignoring value {0}.', json.cwd))) {
			result.cwd = json.cwd;
		}
		if (!Types.isUndefined(json.env)) {
			result.env = Objects.clone(json.env);
		}
		return result;
	}

	public static mergeExecutable(executable: Executable, other: Executable): Executable {
		if (!executable) {
			return other;
		}
		Parser.merge(executable, other, true);
		return executable;
	}
}
