/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { NotebookFindScopeType } from '../../../common/notebookCommon.js';
export class NotebookFindFilters extends Disposable {
    get markupInput() {
        return this._markupInput;
    }
    set markupInput(value) {
        if (this._markupInput !== value) {
            this._markupInput = value;
            this._onDidChange.fire({ markupInput: value });
        }
    }
    get markupPreview() {
        return this._markupPreview;
    }
    set markupPreview(value) {
        if (this._markupPreview !== value) {
            this._markupPreview = value;
            this._onDidChange.fire({ markupPreview: value });
        }
    }
    get codeInput() {
        return this._codeInput;
    }
    set codeInput(value) {
        if (this._codeInput !== value) {
            this._codeInput = value;
            this._onDidChange.fire({ codeInput: value });
        }
    }
    get codeOutput() {
        return this._codeOutput;
    }
    set codeOutput(value) {
        if (this._codeOutput !== value) {
            this._codeOutput = value;
            this._onDidChange.fire({ codeOutput: value });
        }
    }
    get findScope() {
        return this._findScope;
    }
    set findScope(value) {
        if (this._findScope !== value) {
            this._findScope = value;
            this._onDidChange.fire({ findScope: true });
        }
    }
    constructor(markupInput, markupPreview, codeInput, codeOutput, findScope) {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._markupInput = true;
        this._markupPreview = true;
        this._codeInput = true;
        this._codeOutput = true;
        this._findScope = { findScopeType: NotebookFindScopeType.None };
        this._markupInput = markupInput;
        this._markupPreview = markupPreview;
        this._codeInput = codeInput;
        this._codeOutput = codeOutput;
        this._findScope = findScope;
        this._initialMarkupInput = markupInput;
        this._initialMarkupPreview = markupPreview;
        this._initialCodeInput = codeInput;
        this._initialCodeOutput = codeOutput;
    }
    isModified() {
        // do not include findInSelection or either selectedRanges in the check. This will incorrectly mark the filter icon as modified
        return (this._markupInput !== this._initialMarkupInput
            || this._markupPreview !== this._initialMarkupPreview
            || this._codeInput !== this._initialCodeInput
            || this._codeOutput !== this._initialCodeOutput);
    }
    update(v) {
        this._markupInput = v.markupInput;
        this._markupPreview = v.markupPreview;
        this._codeInput = v.codeInput;
        this._codeOutput = v.codeOutput;
        this._findScope = v.findScope;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZEZpbHRlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvZmluZC9maW5kRmlsdGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBc0IscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQVU5RixNQUFNLE9BQU8sbUJBQW9CLFNBQVEsVUFBVTtJQU1sRCxJQUFJLFdBQVc7UUFDZCxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7SUFDMUIsQ0FBQztJQUVELElBQUksV0FBVyxDQUFDLEtBQWM7UUFDN0IsSUFBSSxJQUFJLENBQUMsWUFBWSxLQUFLLEtBQUssRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1lBQzFCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDaEQsQ0FBQztJQUNGLENBQUM7SUFJRCxJQUFJLGFBQWE7UUFDaEIsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQzVCLENBQUM7SUFFRCxJQUFJLGFBQWEsQ0FBQyxLQUFjO1FBQy9CLElBQUksSUFBSSxDQUFDLGNBQWMsS0FBSyxLQUFLLEVBQUUsQ0FBQztZQUNuQyxJQUFJLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztZQUM1QixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2xELENBQUM7SUFDRixDQUFDO0lBR0QsSUFBSSxTQUFT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