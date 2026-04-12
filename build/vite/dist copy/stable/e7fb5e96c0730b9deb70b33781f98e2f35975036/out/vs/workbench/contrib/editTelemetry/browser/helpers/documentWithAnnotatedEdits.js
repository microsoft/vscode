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
import { AsyncReader, AsyncReaderEndOfStream } from '../../../../../base/common/async.js';
import { CachedFunction } from '../../../../../base/common/cache.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue, runOnChange } from '../../../../../base/common/observable.js';
import { AnnotatedStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { iterateObservableChanges, mapObservableDelta } from './utils.js';
/**
 * Creates a document that is a delayed copy of the original document,
 * but with edits annotated with the source of the edit.
*/
export class DocumentWithSourceAnnotatedEdits extends Disposable {
    constructor(_originalDoc) {
        super();
        this._originalDoc = _originalDoc;
        const v = this.value = observableValue(this, _originalDoc.value.get());
        this._register(runOnChange(this._originalDoc.value, (val, _prevVal, edits) => {
            const eComposed = AnnotatedStringEdit.compose(edits.map(e => {
                const editSourceData = new EditSourceData(e.reason);
                return e.mapData(() => editSourceData);
            }));
            v.set(val, undefined, { edit: eComposed });
        }));
    }
    waitForQueue() {
        return Promise.resolve();
    }
}
/**
 * Only joins touching edits if the source and the metadata is the same (e.g. requestUuids must be equal).
*/
export class EditSourceData {
    constructor(editSource) {
        this.editSource = editSource;
        this.key = this.editSource.toKey(1);
        this.source = EditSourceBase.create(this.editSource);
    }
    join(data) {
        if (this.editSource !== data.editSource) {
            return undefined;
        }
        return this;
    }
    toEditSourceData() {
        return new EditKeySourceData(this.key, this.source, this.editSource);
    }
}
export class EditKeySourceData {
    constructor(key, source, representative) {
        this.key = key;
        this.source = source;
        this.representative = representative;
    }
    join(data) {
        if (this.key !== data.key) {
            return undefined;
        }
        if (this.source !== data.source) {
            return undefined;
        }
        // The representatives could be different! (But equal modulo key)
        return this;
    }
}
export class EditSourceBase {
    static { this._cache = new CachedFunction({ getCacheKey: v => v.toString() }, (arg) => arg); }
    static create(reason) {
        const data = reason.metadata;
        switch (data.source) {
            case 'reloadFromDisk':
                return this._cache.get(new ExternalEditSource());
            case 'inlineCompletionPartialAccept':
            case 'inlineCompletionAccept': {
                const type = 'type' in data ? data.type : undefined;
                if ('$nes' in data && data.$nes) {
                    return this._cache.get(new InlineSuggestEditSource('nes', data.$extensionId ?? '', data.$providerId ?? '', type));
                }
                return this._cache.get(new InlineSuggestEditSource('completion', data.$extensionId ?? '', data.$providerId ?? '', type));
            }
            case 'snippet':
                return this._cache.get(new IdeEditSource('suggest'));
            case 'unknown':
                if (!data.name) {
                    return this._cache.get(new UnknownEditSource());
                }
                switch (data.name) {
                    case 'formatEditsCommand':
                        return this._cache.get(new IdeEditSource('format'));
                }
                return this._cache.get(new UnknownEditSource());
            case 'Chat.applyEdits':
                return this._cache.get(new ChatEditSource('sidebar'));
            case 'inlineChat.applyEdits':
                return this._cache.get(new ChatEditSource('inline'));
            case 'cursor':
                return this._cache.get(new UserEditSource());
            default:
                return this._cache.get(new UnknownEditSource());
        }
    }
}
export class InlineSuggestEditSource extends EditSourceBase {
    constructor(kind, extensionId, providerId, type) {
        super();
        this.kind = kind;
        this.extensionId = extensionId;
        this.providerId = providerId;
        this.type = type;
        this.category = 'ai';
        this.feature = 'inlineSuggest';
    }
    toString() { return `${this.category}/${this.feature}/${this.kind}/${this.extensionId}/${this.type}`; }
    getColor() { return '#00ff0033'; }
}
class ChatEditSource extends EditSourceBase {
    constructor(kind) {
        super();
        this.kind = kind;
        this.category = 'ai';
        this.feature = 'chat';
    }
    toString() { return `${this.category}/${this.feature}/${this.kind}`; }
    getColor() { return '#00ff0066'; }
}
class IdeEditSource extends EditSourceBase {
    constructor(feature) {
        super();
        this.feature = feature;
        this.category = 'ide';
    }
    toString() { return `${this.category}/${this.feature}`; }
    getColor() { return this.feature === 'format' ? '#0000ff33' : '#80808033'; }
}
class UserEditSource extends EditSourceBase {
    constructor() {
        super();
        this.category = 'user';
    }
    toString() { return this.category; }
    getColor() { return '#d3d3d333'; }
}
/** Caused by external tools that trigger a reload from disk */
class ExternalEditSource extends EditSourceBase {
    constructor() {
        super();
        this.category = 'external';
    }
    toString() { return this.category; }
    getColor() { return '#009ab254'; }
}
class UnknownEditSource extends EditSourceBase {
    constructor() {
        super();
        this.category = 'unknown';
    }
    toString() { return this.category; }
    getColor() { return '#ff000033'; }
}
let CombineStreamedChanges = class CombineStreamedChanges extends Disposable {
    constructor(_originalDoc, _instantiationService) {
        super();
        this._originalDoc = _originalDoc;
        this._instantiationService = _instantiationService;
        this._runStore = this._register(new DisposableStore());
        this._runQueue = Promise.resolve();
        this._diffService = this._instantiationService.createInstance(DiffService);
        this.value = this._value = observableValue(this, _originalDoc.value.get());
        this._restart();
    }
    async _restart() {
        this._runStore.clear();
        const iterator = iterateObservableChanges(this._originalDoc.value, this._runStore)[Symbol.asyncIterator]();
        const p = this._runQueue;
        this._runQueue = this._runQueue.then(() => this._run(iterator));
        await p;
    }
    async _run(iterator) {
        const reader = new AsyncReader(iterator);
        while (true) {
            let peeked = await reader.peek();
            if (peeked === AsyncReaderEndOfStream) {
                return;
            }
            else if (isChatEdit(peeked)) {
                const first = peeked;
                let last = first;
                let chatEdit = AnnotatedStringEdit.empty;
                do {
                    reader.readBufferedOrThrow();
                    last = peeked;
                    chatEdit = chatEdit.compose(AnnotatedStringEdit.compose(peeked.change.map(c => c.edit)));
                    const peekedOrUndefined = await reader.peekTimeout(1000);
                    if (!peekedOrUndefined) {
                        break;
                    }
                    peeked = peekedOrUndefined;
                } while (peeked !== AsyncReaderEndOfStream && isChatEdit(peeked));
                if (!chatEdit.isEmpty()) {
                    const data = chatEdit.replacements[0].data;
                    const diffEdit = await this._diffService.computeDiff(first.prevValue.value, last.value.value);
                    const edit = diffEdit.mapData(_e => data);
                    this._value.set(last.value, undefined, { edit });
                }
            }
            else {
                reader.readBufferedOrThrow();
                const e = AnnotatedStringEdit.compose(peeked.change.map(c => c.edit));
                this._value.set(peeked.value, undefined, { edit: e });
            }
        }
    }
    async waitForQueue() {
        await this._originalDoc.waitForQueue();
        await this._restart();
    }
};
CombineStreamedChanges = __decorate([
    __param(1, IInstantiationService)
], CombineStreamedChanges);
export { CombineStreamedChanges };
let DiffService = class DiffService {
    constructor(_editorWorkerService) {
        this._editorWorkerService = _editorWorkerService;
    }
    async computeDiff(original, modified) {
        const diffEdit = await this._editorWorkerService.computeStringEditFromDiff(original, modified, { maxComputationTimeMs: 500 }, 'advanced');
        return diffEdit;
    }
};
DiffService = __decorate([
    __param(0, IEditorWorkerService)
], DiffService);
export { DiffService };
function isChatEdit(next) {
    return next.change.every(c => c.edit.replacements.every(e => {
        if (e.data.source.category === 'ai' && e.data.source.feature === 'chat') {
            return true;
        }
        return false;
    }));
}
export class MinimizeEditsProcessor extends Disposable {
    constructor(_originalDoc) {
        super();
        this._originalDoc = _originalDoc;
        const v = this.value = observableValue(this, _originalDoc.value.get());
        let prevValue = this._originalDoc.value.get().value;
        this._register(runOnChange(this._originalDoc.value, (val, _prevVal, edits) => {
            const eComposed = AnnotatedStringEdit.compose(edits.map(e => e.edit));
            const e = eComposed.removeCommonSuffixAndPrefix(prevValue);
            prevValue = val.value;
            v.set(val, undefined, { edit: e });
        }));
    }
    async waitForQueue() {
        await this._originalDoc.waitForQueue();
    }
}
/**
 * Removing the metadata allows touching edits from the same source to merged, even if they were caused by different actions (e.g. two user edits).
 */
export function createDocWithJustReason(docWithAnnotatedEdits, store) {
    const docWithJustReason = {
        value: mapObservableDelta(docWithAnnotatedEdits.value, edit => ({ edit: edit.edit.mapData(d => d.data.toEditSourceData()) }), store),
        waitForQueue: () => docWithAnnotatedEdits.waitForQueue(),
    };
    return docWithJustReason;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZG9jdW1lbnRXaXRoQW5ub3RhdGVkRWRpdHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvaGVscGVycy9kb2N1bWVudFdpdGhBbm5vdGF0ZWRFZGl0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUE4QyxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDcEksT0FBTyxFQUFFLG1CQUFtQixFQUF5QixNQUFNLHVEQUF1RCxDQUFDO0FBRW5ILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRTdGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXRHLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQU8xRTs7O0VBR0U7QUFDRixNQUFNLE9BQU8sZ0NBQWlDLFNBQVEsVUFBVTtJQUcvRCxZQUE2QixZQUFpQztRQUM3RCxLQUFLLEVBQUUsQ0FBQztRQURvQixpQkFBWSxHQUFaLFlBQVksQ0FBcUI7UUFHN0QsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUV2RSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDLEdBQUcsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDNUUsTUFBTSxTQUFTLEdBQUcsbUJBQW1CLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQzNELE1BQU0sY0FBYyxHQUFHLElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDcEQsT0FBTyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUM1QyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVNLFlBQVk7UUFDbEIsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUIsQ0FBQztDQUNEO0FBRUQ7O0VBRUU7QUFDRixNQUFNLE9BQU8sY0FBYztJQUkxQixZQUNpQixVQUErQjtRQUEvQixlQUFVLEdBQVYsVUFBVSxDQUFxQjtRQUUvQyxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxNQUFNLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVELElBQUksQ0FBQyxJQUFvQjtRQUN4QixJQUFJLElBQUksQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3pDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxnQkFBZ0I7UUFDZixPQUFPLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN0RSxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8saUJBQWlCO0lBQzdCLFlBQ2lCLEdBQVcsRUFDWCxNQUFrQixFQUNsQixjQUFtQztRQUZuQyxRQUFHLEdBQUgsR0FBRyxDQUFRO1FBQ1gsV0FBTSxHQUFOLE1BQU0sQ0FBWTtRQUNsQixtQkFBYyxHQUFkLGNBQWMsQ0FBcUI7SUFDaEQsQ0FBQztJQUVMLElBQUksQ0FBQyxJQUF1QjtRQUMzQixJQUFJLElBQUksQ0FBQyxHQUFHLEtBQUssSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQzNCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pDLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxpRUFBaUU7UUFDakUsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQWdCLGNBQWM7YUFDcEIsV0FBTSxHQUFHLElBQUksY0FBYyxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLEVBQUUsQ0FBQyxHQUFlLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRWxHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBMkI7UUFDL0MsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztRQUM3QixRQUFRLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyQixLQUFLLGdCQUFnQjtnQkFDcEIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUNsRCxLQUFLLCtCQUErQixDQUFDO1lBQ3JDLEtBQUssd0JBQXdCLENBQUMsQ0FBQyxDQUFDO2dCQUMvQixNQUFNLElBQUksR0FBRyxNQUFNLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7Z0JBQ3BELElBQUksTUFBTSxJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ2pDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFlBQVksSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLFdBQVcsSUFBSSxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDbkgsQ0FBQztnQkFDRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksdUJBQXVCLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxZQUFZLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxXQUFXLElBQUksRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDMUgsQ0FBQztZQUNELEtBQUssU0FBUztnQkFDYixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDdEQsS0FBSyxTQUFTO2dCQUNiLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ2hCLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7Z0JBQ2pELENBQUM7Z0JBQ0QsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7b0JBQ25CLEtBQUssb0JBQW9CO3dCQUN4QixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RELENBQUM7Z0JBQ0QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztZQUVqRCxLQUFLLGlCQUFpQjtnQkFDckIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ3ZELEtBQUssdUJBQXVCO2dCQUMzQixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDdEQsS0FBSyxRQUFRO2dCQUNaLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1lBQzlDO2dCQUNDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDbEQsQ0FBQztJQUNGLENBQUM7O0FBT0YsTUFBTSxPQUFPLHVCQUF3QixTQUFRLGNBQWM7SUFHMUQsWUFDaUIsSUFBMEIsRUFDMUIsV0FBbUIsRUFDbkIsVUFBa0IsRUFDbEIsSUFBaUM7UUFDOUMsS0FBSyxFQUFFLENBQUM7UUFKSyxTQUFJLEdBQUosSUFBSSxDQUFzQjtRQUMxQixnQkFBVyxHQUFYLFdBQVcsQ0FBUTtRQUNuQixlQUFVLEdBQVYsVUFBVSxDQUFRO1FBQ2xCLFNBQUksR0FBSixJQUFJLENBQTZCO1FBTmxDLGFBQVEsR0FBRyxJQUFJLENBQUM7UUFDaEIsWUFBTyxHQUFHLGVBQWUsQ0FBQztJQU03QixDQUFDO0lBRUwsUUFBUSxLQUFLLE9BQU8sR0FBRyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFekcsUUFBUSxLQUFhLE9BQU8sV0FBVyxDQUFDLENBQUMsQ0FBQztDQUNqRDtBQUVELE1BQU0sY0FBZSxTQUFRLGNBQWM7SUFHMUMsWUFDaUIsSUFBMEI7UUFDdkMsS0FBSyxFQUFFLENBQUM7UUFESyxTQUFJLEdBQUosSUFBSSxDQUFzQjtRQUgzQixhQUFRLEdBQUcsSUFBSSxDQUFDO1FBQ2hCLFlBQU8sR0FBRyxNQUFNLENBQUM7SUFHcEIsQ0FBQztJQUVMLFFBQVEsS0FBSyxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFeEUsUUFBUSxLQUFhLE9BQU8sV0FBVyxDQUFDLENBQUMsQ0FBQztDQUNqRDtBQUVELE1BQU0sYUFBYyxTQUFRLGNBQWM7SUFFekMsWUFDaUIsT0FBc0M7UUFDbkQsS0FBSyxFQUFFLENBQUM7UUFESyxZQUFPLEdBQVAsT0FBTyxDQUErQjtRQUZ2QyxhQUFRLEdBQUcsS0FBSyxDQUFDO0lBR3BCLENBQUM7SUFFTCxRQUFRLEtBQUssT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUUzRCxRQUFRLEtBQWEsT0FBTyxJQUFJLENBQUMsT0FBTyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0NBQzNGO0FBRUQsTUFBTSxjQUFlLFNBQVEsY0FBYztJQUUxQztRQUFnQixLQUFLLEVBQUUsQ0FBQztRQURSLGFBQVEsR0FBRyxNQUFNLENBQUM7SUFDVCxDQUFDO0lBRWpCLFFBQVEsS0FBSyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBRXRDLFFBQVEsS0FBYSxPQUFPLFdBQVcsQ0FBQyxDQUFDLENBQUM7Q0FDakQ7QUFFRCwrREFBK0Q7QUFDL0QsTUFBTSxrQkFBbUIsU0FBUSxjQUFjO0lBRTlDO1FBQWdCLEtBQUssRUFBRSxDQUFDO1FBRFIsYUFBUSxHQUFHLFVBQVUsQ0FBQztJQUNiLENBQUM7SUFFakIsUUFBUSxLQUFLLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFFdEMsUUFBUSxLQUFhLE9BQU8sV0FBVyxDQUFDLENBQUMsQ0FBQztDQUNqRDtBQUVELE1BQU0saUJBQWtCLFNBQVEsY0FBYztJQUU3QztRQUFnQixLQUFLLEVBQUUsQ0FBQztRQURSLGFBQVEsR0FBRyxTQUFTLENBQUM7SUFDWixDQUFDO0lBRWpCLFFBQVEsS0FBSyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBRXRDLFFBQVEsS0FBYSxPQUFPLFdBQVcsQ0FBQyxDQUFDLENBQUM7Q0FDakQ7QUFFTSxJQUFNLHNCQUFzQixHQUE1QixNQUFNLHNCQUFzRyxTQUFRLFVBQVU7SUFRcEksWUFDa0IsWUFBb0QsRUFDOUMscUJBQTZEO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBSFMsaUJBQVksR0FBWixZQUFZLENBQXdDO1FBQzdCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFQcEUsY0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzNELGNBQVMsR0FBa0IsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBVXBELElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBRWpCLENBQUM7SUFFRCxLQUFLLENBQUMsUUFBUTtRQUNiLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDdkIsTUFBTSxRQUFRLEdBQUcsd0JBQXdCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQzNHLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUM7UUFDekIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDaEUsTUFBTSxDQUFDLENBQUM7SUFDVCxDQUFDO0lBRU8sS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFtSTtRQUNySixNQUFNLE1BQU0sR0FBRyxJQUFJLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN6QyxPQUFPLElBQUksRUFBRSxDQUFDO1lBQ2IsSUFBSSxNQUFNLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakMsSUFBSSxNQUFNLEtBQUssc0JBQXNCLEVBQUUsQ0FBQztnQkFDdkMsT0FBTztZQUNSLENBQUM7aUJBQU0sSUFBSSxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDL0IsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDO2dCQUVyQixJQUFJLElBQUksR0FBRyxLQUFLLENBQUM7Z0JBQ2pCLElBQUksUUFBUSxHQUFHLG1CQUFtQixDQUFDLEtBQXVDLENBQUM7Z0JBRTNFLEdBQUcsQ0FBQztvQkFDSCxNQUFNLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztvQkFDN0IsSUFBSSxHQUFHLE1BQU0sQ0FBQztvQkFDZCxRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN6RixNQUFNLGlCQUFpQixHQUFHLE1BQU0sTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDekQsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7d0JBQ3hCLE1BQU07b0JBQ1AsQ0FBQztvQkFDRCxNQUFNLEdBQUcsaUJBQWlCLENBQUM7Z0JBQzVCLENBQUMsUUFBUSxNQUFNLEtBQUssc0JBQXNCLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUVsRSxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7b0JBQ3pCLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO29CQUMzQyxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7b0JBQzlGLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDO1lBQ0YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO2dCQUM3QixNQUFNLENBQUMsR0FBRyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDdEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUN2RCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWTtRQUNqQixNQUFNLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdkMsTUFBTSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDdkIsQ0FBQztDQUNELENBQUE7QUFyRVksc0JBQXNCO0lBVWhDLFdBQUEscUJBQXFCLENBQUE7R0FWWCxzQkFBc0IsQ0FxRWxDOztBQUVNLElBQU0sV0FBVyxHQUFqQixNQUFNLFdBQVc7SUFDdkIsWUFDd0Msb0JBQTBDO1FBQTFDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBc0I7SUFFbEYsQ0FBQztJQUVNLEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBZ0IsRUFBRSxRQUFnQjtRQUMxRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx5QkFBeUIsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsR0FBRyxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDMUksT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztDQUNELENBQUE7QUFWWSxXQUFXO0lBRXJCLFdBQUEsb0JBQW9CLENBQUE7R0FGVixXQUFXLENBVXZCOztBQUVELFNBQVMsVUFBVSxDQUFDLElBQXdHO0lBQzNILE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDM0QsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEtBQUssSUFBSSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUN6RSxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsTUFBTSxPQUFPLHNCQUErRCxTQUFRLFVBQVU7SUFHN0YsWUFDa0IsWUFBb0Q7UUFFckUsS0FBSyxFQUFFLENBQUM7UUFGUyxpQkFBWSxHQUFaLFlBQVksQ0FBd0M7UUFJckUsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUV2RSxJQUFJLFNBQVMsR0FBVyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUM7UUFDNUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQzVFLE1BQU0sU0FBUyxHQUFHLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFFdEUsTUFBTSxDQUFDLEdBQUcsU0FBUyxDQUFDLDJCQUEyQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNELFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDO1lBRXRCLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLFNBQVMsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVk7UUFDakIsTUFBTSxJQUFJLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxDQUFDO0lBQ3hDLENBQUM7Q0FDRDtBQUVEOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHVCQUF1QixDQUFDLHFCQUFrRSxFQUFFLEtBQXNCO0lBQ2pJLE1BQU0saUJBQWlCLEdBQW1EO1FBQ3pFLEtBQUssRUFBRSxrQkFBa0IsQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQztRQUNwSSxZQUFZLEVBQUUsR0FBRyxFQUFFLENBQUMscUJBQXFCLENBQUMsWUFBWSxFQUFFO0tBQ3hELENBQUM7SUFDRixPQUFPLGlCQUFpQixDQUFDO0FBQzFCLENBQUMifQ==