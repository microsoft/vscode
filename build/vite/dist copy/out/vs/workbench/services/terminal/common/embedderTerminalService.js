/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
export const IEmbedderTerminalService = createDecorator('embedderTerminalService');
class EmbedderTerminalService {
    constructor() {
        this._onDidCreateTerminal = new Emitter();
        this.onDidCreateTerminal = Event.buffer(this._onDidCreateTerminal.event, 'onDidCreateTerminal');
    }
    createTerminal(options) {
        const slc = {
            name: options.name,
            isFeatureTerminal: true,
            customPtyImplementation(terminalId, cols, rows) {
                return new EmbedderTerminalProcess(terminalId, options.pty);
            },
        };
        this._onDidCreateTerminal.fire(slc);
    }
}
class EmbedderTerminalProcess extends Disposable {
    constructor(id, pty) {
        super();
        this.id = id;
        this.shouldPersist = false;
        this._onProcessReady = this._register(new Emitter());
        this.onProcessReady = this._onProcessReady.event;
        this._onDidChangeProperty = this._register(new Emitter());
        this.onDidChangeProperty = this._onDidChangeProperty.event;
        this._onProcessExit = this._register(new Emitter());
        this.onProcessExit = this._onProcessExit.event;
        this._pty = pty;
        this.onProcessData = this._pty.onDidWrite;
        if (this._pty.onDidClose) {
            this._register(this._pty.onDidClose(e => this._onProcessExit.fire(e || undefined)));
        }
        if (this._pty.onDidChangeName) {
            this._register(this._pty.onDidChangeName(e => this._onDidChangeProperty.fire({
                type: "title" /* ProcessPropertyType.Title */,
                value: e
            })));
        }
    }
    async start() {
        this._onProcessReady.fire({ pid: -1, cwd: '', windowsPty: undefined });
        this._pty.open();
        return undefined;
    }
    shutdown() {
        this._pty.close();
    }
    // TODO: A lot of these aren't useful for some implementations of ITerminalChildProcess, should
    // they be optional? Should there be a base class for "external" consumers to implement?
    input() {
        // not supported
    }
    sendSignal() {
        // not supported
    }
    async processBinary() {
        // not supported
    }
    resize() {
        // no-op
    }
    clearBuffer() {
        // no-op
    }
    acknowledgeDataEvent() {
        // no-op, flow control not currently implemented
    }
    async setUnicodeVersion() {
        // no-op
    }
    async getInitialCwd() {
        return '';
    }
    async getCwd() {
        return '';
    }
    refreshProperty(property) {
        throw new Error(`refreshProperty is not suppported in EmbedderTerminalProcess. property: ${property}`);
    }
    updateProperty(property, value) {
        throw new Error(`updateProperty is not suppported in EmbedderTerminalProcess. property: ${property}, value: ${value}`);
    }
}
registerSingleton(IEmbedderTerminalService, EmbedderTerminalService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1iZWRkZXJUZXJtaW5hbFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGVybWluYWwvY29tbW9uL2VtYmVkZGVyVGVybWluYWxTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsZUFBZSxDQUEyQix5QkFBeUIsQ0FBQyxDQUFDO0FBMkM3RyxNQUFNLHVCQUF1QjtJQUE3QjtRQUdrQix5QkFBb0IsR0FBRyxJQUFJLE9BQU8sRUFBc0IsQ0FBQztRQUNqRSx3QkFBbUIsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQVlyRyxDQUFDO0lBVkEsY0FBYyxDQUFDLE9BQWlDO1FBQy9DLE1BQU0sR0FBRyxHQUFxQjtZQUM3QixJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUk7WUFDbEIsaUJBQWlCLEVBQUUsSUFBSTtZQUN2Qix1QkFBdUIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQzdDLE9BQU8sSUFBSSx1QkFBdUIsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzdELENBQUM7U0FDRCxDQUFDO1FBQ0YsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMs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