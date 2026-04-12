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
import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { renderIcon, renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { MANAGE_CHAT_COMMAND_ID } from '../../../common/constants.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatEntitlement, IChatEntitlementService, isProUser } from '../../../../../services/chat/common/chatEntitlementService.js';
import * as semver from '../../../../../../base/common/semver/semver.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUpdateService } from '../../../../../../platform/update/common/update.js';
function isVersionAtLeast(current, required) {
    const currentSemver = semver.coerce(current);
    if (!currentSemver) {
        return false;
    }
    return semver.gte(currentSemver, required);
}
function getUpdateHoverContent(updateState) {
    const hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
    switch (updateState) {
        case "available for download" /* StateType.AvailableForDownload */:
            hoverContent.appendMarkdown(localize('chat.modelPicker.downloadUpdateHover', "This model requires a newer version of VS Code. [Download Update](command:update.downloadUpdate) to access it."));
            break;
        case "downloaded" /* StateType.Downloaded */:
        case "ready" /* StateType.Ready */:
            hoverContent.appendMarkdown(localize('chat.modelPicker.restartUpdateHover', "This model requires a newer version of VS Code. [Restart to Update](command:update.restartToUpdate) to access it."));
            break;
        default:
            hoverContent.appendMarkdown(localize('chat.modelPicker.checkUpdateHover', "This model requires a newer version of VS Code. [Update VS Code](command:update.checkForUpdate) to access it."));
            break;
    }
    return hoverContent;
}
/**
 * Section identifiers for collapsible groups in the model picker.
 */
const ModelPickerSection = {
    Other: 'other',
};
function createModelItem(action, model, hoverPosition, languageModelsService) {
    return {
        item: action,
        kind: "action" /* ActionListItemKind.Action */,
        label: action.label,
        description: action.description,
        group: { title: '', icon: action.icon ?? ThemeIcon.fromId(action.checked ? Codicon.check.id : Codicon.blank.id) },
        hideIcon: false,
        section: action.section,
        hover: model ? { content: getModelHoverContent(model, languageModelsService), position: hoverPosition } : undefined,
        submenuActions: action.toolbarActions,
    };
}
/**
 * Returns a short description summarizing the model's current configuration values
 * for properties marked with group 'navigation' (e.g., "High", "Medium").
 */
function getModelConfigurationDescription(model, languageModelsService) {
    const schema = model.metadata.configurationSchema;
    if (!schema?.properties) {
        return undefined;
    }
    const currentConfig = languageModelsService.getModelConfiguration(model.identifier) ?? {};
    const parts = [];
    for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (propSchema.group !== 'navigation') {
            continue;
        }
        const value = currentConfig[key] ?? propSchema.default;
        if (value === undefined) {
            continue;
        }
        const enumItemLabels = propSchema.enumItemLabels;
        const enumIndex = propSchema.enum?.indexOf(value) ?? -1;
        const label = enumItemLabels?.[enumIndex] ?? String(value);
        parts.push(label);
    }
    return parts.length > 0 ? parts.join(', ') : undefined;
}
function createModelAction(model, selectedModelId, onSelect, languageModelsService, section) {
    const toolbarActions = languageModelsService.getModelConfigurationActions(model.identifier);
    const configDescription = getModelConfigurationDescription(model, languageModelsService);
    const baseDescription = model.metadata.multiplier ?? model.metadata.detail;
    const description = configDescription && baseDescription
        ? `${configDescription} · ${baseDescription}`
        : configDescription ?? baseDescription;
    return {
        id: model.identifier,
        enabled: true,
        icon: model.metadata.statusIcon,
        checked: model.identifier === selectedModelId,
        class: undefined,
        description,
        tooltip: model.metadata.name,
        label: model.metadata.name,
        section,
        toolbarActions: toolbarActions && toolbarActions.length > 0 ? toolbarActions : undefined,
        run: () => onSelect(model),
    };
}
function shouldShowManageModelsAction(chatEntitlementService) {
    return chatEntitlementService.entitlement === ChatEntitlement.Free ||
        chatEntitlementService.entitlement === ChatEntitlement.EDU ||
        chatEntitlementService.entitlement === ChatEntitlement.Pro ||
        chatEntitlementService.entitlement === ChatEntitlement.ProPlus ||
        chatEntitlementService.entitlement === ChatEntitlement.Business ||
        chatEntitlementService.entitlement === ChatEntitlement.Enterprise ||
        chatEntitlementService.isInternal;
}
function createManageModelsAction(commandService) {
    return {
        id: 'manageModels',
        enabled: true,
        checked: false,
        class: ThemeIcon.asClassName(Codicon.gear),
        tooltip: localize('chat.manageModels.tooltip', "Manage Language Models"),
        label: localize('chat.manageModels', "Manage Models..."),
        run: () => { commandService.executeCommand(MANAGE_CHAT_COMMAND_ID); }
    };
}
/**
 * Builds the grouped items for the model picker dropdown.
 *
 * Layout:
 * 1. Auto (always first)
 * 2. Promoted section (selected + recently used + featured models from control manifest)
 *    - Available models sorted alphabetically, followed by unavailable models
 *    - Unavailable models show upgrade/update/admin status
 * 3. Other Models (collapsible toggle, available first, then sorted by vendor then name)
 * 4. Optional "Manage Models..." action shown in Other Models after a separator
 */
