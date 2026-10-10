/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { CompletionTriggerKind, type CompletionContext, type CompletionItemProvider } from '../../../../../editor/common/languages.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ILanguageFeaturesService } from '../../../../../editor/common/services/languageFeatures.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { TestCodeEditorService } from '../../../../../editor/test/browser/editorTestServices.js';
import { instantiateTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestHistoryService } from '../../../../test/common/workbenchTestServices.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { BuiltinDynamicCompletions } from '../../browser/widget/input/editor/chatInputCompletions.js';

class TestChatWidgetService implements IChatWidgetService {
	declare readonly _serviceBrand: undefined;

	readonly onDidAddWidget = Event.None;
	readonly onDidBackgroundSession = Event.None;
	readonly onDidChangeFocusedWidget = Event.None;
	readonly onDidChangeFocusedSession = Event.None;
	readonly lastFocusedWidget = undefined;

	constructor(private readonly widgetByInputUri: Map<string, IChatWidget>) { }

	getWidgetByInputUri(uri: URI): IChatWidget | undefined {
		return this.widgetByInputUri.get(uri.toString());
	}

	getWidgetBySessionResource(): IChatWidget | undefined {
		return undefined;
	}

	getWidgetsByLocations(): ReadonlyArray<IChatWidget> {
		return [];
	}

	getAllWidgets(): ReadonlyArray<IChatWidget> {
		return [];
	}

	reveal(): Promise<boolean> { return Promise.resolve(false); }
	revealWidget(): Promise<IChatWidget | undefined> { return Promise.resolve(undefined); }
	openSession(): Promise<IChatWidget | undefined> { return Promise.resolve(undefined); }
	register(): { dispose(): void } { return { dispose() { } }; }
}

class TestActiveCodeEditorService extends TestCodeEditorService {
	constructor(themeService: ConstructorParameters<typeof TestCodeEditorService>[0], private readonly activeCodeEditor: ICodeEditor) {
		super(themeService);
	}

	override getActiveCodeEditor(): ICodeEditor | null {
		return this.activeCodeEditor;
	}
}

