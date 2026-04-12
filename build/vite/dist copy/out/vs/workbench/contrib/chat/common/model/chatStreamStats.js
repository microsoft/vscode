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
import { ILogService } from '../../../../../platform/log/common/log.js';
const MIN_BOOTSTRAP_TOTAL_TIME = 250;
const LARGE_BOOTSTRAP_MIN_TOTAL_TIME = 500;
const MAX_INTERVAL_TIME = 250;
const LARGE_UPDATE_MAX_INTERVAL_TIME = 1000;
const WORDS_FOR_LARGE_CHUNK = 10;
const MIN_UPDATES_FOR_STABLE_RATE = 2;
/**
 * Estimates the loading rate of a chat response stream so that we can try to match the rendering rate to
 * the rate at which text is actually produced by the model. This can only be an estimate for various reasons-
 * reasoning summaries don't represent real generated tokens, we don't have full visibility into tool calls,
 * some model providers send text in large chunks rather than a steady stream, e.g. Gemini, we don't know about
 * latency between agent requests, etc.
 *
 * When the first text is received, we don't know how long it actually took to generate. So we apply an assumed
 * minimum time, until we have received enough data to make a stable estimate. This is the "bootstrap" phase.
 *
 * Since we don't have visibility into when the model started generated tool call args, or when the client was running
 * a tool, we ignore long pauses. The ignore period is longer for large chunks, since those naturally take longer
 * to generate anyway.
 *
 * After that, the word load rate is estimated using the words received since the end of the bootstrap phase.
 */
