/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable local/code-no-native-private */

import { validateConstraint } from 'vs/base/common/types';
import { ICommandHandlerDescription } from 'vs/platform/commands/common/commands';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import * as extHostTypeConverter from 'vs/workbench/api/common/extHostTypeConverters';
import { cloneAndChange } from 'vs/base/common/objects';
import { MainContext, MainThreadCommandsShape, ExtHostCommandsShape, ICommandDto, ICommandHandlerDescriptionDto, MainThreadTelemetryShape } from './extHost.protocol';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import * as languages from 'vs/editor/common/languages';
import type * as vscode from 'vscode';
import { ILogService } from 'vs/platform/log/common/log';
import { revive } from 'vs/base/common/marshalling';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { URI } from 'vs/base/common/uri';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { ISelection } from 'vs/editor/common/core/selection';
import { TestItemImpl } from 'vs/workbench/api/common/extHostTestItem';
import { VSBuffer } from 'vs/base/common/buffer';
import { SerializableObjectWithBuffers } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { StopWatch } from 'vs/base/common/stopwatch';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { TelemetryTrustedValue } from 'vs/platform/telemetry/common/telemetryUtils';
import { IExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';

interface CommandHandler {
	callback: Function;
	thisArg: any;
	description?: ICommandHandlerDescription;
	extension?: IExtensionDescription;
}

export interface ArgumentProcessor {
	processArgument(arg: any, extensionId: ExtensionIdentifier | undefined): any;
}

export class ExtHostCommands implements ExtHostCommandsShape {

	readonly _serviceBrand: undefined;

	#proxy: MainThreadCommandsShape;

	private readonly _commands = new Map<string, CommandHandler>();
	private readonly _apiCommands = new Map<string, ApiCommand>();
	#telemetry: MainThreadTelemetryShape;

	private readonly _logService: ILogService;
	readonly #extHostTelemetry: IExtHostTelemetry;
	private readonly _argumentProcessors: ArgumentProcessor[];

	readonly converter: CommandsConverter;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@ILogService logService: ILogService,
		@IExtHostTelemetry extHostTelemetry: IExtHostTelemetry
	) {
		this.#proxy = extHostRpc.getProxy(MainContext.MainThreadCommands);
		this._logService = logService;
		this.#extHostTelemetry = extHostTelemetry;
		this.#telemetry = extHostRpc.getProxy(MainContext.MainThreadTelemetry);
		this.converter = new CommandsConverter(
			this,
			id => {
				// API commands that have no return type (void) can be
				// converted to their internal command and don't need
				// any indirection commands
				const candidate = this._apiCommands.get(id);
				return candidate?.result === ApiCommandResult.Void
					? candidate : undefined;
			},
			logService
		);
		this._argumentProcessors = [
			{
				processArgument(a) {
					// URI, Regex
					return revive(a);
				}
			},
			{
				processArgument(arg) {
					return cloneAndChange(arg, function (obj) {
						// Reverse of https://github.com/microsoft/vscode/blob/1f28c5fc681f4c01226460b6d1c7e91b8acb4a5b/src/vs/workbench/api/node/extHostCommands.ts#L112-L127
						if (Range.isIRange(obj)) {
							return extHostTypeConverter.Range.to(obj);
						}
						if (Position.isIPosition(obj)) {
							return extHostTypeConverter.Position.to(obj);
						}
						if (Range.isIRange((obj as languages.Location).range) && URI.isUri((obj as languages.Location).uri)) {
							return extHostTypeConverter.location.to(obj);
						}
						if (obj instanceof VSBuffer) {
							return obj.buffer.buffer;
						}
						if (!Array.isArray(obj)) {
							return obj;
						}
					});
				}
			}
		];
	}

	registerArgumentProcessor(processor: ArgumentProcessor): void {
		this._argumentProcessors.push(processor);
	}

	registerApiCommand(apiCommand: ApiCommand): extHostTypes.Disposable {


		const registration = this.registerCommand(false, apiCommand.id, async (...apiArgs) => {

			const internalArgs = apiCommand.args.map((arg, i) => {
				if (!arg.validate(apiArgs[i])) {
					throw new Error(`Invalid argument '${arg.name}' when running '${apiCommand.id}', received: ${apiArgs[i]}`);
				}
				return arg.convert(apiArgs[i]);
			});

			const internalResult = await this.executeCommand(apiCommand.internalId, ...internalArgs);
			return apiCommand.result.convert(internalResult, apiArgs, this.converter);
		}, undefined, {
			description: apiCommand.description,
			args: apiCommand.args,
			returns: apiCommand.result.description
		});

		this._apiCommands.set(apiCommand.id, apiCommand);

		return new extHostTypes.Disposable(() => {
			registration.dispose();
			this._apiCommands.delete(apiCommand.id);
		});
	}

	registerCommand(global: boolean, id: string, callback: <T>(...args: any[]) => T | Thenable<T>, thisArg?: any, description?: ICommandHandlerDescription, extension?: IExtensionDescription): extHostTypes.Disposable {
		this._logService.trace('ExtHostCommands#registerCommand', id);

		if (!id.trim().length) {
			throw new Error('invalid id');
		}

		if (this._commands.has(id)) {
			throw new Error(`command '${id}' already exists`);
		}

		this._commands.set(id, { callback, thisArg, description, extension });
		if (global) {
			this.#proxy.$registerCommand(id);
		}

		return new extHostTypes.Disposable(() => {
			if (this._commands.delete(id)) {
				if (global) {
					this.#proxy.$unregisterCommand(id);
				}
			}
		});
	}

	executeCommand<T>(id: string, ...args: any[]): Promise<T> {
		this._logService.trace('ExtHostCommands#executeCommand', id);
		return this._doExecuteCommand(id, args, true);
	}

	private async _doExecuteCommand<T>(id: string, args: any[], retry: boolean): Promise<T> {

		if (this._commands.has(id)) {
			// - We stay inside the extension host and support
			// 	 to pass any kind of parameters around.
			// - We still emit the corresponding activation event
			//   BUT we don't await that event
			this.#proxy.$fireCommandActivationEvent(id);
			return this._executeContributedCommand<T>(id, args, false);

		} else {
			// automagically convert some argument types
			let hasBuffers = false;
			const toArgs = cloneAndChange(args, function (value) {
				if (value instanceof extHostTypes.Position) {
					return extHostTypeConverter.Position.from(value);
				} else if (value instanceof extHostTypes.Range) {
					return extHostTypeConverter.Range.from(value);
				} else if (value instanceof extHostTypes.Location) {
					return extHostTypeConverter.location.from(value);
				} else if (extHostTypes.NotebookRange.isNotebookRange(value)) {
					return extHostTypeConverter.NotebookRange.from(value);
				} else if (value instanceof ArrayBuffer) {
					hasBuffers = true;
					return VSBuffer.wrap(new Uint8Array(value));
				} else if (value instanceof Uint8Array) {
					hasBuffers = true;
					return VSBuffer.wrap(value);
				} else if (value instanceof VSBuffer) {
					hasBuffers = true;
					return value;
				}
				if (!Array.isArray(value)) {
					return value;
				}
			});

			try {
				const result = await this.#proxy.$executeCommand(id, hasBuffers ? new SerializableObjectWithBuffers(toArgs) : toArgs, retry);
				return revive<any>(result);
			} catch (e) {
				// Rerun the command when it wasn't known, had arguments, and when retry
				// is enabled. We do this because the command might be registered inside
				// the extension host now and can therefore accept the arguments as-is.
				if (e instanceof Error && e.message === '$executeCommand:retry') {
					return this._doExecuteCommand(id, args, false);
				} else {
					throw e;
				}
			}
		}
	}

	private async _executeContributedCommand<T = unknown>(id: string, args: any[], annotateError: boolean): Promise<T> {
		const command = this._commands.get(id);
		if (!command) {
			throw new Error('Unknown command');
		}
		const { callback, thisArg, description } = command;
		if (description) {
			for (let i = 0; i < description.args.length; i++) {
				try {
					validateConstraint(args[i], description.args[i].constraint);
				} catch (err) {
					throw new Error(`Running the contributed command: '${id}' failed. Illegal argument '${description.args[i].name}' - ${description.args[i].description}`);
				}
			}
		}

		const stopWatch = StopWatch.create();
		try {
			return await callback.apply(thisArg, args);
		} catch (err) {
			// The indirection-command from the converter can fail when invoking the actual
			// command and in that case it is better to blame the correct command
			if (id === this.converter.delegatingCommandId) {
				const actual = this.converter.getActualCommand(...args);
				if (actual) {
					id = actual.command;
				}
			}
			this._logService.error(err, id, command.extension?.identifier);

			if (!annotateError) {
				throw err;
			}

			if (command.extension?.identifier) {
				const reported = this.#extHostTelemetry.onExtensionError(command.extension.identifier, err);
				this._logService.trace('forwarded error to extension?', reported, command.extension?.identifier);
			}

			throw new class CommandError extends Error {
				readonly id = id;
				readonly source = command!.extension?.displayName ?? command!.extension?.name;
				constructor() {
					super(toErrorMessage(err));
				}
			};
		}
		finally {
			this._reportTelemetry(command, id, stopWatch.elapsed());
		}
	}

	private _reportTelemetry(command: CommandHandler, id: string, duration: number) {
		if (!command.extension) {
			return;
		}
		type ExtensionActionTelemetry = {
			extensionId: string;
			id: TelemetryTrustedValue<string>;
			duration: number;
		};
		type ExtensionActionTelemetryMeta = {
			extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the extension handling the command, informing which extensions provide most-used functionality.' };
			id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The id of the command, to understand which specific extension features are most popular.' };
			duration: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The duration of the command execution, to detect performance issues' };
			owner: 'digitarald';
			comment: 'Used to gain insight on the most popular commands used from extensions';
		};
		this.#telemetry.$publicLog2<ExtensionActionTelemetry, ExtensionActionTelemetryMeta>('Extension:ActionExecuted', {
			extensionId: command.extension.identifier.value,
			id: new TelemetryTrustedValue(id),
			duration: duration,
		});
	}

	$executeContributedCommand(id: string, ...args: any[]): Promise<unknown> {
		this._logService.trace('ExtHostCommands#$executeContributedCommand', id);

		const cmdHandler = this._commands.get(id);
		if (!cmdHandler) {
			return Promise.reject(new Error(`Contributed command '${id}' does not exist.`));
		} else {
			args = args.map(arg => this._argumentProcessors.reduce((r, p) => p.processArgument(r, cmdHandler.extension?.identifier), arg));
			return this._executeContributedCommand(id, args, true);
		}
	}

	getCommands(filterUnderscoreCommands: boolean = false): Promise<string[]> {
		this._logService.trace('ExtHostCommands#getCommands', filterUnderscoreCommands);

		return this.#proxy.$getCommands().then(result => {
			if (filterUnderscoreCommands) {
				result = result.filter(command => command[0] !== '_');
			}
			return result;
		});
	}

	$getContributedCommandHandlerDescriptions(): Promise<{ [id: string]: string | ICommandHandlerDescriptionDto }> {
		const result: { [id: string]: string | ICommandHandlerDescription } = Object.create(null);
		for (const [id, command] of this._commands) {
			const { description } = command;
			if (description) {
				result[id] = description;
			}
		}
		return Promise.resolve(result);
	}
}

