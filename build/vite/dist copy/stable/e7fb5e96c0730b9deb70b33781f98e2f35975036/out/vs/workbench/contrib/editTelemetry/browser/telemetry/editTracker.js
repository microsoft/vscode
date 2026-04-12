/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableSignal, runOnChange } from '../../../../../base/common/observable.js';
import { AnnotatedStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
/**
 * Tracks a single document.
*/
export class DocumentEditSourceTracker extends Disposable {
    constructor(_doc, data) {
        super();
        this._doc = _doc;
        this.data = data;
        this._edits = AnnotatedStringEdit.empty;
        this._pendingExternalEdits = AnnotatedStringEdit.empty;
        this._update = observableSignal(this);
        this._representativePerKey = new Map();
        this._sumAddedCharactersPerKey = new Map();
        this._register(runOnChange(this._doc.value, (_val, _prevVal, edits) => {
            const eComposed = AnnotatedStringEdit.compose(edits.map(e => e.edit));
            if (eComposed.replacements.every(e => e.data.source.category === 'external')) {
                if (this._edits.isEmpty()) {
                    // Ignore initial external edits
                }
                else {
                    // queue pending external edits
                    this._pendingExternalEdits = this._pendingExternalEdits.compose(eComposed);
                }
            }
            else {
                if (!this._pendingExternalEdits.isEmpty()) {
                    this._applyEdit(this._pendingExternalEdits);
                    this._pendingExternalEdits = AnnotatedStringEdit.empty;
                }
                this._applyEdit(eComposed);
            }
            this._update.trigger(undefined);
        }));
    }
    _applyEdit(e) {
        for (const r of e.replacements) {
            let existing = this._sumAddedCharactersPerKey.get(r.data.key);
            if (existing === undefined) {
                existing = 0;
                this._representativePerKey.set(r.data.key, r.data.representative);
            }
            const newCount = existing + r.getNewLength();
            this._sumAddedCharactersPerKey.set(r.data.key, newCount);
        }
        this._edits = this._edits.compose(e);
    }
    async waitForQueue() {
        await this._doc.waitForQueue();
    }
    getTotalInsertedCharactersCount(key) {
        const val = this._sumAddedCharactersPerKey.get(key);
        return val ?? 0;
    }
    getAllKeys() {
        return Array.from(this._sumAddedCharactersPerKey.keys());
    }
    getRepresentative(key) {
        return this._representativePerKey.get(key);
    }
    getTrackedRanges(reader) {
        this._update.read(reader);
        const ranges = this._edits.getNewRanges();
        return ranges.map((r, idx) => {
            const e = this._edits.replacements[idx];
            const te = new TrackedEdit(e.replaceRange, r, e.data.key, e.data.source, e.data.representative);
            return te;
        });
    }
    isEmpty() {
        return this._edits.isEmpty();
    }
    _getDebugVisualization() {
        const ranges = this.getTrackedRanges();
        const txt = this._doc.value.get().value;
        return {
            ...{ $fileExtension: 'text.w' },
            'value': txt,
            'decorations': ranges.map(r => {
                return {
                    range: [r.range.start, r.range.endExclusive],
                    color: r.source.getColor(),
                };
            })
        };
    }
}
export class TrackedEdit {
    constructor(originalRange, range, sourceKey, source, sourceRepresentative) {
        this.originalRange = originalRange;
        this.range = range;
        this.sourceKey = sourceKey;
        this.source = source;
        this.sourceRepresentative = sourceRepresentative;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFRyYWNrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2VkaXRUcmFja2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFXLE1BQU0sMENBQTBDLENBQUM7QUFDbEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFLNUY7O0VBRUU7QUFDRixNQUFNLE9BQU8seUJBQW9DLFNBQVEsVUFBVTtJQVFsRSxZQUNrQixJQUFpQyxFQUNsQyxJQUFPO1FBRXZCLEtBQUssRUFBRSxDQUFDO1FBSFMsU0FBSSxHQUFKLElBQUksQ0FBNkI7UUFDbEMsU0FBSSxHQUFKLElBQUksQ0FBRztRQVRoQixXQUFNLEdBQTJDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztRQUMzRSwwQkFBcUIsR0FBMkMsbUJBQW1CLENBQUMsS0FBSyxDQUFDO1FBRWpGLFlBQU8sR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqQywwQkFBcUIsR0FBcUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNwRSw4QkFBeUIsR0FBaUMsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQVFwRixJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDckUsTUFBTSxTQUFTLEdBQUcsbUJBQW1CLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMs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