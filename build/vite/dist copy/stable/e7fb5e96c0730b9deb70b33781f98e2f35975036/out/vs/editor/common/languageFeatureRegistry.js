/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../base/common/event.js';
import { toDisposable } from '../../base/common/lifecycle.js';
import { shouldSynchronizeModel } from './model.js';
import { score, selectLanguageIds } from './languageSelector.js';
function isExclusive(selector) {
    if (typeof selector === 'string') {
        return false;
    }
    else if (Array.isArray(selector)) {
        return selector.every(isExclusive);
    }
    else {
        return !!selector.exclusive; // TODO: microsoft/TypeScript#42768
    }
}
class MatchCandidate {
    constructor(uri, languageId, notebookUri, notebookType, recursive) {
        this.uri = uri;
        this.languageId = languageId;
        this.notebookUri = notebookUri;
        this.notebookType = notebookType;
        this.recursive = recursive;
    }
    equals(other) {
        return this.notebookType === other.notebookType
            && this.languageId === other.languageId
            && this.uri.toString() === other.uri.toString()
            && this.notebookUri?.toString() === other.notebookUri?.toString()
            && this.recursive === other.recursive;
    }
}
export class LanguageFeatureRegistry {
    get onDidChange() { return this._onDidChange.event; }
    constructor(_notebookInfoResolver) {
        this._notebookInfoResolver = _notebookInfoResolver;
        this._clock = 0;
        this._entries = [];
        this._onDidChange = new Emitter();
    }
    register(selector, provider) {
        let entry = {
            selector,
            provider,
            _score: -1,
            _time: this._clock++
        };
        this._entries.push(entry);
        this._lastCandidate = undefined;
        this._onDidChange.fire(this._entries.length);
        return toDisposable(() => {
            if (entry) {
                const idx = this._entries.indexOf(entry);
                if (idx >= 0) {
                    this._entries.splice(idx, 1);
                    this._lastCandidate = undefined;
                    this._onDidChange.fire(this._entries.length);
                    entry = undefined;
                }
            }
        });
    }
    has(model) {
        return this.all(model).length > 0;
    }
    all(model) {
        if (!model) {
            return [];
        }
        this._updateScores(model, false);
        const result = [];
        // from registry
        for (const entry of this._entries) {
            if (entry._score > 0) {
                result.push(entry.provider);
            }
        }
        return result;
    }
    allNoModel() {
        return this._entries.map(entry => entry.provider);
    }
    get registeredLanguageIds() {
        const result = new Set();
        for (const entry of this._entries) {
            selectLanguageIds(entry.selector, result);
        }
        return result;
    }
    ordered(model, recursive = false) {
        const result = [];
        this._orderedForEach(model, recursive, entry => result.push(entry.provider));
        return result;
    }
    orderedGroups(model) {
        const result = [];
        let lastBucket;
        let lastBucketScore;
        this._orderedForEach(model, false, entry => {
            if (lastBucket && lastBucketScore === entry._score) {
                lastBucket.push(entry.provider);
            }
            else {
                lastBucketScore = entry._score;
                lastBucket = [entry.provider];
                result.push(lastBucket);
            }
        });
        return result;
    }
    _orderedForEach(model, recursive, callback) {
        this._updateScores(model, recursive);
        for (const entry of this._entries) {
            if (entry._score > 0) {
                callback(entry);
            }
        }
    }
    _updateScores(model, recursive) {
        const notebookInfo = this._notebookInfoResolver?.(model.uri);
        // use the uri (scheme, pattern) of the notebook info iff we have one
        // otherwise it's the model's/document's uri
        const candidate = notebookInfo
            ? new MatchCandidate(model.uri, model.getLanguageId(), notebookInfo.uri, notebookInfo.type, recursive)
            : new MatchCandidate(model.uri, model.getLanguageId(), undefined, undefined, recursive);
        if (this._lastCandidate?.equals(candidate)) {
            // nothing has changed
            return;
        }
        this._lastCandidate = candidate;
        for (const entry of this._entries) {
            entry._score = score(entry.selector, candidate.uri, candidate.languageId, shouldSynchronizeModel(model), candidate.notebookUri, candidate.notebookType);
            if (isExclusive(entry.selector) && entry._score > 0) {
                if (recursive) {
                    entry._score = 0;
                }
                else {
                    // support for one exclusive selector that overwrites
                    // any other selector
                    for (const entry of this._entries) {
                        entry._score = 0;
                    }
                    entry._score = 1000;
                    break;
                }
            }
        }
        // needs sorting
        this._entries.sort(LanguageFeatureRegistry._compareByScoreAndTime);
    }
    static _compareByScoreAndTime(a, b) {
        if (a._score < b._score) {
            return 1;
        }
        else if (a._score > b._score) {
            return -1;
        }
        // De-prioritize built-in providers
        if (isBuiltinSelector(a.selector) && !isBuiltinSelector(b.selector)) {
            return 1;
        }
        else if (!isBuiltinSelector(a.selector) && isBuiltinSelector(b.selector)) {
            return -1;
        }
        if (a._time < b._time) {
            return 1;
        }
        else if (a._time > b._time) {
            return -1;
        }
        else {
            return 0;
        }
    }
}
function isBuiltinSelector(selector) {
    if (typeof selector === 'string') {
        return false;
    }
    if (Array.isArray(selector)) {
        return selector.some(isBuiltinSelector);
    }
    return Boolean(selector.isBuiltin);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNyRCxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0UsT0FBTyxFQUFjLHNCQUFzQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ2hFLE9BQU8sRUFBb0MsS0FBSyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFVbkcsU0FBUyxXQUFXLENBQUMsUUFBMEI7SUFDOUMsSUFBSSxPQUFPLFFBQVEsS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUNsQyxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7U0FBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUNwQyxPQUFPLFFBQVEsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDcEMsQ0FBQztTQUFNLENBQUM7UUFDUCxPQUFPLENBQUMsQ0FBRSxRQUEyQixDQUFDLFNBQVMsQ0FBQyxDQUFDLG1DQUFtQztJQUNyRixDQUFDO0FBQ0YsQ0FBQztBQVdELE1BQU0sY0FBYztJQUNuQixZQUNVLEdBQVEsRUFDUixVQUFrQixFQUNsQixXQUE0QixFQUM1QixZQUFnQyxFQUNoQyxTQUFrQjtRQUpsQixRQUFHLEdBQUgsR0FBRyxDQUFLO1FBQ1IsZUFBVSxHQUFWLFVBQVUsQ0FBUTtRQUNsQixnQkFBVyxHQUFYLFdBQVcsQ0FBaUI7UUFDNUIsaUJBQVksR0FBWixZQUFZLENBQW9CO1FBQ2hDLGNBQVMsR0FBVCxTQUFTLENBQVM7SUFDeEIsQ0FBQztJQUVM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