export function buildModelPickerItems(models, selectedModelId, recentModelIds, controlModels, currentVSCodeVersion, updateStateType, onSelect, manageSettingsUrl, useGroupedModelPicker, manageModelsAction, chatEntitlementService, showUnavailableFeatured, showFeatured, hoverPosition, languageModelsService) {
    const items = [];
    if (models.length === 0) {
        items.push(createModelItem({
            id: 'auto',
            enabled: true,
            checked: true,
            class: undefined,
            tooltip: localize('chat.modelPicker.auto', "Auto"),
            label: localize('chat.modelPicker.auto', "Auto"),
            run: () => { }
        }));
    }
    if (useGroupedModelPicker) {
        let otherModels = [];
        if (models.length) {
            // Collect all available models into lookup maps
            const allModelsMap = new Map();
            const modelsByMetadataId = new Map();
            for (const model of models) {
                allModelsMap.set(model.identifier, model);
                modelsByMetadataId.set(model.metadata.id, model);
            }
            const placed = new Set();
            const markPlaced = (identifierOrId, metadataId) => {
                placed.add(identifierOrId);
                if (metadataId) {
                    placed.add(metadataId);
                }
            };
            const resolveModel = (id) => allModelsMap.get(id) ?? modelsByMetadataId.get(id);
            const getUnavailableReason = (entry) => {
                const isBusinessOrEnterpriseUser = chatEntitlementService.entitlement === ChatEntitlement.Business || chatEntitlementService.entitlement === ChatEntitlement.Enterprise;
                if (!isBusinessOrEnterpriseUser) {
                    return 'upgrade';
                }
                if (entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
                    return 'update';
                }
                return 'admin';
            };
            // --- 1. Auto ---
            const autoModel = models.find(m => m.metadata.id === 'auto' && m.metadata.vendor === 'copilot');
            if (autoModel) {
                markPlaced(autoModel.identifier, autoModel.metadata.id);
                items.push(createModelItem(createModelAction(autoModel, selectedModelId, onSelect, languageModelsService), autoModel, hoverPosition, languageModelsService));
            }
            const promotedItems = [];
            // Try to place a model by id. Returns true if handled.
            const tryPlaceModel = (id) => {
                if (placed.has(id)) {
                    return false;
                }
                const model = resolveModel(id);
                if (model && !placed.has(model.identifier)) {
                    markPlaced(model.identifier, model.metadata.id);
                    const entry = controlModels[model.metadata.id];
                    if (entry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
                        promotedItems.push({ kind: 'unavailable', id: model.metadata.id, entry, reason: 'update' });
                    }
                    else {
                        promotedItems.push({ kind: 'available', model });
                    }
                    return true;
                }
                if (!model) {
                    const entry = controlModels[id];
                    if (entry && !entry.exists) {
                        markPlaced(id);
                        promotedItems.push({ kind: 'unavailable', id, entry, reason: getUnavailableReason(entry) });
                        return true;
                    }
                }
                return false;
            };
            // Selected model
            if (selectedModelId && selectedModelId !== autoModel?.identifier) {
                tryPlaceModel(selectedModelId);
            }
            // Recently used models
            for (const id of recentModelIds) {
                tryPlaceModel(id);
            }
            // Featured models from control manifest
            if (showFeatured) {
                for (const [entryId, entry] of Object.entries(controlModels)) {
                    if (!entry.featured || placed.has(entryId)) {
                        continue;
                    }
                    const model = resolveModel(entryId);
                    if (model && !placed.has(model.identifier)) {
                        if (entry.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
                            if (showUnavailableFeatured) {
                                markPlaced(model.identifier, model.metadata.id);
                                promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: 'update' });
                            }
                        }
                        else {
                            markPlaced(model.identifier, model.metadata.id);
                            promotedItems.push({ kind: 'available', model });
                        }
                    }
                    else if (!model && !entry.exists) {
                        if (showUnavailableFeatured) {
                            markPlaced(entryId);
                            promotedItems.push({ kind: 'unavailable', id: entryId, entry, reason: getUnavailableReason(entry) });
                        }
                    }
                }
            }
            // Render promoted section: available first, then sorted alphabetically by name
            if (promotedItems.length > 0) {
                promotedItems.sort((a, b) => {
                    const aAvail = a.kind === 'available' ? 0 : 1;
                    const bAvail = b.kind === 'available' ? 0 : 1;
                    if (aAvail !== bAvail) {
                        return aAvail - bAvail;
                    }
                    const aName = a.kind === 'available' ? a.model.metadata.name : a.entry.label;
                    const bName = b.kind === 'available' ? b.model.metadata.name : b.entry.label;
                    return aName.localeCompare(bName);
                });
                for (const item of promotedItems) {
                    if (item.kind === 'available') {
                        items.push(createModelItem(createModelAction(item.model, selectedModelId, onSelect, languageModelsService), item.model, hoverPosition, languageModelsService));
                    }
                    else {
                        items.push(createUnavailableModelItem(item.id, item.entry, item.reason, manageSettingsUrl, updateStateType, undefined, hoverPosition));
                    }
                }
            }
            // --- 3. Other Models (collapsible) ---
            otherModels = models
                .filter(m => !placed.has(m.identifier) && !placed.has(m.metadata.id))
                .sort((a, b) => {
                const aEntry = controlModels[a.metadata.id] ?? controlModels[a.identifier];
                const bEntry = controlModels[b.metadata.id] ?? controlModels[b.identifier];
                const aAvail = aEntry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, aEntry.minVSCodeVersion) ? 1 : 0;
                const bAvail = bEntry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, bEntry.minVSCodeVersion) ? 1 : 0;
                if (aAvail !== bAvail) {
                    return aAvail - bAvail;
                }
                const aCopilot = a.metadata.vendor === 'copilot' ? 0 : 1;
                const bCopilot = b.metadata.vendor === 'copilot' ? 0 : 1;
                if (aCopilot !== bCopilot) {
                    return aCopilot - bCopilot;
                }
                const vendorCmp = a.metadata.vendor.localeCompare(b.metadata.vendor);
                return vendorCmp !== 0 ? vendorCmp : a.metadata.name.localeCompare(b.metadata.name);
            });
            if (otherModels.length > 0) {
                if (items.length > 0) {
                    items.push({ kind: "separator" /* ActionListItemKind.Separator */ });
                }
                items.push({
                    item: {
                        id: 'otherModels',
                        enabled: true,
                        checked: false,
                        class: undefined,
                        tooltip: localize('chat.modelPicker.otherModels', "Other Models"),
                        label: localize('chat.modelPicker.otherModels', "Other Models"),
                        run: () => { }
                    },
                    kind: "action" /* ActionListItemKind.Action */,
                    label: localize('chat.modelPicker.otherModels', "Other Models"),
                    group: { title: '', icon: Codicon.chevronDown },
                    hideIcon: false,
                    section: ModelPickerSection.Other,
                    isSectionToggle: true,
                });
                for (const model of otherModels) {
                    const entry = controlModels[model.metadata.id] ?? controlModels[model.identifier];
                    if (entry?.minVSCodeVersion && !isVersionAtLeast(currentVSCodeVersion, entry.minVSCodeVersion)) {
                        items.push(createUnavailableModelItem(model.metadata.id, entry, 'update', manageSettingsUrl, updateStateType, ModelPickerSection.Other, hoverPosition));
                    }
                    else {
                        items.push(createModelItem(createModelAction(model, selectedModelId, onSelect, languageModelsService, ModelPickerSection.Other), model, hoverPosition, languageModelsService));
                    }
                }
            }
        }
        if (manageModelsAction) {
            items.push({ kind: "separator" /* ActionListItemKind.Separator */, section: otherModels.length ? ModelPickerSection.Other : undefined });
            items.push({
                item: manageModelsAction,
                kind: "action" /* ActionListItemKind.Action */,
                label: manageModelsAction.label,
                group: { title: '', icon: Codicon.blank },
                hideIcon: false,
                section: otherModels.length ? ModelPickerSection.Other : undefined,
                showAlways: true,
            });
        }
    }
    else {
        // Flat list: auto first, then all models sorted alphabetically
        const autoModel = models.find(m => m.metadata.id === 'auto' && m.metadata.vendor === 'copilot');
        if (autoModel) {
            items.push(createModelItem(createModelAction(autoModel, selectedModelId, onSelect, languageModelsService), autoModel, hoverPosition, languageModelsService));
        }
        const sortedModels = models
            .filter(m => m !== autoModel)
            .sort((a, b) => {
            const vendorCmp = a.metadata.vendor.localeCompare(b.metadata.vendor);
            return vendorCmp !== 0 ? vendorCmp : a.metadata.name.localeCompare(b.metadata.name);
        });
        for (const model of sortedModels) {
            items.push(createModelItem(createModelAction(model, selectedModelId, onSelect, languageModelsService), model, hoverPosition, languageModelsService));
        }
    }
    return items;
}
export function getModelPickerAccessibilityProvider() {
    return {
        isChecked(element) {
            if (element.isSectionToggle) {
                return undefined;
            }
            return element.kind === "action" /* ActionListItemKind.Action */ ? !!element?.item?.checked : undefined;
        },
        getRole: (element) => {
            if (element.isSectionToggle) {
                return 'menuitem';
            }
            switch (element.kind) {
                case "action" /* ActionListItemKind.Action */: return 'menuitemradio';
                case "separator" /* ActionListItemKind.Separator */: return 'separator';
                default: return 'separator';
            }
        },
        getWidgetRole: () => 'menu',
    };
}
function createUnavailableModelItem(id, entry, reason, manageSettingsUrl, updateStateType, section, hoverPosition) {
    let description;
    if (reason === 'upgrade') {
        description = new MarkdownString(localize('chat.modelPicker.upgradeLink', "[Upgrade](command:workbench.action.chat.upgradePlan \" \")"), { isTrusted: true });
    }
    else if (reason === 'update') {
        description = localize('chat.modelPicker.updateDescription', "Update VS Code");
    }
    else {
        description = manageSettingsUrl
            ? new MarkdownString(localize('chat.modelPicker.adminLink', "[Contact your admin]({0})", manageSettingsUrl), { isTrusted: true })
            : localize('chat.modelPicker.adminDescription', "Contact your admin");
    }
    let hoverContent;
    if (reason === 'upgrade') {
        hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
        hoverContent.appendMarkdown(localize('chat.modelPicker.upgradeHover', "[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan \" \") with a free 30-day trial to use the best models."));
    }
    else if (reason === 'update') {
        hoverContent = getUpdateHoverContent(updateStateType);
    }
    else {
        hoverContent = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
        hoverContent.appendMarkdown(localize('chat.modelPicker.adminHover', "This model is not available. Contact your administrator to enable it."));
    }
    return {
        item: {
            id,
            enabled: false,
            checked: false,
            class: undefined,
            tooltip: entry.label,
            label: entry.label,
            description: typeof description === 'string' ? description : undefined,
            run: () => { }
        },
        kind: "action" /* ActionListItemKind.Action */,
        label: entry.label,
        description,
        group: { title: '', icon: ThemeIcon.fromId(Codicon.blank.id) },
        disabled: true,
        hideIcon: false,
        className: 'chat-model-picker-unavailable',
        section,
        hover: { content: hoverContent, position: hoverPosition },
    };
}
/**
 * A model selection dropdown widget.
 *
 * Renders a button showing the currently selected model name.
 * On click, opens a grouped picker popup with:
 * Auto → Promoted (recently used + curated) → Other Models (collapsed with search).
 *
 * The widget owns its state - set models, selection, and curated IDs via setters.
 * Listen for selection changes via `onDidChangeSelection`.
 */
