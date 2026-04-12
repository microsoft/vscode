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
var ModelNameColumnRenderer_1, MultiplierColumnRenderer_1, TokenLimitsColumnRenderer_1, ActionsColumnRenderer_1, ChatModelsWidget_1;
import './media/chatModelsWidget.css';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { toAction, Action, Separator, SubmenuAction } from '../../../../../base/common/actions.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ChatModelsViewModel, SEARCH_SUGGESTIONS, isLanguageModelProviderEntry, isLanguageModelGroupEntry, isStatusEntry } from './chatModelsViewModel.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { SuggestEnabledInput } from '../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { Delayer } from '../../../../../base/common/async.js';
import { settingsTextInputBorder } from '../../../preferences/common/settingsEditorColorRegistry.js';
import { IChatEntitlementService, ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { DropdownMenuActionViewItem } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { ToolBar } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { preferencesClearInputIcon } from '../../../preferences/browser/preferencesIcons.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IEditorProgressService } from '../../../../../platform/progress/common/progress.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { CONTEXT_MODELS_SEARCH_FOCUS } from '../../common/constants.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../../base/common/severity.js';
const $ = DOM.$;
const HEADER_HEIGHT = 30;
const VENDOR_ROW_HEIGHT = 30;
const MODEL_ROW_HEIGHT = 26;
export function getModelHoverContent(model) {
    const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
    markdown.appendMarkdown(`**${model.metadata.name}**`);
    if (model.metadata.id !== model.metadata.version) {
        markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}@${model.metadata.version}_&nbsp;</span>`);
    }
    else {
        markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}_&nbsp;</span>`);
    }
    markdown.appendText(`\n`);
    if (model.metadata.statusIcon && model.metadata.tooltip) {
        if (model.metadata.statusIcon) {
            markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
        }
        markdown.appendMarkdown(`${model.metadata.tooltip}`);
        markdown.appendText(`\n`);
    }
    if (model.metadata.multiplier) {
        markdown.appendMarkdown(`${localize('models.cost', 'Multiplier')}: `);
        markdown.appendMarkdown(model.metadata.multiplier);
        markdown.appendText(`\n`);
    }
    if (model.metadata.maxInputTokens || model.metadata.maxOutputTokens) {
        const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
        markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
        markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
        markdown.appendText(`\n`);
    }
    if (model.metadata.capabilities) {
        markdown.appendMarkdown(`${localize('models.capabilities', 'Capabilities')}: `);
        if (model.metadata.capabilities?.toolCalling) {
            markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.toolCalling', 'Tools')}_&nbsp;</span>`);
        }
        if (model.metadata.capabilities?.vision) {
            markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.vision', 'Vision')}_&nbsp;</span>`);
        }
        if (model.metadata.capabilities?.agentMode) {
            markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize('models.agentMode', 'Agent Mode')}_&nbsp;</span>`);
        }
        for (const editTool of model.metadata.capabilities.editTools ?? []) {
            markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${editTool}_&nbsp;</span>`);
        }
        markdown.appendText(`\n`);
    }
    return markdown;
}
class ModelsFilterAction extends Action {
    constructor() {
        super('workbench.models.filter', localize('filter', "Filter"), ThemeIcon.asClassName(Codicon.filter));
    }
    async run() {
    }
}
function toggleFilter(currentQuery, filter) {
    const { query, synonyms = [], excludes = [] } = filter;
    const allSynonyms = [query, ...synonyms];
    const isChecked = allSynonyms.some(q => currentQuery.includes(q));
    const hasExcludedQuery = excludes.some(q => currentQuery.includes(q));
    if (isChecked) {
        // Query or synonym is already set, remove all of them (toggle off)
        let queryWithRemovedFilter = currentQuery;
        for (const q of allSynonyms) {
            queryWithRemovedFilter = queryWithRemovedFilter.replace(q, '');
        }
        return queryWithRemovedFilter.replace(/\s+/g, ' ').trim();
    }
    else if (hasExcludedQuery) {
        // An excluded query is set, replace it with the new query
        let newQuery = currentQuery;
        for (const q of excludes) {
            newQuery = newQuery.replace(q, '');
        }
        newQuery = newQuery.replace(/\s+/g, ' ').trim();
        return newQuery ? `${newQuery} ${query}` : query;
    }
    else {
        // No filter is set, add the new query
        const trimmedQuery = currentQuery.trim();
        return trimmedQuery ? `${trimmedQuery} ${query}` : query;
    }
}
let ModelsSearchFilterDropdownMenuActionViewItem = class ModelsSearchFilterDropdownMenuActionViewItem extends DropdownMenuActionViewItem {
    constructor(action, options, search, viewModel, contextMenuService) {
        super(action, { getActions: () => this.getActions() }, contextMenuService, {
            ...options,
            classNames: action.class,
            anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */,
            menuAsChild: true
        });
        this.search = search;
        this.viewModel = viewModel;
    }
    createGroupByAction(grouping, label) {
        return {
            id: `groupBy.${grouping}`,
            label,
            class: undefined,
            enabled: true,
            tooltip: localize('groupByTooltip', "Group by {0}", label),
            checked: this.viewModel.groupBy === grouping,
            run: () => {
                this.viewModel.groupBy = grouping;
            }
        };
    }
    createProviderAction(vendor, displayName) {
        const query = `@provider:"${displayName}"`;
        const currentQuery = this.search.getValue();
        const isChecked = currentQuery.includes(query) || currentQuery.includes(`@provider:${vendor}`);
        return {
            id: `provider-${vendor}`,
            label: displayName,
            tooltip: localize('filterByProvider', "Filter by {0}", displayName),
            class: undefined,
            enabled: true,
            checked: isChecked,
            run: () => this.toggleFilterAndSearch({ query, synonyms: [`@provider:${vendor}`] })
        };
    }
    createCapabilityAction(capability, label) {
        const query = `@capability:${capability}`;
        const currentQuery = this.search.getValue();
        const isChecked = currentQuery.includes(query);
        return {
            id: `capability-${capability}`,
            label,
            tooltip: localize('filterByCapability', "Filter by {0}", label),
            class: undefined,
            enabled: true,
            checked: isChecked,
            run: () => this.toggleFilterAndSearch({ query })
        };
    }
    createVisibleAction(visible, label) {
        const query = `@visible:${visible}`;
        const currentQuery = this.search.getValue();
        const isChecked = currentQuery.includes(query);
        return {
            id: `visible-${visible}`,
            label,
            tooltip: localize('filterByVisible', "Filter by {0}", label),
            class: undefined,
            enabled: true,
            checked: isChecked,
            run: () => this.toggleFilterAndSearch({ query, excludes: [`@visible:${!visible}`] })
        };
    }
    toggleFilterAndSearch(filter) {
        const currentQuery = this.search.getValue();
        const newQuery = toggleFilter(currentQuery, filter);
        this.search.setValue(newQuery);
    }
    getActions() {
        const actions = [];
        // Capability filters
        actions.push(this.createCapabilityAction('tools', localize('capability.tools', "Tools")), this.createCapabilityAction('vision', localize('capability.vision', "Vision")), this.createCapabilityAction('agent', localize('capability.agent', "Agent Mode")));
        // Visibility filters
        actions.push(new Separator());
        actions.push(this.createVisibleAction(true, localize('filter.visible', "Visible in Chat Model Picker")));
        actions.push(this.createVisibleAction(false, localize('filter.hidden', "Hidden in Chat Model Picker")));
        // Provider filters - only show providers with configured models
        const configuredVendors = this.viewModel.getConfiguredVendors();
        if (configuredVendors.length > 1) {
            actions.push(new Separator());
            actions.push(...configuredVendors.map(vendor => this.createProviderAction(vendor.vendor.vendor, vendor.group.name)));
        }
        // Group By
        actions.push(new Separator());
        const groupByActions = [];
        groupByActions.push(this.createGroupByAction("vendor" /* ChatModelGroup.Vendor */, localize('groupBy.provider', "Provider")));
        groupByActions.push(this.createGroupByAction("visibility" /* ChatModelGroup.Visibility */, localize('groupBy.visibility', "Visibility (Chat Model Picker)")));
        actions.push(new SubmenuAction('groupBy', localize('groupBy', "Group By"), groupByActions));
        return actions;
    }
};
ModelsSearchFilterDropdownMenuActionViewItem = __decorate([
    __param(4, IContextMenuService)
], ModelsSearchFilterDropdownMenuActionViewItem);
class Delegate {
    constructor() {
        this.headerRowHeight = HEADER_HEIGHT;
    }
    getHeight(element) {
        return isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element) ? VENDOR_ROW_HEIGHT : MODEL_ROW_HEIGHT;
    }
}
class ModelsTableColumnRenderer {
    renderElement(element, index, templateData) {
        templateData.elementDisposables.clear();
        const isVendor = isLanguageModelProviderEntry(element);
        const isGroup = isLanguageModelGroupEntry(element);
        const isStatus = isStatusEntry(element);
        templateData.container.classList.add('models-table-column');
        templateData.container.parentElement.classList.toggle('models-vendor-row', isVendor || isGroup);
        templateData.container.parentElement.classList.toggle('models-model-row', !isVendor && !isGroup);
        templateData.container.parentElement.classList.toggle('models-status-row', isStatus);
        templateData.container.parentElement.classList.toggle('model-hidden', !isVendor && !isGroup && !isStatus && !element.model.visible);
        if (isVendor) {
            this.renderVendorElement(element, index, templateData);
        }
        else if (isGroup) {
            this.renderGroupElement(element, index, templateData);
        }
        else if (isStatus) {
            this.renderStatusElement(element, index, templateData);
        }
        else {
            this.renderModelElement(element, index, templateData);
        }
    }
    renderStatusElement(element, index, templateData) { }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.disposables.dispose();
    }
}
class GutterColumnRenderer extends ModelsTableColumnRenderer {
    static { this.TEMPLATE_ID = 'gutter'; }
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
        this.templateId = GutterColumnRenderer.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        container.classList.add('models-gutter-column');
        const actionBar = disposables.add(new ActionBar(container));
        return {
            listRowElement: container.parentElement?.parentElement ?? null,
            container,
            actionBar,
            disposables,
            elementDisposables
        };
    }
    renderElement(entry, index, templateData) {
        templateData.actionBar.clear();
        super.renderElement(entry, index, templateData);
    }
    renderVendorElement(entry, index, templateData) {
        this.renderCollapsableElement(entry, templateData);
    }
    renderGroupElement(entry, index, templateData) {
        this.renderCollapsableElement(entry, templateData);
    }
    renderCollapsableElement(entry, templateData) {
        if (templateData.listRowElement) {
            templateData.listRowElement.setAttribute('aria-expanded', entry.collapsed ? 'false' : 'true');
        }
        const label = entry.collapsed ? localize('expand', 'Expand') : localize('collapse', 'Collapse');
        const toggleCollapseAction = {
            id: 'toggleCollapse',
            label,
            tooltip: label,
            enabled: true,
            class: ThemeIcon.asClassName(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown),
            run: () => this.viewModel.toggleCollapsed(entry)
        };
        templateData.actionBar.push(toggleCollapseAction, { icon: true, label: false });
    }
    renderModelElement(entry, index, templateData) {
        const { model: modelEntry } = entry;
        const isVisible = modelEntry.visible;
        const toggleVisibilityAction = toAction({
            id: 'toggleVisibility',
            label: isVisible ? localize('models.hide', 'Hide') : localize('models.show', 'Show'),
            class: `model-visibility-toggle ${isVisible ? `${ThemeIcon.asClassName(Codicon.eye)} model-visible` : `${ThemeIcon.asClassName(Codicon.eyeClosed)} model-hidden`}`,
            tooltip: isVisible ? localize('models.visible', 'Hide in the chat model picker') : localize('models.hidden', 'Show in the chat model picker'),
            checked: !isVisible,
            run: async () => this.viewModel.toggleVisibility(entry)
        });
        templateData.actionBar.push(toggleVisibilityAction, { icon: true, label: false });
    }
}
let ModelNameColumnRenderer = class ModelNameColumnRenderer extends ModelsTableColumnRenderer {
    static { ModelNameColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'modelName'; }
    constructor(hoverService) {
        super();
        this.hoverService = hoverService;
        this.templateId = ModelNameColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        const nameContainer = DOM.append(container, $('.model-name-container'));
        const statusIcon = DOM.append(nameContainer, $('.status-icon'));
        const nameLabel = disposables.add(new HighlightedLabel(DOM.append(nameContainer, $('.model-name'))));
        const modelStatusIcon = DOM.append(nameContainer, $('.model-status-icon'));
        const actionBar = disposables.add(new ActionBar(DOM.append(nameContainer, $('.model-name-actions'))));
        return {
            container,
            statusIcon,
            nameLabel,
            modelStatusIcon,
            actionBar,
            disposables,
            elementDisposables
        };
    }
    renderElement(entry, index, templateData) {
        DOM.clearNode(templateData.modelStatusIcon);
        templateData.actionBar.clear();
        templateData.nameLabel.element.classList.remove('error-status', 'warning-status', 'info-status');
        super.renderElement(entry, index, templateData);
    }
    renderVendorElement(entry, index, templateData) {
        templateData.nameLabel.set(entry.vendorEntry.group.name, undefined);
    }
    renderGroupElement(entry, index, templateData) {
        templateData.nameLabel.set(entry.label, undefined);
    }
    renderModelElement(entry, index, templateData) {
        const { model: modelEntry, modelNameMatches } = entry;
        templateData.statusIcon.style.display = 'none';
        templateData.modelStatusIcon.className = 'model-status-icon';
        if (modelEntry.metadata.statusIcon) {
            templateData.modelStatusIcon.classList.add(...ThemeIcon.asClassNameArray(modelEntry.metadata.statusIcon));
            templateData.modelStatusIcon.style.display = '';
        }
        else {
            templateData.modelStatusIcon.style.display = 'none';
        }
        templateData.nameLabel.set(modelEntry.metadata.name, modelNameMatches);
        const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
        markdown.appendMarkdown(`**${entry.model.metadata.name}**`);
        if (entry.model.metadata.id !== entry.model.metadata.version) {
            markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}@${entry.model.metadata.version}_&nbsp;</span>`);
        }
        else {
            markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}_&nbsp;</span>`);
        }
        markdown.appendText(`\n`);
        if (entry.model.metadata.statusIcon && entry.model.metadata.tooltip) {
            if (entry.model.metadata.statusIcon) {
                markdown.appendMarkdown(`$(${entry.model.metadata.statusIcon.id})&nbsp;`);
            }
            markdown.appendMarkdown(`${entry.model.metadata.tooltip}`);
            markdown.appendText(`\n`);
        }
        if (!entry.model.visible) {
            markdown.appendMarkdown(`\n\n${localize('models.userSelectable', 'This model is hidden in the chat model picker')}`);
        }
        templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
            content: markdown,
            appearance: {
                compact: true,
                skipFadeInAnimation: true,
            }
        })));
    }
    renderStatusElement(entry, index, templateData) {
        templateData.statusIcon.style.display = '';
        templateData.statusIcon.className = 'status-icon';
        switch (entry.severity) {
            case Severity.Error:
                templateData.nameLabel.element.classList.add('error-status');
                templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
                break;
            case Severity.Warning:
                templateData.nameLabel.element.classList.add('warning-status');
                templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
                break;
            case Severity.Info:
                templateData.nameLabel.element.classList.add('info-status');
                templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
                break;
        }
        templateData.nameLabel.set(entry.message, undefined, entry.message);
    }
};
ModelNameColumnRenderer = ModelNameColumnRenderer_1 = __decorate([
    __param(0, IHoverService)
], ModelNameColumnRenderer);
let MultiplierColumnRenderer = class MultiplierColumnRenderer extends ModelsTableColumnRenderer {
    static { MultiplierColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'multiplier'; }
    constructor(hoverService) {
        super();
        this.hoverService = hoverService;
        this.templateId = MultiplierColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        const multiplierElement = DOM.append(container, $('.model-multiplier'));
        return {
            container,
            multiplierElement,
            disposables,
            elementDisposables
        };
    }
    renderElement(entry, index, templateData) {
        templateData.multiplierElement.textContent = '';
        super.renderElement(entry, index, templateData);
    }
    renderGroupElement(element, index, templateData) {
    }
    renderVendorElement(element, index, templateData) {
    }
    renderModelElement(entry, index, templateData) {
        const multiplierText = entry.model.metadata.multiplier ?? '-';
        templateData.multiplierElement.textContent = multiplierText;
        if (multiplierText !== '-') {
            templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
                content: localize('multiplier.tooltip', "Every chat message counts {0} towards your premium model request quota", multiplierText),
                appearance: {
                    compact: true,
                    skipFadeInAnimation: true
                }
            })));
        }
    }
};
MultiplierColumnRenderer = MultiplierColumnRenderer_1 = __decorate([
    __param(0, IHoverService)
], MultiplierColumnRenderer);
let TokenLimitsColumnRenderer = class TokenLimitsColumnRenderer extends ModelsTableColumnRenderer {
    static { TokenLimitsColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'tokenLimits'; }
    constructor(hoverService) {
        super();
        this.hoverService = hoverService;
        this.templateId = TokenLimitsColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        const tokenLimitsElement = DOM.append(container, $('.model-token-limits'));
        return {
            container,
            tokenLimitsElement,
            disposables,
            elementDisposables
        };
    }
    renderElement(entry, index, templateData) {
        DOM.clearNode(templateData.tokenLimitsElement);
        super.renderElement(entry, index, templateData);
    }
    renderVendorElement(entry, index, templateData) {
    }
    renderGroupElement(entry, index, templateData) {
    }
    renderModelElement(entry, index, templateData) {
        const { model: modelEntry } = entry;
        const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
        if (modelEntry.metadata.maxInputTokens || modelEntry.metadata.maxOutputTokens) {
            const totalTokens = (modelEntry.metadata.maxInputTokens ?? 0) + (modelEntry.metadata.maxOutputTokens ?? 0);
            const tokenDiv = DOM.append(templateData.tokenLimitsElement, $('.token-limit-item'));
            const tokenText = DOM.append(tokenDiv, $('span'));
            tokenText.textContent = formatTokenCount(totalTokens);
            markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
            markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
        }
        templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
            content: markdown,
            appearance: {
                compact: true,
                skipFadeInAnimation: true,
            }
        })));
    }
};
TokenLimitsColumnRenderer = TokenLimitsColumnRenderer_1 = __decorate([
    __param(0, IHoverService)
], TokenLimitsColumnRenderer);
class CapabilitiesColumnRenderer extends ModelsTableColumnRenderer {
    constructor() {
        super(...arguments);
        this.templateId = CapabilitiesColumnRenderer.TEMPLATE_ID;
        this._onDidClickCapability = new Emitter();
        this.onDidClickCapability = this._onDidClickCapability.event;
    }
    static { this.TEMPLATE_ID = 'capabilities'; }
    dispose() {
        this._onDidClickCapability.dispose();
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        container.classList.add('model-capability-column');
        const metadataRow = DOM.append(container, $('.model-capabilities'));
        return {
            container,
            metadataRow,
            disposables,
            elementDisposables
        };
    }
    renderElement(entry, index, templateData) {
        DOM.clearNode(templateData.metadataRow);
        super.renderElement(entry, index, templateData);
    }
    renderVendorElement(entry, index, templateData) {
    }
    renderGroupElement(entry, index, templateData) {
    }
    renderModelElement(entry, index, templateData) {
        const { model: modelEntry, capabilityMatches } = entry;
        if (modelEntry.metadata.capabilities?.toolCalling) {
            templateData.elementDisposables.add(this.createCapabilityButton(templateData.metadataRow, capabilityMatches?.includes('toolCalling') || false, localize('models.tools', 'Tools'), 'tools'));
        }
        if (modelEntry.metadata.capabilities?.vision) {
            templateData.elementDisposables.add(this.createCapabilityButton(templateData.metadataRow, capabilityMatches?.includes('vision') || false, localize('models.vision', 'Vision'), 'vision'));
        }
    }
    createCapabilityButton(container, isActive, label, capability) {
        const disposables = new DisposableStore();
        const buttonContainer = DOM.append(container, $('.model-badge-container'));
        const button = disposables.add(new Button(buttonContainer, { secondary: true }));
        button.element.classList.add('model-capability');
        button.element.classList.toggle('active', isActive);
        button.label = label;
        disposables.add(button.onDidClick(() => this._onDidClickCapability.fire(capability)));
        return disposables;
    }
}
let ActionsColumnRenderer = class ActionsColumnRenderer extends ModelsTableColumnRenderer {
    static { ActionsColumnRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'actions'; }
    constructor(viewModel, instantiationService, languageModelsService, dialogService, commandService, contextMenuService) {
        super();
        this.viewModel = viewModel;
        this.instantiationService = instantiationService;
        this.languageModelsService = languageModelsService;
        this.dialogService = dialogService;
        this.commandService = commandService;
        this.contextMenuService = contextMenuService;
        this.templateId = ActionsColumnRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        container.classList.add('models-actions-column');
        const parent = DOM.append(container, $('.actions-container'));
        const actionBar = disposables.add(this.instantiationService.createInstance(ToolBar, parent, this.contextMenuService, {
            icon: true,
            label: false,
            moreIcon: Codicon.gear,
            anchorAlignmentProvider: () => 1 /* AnchorAlignment.RIGHT */
        }));
        return {
            container,
            actionBar,
            disposables,
            elementDisposables
        };
    }
    renderElement(entry, index, templateData) {
        templateData.actionBar.setActions([]);
        super.renderElement(entry, index, templateData);
    }
    renderVendorElement(entry, index, templateData) {
        const { vendorEntry } = entry;
        const primaryActions = [];
        const secondaryActions = [];
        if (vendorEntry.vendor.configuration) {
            secondaryActions.push(toAction({
                id: 'configureAction',
                label: localize('models.configure', 'Configure...'),
                run: () => this.languageModelsService.configureLanguageModelsProviderGroup(vendorEntry.vendor.vendor, vendorEntry.group.name)
            }));
            secondaryActions.push(toAction({
                id: 'deleteAction',
                label: localize('models.deleteAction', 'Delete'),
                class: ThemeIcon.asClassName(Codicon.trash),
                run: async () => {
                    const result = await this.dialogService.confirm({
                        type: 'info',
                        message: localize('models.deleteConfirmation', "Would you like to delete {0}?", vendorEntry.group.name)
                    });
                    if (!result.confirmed) {
                        return;
                    }
                    await this.languageModelsService.removeLanguageModelsProviderGroup(vendorEntry.vendor.vendor, vendorEntry.group.name);
                }
            }));
        }
        else if (vendorEntry.vendor.managementCommand) {
            primaryActions.push(toAction({
                id: 'manageVendor',
                label: localize('models.manageProvider', 'Manage {0}...', vendorEntry.group.name),
                class: ThemeIcon.asClassName(Codicon.gear),
                run: async () => {
                    await this.commandService.executeCommand(vendorEntry.vendor.managementCommand, vendorEntry.vendor.vendor);
                    this.viewModel.refresh();
                }
            }));
        }
        templateData.actionBar.setActions(primaryActions, secondaryActions);
    }
    renderGroupElement(entry, index, templateData) {
    }
    renderModelElement(entry, index, templateData) {
        const configActions = this.languageModelsService.getModelConfigurationActions(entry.model.identifier);
        if (configActions.length === 0 && !entry.model.metadata.configurationSchema) {
            return;
        }
        const secondaryActions = [...configActions];
        // Always add "Configure..." as fallback for complex properties
        secondaryActions.push(toAction({
            id: 'configureModel',
            label: localize('models.configureModel', 'Configure...'),
            run: () => this.languageModelsService.configureModel(entry.model.identifier)
        }));
        templateData.actionBar.setActions([], secondaryActions);
    }
};
ActionsColumnRenderer = ActionsColumnRenderer_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, ILanguageModelsService),
    __param(3, IDialogService),
    __param(4, ICommandService),
    __param(5, IContextMenuService)
], ActionsColumnRenderer);
class ProviderColumnRenderer extends ModelsTableColumnRenderer {
    constructor() {
        super(...arguments);
        this.templateId = ProviderColumnRenderer.TEMPLATE_ID;
    }
    static { this.TEMPLATE_ID = 'provider'; }
    renderTemplate(container) {
        const disposables = new DisposableStore();
        const elementDisposables = new DisposableStore();
        const providerElement = DOM.append(container, $('.model-provider'));
        return {
            container,
            providerElement,
            disposables,
            elementDisposables
        };
    }
    renderVendorElement(entry, index, templateData) {
        templateData.providerElement.textContent = '';
    }
    renderGroupElement(entry, index, templateData) {
        templateData.providerElement.textContent = '';
    }
    renderModelElement(entry, index, templateData) {
        templateData.providerElement.textContent = entry.model.provider.vendor.displayName;
    }
}
function formatTokenCount(count) {
    if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
    }
    else if (count >= 1000) {
        return `${(count / 1000).toFixed(0)}K`;
    }
    return count.toString();
}
let ChatModelsWidget = class ChatModelsWidget extends Disposable {
    static { ChatModelsWidget_1 = this; }
    static { this.NUM_INSTANCES = 0; }
    constructor(languageModelsService, instantiationService, extensionService, contextMenuService, chatEntitlementService, editorProgressService, commandService, contextKeyService) {
        super();
        this.languageModelsService = languageModelsService;
        this.instantiationService = instantiationService;
        this.extensionService = extensionService;
        this.contextMenuService = contextMenuService;
        this.chatEntitlementService = chatEntitlementService;
        this.editorProgressService = editorProgressService;
        this.commandService = commandService;
        this._onDidChangeItemCount = this._register(new Emitter());
        this.onDidChangeItemCount = this._onDidChangeItemCount.event;
        this.dropdownActions = [];
        this.tableDisposables = this._register(new DisposableStore());
        this.searchFocusContextKey = CONTEXT_MODELS_SEARCH_FOCUS.bindTo(contextKeyService);
        this.delayedFiltering = this._register(new Delayer(200));
        this.viewModel = this._register(this.instantiationService.createInstance(ChatModelsViewModel));
        this.element = DOM.$('.models-widget');
        this.create(this.element);
        const loadingPromise = this.extensionService.whenInstalledExtensionsRegistered().then(() => this.viewModel.refresh());
        this.editorProgressService.showWhile(loadingPromise, 300);
    }
    create(container) {
        const searchAndButtonContainer = DOM.append(container, $('.models-search-and-button-container'));
        const placeholder = localize('Search.FullTextSearchPlaceholder', "Type to search...");
        const searchContainer = DOM.append(searchAndButtonContainer, $('.models-search-container'));
        this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInput, 'chatModelsWidget.searchbox', searchContainer, {
            triggerCharacters: ['@', ':'],
            provideResults: (query) => {
                const providerSuggestions = this.viewModel.getVendors().map(v => `@provider:"${v.displayName}"`);
                const allSuggestions = [
                    ...providerSuggestions,
                    ...SEARCH_SUGGESTIONS.CAPABILITIES,
                    ...SEARCH_SUGGESTIONS.VISIBILITY,
                ];
                if (!query.trim()) {
                    return allSuggestions;
                }
                const queryParts = query.split(/\s/g);
                const lastPart = queryParts[queryParts.length - 1];
                if (lastPart.startsWith('@provider:')) {
                    return providerSuggestions;
                }
                else if (lastPart.startsWith('@capability:')) {
                    return SEARCH_SUGGESTIONS.CAPABILITIES;
                }
                else if (lastPart.startsWith('@visible:')) {
                    return SEARCH_SUGGESTIONS.VISIBILITY;
                }
                else if (lastPart.startsWith('@')) {
                    return allSuggestions;
                }
                return [];
            }
        }, placeholder, `chatModelsWidget:searchinput:${ChatModelsWidget_1.NUM_INSTANCES++}`, {
            placeholderText: placeholder,
            styleOverrides: {
                inputBorder: settingsTextInputBorder
            },
            focusContextKey: this.searchFocusContextKey,
        }));
        const filterAction = this._register(new ModelsFilterAction());
        const clearSearchAction = this._register(new Action('workbench.models.clearSearch', localize('clearSearch', "Clear Search"), ThemeIcon.asClassName(preferencesClearInputIcon), false, () => this.clearSearch()));
        const collapseAllAction = this._register(new Action('workbench.models.collapseAll', localize('collapseAll', "Collapse All"), ThemeIcon.asClassName(Codicon.collapseAll), false, () => {
            this.viewModel.collapseAll();
        }));
        collapseAllAction.enabled = this.viewModel.viewModelEntries.some(e => isLanguageModelGroupEntry(e) || isLanguageModelProviderEntry(e));
        this._register(this.viewModel.onDidChange(() => collapseAllAction.enabled = this.viewModel.viewModelEntries.some(e => isLanguageModelProviderEntry(e) || isLanguageModelGroupEntry(e))));
        this._register(this.searchWidget.onInputDidChange(() => {
            clearSearchAction.enabled = !!this.searchWidget.getValue();
            this.filterModels();
        }));
        this.searchActionsContainer = DOM.append(searchContainer, $('.models-search-actions'));
        const actions = [clearSearchAction, collapseAllAction, filterAction];
        const toolBar = this._register(new ToolBar(this.searchActionsContainer, this.contextMenuService, {
            actionViewItemProvider: (action, options) => {
                if (action.id === filterAction.id) {
                    return this.instantiationService.createInstance(ModelsSearchFilterDropdownMenuActionViewItem, action, options, {
                        getValue: () => this.searchWidget.getValue(),
                        setValue: (searchValue) => this.search(searchValue)
                    }, this.viewModel);
                }
                return undefined;
            },
            getKeyBinding: () => undefined
        }));
        toolBar.setActions(actions);
        // Add padding to input box for toolbar
        this.searchWidget.inputWidget.getContainerDomNode().style.paddingRight = `${DOM.getTotalWidth(this.searchActionsContainer) + 12}px`;
        this.addButtonContainer = DOM.append(searchAndButtonContainer, $('.section-title-actions'));
        const buttonOptions = {
            ...defaultButtonStyles,
            supportIcons: true,
        };
        this.addButton = this._register(new Button(this.addButtonContainer, buttonOptions));
        this.addButton.label = `$(${Codicon.add.id}) ${localize('models.enableModelProvider', 'Add Models...')}`;
        this.addButton.element.classList.add('models-add-model-button');
        this.updateAddModelsButton();
        this._register(this.addButton.onDidClick((e) => {
            if (this.dropdownActions.length > 0) {
                this.contextMenuService.showContextMenu({
                    getAnchor: () => this.addButton.element,
                    getActions: () => this.dropdownActions,
                });
            }
        }));
        // Table container
        this.tableContainer = DOM.append(container, $('.models-table-container'));
        // Create table
        this.createTable();
        this._register(this.viewModel.onDidChangeGrouping(() => this.createTable()));
        this._register(this.chatEntitlementService.onDidChangeEntitlement(() => this.updateAddModelsButton()));
        this._register(this.languageModelsService.onDidChangeLanguageModelVendors(() => this.updateAddModelsButton()));
    }
    createTable() {
        this.tableDisposables.clear();
        DOM.clearNode(this.tableContainer);
        const gutterColumnRenderer = this.instantiationService.createInstance(GutterColumnRenderer, this.viewModel);
        const modelNameColumnRenderer = this.instantiationService.createInstance(ModelNameColumnRenderer);
        const costColumnRenderer = this.instantiationService.createInstance(MultiplierColumnRenderer);
        const tokenLimitsColumnRenderer = this.instantiationService.createInstance(TokenLimitsColumnRenderer);
        const capabilitiesColumnRenderer = this.instantiationService.createInstance(CapabilitiesColumnRenderer);
        const actionsColumnRenderer = this.instantiationService.createInstance(ActionsColumnRenderer, this.viewModel);
        const providerColumnRenderer = this.instantiationService.createInstance(ProviderColumnRenderer);
        this.tableDisposables.add(capabilitiesColumnRenderer);
        this.tableDisposables.add(capabilitiesColumnRenderer.onDidClickCapability(capability => {
            const currentQuery = this.searchWidget.getValue();
            const query = `@capability:${capability}`;
            const newQuery = toggleFilter(currentQuery, { query });
            this.search(newQuery);
        }));
        const columns = [
            {
                label: '',
                tooltip: '',
                weight: 0.05,
                minimumWidth: 40,
                maximumWidth: 40,
                templateId: GutterColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            },
            {
                label: localize('modelName', 'Name'),
                tooltip: '',
                weight: 0.35,
                minimumWidth: 200,
                templateId: ModelNameColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            }
        ];
        if (this.viewModel.groupBy === "visibility" /* ChatModelGroup.Visibility */) {
            columns.push({
                label: localize('provider', 'Provider'),
                tooltip: '',
                weight: 0.15,
                minimumWidth: 100,
                templateId: ProviderColumnRenderer.TEMPLATE_ID,
                project(row) { return row; }
            });
        }
        columns.push({
            label: localize('tokenLimits', 'Context Size'),
            tooltip: '',
            weight: 0.1,
            minimumWidth: 140,
            templateId: TokenLimitsColumnRenderer.TEMPLATE_ID,
            project(row) { return row; }
        }, {
            label: localize('capabilities', 'Capabilities'),
            tooltip: '',
            weight: 0.2,
            minimumWidth: 180,
            templateId: CapabilitiesColumnRenderer.TEMPLATE_ID,
            project(row) { return row; }
        }, {
            label: localize('cost', 'Request Multiplier'),
            tooltip: '',
            weight: 0.1,
            minimumWidth: 60,
            templateId: MultiplierColumnRenderer.TEMPLATE_ID,
            project(row) { return row; }
        }, {
            label: '',
            tooltip: '',
            weight: 0.05,
            minimumWidth: 64,
            maximumWidth: 64,
            templateId: ActionsColumnRenderer.TEMPLATE_ID,
            project(row) { return row; }
        });
        this.table = this.tableDisposables.add(this.instantiationService.createInstance(WorkbenchTable, 'ModelsWidget', this.tableContainer, new Delegate(), columns, [
            gutterColumnRenderer,
            modelNameColumnRenderer,
            costColumnRenderer,
            tokenLimitsColumnRenderer,
            capabilitiesColumnRenderer,
            actionsColumnRenderer,
            providerColumnRenderer
        ], {
            identityProvider: { getId: (e) => e.id },
            horizontalScrolling: false,
            accessibilityProvider: {
                getAriaLabel: (e) => {
                    if (isLanguageModelProviderEntry(e)) {
                        return localize('vendor.ariaLabel', '{0} Models', e.vendorEntry.group.name);
                    }
                    else if (isLanguageModelGroupEntry(e)) {
                        return e.id === 'visible' ? localize('visible.ariaLabel', 'Visible Models') : localize('hidden.ariaLabel', 'Hidden Models');
                    }
                    else if (isStatusEntry(e)) {
                        return localize('status.ariaLabel', 'Status: {0}', e.message);
                    }
                    const ariaLabels = [];
                    ariaLabels.push(localize('model.name', '{0} from {1}', e.model.metadata.name, e.model.provider.vendor.displayName));
                    if (e.model.metadata.maxInputTokens || e.model.metadata.maxOutputTokens) {
                        const totalTokens = (e.model.metadata.maxInputTokens ?? 0) + (e.model.metadata.maxOutputTokens ?? 0);
                        ariaLabels.push(localize('model.contextSize.totalTokens', 'Context size: {0} tokens', formatTokenCount(totalTokens)));
                    }
                    if (e.model.metadata.capabilities) {
                        ariaLabels.push(localize('model.capabilities', 'Capabilities: {0}', Object.keys(e.model.metadata.capabilities).join(', ')));
                    }
                    const multiplierText = e.model.metadata.multiplier ?? '-';
                    if (multiplierText !== '-') {
                        ariaLabels.push(localize('multiplier.tooltip', "Every chat message counts {0} towards your premium model request quota", multiplierText));
                    }
                    if (e.model.visible) {
                        ariaLabels.push(localize('model.visible', 'This model is visible in the chat model picker'));
                    }
                    else {
                        ariaLabels.push(localize('model.hidden', 'This model is hidden in the chat model picker'));
                    }
                    return ariaLabels.join('. ');
                },
                getWidgetAriaLabel: () => localize('modelsTable.ariaLabel', 'Language Models')
            },
            multipleSelectionSupport: true,
            setRowLineHeight: false,
            openOnSingleClick: true,
            alwaysConsumeMouseWheel: false,
        }));
        this.tableDisposables.add(this.table.onContextMenu(e => {
            if (!e.element) {
                return;
            }
            const selection = this.table.getSelection();
            const selectedEntries = selection.every(i => i !== e.index) ? [e.element] : selection.map(i => this.viewModel.viewModelEntries[i]).filter(e => !!e);
            // Get model entries from selection (filter out vendor/group/status entries)
            const selectedModelEntries = selectedEntries.filter((entry) => !isLanguageModelProviderEntry(entry) && !isLanguageModelGroupEntry(entry) && !isStatusEntry(entry));
            const actions = [];
            let configureGroup;
            let configureVendor;
            if (selectedModelEntries.length) {
                const visibleModels = selectedModelEntries.filter(entry => entry.model.visible);
                const hiddenModels = selectedModelEntries.filter(entry => !entry.model.visible);
                actions.push(toAction({
                    id: 'hideSelectedModels',
                    label: localize('models.hideSelected', 'Hide in the Chat Model Picker'),
                    enabled: visibleModels.length > 0,
                    run: () => this.viewModel.setModelsVisibility(selectedModelEntries, false)
                }));
                actions.push(toAction({
                    id: 'showSelectedModels',
                    label: localize('models.showSelected', 'Show in the Chat Model Picker'),
                    enabled: hiddenModels.length > 0,
                    run: () => this.viewModel.setModelsVisibility(selectedModelEntries, true)
                }));
                // Show per-model configuration actions for a single model
                if (selectedModelEntries.length === 1) {
                    const configActions = this.languageModelsService.getModelConfigurationActions(selectedModelEntries[0].model.identifier);
                    if (configActions.length) {
                        actions.push(new Separator());
                        actions.push(...configActions);
                    }
                }
                // Show configure action if all models are from the same group
                configureGroup = selectedModelEntries[0].model.provider.group.name;
                configureVendor = selectedModelEntries[0].model.provider.vendor;
                if (selectedModelEntries.some(entry => entry.model.provider.vendor.isDefault || entry.model.provider.group.name !== configureGroup)) {
                    configureGroup = undefined;
                    configureVendor = undefined;
                }
            }
            else if (selectedEntries.length === 1) {
                const entry = e.element;
                if (isLanguageModelProviderEntry(entry)) {
                    if (!entry.vendorEntry.vendor.isDefault) {
                        actions.push(toAction({
                            id: 'hideAllModels',
                            label: localize('models.hideAll', 'Hide in the Chat Model Picker'),
                            run: () => this.viewModel.setGroupVisibility(entry, false)
                        }));
                        actions.push(toAction({
                            id: 'showAllModels',
                            label: localize('models.showAll', 'Show in the Chat Model Picker'),
                            run: () => this.viewModel.setGroupVisibility(entry, true)
                        }));
                    }
                    configureGroup = entry.vendorEntry.group.name;
                    configureVendor = entry.vendorEntry.vendor;
                }
            }
            if (configureGroup && configureVendor) {
                if (configureVendor.managementCommand || configureVendor.configuration) {
                    if (actions.length) {
                        actions.push(new Separator());
                    }
                    if (configureVendor.managementCommand) {
                        actions.push(toAction({
                            id: 'configureVendor',
                            label: localize('models.configureContextMenu', 'Configure'),
                            run: async () => {
                                await this.commandService.executeCommand(configureVendor.managementCommand, configureVendor.vendor);
                                await this.viewModel.refresh();
                            }
                        }));
                    }
                    else {
                        actions.push(toAction({
                            id: 'configureVendor',
                            label: localize('models.configureContextMenu', 'Configure'),
                            run: () => this.languageModelsService.configureLanguageModelsProviderGroup(configureVendor.vendor, configureGroup)
                        }));
                    }
                }
            }
            if (actions.length > 0) {
                this.contextMenuService.showContextMenu({
                    getAnchor: () => e.anchor,
                    getActions: () => actions
                });
            }
        }));
        this.table.splice(0, this.table.length, this.viewModel.viewModelEntries);
        this._onDidChangeItemCount.fire(this.itemCount);
        this.tableDisposables.add(this.viewModel.onDidChange(({ at, removed, added }) => {
            this.table.splice(at, removed, added);
            this._onDidChangeItemCount.fire(this.itemCount);
            if (this.viewModel.selectedEntry) {
                const selectedEntryIndex = this.viewModel.viewModelEntries.indexOf(this.viewModel.selectedEntry);
                this.table.setFocus([selectedEntryIndex]);
                this.table.setSelection([selectedEntryIndex]);
            }
        }));
        this.tableDisposables.add(this.table.onDidOpen(async ({ element, browserEvent }) => {
            if (!element) {
                return;
            }
            if (isStatusEntry(element)) {
                return;
            }
            if (isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element)) {
                this.viewModel.toggleCollapsed(element);
            }
            else if (!DOM.isMouseEvent(browserEvent) || browserEvent.detail === 2) {
                this.viewModel.toggleVisibility(element);
            }
        }));
        this.tableDisposables.add(this.table.onDidChangeSelection(e => this.viewModel.selectedEntry = e.elements[0]));
        this.tableDisposables.add(this.table.onDidBlur(() => {
            if (this.viewModel.shouldRefilter()) {
                this.viewModel.filter(this.searchWidget.getValue());
            }
        }));
        this.layout(this.element.clientHeight, this.element.clientWidth);
    }
    updateAddModelsButton() {
        const configurableVendors = this.languageModelsService.getVendors().filter(vendor => vendor.managementCommand || vendor.configuration);
        const entitlement = this.chatEntitlementService.entitlement;
        const isManagedEntitlement = entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
        const supportsAddingModels = this.chatEntitlementService.isInternal
            || (entitlement !== ChatEntitlement.Unknown
                && entitlement !== ChatEntitlement.Available
                && !isManagedEntitlement);
        this.addButton.enabled = supportsAddingModels && configurableVendors.length > 0;
        this.addButton.setTitle(!supportsAddingModels && isManagedEntitlement ? localize('models.managedByOrganization', "Adding models is managed by your organization") : '');
        this.dropdownActions = configurableVendors.map(vendor => toAction({
            id: `enable-${vendor.vendor}`,
            label: vendor.displayName,
            run: async () => {
                await this.addModelsForVendor(vendor);
            }
        }));
    }
    filterModels() {
        this.delayedFiltering.trigger(() => {
            this.viewModel.filter(this.searchWidget.getValue());
        });
    }
    async addModelsForVendor(vendor) {
        this.languageModelsService.configureLanguageModelsProviderGroup(vendor.vendor);
    }
    layout(height, width) {
        width = width - 24;
        this.searchWidget.layout(new DOM.Dimension(width - this.searchActionsContainer.clientWidth - this.addButtonContainer.clientWidth - 8, 22));
        const tableHeight = height - 40;
        this.tableContainer.style.height = `${tableHeight}px`;
        this.table.layout(tableHeight, width);
    }
    focusSearch() {
        this.searchWidget.focus();
    }
    search(filter) {
        this.focusSearch();
        this.searchWidget.setValue(filter);
        this.viewModel.filter(filter);
    }
    clearSearch() {
        this.focusSearch();
        this.searchWidget.setValue('');
    }
    render() {
        if (this.viewModel.shouldRefilter()) {
            this.viewModel.filter(this.searchWidget.getValue());
        }
    }
    /**
     * Gets the total model count (excluding vendor/group/status headers).
     */
    get itemCount() {
        return this.viewModel.viewModelEntries
            .filter(e => !isLanguageModelProviderEntry(e) && !isLanguageModelGroupEntry(e) && !isStatusEntry(e))
            .length;
    }
    /**
     * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
     * to ensure the subscriber receives the latest count.
     */
    fireItemCount() {
        this._onDidChangeItemCount.fire(this.itemCount);
    }
};
ChatModelsWidget = ChatModelsWidget_1 = __decorate([
    __param(0, ILanguageModelsService),
    __param(1, IInstantiationService),
    __param(2, IExtensionService),
    __param(3, IContextMenuService),
    __param(4, IChatEntitlementService),
    __param(5, IEditorProgressService),
    __param(6, ICommandService),
    __param(7, IContextKeyService)
], ChatModelsWidget);
export { ChatModelsWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsc1dpZGdldC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0TWFuYWdlbWVudC9jaGF0TW9kZWxzV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLDhCQUE4QixDQUFDO0FBQ3RDLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbkcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE1BQU0sRUFBa0IsTUFBTSxpREFBaUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHNCQUFzQixFQUFvQyxNQUFNLHdDQUF3QyxDQUFDO0FBQ2xILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFckYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNqRyxPQUFPLEVBQVcsUUFBUSxFQUFFLE1BQU0s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