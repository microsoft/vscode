/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { buildModelPickerItems, getModelPickerAccessibilityProvider } from '../../../../browser/widget/input/chatModelPicker.js';
import { ChatEntitlement } from '../../../../../../services/chat/common/chatEntitlementService.js';
function createStubEntitlementService(opts) {
    return {
        entitlement: opts?.entitlement ?? ChatEntitlement.Pro,
        sentiment: { completed: true },
        isInternal: opts?.isInternal ?? false,
        anonymous: opts?.anonymous ?? false,
    };
}
const stubChatEntitlementService = createStubEntitlementService();
function createModel(id, name, vendor = 'copilot') {
    return {
        identifier: `${vendor}-${id}`,
        metadata: {
            id,
            name,
            vendor,
            version: id,
            family: vendor,
            maxInputTokens: 128000,
            maxOutputTokens: 4096,
            isDefaultForLocation: {},
            modelPickerCategory: undefined,
        },
    };
}
function createAutoModel() {
    return createModel('auto', 'Auto', 'copilot');
}
function getActionItems(items) {
    return items.filter(i => i.kind === "action" /* ActionListItemKind.Action */);
}
function getActionLabels(items) {
    return getActionItems(items).map(i => i.label);
}
function getSeparatorCount(items) {
    return items.filter(i => i.kind === "separator" /* ActionListItemKind.Separator */).length;
}
const stubManageModelsAction = {
    id: 'manageModels',
    enabled: true,
    checked: false,
    class: undefined,
    tooltip: 'Manage Language Models',
    label: 'Manage Models...',
    run: () => { }
};
const stubLanguageModelsService = { getModelConfigurationActions: () => [], getModelConfiguration: () => undefined };
function callBuild(models, opts = {}) {
    const onSelect = () => { };
    const entitlementService = createStubEntitlementService({
        entitlement: opts.entitlement ?? ChatEntitlement.Pro,
        anonymous: opts.anonymous ?? false,
    });
    return buildModelPickerItems(models, opts.selectedModelId, opts.recentModelIds ?? [], opts.controlModels ?? {}, opts.currentVSCodeVersion ?? '1.100.0', opts.updateStateType ?? "idle" /* StateType.Idle */, onSelect, opts.manageSettingsUrl, true, stubManageModelsAction, entitlementService, opts.showUnavailableFeatured ?? true, opts.showFeatured ?? true, undefined, stubLanguageModelsService);
}
suite('buildModelPickerItems', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('accessibility provider uses radio semantics for model items', () => {
        const provider = getModelPickerAccessibilityProvider();
        assert.strictEqual(provider.getRole({ kind: "action" /* ActionListItemKind.Action */ }), 'menuitemradio');
        assert.strictEqual(provider.getRole({ kind: "separator" /* ActionListItemKind.Separator */ }), 'separator');
        assert.strictEqual(provider.getWidgetRole(), 'menu');
    });
    test('auto model always appears first', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([modelA, auto]);
        const actions = getActionItems(items);
        assert.strictEqual(actions[0].label, 'Auto');
    });
    test('empty models list produces auto and manage models entries', () => {
        const items = callBuild([]);
        const actions = getActionItems(items);
        assert.strictEqual(actions.length, 2);
        assert.strictEqual(actions[0].label, 'Auto');
        assert.strictEqual(actions[1].item?.id, 'manageModels');
    });
    test('only auto model produces auto and manage models with separator', () => {
        const items = callBuild([createAutoModel()]);
        const actions = getActionItems(items);
        assert.strictEqual(actions.length, 2);
        assert.strictEqual(actions[0].label, 'Auto');
        assert.strictEqual(actions[1].item?.id, 'manageModels');
        assert.strictEqual(getSeparatorCount(items), 1);
    });
    test('selected model appears in promoted section', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const items = callBuild([auto, modelA, modelB], {
            selectedModelId: modelA.identifier,
        });
        const actions = getActionItems(items);
        // Auto first, then selected model in promoted section, then remaining in other
        assert.strictEqual(actions[0].label, 'Auto');
        assert.strictEqual(actions[1].label, 'GPT-4o');
        assert.ok(actions[1].item?.checked);
    });
    test('selected model with failing minVSCodeVersion shows as unavailable with reason update', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            selectedModelId: modelA.identifier,
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', minVSCodeVersion: '2.0.0', exists: true },
            },
            currentVSCodeVersion: '1.90.0',
        });
        const actions = getActionItems(items);
        // The promoted section should contain the unavailable model
        const promotedItem = actions.find(a => a.label === 'GPT-4o');
        assert.ok(promotedItem);
        assert.strictEqual(promotedItem.disabled, true);
        assert.strictEqual(promotedItem.item?.enabled, false);
    });
    test('recently used models appear in promoted section', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const modelC = createModel('gemini', 'Gemini');
        const items = callBuild([auto, modelA, modelB, modelC], {
            recentModelIds: [modelB.identifier],
        });
        const actions = getActionItems(items);
        // Auto, then Claude (recent) in promoted, then others
        assert.strictEqual(actions[0].label, 'Auto');
        assert.strictEqual(actions[1].label, 'Claude');
    });
    test('recently used model not in models list but in controlModels shows as unavailable (upgrade for free user)', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            recentModelIds: ['missing-model'],
            controlModels: {
                'missing-model': { label: 'Missing Model', exists: false },
            },
            entitlement: ChatEntitlement.Free,
        });
        const actions = getActionItems(items);
        const unavailable = actions.find(a => a.label === 'Missing Model');
        assert.ok(unavailable);
        assert.strictEqual(unavailable.disabled, true);
    });
    test('recently used model not in models list shows as unavailable (update for version mismatch)', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            recentModelIds: ['missing-model'],
            controlModels: {
                'missing-model': { label: 'Missing Model', minVSCodeVersion: '2.0.0', exists: false },
            },
            currentVSCodeVersion: '1.90.0',
        });
        const actions = getActionItems(items);
        const unavailable = actions.find(a => a.label === 'Missing Model');
        assert.ok(unavailable);
        assert.strictEqual(unavailable.disabled, true);
    });
    test('recently used model not in models list shows as unavailable (admin for pro user without version issue)', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            recentModelIds: ['missing-model'],
            controlModels: {
                'missing-model': { label: 'Missing Model', exists: false },
            },
        });
        const actions = getActionItems(items);
        const unavailable = actions.find(a => a.label === 'Missing Model');
        assert.ok(unavailable);
        assert.strictEqual(unavailable.disabled, true);
    });
    test('featured control models appear in promoted section', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const items = callBuild([auto, modelA, modelB], {
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', featured: true, exists: true },
            },
        });
        const actions = getActionItems(items);
        assert.strictEqual(actions[0].label, 'Auto');
        // GPT-4o should be in promoted due to featured
        assert.strictEqual(actions[1].label, 'GPT-4o');
    });
    test('featured model not in models list shows as unavailable for free users (upgrade)', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            controlModels: {
                'premium-model': { label: 'Premium Model', featured: true, exists: false },
            },
            entitlement: ChatEntitlement.Free,
        });
        const actions = getActionItems(items);
        const unavailable = actions.find(a => a.label === 'Premium Model');
        assert.ok(unavailable);
        assert.strictEqual(unavailable.disabled, true);
    });
    test('featured model not in models list shows as unavailable for pro users (admin)', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            controlModels: {
                'premium-model': { label: 'Premium Model', featured: true, exists: false },
            },
        });
        const actions = getActionItems(items);
        const unavailable = actions.find(a => a.label === 'Premium Model');
        assert.ok(unavailable);
        assert.strictEqual(unavailable.disabled, true);
    });
    test('featured model with minVSCodeVersion shows as unavailable (update) when version too low', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', featured: true, minVSCodeVersion: '2.0.0', exists: true },
            },
            currentVSCodeVersion: '1.90.0',
        });
        const actions = getActionItems(items);
        const unavailable = actions.find(a => a.label === 'GPT-4o');
        assert.ok(unavailable);
        assert.strictEqual(unavailable.disabled, true);
    });
    test('non-featured control models do NOT appear in promoted section', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const items = callBuild([auto, modelA, modelB], {
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', featured: false, exists: true },
            },
        });
        // With no selected, no recent, and no featured, both models should be in Other
        const seps = items.filter(i => i.kind === "separator" /* ActionListItemKind.Separator */);
        // One separator before Other Models section, one before Manage Models
        assert.strictEqual(seps.length, 2);
        const actions = getActionItems(items);
        assert.strictEqual(actions[0].label, 'Auto');
        // Next should be "Other Models" toggle
        assert.strictEqual(actions[1].isSectionToggle, true);
    });
    test('available promoted models are sorted alphabetically', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const modelC = createModel('gemini', 'Gemini');
        const items = callBuild([auto, modelA, modelB, modelC], {
            recentModelIds: [modelA.identifier, modelB.identifier, modelC.identifier],
        });
        const actions = getActionItems(items);
        // Skip Auto, promoted models should be sorted: Claude, Gemini, GPT-4o
        assert.strictEqual(actions[1].label, 'Claude');
        assert.strictEqual(actions[2].label, 'Gemini');
        assert.strictEqual(actions[3].label, 'GPT-4o');
    });
    test('unavailable promoted models appear after available ones', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            recentModelIds: [modelA.identifier, 'missing-model'],
            controlModels: {
                'missing-model': { label: 'Missing Model', exists: false },
            },
            entitlement: ChatEntitlement.Free,
        });
        const actions = getActionItems(items);
        // Auto, then GPT-4o (available), then Missing Model (unavailable)
        assert.strictEqual(actions[0].label, 'Auto');
        assert.strictEqual(actions[1].label, 'GPT-4o');
        assert.ok(!actions[1].disabled);
        assert.strictEqual(actions[2].label, 'Missing Model');
        assert.strictEqual(actions[2].disabled, true);
    });
    test('models not in promoted section appear in Other Models section', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const items = callBuild([auto, modelA, modelB]);
        const actions = getActionItems(items);
        // Auto, then "Other Models" toggle, then models, then "Manage Models..."
        assert.strictEqual(actions[0].label, 'Auto');
        assert.strictEqual(actions[1].isSectionToggle, true);
        assert.ok(actions[1].label.includes('Other Models'));
    });
    test('Other Models section includes section toggle', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA]);
        const toggles = getActionItems(items).filter(i => i.isSectionToggle);
        assert.strictEqual(toggles.length, 1);
        assert.ok(toggles[0].label.includes('Other Models'));
    });
    test('Other Models section includes Manage Models entry', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA]);
        const manageItem = getActionItems(items).find(i => i.item?.id === 'manageModels');
        assert.ok(manageItem);
        assert.ok(manageItem.label.includes('Manage Models'));
    });
    test('Other Models with minVSCodeVersion that fails shows as disabled', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', minVSCodeVersion: '2.0.0', exists: true },
            },
            currentVSCodeVersion: '1.90.0',
        });
        const actions = getActionItems(items);
        const gptItem = actions.find(a => a.label === 'GPT-4o');
        assert.ok(gptItem);
        assert.strictEqual(gptItem.disabled, true);
    });
    test('Other Models places unavailable models after available models', () => {
        const auto = createAutoModel();
        const availableModel = createModel('zeta', 'Zeta');
        const unavailableModel = createModel('alpha', 'Alpha');
        const items = callBuild([auto, availableModel, unavailableModel], {
            controlModels: {
                'alpha': { label: 'Alpha', minVSCodeVersion: '2.0.0', exists: true },
            },
            currentVSCodeVersion: '1.90.0',
        });
        const actions = getActionItems(items);
        const otherModelLabels = actions.slice(2).map(a => a.label).filter(l => !l.includes('Manage Models'));
        assert.deepStrictEqual(otherModelLabels, ['Zeta', 'Alpha']);
        assert.strictEqual(actions.find(a => a.label === 'Alpha')?.disabled, true);
    });
    test('no duplicate models across sections', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const modelC = createModel('gemini', 'Gemini');
        const items = callBuild([auto, modelA, modelB, modelC], {
            selectedModelId: modelA.identifier,
            recentModelIds: [modelA.identifier, modelB.identifier],
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', featured: true, exists: true },
                'claude': { label: 'Claude', featured: true, exists: true },
            },
        });
        const labels = getActionLabels(items).filter(l => l !== 'Other Models' && !l.includes('Manage Models'));
        const uniqueLabels = new Set(labels);
        assert.strictEqual(labels.length, uniqueLabels.size, `Duplicate labels found: ${labels.join(', ')}`);
    });
    test('auto model is excluded from promoted and other sections', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            selectedModelId: auto.identifier,
            recentModelIds: [auto.identifier],
            controlModels: {
                'auto': { label: 'Auto', featured: true, exists: true },
            },
        });
        const autoItems = getActionItems(items).filter(a => a.label === 'Auto');
        // Auto should appear exactly once (the first item)
        assert.strictEqual(autoItems.length, 1);
    });
    test('models with no control manifest entries work fine', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const items = callBuild([auto, modelA, modelB], {
            controlModels: {},
        });
        const actions = getActionItems(items);
        assert.ok(actions.length >= 3); // Auto + 2 models (in other) + toggle + manage
        assert.strictEqual(actions[0].label, 'Auto');
    });
    test('Other Models sorted by vendor then name', () => {
        const auto = createAutoModel();
        const modelA = createModel('zebra', 'Zebra', 'copilot');
        const modelB = createModel('alpha', 'Alpha', 'other-vendor');
        const modelC = createModel('beta', 'Beta', 'copilot');
        const items = callBuild([auto, modelA, modelB, modelC]);
        const actions = getActionItems(items);
        // Skip Auto and "Other Models" toggle
        const otherModelLabels = actions.slice(2).map(a => a.label).filter(l => !l.includes('Manage Models'));
        // copilot models first (sorted by name), then other-vendor
        assert.deepStrictEqual(otherModelLabels, ['Beta', 'Zebra', 'Alpha']);
    });
    test('onSelect callback is wired into action items', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        let selectedModel;
        const onSelect = (m) => { selectedModel = m; };
        const items = buildModelPickerItems([auto, modelA], undefined, [], {}, '1.100.0', "idle" /* StateType.Idle */, onSelect, undefined, true, undefined, stubChatEntitlementService, true, true, undefined, stubLanguageModelsService);
        const gptItem = getActionItems(items).find(a => a.label === 'GPT-4o');
        assert.ok(gptItem?.item);
        gptItem.item.run();
        assert.strictEqual(selectedModel?.identifier, modelA.identifier);
    });
    test('selected model is checked, others are not', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const items = callBuild([auto, modelA, modelB], {
            selectedModelId: modelA.identifier,
        });
        const actions = getActionItems(items);
        const autoItem = actions.find(a => a.label === 'Auto');
        const gptItem = actions.find(a => a.label === 'GPT-4o');
        const claudeItem = actions.find(a => a.label === 'Claude');
        assert.ok(!autoItem?.item?.checked);
        assert.ok(gptItem?.item?.checked);
        assert.ok(!claudeItem?.item?.checked);
    });
    test('selected auto model is checked', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            selectedModelId: auto.identifier,
        });
        const actions = getActionItems(items);
        assert.ok(actions[0].item?.checked);
    });
    test('recently used model resolved by metadata id', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        // Use metadata id rather than identifier
        const items = callBuild([auto, modelA, modelB], {
            recentModelIds: ['claude'],
        });
        const actions = getActionItems(items);
        // Claude should be in promoted section (right after Auto)
        assert.strictEqual(actions[0].label, 'Auto');
        assert.strictEqual(actions[1].label, 'Claude');
    });
    test('multiple featured and recent models all promoted correctly', () => {
        const auto = createAutoModel();
        const modelA = createModel('alpha', 'Alpha');
        const modelB = createModel('beta', 'Beta');
        const modelC = createModel('gamma', 'Gamma');
        const modelD = createModel('delta', 'Delta');
        const items = callBuild([auto, modelA, modelB, modelC, modelD], {
            recentModelIds: [modelC.identifier],
            controlModels: {
                'alpha': { label: 'Alpha', featured: true, exists: true },
            },
        });
        const actions = getActionItems(items);
        assert.strictEqual(actions[0].label, 'Auto');
        // Promoted: Alpha (featured) and Gamma (recent) sorted alphabetically
        assert.strictEqual(actions[1].label, 'Alpha');
        assert.strictEqual(actions[2].label, 'Gamma');
        // Then Other Models toggle
        assert.ok(actions[3].isSectionToggle);
    });
    test('admin unavailable model shows manage settings link in description', () => {
        const auto = createAutoModel();
        const businessEntitlementService = createStubEntitlementService({ entitlement: ChatEntitlement.Business });
        const items = buildModelPickerItems([auto], undefined, ['missing-model'], { 'missing-model': { label: 'Missing Model' } }, '1.100.0', "idle" /* StateType.Idle */, () => { }, 'https://aka.ms/github-copilot-settings', true, undefined, businessEntitlementService, true, true, undefined, stubLanguageModelsService);
        const adminItem = getActionItems(items).find(a => a.label === 'Missing Model');
        assert.ok(adminItem);
        assert.strictEqual(adminItem.disabled, true);
        const description = adminItem.description;
        assert.ok(description instanceof MarkdownString);
        assert.ok(description.value.includes('https://aka.ms/github-copilot-settings'));
    });
    test('unavailable models keep indentation with blank icon', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            recentModelIds: ['missing-model'],
            controlModels: {
                'missing-model': { label: 'Missing Model' },
            },
            entitlement: ChatEntitlement.Free,
        });
        const unavailable = getActionItems(items).find(a => a.label === 'Missing Model');
        assert.ok(unavailable);
        assert.strictEqual(unavailable.hideIcon, false);
        assert.strictEqual(unavailable.group?.icon?.id, Codicon.blank.id);
    });
    test('anonymous user sees upgrade description on each unavailable model', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            recentModelIds: ['model-a', 'model-b'],
            controlModels: {
                'model-a': { label: 'Model A', featured: true, exists: false },
                'model-b': { label: 'Model B', featured: true, exists: false },
            },
            anonymous: true,
            entitlement: ChatEntitlement.Unknown,
        });
        const actions = getActionItems(items);
        const disabledItems = actions.filter(a => a.disabled);
        assert.strictEqual(disabledItems.length, 2);
        assert.ok(disabledItems[0].description instanceof MarkdownString);
        assert.ok(disabledItems[0].description.value.includes('Upgrade'));
        assert.ok(disabledItems[1].description instanceof MarkdownString);
        assert.ok(disabledItems[1].description.value.includes('Upgrade'));
    });
    test('free user sees upgrade description on each unavailable model', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            recentModelIds: ['model-a', 'model-b'],
            controlModels: {
                'model-a': { label: 'Model A', featured: true, exists: false },
                'model-b': { label: 'Model B', featured: true, exists: false },
            },
            entitlement: ChatEntitlement.Free,
        });
        const actions = getActionItems(items);
        const disabledItems = actions.filter(a => a.disabled);
        assert.strictEqual(disabledItems.length, 2);
        assert.ok(disabledItems[0].description instanceof MarkdownString);
        assert.ok(disabledItems[0].description.value.includes('Upgrade'));
        assert.ok(disabledItems[1].description instanceof MarkdownString);
        assert.ok(disabledItems[1].description.value.includes('Upgrade'));
    });
    test('anonymous user model selection triggers onSelect normally', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        let selectedModel;
        const onSelect = (m) => { selectedModel = m; };
        const anonymousEntitlementService = createStubEntitlementService({ entitlement: ChatEntitlement.Unknown, anonymous: true });
        const items = buildModelPickerItems([auto, modelA], undefined, [], {}, '1.100.0', "idle" /* StateType.Idle */, onSelect, undefined, true, undefined, anonymousEntitlementService, true, true, undefined, stubLanguageModelsService);
        const gptItem = getActionItems(items).find(a => a.label === 'GPT-4o');
        assert.ok(gptItem?.item);
        gptItem.item.run();
        assert.strictEqual(selectedModel?.identifier, modelA.identifier);
    });
    test('showFeatured=false omits featured models from promoted section', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const modelB = createModel('claude', 'Claude');
        const items = callBuild([auto, modelA, modelB], {
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', featured: true, exists: true },
            },
            showFeatured: false,
        });
        const actions = getActionItems(items);
        // Auto first, then Other Models toggle, then models in other section
        assert.strictEqual(actions[0].label, 'Auto');
        // GPT-4o should NOT be promoted — it should be in Other Models
        const promotedLabels = actions.filter(a => !a.isSectionToggle && a.section !== 'other' && a.item?.id !== 'manageModels').map(a => a.label);
        assert.ok(!promotedLabels.includes('GPT-4o'), 'GPT-4o should not be in promoted section when showFeatured=false');
    });
    test('showUnavailableFeatured=false omits unavailable featured models from promoted section', () => {
        const auto = createAutoModel();
        const items = callBuild([auto], {
            controlModels: {
                'premium-model': { label: 'Premium Model', featured: true, exists: false },
            },
            entitlement: ChatEntitlement.Free,
            showUnavailableFeatured: false,
        });
        const actions = getActionItems(items);
        // Premium Model should not appear at all
        const premiumItem = actions.find(a => a.label === 'Premium Model');
        assert.strictEqual(premiumItem, undefined, 'Unavailable featured model should not appear when showUnavailableFeatured=false');
    });
    test('showUnavailableFeatured=false still shows available featured models', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', featured: true, exists: true },
            },
            showUnavailableFeatured: false,
        });
        const actions = getActionItems(items);
        // GPT-4o is available and featured, so it should still appear in promoted
        const gptItem = actions.find(a => a.label === 'GPT-4o');
        assert.ok(gptItem, 'Available featured model should appear even when showUnavailableFeatured=false');
    });
    test('showUnavailableFeatured=false with version-gated model allows it in Other Models', () => {
        const auto = createAutoModel();
        const modelA = createModel('gpt-4o', 'GPT-4o');
        const items = callBuild([auto, modelA], {
            controlModels: {
                'gpt-4o': { label: 'GPT-4o', featured: true, minVSCodeVersion: '2.0.0', exists: true },
            },
            showUnavailableFeatured: false,
        });
        const actions = getActionItems(items);
        // Version-gated model should not be in promoted section as unavailable
        const promotedGpt = actions.find(a => a.label === 'GPT-4o' && a.section !== 'other');
        assert.strictEqual(promotedGpt?.disabled, undefined, 'Version-gated featured model should not appear as unavailable in promoted when showUnavailableFeatured=false');
        // It should still appear in Other Models since it was not placed
        const otherGpt = actions.find(a => a.label === 'GPT-4o' && a.section === 'other');
        assert.ok(otherGpt, 'Version-gated featured model should appear in Other Models when showUnavailableFeatured=false');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsUGlja2VyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdE1vZGVsUGlja2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFJakYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLG1DQUFtQyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFakksT0FBTyxFQUFFLGVBQWUsRUFBMkIsTUFBTSxrRUFBa0UsQ0FBQztBQUU1SCxTQUFTLDRCQUE0QixDQUFDLElBQW1GO0lBQ3hILE9BQU87UUFDTixXQUFXLEVBQUUsSUFBSSxFQUFFLFdBQVcsSUFBSSxlQUFlLENBQUMsR0FBRztRQUNyRCxTQUFTLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUEwQztRQUN0RSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxLQUFLO1FBQ3JDLFNBQVMsRUFBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLEtBQUs7S0FDUixDQUFDO0FBQzlCLENBQUM7QUFFRCxNQUFNLDBCQUEwQixHQUFHLDRCQUE0QixFQUFFLENBQUM7QUFFbEUsU0FBUyxXQUFXLENBQUMsRUFBVSxFQUFFLElBQVksRUFBRSxNQUFNLEdBQUcsU0FBUztJQUNoRSxPQUFPO1FBQ04sVUFBVSxFQUFFLEdBQUcsTUFBTSxJQUFJLEVBQUUsRUFBRTtRQUM3QixRQUFRLEVBQUU7WUFDVCxFQUFFO1lB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