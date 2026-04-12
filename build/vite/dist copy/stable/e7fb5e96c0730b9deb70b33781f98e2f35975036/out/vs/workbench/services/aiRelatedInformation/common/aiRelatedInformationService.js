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
var AiRelatedInformationService_1;
import { createCancelablePromise, raceTimeout } from '../../../../base/common/async.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAiRelatedInformationService } from './aiRelatedInformation.js';
let AiRelatedInformationService = class AiRelatedInformationService {
    static { AiRelatedInformationService_1 = this; }
    static { this.DEFAULT_TIMEOUT = 1000 * 10; } // 10 seconds
    constructor(logService) {
        this.logService = logService;
        this._providers = new Map();
    }
    isEnabled() {
        return this._providers.size > 0;
    }
    registerAiRelatedInformationProvider(type, provider) {
        const providers = this._providers.get(type) ?? [];
        providers.push(provider);
        this._providers.set(type, providers);
        return {
            dispose: () => {
                const providers = this._providers.get(type) ?? [];
                const index = providers.indexOf(provider);
                if (index !== -1) {
                    providers.splice(index, 1);
                }
                if (providers.length === 0) {
                    this._providers.delete(type);
                }
            }
        };
    }
    async getRelatedInformation(query, types, token) {
        if (this._providers.size === 0) {
            throw new Error('No related information providers registered');
        }
        // get providers for each type
        const providers = [];
        for (const type of types) {
            const typeProviders = this._providers.get(type);
            if (typeProviders) {
                providers.push(...typeProviders);
            }
        }
        if (providers.length === 0) {
            throw new Error('No related information providers registered for the given types');
        }
        const stopwatch = StopWatch.create();
        const cancellablePromises = providers.map((provider) => {
            return createCancelablePromise(async (t) => {
                try {
                    const result = await provider.provideAiRelatedInformation(query, t);
                    // double filter just in case
                    return result.filter(r => types.includes(r.type));
                }
                catch (e) {
                    // logged in extension host
                }
                return [];
            });
        });
        try {
            const results = await raceTimeout(Promise.allSettled(cancellablePromises), AiRelatedInformationService_1.DEFAULT_TIMEOUT, () => {
                cancellablePromises.forEach(p => p.cancel());
                this.logService.warn('[AiRelatedInformationService]: Related information provider timed out');
            });
            if (!results) {
                return [];
            }
            const result = results
                .filter(r => r.status === 'fulfilled')
                .flatMap(r => r.value);
            return result;
        }
        finally {
            stopwatch.stop();
            this.logService.trace(`[AiRelatedInformationService]: getRelatedInformation took ${stopwatch.elapsed()}ms`);
        }
    }
};
AiRelatedInformationService = AiRelatedInformationService_1 = __decorate([
    __param(0, ILogService)
], AiRelatedInformationService);
export { AiRelatedInformationService };
registerSingleton(IAiRelatedInformationService, AiRelatedInformationService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2FpUmVsYXRlZEluZm9ybWF0aW9uL2NvbW1vbi9haVJlbGF0ZWRJbmZvcm1hdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0csT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLDRCQUE0QixFQUFtRixNQUFNLDJCQUEyQixDQUFDO0FBRW5KLElBQU0sMkJBQTJCLEdBQWpDLE1BQU0sMkJBQTJCOzthQUd2QixvQkFBZSxHQUFHLElBQUksR0FBRyxFQUFFLEFBQVosQ0FBYSxHQUFDLGFBQWE7SUFJMUQsWUFBeUIsVUFBd0M7UUFBdkIsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUZoRCxlQUFVLEdBQWlFLElBQUksR0FBRyxFQUFFLENBQUM7SUFFakMsQ0FBQztJQUV0RSxTQUFTO1FBQ1IsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVELG9DQUFvQyxDQUFDLElBQTRCLEVBQUUsUUFBdUM7UUFDekcsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xELFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDekIsSUFBSSxD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