export interface IExtHostCommands extends ExtHostCommands { }
export const IExtHostCommands = createDecorator<IExtHostCommands>('IExtHostCommands');

export class CommandsConverter implements extHostTypeConverter.Command.ICommandsConverter {

	readonly delegatingCommandId: string = `__vsc${Date.now().toString(36)}`;
	private readonly _cache = new Map<string, vscode.Command>();
	private _cachIdPool = 0;

	// --- conversion between internal and api commands
	constructor(
		private readonly _commands: ExtHostCommands,
		private readonly _lookupApiCommand: (id: string) => ApiCommand | undefined,
		private readonly _logService: ILogService
	) {
		this._commands.registerCommand(true, this.delegatingCommandId, this._executeConvertedCommand, this);
	}

	toInternal(command: vscode.Command, disposables: DisposableStore): ICommandDto;
	toInternal(command: vscode.Command | undefined, disposables: DisposableStore): ICommandDto | undefined;
	toInternal(command: vscode.Command | undefined, disposables: DisposableStore): ICommandDto | undefined {

		if (!command) {
			return undefined;
		}

		const result: ICommandDto = {
			$ident: undefined,
			id: command.command,
			title: command.title,
			tooltip: command.tooltip
		};

		if (!command.command) {
			// falsy command id -> return converted command but don't attempt any
			// argument or API-command dance since this command won't run anyways
			return result;
		}

		const apiCommand = this._lookupApiCommand(command.command);
		if (apiCommand) {
			// API command with return-value can be converted inplace
			result.id = apiCommand.internalId;
			result.arguments = apiCommand.args.map((arg, i) => arg.convert(command.arguments && command.arguments[i]));


		} else if (isNonEmptyArray(command.arguments)) {
			// we have a contributed command with arguments. that
			// means we don't want to send the arguments around

			const id = `${command.command}/${++this._cachIdPool}`;
			this._cache.set(id, command);
			disposables.add(toDisposable(() => {
				this._cache.delete(id);
				this._logService.trace('CommandsConverter#DISPOSE', id);
			}));
			result.$ident = id;

			result.id = this.delegatingCommandId;
			result.arguments = [id];

			this._logService.trace('CommandsConverter#CREATE', command.command, id);
		}

		return result;
	}

