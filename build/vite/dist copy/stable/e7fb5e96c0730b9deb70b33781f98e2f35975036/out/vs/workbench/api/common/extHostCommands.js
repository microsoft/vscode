/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { validateConstraint } from '../../../base/common/types.js';
import * as extHostTypes from './extHostTypes.js';
import * as extHostTypeConverter from './extHostTypeConverters.js';
import { cloneAndChange } from '../../../base/common/objects.js';
import { MainContext } from './extHost.protocol.js';
import { isNonEmptyArray } from '../../../base/common/arrays.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { revive } from '../../../base/common/marshalling.js';
import { Range } from '../../../editor/common/core/range.js';
import { Position } from '../../../editor/common/core/position.js';
import { URI } from '../../../base/common/uri.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { TestItemImpl } from './extHostTestItem.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { TelemetryTrustedValue } from '../../../platform/telemetry/common/telemetryUtils.js';
import { IExtHostTelemetry } from './extHostTelemetry.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { isCancellationError } from '../../../base/common/errors.js';
let ExtHostCommands = class ExtHostCommands {
    #proxy;
    #telemetry;
    #extHostTelemetry;
    constructor(extHostRpc, logService, extHostTelemetry) {
        this._commands = new Map();
        this._apiCommands = new Map();
        this.#proxy = extHostRpc.getProxy(MainContext.MainThreadCommands);
        this._logService = logService;
        this.#extHostTelemetry = extHostTelemetry;
        this.#telemetry = extHostRpc.getProxy(MainContext.MainThreadTelemetry);
        this.converter = new CommandsConverter(this, id => {
            // API commands that have no return type (void) can be
            // converted to their internal command and don't need
            // any indirection commands
            const candidate = this._apiCommands.get(id);
            return candidate?.result === ApiCommandResult.Void
                ? candidate : undefined;
        }, logService);
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
                        if (Range.isIRange(obj.range) && URI.isUri(obj.uri)) {
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
    registerArgumentProcessor(processor) {
        this._argumentProcessors.push(processor);
    }
    registerApiCommand(apiCommand) {
        const registration = this.registerCommand(false, apiCommand.id, async (...apiArgs) => {
            const internalArgs = apiCommand.args.map((arg, i) => {
                if (!arg.validate(apiArgs[i])) {
                    throw new Error(`Invalid argument '${arg.name}' when running '${apiCommand.id}', received: ${typeof apiArgs[i] === 'object' ? JSON.stringify(apiArgs[i], null, '\t') : apiArgs[i]} `);
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
    registerCommand(global, id, callback, thisArg, metadata, extension) {
        this._logService.trace('ExtHostCommands#registerCommand', id);
        if (!id.trim().length) {
            throw new Error('invalid id');
        }
        if (this._commands.has(id)) {
            throw new Error(`command '${id}' already exists`);
        }
        this._commands.set(id, { callback, thisArg, metadata, extension });
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
    executeCommand(id, ...args) {
        this._logService.trace('ExtHostCommands#executeCommand', id);
        return this._doExecuteCommand(id, args, true);
    }
    async _doExecuteCommand(id, args, retry) {
        if (this._commands.has(id)) {
            // - We stay inside the extension host and support
            // 	 to pass any kind of parameters around.
            // - We still emit the corresponding activation event
            //   BUT we don't await that event
            this.#proxy.$fireCommandActivationEvent(id);
            return this._executeContributedCommand(id, args, false);
        }
        else {
            // automagically convert some argument types
            let hasBuffers = false;
            const toArgs = cloneAndChange(args, function (value) {
                if (value instanceof extHostTypes.Position) {
                    return extHostTypeConverter.Position.from(value);
                }
                else if (value instanceof extHostTypes.Range) {
                    return extHostTypeConverter.Range.from(value);
                }
                else if (value instanceof extHostTypes.Location) {
                    return extHostTypeConverter.location.from(value);
                }
                else if (extHostTypes.NotebookRange.isNotebookRange(value)) {
                    return extHostTypeConverter.NotebookRange.from(value);
                }
                else if (value instanceof ArrayBuffer) {
                    hasBuffers = true;
                    return VSBuffer.wrap(new Uint8Array(value));
                }
                else if (value instanceof Uint8Array) {
                    hasBuffers = true;
                    return VSBuffer.wrap(value);
                }
                else if (value instanceof VSBuffer) {
                    hasBuffers = true;
                    return value;
                }
                if (!Array.isArray(value)) {
                    return value;
                }
            });
            try {
                const result = await this.#proxy.$executeCommand(id, hasBuffers ? new SerializableObjectWithBuffers(toArgs) : toArgs, retry);
                return revive(result);
            }
            catch (e) {
                // Rerun the command when it wasn't known, had arguments, and when retry
                // is enabled. We do this because the command might be registered inside
                // the extension host now and can therefore accept the arguments as-is.
                if (e instanceof Error && e.message === '$executeCommand:retry') {
                    return this._doExecuteCommand(id, args, false);
                }
                else {
                    throw e;
                }
            }
        }
    }
    async _executeContributedCommand(id, args, annotateError) {
        const command = this._commands.get(id);
        if (!command) {
            throw new Error('Unknown command');
        }
        const { callback, thisArg, metadata } = command;
        if (metadata?.args) {
            for (let i = 0; i < metadata.args.length; i++) {
                try {
                    validateConstraint(args[i], metadata.args[i].constraint);
                }
                catch (err) {
                    throw new Error(`Running the contributed command: '${id}' failed. Illegal argument '${metadata.args[i].name}' - ${metadata.args[i].description}`);
                }
            }
        }
        const stopWatch = StopWatch.create();
        try {
            return await callback.apply(thisArg, args);
        }
        catch (err) {
            // The indirection-command from the converter can fail when invoking the actual
            // command and in that case it is better to blame the correct command
            if (id === this.converter.delegatingCommandId) {
                const actual = this.converter.getActualCommand(...args);
                if (actual) {
                    id = actual.command;
                }
            }
            if (!isCancellationError(err)) {
                this._logService.error(err, id, command.extension?.identifier);
            }
            if (!annotateError) {
                throw err;
            }
            if (command.extension?.identifier) {
                const reported = this.#extHostTelemetry.onExtensionError(command.extension.identifier, err);
                this._logService.trace('forwarded error to extension?', reported, command.extension?.identifier);
            }
            throw new class CommandError extends Error {
                constructor() {
                    super(toErrorMessage(err));
                    this.id = id;
                    this.source = command.extension?.displayName ?? command.extension?.name;
                }
            };
        }
        finally {
            this._reportTelemetry(command, id, stopWatch.elapsed());
        }
    }
    _reportTelemetry(command, id, duration) {
        if (!command.extension) {
            return;
        }
        if (id.startsWith('code.copilot.logStructured')) {
            // This command is very active. See https://github.com/microsoft/vscode/issues/254153.
            return;
        }
        this.#telemetry.$publicLog2('Extension:ActionExecuted', {
            extensionId: command.extension.identifier.value,
            id: new TelemetryTrustedValue(id),
            duration: duration,
        });
    }
    $executeContributedCommand(id, ...args) {
        this._logService.trace('ExtHostCommands#$executeContributedCommand', id);
        const cmdHandler = this._commands.get(id);
        if (!cmdHandler) {
            return Promise.reject(new Error(`Contributed command '${id}' does not exist.`));
        }
        else {
            args = args.map(arg => this._argumentProcessors.reduce((r, p) => p.processArgument(r, cmdHandler.extension), arg));
            return this._executeContributedCommand(id, args, true);
        }
    }
    getCommands(filterUnderscoreCommands = false) {
        this._logService.trace('ExtHostCommands#getCommands', filterUnderscoreCommands);
        return this.#proxy.$getCommands().then(result => {
            if (filterUnderscoreCommands) {
                result = result.filter(command => command[0] !== '_');
            }
            return result;
        });
    }
    $getContributedCommandMetadata() {
        const result = Object.create(null);
        for (const [id, command] of this._commands) {
            const { metadata } = command;
            if (metadata) {
                result[id] = metadata;
            }
        }
        return Promise.resolve(result);
    }
};
ExtHostCommands = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, ILogService),
    __param(2, IExtHostTelemetry)
], ExtHostCommands);
export { ExtHostCommands };
export const IExtHostCommands = createDecorator('IExtHostCommands');
export class CommandsConverter {
    // --- conversion between internal and api commands
    constructor(_commands, _lookupApiCommand, _logService) {
        this._commands = _commands;
        this._lookupApiCommand = _lookupApiCommand;
        this._logService = _logService;
        this.delegatingCommandId = `__vsc${generateUuid()}`;
        this._cache = new Map();
        this._cachIdPool = 0;
        this._commands.registerCommand(true, this.delegatingCommandId, this._executeConvertedCommand, this);
    }
    toInternal(command, disposables) {
        if (!command) {
            return undefined;
        }
        const result = {
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
        }
        else if (isNonEmptyArray(command.arguments)) {
            // we have a contributed command with arguments. that
            // means we don't want to send the arguments around
            const id = `${command.command} /${++this._cachIdPool}`;
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
    fromInternal(command) {
        if (typeof command.$ident === 'string') {
            return this._cache.get(command.$ident);
        }
        else {
            return {
                command: command.id,
                title: command.title,
                arguments: command.arguments
            };
        }
    }
    getActualCommand(...args) {
        return this._cache.get(args[0]);
    }
    _executeConvertedCommand(...args) {
        const actualCmd = this.getActualCommand(...args);
        this._logService.trace('CommandsConverter#EXECUTE', args[0], actualCmd ? actualCmd.command : 'MISSING');
        if (!actualCmd) {
            return Promise.reject(`Actual command not found, wanted to execute ${args[0]}`);
        }
        return this._commands.executeCommand(actualCmd.command, ...(actualCmd.arguments || []));
    }
}
export class ApiCommandArgument {
    static { this.Uri = new ApiCommandArgument('uri', 'Uri of a text document', v => URI.isUri(v), v => v); }
    static { this.Position = new ApiCommandArgument('position', 'A position in a text document', v => extHostTypes.Position.isPosition(v), extHostTypeConverter.Position.from); }
    static { this.Range = new ApiCommandArgument('range', 'A range in a text document', v => extHostTypes.Range.isRange(v), extHostTypeConverter.Range.from); }
    static { this.Selection = new ApiCommandArgument('selection', 'A selection in a text document', v => extHostTypes.Selection.isSelection(v), extHostTypeConverter.Selection.from); }
    static { this.Number = new ApiCommandArgument('number', '', v => typeof v === 'number', v => v); }
    static { this.String = new ApiCommandArgument('string', '', v => typeof v === 'string', v => v); }
    static Arr(element) {
        return new ApiCommandArgument(`${element.name}_array`, `Array of ${element.name}, ${element.description}`, (v) => Array.isArray(v) && v.every(e => element.validate(e)), (v) => v.map(e => element.convert(e)));
    }
    static { this.CallHierarchyItem = new ApiCommandArgument('item', 'A call hierarchy item', v => v instanceof extHostTypes.CallHierarchyItem, extHostTypeConverter.CallHierarchyItem.from); }
    static { this.TypeHierarchyItem = new ApiCommandArgument('item', 'A type hierarchy item', v => v instanceof extHostTypes.TypeHierarchyItem, extHostTypeConverter.TypeHierarchyItem.from); }
    static { this.TestItem = new ApiCommandArgument('testItem', 'A VS Code TestItem', v => v instanceof TestItemImpl, extHostTypeConverter.TestItem.from); }
    static { this.TestProfile = new ApiCommandArgument('testProfile', 'A VS Code test profile', v => v instanceof extHostTypes.TestRunProfileBase, extHostTypeConverter.TestRunProfile.from); }
    constructor(name, description, validate, convert) {
        this.name = name;
        this.description = description;
        this.validate = validate;
        this.convert = convert;
    }
    optional() {
        return new ApiCommandArgument(this.name, `(optional) ${this.description}`, value => value === undefined || value === null || this.validate(value), value => value === undefined ? undefined : value === null ? null : this.convert(value));
    }
    with(name, description) {
        return new ApiCommandArgument(name ?? this.name, description ?? this.description, this.validate, this.convert);
    }
}
export class ApiCommandResult {
    static { this.Void = new ApiCommandResult('no result', v => v); }
    constructor(description, convert) {
        this.description = description;
        this.convert = convert;
    }
}
export class ApiCommand {
    constructor(id, internalId, description, args, result) {
        this.id = id;
        this.internalId = internalId;
        this.description = description;
        this.args = args;
        this.result = result;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdENvbW1hbmRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRW5FLE9BQU8sS0FBSyxZQUFZLE1BQU0sbUJBQW1CLENBQUM7QUFDbEQsT0FBTyxLQUFLLG9CQUFvQixNQUFNLDRCQUE0QixDQUFDO0FBQ25FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsV0FBVyxFQUE2RyxNQUFNLHVCQUF1QixDQUFDO0FBQy9KLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUdqRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdELE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyRSxPQUFPLEVBQWEsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBbUIsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTVELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNwRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFF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