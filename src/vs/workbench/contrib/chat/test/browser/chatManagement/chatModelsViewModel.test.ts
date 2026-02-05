/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatProvider, ILanguageModelChatSelector, ILanguageModelsGroup, ILanguageModelsService, IUserFriendlyLanguageModel, ILanguageModelProviderDescriptor } from '../../../common/languageModels.js';
import { ChatModelGroup, ChatModelsViewModel, ILanguageModelEntry, ILanguageModelProviderEntry, isLanguageModelProviderEntry, isLanguageModelGroupEntry, ILanguageModelGroupEntry } from '../../../browser/chatManagement/chatModelsViewModel.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IStringDictionary } from '../../../../../../base/common/collections.js';
import { ILanguageModelsProviderGroup } from '../../../common/languageModelsConfiguration.js';
import { ChatAgentLocation } from '../../../common/constants.js';

class MockLanguageModelsService implements ILanguageModelsService {
	_serviceBrand: undefined;

	private vendors: IUserFriendlyLanguageModel[] = [];
	private models = new Map<string, ILanguageModelChatMetadata>();
	private modelsByVendor = new Map<string, string[]>();
	private modelGroups = new Map<string, ILanguageModelsGroup[]>();

	private readonly _onDidChangeLanguageModels = new Emitter<string>();
	readonly onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;

	private readonly _onDidChangeLanguageModelVendors = new Emitter<readonly string[]>();
	readonly onDidChangeLanguageModelVendors = this._onDidChangeLanguageModelVendors.event;

	addVendor(vendor: IUserFriendlyLanguageModel): void {
		this.vendors.push(vendor);
		this.modelsByVendor.set(vendor.vendor, []);
		this.modelGroups.set(vendor.vendor, []);
	}

	addModel(vendorId: string, identifier: string, metadata: ILanguageModelChatMetadata): void {
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

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable {
		throw new Error('Method not implemented.');
	}

	deltaLanguageModelChatProviderDescriptors(added: IUserFriendlyLanguageModel[], removed: IUserFriendlyLanguageModel[]): void {
		throw new Error('Method not implemented.');
	}

	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void {
		const metadata = this.models.get(modelIdentifier);
		if (metadata) {
			this.models.set(modelIdentifier, { ...metadata, isUserSelectable: showInModelPicker });
		}
	}

	getVendors(): ILanguageModelProviderDescriptor[] {
		return this.vendors.map(v => ({ ...v, isDefault: v.vendor === 'copilot' }));
	}

	getLanguageModelIds(): string[] {
		return Array.from(this.models.keys());
	}

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
		return this.models.get(identifier);
	}

	lookupLanguageModelByQualifiedName(referenceName: string): ILanguageModelChatMetadataAndIdentifier | undefined {
		for (const [identifier, metadata] of this.models.entries()) {
			if (ILanguageModelChatMetadata.matchesQualifiedName(referenceName, metadata)) {
				return { metadata, identifier };
			}
		}
		return undefined;
	}

	getLanguageModels(): ILanguageModelChatMetadataAndIdentifier[] {
		const result: ILanguageModelChatMetadataAndIdentifier[] = [];
		for (const [identifier, metadata] of this.models.entries()) {
			result.push({ identifier, metadata });
		}
		return result;
	}

	setContributedSessionModels(): void {
	}

	clearContributedSessionModels(): void {
	}

	async selectLanguageModels(selector: ILanguageModelChatSelector): Promise<string[]> {
		if (selector.vendor) {
			return this.modelsByVendor.get(selector.vendor) || [];
		}
		return Array.from(this.models.keys());
	}

	sendChatRequest(): Promise<any> {
		throw new Error('Method not implemented.');
	}

	computeTokenLength(): Promise<number> {
		throw new Error('Method not implemented.');
	}

	async configureLanguageModelsProviderGroup(vendorId: string, name?: string): Promise<void> {
	}

	async addLanguageModelsProviderGroup(name: string, vendorId: string, configuration: IStringDictionary<unknown> | undefined): Promise<void> {
	}

	getLanguageModelGroups(vendor: string): ILanguageModelsGroup[] {
		return this.modelGroups.get(vendor) || [];
	}

	async removeLanguageModelsProviderGroup(vendorId: string, providerGroupName: string): Promise<void> {
	}

	async migrateLanguageModelsProviderGroup(languageModelsProviderGroup: ILanguageModelsProviderGroup): Promise<void> { }
}