	fromInternal(command: ICommandDto): vscode.Command | undefined {

		if (typeof command.$ident === 'string') {
			return this._cache.get(command.$ident);

		} else {
			return {
				command: command.id,
				title: command.title,
				arguments: command.arguments
			};
		}
	}


	getActualCommand(...args: any[]): vscode.Command | undefined {
		return this._cache.get(args[0]);
	}

	private _executeConvertedCommand<R>(...args: any[]): Promise<R> {
		const actualCmd = this.getActualCommand(...args);
		this._logService.trace('CommandsConverter#EXECUTE', args[0], actualCmd ? actualCmd.command : 'MISSING');

		if (!actualCmd) {
			return Promise.reject(`Actual command not found, wanted to execute ${args[0]}`);
		}
		return this._commands.executeCommand(actualCmd.command, ...(actualCmd.arguments || []));
	}

}


export class ApiCommandArgument<V, O = V> {

	static readonly Uri = new ApiCommandArgument<URI>('uri', 'Uri of a text document', v => URI.isUri(v), v => v);
	static readonly Position = new ApiCommandArgument<extHostTypes.Position, IPosition>('position', 'A position in a text document', v => extHostTypes.Position.isPosition(v), extHostTypeConverter.Position.from);
	static readonly Range = new ApiCommandArgument<extHostTypes.Range, IRange>('range', 'A range in a text document', v => extHostTypes.Range.isRange(v), extHostTypeConverter.Range.from);
	static readonly Selection = new ApiCommandArgument<extHostTypes.Selection, ISelection>('selection', 'A selection in a text document', v => extHostTypes.Selection.isSelection(v), extHostTypeConverter.Selection.from);
	static readonly Number = new ApiCommandArgument<number>('number', '', v => typeof v === 'number', v => v);
	static readonly String = new ApiCommandArgument<string>('string', '', v => typeof v === 'string', v => v);