let ChatStreamStatsTracker = class ChatStreamStatsTracker {
    constructor(logService) {
        this.logService = logService;
        const start = Date.now();
        this._data = {
            totalTime: 0,
            lastUpdateTime: start,
            impliedWordLoadRate: 0,
            lastWordCount: 0,
            firstMarkdownTime: undefined,
            bootstrapActive: true,
            wordCountAtBootstrapExit: undefined,
            updatesWithNewWords: 0
        };
        this._publicData = { impliedWordLoadRate: 0, lastWordCount: 0 };
    }
    get data() {
        return this._publicData;
    }
    get internalData() {
        return this._data;
    }
    update(totals) {
        const { totalWordCount: wordCount } = totals;
        if (wordCount === this._data.lastWordCount) {
            this.trace('Update- no new words');
            return undefined;
        }
        const now = Date.now();
        const newWords = wordCount - this._data.lastWordCount;
        const hadNoWordsBeforeUpdate = this._data.lastWordCount === 0;
        let firstMarkdownTime = this._data.firstMarkdownTime;
        let wordCountAtBootstrapExit = this._data.wordCountAtBootstrapExit;
        if (typeof firstMarkdownTime !== 'number' && wordCount > 0) {
            firstMarkdownTime = now;
        }
        const updatesWithNewWords = this._data.updatesWithNewWords + 1;
        if (hadNoWordsBeforeUpdate) {
            this._data.lastUpdateTime = now;
        }
        const intervalCap = newWords > WORDS_FOR_LARGE_CHUNK ? LARGE_UPDATE_MAX_INTERVAL_TIME : MAX_INTERVAL_TIME;
        const timeDiff = Math.min(now - this._data.lastUpdateTime, intervalCap);
        let totalTime = this._data.totalTime + timeDiff;
        const minBootstrapTotalTime = hadNoWordsBeforeUpdate && wordCount > WORDS_FOR_LARGE_CHUNK ? LARGE_BOOTSTRAP_MIN_TOTAL_TIME : MIN_BOOTSTRAP_TOTAL_TIME;
        let bootstrapActive = this._data.bootstrapActive;
        if (bootstrapActive) {
            const stableStartTime = firstMarkdownTime;
            const hasStableData = typeof stableStartTime === 'number'
                && updatesWithNewWords >= MIN_UPDATES_FOR_STABLE_RATE
                && wordCount >= WORDS_FOR_LARGE_CHUNK;
            if (hasStableData) {
                bootstrapActive = false;
                totalTime = Math.max(now - stableStartTime, timeDiff);
                wordCountAtBootstrapExit = this._data.lastWordCount;
                this.trace('Has stable data');
            }
            else {
                totalTime = Math.max(totalTime, minBootstrapTotalTime);
            }
        }
        const wordsSinceBootstrap = typeof wordCountAtBootstrapExit === 'number' ? Math.max(wordCount - wordCountAtBootstrapExit, 0) : wordCount;
        const effectiveTime = totalTime;
        const effectiveWordCount = bootstrapActive ? wordCount : wordsSinceBootstrap;
        const impliedWordLoadRate = effectiveTime > 0 ? effectiveWordCount / (effectiveTime / 1000) : 0;
        this._data = {
            totalTime,
            lastUpdateTime: now,
            impliedWordLoadRate,
            lastWordCount: wordCount,
            firstMarkdownTime,
            bootstrapActive,
            wordCountAtBootstrapExit,
            updatesWithNewWords
        };
        this._publicData = {
            impliedWordLoadRate,
            lastWordCount: wordCount
        };
        const traceWords = bootstrapActive ? wordCount : wordsSinceBootstrap;
        this.trace(`Update- got ${traceWords} words over last ${totalTime}ms = ${impliedWordLoadRate} words/s`);
        return this._data;
    }
    trace(message) {
        this.logService.trace(`ChatStreamStatsTracker#update: ${message}`);
    }
};
ChatStreamStatsTracker = __decorate([
    __param(0, ILogService)
], ChatStreamStatsTracker);
export { ChatStreamStatsTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFN0cmVhbVN0YXRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFN0cmVhbVN0YXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQW9CeEUsTUFBTSx3QkFBd0IsR0FBRyxHQUFHLENBQUM7QUFDckMsTUFBTSw4QkFBOEIsR0FBRyxHQUFHLENBQUM7QUFDM0MsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLENBQUM7QUFDOUIsTUFBTSw4QkFBOEIsR0FBRyxJQUFJLENBQUM7QUFDNUMsTUFBTSxxQkFBcUIsR0FBRyxFQUFFLENBQUM7QUFDakMsTUFBTSwyQkFBMkIsR0FBRyxDQUFDLENBQUM7QUFFdEM7Ozs7Ozs7Ozs7Ozs7OztHQWVHO0FBQ0ksSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBc0I7SUFJbEMsWUFDK0IsVUFBdUI7UUFBdkIsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUVyRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLEtBQUssR0FBRztZQUNaLFNBQVMsRUFBRSxDQUFDO1lBQ1osY0FBYyxFQUFFLEtBQUs7WUFDckIsbUJBQW1CLEVBQUUsQ0FBQztZQUN0QixhQUFhLEVBQUUsQ0FBQztZQUNoQixpQkFBaUIsRUFBRSxTQUFTO1lBQzVCLGVBQWUsRUFBRSxJQUFJO1lBQ3JCLHdCQUF3QixFQUFFLFNBQVM7WUFDbkMsbUJBQW1CLEVBQUUsQ0FBQztTQUN0QixDQUFDO1FBQ0YsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLG1CQUFtQixFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxFQUFFLENBQUM7SUFDakUsQ0FBQztJQUVELElBQUksSUFBSTtRQUNQLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQztJQUN6QixDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2YsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ25CLENBQUM7SUFFRCxNQUFNLENBQUMsTUFBeUI7UUFDL0IsTUFBTSxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsR0FBRyxNQUFNLENBQUM7UUFDN0MsSUFBSSxTQUFTLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7WUFDbkMsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUN2QixNQUFNLFFBQVEsR0FBRyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUM7UUFDdEQsTUFBTSxzQkFBc0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsS0FBSyxDQUFDLENBQUM7UUFDOUQsSUFBSSxpQkFBaUIsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDO1FBQ3JELElBQUksd0JBQXdCLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQztRQUNuRSxJQUFJLE9BQU8saUJBQWlCLEtBQUssUUFBUSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUM1RCxpQkFBaUIsR0FBRyxHQUFHLENBQUM7UUFDekIsQ0FBQztRQUNELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLENBQUM7UUFFL0QsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxLQUFLLENBQUMsY0FBYyxHQUFHLEdBQUcsQ0FBQztRQUNqQyxDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQUcsUUFBUSxHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUM7UUFDMUcsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDeEUsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDO1FBQ2hELE1BQU0scUJBQXFCLEdBQUcsc0JBQXNCLElBQUksU0FBUyxHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsd0JBQXdCLENBQUM7UUFFdEosSUFBSSxlQUFlLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUM7UUFDakQsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNyQixNQUFNLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztZQUMxQyxNQUFNLGFBQWEsR0FBRyxPQUFPLGVBQWUsS0FBSyxRQUFRO21CQUNyRCxtQkFBbUIsSUFBSSwyQkFBMkI7bUJBQ2xELFNBQVMsSUFBSSxxQkFBcUIsQ0FBQztZQUN2QyxJQUFJLGFBQWEsRUFBRSxDQUFDO2dCQUNuQixlQUFlLEdBQUcsS0FBSyxDQUFDO2dCQUN4QixTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsZUFBZSxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUN0RCx3QkFBd0IsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQztnQkFDcEQsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQy9CLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUscUJBQXFCLENBQUMsQ0FBQztZQUN4RCxDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyx3QkFBd0IsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxHQUFHLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDekksTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDO1FBQ2hDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDO1FBQzdFLE1BQU0sbUJBQW1CLEdBQUcsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEdBQUcsQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRyxJQUFJLENBQUMsS0FBSyxHQUFHO1lBQ1osU0FBUztZQUNULGNBQWMsRUFBRSxHQUFHO1lBQ25CLG1CQUFtQjtZQUNuQixhQUFhLEVBQUUsU0FBUztZQUN4QixpQkFBaUI7WUFDakIsZUFBZTtZQUNmLHdCQUF3QjtZQUN4QixtQkFBbUI7U0FDbkIsQ0FBQztRQUNGLElBQUksQ0FBQyxXQUFXLEdBQUc7WUFDbEIsbUJBQW1CO1lBQ25CLGFBQWEsRUFBRSxTQUFTO1NBQ3hCLENBQUM7UUFFRixNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLFVBQVUsb0JBQW9CLFNBQVMsUUFBUSxtQkFBbUIsVUFBVSxDQUFDLENBQUM7UUFDeEcsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ25CLENBQUM7SUFFTyxLQUFLLENBQUMsT0FBZTtRQUM1QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUNwRSxDQUFDO0NBQ0QsQ0FBQTtBQWxHWSxzQkFBc0I7SUFLaEMsV0FBQSxXQUFXLENBQUE7R0FMRCxzQkFBc0IsQ0FrR2xDIn0=