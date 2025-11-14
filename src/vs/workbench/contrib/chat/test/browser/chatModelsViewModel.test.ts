/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelChatProvider, ILanguageModelChatSelector, ILanguageModelsService, IUserFriendlyLanguageModel } from '../../common/languageModels.js';
import { ChatModelsViewModel, IModelItemEntry, IVendorItemEntry, isVendorEntry } from '../../browser/chatManagement/chatModelsViewModel.js';
import { IChatEntitlementService, ChatEntitlement } from '../../../../services/chat/common/chatEntitlementService.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';

class MockLanguageModelsService implements ILanguageModelsService {
	_serviceBrand: undefined;

	private vendors: IUserFriendlyLanguageModel[] = [];
	private models = new Map<string, ILanguageModelChatMetadata>();
	private modelsByVendor = new Map<string, string[]>();

	private readonly _onDidChangeLanguageModels = new Emitter<string>();
	readonly onDidChangeLanguageModels = this._onDidChangeLanguageModels.event;

	addVendor(vendor: IUserFriendlyLanguageModel): void {
		this.vendors.push(vendor);
		this.modelsByVendor.set(vendor.vendor, []);
	}

	addModel(vendorId: string, identifier: string, metadata: ILanguageModelChatMetadata): void {
		this.models.set(identifier, metadata);
		const models = this.modelsByVendor.get(vendorId) || [];
		models.push(identifier);
		this.modelsByVendor.set(vendorId, models);
	}

	registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable {
		throw new Error('Method not implemented.');
	}

	updateModelPickerPreference(modelIdentifier: string, showInModelPicker: boolean): void {
		throw new Error('Method not implemented.');
	}

	getVendors(): IUserFriendlyLanguageModel[] {
		return this.vendors;
	}

	getLanguageModelIds(): string[] {
		return Array.from(this.models.keys());
	}