suite('ChatInputCompletions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const store = new DisposableStore();

	teardown(() => {
		store.clear();
	});

	test('boosts the active file when an earlier history entry is filtered out', async () => {
		const filteredResource = URI.from({ scheme: Schemas.vscodeChatEditor, path: '/session' });
		const activeResource = URI.file('/workspace/src/active.ts');
		const otherResource = URI.file('/workspace/src/other.ts');
		const inputUri = URI.from({ scheme: Schemas.vscodeChatInput, path: 'input-1' });

		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IHistoryService, new class extends TestHistoryService {
			override getHistory() {
				return [
					{ resource: filteredResource },
					{ resource: activeResource },
					{ resource: otherResource },
				];
			}
		}());
		instantiationService.stub(IChatSessionsService, {
			_serviceBrand: undefined,
			getContentProviderSchemes: () => [],
		} as unknown as IChatSessionsService);
		instantiationService.stub(IEditorService, {
			_serviceBrand: undefined,
			getVisibleTextEditorControls: () => [],
		} as unknown as IEditorService);
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService(new Map()));

		const modelService = instantiationService.get(IModelService);
		const activeModel = store.add(modelService.createModel('', null, activeResource, false));
		const inputModel = store.add(modelService.createModel('#', null, inputUri, false));
		const activeEditor = {
			getModel: () => activeModel,
		} as unknown as ICodeEditor;
		const codeEditorService = new TestActiveCodeEditorService(instantiationService.get(IThemeService), activeEditor);
		instantiationService.stub(ICodeEditorService, store.add(codeEditorService));

		const widget: IChatWidget = {
			supportsFileReferences: true,
			lockedAgentId: undefined,
			location: ChatAgentLocation.Chat,
			input: { currentModeKind: ChatModeKind.Ask } as IChatWidget['input'],
			attachmentModel: { fileAttachments: [] } as unknown as IChatWidget['attachmentModel'],
		} as IChatWidget;
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService(new Map([[inputUri.toString(), widget]])));

		store.add(instantiationService.createInstance(BuiltinDynamicCompletions));

		const provider = instantiationService.get(ILanguageFeaturesService).completionProvider.all(inputModel)
			.find(candidate => (candidate as CompletionItemProvider)._debugDisplayName === 'chatVarCompletions-fileAndFolder');
		if (!provider) {
			assert.fail('chatVarCompletions-fileAndFolder provider not found');
		}

		const context: CompletionContext = { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '#' };
		const result = await provider.provideCompletionItems(inputModel, new Position(1, 2), context, CancellationToken.None);
		assert.ok(result && hasKey(result, { suggestions: true }));

		assert.deepStrictEqual(result.suggestions.map(item => ({
			label: typeof item.label === 'string' ? item.label : item.label.label,
			sortText: item.sortText,
		})), [
			{ label: 'active.ts', sortText: ' ' },
			{ label: 'other.ts', sortText: '!' },
		]);

		const activeItem = result.suggestions[0];
		assert.strictEqual(typeof activeItem.label === 'string' ? undefined : activeItem.label.description?.includes('Active file'), true);
	});

	test('keeps the leader at the front of file filterText', async () => {
		const activeResource = URI.file('/workspace/src/active.ts');
		const inputUri = URI.from({ scheme: Schemas.vscodeChatInput, path: 'input-2' });

		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IHistoryService, new class extends TestHistoryService {
			override getHistory() {
				return [
					{ resource: activeResource },
				];
			}
		}());
		instantiationService.stub(IChatSessionsService, {
			_serviceBrand: undefined,
			getContentProviderSchemes: () => [],
		} as unknown as IChatSessionsService);
		instantiationService.stub(IEditorService, {
			_serviceBrand: undefined,
			getVisibleTextEditorControls: () => [],
		} as unknown as IEditorService);
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService(new Map()));

		const modelService = instantiationService.get(IModelService);
		const activeModel = store.add(modelService.createModel('', null, activeResource, false));
		const inputModel = store.add(modelService.createModel('#', null, inputUri, false));
		const activeEditor = {
			getModel: () => activeModel,
		} as unknown as ICodeEditor;
		const codeEditorService = new TestActiveCodeEditorService(instantiationService.get(IThemeService), activeEditor);
		instantiationService.stub(ICodeEditorService, store.add(codeEditorService));

		const widget: IChatWidget = {
			supportsFileReferences: true,
			lockedAgentId: undefined,
			location: ChatAgentLocation.Chat,
			input: { currentModeKind: ChatModeKind.Ask } as IChatWidget['input'],
			attachmentModel: { fileAttachments: [] } as unknown as IChatWidget['attachmentModel'],
		} as IChatWidget;
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService(new Map([[inputUri.toString(), widget]])));

		store.add(instantiationService.createInstance(BuiltinDynamicCompletions));

		const provider = instantiationService.get(ILanguageFeaturesService).completionProvider.all(inputModel)
			.find(candidate => (candidate as CompletionItemProvider)._debugDisplayName === 'chatVarCompletions-fileAndFolder');
		if (!provider) {
			assert.fail('chatVarCompletions-fileAndFolder provider not found');
		}

		const context: CompletionContext = { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '#' };
		const result = await provider.provideCompletionItems(inputModel, new Position(1, 2), context, CancellationToken.None);
		assert.ok(result && hasKey(result, { suggestions: true }));

		const activeItem = result.suggestions[0];
		assert.match(activeItem.filterText ?? '', /^#active\.ts active\.ts .*active\.ts$/);
	});

	test('uses the visible file editor when the focused editor is the chat input', async () => {
		const activeResource = URI.file('/workspace/src/active.ts');
		const otherResource = URI.file('/workspace/src/other.ts');
		const inputUri = URI.from({ scheme: Schemas.vscodeChatInput, path: 'input-3' });

		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(IHistoryService, new class extends TestHistoryService {
			override getHistory() {
				return [
					{ resource: otherResource },
					{ resource: activeResource },
				];
			}
		}());
		instantiationService.stub(IChatSessionsService, {
			_serviceBrand: undefined,
			getContentProviderSchemes: () => [Schemas.vscodeChatInput],
		} as unknown as IChatSessionsService);

		const modelService = instantiationService.get(IModelService);
		const activeModel = store.add(modelService.createModel('', null, activeResource, false));
		const inputModel = store.add(modelService.createModel('#', null, inputUri, false));
		const chatInputEditor = store.add(instantiateTestCodeEditor(instantiationService, inputModel));
		const visibleFileEditor = store.add(instantiateTestCodeEditor(instantiationService, activeModel));
		const codeEditorService = new TestActiveCodeEditorService(instantiationService.get(IThemeService), chatInputEditor);
		instantiationService.stub(ICodeEditorService, store.add(codeEditorService));
		instantiationService.stub(IEditorService, {
			_serviceBrand: undefined,
			getVisibleTextEditorControls: () => [visibleFileEditor],
		} as unknown as IEditorService);

		const widget: IChatWidget = {
			supportsFileReferences: true,
			lockedAgentId: undefined,
			location: ChatAgentLocation.Chat,
			input: { currentModeKind: ChatModeKind.Ask } as IChatWidget['input'],
			attachmentModel: { fileAttachments: [] } as unknown as IChatWidget['attachmentModel'],
		} as IChatWidget;
		instantiationService.stub(IChatWidgetService, new TestChatWidgetService(new Map([[inputUri.toString(), widget]])));

		store.add(instantiationService.createInstance(BuiltinDynamicCompletions));

		const provider = instantiationService.get(ILanguageFeaturesService).completionProvider.all(inputModel)
			.find(candidate => (candidate as CompletionItemProvider)._debugDisplayName === 'chatVarCompletions-fileAndFolder');
		if (!provider) {
			assert.fail('chatVarCompletions-fileAndFolder provider not found');
		}

		const context: CompletionContext = { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '#' };
		const result = await provider.provideCompletionItems(inputModel, new Position(1, 2), context, CancellationToken.None);
		assert.ok(result && hasKey(result, { suggestions: true }));

		assert.deepStrictEqual(result.suggestions.map(item => ({
			label: typeof item.label === 'string' ? item.label : item.label.label,
			sortText: item.sortText,
		})), [
			{ label: 'other.ts', sortText: '!' },
			{ label: 'active.ts', sortText: ' ' },
		]);

		const activeItem = result.suggestions.find(item => (typeof item.label === 'string' ? item.label : item.label.label) === 'active.ts');
		assert.ok(activeItem);
		assert.strictEqual(typeof activeItem.label === 'string' ? undefined : activeItem.label.description?.includes('Active file'), true);
	});
});
