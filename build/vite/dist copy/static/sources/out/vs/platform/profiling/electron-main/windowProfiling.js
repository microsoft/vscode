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
import { timeout } from '../../../base/common/async.js';
import { ILogService } from '../../log/common/log.js';
let WindowProfiler = class WindowProfiler {
    constructor(_window, _sessionId, _logService) {
        this._window = _window;
        this._sessionId = _sessionId;
        this._logService = _logService;
    }
    async inspect(duration) {
        await this._connect();
        const inspector = this._window.webContents.debugger;
        await inspector.sendCommand('Profiler.start');
        this._logService.warn('[perf] profiling STARTED', this._sessionId);
        await timeout(duration);
        const data = await inspector.sendCommand('Profiler.stop');
        this._logService.warn('[perf] profiling DONE', this._sessionId);
        await this._disconnect();
        return data.profile;
    }
    async _connect() {
        const inspector = this._window.webContents.debugger;
        inspector.attach();
        await inspector.sendCommand('Profiler.enable');
    }
    async _disconnect() {
        const inspector = this._window.webContents.debugger;
        await inspector.sendCommand('Profiler.disable');
        inspector.detach();
    }
};
WindowProfiler = __decorate([
    __param(2, ILogService)
], WindowProfiler);
export { WindowProfiler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93UHJvZmlsaW5nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcHJvZmlsaW5nL2VsZWN0cm9uLW1haW4vd2luZG93UHJvZmlsaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFHL0MsSUFBTSxjQUFjLEdBQXBCLE1BQU0sY0FBYztJQUUxQixZQUNrQixPQUFzQixFQUN0QixVQUFrQixFQUNMLFdBQXdCO1FBRnJDLFlBQU8sR0FBUCxPQUFPLENBQWU7UUFDdEIsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUNMLGdCQUFXLEdBQVgsV0FBVyxDQUFhO0lBQ25ELENBQUM7SUFFTCxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQWdCO1FBRTdCLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRXRCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQztRQUNwRCxNQUFNLFNBQVMsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUM5QyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQywwQkFBMEIsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkUsTUFBTSxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDeEIsTUFBTSxJQUFJLEdBQWtCLE1BQU0sU0FBUyxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFaEUsTUFBTSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDekIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDO0lBQ3JCLENBQUM7SUFFTyxLQUFLLENBQUMsUUFBUTtRQUNyQixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUM7UUFDcEQsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ25CLE1BQU0sU0FBUyxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVztRQUN4QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUM7UUFDcEQsTUFBTSxTQUFTLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDaEQsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3BCLENBQUM7Q0FDRCxDQUFBO0FBbENZLGNBQWM7SUFLeEIsV0FBQSxXQUFXLENBQUE7R0FMRCxjQUFjLENBa0MxQiJ9