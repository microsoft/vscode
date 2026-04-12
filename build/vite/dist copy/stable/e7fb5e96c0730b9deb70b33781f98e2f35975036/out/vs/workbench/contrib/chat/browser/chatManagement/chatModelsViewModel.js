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
import { distinct } from '../../../../../base/common/arrays.js';
import { or, matchesCamelCase, matchesWords, matchesBaseContiguousSubString } from '../../../../../base/common/filters.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { localize } from '../../../../../nls.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
export const MODEL_ENTRY_TEMPLATE_ID = 'model.entry.template';
export const VENDOR_ENTRY_TEMPLATE_ID = 'vendor.entry.template';
export const GROUP_ENTRY_TEMPLATE_ID = 'group.entry.template';
const wordFilter = or(matchesBaseContiguousSubString, matchesWords);
const CAPABILITY_REGEX = /@capability:\s*([^\s]+)/gi;
const VISIBLE_REGEX = /@visible:\s*(true|false)/i;
const PROVIDER_REGEX = /@provider:\s*((".+?")|([^\s]+))/gi;
export const SEARCH_SUGGESTIONS = {
    FILTER_TYPES: [
        '@provider:',
        '@capability:',
        '@visible:'
    ],
    CAPABILITIES: [
        '@capability:tools',
        '@capability:vision',
        '@capability:agent'
    ],
    VISIBILITY: [
        '@visible:true',
        '@visible:false'
    ]
};
export function isLanguageModelProviderEntry(entry) {
    return entry.type === 'vendor';
}
export function isLanguageModelGroupEntry(entry) {
    return entry.type === 'group';
}
export function isStatusEntry(entry) {
    return entry.type === 'status';
}
export var ChatModelGroup;
(function (ChatModelGroup) {
    ChatModelGroup["Vendor"] = "vendor";
    ChatModelGroup["Visibility"] = "visibility";
})(ChatModelGroup || (ChatModelGroup = {}));
let ChatModelsViewModel = class ChatModelsViewModel extends Disposable {
    get groupBy() { return this._groupBy; }
    set groupBy(groupBy) {
        if (this._groupBy !== groupBy) {
            this._groupBy = groupBy;
            this.collapsedGroups.clear();
            this.languageModelGroups = this.groupModels(this.languageModels);
            this.doFilter();
            this._onDidChangeGrouping.fire(groupBy);
        }
    }
    constructor(languageModelsService) {
        super();
        this.languageModelsService = languageModelsService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._onDidChangeGrouping = this._register(new Emitter());
        this.onDidChangeGrouping = this._onDidChangeGrouping.event;
        this.languageModelGroupStatuses = [];
        this.languageModelGroups = [];
        this.collapsedGroups = new Set();
        this.searchValue = '';
        this.modelsSorted = false;
        this._groupBy = "vendor" /* ChatModelGroup.Vendor */;
        this._viewModelEntries = [];
        this.languageModels = [];
        this._register(this.languageModelsService.onDidChangeLanguageModels(vendor => this.refreshVendor(vendor)));
    }
    get viewModelEntries() {
        return this._viewModelEntries;
    }
    splice(at, removed, added) {
        this._viewModelEntries.splice(at, removed, ...added);
        if (this.selectedEntry) {
            this.selectedEntry = this._viewModelEntries.find(entry => entry.id === this.selectedEntry?.id);
        }
        this._onDidChange.fire({ at, removed, added });
    }
    shouldRefilter() {
        return !this.modelsSorted;
    }
    filter(searchValue) {
        if (searchValue !== this.searchValue) {
            this.searchValue = searchValue;
            this.collapsedGroups.clear();
            if (!this.modelsSorted) {
                this.languageModelGroups = this.groupModels(this.languageModels);
            }
            this.doFilter();
        }
        return this.viewModelEntries;
    }
    doFilter() {
        const viewModelEntries = [];
        const shouldShowGroupHeaders = this.languageModelGroups.length > 1;
        for (const group of this.languageModelGroups) {
            if (this.collapsedGroups.has(group.group.id)) {
                group.group.collapsed = true;
                if (shouldShowGroupHeaders) {
                    viewModelEntries.push(group.group);
                }
                continue;
            }
            const groupEntries = [];
            if (group.status) {
                groupEntries.push(group.status);
            }
            groupEntries.push(...this.filterModels(group.models, this.searchValue));
            if (groupEntries.length > 0) {
                group.group.collapsed = false;
                if (shouldShowGroupHeaders) {
                    viewModelEntries.push(group.group);
                }
                viewModelEntries.push(...groupEntries);
            }
        }
        this.splice(0, this._viewModelEntries.length, viewModelEntries);
    }
    filterModels(modelEntries, searchValue) {
        let visible;
        const visibleMatches = VISIBLE_REGEX.exec(searchValue);
        if (visibleMatches && visibleMatches[1]) {
            visible = visibleMatches[1].toLowerCase() === 'true';
            searchValue = searchValue.replace(VISIBLE_REGEX, '');
        }
        const providerNames = [];
        let providerMatch;
        PROVIDER_REGEX.lastIndex = 0;
        while ((providerMatch = PROVIDER_REGEX.exec(searchValue)) !== null) {
            const providerName = providerMatch[2] ? providerMatch[2].substring(1, providerMatch[2].length - 1) : providerMatch[3];
            providerNames.push(providerName);
        }
        if (providerNames.length > 0) {
            searchValue = searchValue.replace(PROVIDER_REGEX, '');
        }
        const capabilities = [];
        let capabilityMatch;
        CAPABILITY_REGEX.lastIndex = 0;
        while ((capabilityMatch = CAPABILITY_REGEX.exec(searchValue)) !== null) {
            capabilities.push(capabilityMatch[1].toLowerCase());
        }
        if (capabilities.length > 0) {
            searchValue = searchValue.replace(CAPABILITY_REGEX, '');
        }
        const quoteAtFirstChar = searchValue.charAt(0) === '"';
        const quoteAtLastChar = searchValue.charAt(searchValue.length - 1) === '"';
        const completeMatch = quoteAtFirstChar && quoteAtLastChar;
        if (quoteAtFirstChar) {
            searchValue = searchValue.substring(1);
        }
        if (quoteAtLastChar) {
            searchValue = searchValue.substring(0, searchValue.length - 1);
        }
        searchValue = searchValue.trim();
        const result = [];
        const words = searchValue.split(' ');
        const lowerProviders = providerNames.map(p => p.toLowerCase().trim());
        for (const modelEntry of modelEntries) {
            if (visible !== undefined) {
                if (modelEntry.visible !== visible) {
                    continue;
                }
            }
            if (lowerProviders.length > 0) {
                const matchesProvider = lowerProviders.some(provider => modelEntry.provider.vendor.vendor.toLowerCase() === provider ||
                    modelEntry.provider.vendor.displayName.toLowerCase() === provider);
                if (!matchesProvider) {
                    continue;
                }
            }
            // Filter by capabilities
            let matchedCapabilities = [];
            if (capabilities.length > 0) {
                if (!modelEntry.metadata.capabilities) {
                    continue;
                }
                let matchesAll = true;
                for (const capability of capabilities) {
                    const matchedForThisCapability = this.getMatchingCapabilities(modelEntry, capability);
                    if (matchedForThisCapability.length === 0) {
                        matchesAll = false;
                        break;
                    }
                    matchedCapabilities.push(...matchedForThisCapability);
                }
                if (!matchesAll) {
                    continue;
                }
                matchedCapabilities = distinct(matchedCapabilities);
            }
            // Filter by text
            let modelMatches;
            if (searchValue) {
                modelMatches = new ModelItemMatches(modelEntry, searchValue, words, completeMatch);
                if (!modelMatches.modelNameMatches && !modelMatches.modelIdMatches && !modelMatches.providerMatches && !modelMatches.capabilityMatches) {
                    continue;
                }
            }
            const modelId = this.getModelId(modelEntry);
            result.push({
                type: 'model',
                id: modelId,
                templateId: MODEL_ENTRY_TEMPLATE_ID,
                model: modelEntry,
                modelNameMatches: modelMatches?.modelNameMatches || undefined,
                modelIdMatches: modelMatches?.modelIdMatches || undefined,
                providerMatches: modelMatches?.providerMatches || undefined,
                capabilityMatches: matchedCapabilities.length ? matchedCapabilities : undefined,
            });
        }
        return result;
    }
    getMatchingCapabilities(modelEntry, capability) {
        const matchedCapabilities = [];
        if (!modelEntry.metadata.capabilities) {
            return matchedCapabilities;
        }
        switch (capability) {
            case 'tools':
            case 'toolcalling':
                if (modelEntry.metadata.capabilities.toolCalling === true) {
                    matchedCapabilities.push('toolCalling');
                }
                break;
            case 'vision':
                if (modelEntry.metadata.capabilities.vision === true) {
                    matchedCapabilities.push('vision');
                }
                break;
            case 'agent':
            case 'agentmode':
                if (modelEntry.metadata.capabilities.agentMode === true) {
                    matchedCapabilities.push('agentMode');
                }
                break;
            default:
                // Check edit tools
                if (modelEntry.metadata.capabilities.editTools) {
                    for (const tool of modelEntry.metadata.capabilities.editTools) {
                        if (tool.toLowerCase().includes(capability)) {
                            matchedCapabilities.push(tool);
                        }
                    }
                }
                break;
        }
        return matchedCapabilities;
    }
    groupModels(languageModels) {
        const result = [];
        if (this.groupBy === "visibility" /* ChatModelGroup.Visibility */) {
            const visible = [], hidden = [];
            for (const model of languageModels) {
                if (model.visible) {
                    visible.push(model);
                }
                else {
                    hidden.push(model);
                }
            }
            result.push({
                group: {
                    type: 'group',
                    id: 'visible',
                    label: localize('visible', "Visible"),
                    templateId: GROUP_ENTRY_TEMPLATE_ID,
                    collapsed: this.collapsedGroups.has('visible')
                },
                models: visible
            });
            result.push({
                group: {
                    type: 'group',
                    id: 'hidden',
                    label: localize('hidden', "Hidden"),
                    templateId: GROUP_ENTRY_TEMPLATE_ID,
                    collapsed: this.collapsedGroups.has('hidden'),
                },
                models: hidden
            });
        }
        else if (this.groupBy === "vendor" /* ChatModelGroup.Vendor */) {
            for (const model of languageModels) {
                const groupId = this.getProviderGroupId(model.provider.group);
                let group = result.find(group => group.group.id === groupId);
                if (!group) {
                    group = {
                        group: this.createLanguageModelProviderEntry(model.provider),
                        models: [],
                    };
                    result.push(group);
                }
                group.models.push(model);
            }
            for (const statusGroup of this.languageModelGroupStatuses) {
                const groupId = this.getProviderGroupId(statusGroup.provider.group);
                let group = result.find(group => group.group.id === groupId);
                if (!group) {
                    group = {
                        group: this.createLanguageModelProviderEntry(statusGroup.provider),
                        models: [],
                    };
                    result.push(group);
                }
                group.status = {
                    id: `status.${group.group.id}`,
                    type: 'status',
                    ...statusGroup.status,
                };
            }
            result.sort((a, b) => {
                if (a.models[0]?.provider.vendor.isDefault) {
                    return -1;
                }
                if (b.models[0]?.provider.vendor.isDefault) {
                    return 1;
                }
                return a.group.label.localeCompare(b.group.label);
            });
        }
        for (const group of result) {
            group.models.sort((a, b) => {
                if (a.provider.vendor.isDefault && b.provider.vendor.isDefault) {
                    return a.metadata.name.localeCompare(b.metadata.name);
                }
                if (a.provider.vendor.isDefault) {
                    return -1;
                }
                if (b.provider.vendor.isDefault) {
                    return 1;
                }
                if (a.provider.group.name === b.provider.group.name) {
                    return a.metadata.name.localeCompare(b.metadata.name);
                }
                return a.provider.group.name.localeCompare(b.provider.group.name);
            });
        }
        this.modelsSorted = true;
        return result;
    }
    createLanguageModelProviderEntry(provider) {
        const id = this.getProviderGroupId(provider.group);
        return {
            type: 'vendor',
            id,
            label: provider.group.name,
            templateId: VENDOR_ENTRY_TEMPLATE_ID,
            collapsed: this.collapsedGroups.has(id),
            vendorEntry: {
                group: provider.group,
                vendor: provider.vendor
            },
        };
    }
    getVendors() {
        return [...this.languageModelsService.getVendors()].sort((a, b) => {
            if (a.isDefault) {
                return -1;
            }
            if (b.isDefault) {
                return 1;
            }
            return a.displayName.localeCompare(b.displayName);
        });
    }
    async refresh() {
        await this.languageModelsService.selectLanguageModels({});
        await this.refreshAllVendors();
    }
    async refreshAllVendors() {
        this.languageModels = [];
        this.languageModelGroupStatuses = [];
        for (const vendor of this.getVendors()) {
            this.addVendorModels(vendor);
        }
        this.languageModelGroups = this.groupModels(this.languageModels);
        this.doFilter();
    }
    refreshVendor(vendorId) {
        const vendor = this.getVendors().find(v => v.vendor === vendorId);
        if (!vendor) {
            return;
        }
        // Remove existing models for this vendor
        this.languageModels = this.languageModels.filter(m => m.provider.vendor.vendor !== vendorId);
        this.languageModelGroupStatuses = this.languageModelGroupStatuses.filter(s => s.provider.vendor.vendor !== vendorId);
        // Add updated models for this vendor
        this.addVendorModels(vendor);
        this.languageModelGroups = this.groupModels(this.languageModels);
        this.doFilter();
    }
    addVendorModels(vendor) {
        const models = [];
        const languageModelsGroups = this.languageModelsService.getLanguageModelGroups(vendor.vendor);
        for (const group of languageModelsGroups) {
            const provider = {
                group: group.group ?? {
                    vendor: vendor.vendor,
                    name: vendor.displayName
                },
                vendor
            };
            if (group.status) {
                this.languageModelGroupStatuses.push({
                    provider,
                    status: {
                        message: group.status.message,
                        severity: group.status.severity
                    }
                });
            }
            for (const identifier of group.modelIdentifiers) {
                const metadata = this.languageModelsService.lookupLanguageModel(identifier);
                if (!metadata) {
                    continue;
                }
                if (vendor.isDefault && metadata.id === 'auto') {
                    continue;
                }
                models.push({
                    identifier,
                    metadata,
                    provider,
                    visible: metadata.isUserSelectable ?? false,
                });
            }
        }
        this.languageModels.push(...models.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)));
    }
    toggleVisibility(model) {
        const newVisibility = !model.model.visible;
        this.languageModelsService.updateModelPickerPreference(model.model.identifier, newVisibility);
        const metadata = this.languageModelsService.lookupLanguageModel(model.model.identifier);
        const index = this.viewModelEntries.indexOf(model);
        if (metadata && index !== -1) {
            model.model.visible = newVisibility;
            model.model.metadata = metadata;
            model.id = this.getModelId(model.model);
            if (this.groupBy === "visibility" /* ChatModelGroup.Visibility */) {
                this.modelsSorted = false;
            }
            this.splice(index, 1, [model]);
        }
    }
    setModelsVisibility(models, visible) {
        for (const model of models) {
            this.languageModelsService.updateModelPickerPreference(model.model.identifier, visible);
            model.model.visible = visible;
        }
        // Refresh to update the UI
        this.languageModelGroups = this.groupModels(this.languageModels);
        this.doFilter();
    }
    setGroupVisibility(group, visible) {
        const models = this.getModelsForGroup(group);
        for (const model of models) {
            this.languageModelsService.updateModelPickerPreference(model.identifier, visible);
            model.visible = visible;
        }
        // Refresh to update the UI
        this.languageModelGroups = this.groupModels(this.languageModels);
        this.doFilter();
    }
    getModelsForGroup(group) {
        if (isLanguageModelProviderEntry(group)) {
            return this.languageModels.filter(m => this.getProviderGroupId(m.provider.group) === group.id);
        }
        else {
            // Group by visibility
            return this.languageModels.filter(m => (group.id === 'visible' && m.visible) ||
                (group.id === 'hidden' && !m.visible));
        }
    }
    getModelId(modelEntry) {
        return `${modelEntry.provider.group.name}.${modelEntry.identifier}.${modelEntry.metadata.version}-visible:${modelEntry.visible}`;
    }
    getProviderGroupId(group) {
        return `${group.vendor}-${group.name}`;
    }
    toggleCollapsed(viewModelEntry) {
        const id = isLanguageModelGroupEntry(viewModelEntry) ? viewModelEntry.id : isLanguageModelProviderEntry(viewModelEntry) ? viewModelEntry.id : undefined;
        if (!id) {
            return;
        }
        this.selectedEntry = viewModelEntry;
        if (!this.collapsedGroups.delete(id)) {
            this.collapsedGroups.add(id);
        }
        this.doFilter();
    }
    collapseAll() {
        this.collapsedGroups.clear();
        for (const entry of this.viewModelEntries) {
            if (isLanguageModelProviderEntry(entry) || isLanguageModelGroupEntry(entry)) {
                this.collapsedGroups.add(entry.id);
            }
        }
        this.doFilter();
    }
    getConfiguredVendors() {
        const result = [];
        const seenVendors = new Set();
        for (const modelEntry of this.languageModels) {
            if (!seenVendors.has(modelEntry.provider.group.name)) {
                seenVendors.add(modelEntry.provider.group.name);
                result.push(modelEntry.provider);
            }
        }
        return result;
    }
};
ChatModelsViewModel = __decorate([
    __param(0, ILanguageModelsService)
], ChatModelsViewModel);
export { ChatModelsViewModel };
class ModelItemMatches {
    constructor(modelEntry, searchValue, words, completeMatch) {
        this.modelNameMatches = null;
        this.modelIdMatches = null;
        this.providerMatches = null;
        this.capabilityMatches = null;
        if (!completeMatch) {
            // Match against model name
            this.modelNameMatches = modelEntry.metadata.name ?
                this.matches(searchValue, modelEntry.metadata.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words) :
                null;
            this.modelIdMatches = this.matches(searchValue, modelEntry.metadata.id, or(matchesWords, matchesCamelCase), words);
            // Match against vendor display name
            this.providerMatches = this.matches(searchValue, modelEntry.provider.group.name, (word, wordToMatchAgainst) => matchesWords(word, wordToMatchAgainst, true), words);
            // Match against capabilities
            if (modelEntry.metadata.capabilities) {
                const capabilityStrings = [];
                if (modelEntry.metadata.capabilities.toolCalling) {
                    capabilityStrings.push('tools', 'toolCalling');
                }
                if (modelEntry.metadata.capabilities.vision) {
                    capabilityStrings.push('vision');
                }
                if (modelEntry.metadata.capabilities.agentMode) {
                    capabilityStrings.push('agent', 'agentMode');
                }
                if (modelEntry.metadata.capabilities.editTools) {
                    capabilityStrings.push(...modelEntry.metadata.capabilities.editTools);
                }
                const capabilityString = capabilityStrings.join(' ');
                if (capabilityString) {
                    this.capabilityMatches = this.matches(searchValue, capabilityString, or(matchesWords, matchesCamelCase), words);
                }
            }
        }
    }
    matches(searchValue, wordToMatchAgainst, wordMatchesFilter, words) {
        let matches = searchValue ? wordFilter(searchValue, wordToMatchAgainst) : null;
        if (!matches) {
            matches = this.matchesWords(words, wordToMatchAgainst, wordMatchesFilter);
        }
        if (matches) {
            matches = this.filterAndSort(matches);
        }
        return matches;
    }
    matchesWords(words, wordToMatchAgainst, wordMatchesFilter) {
        let matches = [];
        for (const word of words) {
            const wordMatches = wordMatchesFilter(word, wordToMatchAgainst);
            if (wordMatches) {
                matches = [...(matches || []), ...wordMatches];
            }
            else {
                matches = null;
                break;
            }
        }
        return matches;
    }
    filterAndSort(matches) {
        return distinct(matches, (a => a.start + '.' + a.end))
            .filter(match => !matches.some(m => !(m.start === match.start && m.end === match.end) && (m.start <= match.start && m.end >= match.end)))
            .sort((a, b) => a.start - b.start);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsc1ZpZXdNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0TWFuYWdlbWVudC9jaGF0TW9kZWxzVmlld01vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQW1CLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1SSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHNCQUFzQixFQUE2RSxNQUFNLHdDQUF3QyxDQUFDO0FBQzNKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFJckUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsc0JBQXNCLENBQUM7QUFDOUQsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsdUJBQXVCLENBQUM7QUFDaEUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsc0JBQXNCLENBQUM7QUFFOUQsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDLDhCQUE4QixFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQ3BFLE1BQU0sZ0JBQWdCLEdBQUcsMkJBQTJCLENBQUM7QUFDckQsTUFBTSxhQUFhLEdBQUcsMkJBQTJCLENBQUM7QUFDbEQsTUFBTSxjQUFjLEdBQUcsbUNBQW1DLENBQUM7QUFFM0QsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUc7SUFDakMsWUFBWSxFQUFFO1FBQ2IsWUFBWTtRQUNaLGNBQWM7UUFDZCxXQUFX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