let ModelPickerWidget = class ModelPickerWidget extends Disposable {
    get selectedModel() {
        return this._selectedModel;
    }
    get domNode() {
        return this._domNode;
    }
    constructor(_delegate, _hoverPosition, _actionWidgetService, _commandService, _openerService, _telemetryService, _languageModelsService, _productService, _entitlementService, _updateService, _uriIdentityService) {
        super();
        this._delegate = _delegate;
        this._hoverPosition = _hoverPosition;
        this._actionWidgetService = _actionWidgetService;
        this._commandService = _commandService;
        this._openerService = _openerService;
        this._telemetryService = _telemetryService;
        this._languageModelsService = _languageModelsService;
        this._productService = _productService;
        this._entitlementService = _entitlementService;
        this._updateService = _updateService;
        this._uriIdentityService = _uriIdentityService;
        this._onDidChangeSelection = this._register(new Emitter());
        this.onDidChangeSelection = this._onDidChangeSelection.event;
        this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
            this._renderLabel();
        }));
    }
    setHideChevrons(hideChevrons) {
        this._hideChevrons = hideChevrons;
        this._register(autorun(reader => {
            const hide = hideChevrons.read(reader);
            if (this._domNode) {
                this._domNode.classList.toggle('hide-chevrons', hide);
            }
            this._renderLabel();
        }));
    }
    setSelectedModel(model) {
        this._selectedModel = model;
        this._renderLabel();
    }
    setEnabled(enabled) {
        if (this._domNode) {
            this._domNode.classList.toggle('disabled', !enabled);
            this._domNode.setAttribute('aria-disabled', String(!enabled));
        }
    }
    setBadge(badge) {
        this._badge = badge;
        this._updateBadge();
    }
    render(container) {
        this._domNode = dom.append(container, dom.$('a.action-label'));
        this._domNode.tabIndex = 0;
        this._domNode.setAttribute('role', 'button');
        this._domNode.setAttribute('aria-haspopup', 'true');
        this._domNode.setAttribute('aria-expanded', 'false');
        // Apply initial collapsed state now that _domNode exists
        if (this._hideChevrons?.get()) {
            this._domNode.classList.toggle('hide-chevrons', true);
        }
        this._badgeIcon = dom.append(this._domNode, dom.$('span.model-picker-badge'));
        this._updateBadge();
        this._renderLabel();
        // Open picker on click
        this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_DOWN, (e) => {
            if (e.button !== 0) {
                return; // only left click
            }
            dom.EventHelper.stop(e, true);
            this.show();
        }));
        // Open picker on Enter/Space
        this._register(dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, (e) => {
            const event = new StandardKeyboardEvent(e);
            if (event.equals(3 /* KeyCode.Enter */) || event.equals(10 /* KeyCode.Space */)) {
                dom.EventHelper.stop(e, true);
                this.show();
            }
        }));
    }
    show(anchor) {
        const anchorElement = anchor ?? this._domNode;
        if (!anchorElement || this._domNode?.classList.contains('disabled')) {
            return;
        }
        const previousModel = this._selectedModel;
        const onSelect = (model) => {
            this._telemetryService.publicLog2('chat.modelChange', {
                fromModel: previousModel?.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(previousModel.identifier) : 'unknown',
                toModel: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(model.identifier) : 'unknown'
            });
            this._selectedModel = model;
            this._renderLabel();
            this._onDidChangeSelection.fire(model);
        };
        const models = this._delegate.getModels();
        const showFilter = models.length >= 10;
        const isPro = isProUser(this._entitlementService.entitlement);
        const manifest = this._languageModelsService.getModelsControlManifest();
        const controlModelsForTier = isPro ? manifest.paid : manifest.free;
        const canShowManageModelsAction = this._delegate.showManageModelsAction() && shouldShowManageModelsAction(this._entitlementService);
        const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService) : undefined;
        const logModelPickerInteraction = (interaction) => {
            this._telemetryService.publicLog2('chat.modelPickerInteraction', { interaction });
        };
        const manageSettingsUrl = this._productService.defaultChatAgent?.manageSettingsUrl;
        const items = buildModelPickerItems(models, this._selectedModel?.identifier, this._languageModelsService.getRecentlyUsedModelIds(), controlModelsForTier, this._productService.version, this._updateService.state.type, onSelect, manageSettingsUrl, this._delegate.useGroupedModelPicker(), !showFilter ? manageModelsAction : undefined, this._entitlementService, this._delegate.showUnavailableFeatured(), this._delegate.showFeatured(), this._hoverPosition, this._languageModelsService);
        const listOptions = {
            showFilter,
            filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
            filterActions: showFilter && manageModelsAction ? [manageModelsAction] : undefined,
            focusFilterOnOpen: true,
            collapsedByDefault: new Set([ModelPickerSection.Other]),
            onDidToggleSection: (section, collapsed) => {
                if (section === ModelPickerSection.Other) {
                    logModelPickerInteraction(collapsed ? 'otherModelsCollapsed' : 'otherModelsExpanded');
                }
            },
            linkHandler: (uri) => {
                if (uri.scheme === 'command' && uri.path === 'workbench.action.chat.upgradePlan') {
                    logModelPickerInteraction('premiumModelUpgradePlanClicked');
                }
                else if (manageSettingsUrl && this._uriIdentityService.extUri.isEqual(uri, URI.parse(manageSettingsUrl))) {
                    logModelPickerInteraction('disabledModelContactAdminClicked');
                }
                void this._openerService.open(uri, { allowCommands: true });
            },
            minWidth: 200,
        };
        const previouslyFocusedElement = dom.getActiveElement();
        const delegate = {
            onSelect: (action) => {
                this._actionWidgetService.hide();
                action.run();
            },
            onHide: () => {
                this._domNode?.setAttribute('aria-expanded', 'false');
                if (dom.isHTMLElement(previouslyFocusedElement)) {
                    previouslyFocusedElement.focus();
                }
            }
        };
        this._domNode?.setAttribute('aria-expanded', 'true');
        this._actionWidgetService.show('ChatModelPicker', false, items, delegate, anchorElement, undefined, [], getModelPickerAccessibilityProvider(), listOptions);
        const activeElement = dom.getActiveElement();
        if (dom.isHTMLInputElement(activeElement) && activeElement.classList.contains('action-list-filter-input')) {
            activeElement.classList.add('chat-model-picker-filter-input');
        }
    }
    _updateBadge() {
        if (this._badgeIcon) {
            if (this._badge) {
                const icon = this._badge === 'info' ? Codicon.info : Codicon.warning;
                dom.reset(this._badgeIcon, renderIcon(icon));
                this._badgeIcon.style.display = '';
                this._badgeIcon.classList.toggle('info', this._badge === 'info');
                this._badgeIcon.classList.toggle('warning', this._badge === 'warning');
            }
            else {
                this._badgeIcon.style.display = 'none';
            }
        }
    }
    _renderLabel() {
        if (!this._domNode) {
            return;
        }
        const { name, statusIcon } = this._selectedModel?.metadata || {};
        const domChildren = [];
        if (statusIcon) {
            const iconElement = renderIcon(statusIcon);
            domChildren.push(iconElement);
        }
        const modelLabel = name ?? localize('chat.modelPicker.auto', "Auto");
        const configDescription = this._selectedModel
            ? getModelConfigurationDescription(this._selectedModel, this._languageModelsService)
            : undefined;
        const fullLabel = configDescription
            ? `${modelLabel} · ${configDescription}`
            : modelLabel;
        domChildren.push(dom.$('span.chat-input-picker-label', undefined, fullLabel));
        // Badge icon between label and chevron
        if (this._badgeIcon) {
            domChildren.push(this._badgeIcon);
        }
        domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));
        dom.reset(this._domNode, ...domChildren);
        // Aria
        this._domNode.ariaLabel = localize('chat.modelPicker.ariaLabel', "Pick Model, {0}", fullLabel);
    }
};
ModelPickerWidget = __decorate([
    __param(2, IActionWidgetService),
    __param(3, ICommandService),
    __param(4, IOpenerService),
    __param(5, ITelemetryService),
    __param(6, ILanguageModelsService),
    __param(7, IProductService),
    __param(8, IChatEntitlementService),
    __param(9, IUpdateService),
    __param(10, IUriIdentityService)
], ModelPickerWidget);
export { ModelPickerWidget };
function getModelHoverContent(model, languageModelsService) {
    const isAuto = model.metadata.id === 'auto' && model.metadata.vendor === 'copilot';
    const markdown = new MarkdownString('', { isTrusted: true, supportThemeIcons: true });
    markdown.appendMarkdown(`**${model.metadata.name}**`);
    markdown.appendText(`\n`);
    if (model.metadata.statusIcon && model.metadata.tooltip) {
        if (model.metadata.statusIcon) {
            markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
        }
        markdown.appendMarkdown(`${model.metadata.tooltip}`);
        markdown.appendText(`\n`);
    }
    if (model.metadata.multiplier) {
        markdown.appendMarkdown(`${localize('multiplier.tooltip', "Each chat message counts {0} toward your premium request quota", model.metadata.multiplier)}`);
        markdown.appendText(`\n`);
    }
    if (!isAuto && (model.metadata.maxInputTokens || model.metadata.maxOutputTokens)) {
        const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
        markdown.appendMarkdown(`${localize('models.contextSize', 'Context Size')}: `);
        markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
        markdown.appendText(`\n`);
    }
    if (languageModelsService) {
        const schema = model.metadata.configurationSchema;
        if (schema?.properties) {
            const currentConfig = languageModelsService.getModelConfiguration(model.identifier) ?? {};
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                const value = currentConfig[key] ?? propSchema.default;
                if (value === undefined) {
                    continue;
                }
                const enumItemLabels = propSchema.enumItemLabels;
                const enumIndex = propSchema.enum?.indexOf(value) ?? -1;
                const displayValue = enumItemLabels?.[enumIndex] ?? String(value);
                const label = propSchema.title ?? key;
                markdown.appendText(`${label}: ${displayValue}`);
                markdown.appendText(`\n`);
            }
        }
    }
    return markdown;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsUGlja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0TW9kZWxQaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsVUFBVSxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFN0csT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFOUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxPQUFPLEVBQWUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNuRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUdwRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUV2RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDekYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM5RixPQUFPLEVBQUUsaUJBQWlC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