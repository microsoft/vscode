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
var InlineCompletionsService_1;
import { TimeoutTimer } from '../../../base/common/async.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../nls.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry.js';
export const IInlineCompletionsService = createDecorator('IInlineCompletionsService');
const InlineCompletionsSnoozing = new RawContextKey('inlineCompletions.snoozed', false, localize('inlineCompletions.snoozed', "Whether inline completions are currently snoozed"));
let InlineCompletionsService = class InlineCompletionsService extends Disposable {
    static { InlineCompletionsService_1 = this; }
    static { this.SNOOZE_DURATION = 300_000; } // 5 minutes
    get snoozeTimeLeft() {
        if (this._snoozeTimeEnd === undefined) {
            return 0;
        }
        return Math.max(0, this._snoozeTimeEnd - Date.now());
    }
    constructor(_contextKeyService, _telemetryService) {
        super();
        this._contextKeyService = _contextKeyService;
        this._telemetryService = _telemetryService;
        this._onDidChangeIsSnoozing = this._register(new Emitter());
        this.onDidChangeIsSnoozing = this._onDidChangeIsSnoozing.event;
        this._snoozeTimeEnd = undefined;
        this._recentCompletionIds = [];
        this._timer = this._register(new TimeoutTimer());
        const inlineCompletionsSnoozing = InlineCompletionsSnoozing.bindTo(this._contextKeyService);
        this._register(this.onDidChangeIsSnoozing(() => inlineCompletionsSnoozing.set(this.isSnoozing())));
    }
    snooze(durationMs = InlineCompletionsService_1.SNOOZE_DURATION) {
        this.setSnoozeDuration(durationMs + this.snoozeTimeLeft);
    }
    setSnoozeDuration(durationMs) {
        if (durationMs < 0) {
            throw new BugIndicatingError(`Invalid snooze duration: ${durationMs}. Duration must be non-negative.`);
        }
        if (durationMs === 0) {
            this.cancelSnooze();
            return;
        }
        const wasSnoozing = this.isSnoozing();
        const timeLeft = this.snoozeTimeLeft;
        this._snoozeTimeEnd = Date.now() + durationMs;
        if (!wasSnoozing) {
            this._onDidChangeIsSnoozing.fire(true);
        }
        this._timer.cancelAndSet(() => {
            if (!this.isSnoozing()) {
                this._onDidChangeIsSnoozing.fire(false);
            }
            else {
                throw new BugIndicatingError('Snooze timer did not fire as expected');
            }
        }, this.snoozeTimeLeft + 1);
        this._reportSnooze(durationMs - timeLeft, durationMs);
    }
    isSnoozing() {
        return this.snoozeTimeLeft > 0;
    }
    cancelSnooze() {
        if (this.isSnoozing()) {
            this._reportSnooze(-this.snoozeTimeLeft, 0);
            this._snoozeTimeEnd = undefined;
            this._timer.cancel();
            this._onDidChangeIsSnoozing.fire(false);
        }
    }
    reportNewCompletion(requestUuid) {
        this._lastCompletionId = requestUuid;
        this._recentCompletionIds.unshift(requestUuid);
        if (this._recentCompletionIds.length > 5) {
            this._recentCompletionIds.pop();
        }
    }
    _reportSnooze(deltaMs, totalMs) {
        const deltaSeconds = Math.round(deltaMs / 1000);
        const totalSeconds = Math.round(totalMs / 1000);
        this._telemetryService.publicLog2('inlineCompletions.snooze', {
            deltaSeconds,
            totalSeconds,
            lastCompletionId: this._lastCompletionId,
            recentCompletionIds: this._recentCompletionIds,
        });
    }
};
InlineCompletionsService = InlineCompletionsService_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, ITelemetryService)
], InlineCompletionsService);
export { InlineCompletionsService };
registerSingleton(IInlineCompletionsService, InlineCompletionsService, 1 /* InstantiationType.Delayed */);
const snoozeInlineSuggestId = 'editor.action.inlineSuggest.snooze';
const cancelSnoozeInlineSuggestId = 'editor.action.inlineSuggest.cancelSnooze';
const LAST_SNOOZE_DURATION_KEY = 'inlineCompletions.lastSnoozeDuration';
export class SnoozeInlineCompletion extends Action2 {
    static { this.ID = snoozeInlineSuggestId; }
    constructor() {
        super({
            id: SnoozeInlineCompletion.ID,
            title: localize2('action.inlineSuggest.snooze', "Snooze Inline Suggestions"),
            precondition: ContextKeyExpr.true(),
            f1: true,
        });
    }
    async run(accessor, ...args) {
        const quickInputService = accessor.get(IQuickInputService);
        const inlineCompletionsService = accessor.get(IInlineCompletionsService);
        const storageService = accessor.get(IStorageService);
        let durationMs;
        if (args.length > 0 && typeof args[0] === 'number') {
            durationMs = args[0] * 60_000;
        }
        if (!durationMs) {
            durationMs = await this.getDurationFromUser(quickInputService, storageService);
        }
        if (durationMs) {
            inlineCompletionsService.setSnoozeDuration(durationMs);
        }
    }
    async getDurationFromUser(quickInputService, storageService) {
        const lastSelectedDuration = storageService.getNumber(LAST_SNOOZE_DURATION_KEY, 0 /* StorageScope.PROFILE */, 300_000);
        const items = [
            { label: '1 minute', id: '1', value: 60_000 },
            { label: '5 minutes', id: '5', value: 300_000 },
            { label: '10 minutes', id: '10', value: 600_000 },
            { label: '15 minutes', id: '15', value: 900_000 },
            { label: '30 minutes', id: '30', value: 1_800_000 },
            { label: '60 minutes', id: '60', value: 3_600_000 }
        ];
        const picked = await quickInputService.pick(items, {
            placeHolder: localize('snooze.placeholder', "Select snooze duration for Inline Suggestions"),
            activeItem: items.find(item => item.value === lastSelectedDuration),
        });
        if (picked) {
            storageService.store(LAST_SNOOZE_DURATION_KEY, picked.value, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            return picked.value;
        }
        return undefined;
    }
}
export class CancelSnoozeInlineCompletion extends Action2 {
    static { this.ID = cancelSnoozeInlineSuggestId; }
    constructor() {
        super({
            id: CancelSnoozeInlineCompletion.ID,
            title: localize2('action.inlineSuggest.cancelSnooze', "Cancel Snooze Inline Suggestions"),
            precondition: InlineCompletionsSnoozing,
            f1: true,
        });
    }
    async run(accessor) {
        accessor.get(IInlineCompletionsService).cancelSnooze();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvaW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDN0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RILE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUM1RyxPQUFPLEVBQUUsZUFBZSxFQUFvQixNQUFNLHlEQUF5RCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0IsTUFBTSxtREFBbUQsQ0FBQztBQUN2RyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLDZDQUE2QyxDQUFDO0FBQzNHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRXBGLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGVBQWUsQ0FBNEIsMkJBQTJCLENBQUMsQ0FBQztBQXVDakgsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLGFBQWEsQ0FBVSwyQkFBMkIsRUFBRSxLQUFLLEVB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