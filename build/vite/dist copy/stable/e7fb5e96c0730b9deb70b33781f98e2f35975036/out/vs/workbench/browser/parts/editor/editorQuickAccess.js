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
var ActiveGroupEditorsByMostRecentlyUsedQuickAccess_1, AllEditorsByAppearanceQuickAccess_1, AllEditorsByMostRecentlyUsedQuickAccess_1;
import './media/editorquickaccess.css';
import { localize } from '../../../../nls.js';
import { quickPickItemScorerAccessor } from '../../../../platform/quickinput/common/quickInput.js';
import { PickerQuickAccessProvider, TriggerAction } from '../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { prepareQuery, scoreItemFuzzy, compareItemsByFuzzyScore } from '../../../../base/common/fuzzyScorer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
let BaseEditorQuickAccessProvider = class BaseEditorQuickAccessProvider extends PickerQuickAccessProvider {
    constructor(prefix, editorGroupService, editorService, modelService, languageService) {
        super(prefix, {
            canAcceptInBackground: true,
            noResultsPick: {
                label: localize('noViewResults', "No matching editors"),
                groupId: -1
            }
        });
        this.editorGroupService = editorGroupService;
        this.editorService = editorService;
        this.modelService = modelService;
        this.languageService = languageService;
        this.pickState = new class {
            constructor() {
                this.scorerCache = Object.create(null);
                this.isQuickNavigating = undefined;
            }
            reset(isQuickNavigating) {
                // Caches
                if (!isQuickNavigating) {
                    this.scorerCache = Object.create(null);
                }
                // Other
                this.isQuickNavigating = isQuickNavigating;
            }
        };
    }
    provide(picker, token) {
        // Reset the pick state for this run
        this.pickState.reset(!!picker.quickNavigate);
        // Start picker
        return super.provide(picker, token);
    }
    _getPicks(filter) {
        const query = prepareQuery(filter);
        // Filtering
        const filteredEditorEntries = this.doGetEditorPickItems().filter(entry => {
            if (!query.normalized) {
                return true;
            }
            // Score on label and description
            const itemScore = scoreItemFuzzy(entry, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
            if (!itemScore.score) {
                return false;
            }
            // Apply highlights
            entry.highlights = { label: itemScore.labelMatch, description: itemScore.descriptionMatch };
            return true;
        });
        // Sorting
        if (query.normalized) {
            const groups = this.editorGroupService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */).map(group => group.id);
            filteredEditorEntries.sort((entryA, entryB) => {
                if (entryA.groupId !== entryB.groupId) {
                    return groups.indexOf(entryA.groupId) - groups.indexOf(entryB.groupId); // older groups first
                }
                return compareItemsByFuzzyScore(entryA, entryB, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
            });
        }
        // Grouping (for more than one group)
        const filteredEditorEntriesWithSeparators = [];
        if (this.editorGroupService.count > 1) {
            let lastGroupId = undefined;
            for (const entry of filteredEditorEntries) {
                if (typeof lastGroupId !== 'number' || lastGroupId !== entry.groupId) {
                    const group = this.editorGroupService.getGroup(entry.groupId);
                    if (group) {
                        filteredEditorEntriesWithSeparators.push({ type: 'separator', label: group.label });
                    }
                    lastGroupId = entry.groupId;
                }
                filteredEditorEntriesWithSeparators.push(entry);
            }
        }
        else {
            filteredEditorEntriesWithSeparators.push(...filteredEditorEntries);
        }
        return filteredEditorEntriesWithSeparators;
    }
    doGetEditorPickItems() {
        const editors = this.doGetEditors();
        const mapGroupIdToGroupAriaLabel = new Map();
        for (const { groupId } of editors) {
            if (!mapGroupIdToGroupAriaLabel.has(groupId)) {
                const group = this.editorGroupService.getGroup(groupId);
                if (group) {
                    mapGroupIdToGroupAriaLabel.set(groupId, group.ariaLabel);
                }
            }
        }
        return this.doGetEditors().map(({ editor, groupId }) => {
            const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
            const isDirty = editor.isDirty() && !editor.isSaving();
            const description = editor.getDescription();
            const nameAndDescription = description ? `${editor.getName()} ${description}` : editor.getName();
            const icon = editor.getIcon();
            return {
                groupId,
                resource,
                label: editor.getName(),
                ariaLabel: (() => {
                    if (mapGroupIdToGroupAriaLabel.size > 1) {
                        return isDirty ?
                            localize('entryAriaLabelWithGroupDirty', "{0}, unsaved changes, {1}", nameAndDescription, mapGroupIdToGroupAriaLabel.get(groupId)) :
                            localize('entryAriaLabelWithGroup', "{0}, {1}", nameAndDescription, mapGroupIdToGroupAriaLabel.get(groupId));
                    }
                    return isDirty ? localize('entryAriaLabelDirty', "{0}, unsaved changes", nameAndDescription) : nameAndDescription;
                })(),
                description,
                iconPath: URI.isUri(icon) ? { dark: icon } : undefined,
                iconClasses: getIconClasses(this.modelService, this.languageService, resource, undefined, icon).concat(editor.getLabelExtraClasses()),
                italic: !this.editorGroupService.getGroup(groupId)?.isPinned(editor),
                buttons: (() => {
                    return [
                        {
                            iconClass: isDirty ? ('dirty-editor ' + ThemeIcon.asClassName(Codicon.closeDirty)) : ThemeIcon.asClassName(Codicon.close),
                            tooltip: localize('closeEditor', "Close Editor"),
                            alwaysVisible: isDirty
                        }
                    ];
                })(),
                trigger: async () => {
                    const group = this.editorGroupService.getGroup(groupId);
                    if (group) {
                        await group.closeEditor(editor, { preserveFocus: true });
                        if (!group.contains(editor)) {
                            return TriggerAction.REMOVE_ITEM;
                        }
                    }
                    return TriggerAction.NO_ACTION;
                },
                accept: (keyMods, event) => this.editorGroupService.getGroup(groupId)?.openEditor(editor, { preserveFocus: event.inBackground }),
            };
        });
    }
};
BaseEditorQuickAccessProvider = __decorate([
    __param(1, IEditorGroupsService),
    __param(2, IEditorService),
    __param(3, IModelService),
    __param(4, ILanguageService)
], BaseEditorQuickAccessProvider);
export { BaseEditorQuickAccessProvider };
//#region Active Editor Group Editors by Most Recently Used
let ActiveGroupEditorsByMostRecentlyUsedQuickAccess = class ActiveGroupEditorsByMostRecentlyUsedQuickAccess extends BaseEditorQuickAccessProvider {
    static { ActiveGroupEditorsByMostRecentlyUsedQuickAccess_1 = this; }
    static { this.PREFIX = 'edt active '; }
    constructor(editorGroupService, editorService, modelService, languageService) {
        super(ActiveGroupEditorsByMostRecentlyUsedQuickAccess_1.PREFIX, editorGroupService, editorService, modelService, languageService);
    }
    doGetEditors() {
        const group = this.editorGroupService.activeGroup;
        return group.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */).map(editor => ({ editor, groupId: group.id }));
    }
};
ActiveGroupEditorsByMostRecentlyUsedQuickAccess = ActiveGroupEditorsByMostRecentlyUsedQuickAccess_1 = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IEditorService),
    __param(2, IModelService),
    __param(3, ILanguageService)
], ActiveGroupEditorsByMostRecentlyUsedQuickAccess);
export { ActiveGroupEditorsByMostRecentlyUsedQuickAccess };
//#endregion
//#region All Editors by Appearance
let AllEditorsByAppearanceQuickAccess = class AllEditorsByAppearanceQuickAccess extends BaseEditorQuickAccessProvider {
    static { AllEditorsByAppearanceQuickAccess_1 = this; }
    static { this.PREFIX = 'edt '; }
    constructor(editorGroupService, editorService, modelService, languageService) {
        super(AllEditorsByAppearanceQuickAccess_1.PREFIX, editorGroupService, editorService, modelService, languageService);
    }
    doGetEditors() {
        const entries = [];
        for (const group of this.editorGroupService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */)) {
            for (const editor of group.getEditors(1 /* EditorsOrder.SEQUENTIAL */)) {
                entries.push({ editor, groupId: group.id });
            }
        }
        return entries;
    }
};
AllEditorsByAppearanceQuickAccess = AllEditorsByAppearanceQuickAccess_1 = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IEditorService),
    __param(2, IModelService),
    __param(3, ILanguageService)
], AllEditorsByAppearanceQuickAccess);
export { AllEditorsByAppearanceQuickAccess };
//#endregion
//#region All Editors by Most Recently Used
let AllEditorsByMostRecentlyUsedQuickAccess = class AllEditorsByMostRecentlyUsedQuickAccess extends BaseEditorQuickAccessProvider {
    static { AllEditorsByMostRecentlyUsedQuickAccess_1 = this; }
    static { this.PREFIX = 'edt mru '; }
    constructor(editorGroupService, editorService, modelService, languageService) {
        super(AllEditorsByMostRecentlyUsedQuickAccess_1.PREFIX, editorGroupService, editorService, modelService, languageService);
    }
    doGetEditors() {
        const entries = [];
        for (const editor of this.editorService.getEditors(0 /* EditorsOrder.MOST_RECENTLY_ACTIVE */)) {
            entries.push(editor);
        }
        return entries;
    }
};
AllEditorsByMostRecentlyUsedQuickAccess = AllEditorsByMostRecentlyUsedQuickAccess_1 = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IEditorService),
    __param(2, IModelService),
    __param(3, ILanguageService)
], AllEditorsByMostRecentlyUsedQuickAccess);
export { AllEditorsByMostRecentlyUsedQuickAccess };
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUXVpY2tBY2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sK0JBQStCLENBQUM7QUFDdkMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBdUIsMkJBQTJCLEVBQTBDLE1BQU0sc0RBQXNELENBQUM7QUFDaEssT0FBTyxFQUFFLHlCQUF5QixFQUEwQixhQUFhLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNoSixPQUFPLEVBQUUsb0JBQW9CLEVBQWUsTUFBTSx3REFBd0QsQ0FBQztBQUMzRyxPQUFPLEVBQW1DLHNCQUFzQixFQUFFLGdCQUFnQixFQUFtQixNQUFNLDJCQUEyQixDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDNUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLHdCQUF3QixFQUFvQixNQUFNLHdDQUF3QyxDQUFDO0FBR2xJLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBTTlDLElBQWUsNkJBQTZCLEdBQTVDLE1BQWUsNkJBQThCLFNBQVEseUJB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