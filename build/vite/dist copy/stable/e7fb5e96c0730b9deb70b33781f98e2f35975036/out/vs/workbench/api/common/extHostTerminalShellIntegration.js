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
import { TerminalShellExecutionCommandLineConfidence } from './extHostTypes.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostTerminalService } from './extHostTerminalService.js';
import { Emitter } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { AsyncIterableObject, Barrier } from '../../../base/common/async.js';
export const IExtHostTerminalShellIntegration = createDecorator('IExtHostTerminalShellIntegration');
let ExtHostTerminalShellIntegration = class ExtHostTerminalShellIntegration extends Disposable {
    constructor(extHostRpc, _extHostTerminalService) {
        super();
        this._extHostTerminalService = _extHostTerminalService;
        this._activeShellIntegrations = new Map();
        this._onDidChangeTerminalShellIntegration = this._register(new Emitter());
        this.onDidChangeTerminalShellIntegration = this._onDidChangeTerminalShellIntegration.event;
        this._onDidStartTerminalShellExecution = this._register(new Emitter());
        this.onDidStartTerminalShellExecution = this._onDidStartTerminalShellExecution.event;
        this._onDidEndTerminalShellExecution = this._register(new Emitter());
        this.onDidEndTerminalShellExecution = this._onDidEndTerminalShellExecution.event;
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalShellIntegration);
        // Clean up listeners
        this._register(toDisposable(() => {
            for (const [_, integration] of this._activeShellIntegrations) {
                integration.dispose();
            }
            this._activeShellIntegrations.clear();
        }));
        // Convenient test code:
        // this.onDidChangeTerminalShellIntegration(e => {
        // 	console.log('*** onDidChangeTerminalShellIntegration', e);
        // });
        // this.onDidStartTerminalShellExecution(async e => {
        // 	console.log('*** onDidStartTerminalShellExecution', e);
        // 	// new Promise<void>(r => {
        // 	// 	(async () => {
        // 	// 		for await (const d of e.execution.read()) {
        // 	// 			console.log('data2', d);
        // 	// 		}
        // 	// 	})();
        // 	// });
        // 	for await (const d of e.execution.read()) {
        // 		console.log('data', d);
        // 	}
        // });
        // this.onDidEndTerminalShellExecution(e => {
        // 	console.log('*** onDidEndTerminalShellExecution', e);
        // });
        // setTimeout(() => {
        // 	console.log('before executeCommand(\"echo hello\")');
        // 	Array.from(this._activeShellIntegrations.values())[0].value.executeCommand('echo hello');
        // 	console.log('after executeCommand(\"echo hello\")');
        // }, 4000);
    }
    $shellIntegrationChange(instanceId, supportsExecuteCommandApi) {
        const terminal = this._extHostTerminalService.getTerminalById(instanceId);
        if (!terminal) {
            return;
        }
        const apiTerminal = terminal.value;
        let shellIntegration = this._activeShellIntegrations.get(instanceId);
        if (!shellIntegration) {
            shellIntegration = new InternalTerminalShellIntegration(terminal.value, supportsExecuteCommandApi, this._onDidStartTerminalShellExecution);
            this._activeShellIntegrations.set(instanceId, shellIntegration);
            shellIntegration.store.add(terminal.onWillDispose(() => this._activeShellIntegrations.get(instanceId)?.dispose()));
            shellIntegration.store.add(shellIntegration.onDidRequestShellExecution(commandLine => this._proxy.$executeCommand(instanceId, commandLine)));
            shellIntegration.store.add(shellIntegration.onDidRequestEndExecution(e => this._onDidEndTerminalShellExecution.fire(e)));
            shellIntegration.store.add(shellIntegration.onDidRequestChangeShellIntegration(e => this._onDidChangeTerminalShellIntegration.fire(e)));
            terminal.shellIntegration = shellIntegration.value;
        }
        this._onDidChangeTerminalShellIntegration.fire({
            terminal: apiTerminal,
            shellIntegration: shellIntegration.value
        });
    }
    $shellExecutionStart(instanceId, supportsExecuteCommandApi, commandLineValue, commandLineConfidence, isTrusted, cwd) {
        // Force shellIntegration creation if it hasn't been created yet, this could when events
        // don't come through on startup
        if (!this._activeShellIntegrations.has(instanceId)) {
            this.$shellIntegrationChange(instanceId, supportsExecuteCommandApi);
        }
        const commandLine = {
            value: commandLineValue,
            confidence: commandLineConfidence,
            isTrusted
        };
        this._activeShellIntegrations.get(instanceId)?.startShellExecution(commandLine, this._convertCwdToUri(cwd));
    }
    $shellExecutionEnd(instanceId, commandLineValue, commandLineConfidence, isTrusted, exitCode) {
        const commandLine = {
            value: commandLineValue,
            confidence: commandLineConfidence,
            isTrusted
        };
        this._activeShellIntegrations.get(instanceId)?.endShellExecution(commandLine, exitCode);
    }
    $shellExecutionData(instanceId, data) {
        this._activeShellIntegrations.get(instanceId)?.emitData(data);
    }
    $shellEnvChange(instanceId, shellEnvKeys, shellEnvValues, isTrusted) {
        this._activeShellIntegrations.get(instanceId)?.setEnv(shellEnvKeys, shellEnvValues, isTrusted);
    }
    $cwdChange(instanceId, cwd) {
        this._activeShellIntegrations.get(instanceId)?.setCwd(this._convertCwdToUri(cwd));
    }
    $closeTerminal(instanceId) {
        this._activeShellIntegrations.get(instanceId)?.dispose();
        this._activeShellIntegrations.delete(instanceId);
    }
    _convertCwdToUri(cwd) {
        // IMPORTANT: cwd is provided to the exthost as a string from the renderer and only
        // converted to a URI on the machine in which the pty is hosted on. The string version of
        // the cwd is used from the renderer such that it's access is synchronous and its event
        // comes through in order relative to other shell integration events.
        return cwd ? URI.file(cwd) : undefined;
    }
};
ExtHostTerminalShellIntegration = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostTerminalService)
], ExtHostTerminalShellIntegration);
export { ExtHostTerminalShellIntegration };
export class InternalTerminalShellIntegration extends Disposable {
    get currentExecution() { return this._currentExecution; }
    constructor(_terminal, supportsExecuteCommandApi, _onDidStartTerminalShellExecution) {
        super();
        this._terminal = _terminal;
        this._onDidStartTerminalShellExecution = _onDidStartTerminalShellExecution;
        this._pendingExecutions = [];
        this.store = this._register(new DisposableStore());
        this._onDidRequestChangeShellIntegration = this._register(new Emitter());
        this.onDidRequestChangeShellIntegration = this._onDidRequestChangeShellIntegration.event;
        this._onDidRequestShellExecution = this._register(new Emitter());
        this.onDidRequestShellExecution = this._onDidRequestShellExecution.event;
        this._onDidRequestEndExecution = this._register(new Emitter());
        this.onDidRequestEndExecution = this._onDidRequestEndExecution.event;
        this._onDidRequestNewExecution = this._register(new Emitter());
        this.onDidRequestNewExecution = this._onDidRequestNewExecution.event;
        const that = this;
        this.value = {
            get cwd() {
                return that._cwd;
            },
            get env() {
                if (!that._env) {
                    return undefined;
                }
                return Object.freeze({
                    isTrusted: that._env.isTrusted,
                    value: Object.freeze({ ...that._env.value })
                });
            },
            // executeCommand(commandLine: string): vscode.TerminalShellExecution;
            // executeCommand(executable: string, args: string[]): vscode.TerminalShellExecution;
            executeCommand(commandLineOrExecutable, args) {
                if (!supportsExecuteCommandApi) {
                    throw new Error('This terminal does not support the executeCommand API.');
                }
                let commandLineValue = commandLineOrExecutable;
                if (args) {
                    for (const arg of args) {
                        const wrapInQuotes = !arg.match(/["'`]/) && arg.match(/\s/);
                        if (wrapInQuotes) {
                            commandLineValue += ` "${arg}"`;
                        }
                        else {
                            commandLineValue += ` ${arg}`;
                        }
                    }
                }
                that._onDidRequestShellExecution.fire(commandLineValue);
                // Fire the event in a microtask to allow the extension to use the execution before
                // the start event fires
                const commandLine = {
                    value: commandLineValue,
                    confidence: TerminalShellExecutionCommandLineConfidence.High,
                    isTrusted: true
                };
                const execution = that.requestNewShellExecution(commandLine, that._cwd).value;
                return execution;
            }
        };
    }
    requestNewShellExecution(commandLine, cwd) {
        const execution = new InternalTerminalShellExecution(commandLine, cwd ?? this._cwd);
        const unresolvedCommandLines = splitAndSanitizeCommandLine(commandLine.value);
        if (unresolvedCommandLines.length > 1) {
            this._currentExecutionProperties = {
                isMultiLine: true,
                unresolvedCommandLines: splitAndSanitizeCommandLine(commandLine.value),
            };
        }
        this._pendingExecutions.push(execution);
        this._onDidRequestNewExecution.fire(commandLine.value);
        return execution;
    }
    startShellExecution(commandLine, cwd) {
        // Since an execution is starting, fire the end event for any execution that is awaiting to
        // end. When this happens it means that the data stream may not be flushed and therefore may
        // fire events after the end event.
        if (this._pendingEndingExecution) {
            this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._pendingEndingExecution.value, exitCode: undefined });
            this._pendingEndingExecution = undefined;
        }
        if (this._currentExecution) {
            // If the current execution is multi-line, check if this command line is part of it.
            if (this._currentExecutionProperties?.isMultiLine && this._currentExecutionProperties.unresolvedCommandLines) {
                const subExecutionResult = isSubExecution(this._currentExecutionProperties.unresolvedCommandLines, commandLine);
                if (subExecutionResult) {
                    this._currentExecutionProperties.unresolvedCommandLines = subExecutionResult.unresolvedCommandLines;
                    return;
                }
            }
            this._currentExecution.endExecution(undefined);
            this._currentExecution.flush();
            this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._currentExecution.value, exitCode: undefined });
        }
        // Get the matching pending execution, how strict this is depends on the confidence of the
        // command line
        let currentExecution;
        if (commandLine.confidence === TerminalShellExecutionCommandLineConfidence.High) {
            for (const [i, execution] of this._pendingExecutions.entries()) {
                if (execution.value.commandLine.value === commandLine.value) {
                    currentExecution = execution;
                    this._currentExecutionProperties = {
                        isMultiLine: false,
                        unresolvedCommandLines: undefined,
                    };
                    currentExecution = execution;
                    this._pendingExecutions.splice(i, 1);
                    break;
                }
                else {
                    const subExecutionResult = isSubExecution(splitAndSanitizeCommandLine(execution.value.commandLine.value), commandLine);
                    if (subExecutionResult) {
                        this._currentExecutionProperties = {
                            isMultiLine: true,
                            unresolvedCommandLines: subExecutionResult.unresolvedCommandLines,
                        };
                        currentExecution = execution;
                        this._pendingExecutions.splice(i, 1);
                        break;
                    }
                }
            }
        }
        else {
            currentExecution = this._pendingExecutions.shift();
        }
        // If there is no execution, create a new one
        if (!currentExecution) {
            // Fallback to the shell integration's cwd as the cwd may not have been restored after a reload
            currentExecution = new InternalTerminalShellExecution(commandLine, cwd ?? this._cwd);
        }
        this._currentExecution = currentExecution;
        this._onDidStartTerminalShellExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._currentExecution.value });
    }
    emitData(data) {
        this.currentExecution?.emitData(data);
    }
    endShellExecution(commandLine, exitCode) {
        // If the current execution is multi-line, don't end it until the next command line is
        // confirmed to not be a part of it.
        if (this._currentExecutionProperties?.isMultiLine) {
            if (this._currentExecutionProperties.unresolvedCommandLines && this._currentExecutionProperties.unresolvedCommandLines.length > 0) {
                return;
            }
        }
        if (this._currentExecution) {
            const commandLineForEvent = this._currentExecutionProperties?.isMultiLine ? this._currentExecution.value.commandLine : commandLine;
            this._currentExecution.endExecution(commandLineForEvent);
            const currentExecution = this._currentExecution;
            this._pendingEndingExecution = currentExecution;
            this._currentExecution = undefined;
            // IMPORTANT: Ensure the current execution's data events are flushed in order to
            // prevent data events firing after the end event fires.
            currentExecution.flush().then(() => {
                // Only fire if it's still the same execution, if it's changed it would have already
                // been fired.
                if (this._pendingEndingExecution === currentExecution) {
                    this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: currentExecution.value, exitCode });
                    this._pendingEndingExecution = undefined;
                }
            });
        }
    }
    setEnv(keys, values, isTrusted) {
        const env = {};
        for (let i = 0; i < keys.length; i++) {
            env[keys[i]] = values[i];
        }
        this._env = { value: env, isTrusted };
        this._fireChangeEvent();
    }
    setCwd(cwd) {
        let wasChanged = false;
        if (URI.isUri(this._cwd)) {
            wasChanged = !URI.isUri(cwd) || this._cwd.toString() !== cwd.toString();
        }
        else if (this._cwd !== cwd) {
            wasChanged = true;
        }
        if (wasChanged) {
            this._cwd = cwd;
            this._fireChangeEvent();
        }
    }
    _fireChangeEvent() {
        this._onDidRequestChangeShellIntegration.fire({ terminal: this._terminal, shellIntegration: this.value });
    }
}
class InternalTerminalShellExecution {
    constructor(_commandLine, cwd) {
        this._commandLine = _commandLine;
        this.cwd = cwd;
        this._isEnded = false;
        const that = this;
        this.value = {
            get commandLine() {
                return that._commandLine;
            },
            get cwd() {
                return that.cwd;
            },
            read() {
                return that._createDataStream();
            }
        };
    }
    _createDataStream() {
        if (!this._dataStream) {
            if (this._isEnded) {
                return AsyncIterableObject.EMPTY;
            }
            this._dataStream = new ShellExecutionDataStream();
        }
        return this._dataStream.createIterable();
    }
    emitData(data) {
        if (!this._isEnded) {
            this._dataStream?.emitData(data);
        }
    }
    endExecution(commandLine) {
        if (commandLine) {
            this._commandLine = commandLine;
        }
        this._dataStream?.endExecution();
        this._isEnded = true;
    }
    async flush() {
        if (this._dataStream) {
            await this._dataStream.flush();
            this._dataStream.dispose();
            this._dataStream = undefined;
        }
    }
}
class ShellExecutionDataStream extends Disposable {
    constructor() {
        super(...arguments);
        this._iterables = [];
        this._emitters = [];
    }
    createIterable() {
        if (!this._barrier) {
            this._barrier = new Barrier();
        }
        const barrier = this._barrier;
        const iterable = new AsyncIterableObject(async (emitter) => {
            this._emitters.push(emitter);
            await barrier.wait();
        });
        this._iterables.push(iterable);
        return iterable;
    }
    emitData(data) {
        for (const emitter of this._emitters) {
            emitter.emitOne(data);
        }
    }
    endExecution() {
        this._barrier?.open();
    }
    async flush() {
        await Promise.all(this._iterables.map(e => e.toPromise()));
    }
}
function splitAndSanitizeCommandLine(commandLine) {
    return commandLine
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}
/**
 * When executing something that the shell considers multiple commands, such as
 * a comment followed by a command, this needs to all be tracked under a single
 * execution.
 */
