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
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { Separator } from '../../../../base/common/actions.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { localize } from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ADVANCED_SETTING_TAG, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, GENERAL_TAG_SETTING_TAG, ID_SETTING_TAG, LANGUAGE_SETTING_TAG, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG } from '../common/preferences.js';
let SettingsSearchFilterDropdownMenuActionViewItem = class SettingsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
    constructor(action, options, actionRunner, searchWidget, contextMenuService) {
        super(action, { getActions: () => this.getActions() }, contextMenuService, {
            ...options,
            actionRunner,
            classNames: action.class,
            anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */,
            menuAsChild: true
        });
        this.searchWidget = searchWidget;
        this.suggestController = SuggestController.get(this.searchWidget.inputWidget);
    }
    render(container) {
        super.render(container);
    }
    doSearchWidgetAction(queryToAppend, triggerSuggest) {
        this.searchWidget.setValue(this.searchWidget.getValue().trimEnd() + ' ' + queryToAppend);
        this.searchWidget.focus();
        if (triggerSuggest && this.suggestController) {
            this.suggestController.triggerSuggest();
        }
    }
    /**
     * The created action appends a query to the search widget search string. It optionally triggers suggestions.
     */
    createAction(id, label, tooltip, queryToAppend, triggerSuggest) {
        return {
            id,
            label,
            tooltip,
            class: undefined,
            enabled: true,
            run: () => { this.doSearchWidgetAction(queryToAppend, triggerSuggest); }
        };
    }
    /**
     * The created action appends a query to the search widget search string, if the query does not exist.
     * Otherwise, it removes the query from the search widget search string.
     * The action does not trigger suggestions after adding or removing the query.
     */
    createToggleAction(id, label, tooltip, queryToAppend) {
        const splitCurrentQuery = this.searchWidget.getValue().split(' ');
        const queryContainsQueryToAppend = splitCurrentQuery.includes(queryToAppend);
        return {
            id,
            label,
            tooltip,
            class: undefined,
            enabled: true,
            checked: queryContainsQueryToAppend,
            run: () => {
                if (!queryContainsQueryToAppend) {
                    const trimmedCurrentQuery = this.searchWidget.getValue().trimEnd();
                    const newQuery = trimmedCurrentQuery ? trimmedCurrentQuery + ' ' + queryToAppend : queryToAppend;
                    this.searchWidget.setValue(newQuery);
                }
                else {
                    const queryWithRemovedTags = this.searchWidget.getValue().split(' ')
                        .filter(word => word !== queryToAppend).join(' ');
                    this.searchWidget.setValue(queryWithRemovedTags);
                }
                this.searchWidget.focus();
            }
        };
    }
    createMutuallyExclusiveToggleAction(id, label, tooltip, filter, excludeFilters) {
        const isFilterEnabled = this.searchWidget.getValue().split(' ').includes(filter);
        return {
            id,
            label,
            tooltip,
            class: undefined,
            enabled: true,
            checked: isFilterEnabled,
            run: () => {
                if (isFilterEnabled) {
                    const queryWithRemovedTags = this.searchWidget.getValue().split(' ')
                        .filter(word => word !== filter).join(' ');
                    this.searchWidget.setValue(queryWithRemovedTags);
                }
                else {
                    let newQuery = this.searchWidget.getValue().split(' ')
                        .filter(word => !excludeFilters.includes(word) && word !== filter)
                        .join(' ')
                        .trimEnd();
                    newQuery = newQuery ? newQuery + ' ' + filter : filter;
                    this.searchWidget.setValue(newQuery);
                }
                this.searchWidget.focus();
            }
        };
    }
    getActions() {
        return [
            this.createToggleAction('modifiedSettingsSearch', localize('modifiedSettingsSearch', "Modified"), localize('modifiedSettingsSearchTooltip', "Add or remove modified settings filter"), `@${MODIFIED_SETTING_TAG}`),
            new Separator(),
            this.createAction('extSettingsSearch', localize('extSettingsSearch', "Extension ID..."), localize('extSettingsSearchTooltip', "Add extension ID filter"), `@${EXTENSION_SETTING_TAG}`, true),
            this.createAction('featuresSettingsSearch', localize('featureSettingsSearch', "Feature..."), localize('featureSettingsSearchTooltip', "Add feature filter"), `@${FEATURE_SETTING_TAG}`, true),
            this.createAction('tagSettingsSearch', localize('tagSettingsSearch', "Tag..."), localize('tagSettingsSearchTooltip', "Add tag filter"), `@${GENERAL_TAG_SETTING_TAG}`, true),
            this.createAction('langSettingsSearch', localize('langSettingsSearch', "Language..."), localize('langSettingsSearchTooltip', "Add language ID filter"), `@${LANGUAGE_SETTING_TAG}`, true),
            this.createAction('idSettingsSearch', localize('idSettingsSearch', "Setting ID..."), localize('idSettingsSearchTooltip', "Add Setting ID filter"), `@${ID_SETTING_TAG}`, false),
            new Separator(),
            this.createToggleAction('onlineSettingsSearch', localize('onlineSettingsSearch', "Online services"), localize('onlineSettingsSearchTooltip', "Show settings for online services"), '@tag:usesOnlineServices'),
            this.createToggleAction('policySettingsSearch', localize('policySettingsSearch', "Organization policies"), localize('policySettingsSearchTooltip', "Show organization policy settings"), `@${POLICY_SETTING_TAG}`),
            new Separator(),
            this.createMutuallyExclusiveToggleAction('stableSettingsSearch', localize('stableSettings', "Stable"), localize('stableSettingsSearchTooltip', "Show stable settings"), `@stable`, ['@tag:preview', '@tag:experimental']),
            this.createMutuallyExclusiveToggleAction('previewSettingsSearch', localize('previewSettings', "Preview"), localize('previewSettingsSearchTooltip', "Show preview settings"), `@tag:preview`, ['@stable', '@tag:experimental']),
            this.createMutuallyExclusiveToggleAction('experimentalSettingsSearch', localize('experimental', "Experimental"), localize('experimentalSettingsSearchTooltip', "Show experimental settings"), `@tag:experimental`, ['@stable', '@tag:preview']),
            new Separator(),
            this.createToggleAction('advancedSettingsSearch', localize('advancedSettingsSearch', "Advanced"), localize('advancedSettingsSearchTooltip', "Show advanced settings"), `@tag:${ADVANCED_SETTING_TAG}`),
        ];
    }
};
SettingsSearchFilterDropdownMenuActionViewItem = __decorate([
    __param(4, IContextMenuService)
], SettingsSearchFilterDropdownMenuActionViewItem);
export { SettingsSearchFilterDropdownMenuActionViewItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NTZWFyY2hNZW51LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcHJlZmVyZW5jZXMvYnJvd3Nlci9zZXR0aW5nc1NlYXJjaE1lbnUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDNUcsT0FBTyxFQUEwQixTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUNwRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFOUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLHFCQUFxQixFQUFFLG1CQUFtQixFQUFFLHVCQUF1QixFQUFFLGNBQWMsRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRTlNLElBQU0sOENBQThDLEdBQXBELE1BQU0sOENBQStDLFNBQVEsMEJBQTBCO0lBRzdGLFlBQ0MsTUFBZSxFQUNmLE9BQStCLEVBQy9CLFlBQXVDLEVBQ3RCLFlBQWlDLEVBQzdCLGtCQUF1QztRQUU1RCxLQUFLLENBQUMsTUFBTSxFQUNYLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsRUFBRSxFQUN2QyxrQkFBa0IsRUFDbEI7WUFDQyxHQUFHLE9BQU87WUFDVixZQUFZO1lBQ1osVUFBVSxFQUFFLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLHVCQUF1QixFQUFFLEdBQUcsRUFBRSw4QkFBc0I7WUFDcEQsV0FBVyxFQUFFLElBQUk7U0FDakIs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