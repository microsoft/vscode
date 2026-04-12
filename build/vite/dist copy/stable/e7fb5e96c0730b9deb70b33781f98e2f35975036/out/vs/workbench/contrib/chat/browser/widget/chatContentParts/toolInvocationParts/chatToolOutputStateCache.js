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
import { Event } from '../../../../../../../base/common/event.js';
import { LRUCache } from '../../../../../../../base/common/map.js';
import { createDecorator } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, WillSaveStateReason } from '../../../../../../../platform/storage/common/storage.js';
import { registerSingleton } from '../../../../../../../platform/instantiation/common/extensions.js';
export const IChatToolOutputStateCache = createDecorator('IChatToolOutputStateCache');
const CACHE_STORAGE_KEY = 'chat/toolOutputStateCache';
const CACHE_LIMIT = 100;
let ChatToolOutputStateCache = class ChatToolOutputStateCache {
    constructor(storageService) {
        this._cache = new LRUCache(CACHE_LIMIT, 0.75);
        // Restore cached states from storage
        const raw = storageService.get(CACHE_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */, '{}');
        this._deserialize(raw);
        // Store cached states on shutdown
        const onWillSaveStateBecauseOfShutdown = Event.filter(storageService.onWillSaveState, e => e.reason === WillSaveStateReason.SHUTDOWN);
        Event.once(onWillSaveStateBecauseOfShutdown)(() => {
            storageService.store(CACHE_STORAGE_KEY, this._serialize(), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        });
    }
    get(toolCallId) {
        return this._cache.get(toolCallId);
    }
    set(toolCallId, state) {
        this._cache.set(toolCallId, state);
    }
    _serialize() {
        const data = Object.create(null);
        for (const [key, value] of this._cache) {
            data[key] = value;
        }
        return JSON.stringify(data);
    }
    _deserialize(raw) {
        try {
            const data = JSON.parse(raw);
            for (const key in data) {
                const state = data[key];
                // Validate the shape of the cached data
                if (typeof state.webviewOrigin === 'string' && typeof state.height === 'number') {
                    this._cache.set(key, state);
                }
            }
        }
        catch {
            // ignore parse errors
        }
    }
};
ChatToolOutputStateCache = __decorate([
    __param(0, IStorageService)
], ChatToolOutputStateCache);
export { ChatToolOutputStateCache };
registerSingleton(IChatToolOutputStateCache, ChatToolOutputStateCache, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvb2xPdXRwdXRTdGF0ZUNhY2hlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xPdXRwdXRTdGF0ZUNhY2hlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQStCLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDNUksT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBUXhILE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGVBQWUsQ0FBNEIsMkJBQTJCLENBQUMsQ0FBQztBQVNqSCxNQUFNLGlCQUFpQixHQUFHLDJCQUEyQixDQUFDO0FBQ3RELE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQztBQUVqQixJQUFNLHdCQUF3QixHQUE5QixNQUFNLHdCQUF3QjtJQU1wQyxZQUE2QixjQUErQjtRQUYzQyxXQUFNLEdBQUcsSUFBSSxRQUFRLENBQXVCLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUcvRSxxQ0FBcUM7UUFDckMsTUFBTSxHQUFHLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsa0NBQTBCLElBQUksQ0FBQyxDQUFDO1FBQ2hGLElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFdkIsa0NBQWtDO1FBQ2xDLE1BQU0sZ0NBQWdDLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0SSxLQUFLLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLENBQUMsR0FBRyxFQUFFO1lBQ2pELGNBQWMsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxnRUFBZ0QsQ0FBQztRQUMzRyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxHQUFHLENBQUMsVUFBa0I7UUFDckIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQsR0FBRyxDQUFDLFVBQWtCLEVBQUUsS0FBbUI7UUFDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFTyxVQUFVO1FBQ2pCLE1BQU0sSUFBSSxHQUFpQyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQy9ELEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDeEMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQztRQUNuQixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFTyxZQUFZLENBQUMsR0FBVztRQUMvQixJQUFJLENBQUM7WUFDSixNQUFNLElBQUksR0FBaUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMzRCxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUN4QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3hCLHdDQUF3QztnQkFDeEMsSUFBSSxPQUFPLEtBQUssQ0FBQyxhQUFhLEtBQUssUUFBUSxJQUFJLE9BQU8sS0FBSyxDQUFDLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDakYsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUM3QixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixzQkFBc0I7UUFDdkIsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFBO0FBaERZLHdCQUF3QjtJQU12QixXQUFBLGVBQWUsQ0FBQTtHQU5oQix3QkFBd0IsQ0FnRHBDOztBQUVELGlCQUFpQixDQUFDLHlCQUF5QixFQUFFLHdCQUF3QixvQ0FBNEIsQ0FBQyJ9