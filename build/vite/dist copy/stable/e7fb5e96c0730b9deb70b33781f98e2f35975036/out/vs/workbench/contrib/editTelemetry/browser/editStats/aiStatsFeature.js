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
import { sumBy } from '../../../../../base/common/arrays.js';
import { TaskQueue, timeout } from '../../../../../base/common/async.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, mapObservableArrayCached, observableValue, runOnChange } from '../../../../../base/common/observable.js';
import { AnnotatedStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { isAiEdit, isUserEdit } from '../../../../../editor/common/textModelEditSource.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { AiStatsStatusBar } from './aiStatsStatusBar.js';
let AiStatsFeature = class AiStatsFeature extends Disposable {
    constructor(annotatedDocuments, _storageService, _instantiationService) {
        super();
        this._storageService = _storageService;
        this._instantiationService = _instantiationService;
        this._dataVersion = observableValue(this, 0);
        this.aiRate = this._dataVersion.map(() => {
            const val = this._data.getValue();
            if (!val) {
                return 0;
            }
            const r = average(val.sessions, session => {
                const sum = session.typedCharacters + session.aiCharacters;
                if (sum === 0) {
                    return 0;
                }
                return session.aiCharacters / sum;
            });
            return r;
        });
        this.sessionCount = derived(this, r => {
            this._dataVersion.read(r);
            const val = this._data.getValue();
            if (!val) {
                return 0;
            }
            return val.sessions.length;
        });
        this.sessions = derived(this, r => {
            this._dataVersion.read(r);
            const val = this._data.getValue();
            if (!val) {
                return [];
            }
            return val.sessions;
        });
        this.acceptedInlineSuggestionsToday = derived(this, r => {
            this._dataVersion.read(r);
            const val = this._data.getValue();
            if (!val) {
                return 0;
            }
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const sessionsToday = val.sessions.filter(s => s.startTime > startOfToday.getTime());
            return sumBy(sessionsToday, s => s.acceptedInlineSuggestions ?? 0);
        });
        const storedValue = getStoredValue(this._storageService, 'aiStats', 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
        this._data = rateLimitWrite(storedValue, 1 / 60, this._store);
        this.aiRate.recomputeInitiallyAndOnChange(this._store);
        this._register(autorun(reader => {
            reader.store.add(this._instantiationService.createInstance(AiStatsStatusBar.hot.read(reader), this));
        }));
        const lastRequestIds = [];
        const obs = mapObservableArrayCached(this, annotatedDocuments.documents, (doc, store) => {
            store.add(runOnChange(doc.documentWithAnnotations.value, (_val, _prev, edit) => {
                const e = AnnotatedStringEdit.compose(edit.map(e => e.edit));
                const curSession = new Lazy(() => this._getDataAndSession());
                for (const r of e.replacements) {
                    if (isAiEdit(r.data.editSource)) {
                        curSession.value.currentSession.aiCharacters += r.newText.length;
                    }
                    else if (isUserEdit(r.data.editSource)) {
                        curSession.value.currentSession.typedCharacters += r.newText.length;
                    }
                }
                if (e.replacements.length > 0) {
                    const sessionToUpdate = curSession.value.currentSession;
                    const s = e.replacements[0].data.editSource;
                    if (s.metadata.source === 'inlineCompletionAccept') {
                        if (sessionToUpdate.acceptedInlineSuggestions === undefined) {
                            sessionToUpdate.acceptedInlineSuggestions = 0;
                        }
                        sessionToUpdate.acceptedInlineSuggestions += 1;
                    }
                    if (s.metadata.source === 'Chat.applyEdits' && s.metadata.$$requestId !== undefined) {
                        const didSeeRequestId = lastRequestIds.includes(s.metadata.$$requestId);
                        if (!didSeeRequestId) {
                            lastRequestIds.push(s.metadata.$$requestId);
                            if (lastRequestIds.length > 10) {
                                lastRequestIds.shift();
                            }
                            if (sessionToUpdate.chatEditCount === undefined) {
                                sessionToUpdate.chatEditCount = 0;
                            }
                            sessionToUpdate.chatEditCount += 1;
                        }
                    }
                }
                if (curSession.hasValue) {
                    this._data.writeValue(curSession.value.data);
                    this._dataVersion.set(this._dataVersion.get() + 1, undefined);
                }
            }));
        });
        obs.recomputeInitiallyAndOnChange(this._store);
    }
    _getDataAndSession() {
        const state = this._data.getValue() ?? { sessions: [] };
        const sessionLengthMs = 5 * 60 * 1000; // 5 minutes
        let lastSession = state.sessions.at(-1);
        const nowTime = Date.now();
        if (!lastSession || nowTime - lastSession.startTime > sessionLengthMs) {
            state.sessions.push({
                startTime: nowTime,
                typedCharacters: 0,
                aiCharacters: 0,
                acceptedInlineSuggestions: 0,
                chatEditCount: 0,
            });
            lastSession = state.sessions.at(-1);
            const dayMs = 24 * 60 * 60 * 1000; // 24h
            // Clean up old sessions, keep only the last 24h worth of sessions
            while (state.sessions.length > dayMs / sessionLengthMs) {
                state.sessions.shift();
            }
        }
        return { data: state, currentSession: lastSession };
    }
};
AiStatsFeature = __decorate([
    __param(1, IStorageService),
    __param(2, IInstantiationService)
], AiStatsFeature);
export { AiStatsFeature };
function average(arr, selector) {
    if (arr.length === 0) {
        return 0;
    }
    const s = sumBy(arr, selector);
    return s / arr.length;
}
function rateLimitWrite(targetValue, maxWritesPerSecond, store) {
    const queue = new TaskQueue();
    let _value = undefined;
    let valueVersion = 0;
    let savedVersion = 0;
    store.add(toDisposable(() => {
        if (valueVersion !== savedVersion) {
            targetValue.writeValue(_value);
            savedVersion = valueVersion;
        }
    }));
    return {
        writeValue(value) {
            valueVersion++;
            const v = valueVersion;
            _value = value;
            queue.clearPending();
            queue.schedule(async () => {
                targetValue.writeValue(value);
                savedVersion = v;
                await timeout(5000);
            });
        },
        getValue() {
            if (valueVersion > 0) {
                return _value;
            }
            return targetValue.getValue();
        }
    };
}
function getStoredValue(service, key, scope, target) {
    let lastValue = undefined;
    let hasLastValue = false;
    return {
        writeValue(value) {
            if (value === undefined) {
                service.remove(key, scope);
            }
            else {
                service.store(key, JSON.stringify(value), scope, target);
            }
            lastValue = value;
        },
        getValue() {
            if (hasLastValue) {
                return lastValue;
            }
            const strVal = service.get(key, scope);
            lastValue = strVal === undefined ? undefined : JSON.parse(strVal);
            hasLastValue = true;
            return lastValue;
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWlTdGF0c0ZlYXR1cmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvZWRpdFN0YXRzL2FpU3RhdHNGZWF0dXJlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFtQixZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDcEksT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDNUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUMzRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBRWpILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRWxELElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWUsU0FBUSxVQUFVO0lBSTdDLFlBQ0Msa0JBQXNDLEVBQ3JCLGVBQWlELEVBQzNDLHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQUgwQixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDMUIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1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