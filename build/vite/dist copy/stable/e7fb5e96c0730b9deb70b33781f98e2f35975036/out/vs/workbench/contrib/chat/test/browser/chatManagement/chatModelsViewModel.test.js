/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelChatMetadata } from '../../../common/languageModels.js';
import { ChatModelsViewModel, isLanguageModelProviderEntry, isLanguageModelGroupEntry } from '../../../browser/chatManagement/chatModelsViewModel.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { ChatAgentLocation } from '../../../common/constants.js';
class MockLanguageModelsService {
    constructor() {
        this.vendors = [];
        this.models = new Map();
        this.modelsByVendor = new Map();
        this.modelGroups = new Map();
        this._onDidChangeLanguageModels = new Emitter();
        this.onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;
        this._onDidChangeLanguageModelVendors = new Emitter();
        this.onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;
        this.onDidChangeModelsControlManifest = Event.None;
        this.restrictedChatParticipants = observableValue('restrictedChatParticipants', Object.create(null));
    }
    addVendor(vendor) {
        this.vendors.push(vendor);
        this.modelsByVendor.set(vendor.vendor, []);
        this.modelGroups.set(vendor.vendor, []);
    }
    addModel(vendorId, identifier, metadata) {
        this.models.set(identifier, metadata);
        const models = this.modelsByVendor.get(vendorId) || [];
        models.push(identifier);
        this.modelsByVendor.set(vendorId, models);
        // Add to model groups - create a single default group per vendor
        const groups = this.modelGroups.get(vendorId) || [];
        if (groups.length === 0) {
            groups.push({
                group: {
                    vendor: vendorId,
                    name: this.vendors.find(v => v.vendor === vendorId)?.displayName || 'Default'
                },
                modelIdentifiers: []
            });
        }
        groups[0].modelIdentifiers.push(identifier);
        this.modelGroups.set(vendorId, groups);
    }
    registerLanguageModelProvider(vendor, provider) {
        throw new Error('Method not implemented.');
    }
    deltaLanguageModelChatProviderDescriptors(added, removed) {
        throw new Error('Method not implemented.');
    }
    updateModelPickerPreference(modelIdentifier, showInModelPicker) {
        const metadata = this.models.get(modelIdentifier);
        if (metadata) {
            this.models.set(modelIdentifier, { ...metadata, isUserSelectable: showInModelPicker });
        }
    }
    getVendors() {
        return this.vendors.map(v => ({ ...v, isDefault: v.vendor === 'copilot' }));
    }
    getLanguageModelIds() {
        return Array.from(this.models.keys());
    }
    lookupLanguageModel(identifier) {
        return this.models.get(identifier);
    }
    lookupLanguageModelByQualifiedName(referenceName) {
        for (const [identifier, metadata] of this.models.entries()) {
            if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, metadata)) {
                return { metadata, identifier };
            }
        }
        return undefined;
    }
    getLanguageModels() {
        const result = [];
        for (const [identifier, metadata] of this.models.entries()) {
            result.push({ identifier, metadata });
        }
        return result;
    }
    setContributedSessionModels() {
    }
    clearContributedSessionModels() {
    }
    async selectLanguageModels(selector) {
        if (selector.vendor) {
            return this.modelsByVendor.get(selector.vendor) || [];
        }
        return Array.from(this.models.keys());
    }
    sendChatRequest() {
        throw new Error('Method not implemented.');
    }
    computeTokenLength() {
        throw new Error('Method not implemented.');
    }
    getModelConfiguration(_modelId) {
        return undefined;
    }
    async setModelConfiguration(_modelId, _values) {
    }
    getModelConfigurationActions(_modelId) {
        return [];
    }
    async configureLanguageModelsProviderGroup(vendorId, name) {
    }
    async configureModel(_modelId) {
    }
    async addLanguageModelsProviderGroup(name, vendorId, configuration) {
    }
    getLanguageModelGroups(vendor) {
        return this.modelGroups.get(vendor) || [];
    }
    async removeLanguageModelsProviderGroup(vendorId, providerGroupName) {
    }
    async migrateLanguageModelsProviderGroup(languageModelsProviderGroup) { }
    getRecentlyUsedModelIds() { return []; }
    addToRecentlyUsedList() { }
    clearRecentlyUsedList() { }
    getModelsControlManifest() { return { free: {}, paid: {} }; }
}
suite('ChatModelsViewModel', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let languageModelsService;
    let viewModel;
    setup(async () => {
        languageModelsService = new MockLanguageModelsService();
        // Setup test data
        languageModelsService.addVendor({
            vendor: 'copilot',
            displayName: 'GitHub Copilot',
            managementCommand: undefined,
            when: undefined,
            configuration: undefined
        });
        languageModelsService.addVendor({
            vendor: 'openai',
            displayName: 'OpenAI',
            managementCommand: undefined,
            when: undefined,
            configuration: undefined
        });
        languageModelsService.addModel('copilot', 'copilot-gpt-4', {
            extension: new ExtensionIdentifier('github.copilot'),
            id: 'gpt-4',
            name: 'GPT-4',
            family: 'gpt-4',
            version: '1.0',
            vendor: 'copilot',
            maxInputTokens: 8192,
            maxOutputTokens: 4096,
            modelPickerCategory: { label: 'Copilot', order: 1 },
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                vision: true,
                agentMode: false
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        languageModelsService.addModel('copilot', 'copilot-gpt-4o', {
            extension: new ExtensionIdentifier('github.copilot'),
            id: 'gpt-4o',
            name: 'GPT-4o',
            family: 'gpt-4',
            version: '1.0',
            vendor: 'copilot',
            maxInputTokens: 8192,
            maxOutputTokens: 4096,
            modelPickerCategory: { label: 'Copilot', order: 1 },
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                vision: true,
                agentMode: true
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        languageModelsService.addModel('openai', 'openai-gpt-3.5', {
            extension: new ExtensionIdentifier('openai.api'),
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            family: 'gpt-3.5',
            version: '1.0',
            vendor: 'openai',
            maxInputTokens: 4096,
            maxOutputTokens: 2048,
            modelPickerCategory: { label: 'OpenAI', order: 2 },
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                vision: false,
                agentMode: false
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        languageModelsService.addModel('openai', 'openai-gpt-4-vision', {
            extension: new ExtensionIdentifier('openai.api'),
            id: 'gpt-4-vision',
            name: 'GPT-4 Vision',
            family: 'gpt-4',
            version: '1.0',
            vendor: 'openai',
            maxInputTokens: 8192,
            maxOutputTokens: 4096,
            modelPickerCategory: { label: 'OpenAI', order: 2 },
            isUserSelectable: false,
            capabilities: {
                toolCalling: false,
                vision: true,
                agentMode: false
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        viewModel = store.add(new ChatModelsViewModel(languageModelsService));
        await viewModel.refresh();
    });
    test('should fetch all models without filters', () => {
        const results = viewModel.filter('');
        // Should have 2 vendor entries and 4 model entries (grouped by vendor)
        assert.strictEqual(results.length, 6);
        const vendors = results.filter(isLanguageModelProviderEntry);
        assert.strictEqual(vendors.length, 2);
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 4);
    });
    test('should filter by provider name (vendor ID and display name)', () => {
        const resultsByCopilotId = viewModel.filter('@provider:copilot');
        assert.strictEqual(resultsByCopilotId.length, 3);
        assert.strictEqual(resultsByCopilotId[0].type, 'vendor');
        assert.strictEqual(resultsByCopilotId[0].vendorEntry.vendor.vendor, 'copilot');
        assert.strictEqual(resultsByCopilotId[1].type, 'model');
        assert.strictEqual(resultsByCopilotId[1].model.identifier, 'copilot-gpt-4');
        assert.strictEqual(resultsByCopilotId[2].type, 'model');
        assert.strictEqual(resultsByCopilotId[2].model.identifier, 'copilot-gpt-4o');
        const resultsByOpenAIName = viewModel.filter('@provider:OpenAI');
        assert.strictEqual(resultsByOpenAIName.length, 3);
        assert.strictEqual(resultsByOpenAIName[0].type, 'vendor');
        assert.strictEqual(resultsByOpenAIName[0].vendorEntry.vendor.vendor, 'openai');
        assert.strictEqual(resultsByOpenAIName[1].type, 'model');
        assert.strictEqual(resultsByOpenAIName[1].model.identifier, 'openai-gpt-3.5');
        assert.strictEqual(resultsByOpenAIName[2].type, 'model');
        assert.strictEqual(resultsByOpenAIName[2].model.identifier, 'openai-gpt-4-vision');
    });
    test('should filter by multiple providers with OR logic', () => {
        const results = viewModel.filter('@provider:copilot @provider:openai');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 4);
    });
    test('should filter by single capability - tools', () => {
        const results = viewModel.filter('@capability:tools');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 3);
        assert.ok(models.every(m => m.model.metadata.capabilities?.toolCalling === true));
    });
    test('should filter by single capability - vision', () => {
        const results = viewModel.filter('@capability:vision');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 3);
        assert.ok(models.every(m => m.model.metadata.capabilities?.vision === true));
    });
    test('should filter by single capability - agent', () => {
        const results = viewModel.filter('@capability:agent');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
    });
    test('should filter by multiple capabilities with AND logic', () => {
        const results = viewModel.filter('@capability:tools @capability:vision');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        // Should only return models that have BOTH tools and vision
        assert.strictEqual(models.length, 2);
        assert.ok(models.every(m => m.model.metadata.capabilities?.toolCalling === true &&
            m.model.metadata.capabilities?.vision === true));
    });
    test('should filter by three capabilities with AND logic', () => {
        const results = viewModel.filter('@capability:tools @capability:vision @capability:agent');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        // Should only return gpt-4o which has all three
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
    });
    test('should return no results when filtering by incompatible capabilities', () => {
        const results = viewModel.filter('@capability:vision @capability:agent');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        // Only gpt-4o has both vision and agent, but gpt-4-vision doesn't have agent
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
    });
    test('should filter by visibility - visible:true', () => {
        const results = viewModel.filter('@visible:true');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 3);
        assert.ok(models.every(m => m.model.visible === true));
    });
    test('should filter by visibility - visible:false', () => {
        const results = viewModel.filter('@visible:false');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.visible, false);
    });
    test('should combine provider and capability filters', () => {
        const results = viewModel.filter('@provider:copilot @capability:vision');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 2);
        assert.ok(models.every(m => m.model.provider.vendor.vendor === 'copilot' &&
            m.model.metadata.capabilities?.vision === true));
    });
    test('should combine provider, capability, and visibility filters', () => {
        const results = viewModel.filter('@provider:openai @capability:vision @visible:false');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.metadata.id, 'gpt-4-vision');
    });
    test('should filter by text matching model name', () => {
        const results = viewModel.filter('GPT-4o');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.metadata.name, 'GPT-4o');
        assert.ok(models[0].modelNameMatches);
    });
    test('should filter by text matching model id', () => {
        const results = viewModel.filter('gpt-4o');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.identifier, 'copilot-gpt-4o');
        assert.ok(models[0].modelIdMatches);
    });
    test('should filter by text matching vendor name', () => {
        const results = viewModel.filter('GitHub');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 2);
        assert.ok(models.every(m => m.model.provider.group.name === 'GitHub Copilot'));
    });
    test('should combine text search with capability filter', () => {
        const results = viewModel.filter('@capability:tools GPT');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        // Should match all models with tools capability and 'GPT' in name
        assert.strictEqual(models.length, 3);
        assert.ok(models.every(m => m.model.metadata.capabilities?.toolCalling === true));
    });
    test('should handle empty search value', () => {
        const results = viewModel.filter('');
        // Should return all models grouped by vendor
        assert.ok(results.length > 0);
    });
    test('should handle search value with only whitespace', () => {
        const results = viewModel.filter('   ');
        // Should return all models grouped by vendor
        assert.ok(results.length > 0);
    });
    test('should match capability text in free text search', () => {
        const results = viewModel.filter('vision');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        // Should match models that have vision capability or "vision" in their name
        assert.ok(models.length > 0);
        assert.ok(models.every(m => m.model.metadata.capabilities?.vision === true ||
            m.model.metadata.name.toLowerCase().includes('vision')));
    });
    test('should toggle vendor collapsed state', () => {
        const vendorEntry = viewModel.viewModelEntries.find(r => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === 'copilot');
        viewModel.toggleCollapsed(vendorEntry);
        const results = viewModel.filter('');
        const copilotVendor = results.find(r => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === 'copilot');
        assert.ok(copilotVendor);
        assert.strictEqual(copilotVendor.collapsed, true);
        // Models should not be shown when vendor is collapsed
        const copilotModelsAfterCollapse = results.filter(r => !isLanguageModelProviderEntry(r) && r.model.provider.vendor.vendor === 'copilot');
        assert.strictEqual(copilotModelsAfterCollapse.length, 0);
        // Toggle back
        viewModel.toggleCollapsed(vendorEntry);
        const resultsAfterExpand = viewModel.filter('');
        const copilotModelsAfterExpand = resultsAfterExpand.filter(r => !isLanguageModelProviderEntry(r) && r.model.provider.vendor.vendor === 'copilot');
        assert.strictEqual(copilotModelsAfterExpand.length, 2);
    });
    test('should handle quoted search strings', () => {
        // When a search string is fully quoted (starts and ends with quotes),
        // the completeMatch flag is set to true, which currently skips all matching
        // This test verifies the quotes are processed without errors
        const results = viewModel.filter('"GPT"');
        // The function should complete without error
        // Note: complete match logic (both quotes) currently doesn't perform matching
        assert.ok(Array.isArray(results));
    });
    test('should remove filter keywords from text search', () => {
        const results = viewModel.filter('@provider:copilot @capability:vision GPT');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        // Should only search 'GPT' in model names, not the filter keywords
        assert.strictEqual(models.length, 2);
        assert.ok(models.every(m => m.model.provider.vendor.vendor === 'copilot'));
    });
    test('should handle case-insensitive capability matching', () => {
        const results1 = viewModel.filter('@capability:TOOLS');
        const results2 = viewModel.filter('@capability:tools');
        const results3 = viewModel.filter('@capability:Tools');
        const models1 = results1.filter(r => !isLanguageModelProviderEntry(r));
        const models2 = results2.filter(r => !isLanguageModelProviderEntry(r));
        const models3 = results3.filter(r => !isLanguageModelProviderEntry(r));
        assert.strictEqual(models1.length, models2.length);
        assert.strictEqual(models2.length, models3.length);
    });
    test('should support toolcalling alias for tools capability', () => {
        const resultsTools = viewModel.filter('@capability:tools');
        const resultsToolCalling = viewModel.filter('@capability:toolcalling');
        const modelsTools = resultsTools.filter(r => !isLanguageModelProviderEntry(r));
        const modelsToolCalling = resultsToolCalling.filter(r => !isLanguageModelProviderEntry(r));
        assert.strictEqual(modelsTools.length, modelsToolCalling.length);
    });
    test('should support agentmode alias for agent capability', () => {
        const resultsAgent = viewModel.filter('@capability:agent');
        const resultsAgentMode = viewModel.filter('@capability:agentmode');
        const modelsAgent = resultsAgent.filter(r => !isLanguageModelProviderEntry(r));
        const modelsAgentMode = resultsAgentMode.filter(r => !isLanguageModelProviderEntry(r));
        assert.strictEqual(modelsAgent.length, modelsAgentMode.length);
    });
    test('should include matched capabilities in results', () => {
        const results = viewModel.filter('@capability:tools @capability:vision');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.ok(models.length > 0);
        for (const model of models) {
            assert.ok(model.capabilityMatches);
            assert.ok(model.capabilityMatches.length > 0);
            // Should include both toolCalling and vision
            assert.ok(model.capabilityMatches.some(c => c === 'toolCalling' || c === 'vision'));
        }
    });
    function createSingleVendorViewModel(includeSecondModel = true) {
        const service = new MockLanguageModelsService();
        service.addVendor({
            vendor: 'copilot',
            displayName: 'GitHub Copilot',
            managementCommand: undefined,
            when: undefined,
            configuration: undefined
        });
        service.addModel('copilot', 'copilot-gpt-4', {
            extension: new ExtensionIdentifier('github.copilot'),
            id: 'gpt-4',
            name: 'GPT-4',
            family: 'gpt-4',
            version: '1.0',
            vendor: 'copilot',
            maxInputTokens: 8192,
            maxOutputTokens: 4096,
            modelPickerCategory: { label: 'Copilot', order: 1 },
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                vision: true,
                agentMode: false
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        if (includeSecondModel) {
            service.addModel('copilot', 'copilot-gpt-4o', {
                extension: new ExtensionIdentifier('github.copilot'),
                id: 'gpt-4o',
                name: 'GPT-4o',
                family: 'gpt-4',
                version: '1.0',
                vendor: 'copilot',
                maxInputTokens: 8192,
                maxOutputTokens: 4096,
                modelPickerCategory: { label: 'Copilot', order: 1 },
                isUserSelectable: true,
                capabilities: {
                    toolCalling: true,
                    vision: true,
                    agentMode: true
                },
                isDefaultForLocation: {
                    [ChatAgentLocation.Chat]: true
                }
            });
        }
        const viewModel = store.add(new ChatModelsViewModel(service));
        return { service, viewModel };
    }
    test('should not show vendor header when only one vendor exists', async () => {
        const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
        await singleVendorViewModel.refresh();
        const results = singleVendorViewModel.filter('');
        // Should have only model entries, no vendor entry
        const vendors = results.filter(isLanguageModelProviderEntry);
        assert.strictEqual(vendors.length, 0, 'Should not show vendor header when only one vendor exists');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 2, 'Should show all models');
        assert.ok(models.every(m => m.model.provider.vendor.vendor === 'copilot'));
    });
    test('should show vendor headers when multiple vendors exist', () => {
        // This is the existing behavior test
        const results = viewModel.filter('');
        // Should have 2 vendor entries and 4 model entries (grouped by vendor)
        const vendors = results.filter(isLanguageModelProviderEntry);
        assert.strictEqual(vendors.length, 2, 'Should show vendor headers when multiple vendors exist');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 4);
    });
    test('should filter single vendor models by capability', async () => {
        const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
        await singleVendorViewModel.refresh();
        const results = singleVendorViewModel.filter('@capability:agent');
        // Should not show vendor header
        const vendors = results.filter(isLanguageModelProviderEntry);
        assert.strictEqual(vendors.length, 0, 'Should not show vendor header');
        // Should only show the model with agent capability
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 1);
        assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
    });
    test('should always place copilot vendor at the top when multiple vendors exist', async () => {
        // Test with default setup (copilot and openai)
        let results = viewModel.filter('');
        let vendors = results.filter(isLanguageModelProviderEntry);
        assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, 'copilot');
        // Add more vendors to ensure sorting works correctly
        languageModelsService.addVendor({
            vendor: 'anthropic',
            displayName: 'Anthropic',
            managementCommand: undefined,
            when: undefined,
            configuration: undefined
        });
        languageModelsService.addModel('anthropic', 'anthropic-claude', {
            extension: new ExtensionIdentifier('anthropic.api'),
            id: 'claude-3',
            name: 'Claude 3',
            family: 'claude',
            version: '1.0',
            vendor: 'anthropic',
            maxInputTokens: 100000,
            maxOutputTokens: 4096,
            modelPickerCategory: { label: 'Anthropic', order: 3 },
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                vision: false,
                agentMode: false
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        languageModelsService.addVendor({
            vendor: 'azure',
            displayName: 'Azure OpenAI',
            managementCommand: undefined,
            when: undefined,
            configuration: undefined
        });
        languageModelsService.addModel('azure', 'azure-gpt-4', {
            extension: new ExtensionIdentifier('microsoft.azure'),
            id: 'azure-gpt-4',
            name: 'Azure GPT-4',
            family: 'gpt-4',
            version: '1.0',
            vendor: 'azure',
            maxInputTokens: 8192,
            maxOutputTokens: 4096,
            modelPickerCategory: { label: 'Azure', order: 4 },
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                vision: false,
                agentMode: false
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        await viewModel.refresh();
        // Test with all filters and searches
        results = viewModel.filter('');
        vendors = results.filter(isLanguageModelProviderEntry);
        assert.strictEqual(vendors.length, 4);
        assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, 'copilot');
        // Other vendors should be alphabetically sorted: anthropic, azure, openai
        assert.strictEqual(vendors[1].vendorEntry.vendor.vendor, 'anthropic');
        assert.strictEqual(vendors[2].vendorEntry.vendor.vendor, 'azure');
        assert.strictEqual(vendors[3].vendorEntry.vendor.vendor, 'openai');
        // Test with text search
        results = viewModel.filter('GPT');
        vendors = results.filter(isLanguageModelProviderEntry);
        if (vendors.length > 1) {
            assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, 'copilot');
        }
        // Test with capability filter
        results = viewModel.filter('@capability:tools');
        vendors = results.filter(isLanguageModelProviderEntry);
        if (vendors.length > 1) {
            assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, 'copilot');
        }
    });
    test('should show vendor headers when filtered', () => {
        const results = viewModel.filter('GPT');
        const vendors = results.filter(isLanguageModelProviderEntry);
        assert.ok(vendors.length > 0);
    });
    test('should not show vendor headers when filtered if only one vendor exists', async () => {
        const { viewModel: singleVendorViewModel } = createSingleVendorViewModel();
        await singleVendorViewModel.refresh();
        const results = singleVendorViewModel.filter('GPT');
        const vendors = results.filter(isLanguageModelProviderEntry);
        assert.strictEqual(vendors.length, 0);
    });
    test('should group by visibility', () => {
        viewModel.groupBy = "visibility" /* ChatModelGroup.Visibility */;
        const actuals = viewModel.viewModelEntries;
        assert.strictEqual(actuals.length, 6);
        assert.strictEqual(actuals[0].type, 'group');
        assert.strictEqual(actuals[0].id, 'visible');
        assert.strictEqual(actuals[1].type, 'model');
        assert.strictEqual(actuals[1].model.identifier, 'copilot-gpt-4');
        assert.strictEqual(actuals[2].type, 'model');
        assert.strictEqual(actuals[2].model.identifier, 'copilot-gpt-4o');
        assert.strictEqual(actuals[3].type, 'model');
        assert.strictEqual(actuals[3].model.identifier, 'openai-gpt-3.5');
        assert.strictEqual(actuals[4].type, 'group');
        assert.strictEqual(actuals[4].id, 'hidden');
        assert.strictEqual(actuals[5].type, 'model');
        assert.strictEqual(actuals[5].model.identifier, 'openai-gpt-4-vision');
    });
    test('should fire onDidChangeGrouping when grouping changes', () => {
        let fired = false;
        store.add(viewModel.onDidChangeGrouping(() => {
            fired = true;
        }));
        viewModel.groupBy = "visibility" /* ChatModelGroup.Visibility */;
        assert.strictEqual(fired, true);
    });
    test('should reset collapsed state when grouping changes', () => {
        const vendorEntry = viewModel.viewModelEntries.find(r => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === 'copilot');
        viewModel.toggleCollapsed(vendorEntry);
        viewModel.groupBy = "visibility" /* ChatModelGroup.Visibility */;
        const results = viewModel.filter('');
        const groups = results.filter(isLanguageModelGroupEntry);
        assert.ok(groups.every(v => !v.collapsed));
    });
    test('should sort models within visibility groups', async () => {
        languageModelsService.addVendor({
            vendor: 'anthropic',
            displayName: 'Anthropic',
            managementCommand: undefined,
            when: undefined,
            configuration: undefined
        });
        languageModelsService.addModel('anthropic', 'anthropic-claude', {
            extension: new ExtensionIdentifier('anthropic.api'),
            id: 'claude-3',
            name: 'Claude 3',
            family: 'claude',
            version: '1.0',
            vendor: 'anthropic',
            maxInputTokens: 100000,
            maxOutputTokens: 4096,
            modelPickerCategory: { label: 'Anthropic', order: 3 },
            isUserSelectable: true,
            capabilities: {
                toolCalling: true,
                vision: false,
                agentMode: false
            },
            isDefaultForLocation: {
                [ChatAgentLocation.Chat]: true
            }
        });
        await viewModel.refresh();
        viewModel.groupBy = "visibility" /* ChatModelGroup.Visibility */;
        const actuals = viewModel.viewModelEntries;
        assert.strictEqual(actuals.length, 7);
        assert.strictEqual(actuals[0].type, 'group');
        assert.strictEqual(actuals[0].id, 'visible');
        assert.strictEqual(actuals[1].type, 'model');
        assert.strictEqual(actuals[1].model.metadata.id, 'gpt-4');
        assert.strictEqual(actuals[2].type, 'model');
        assert.strictEqual(actuals[2].model.metadata.id, 'gpt-4o');
        assert.strictEqual(actuals[3].type, 'model');
        assert.strictEqual(actuals[3].model.metadata.id, 'claude-3');
        assert.strictEqual(actuals[4].type, 'model');
        assert.strictEqual(actuals[4].model.metadata.id, 'gpt-3.5-turbo');
        assert.strictEqual(actuals[5].type, 'group');
        assert.strictEqual(actuals[5].id, 'hidden');
        assert.strictEqual(actuals[6].type, 'model');
        assert.strictEqual(actuals[6].model.metadata.id, 'gpt-4-vision');
    });
    test('should get configured vendors', () => {
        const vendors = viewModel.getConfiguredVendors();
        assert.ok(vendors.length > 0);
        assert.ok(vendors.some(v => v.vendor.vendor === 'copilot'));
        assert.ok(vendors.some(v => v.vendor.vendor === 'openai'));
    });
    test('should return true for shouldRefilter when models not sorted', () => {
        // After a new filter call, models should be sorted
        viewModel.filter('');
        assert.strictEqual(viewModel.shouldRefilter(), false);
        // Simulate unsorted state by accessing private property indirectly
        // This is a simple test that shouldRefilter works
        const result = viewModel.shouldRefilter();
        assert.strictEqual(typeof result, 'boolean');
    });
    test('should collapse all groups and models', () => {
        // Expand everything first
        const results1 = viewModel.filter('');
        let models = results1.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.ok(models.length > 0);
        // Collapse all
        viewModel.collapseAll();
        // After collapse all, only group/vendor headers should be shown
        const results2 = viewModel.filter('');
        const vendors = results2.filter(isLanguageModelProviderEntry);
        models = results2.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.ok(vendors.length > 0, 'Should have vendor headers');
        assert.strictEqual(models.length, 0, 'Should have no models visible after collapse all');
    });
    test('should match quoted search strings with filters', () => {
        // Test that quotes don't break when combined with other filters
        const results = viewModel.filter('@capability:tools "GPT"');
        assert.ok(Array.isArray(results));
        // Should handle without error
    });
    test('should filter by case-insensitive provider name', () => {
        const results1 = viewModel.filter('@provider:COPILOT');
        const results2 = viewModel.filter('@provider:copilot');
        const results3 = viewModel.filter('@provider:CopiloT');
        const models1 = results1.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        const models2 = results2.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        const models3 = results3.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models1.length, models2.length);
        assert.strictEqual(models2.length, models3.length);
        assert.strictEqual(models1.length, 2);
    });
    test('should handle empty search returning all results', () => {
        const results = viewModel.filter('');
        assert.ok(results.length > 0);
        // Should include vendor headers and models
        const vendors = results.filter(isLanguageModelProviderEntry);
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(vendors.length, 2);
        assert.strictEqual(models.length, 4);
    });
    test('should not find matches when searching for non-existent model', () => {
        const results = viewModel.filter('NonExistentModel123');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 0);
    });
    test('should not find matches when filtering by non-existent provider', () => {
        const results = viewModel.filter('@provider:nonexistent');
        const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.strictEqual(models.length, 0);
    });
    test('setModelsVisibility should update visibility for multiple models', () => {
        // Get initial results
        const initialResults = viewModel.filter('');
        const modelEntries = initialResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.ok(modelEntries.length >= 2, 'Should have at least 2 models for testing');
        // Get first two models
        const modelsToHide = modelEntries.slice(0, 2);
        const initialVisibility = modelsToHide.map(m => m.model.visible);
        // Hide the models
        viewModel.setModelsVisibility(modelsToHide, false);
        // Verify visibility was updated
        assert.strictEqual(modelsToHide[0].model.visible, false);
        assert.strictEqual(modelsToHide[1].model.visible, false);
        // Verify language models service was called by checking metadata
        const metadata1 = languageModelsService.lookupLanguageModel(modelsToHide[0].model.identifier);
        const metadata2 = languageModelsService.lookupLanguageModel(modelsToHide[1].model.identifier);
        assert.strictEqual(metadata1?.isUserSelectable, false);
        assert.strictEqual(metadata2?.isUserSelectable, false);
        // Verify UI was updated by filtering
        const updatedResults = viewModel.filter('');
        const updatedModelEntries = updatedResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.ok(updatedModelEntries.length > 0);
        // Restore original visibility - group by visibility state for efficient restoration
        const modelsToMakeVisible = modelsToHide.filter((_, i) => initialVisibility[i]);
        const modelsToMakeHidden = modelsToHide.filter((_, i) => !initialVisibility[i]);
        if (modelsToMakeVisible.length > 0) {
            viewModel.setModelsVisibility(modelsToMakeVisible, true);
        }
        if (modelsToMakeHidden.length > 0) {
            viewModel.setModelsVisibility(modelsToMakeHidden, false);
        }
    });
    test('setModelsVisibility should make hidden models visible', () => {
        // Get initial results
        const initialResults = viewModel.filter('');
        const modelEntries = initialResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        assert.ok(modelEntries.length >= 1, 'Should have at least 1 model for testing');
        // Get a model and hide it first
        const modelToTest = [modelEntries[0]];
        viewModel.setModelsVisibility(modelToTest, false);
        assert.strictEqual(modelToTest[0].model.visible, false);
        // Now make it visible
        viewModel.setModelsVisibility(modelToTest, true);
        // Verify visibility was updated
        assert.strictEqual(modelToTest[0].model.visible, true);
        // Verify language models service was called
        const metadata = languageModelsService.lookupLanguageModel(modelToTest[0].model.identifier);
        assert.strictEqual(metadata?.isUserSelectable, true);
    });
    test('setGroupVisibility should update visibility for all models in a provider group', () => {
        // Get initial results to find a provider group
        const initialResults = viewModel.filter('');
        const providerGroups = initialResults.filter(isLanguageModelProviderEntry);
        assert.ok(providerGroups.length > 0, 'Should have at least 1 provider group');
        const providerGroup = providerGroups[0];
        const modelsInGroup = viewModel.getModelsForGroup(providerGroup);
        assert.ok(modelsInGroup.length > 0, 'Provider group should have models');
        // Store initial visibility
        const initialVisibility = modelsInGroup.map(m => m.visible);
        // Hide all models in the group
        viewModel.setGroupVisibility(providerGroup, false);
        // Verify all models in group are now hidden
        const updatedModels = viewModel.getModelsForGroup(providerGroup);
        for (const model of updatedModels) {
            assert.strictEqual(model.visible, false, `Model ${model.identifier} should be hidden`);
            // Verify language models service was called
            const metadata = languageModelsService.lookupLanguageModel(model.identifier);
            assert.strictEqual(metadata?.isUserSelectable, false);
        }
        // Restore original visibility using setGroupVisibility for models that were visible
        const modelsToRestore = modelsInGroup.filter((_, i) => initialVisibility[i]);
        if (modelsToRestore.length > 0) {
            const modelEntries = initialResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
            const entriesToRestore = modelEntries.filter(e => modelsToRestore.some(m => m.identifier === e.model.identifier));
            viewModel.setModelsVisibility(entriesToRestore, true);
        }
    });
    test('setGroupVisibility should update visibility for all models in a visibility group', () => {
        // Store initial visibility state
        const allResults = viewModel.filter('');
        const allModelEntries = allResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r));
        const initialModelStates = allModelEntries.map(m => ({ entry: m, visible: m.model.visible }));
        // First ensure we have some visible and some hidden models
        if (allModelEntries.length >= 2) {
            // Hide one model to create a mixed state
            viewModel.setModelsVisibility([allModelEntries[0]], false);
            viewModel.setModelsVisibility([allModelEntries[1]], true);
        }
        // Filter to trigger visibility group creation - the visibility filter activates grouping by visibility
        viewModel.filter('@visible:true');
        // Now get the results with visibility groups
        const resultsWithGroups = viewModel.filter('');
        // Find the visibility group entries
        const visibilityGroups = resultsWithGroups.filter(isLanguageModelGroupEntry);
        if (visibilityGroups.length > 0) {
            const visibleGroup = visibilityGroups.find(g => g.id === 'visible');
            if (visibleGroup) {
                const visibleModels = viewModel.getModelsForGroup(visibleGroup);
                const initialCount = visibleModels.length;
                if (initialCount > 0) {
                    // Hide all visible models
                    viewModel.setGroupVisibility(visibleGroup, false);
                    // Verify all previously visible models are now hidden
                    const updatedVisibleModels = viewModel.getModelsForGroup(visibleGroup);
                    assert.strictEqual(updatedVisibleModels.length, 0, 'Should have no visible models after hiding the visible group');
                    // Verify the hidden group now contains those models
                    const hiddenGroup = visibilityGroups.find(g => g.id === 'hidden');
                    if (hiddenGroup) {
                        const hiddenModels = viewModel.getModelsForGroup(hiddenGroup);
                        assert.ok(hiddenModels.length >= initialCount, 'Hidden group should contain the previously visible models');
                    }
                }
            }
        }
        // Restore original visibility state
        const modelsToMakeVisible = initialModelStates.filter(s => s.visible).map(s => s.entry);
        const modelsToMakeHidden = initialModelStates.filter(s => !s.visible).map(s => s.entry);
        if (modelsToMakeVisible.length > 0) {
            viewModel.setModelsVisibility(modelsToMakeVisible, true);
        }
        if (modelsToMakeHidden.length > 0) {
            viewModel.setModelsVisibility(modelsToMakeHidden, false);
        }
    });
    test('setGroupVisibility should trigger UI update through doFilter', () => {
        // Get a provider group
        const initialResults = viewModel.filter('');
        const providerGroups = initialResults.filter(isLanguageModelProviderEntry);
        if (providerGroups.length > 0) {
            const providerGroup = providerGroups[0];
            // Change visibility
            viewModel.setGroupVisibility(providerGroup, false);
            // Filter again to ensure UI was updated
            const updatedResults = viewModel.filter('');
            const updatedProviderGroups = updatedResults.filter(isLanguageModelProviderEntry);
            // Verify we can still get results (doFilter was called)
            assert.ok(updatedProviderGroups.length > 0, 'Should still have provider groups after visibility change');
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1vZGVsc1ZpZXdNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvY2hhdE1hbmFnZW1lbnQvY2hhdE1vZGVsc1ZpZXdNb2RlbC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUU1QixPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXhFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQTBCLDBCQUEwQixFQUErTSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BULE9BQU8sRUFBa0IsbUJBQW1CLEVBQW9ELDRCQUE0QixFQUFFLHlCQUF5QixFQUE0QixNQUFNLHdEQUF3RCxDQUFDO0FBQ2xQLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBR2pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRWpFLE1BQU0seUJBQXlCO0lBQS9CO1FBR1MsWUFBTyxHQUFpQyxFQUFFLENBQUM7UUFDM0MsV0FBTSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1FBQ3ZELG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQW9CLENBQUM7UUFDN0MsZ0JBQVcsR0FBRyxJQUFJLEdBQUcsRUFBa0MsQ0FBQztRQUUvQywrQkFBMEIsR0FBRyxJQUFJLE9BQU8sRUFBVSxDQUFDO1FBQzNELDhCQUF5QixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUM7UUFFMUQscUNBQWdDLEdBQUcsSUFBSSxPQUFPLEVB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Q0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUUxRCxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFM0QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRTdELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUVsRSxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDN0MsTUFBTSxDQUFD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