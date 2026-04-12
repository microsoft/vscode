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
import { Barrier } from '../../../../base/common/async.js';
import { ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { BasePty } from '../common/basePty.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { hasKey } from '../../../../base/common/types.js';
let RemotePty = class RemotePty extends BasePty {
    constructor(id, shouldPersist, _remoteTerminalChannel, _remoteAgentService, _logService) {
        super(id, shouldPersist);
        this._remoteTerminalChannel = _remoteTerminalChannel;
        this._remoteAgentService = _remoteAgentService;
        this._logService = _logService;
        this._startBarrier = new Barrier();
    }
    async start() {
        // Fetch the environment to check shell permissions
        const env = await this._remoteAgentService.getEnvironment();
        if (!env) {
            // Extension host processes are only allowed in remote extension hosts currently
            throw new Error('Could not fetch remote environment');
        }
        this._logService.trace('Spawning remote agent process', { terminalId: this.id });
        const startResult = await this._remoteTerminalChannel.start(this.id);
        if (startResult && hasKey(startResult, { message: true })) {
            // An error occurred
            return startResult;
        }
        this._startBarrier.open();
        return startResult;
    }
    async detach(forcePersist) {
        await this._startBarrier.wait();
        return this._remoteTerminalChannel.detachFromProcess(this.id, forcePersist);
    }
    shutdown(immediate) {
        this._startBarrier.wait().then(_ => {
            this._remoteTerminalChannel.shutdown(this.id, immediate);
        });
    }
    input(data) {
        if (this._inReplay) {
            return;
        }
        this._startBarrier.wait().then(_ => {
            this._remoteTerminalChannel.input(this.id, data);
        });
    }
    sendSignal(signal) {
        if (this._inReplay) {
            return;
        }
        this._startBarrier.wait().then(_ => {
            this._remoteTerminalChannel.sendSignal(this.id, signal);
        });
    }
    processBinary(e) {
        return this._remoteTerminalChannel.processBinary(this.id, e);
    }
    resize(cols, rows, pixelWidth, pixelHeight) {
        if (this._inReplay || this._lastDimensions.cols === cols && this._lastDimensions.rows === rows) {
            return;
        }
        this._startBarrier.wait().then(_ => {
            this._lastDimensions.cols = cols;
            this._lastDimensions.rows = rows;
            this._remoteTerminalChannel.resize(this.id, cols, rows, pixelWidth, pixelHeight);
        });
    }
    async clearBuffer() {
        await this._remoteTerminalChannel.clearBuffer(this.id);
    }
    freePortKillProcess(port) {
        if (!this._remoteTerminalChannel.freePortKillProcess) {
            throw new Error('freePortKillProcess does not exist on the local pty service');
        }
        return this._remoteTerminalChannel.freePortKillProcess(port);
    }
    acknowledgeDataEvent(charCount) {
        // Support flow control for server spawned processes
        if (this._inReplay) {
            return;
        }
        this._startBarrier.wait().then(_ => {
            this._remoteTerminalChannel.acknowledgeDataEvent(this.id, charCount);
        });
    }
    async setUnicodeVersion(version) {
        return this._remoteTerminalChannel.setUnicodeVersion(this.id, version);
    }
    async refreshProperty(type) {
        return this._remoteTerminalChannel.refreshProperty(this.id, type);
    }
    async updateProperty(type, value) {
        return this._remoteTerminalChannel.updateProperty(this.id, type, value);
    }
    handleOrphanQuestion() {
        this._remoteTerminalChannel.orphanQuestionReply(this.id);
    }
};
RemotePty = __decorate([
    __param(3, IRemoteAgentService),
    __param(4, ITerminalLogService)
], RemotePty);
export { RemotePty };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlUHR5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci9yZW1vdGVQdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBMkYsbUJBQW1CLEVBQXVCLE1BQU0sa0RBQWtELENBQUM7QUFDck0sT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBRS9DLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUVuRCxJQUFNLFNBQVMsR0FBZixNQUFNLFNBQVUsU0FBUSxPQUFPO0lBR3JDLFlBQ0MsRUFBVSxFQUNWLGFBQXNCLEVBQ0wsc0JBQW1ELEVBQzlCLG1CQUF3QyxFQUN4QyxXQUFnQztRQUV0RSxLQUFLLENBQUMsRUFBRSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBSlIsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUE2QjtRQUM5Qix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXFCO1FBQ3hDLGdCQUFXLEdBQVgsV0FBVyxDQUFxQjtRQUd0RSxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLO1FBQ1YsbURBQW1EO1FBQ25ELE1BQU0sR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQzVELElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNWLGdGQUFnRjtZQUNoRixNQUFNLElBQUksS0FBSyxDQUFDLG9DQUFvQyxDQUFDLENBQUM7UUFD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