	static readonly CallHierarchyItem = new ApiCommandArgument('item', 'A call hierarchy item', v => v instanceof extHostTypes.CallHierarchyItem, extHostTypeConverter.CallHierarchyItem.from);
	static readonly TypeHierarchyItem = new ApiCommandArgument('item', 'A type hierarchy item', v => v instanceof extHostTypes.TypeHierarchyItem, extHostTypeConverter.TypeHierarchyItem.from);
	static readonly TestItem = new ApiCommandArgument('testItem', 'A VS Code TestItem', v => v instanceof TestItemImpl, extHostTypeConverter.TestItem.from);

	constructor(
		readonly name: string,
		readonly description: string,
		readonly validate: (v: V) => boolean,
		readonly convert: (v: V) => O
	) { }

	optional(): ApiCommandArgument<V | undefined | null, O | undefined | null> {
		return new ApiCommandArgument(
			this.name, `(optional) ${this.description}`,
			value => value === undefined || value === null || this.validate(value),
			value => value === undefined ? undefined : value === null ? null : this.convert(value)
		);
	}

	with(name: string | undefined, description: string | undefined): ApiCommandArgument<V, O> {
		return new ApiCommandArgument(name ?? this.name, description ?? this.description, this.validate, this.convert);
	}
}

export class ApiCommandResult<V, O = V> {

	static readonly Void = new ApiCommandResult<void, void>('no result', v => v);

	constructor(
		readonly description: string,
		readonly convert: (v: V, apiArgs: any[], cmdConverter: CommandsConverter) => O
	) { }
}

export class ApiCommand {

	constructor(
		readonly id: string,
		readonly internalId: string,
		readonly description: string,
		readonly args: ApiCommandArgument<any, any>[],
		readonly result: ApiCommandResult<any, any>
	) { }
}
