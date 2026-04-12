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
var SuggestMemoryService_1;
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { LRUCache } from '../../../../base/common/map.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { CompletionItemKinds } from '../../../common/languages.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, WillSaveStateReason } from '../../../../platform/storage/common/storage.js';
export class Memory {
    constructor(name) {
        this.name = name;
    }
    select(model, pos, items) {
        if (items.length === 0) {
            return 0;
        }
        const topScore = items[0].score[0];
        for (let i = 0; i < items.length; i++) {
            const { score, completion: suggestion } = items[i];
            if (score[0] !== topScore) {
                // stop when leaving the group of top matches
                break;
            }
            if (suggestion.preselect) {
                // stop when seeing an auto-select-item
                return i;
            }
        }
        return 0;
    }
}
export class NoMemory extends Memory {
    constructor() {
        super('first');
    }
    memorize(model, pos, item) {
        // no-op
    }
    toJSON() {
        return undefined;
    }
    fromJSON() {
        //
    }
}
export class LRUMemory extends Memory {
    constructor() {
        super('recentlyUsed');
        this._cache = new LRUCache(300, 0.66);
        this._seq = 0;
    }
    memorize(model, pos, item) {
        const key = `${model.getLanguageId()}/${item.textLabel}`;
        this._cache.set(key, {
            touch: this._seq++,
            type: item.completion.kind,
            insertText: item.completion.insertText
        });
    }
    select(model, pos, items) {
        if (items.length === 0) {
            return 0;
        }
        const lineSuffix = model.getLineContent(pos.lineNumber).substr(pos.column - 10, pos.column - 1);
        if (/\s$/.test(lineSuffix)) {
            return super.select(model, pos, items);
        }
        const topScore = items[0].score[0];
        let indexPreselect = -1;
        let indexRecency = -1;
        let seq = -1;
        for (let i = 0; i < items.length; i++) {
            if (items[i].score[0] !== topScore) {
                // consider only top items
                break;
            }
            const key = `${model.getLanguageId()}/${items[i].textLabel}`;
            const item = this._cache.peek(key);
            if (item && item.touch > seq && item.type === items[i].completion.kind && item.insertText === items[i].completion.insertText) {
                seq = item.touch;
                indexRecency = i;
            }
            if (items[i].completion.preselect && indexPreselect === -1) {
                // stop when seeing an auto-select-item
                return indexPreselect = i;
            }
        }
        if (indexRecency !== -1) {
            return indexRecency;
        }
        else if (indexPreselect !== -1) {
            return indexPreselect;
        }
        else {
            return 0;
        }
    }
    toJSON() {
        return this._cache.toJSON();
    }
    fromJSON(data) {
        this._cache.clear();
        const seq = 0;
        for (const [key, value] of data) {
            value.touch = seq;
            value.type = typeof value.type === 'number' ? value.type : CompletionItemKinds.fromString(value.type);
            this._cache.set(key, value);
        }
        this._seq = this._cache.size;
    }
}
export class PrefixMemory extends Memory {
    constructor() {
        super('recentlyUsedByPrefix');
        this._trie = TernarySearchTree.forStrings();
        this._seq = 0;
    }
    memorize(model, pos, item) {
        const { word } = model.getWordUntilPosition(pos);
        const key = `${model.getLanguageId()}/${word}`;
        this._trie.set(key, {
            type: item.completion.kind,
            insertText: item.completion.insertText,
            touch: this._seq++
        });
    }
    select(model, pos, items) {
        const { word } = model.getWordUntilPosition(pos);
        if (!word) {
            return super.select(model, pos, items);
        }
        const key = `${model.getLanguageId()}/${word}`;
        let item = this._trie.get(key);
        if (!item) {
            item = this._trie.findSubstr(key);
        }
        if (item) {
            for (let i = 0; i < items.length; i++) {
                const { kind, insertText } = items[i].completion;
                if (kind === item.type && insertText === item.insertText) {
                    return i;
                }
            }
        }
        return super.select(model, pos, items);
    }
    toJSON() {
        const entries = [];
        this._trie.forEach((value, key) => entries.push([key, value]));
        // sort by last recently used (touch), then
        // take the top 200 item and normalize their
        // touch
        entries
            .sort((a, b) => -(a[1].touch - b[1].touch))
            .forEach((value, i) => value[1].touch = i);
        return entries.slice(0, 200);
    }
    fromJSON(data) {
        this._trie.clear();
        if (data.length > 0) {
            this._seq = data[0][1].touch + 1;
            for (const [key, value] of data) {
                value.type = typeof value.type === 'number' ? value.type : CompletionItemKinds.fromString(value.type);
                this._trie.set(key, value);
            }
        }
    }
}
let SuggestMemoryService = class SuggestMemoryService {
    static { SuggestMemoryService_1 = this; }
    static { this._strategyCtors = new Map([
        ['recentlyUsedByPrefix', PrefixMemory],
        ['recentlyUsed', LRUMemory],
        ['first', NoMemory]
    ]); }
    static { this._storagePrefix = 'suggest/memories'; }
    constructor(_storageService, _configService) {
        this._storageService = _storageService;
        this._configService = _configService;
        this._disposables = new DisposableStore();
        this._persistSoon = new RunOnceScheduler(() => this._saveState(), 500);
        this._disposables.add(_storageService.onWillSaveState(e => {
            if (e.reason === WillSaveStateReason.SHUTDOWN) {
                this._saveState();
            }
        }));
    }
    dispose() {
        this._disposables.dispose();
        this._persistSoon.dispose();
    }
    memorize(model, pos, item) {
        this._withStrategy(model, pos).memorize(model, pos, item);
        this._persistSoon.schedule();
    }
    select(model, pos, items) {
        return this._withStrategy(model, pos).select(model, pos, items);
    }
    _withStrategy(model, pos) {
        const mode = this._configService.getValue('editor.suggestSelection', {
            overrideIdentifier: model.getLanguageIdAtPosition(pos.lineNumber, pos.column),
            resource: model.uri
        });
        if (this._strategy?.name !== mode) {
            this._saveState();
            const ctor = SuggestMemoryService_1._strategyCtors.get(mode) || NoMemory;
            this._strategy = new ctor();
            try {
                const share = this._configService.getValue('editor.suggest.shareSuggestSelections');
                const scope = share ? 0 /* StorageScope.PROFILE */ : 1 /* StorageScope.WORKSPACE */;
                const raw = this._storageService.get(`${SuggestMemoryService_1._storagePrefix}/${mode}`, scope);
                if (raw) {
                    this._strategy.fromJSON(JSON.parse(raw));
                }
            }
            catch (e) {
                // things can go wrong with JSON...
            }
        }
        return this._strategy;
    }
    _saveState() {
        if (this._strategy) {
            const share = this._configService.getValue('editor.suggest.shareSuggestSelections');
            const scope = share ? 0 /* StorageScope.PROFILE */ : 1 /* StorageScope.WORKSPACE */;
            const raw = JSON.stringify(this._strategy);
            this._storageService.store(`${SuggestMemoryService_1._storagePrefix}/${this._strategy.name}`, raw, scope, 1 /* StorageTarget.MACHINE */);
        }
    }
};
SuggestMemoryService = SuggestMemoryService_1 = __decorate([
    __param(0, IStorageService),
    __param(1, IConfigurationService)
], SuggestMemoryService);
export { SuggestMemoryService };
export const ISuggestMemoryService = createDecorator('ISuggestMemories');
registerSingleton(ISuggestMemoryService, SuggestMemoryService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdE1lbW9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0TWVtb3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBR2pGLE9BQU8sRUFBc0IsbUJBQW1CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQStCLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFbkksTUFBTSxPQUFnQixNQUFNO0lBRTNCLFlBQXFCLElBQWE7UUFBYixTQUFJLEdBQUosSUFBSSxDQUFTO0lBQUksQ0FBQztJQUV2QyxNQUFNLENBQUMsS0FBaUIsRUFBRSxHQUFjLEVBQUUsS0FBdUI7UUFDaEUsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQztRQUNELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkMsS0FBSyxJQUFJLENB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