/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatSuggestNextWidget } from '../../../../browser/widget/chatContentParts/chatSuggestNextWidget.js';
import { IChatMode } from '../../../../common/chatModes.js';
import { IChatSessionsService, IChatSessionsExtensionPoint } from '../../../../common/chatSessionsService.js';
import { ChatModeKind, ChatConfiguration } from '../../../../common/constants.js';
import { ILanguageModelsService, ILanguageModelChatMetadata } from '../../../../common/languageModels.js';
import { IHandOff } from '../../../../common/promptSyntax/promptFileParser.js';
import { PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';

suite('ChatSuggestNextWidget', () => {

	let store: DisposableStore;
	let widget: ChatSuggestNextWidget;
	let mockLanguageModelsService: MockLanguageModelsService;
	let testConfigurationService: TestConfigurationService;

	class MockLanguageModelsService {
		private models = new Map<string, ILanguageModelChatMetadata>();

		registerModel(id: string, metadata: Partial<ILanguageModelChatMetadata>): void {
			this.models.set(id, {
				id,
				vendor: 'test',
				name: metadata.name ?? id,
				family: 'test',
				version: '1.0',
				isUserSelectable: metadata.isUserSelectable ?? true,
				isDefaultForLocation: {},
				...metadata,
			} as ILanguageModelChatMetadata);
		}

		clearModels(): void {
			this.models.clear();
		}

		lookupLanguageModel(id: string): ILanguageModelChatMetadata | undefined {
			return this.models.get(id);
		}

		getLanguageModelIds(): string[] {
			return Array.from(this.models.keys());
		}
	}

	class MockChatSessionsService implements Partial<IChatSessionsService> {
		private readonly _onDidChangeChatSessions = new Emitter<void>();
		readonly onDidChangeChatSessions = this._onDidChangeChatSessions.event;

		getAllChatSessionContributions(): IChatSessionsExtensionPoint[] {
			return [];
		}
	}

	function createMockMode(handoffs: IHandOff[]): IChatMode {
		return {
			id: 'test-mode',
			kind: ChatModeKind.Agent,
			label: constObservable('Test Mode'),
			name: constObservable('Test Mode'),
			icon: constObservable(Codicon.commentDiscussion),
			description: constObservable(''),
			isBuiltin: false,
			handOffs: constObservable(handoffs),
			source: { storage: PromptsStorage.local },
		};
	}

	setup(() => {
		store = new DisposableStore();

		mockLanguageModelsService = new MockLanguageModelsService();
		const mockChatSessionsService = new MockChatSessionsService();
		testConfigurationService = new TestConfigurationService();

		const instaService = workbenchInstantiationService({
			contextKeyService: () => store.add(new ContextKeyService(testConfigurationService)),
		}, store);

		instaService.stub(ILanguageModelsService, mockLanguageModelsService);
		instaService.stub(IChatSessionsService, mockChatSessionsService);
		instaService.stub(IConfigurationService, testConfigurationService);

		store.add(instaService);
		widget = store.add(instaService.createInstance(ChatSuggestNextWidget));
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('Model filtering', () => {

		test('shows handoff when model is not specified', () => {
			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Test Handoff', prompt: 'Test prompt' }
			];
			const mode = createMockMode(handoffs);

			widget.render(mode);

			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible');
			assert.strictEqual(widget.getCurrentMode(), mode, 'Mode should be set');
		});

		test('shows handoff when model exists and isModelAvailable returns true', () => {
			mockLanguageModelsService.registerModel('gpt-4', { name: 'GPT-4', isUserSelectable: true });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Test Handoff', prompt: 'Test prompt', model: 'gpt-4' }
			];
			const mode = createMockMode(handoffs);

			// isModelAvailable callback returns true (simulates modelSupportedForDefaultAgent = yes)
			widget.render(mode, () => true);

			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible');
		});

		test('hides handoff when isModelAvailable returns false (modelSupportedForDefaultAgent = no)', () => {
			mockLanguageModelsService.registerModel('gpt-4', { name: 'GPT-4', isUserSelectable: true });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Test Handoff', prompt: 'Test prompt', model: 'gpt-4' }
			];
			const mode = createMockMode(handoffs);

			// isModelAvailable callback returns false (simulates modelSupportedForDefaultAgent = no)
			widget.render(mode, () => false);

			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden when model not supported');
		});

		test('hides handoff when model does not exist (fallback check)', () => {
			// Don't register any models

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Test Handoff', prompt: 'Test prompt', model: 'non-existent-model' }
			];
			const mode = createMockMode(handoffs);

			// No isModelAvailable callback - falls back to lookupLanguageModel check
			widget.render(mode);

			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden when model not found');
		});

		test('shows some handoffs while filtering others based on model availability', () => {
			mockLanguageModelsService.registerModel('gpt-4', { name: 'GPT-4', isUserSelectable: true });
			mockLanguageModelsService.registerModel('gpt-3.5', { name: 'GPT-3.5', isUserSelectable: true });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Use GPT-4', prompt: 'With GPT-4', model: 'gpt-4' },
				{ agent: 'Default', label: 'Use GPT-3.5', prompt: 'With GPT-3.5', model: 'gpt-3.5' },
				{ agent: 'Default', label: 'No Model', prompt: 'No model specified' }
			];
			const mode = createMockMode(handoffs);

			// Track which models were checked by the callback
			const checkedModels: string[] = [];
			widget.render(mode, (model) => {
				checkedModels.push(model);
				// Only allow gpt-4, not gpt-3.5 (simulates modelSupportedForDefaultAgent being selective)
				return model === 'gpt-4';
			});

			// Widget should be visible because at least one handoff (gpt-4 and no-model) passed the filter
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible');
			// Verify the callback was called for both handoffs with models
			assert.deepStrictEqual(checkedModels.sort(), ['gpt-3.5', 'gpt-4'], 'Callback should be called for handoffs with models');
		});

		test('hides entire widget when all handoffs are filtered out', () => {
			mockLanguageModelsService.registerModel('gpt-4', { name: 'GPT-4', isUserSelectable: true });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Use GPT-4', prompt: 'With GPT-4', model: 'gpt-4' },
				{ agent: 'Default', label: 'Use GPT-3.5', prompt: 'With GPT-3.5', model: 'gpt-3.5' }
			];
			const mode = createMockMode(handoffs);

			// Reject all models
			widget.render(mode, () => false);

			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden when all handoffs filtered');
		});

		test('uses fallback lookup by model name when isModelAvailable not provided', () => {
			mockLanguageModelsService.registerModel('model-id-123', { name: 'GPT-4' });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Test', prompt: 'Test', model: 'model-id-123' }
			];
			const mode = createMockMode(handoffs);

			// No callback - uses basic existence check via lookupLanguageModel
			widget.render(mode);

			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible when model exists');
		});
	});

	suite('isModelAvailable callback scenarios', () => {

		test('callback receives correct model string', () => {
			mockLanguageModelsService.registerModel('my-model', { name: 'My Model' });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Test', prompt: 'Test', model: 'my-model' }
			];
			const mode = createMockMode(handoffs);

			let receivedModel: string | undefined;
			widget.render(mode, (model) => {
				receivedModel = model;
				return true;
			});

			assert.strictEqual(receivedModel, 'my-model', 'Callback should receive the model string from handoff');
		});

		test('callback not called for handoffs without model', () => {
			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Test', prompt: 'Test' }
			];
			const mode = createMockMode(handoffs);

			let callbackCalled = false;
			widget.render(mode, () => {
				callbackCalled = true;
				return true;
			});

			assert.strictEqual(callbackCalled, false, 'Callback should not be called for handoffs without model');
		});
	});

	suite('Setting template syntax resolution', () => {

		test('resolves ${github.copilot.chat.fastImplement} to setting value', async () => {
			// Set the fastImplementModel setting to a specific model
			await testConfigurationService.setUserConfiguration(ChatConfiguration.FastImplementModel, 'gpt-4-turbo');
			mockLanguageModelsService.registerModel('gpt-4-turbo', { name: 'GPT-4 Turbo', isUserSelectable: true });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Fast Implement', prompt: 'Implement quickly', model: '${github.copilot.chat.fastImplement}' }
			];
			const mode = createMockMode(handoffs);

			// isModelAvailable callback checks for the resolved model
			let receivedModel: string | undefined;
			widget.render(mode, (model) => {
				receivedModel = model;
				return true;
			});

			assert.strictEqual(receivedModel, 'gpt-4-turbo', 'Template should resolve to setting value');
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible');
		});

		test('hides handoff when ${github.copilot.chat.fastImplement} setting is empty', async () => {
			// Setting is empty/unset - should hide the handoff
			await testConfigurationService.setUserConfiguration(ChatConfiguration.FastImplementModel, '');

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Fast Implement', prompt: 'Implement quickly', model: '${github.copilot.chat.fastImplement}' }
			];
			const mode = createMockMode(handoffs);

			widget.render(mode, () => true);

			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden when setting is empty');
		});

		test('hides handoff when ${github.copilot.chat.fastImplement} setting is not set', () => {
			// Setting is not set at all (undefined) - should hide the handoff
			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Fast Implement', prompt: 'Implement quickly', model: '${github.copilot.chat.fastImplement}' }
			];
			const mode = createMockMode(handoffs);

			widget.render(mode, () => true);

			assert.strictEqual(widget.domNode.style.display, 'none', 'Widget should be hidden when setting is not set');
		});

		test('resolveModelReference returns undefined for empty setting', async () => {
			await testConfigurationService.setUserConfiguration(ChatConfiguration.FastImplementModel, '');

			const result = widget.resolveModelReference('${github.copilot.chat.fastImplement}');
			assert.strictEqual(result, undefined, 'Should return undefined for empty setting');
		});

		test('resolveModelReference returns literal value for non-template model', () => {
			const result = widget.resolveModelReference('gpt-4');
			assert.strictEqual(result, 'gpt-4', 'Should return literal model string unchanged');
		});

		test('resolveModelReference returns undefined for unknown template', () => {
			const result = widget.resolveModelReference('${unknown.setting}');
			assert.strictEqual(result, undefined, 'Should return undefined for unknown setting template');
		});

		test('shows some handoffs while hiding template handoffs with empty setting', async () => {
			// fastImplementModel setting is empty
			await testConfigurationService.setUserConfiguration(ChatConfiguration.FastImplementModel, '');
			mockLanguageModelsService.registerModel('gpt-4', { name: 'GPT-4', isUserSelectable: true });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Fast Implement', prompt: 'Fast', model: '${github.copilot.chat.fastImplement}' },
				{ agent: 'Default', label: 'Regular GPT-4', prompt: 'With GPT-4', model: 'gpt-4' },
				{ agent: 'Default', label: 'No Model', prompt: 'No model specified' }
			];
			const mode = createMockMode(handoffs);

			widget.render(mode, () => true);

			// Widget should be visible because gpt-4 and no-model handoffs passed
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible');
		});

		test('template syntax works with category grouping', async () => {
			await testConfigurationService.setUserConfiguration(ChatConfiguration.FastImplementModel, 'gpt-4');
			mockLanguageModelsService.registerModel('gpt-4', { name: 'GPT-4', isUserSelectable: true });

			const handoffs: IHandOff[] = [
				{ agent: 'Default', label: 'Fast Implement', prompt: 'Fast', model: '${github.copilot.chat.fastImplement}', category: 'implement' },
				{ agent: 'Default', label: 'Regular Implement', prompt: 'Regular', category: 'implement' }
			];
			const mode = createMockMode(handoffs);

			let receivedModel: string | undefined;
			widget.render(mode, (model) => {
				receivedModel = model;
				return true;
			});

			assert.strictEqual(receivedModel, 'gpt-4', 'Template should resolve even with category');
			assert.notStrictEqual(widget.domNode.style.display, 'none', 'Widget should be visible');
		});
	});
});
