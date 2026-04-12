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
import { Disposable, toDisposable } from '../../base/common/lifecycle.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';
export const IServerLifetimeService = createDecorator('serverLifetimeService');
export const SHUTDOWN_TIMEOUT = 5 * 60 * 1000;
let ServerLifetimeService = class ServerLifetimeService extends Disposable {
    constructor(_options, _logService) {
        super();
        this._options = _options;
        this._logService = _logService;
        this._consumers = new Map();
        this._totalCount = 0;
        if (this._options.enableAutoShutdown) {
            // Start initial shutdown timer (no clients connected yet)
            this._scheduleShutdown(true);
        }
    }
    get hasActiveConsumers() {
        return this._totalCount > 0;
    }
    active(consumer) {
        const wasEmpty = this._totalCount === 0;
        const current = this._consumers.get(consumer) ?? 0;
        this._consumers.set(consumer, current + 1);
        this._totalCount++;
        this._logService.debug(`ServerLifetime: consumer '${consumer}' active (total: ${this._totalCount})`);
        if (wasEmpty) {
            this._cancelShutdown();
        }
        let disposed = false;
        return toDisposable(() => {
            if (disposed) {
                return;
            }
            disposed = true;
            const count = this._consumers.get(consumer);
            if (count !== undefined) {
                if (count <= 1) {
                    this._consumers.delete(consumer);
                }
                else {
                    this._consumers.set(consumer, count - 1);
                }
            }
            this._totalCount--;
            this._logService.debug(`ServerLifetime: consumer '${consumer}' inactive (total: ${this._totalCount})`);
            if (this._totalCount === 0 && this._options.enableAutoShutdown) {
                this._scheduleShutdown(false);
            }
        });
    }
    delay() {
        if (this._shutdownTimer) {
            this._logService.debug('ServerLifetime: delay requested, resetting shutdown timer');
            this._cancelShutdown();
            this._scheduleShutdown(false);
        }
    }
    _scheduleShutdown(initial) {
        if (this._options.shutdownWithoutDelay && !initial) {
            this._tryShutdown();
        }
        else {
            this._logService.debug('ServerLifetime: scheduling shutdown timer');
            this._shutdownTimer = setTimeout(() => {
                this._shutdownTimer = undefined;
                this._tryShutdown();
            }, SHUTDOWN_TIMEOUT);
        }
    }
    _tryShutdown() {
        if (this._totalCount > 0) {
            this._logService.debug('ServerLifetime: consumer became active, aborting shutdown');
            return;
        }
        console.log('All consumers inactive, shutting down');
        this._logService.info('ServerLifetime: all consumers inactive, shutting down');
        this.dispose();
        process.exit(0);
    }
    _cancelShutdown() {
        if (this._shutdownTimer) {
            this._logService.debug('ServerLifetime: cancelling shutdown timer');
            clearTimeout(this._shutdownTimer);
            this._shutdownTimer = undefined;
        }
    }
};
ServerLifetimeService = __decorate([
    __param(1, ILogService)
], ServerLifetimeService);
export { ServerLifetimeService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyTGlmZXRpbWVTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2VydmVyL25vZGUvc2VydmVyTGlmZXRpbWVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQWUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDdkYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUvRCxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxlQUFlLENBQXlCLHVCQUF1QixDQUFDLENBQUM7QUFFdkcsTUFBTSxDQUFDLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUM7QUFtQ3ZDLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXNCLFNBQVEsVUFBVTtJQU9wRCxZQUNrQixRQUFnQyxFQUNwQyxXQUF5QztRQUV0RCxLQUFLLEVBQUUsQ0FBQztRQUhTLGFBQVEsR0FBUixRQUFRLENBQXdCO1FBQ25CLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBTnRDLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUNoRCxnQkFBVyxHQUFHLENBQUMsQ0FBQztRQVN2QixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUN0QywwREFBMEQ7WUFDMUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDckIsT0FBTyxJQUFJLENBQUMsV0FBVyxHQUFHLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBRUQsTUFBTSxDQUFDLFFBQWdCO1FBQ3RC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