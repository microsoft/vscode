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
var AiEmbeddingVectorService_1;
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { createCancelablePromise, raceCancellablePromises, timeout } from '../../../../base/common/async.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ILogService } from '../../../../platform/log/common/log.js';
export const IAiEmbeddingVectorService = createDecorator('IAiEmbeddingVectorService');
let AiEmbeddingVectorService = class AiEmbeddingVectorService {
    static { AiEmbeddingVectorService_1 = this; }
    static { this.DEFAULT_TIMEOUT = 1000 * 10; } // 10 seconds
    constructor(logService) {
        this.logService = logService;
        this._providers = [];
    }
    isEnabled() {
        return this._providers.length > 0;
    }
    registerAiEmbeddingVectorProvider(model, provider) {
        this._providers.push(provider);
        return {
            dispose: () => {
                const index = this._providers.indexOf(provider);
                if (index >= 0) {
                    this._providers.splice(index, 1);
                }
            }
        };
    }
    async getEmbeddingVector(strings, token) {
        if (this._providers.length === 0) {
            throw new Error('No embedding vector providers registered');
        }
        const stopwatch = StopWatch.create();
        const cancellablePromises = [];
        const timer = timeout(AiEmbeddingVectorService_1.DEFAULT_TIMEOUT);
        const disposable = token.onCancellationRequested(() => {
            disposable.dispose();
            timer.cancel();
        });
        for (const provider of this._providers) {
            cancellablePromises.push(createCancelablePromise(async (t) => {
                try {
                    return await provider.provideAiEmbeddingVector(Array.isArray(strings) ? strings : [strings], t);
                }
                catch (e) {
                    // logged in extension host
                }
                // Wait for the timer to finish to allow for another provider to resolve.
                // Alternatively, if something resolved, or we've timed out, this will throw
                // as expected.
                await timer;
                throw new Error('Embedding vector provider timed out');
            }));
        }
        cancellablePromises.push(createCancelablePromise(async (t) => {
            const disposable = t.onCancellationRequested(() => {
                timer.cancel();
                disposable.dispose();
            });
            await timer;
            throw new Error('Embedding vector provider timed out');
        }));
        try {
            const result = await raceCancellablePromises(cancellablePromises);
            // If we have a single result, return it directly, otherwise return an array.
            // This aligns with the API overloads.
            if (result.length === 1) {
                return result[0];
            }
            return result;
        }
        finally {
            stopwatch.stop();
            this.logService.trace(`[AiEmbeddingVectorService]: getEmbeddingVector took ${stopwatch.elapsed()}ms`);
        }
    }
};
AiEmbeddingVectorService = AiEmbeddingVectorService_1 = __decorate([
    __param(0, ILogService)
], AiEmbeddingVectorService);
export { AiEmbeddingVectorService };
registerSingleton(IAiEmbeddingVectorService, AiEmbeddingVectorService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlFbWJlZGRpbmdWZWN0b3JTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2FpRW1iZWRkaW5nVmVjdG9yL2NvbW1vbi9haUVtYmVkZGluZ1ZlY3RvclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU3RixPQUFPLEVBQXFCLHVCQUF1QixFQUFFLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRWhJLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXJFLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGVBQWUsQ0FBNEIsMkJBQTJCLENBQUMsQ0FBQztBQWUxRyxJQUFNLHdCQUF3QixHQUE5QixNQUFNLHdCQUF3Qjs7YUFHcEIsb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBRSxBQUFaLENBQWEsR0FBQyxhQUFhO0lBSTFELFlBQXlCLFVBQXdDO1FBQXZCLGVBQVUsR0FBVixVQUFVLENBQWE7UUFGaEQsZUFBVSxHQUFpQyxFQUFFLENBQUM7SUFFTSxDQUFDO0lBRXRFLFNBQVM7UUFDUixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRUQsaUNBQWlDLENBQUMsS0FBYSxFQUFFLFFBQW9DO1FBQ3BGLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQy9CLE9BQU87WUFDTixPQUFPLEVBQUUsR0FB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