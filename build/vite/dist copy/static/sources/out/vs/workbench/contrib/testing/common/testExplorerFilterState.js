var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { splitGlobAware } from '../../../../base/common/glob.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { MutableObservableValue } from './observableValue.js';
import { StoredValue } from './storedValue.js';
import { namespaceTestTag } from './testTypes.js';
export const ITestExplorerFilterState = createDecorator('testingFilterState');
const tagRe = /!?@([^ ,:]+)/g;
const trimExtraWhitespace = (str) => str.replace(/\s\s+/g, ' ').trim();
let TestExplorerFilterState = class TestExplorerFilterState extends Disposable {
    constructor(storageService) {
        super();
        this.focusEmitter = this._register(new Emitter());
        /**
         * Mapping of terms to whether they're included in the text.
         */
        this.termFilterState = {};
        /** @inheritdoc */
        this.globList = [];
        /** @inheritdoc */
        this.includeTags = new Set();
        /** @inheritdoc */
        this.excludeTags = new Set();
        /** @inheritdoc */
        this.text = this._register(new MutableObservableValue(''));
        this.reveal = observableValue('TestExplorerFilterState.reveal', undefined);
        this.onDidRequestInputFocus = this.focusEmitter.event;
        this.selectTestInExplorerEmitter = this._register(new Emitter());
        this.onDidSelectTestInExplorer = this.selectTestInExplorerEmitter.event;
        this.fuzzy = this._register(MutableObservableValue.stored(new StoredValue({
            key: 'testHistoryFuzzy',
            scope: 0 /* StorageScope.PROFILE */,
            target: 0 /* StorageTarget.USER */,
        }, storageService), false));
    }
    /** @inheritdoc */
    didSelectTestInExplorer(testId) {
        this.selectTestInExplorerEmitter.fire(testId);
    }
    /** @inheritdoc */
    focusInput() {
        this.focusEmitter.fire();
    }
    /** @inheritdoc */
    setText(text) {
        if (text === this.text.value) {
            return;
        }
        this.termFilterState = {};
        this.globList = [];
        this.includeTags.clear();
        this.excludeTags.clear();
        let globText = '';
        let lastIndex = 0;
        for (const match of text.matchAll(tagRe)) {
            let nextIndex = match.index + match[0].length;
            const tag = match[0];
            if (allTestFilterTerms.includes(tag)) {
                this.termFilterState[tag] = true;
            }
            // recognize and parse @ctrlId:tagId or quoted like @ctrlId:"tag \\"id"
            if (text[nextIndex] === ':') {
                nextIndex++;
                let delimiter = text[nextIndex];
                if (delimiter !== `"` && delimiter !== `'`) {
                    delimiter = ' ';
                }
                else {
                    nextIndex++;
                }
                let tagId = '';
                while (nextIndex < text.length && text[nextIndex] !== delimiter) {
                    if (text[nextIndex] === '\\') {
                        tagId += text[nextIndex + 1];
                        nextIndex += 2;
                    }
                    else {
                        tagId += text[nextIndex];
                        nextIndex++;
                    }
                }
                if (match[0].startsWith('!')) {
                    this.excludeTags.add(namespaceTestTag(match[1], tagId));
                }
                else {
                    this.includeTags.add(namespaceTestTag(match[1], tagId));
                }
                nextIndex++;
            }
            globText += text.slice(lastIndex, match.index);
            lastIndex = nextIndex;
        }
        globText += text.slice(lastIndex).trim();
        if (globText.length) {
            for (const filter of splitGlobAware(globText, ',').map(s => s.trim()).filter(s => !!s.length)) {
                if (filter.startsWith('!')) {
                    this.globList.push({ include: false, text: filter.slice(1).toLowerCase() });
                }
                else {
                    this.globList.push({ include: true, text: filter.toLowerCase() });
                }
            }
        }
        this.text.value = text; // purposely afterwards so everything is updated when the change event happen
    }
    /** @inheritdoc */
    isFilteringFor(term) {
        return !!this.termFilterState[term];
    }
    /** @inheritdoc */
    toggleFilteringFor(term, shouldFilter) {
        const text = this.text.value.trim();
        if (shouldFilter !== false && !this.termFilterState[term]) {
            this.setText(text ? `${text} ${term}` : term);
        }
        else if (shouldFilter !== true && this.termFilterState[term]) {
            this.setText(trimExtraWhitespace(text.replace(term, '')));
        }
    }
};
TestExplorerFilterState = __decorate([
    __param(0, IStorageService)
], TestExplorerFilterState);
export { TestExplorerFilterState };
export var TestFilterTerm;
(function (TestFilterTerm) {
    TestFilterTerm["Failed"] = "@failed";
    TestFilterTerm["Executed"] = "@executed";
    TestFilterTerm["CurrentDoc"] = "@doc";
    TestFilterTerm["OpenedFiles"] = "@openedFiles";
    TestFilterTerm["Hidden"] = "@hidden";
})(TestFilterTerm || (TestFilterTerm = {}));
const allTestFilterTerms = [
    "@failed" /* TestFilterTerm.Failed */,
    "@executed" /* TestFilterTerm.Executed */,
    "@doc" /* TestFilterTerm.CurrentDoc */,
    "@openedFiles" /* TestFilterTerm.OpenedFiles */,
    "@hidden" /* TestFilterTerm.Hidden */,
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQXVCLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBb0Isc0JBQXNCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUNoRixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDL0MsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUErRGxELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGVBQWUsQ0FBMkIsb0JBQW9CLENBQUMsQ0FBQztBQUV4RyxNQUFNLEtBQUssR0FBRyxlQUFlLENBQUM7QUFDOUIsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLEdBQVcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7QUFFeEUsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxVQUFVO0lBOEJ0RCxZQUNrQixjQUErQjtRQUVoRCxLQUFLLEVB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