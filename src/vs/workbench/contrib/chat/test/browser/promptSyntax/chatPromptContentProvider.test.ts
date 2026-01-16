/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILanguageService, ILanguageSelection } from '../../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ChatPromptContentProvider } from '../../../browser/promptSyntax/chatPromptContentProvider.js';
import { ChatPromptContentStore, IChatPromptContentStore } from '../../../common/promptSyntax/chatPromptContentStore.js';
import { PROMPT_LANGUAGE_ID } from '../../../common/promptSyntax/promptTypes.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';

suite('ChatPromptContentProvider', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let contentStore: ChatPromptContentStore;
	let mockModelService: MockModelService;
	let mockLanguageService: MockLanguageService;
	let mockTextModelService: MockTextModelService;
	let contentProvider: ChatPromptContentProvider;

	class MockLanguageSelection implements ILanguageSelection {
		readonly languageId = PROMPT_LANGUAGE_ID;
		readonly onDidChange = testDisposables.add(new (class extends Disposable { readonly event = () => ({ dispose: () => { } }); })()).event;
	}

	class MockLanguageService {
		createById(languageId: string): ILanguageSelection {
			return new MockLanguageSelection();
		}
	}

	class MockTextModel implements Partial<ITextModel> {
		constructor(
			readonly uri: URI,
			readonly content: string,
			readonly languageId: string
		) { }

		getValue(): string {
			return this.content;
		}

		getLanguageId(): string {
			return this.languageId;
		}
	}

	class MockModelService {
		private models = new Map<string, ITextModel>();

		getModel(resource: URI): ITextModel | null {
			return this.models.get(resource.toString()) ?? null;
		}

		createModel(content: string, languageSelection: ILanguageSelection, resource: URI): ITextModel {
			const model = new MockTextModel(resource, content, languageSelection.languageId) as unknown as ITextModel;
			this.models.set(resource.toString(), model);
			return model;
		}

		setExistingModel(uri: URI, model: ITextModel): void {
			this.models.set(uri.toString(), model);
		}

		clear(): void {
			this.models.clear();
		}
	}

	class MockTextModelService {
		private providers = new Map<string, { provideTextContent: (resource: URI) => Promise<ITextModel | null> }>();

		registerTextModelContentProvider(scheme: string, provider: { provideTextContent: (resource: URI) => Promise<ITextModel | null> }): IDisposable {
			this.providers.set(scheme, provider);
			return { dispose: () => this.providers.delete(scheme) };
		}

		getProvider(scheme: string) {
			return this.providers.get(scheme);
		}
	}

	setup(() => {
		instantiationService = testDisposables.add(new TestInstantiationService());

		contentStore = testDisposables.add(new ChatPromptContentStore());
		mockModelService = new MockModelService();
		mockLanguageService = new MockLanguageService();
		mockTextModelService = new MockTextModelService();

		instantiationService.stub(IChatPromptContentStore, contentStore);
		instantiationService.stub(IModelService, mockModelService);
		instantiationService.stub(ILanguageService, mockLanguageService as unknown as ILanguageService);
		instantiationService.stub(ITextModelService, mockTextModelService as unknown as ITextModelService);

		contentProvider = testDisposables.add(instantiationService.createInstance(ChatPromptContentProvider));
	});

	teardown(() => {
		mockModelService.clear();
	});

	test('registers as content provider for vscode-chat-prompt scheme', () => {
		const provider = mockTextModelService.getProvider(Schemas.vscodeChatPrompt);
		assert.ok(provider, 'Provider should be registered for vscode-chat-prompt scheme');
	});

	test('provideTextContent creates model from stored content', async () => {
		const uri = URI.parse('vscode-chat-prompt:/.agent.md/test-agent');
		const content = '# Test Agent\nThis is the agent content.';

		testDisposables.add(contentStore.registerContent(uri, content));

		const model = await contentProvider.provideTextContent(uri);

		assert.ok(model, 'Model should be created');
		assert.strictEqual((model as unknown as MockTextModel).getValue(), content);
		assert.strictEqual((model as unknown as MockTextModel).getLanguageId(), PROMPT_LANGUAGE_ID);
	});

	test('provideTextContent returns existing model if available', async () => {
		const uri = URI.parse('vscode-chat-prompt:/.prompt.md/existing');
		const existingContent = 'Existing model content';

		const existingModel = new MockTextModel(uri, existingContent, PROMPT_LANGUAGE_ID) as unknown as ITextModel;
		mockModelService.setExistingModel(uri, existingModel);

		const model = await contentProvider.provideTextContent(uri);

		assert.strictEqual(model, existingModel, 'Should return existing model');
	});

	test('provideTextContent creates model with empty content when URI has no stored content', async () => {
		const uri = URI.parse('vscode-chat-prompt:/.instructions.md/missing');

		const model = await contentProvider.provideTextContent(uri);

		assert.ok(model, 'Model should be created even without stored content');
		assert.strictEqual((model as unknown as MockTextModel).getValue(), '');
	});

	test('provideTextContent uses prompt language ID', async () => {
		const uri = URI.parse('vscode-chat-prompt:/.agent.md/language-test');
		const content = 'Test content';

		testDisposables.add(contentStore.registerContent(uri, content));

		const model = await contentProvider.provideTextContent(uri);

		assert.ok(model);
		assert.strictEqual((model as unknown as MockTextModel).getLanguageId(), PROMPT_LANGUAGE_ID);
	});

	test('handles multiple sequential requests for different URIs', async () => {
		const uri1 = URI.parse('vscode-chat-prompt:/.agent.md/agent-1');
		const uri2 = URI.parse('vscode-chat-prompt:/.instructions.md/instructions-1');
		const uri3 = URI.parse('vscode-chat-prompt:/.prompt.md/prompt-1');

		const content1 = 'Agent content';
		const content2 = 'Instructions content';
		const content3 = 'Prompt content';

		testDisposables.add(contentStore.registerContent(uri1, content1));
		testDisposables.add(contentStore.registerContent(uri2, content2));
		testDisposables.add(contentStore.registerContent(uri3, content3));

		const model1 = await contentProvider.provideTextContent(uri1);
		const model2 = await contentProvider.provideTextContent(uri2);
		const model3 = await contentProvider.provideTextContent(uri3);

		assert.strictEqual((model1 as unknown as MockTextModel).getValue(), content1);
		assert.strictEqual((model2 as unknown as MockTextModel).getValue(), content2);
		assert.strictEqual((model3 as unknown as MockTextModel).getValue(), content3);
	});

	test('content with special characters is handled correctly', async () => {
		const uri = URI.parse('vscode-chat-prompt:/.prompt.md/special');
		const content = '# Unicode Test\n\n日本語テスト 🎉\n\n```typescript\nconst x = "hello";\n```';

		testDisposables.add(contentStore.registerContent(uri, content));

		const model = await contentProvider.provideTextContent(uri);

		assert.ok(model);
		assert.strictEqual((model as unknown as MockTextModel).getValue(), content);
	});

	test('disposed content results in empty model', async () => {
		const uri = URI.parse('vscode-chat-prompt:/.agent.md/disposed-test');
		const content = 'Content that will be disposed';

		const registration = contentStore.registerContent(uri, content);

		// Verify content exists
		const model1 = await contentProvider.provideTextContent(uri);
		assert.strictEqual((model1 as unknown as MockTextModel).getValue(), content);

		// Clear the model cache and dispose the content
		mockModelService.clear();
		registration.dispose();

		// Now requesting should return model with empty content
		const model2 = await contentProvider.provideTextContent(uri);
		assert.strictEqual((model2 as unknown as MockTextModel).getValue(), '');
	});
});