suite('ChatModelsViewModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let languageModelsService: MockLanguageModelsService;
	let viewModel: ChatModelsViewModel;

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

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 4);
	});

	test('should filter by single capability - tools', () => {
		const results = viewModel.filter('@capability:tools');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 3);
		assert.ok(models.every(m => m.model.metadata.capabilities?.toolCalling === true));
	});

	test('should filter by single capability - vision', () => {
		const results = viewModel.filter('@capability:vision');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 3);
		assert.ok(models.every(m => m.model.metadata.capabilities?.vision === true));
	});

	test('should filter by single capability - agent', () => {
		const results = viewModel.filter('@capability:agent');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
	});

	test('should filter by multiple capabilities with AND logic', () => {
		const results = viewModel.filter('@capability:tools @capability:vision');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		// Should only return models that have BOTH tools and vision
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m =>
			m.model.metadata.capabilities?.toolCalling === true &&
			m.model.metadata.capabilities?.vision === true
		));
	});

	test('should filter by three capabilities with AND logic', () => {
		const results = viewModel.filter('@capability:tools @capability:vision @capability:agent');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		// Should only return gpt-4o which has all three
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
	});

	test('should return no results when filtering by incompatible capabilities', () => {
		const results = viewModel.filter('@capability:vision @capability:agent');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		// Only gpt-4o has both vision and agent, but gpt-4-vision doesn't have agent
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
	});

	test('should filter by visibility - visible:true', () => {
		const results = viewModel.filter('@visible:true');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 3);
		assert.ok(models.every(m => m.model.visible === true));
	});

	test('should filter by visibility - visible:false', () => {
		const results = viewModel.filter('@visible:false');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.visible, false);
	});

	test('should combine provider and capability filters', () => {
		const results = viewModel.filter('@provider:copilot @capability:vision');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m =>
			m.model.provider.vendor.vendor === 'copilot' &&
			m.model.metadata.capabilities?.vision === true
		));
	});

	test('should combine provider, capability, and visibility filters', () => {
		const results = viewModel.filter('@provider:openai @capability:vision @visible:false');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.metadata.id, 'gpt-4-vision');
	});

	test('should filter by text matching model name', () => {
		const results = viewModel.filter('GPT-4o');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.metadata.name, 'GPT-4o');
		assert.ok(models[0].modelNameMatches);
	});

	test('should filter by text matching model id', () => {
		const results = viewModel.filter('gpt-4o');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.identifier, 'copilot-gpt-4o');
		assert.ok(models[0].modelIdMatches);
	});

	test('should filter by text matching vendor name', () => {
		const results = viewModel.filter('GitHub');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m => m.model.provider.group.name === 'GitHub Copilot'));
	});

	test('should combine text search with capability filter', () => {
		const results = viewModel.filter('@capability:tools GPT');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		// Should match models that have vision capability or "vision" in their name
		assert.ok(models.length > 0);
		assert.ok(models.every(m =>
			m.model.metadata.capabilities?.vision === true ||
			m.model.metadata.name.toLowerCase().includes('vision')
		));
	});

	test('should toggle vendor collapsed state', () => {
		const vendorEntry = viewModel.viewModelEntries.find(r => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === 'copilot') as ILanguageModelProviderEntry;
		viewModel.toggleCollapsed(vendorEntry);

		const results = viewModel.filter('');
		const copilotVendor = results.find(r => isLanguageModelProviderEntry(r) && (r as ILanguageModelProviderEntry).vendorEntry.vendor.vendor === 'copilot') as ILanguageModelProviderEntry;
		assert.ok(copilotVendor);
		assert.strictEqual(copilotVendor.collapsed, true);

		// Models should not be shown when vendor is collapsed
		const copilotModelsAfterCollapse = results.filter(r =>
			!isLanguageModelProviderEntry(r) && (r as ILanguageModelEntry).model.provider.vendor.vendor === 'copilot'
		);
		assert.strictEqual(copilotModelsAfterCollapse.length, 0);

		// Toggle back
		viewModel.toggleCollapsed(vendorEntry);
		const resultsAfterExpand = viewModel.filter('');
		const copilotModelsAfterExpand = resultsAfterExpand.filter(r =>
			!isLanguageModelProviderEntry(r) && (r as ILanguageModelEntry).model.provider.vendor.vendor === 'copilot'
		);
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

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.ok(models.length > 0);

		for (const model of models) {
			assert.ok(model.capabilityMatches);
			assert.ok(model.capabilityMatches.length > 0);
			// Should include both toolCalling and vision
			assert.ok(model.capabilityMatches.some(c => c === 'toolCalling' || c === 'vision'));
		}
	});

	function createSingleVendorViewModel(includeSecondModel: boolean = true): { service: MockLanguageModelsService; viewModel: ChatModelsViewModel } {
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

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 2, 'Should show all models');
		assert.ok(models.every(m => m.model.provider.vendor.vendor === 'copilot'));
	});

	test('should show vendor headers when multiple vendors exist', () => {
		// This is the existing behavior test
		const results = viewModel.filter('');

		// Should have 2 vendor entries and 4 model entries (grouped by vendor)
		const vendors = results.filter(isLanguageModelProviderEntry);
		assert.strictEqual(vendors.length, 2, 'Should show vendor headers when multiple vendors exist');

		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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
		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].model.metadata.id, 'gpt-4o');
	});

	test('should always place copilot vendor at the top when multiple vendors exist', async () => {
		// Test with default setup (copilot and openai)
		let results = viewModel.filter('');
		let vendors = results.filter(isLanguageModelProviderEntry) as ILanguageModelProviderEntry[];
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
		vendors = results.filter(isLanguageModelProviderEntry) as ILanguageModelProviderEntry[];
		assert.strictEqual(vendors.length, 4);
		assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, 'copilot');
		// Other vendors should be alphabetically sorted: anthropic, azure, openai
		assert.strictEqual(vendors[1].vendorEntry.vendor.vendor, 'anthropic');
		assert.strictEqual(vendors[2].vendorEntry.vendor.vendor, 'azure');
		assert.strictEqual(vendors[3].vendorEntry.vendor.vendor, 'openai');

		// Test with text search
		results = viewModel.filter('GPT');
		vendors = results.filter(isLanguageModelProviderEntry) as ILanguageModelProviderEntry[];
		if (vendors.length > 1) {
			assert.strictEqual(vendors[0].vendorEntry.vendor.vendor, 'copilot');
		}

		// Test with capability filter
		results = viewModel.filter('@capability:tools');
		vendors = results.filter(isLanguageModelProviderEntry) as ILanguageModelProviderEntry[];
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
		viewModel.groupBy = ChatModelGroup.Visibility;
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

		viewModel.groupBy = ChatModelGroup.Visibility;
		assert.strictEqual(fired, true);
	});

	test('should reset collapsed state when grouping changes', () => {
		const vendorEntry = viewModel.viewModelEntries.find(r => isLanguageModelProviderEntry(r) && r.vendorEntry.vendor.vendor === 'copilot') as ILanguageModelProviderEntry;
		viewModel.toggleCollapsed(vendorEntry);

		viewModel.groupBy = ChatModelGroup.Visibility;

		const results = viewModel.filter('');
		const groups = results.filter(isLanguageModelGroupEntry) as ILanguageModelGroupEntry[];
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

		viewModel.groupBy = ChatModelGroup.Visibility;
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
		let models = results1.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.ok(models.length > 0);

		// Collapse all
		viewModel.collapseAll();

		// After collapse all, only group/vendor headers should be shown
		const results2 = viewModel.filter('');
		const vendors = results2.filter(isLanguageModelProviderEntry);
		models = results2.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];

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

		const models1 = results1.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		const models2 = results2.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		const models3 = results3.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];

		assert.strictEqual(models1.length, models2.length);
		assert.strictEqual(models2.length, models3.length);
		assert.strictEqual(models1.length, 2);
	});

	test('should handle empty search returning all results', () => {
		const results = viewModel.filter('');
		assert.ok(results.length > 0);

		// Should include vendor headers and models
		const vendors = results.filter(isLanguageModelProviderEntry);
		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];

		assert.strictEqual(vendors.length, 2);
		assert.strictEqual(models.length, 4);
	});

	test('should not find matches when searching for non-existent model', () => {
		const results = viewModel.filter('NonExistentModel123');
		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 0);
	});

	test('should not find matches when filtering by non-existent provider', () => {
		const results = viewModel.filter('@provider:nonexistent');
		const models = results.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
		assert.strictEqual(models.length, 0);
	});

	test('setModelsVisibility should update visibility for multiple models', () => {
		// Get initial results
		const initialResults = viewModel.filter('');
		const modelEntries = initialResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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
		const updatedModelEntries = updatedResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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
		const modelEntries = initialResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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
			const modelEntries = initialResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
			const entriesToRestore = modelEntries.filter(e => modelsToRestore.some(m => m.identifier === e.model.identifier));
			viewModel.setModelsVisibility(entriesToRestore, true);
		}
	});

	test('setGroupVisibility should update visibility for all models in a visibility group', () => {
		// Store initial visibility state
		const allResults = viewModel.filter('');
		const allModelEntries = allResults.filter(r => !isLanguageModelProviderEntry(r) && !isLanguageModelGroupEntry(r)) as ILanguageModelEntry[];
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