	lookupLanguageModel(identifier: string): ILanguageModelChatMetadata | undefined {
		return this.models.get(identifier);
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

	async selectLanguageModels(selector: ILanguageModelChatSelector, allowHidden?: boolean): Promise<string[]> {
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
}

class MockChatEntitlementService implements IChatEntitlementService {
	_serviceBrand: undefined;

	private readonly _onDidChangeEntitlement = new Emitter<void>();
	readonly onDidChangeEntitlement = this._onDidChangeEntitlement.event;

	readonly entitlement = ChatEntitlement.Unknown;
	readonly entitlementObs: IObservable<ChatEntitlement> = observableValue('entitlement', ChatEntitlement.Unknown);

	readonly organisations: string[] | undefined = undefined;
	readonly isInternal = false;
	readonly sku: string | undefined = undefined;

	readonly onDidChangeQuotaExceeded = Event.None;
	readonly onDidChangeQuotaRemaining = Event.None;

	readonly quotas = {
		chat: {
			total: 100,
			remaining: 100,
			percentRemaining: 100,
			overageEnabled: false,
			overageCount: 0,
			unlimited: false
		},
		completions: {
			total: 100,
			remaining: 100,
			percentRemaining: 100,
			overageEnabled: false,
			overageCount: 0,
			unlimited: false
		}
	};

	readonly onDidChangeSentiment = Event.None;
	readonly sentiment: any = { installed: true, hidden: false, disabled: false };
	readonly sentimentObs: IObservable<any> = observableValue('sentiment', { installed: true, hidden: false, disabled: false });

	readonly onDidChangeAnonymous = Event.None;
	readonly anonymous = false;
	readonly anonymousObs: IObservable<boolean> = observableValue('anonymous', false);

	fireEntitlementChange(): void {
		this._onDidChangeEntitlement.fire();
	}

	async update(): Promise<void> {
		// Not needed for tests
	}
}

suite('ChatModelsViewModel', () => {
	let store: DisposableStore;
	let languageModelsService: MockLanguageModelsService;
	let chatEntitlementService: MockChatEntitlementService;
	let viewModel: ChatModelsViewModel;

	setup(async () => {
		store = new DisposableStore();
		languageModelsService = new MockLanguageModelsService();
		chatEntitlementService = new MockChatEntitlementService();

		// Setup test data
		languageModelsService.addVendor({
			vendor: 'copilot',
			displayName: 'GitHub Copilot',
			managementCommand: undefined,
			when: undefined
		});

		languageModelsService.addVendor({
			vendor: 'openai',
			displayName: 'OpenAI',
			managementCommand: undefined,
			when: undefined
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
			}
		});

		viewModel = store.add(new ChatModelsViewModel(
			languageModelsService,
			chatEntitlementService
		));

		await viewModel.resolve();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('should fetch all models without filters', () => {
		const results = viewModel.fetch('');

		// Should have 2 vendor entries and 4 model entries (grouped by vendor)
		assert.strictEqual(results.length, 6);

		const vendors = results.filter(isVendorEntry);
		assert.strictEqual(vendors.length, 2);

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 4);
	});

	test('should filter by provider name', () => {
		const results = viewModel.fetch('@provider:copilot');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m => m.modelEntry.vendor === 'copilot'));
	});

	test('should filter by provider display name', () => {
		const results = viewModel.fetch('@provider:OpenAI');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m => m.modelEntry.vendor === 'openai'));
	});

	test('should filter by multiple providers with OR logic', () => {
		const results = viewModel.fetch('@provider:copilot @provider:openai');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 4);
	});

	test('should filter by single capability - tools', () => {
		const results = viewModel.fetch('@capability:tools');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 3);
		assert.ok(models.every(m => m.modelEntry.metadata.capabilities?.toolCalling === true));
	});

	test('should filter by single capability - vision', () => {
		const results = viewModel.fetch('@capability:vision');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 3);
		assert.ok(models.every(m => m.modelEntry.metadata.capabilities?.vision === true));
	});

	test('should filter by single capability - agent', () => {
		const results = viewModel.fetch('@capability:agent');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].modelEntry.metadata.id, 'gpt-4o');
	});

	test('should filter by multiple capabilities with AND logic', () => {
		const results = viewModel.fetch('@capability:tools @capability:vision');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		// Should only return models that have BOTH tools and vision
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m =>
			m.modelEntry.metadata.capabilities?.toolCalling === true &&
			m.modelEntry.metadata.capabilities?.vision === true
		));
	});

	test('should filter by three capabilities with AND logic', () => {
		const results = viewModel.fetch('@capability:tools @capability:vision @capability:agent');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		// Should only return gpt-4o which has all three
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].modelEntry.metadata.id, 'gpt-4o');
	});

	test('should return no results when filtering by incompatible capabilities', () => {
		const results = viewModel.fetch('@capability:vision @capability:agent');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		// Only gpt-4o has both vision and agent, but gpt-4-vision doesn't have agent
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].modelEntry.metadata.id, 'gpt-4o');
	});

	test('should filter by visibility - visible:true', () => {
		const results = viewModel.fetch('@visible:true');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 3);
		assert.ok(models.every(m => m.modelEntry.metadata.isUserSelectable === true));
	});

	test('should filter by visibility - visible:false', () => {
		const results = viewModel.fetch('@visible:false');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].modelEntry.metadata.isUserSelectable, false);
	});

	test('should combine provider and capability filters', () => {
		const results = viewModel.fetch('@provider:copilot @capability:vision');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m =>
			m.modelEntry.vendor === 'copilot' &&
			m.modelEntry.metadata.capabilities?.vision === true
		));
	});

	test('should combine provider, capability, and visibility filters', () => {
		const results = viewModel.fetch('@provider:openai @capability:vision @visible:false');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].modelEntry.metadata.id, 'gpt-4-vision');
	});

	test('should filter by text matching model name', () => {
		const results = viewModel.fetch('GPT-4o');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].modelEntry.metadata.name, 'GPT-4o');
		assert.ok(models[0].modelNameMatches);
	});

	test('should filter by text matching vendor name', () => {
		const results = viewModel.fetch('GitHub');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m => m.modelEntry.vendorDisplayName === 'GitHub Copilot'));
	});

	test('should combine text search with capability filter', () => {
		const results = viewModel.fetch('@capability:tools GPT');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		// Should match all models with tools capability and 'GPT' in name
		assert.strictEqual(models.length, 3);
		assert.ok(models.every(m => m.modelEntry.metadata.capabilities?.toolCalling === true));
	});

	test('should handle empty search value', () => {
		const results = viewModel.fetch('');

		// Should return all models grouped by vendor
		assert.ok(results.length > 0);
	});

	test('should handle search value with only whitespace', () => {
		const results = viewModel.fetch('   ');

		// Should return all models grouped by vendor
		assert.ok(results.length > 0);
	});

	test('should match capability text in free text search', () => {
		const results = viewModel.fetch('vision');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		// Should match models that have vision capability or "vision" in their name
		assert.ok(models.length > 0);
		assert.ok(models.every(m =>
			m.modelEntry.metadata.capabilities?.vision === true ||
			m.modelEntry.metadata.name.toLowerCase().includes('vision')
		));
	});

	test('should toggle vendor collapsed state', () => {
		viewModel.toggleVendorCollapsed('copilot');

		const results = viewModel.fetch('');
		const copilotVendor = results.find(r => isVendorEntry(r) && (r as IVendorItemEntry).vendorEntry.vendor === 'copilot') as IVendorItemEntry;

		assert.ok(copilotVendor);
		assert.strictEqual(copilotVendor.collapsed, true);

		// Models should not be shown when vendor is collapsed
		const copilotModelsAfterCollapse = results.filter(r =>
			!isVendorEntry(r) && (r as IModelItemEntry).modelEntry.vendor === 'copilot'
		);
		assert.strictEqual(copilotModelsAfterCollapse.length, 0);

		// Toggle back
		viewModel.toggleVendorCollapsed('copilot');
		const resultsAfterExpand = viewModel.fetch('');
		const copilotModelsAfterExpand = resultsAfterExpand.filter(r =>
			!isVendorEntry(r) && (r as IModelItemEntry).modelEntry.vendor === 'copilot'
		);
		assert.strictEqual(copilotModelsAfterExpand.length, 2);
	});

	test('should fire onDidChangeModelEntries when entitlement changes', async () => {
		let fired = false;
		store.add(viewModel.onDidChangeModelEntries(() => {
			fired = true;
		}));

		chatEntitlementService.fireEntitlementChange();

		// Wait a bit for async resolve
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(fired, true);
	});

	test('should handle quoted search strings', () => {
		// When a search string is fully quoted (starts and ends with quotes),
		// the completeMatch flag is set to true, which currently skips all matching
		// This test verifies the quotes are processed without errors
		const results = viewModel.fetch('"GPT"');

		// The function should complete without error
		// Note: complete match logic (both quotes) currently doesn't perform matching
		assert.ok(Array.isArray(results));
	});

	test('should remove filter keywords from text search', () => {
		const results = viewModel.fetch('@provider:copilot @capability:vision GPT');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		// Should only search 'GPT' in model names, not the filter keywords
		assert.strictEqual(models.length, 2);
		assert.ok(models.every(m => m.modelEntry.vendor === 'copilot'));
	});

	test('should handle case-insensitive capability matching', () => {
		const results1 = viewModel.fetch('@capability:TOOLS');
		const results2 = viewModel.fetch('@capability:tools');
		const results3 = viewModel.fetch('@capability:Tools');

		const models1 = results1.filter(r => !isVendorEntry(r));
		const models2 = results2.filter(r => !isVendorEntry(r));
		const models3 = results3.filter(r => !isVendorEntry(r));

		assert.strictEqual(models1.length, models2.length);
		assert.strictEqual(models2.length, models3.length);
	});

	test('should support toolcalling alias for tools capability', () => {
		const resultsTools = viewModel.fetch('@capability:tools');
		const resultsToolCalling = viewModel.fetch('@capability:toolcalling');

		const modelsTools = resultsTools.filter(r => !isVendorEntry(r));
		const modelsToolCalling = resultsToolCalling.filter(r => !isVendorEntry(r));

		assert.strictEqual(modelsTools.length, modelsToolCalling.length);
	});

	test('should support agentmode alias for agent capability', () => {
		const resultsAgent = viewModel.fetch('@capability:agent');
		const resultsAgentMode = viewModel.fetch('@capability:agentmode');

		const modelsAgent = resultsAgent.filter(r => !isVendorEntry(r));
		const modelsAgentMode = resultsAgentMode.filter(r => !isVendorEntry(r));

		assert.strictEqual(modelsAgent.length, modelsAgentMode.length);
	});

	test('should include matched capabilities in results', () => {
		const results = viewModel.fetch('@capability:tools @capability:vision');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.ok(models.length > 0);

		for (const model of models) {
			assert.ok(model.capabilityMatches);
			assert.ok(model.capabilityMatches.length > 0);
			// Should include both toolCalling and vision
			assert.ok(model.capabilityMatches.some(c => c === 'toolCalling' || c === 'vision'));
		}
	});

	// Helper function to create a single vendor test environment
	function createSingleVendorViewModel(store: DisposableStore, chatEntitlementService: IChatEntitlementService, includeSecondModel: boolean = true): { service: MockLanguageModelsService; viewModel: ChatModelsViewModel } {
		const service = new MockLanguageModelsService();
		service.addVendor({
			vendor: 'copilot',
			displayName: 'GitHub Copilot',
			managementCommand: undefined,
			when: undefined
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
				}
			});
		}

		const viewModel = store.add(new ChatModelsViewModel(service, chatEntitlementService));
		return { service, viewModel };
	}

	test('should not show vendor header when only one vendor exists', async () => {
		const { viewModel: singleVendorViewModel } = createSingleVendorViewModel(store, chatEntitlementService);
		await singleVendorViewModel.resolve();

		const results = singleVendorViewModel.fetch('');

		// Should have only model entries, no vendor entry
		const vendors = results.filter(isVendorEntry);
		assert.strictEqual(vendors.length, 0, 'Should not show vendor header when only one vendor exists');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 2, 'Should show all models');
		assert.ok(models.every(m => m.modelEntry.vendor === 'copilot'));
	});

	test('should show vendor headers when multiple vendors exist', () => {
		// This is the existing behavior test
		const results = viewModel.fetch('');

		// Should have 2 vendor entries and 4 model entries (grouped by vendor)
		const vendors = results.filter(isVendorEntry);
		assert.strictEqual(vendors.length, 2, 'Should show vendor headers when multiple vendors exist');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 4);
	});

	test('should show models even when single vendor is collapsed', async () => {
		const { viewModel: singleVendorViewModel } = createSingleVendorViewModel(store, chatEntitlementService, false);
		await singleVendorViewModel.resolve();

		// Try to collapse the single vendor
		singleVendorViewModel.toggleVendorCollapsed('copilot');

		const results = singleVendorViewModel.fetch('');

		// Should still show models even though vendor is "collapsed"
		// because there's no vendor header to collapse
		const vendors = results.filter(isVendorEntry);
		assert.strictEqual(vendors.length, 0, 'Should not show vendor header');

		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 1, 'Should still show models even when single vendor is collapsed');
	});

	test('should filter single vendor models by capability', async () => {
		const { viewModel: singleVendorViewModel } = createSingleVendorViewModel(store, chatEntitlementService);
		await singleVendorViewModel.resolve();

		const results = singleVendorViewModel.fetch('@capability:agent');

		// Should not show vendor header
		const vendors = results.filter(isVendorEntry);
		assert.strictEqual(vendors.length, 0, 'Should not show vendor header');

		// Should only show the model with agent capability
		const models = results.filter(r => !isVendorEntry(r)) as IModelItemEntry[];
		assert.strictEqual(models.length, 1);
		assert.strictEqual(models[0].modelEntry.metadata.id, 'gpt-4o');
	});

	test('should always place copilot vendor at the top', () => {
		const results = viewModel.fetch('');

		const vendors = results.filter(isVendorEntry) as IVendorItemEntry[];
		assert.ok(vendors.length >= 2);

		// First vendor should always be copilot
		assert.strictEqual(vendors[0].vendorEntry.vendor, 'copilot');
	});

	test('should maintain copilot at top with multiple vendors', async () => {
		// Add more vendors to ensure sorting works correctly
		languageModelsService.addVendor({
			vendor: 'anthropic',
			displayName: 'Anthropic',
			managementCommand: undefined,
			when: undefined
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
			}
		});

		languageModelsService.addVendor({
			vendor: 'azure',
			displayName: 'Azure OpenAI',
			managementCommand: undefined,
			when: undefined
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
			}
		});

		await viewModel.resolve();

		const results = viewModel.fetch('');
		const vendors = results.filter(isVendorEntry) as IVendorItemEntry[];

		// Should have 4 vendors: copilot, openai, anthropic, azure
		assert.strictEqual(vendors.length, 4);

		// First vendor should always be copilot
		assert.strictEqual(vendors[0].vendorEntry.vendor, 'copilot');

		// Other vendors should be alphabetically sorted: anthropic, azure, openai
		assert.strictEqual(vendors[1].vendorEntry.vendor, 'anthropic');
		assert.strictEqual(vendors[2].vendorEntry.vendor, 'azure');
		assert.strictEqual(vendors[3].vendorEntry.vendor, 'openai');
	});

	test('should keep copilot at top even with text search', () => {
		// Even when searching, if results include multiple vendors, copilot should be first
		const results = viewModel.fetch('GPT');

		const vendors = results.filter(isVendorEntry) as IVendorItemEntry[];

		if (vendors.length > 1) {
			// If multiple vendors match, copilot should be first
			const copilotVendor = vendors.find(v => v.vendorEntry.vendor === 'copilot');
			if (copilotVendor) {
				assert.strictEqual(vendors[0].vendorEntry.vendor, 'copilot');
			}
		}
	});

	test('should keep copilot at top when filtering by capability', () => {
		const results = viewModel.fetch('@capability:tools');

		const vendors = results.filter(isVendorEntry) as IVendorItemEntry[];

		// Both copilot and openai have models with tools capability
		if (vendors.length > 1) {
			assert.strictEqual(vendors[0].vendorEntry.vendor, 'copilot');
		}
	});
});