function isSubExecution(unresolvedCommandLines, commandLine) {
    if (unresolvedCommandLines.length === 0) {
        return false;
    }
    const newUnresolvedCommandLines = [...unresolvedCommandLines];
    const subExecutionLines = splitAndSanitizeCommandLine(commandLine.value);
    if (newUnresolvedCommandLines && newUnresolvedCommandLines.length > 0) {
        // If all sub-execution lines are in the command line, this is part of the
        // multi-line execution.
        while (newUnresolvedCommandLines.length > 0) {
            if (newUnresolvedCommandLines[0] !== subExecutionLines[0]) {
                break;
            }
            newUnresolvedCommandLines.shift();
            subExecutionLines.shift();
        }
        if (subExecutionLines.length === 0) {
            return { unresolvedCommandLines: newUnresolvedCommandLines };
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLDJDQUEyQyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDaEYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxXQUFXLEVBQTJGLE1BQU0sdUJBQXVCLENBQUM7QUFDN0ksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEUsT0FBTyxFQUFFLE9BQU8sRUFBYyxNQUFNLCtCQUErQixDQUFDO0FBQ3BFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxFQUE2QixNQUFNLCtCQUErQixDQUFDO0FBU3hHLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLGVBQWUsQ0FBbUMsa0NBQWtDLENBQUMsQ0FBQztBQUUvSCxJQUFNLCtCQUErQixHQUFyQyxNQUFNLCtCQUFnQyxTQUFRLFVBQVU7SUFlOUQsWUFDcUIsVUFBOEIsRUFDekIsdUJBQWlFO1FBRTFGLEtBQUssRUFBRSxDQUFDO1FBRmtDLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBeUI7UUFYbkYsNkJBQXdCLEdBQWdFLElBQUksR0FBRyxFQUFFLENBQUM7UUFFdkYseUNBQW9D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