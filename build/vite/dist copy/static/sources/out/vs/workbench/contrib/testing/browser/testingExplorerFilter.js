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
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Action, Separator } from '../../../../base/common/actions.js';
import { Delayer } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ContextScopedSuggestEnabledInputWithHistory } from '../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { testingFilterIcon } from './icons.js';
import { StoredValue } from '../common/storedValue.js';
import { ITestExplorerFilterState } from '../common/testExplorerFilterState.js';
import { ITestService } from '../common/testService.js';
import { denamespaceTestTag } from '../common/testTypes.js';
const testFilterDescriptions = {
    ["@failed" /* TestFilterTerm.Failed */]: localize('testing.filters.showOnlyFailed', "Show Only Failed Tests"),
    ["@executed" /* TestFilterTerm.Executed */]: localize('testing.filters.showOnlyExecuted', "Show Only Executed Tests"),
    ["@doc" /* TestFilterTerm.CurrentDoc */]: localize('testing.filters.currentFile', "Show in Active File Only"),
    ["@openedFiles" /* TestFilterTerm.OpenedFiles */]: localize('testing.filters.openedFiles', "Show in Opened Files Only"),
    ["@hidden" /* TestFilterTerm.Hidden */]: localize('testing.filters.showExcludedTests', "Show Hidden Tests"),
};
let TestingExplorerFilter = class TestingExplorerFilter extends BaseActionViewItem {
    constructor(action, options, state, instantiationService, testService) {
        super(null, action, options);
        this.state = state;
        this.instantiationService = instantiationService;
        this.testService = testService;
        this.focusEmitter = this._register(new Emitter());
        this.onDidFocus = this.focusEmitter.event;
        this.filtersAction = new Action('markersFiltersAction', localize('testing.filters.menu', "More Filters..."), 'testing-filter-button ' + ThemeIcon.asClassName(testingFilterIcon));
        this.history = this._register(instantiationService.createInstance(StoredValue, {
            key: 'testing.filterHistory2',
            scope: 1 /* StorageScope.WORKSPACE */,
            target: 1 /* StorageTarget.MACHINE */
        }));
        this.updateFilterActiveState();
        this._register(testService.excluded.onTestExclusionsChanged(this.updateFilterActiveState, this));
    }
    /**
     * @override
     */
    render(container) {
        container.classList.add('testing-filter-action-item');
        const updateDelayer = this._register(new Delayer(400));
        const wrapper = this.wrapper = dom.$('.testing-filter-wrapper');
        container.appendChild(wrapper);
        let history = this.history.get({ lastValue: '', values: [] });
        if (history instanceof Array) {
            history = { lastValue: '', values: history };
        }
        if (history.lastValue) {
            this.state.setText(history.lastValue);
        }
        const input = this.input = this._register(this.instantiationService.createInstance(ContextScopedSuggestEnabledInputWithHistory, {
            id: 'testing.explorer.filter',
            ariaLabel: localize('testExplorerFilterLabel', "Filter text for tests in the explorer"),
            parent: wrapper,
            suggestionProvider: {
                triggerCharacters: ['@'],
                provideResults: () => [
                    ...Object.entries(testFilterDescriptions).map(([label, detail]) => ({ label, detail })),
                    ...Iterable.map(this.testService.collection.tags.values(), tag => {
                        const { ctrlId, tagId } = denamespaceTestTag(tag.id);
                        const insertText = `@${ctrlId}:${tagId}`;
                        return ({
                            label: `@${ctrlId}:${tagId}`,
                            detail: this.testService.collection.getNodeById(ctrlId)?.item.label,
                            insertText: tagId.includes(' ') ? `@${ctrlId}:"${tagId.replace(/(["\\])/g, '\\$1')}"` : insertText,
                        });
                    }),
                ].filter(r => !this.state.text.value.includes(r.label)),
            },
            resourceHandle: 'testing:filter',
            suggestOptions: {
                value: this.state.text.value,
                placeholderText: localize('testExplorerFilter', "Filter (e.g. text, !exclude, @tag)"),
            },
            history: history.values
        }));
        this._register(this.state.text.onDidChange(newValue => {
            if (input.getValue() !== newValue) {
                input.setValue(newValue);
            }
        }));
        this._register(this.state.onDidRequestInputFocus(() => {
            input.focus();
        }));
        this._register(input.onDidFocus(() => {
            this.focusEmitter.fire();
        }));
        this._register(input.onInputDidChange(() => updateDelayer.trigger(() => {
            input.addToHistory();
            this.state.setText(input.getValue());
        })));
        const actionbar = this._register(new ActionBar(container, {
            actionViewItemProvider: (action, options) => {
                if (action.id === this.filtersAction.id) {
                    return this.instantiationService.createInstance(FiltersDropdownMenuActionViewItem, action, options, this.state, this.actionRunner);
                }
                return undefined;
            },
        }));
        actionbar.push(this.filtersAction, { icon: true, label: false });
        this.layout(this.wrapper.clientWidth);
    }
    layout(width) {
        this.input.layout(new dom.Dimension(width - /* horizontal padding */ 24 - /* editor padding */ 8 - /* filter button padding */ 22, 20));
    }
    /**
     * Focuses the filter input.
     */
    focus() {
        this.input.focus();
    }
    /**
     * Persists changes to the input history.
     */
    saveState() {
        this.history.store({ lastValue: this.input.getValue(), values: this.input.getHistory() });
    }
    /**
     * @override
     */
    dispose() {
        this.saveState();
        super.dispose();
    }
    /**
     * Updates the 'checked' state of the filter submenu.
     */
    updateFilterActiveState() {
        this.filtersAction.checked = this.testService.excluded.hasAny;
    }
};
TestingExplorerFilter = __decorate([
    __param(2, ITestExplorerFilterState),
    __param(3, IInstantiationService),
    __param(4, ITestService)
], TestingExplorerFilter);
export { TestingExplorerFilter };
let FiltersDropdownMenuActionViewItem = class FiltersDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
    constructor(action, options, filters, actionRunner, contextMenuService, testService) {
        super(action, { getActions: () => this.getActions() }, contextMenuService, {
            actionRunner,
            classNames: action.class,
            anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */,
            menuAsChild: true
        });
        this.filters = filters;
        this.testService = testService;
    }
    render(container) {
        super.render(container);
        this.updateChecked();
    }
    getActions() {
        return [
            ...["@failed" /* TestFilterTerm.Failed */, "@executed" /* TestFilterTerm.Executed */, "@doc" /* TestFilterTerm.CurrentDoc */, "@openedFiles" /* TestFilterTerm.OpenedFiles */].map(term => ({
                checked: this.filters.isFilteringFor(term),
                class: undefined,
                enabled: true,
                id: term,
                label: testFilterDescriptions[term],
                run: () => this.filters.toggleFilteringFor(term),
                tooltip: '',
                dispose: () => null
            })),
            new Separator(),
            {
                checked: this.filters.fuzzy.value,
                class: undefined,
                enabled: true,
                id: 'fuzzy',
                label: localize('testing.filters.fuzzyMatch', "Fuzzy Match"),
                run: () => this.filters.fuzzy.value = !this.filters.fuzzy.value,
                tooltip: ''
            },
            new Separator(),
            {
                checked: this.filters.isFilteringFor("@hidden" /* TestFilterTerm.Hidden */),
                class: undefined,
                enabled: this.testService.excluded.hasAny,
                id: 'showExcluded',
                label: localize('testing.filters.showExcludedTests', "Show Hidden Tests"),
                run: () => this.filters.toggleFilteringFor("@hidden" /* TestFilterTerm.Hidden */),
                tooltip: ''
            },
            {
                class: undefined,
                enabled: this.testService.excluded.hasAny,
                id: 'removeExcluded',
                label: localize('testing.filters.removeTestExclusions', "Unhide All Tests"),
                run: async () => this.testService.excluded.clear(),
                tooltip: ''
            }
        ];
    }
    updateChecked() {
        this.element.classList.toggle('checked', this._action.checked);
    }
};
FiltersDropdownMenuActionViewItem = __decorate([
    __param(4, IContextMenuService),
    __param(5, ITestService)
], FiltersDropdownMenuActionViewItem);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdGluZ0V4cGxvcmVyRmlsdGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9icm93c2VyL3Rlc3RpbmdFeHBsb3JlckZpbHRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsa0JBQWtCLEVBQXNELE1BQU0sMERBQTBELENBQUM7QUFFbEosT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDNUcsT0FBTyxFQUFFLE1BQU0sRUFBMEIsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRW5HLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsMkNBQTJDLEVBQTBELE1BQU0scUVBQXFFLENBQUM7QUFDMUwsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQy9DLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUN2RCxPQUFPLEVB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