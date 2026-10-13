/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { fuzzyScore, FuzzyScoreOptions } from '../../../../../../../../base/common/filters.js';
import { DisposableStore, IDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../../../base/common/network.js';
import { upcastDeepPartial, upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { EditorOptions } from '../../../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../../../editor/common/core/ranges/offsetRange.js';
import { Selection } from '../../../../../../../../editor/common/core/selection.js';
import { IDecorationOptions } from '../../../../../../../../editor/common/editorCommon.js';
import { CompletionItem, CompletionItemKind, CompletionTriggerKind } from '../../../../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../../../../editor/common/model.js';
import { LanguageFeaturesService } from '../../../../../../../../editor/common/services/languageFeaturesService.js';
import { CompletionModel } from '../../../../../../../../editor/contrib/suggest/browser/completionModel.js';
import { CompletionItem as SuggestCompletionItem } from '../../../../../../../../editor/contrib/suggest/browser/suggest.js';
import { WordDistance } from '../../../../../../../../editor/contrib/suggest/browser/wordDistance.js';
import { withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { CommandsRegistry } from '../../../../../../../../platform/commands/common/commands.js';
import { createTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../../../platform/log/common/log.js';
import { ChatSubmitAction } from '../../../../../browser/actions/chatExecuteActions.js';
import { IChatWidget, IChatWidgetService } from '../../../../../browser/chat.js';
import { ChatWidget } from '../../../../../browser/widget/chatWidget.js';
import { AgentHostInputCompletionsBase } from '../../../../../browser/widget/input/editor/agentHostInputCompletionsBase.js';
import { AgentHostInputCompletions } from '../../../../../browser/widget/input/editor/agentHostInputCompletions.js';
import { AgentCompletions, SlashCommandCompletions } from '../../../../../browser/widget/input/editor/chatInputCompletions.js';
import { InputEditorCommandArgumentHint } from '../../../../../browser/widget/input/editor/chatInputCommandArgumentHint.js';
import { createChatReferenceVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { attachedContextCompletionAdditionalTriggerCharacters, attachedContextCompletionSortText, computeCompletionRanges, escapeForCharClass, getAttachedContextCompletionMatch, getAttachedContextCompletionSortText, getCompletionRangeWord, getPromptSlashCommandFilterText, isAtTriggerCharacterToken } from '../../../../../browser/widget/input/editor/chatInputCompletionUtils.js';
import { IChatInputCompletionItem, IChatInputCompletionsParams, IChatInputCompletionsResult, IChatSession, IChatSessionsService } from '../../../../../common/chatSessionsService.js';
import { IChatService } from '../../../../../common/chatService/chatService.js';
import { ICustomizationHarnessService } from '../../../../../common/customizationHarnessService.js';
import { IChatSlashCommandService, IChatSlashData } from '../../../../../common/participants/chatSlashCommands.js';
import { IMcpService } from '../../../../../../mcp/common/mcpTypes.js';
import { ChatRequestAgentPart, ChatRequestTextPart, chatAgentLeader, chatVariableLeader } from '../../../../../common/requestParser/chatParserTypes.js';
import { MockChatSessionsService } from '../../../../common/mockChatSessionsService.js';
import { MockChatWidgetService } from '../../../widget/mockChatWidget.js';
import { ChatAgentLocation, ChatModeKind } from '../../../../../common/constants.js';
import { IChatAgentData, IChatAgentNameService, IChatAgentService } from '../../../../../common/participants/chatAgents.js';
import { ChatViewModel, IChatViewModel } from '../../../../../common/model/chatViewModel.js';
import { IChatModel } from '../../../../../common/model/chatModel.js';
import { ChatInputPart } from '../../../../../browser/widget/input/chatInputPart.js';
import { MockContextKeyService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IAgentHostConnectionsService } from '../../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IsSessionsWindowContext } from '../../../../../../../common/contextkeys.js';

suite('AgentCompletions in agent-host chats', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('offers extension participants and their commands in a locked agent-host chat without offering core or session participants', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const model = store.add(createTextModel('@', null, undefined, URI.from({ scheme: Schemas.vscodeChatInput, path: '/test' })));
		const widget = upcastPartial<IChatWidget>({
			location: ChatAgentLocation.Chat,
			lockedAgentId: 'agent-host-copilotcli',
			viewModel: upcastPartial<ChatViewModel>({ model: upcastPartial<IChatModel>({ sessionResource: URI.parse('agent-host-copilotcli:/test') }) }),
			input: upcastPartial<ChatInputPart>({ currentModeKind: ChatModeKind.Agent }),
			scopedContextKeyService: store.add(new MockContextKeyService()),
		});
		const widgetService = new MockChatWidgetService();
		widgetService.getWidgetByInputUri = () => widget;
		const agents = [
			{ id: 'participant', name: 'participant', slashCommands: [{ name: 'explain', description: 'Explain' }] },
			{ id: 'core', name: 'core', isCore: true, slashCommands: [] },
			{ id: 'default', name: 'default', isDefault: true, slashCommands: [] },
			{ id: 'session', name: 'session', slashCommands: [] },
		].map(agent => upcastPartial<IChatAgentData>({ ...agent, locations: [ChatAgentLocation.Chat, ChatAgentLocation.EditorInline, ChatAgentLocation.Terminal] }));
		store.add(new AgentCompletions(
			languageFeaturesService,
			widgetService,
			upcastPartial<IChatAgentService>({ getAgents: () => agents, agentHasDupeName: () => false }),
			upcastPartial<IChatAgentNameService>({ getAgentNameRestriction: () => true }),
			upcastPartial<IChatSessionsService>({ getAllChatSessionContributions: () => [upcastPartial<ReturnType<IChatSessionsService['getAllChatSessionContributions']>[number]>({ type: 'session' })] }),
		));
		const provider = languageFeaturesService.completionProvider.ordered(model).find(provider => provider._debugDisplayName === 'chatAgentAndSubcommand' && provider.triggerCharacters?.includes('@'))!;

		const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None);
		IsSessionsWindowContext.bindTo(widget.scopedContextKeyService).set(true);
		const sessionsWindowResult = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None);
		IsSessionsWindowContext.bindTo(widget.scopedContextKeyService).set(false);
		const otherLocations = [];
		for (const location of [ChatAgentLocation.EditorInline, ChatAgentLocation.Terminal]) {
			widgetService.getWidgetByInputUri = () => ({ ...widget, location });
			otherLocations.push(await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None));
		}

		assert.deepStrictEqual({ suggestions: result?.suggestions.map(item => item.insertText), sessionsWindowResult, otherLocations }, { suggestions: ['@participant ', '@participant /explain '], sessionsWindowResult: undefined, otherLocations: [undefined, undefined] });
	});

	for (const sessionType of ['agent-host-copilotcli', 'remote-agent-host-test']) {
		test(`offers slash commands for the explicitly selected extension participant instead of the locked host (${sessionType})`, async () => {
			const languageFeaturesService = new LanguageFeaturesService();
			const model = store.add(createTextModel('@participant /', null, undefined, URI.from({ scheme: Schemas.vscodeChatInput, path: '/test' })));
			const participant = upcastPartial<IChatAgentData>({ id: 'participant', name: 'participant', slashCommands: [{ name: 'explain', description: 'Explain' }] });
			const host = upcastPartial<IChatAgentData>({ id: sessionType, name: 'host', isCore: true, slashCommands: [{ name: 'host-command', description: 'Host command' }] });
			const scopedContextKeyService = store.add(new MockContextKeyService());
			const widget = upcastPartial<IChatWidget>({
				location: ChatAgentLocation.Chat,
				lockedAgentId: host.id,
				viewModel: upcastPartial<ChatViewModel>({ model: upcastPartial<IChatModel>({ sessionResource: URI.from({ scheme: sessionType, path: '/test' }) }) }),
				parsedInput: {
					text: model.getValue(), parts: [
						new ChatRequestAgentPart(new OffsetRange(0, 12), new Range(1, 1, 1, 13), participant),
						new ChatRequestTextPart(new OffsetRange(12, 14), new Range(1, 13, 1, 15), ' /'),
					]
				},
				scopedContextKeyService,
			});
			const widgetService = new MockChatWidgetService();
			widgetService.getWidgetByInputUri = () => widget;
			let contributedSession = false;
			store.add(new AgentCompletions(
				languageFeaturesService,
				widgetService,
				upcastPartial<IChatAgentService>({ getAgent: () => host }),
				upcastPartial<IChatAgentNameService>({}),
				upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => contributedSession ? upcastPartial<NonNullable<ReturnType<IChatSessionsService['getChatSessionContribution']>>>({ type: participant.id }) : undefined }),
			));
			const provider = languageFeaturesService.completionProvider.ordered(model).find(provider => provider._debugDisplayName === 'chatAgentSubcommand')!;
			const complete = () => provider.provideCompletionItems(model, new Position(1, 15), { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '/' }, CancellationToken.None);

			const result = await complete();
			IsSessionsWindowContext.bindTo(scopedContextKeyService).set(true);
			const sessionsWindow = await complete();
			IsSessionsWindowContext.bindTo(scopedContextKeyService).set(false);
			contributedSession = true;
			const sessionParticipant = await complete();
			contributedSession = false;
			widgetService.getWidgetByInputUri = () => ({ ...widget, parsedInput: { text: '/', parts: [] } });
			const withoutParticipant = await complete();
			widgetService.getWidgetByInputUri = () => ({
				...widget, parsedInput: {
					text: model.getValue(), parts: [
						new ChatRequestAgentPart(new OffsetRange(0, 12), new Range(1, 1, 1, 13), host),
					]
				}
			});
			const coreParticipant = await complete();
			widgetService.getWidgetByInputUri = () => ({
				...widget, parsedInput: {
					text: model.getValue(), parts: [
						new ChatRequestAgentPart(new OffsetRange(0, 12), new Range(1, 1, 1, 13), { ...participant, isDefault: true }),
					]
				}
			});
			const defaultParticipant = await complete();
			widgetService.getWidgetByInputUri = () => ({ ...widget, location: ChatAgentLocation.EditorInline });
			const inline = await complete();
			widgetService.getWidgetByInputUri = () => ({ ...widget, location: ChatAgentLocation.Terminal });
			const shell = await complete();

			assert.deepStrictEqual({ suggestions: result?.suggestions.map(item => item.insertText), sessionsWindow, sessionParticipant, withoutParticipant, coreParticipant, defaultParticipant, inline, shell }, {
				suggestions: ['/explain '], sessionsWindow: undefined, sessionParticipant: undefined, withoutParticipant: undefined, coreParticipant: undefined, defaultParticipant: undefined, inline: undefined, shell: undefined,
			});
		});
	}
});

class TestChatSessionsService extends MockChatSessionsService {
	constructor(private readonly insertText = '#roadmap.md') {
		super();
	}

	override async provideChatInputCompletions(_sessionResource: URI, _params: IChatInputCompletionsParams, _token: CancellationToken): Promise<IChatInputCompletionsResult> {
		return {
			items: [{
				insertText: this.insertText,
				start: { lineNumber: 1, column: 1 },
				end: { lineNumber: 1, column: 2 },
				attachment: {
					kind: 'resource',
					uri: URI.file('/workspace/roadmap.md'),
				},
			}],
		};
	}
}

class OrderedTestChatSessionsService extends MockChatSessionsService {
	override async provideChatInputCompletions(_sessionResource: URI, _params: IChatInputCompletionsParams, _token: CancellationToken): Promise<IChatInputCompletionsResult> {
		return {
			items: [
				{
					insertText: '#z-index.ts',
					start: { lineNumber: 1, column: 1 },
					end: { lineNumber: 1, column: 11 },
					attachment: { kind: 'resource', uri: URI.file('/long/workspace/src/index.ts') },
				},
				{
					insertText: '#a-index.ts',
					start: { lineNumber: 1, column: 1 },
					end: { lineNumber: 1, column: 11 },
					attachment: { kind: 'resource', uri: URI.file('/src/index.ts') },
				},
			],
		};
	}
}

class TestAgentHostInputCompletions extends AgentHostInputCompletionsBase<void> {
	constructor(
		languageFeaturesService: LanguageFeaturesService,
		chatSessionsService: IChatSessionsService,
		private readonly _completionKind = CompletionItemKind.File,
		private readonly _triggerCharacters: readonly string[] = ['#'],
	) {
		super(languageFeaturesService, chatSessionsService);
	}

	register(): IDisposable {
		return this._registerProvider({ scheme: 'test' }, 'testAgentHostInputCompletions', this._triggerCharacters, undefined);
	}

	protected override _resolveContext(_model: ITextModel): { sessionResource: URI; context: void } {
		return { sessionResource: URI.parse('test:session'), context: undefined };
	}

	protected override _buildItem(position: Position, item: IChatInputCompletionItem): CompletionItem {
		return {
			label: item.insertText,
			insertText: item.insertText,
			filterText: this._completionKind === CompletionItemKind.Text ? item.insertText : undefined,
			range: Range.fromPositions(position),
			kind: this._completionKind,
		};
	}
}

suite('AgentHostInputCompletionsBase', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('marks results incomplete so the host is queried as the token changes', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService()));
		store.add(completions.register());
		const model = store.add(createTextModel('#', null, undefined, URI.parse('test:input')));
		const provider = languageFeaturesService.completionProvider.ordered(model)[0];

		const result = await provider.provideCompletionItems(model, new Position(1, 2), { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: '#' }, CancellationToken.None);

		assert.deepStrictEqual(result, {
			suggestions: [{
				label: '#roadmap.md',
				insertText: '#roadmap.md',
				filterText: '#',
				sortText: '000000',
				range: new Range(1, 2, 1, 2),
				kind: CompletionItemKind.File,
			}],
			incomplete: true,
		});
	});

	test('preserves slash command filter text so Monaco can fuzzy rank it', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService('/vscode-pet'), CompletionItemKind.Text, ['/']));
		store.add(completions.register());
		const model = store.add(createTextModel('/pet', null, undefined, URI.parse('test:input')));
		const provider = languageFeaturesService.completionProvider.ordered(model)[0];

		const result = await provider.provideCompletionItems(model, new Position(1, 5), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None);

		assert.deepStrictEqual(result, {
			suggestions: [{
				label: '/vscode-pet',
				insertText: '/vscode-pet',
				filterText: '/vscode-pet',
				sortText: '000000',
				range: new Range(1, 5, 1, 5),
				kind: CompletionItemKind.Text,
			}],
			incomplete: true,
		});
	});

	test('requests nested slash command completions after a space', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new TestChatSessionsService('server-name'), CompletionItemKind.Text, ['/', ' ']));
		store.add(completions.register());
		const model = store.add(createTextModel('/mcp enable ', null, undefined, URI.parse('test:input')));
		const provider = languageFeaturesService.completionProvider.ordered(model)[0];

		const result = await provider.provideCompletionItems(model, new Position(1, 13), { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: ' ' }, CancellationToken.None);

		assert.deepStrictEqual(result, {
			suggestions: [{
				label: 'server-name',
				insertText: 'server-name',
				filterText: 'server-name',
				sortText: '000000',
				range: new Range(1, 13, 1, 13),
				kind: CompletionItemKind.Text,
			}],
			incomplete: true,
		});
	});

	test('uses a common current-token filter score to preserve host order', async () => {
		const languageFeaturesService = new LanguageFeaturesService();
		const completions = store.add(new TestAgentHostInputCompletions(languageFeaturesService, new OrderedTestChatSessionsService()));
		store.add(completions.register());
		const model = store.add(createTextModel('#src/index', null, undefined, URI.parse('test:input')));
		const provider = languageFeaturesService.completionProvider.ordered(model)[0];

		const result = await provider.provideCompletionItems(model, new Position(1, 11), { triggerKind: CompletionTriggerKind.Invoke }, CancellationToken.None);

		assert.deepStrictEqual(result?.suggestions.map(item => ({
			label: item.label,
			filterText: item.filterText,
			sortText: item.sortText,
		})), [
			{ label: '#z-index.ts', filterText: '#src/index', sortText: '000000' },
			{ label: '#a-index.ts', filterText: '#src/index', sortText: '000001' },
		]);
	});
});

/**
 * Test double exposing the protected {@link AgentHostInputCompletions._buildItem}
 * so the accepted-range invariant can be asserted directly.
 */
class TestableAgentHostInputCompletions extends AgentHostInputCompletions {
	buildItem(position: Position, item: IChatInputCompletionItem, widget: IChatWidget): CompletionItem | undefined {
		return this._buildItem(position, item, widget);
	}
}

suite('AgentHostInputCompletions #chat references', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('accepting a multi-word #chat reference registers a range covering the whole token', () => {
		const completions = store.add(new TestableAgentHostInputCompletions(
			new LanguageFeaturesService(),
			new MockChatWidgetService(),
			new TestChatSessionsService(),
			new TestConfigurationService(),
			upcastPartial<IAgentHostConnectionsService>({ resolveSessionResource: () => undefined }),
			upcastPartial<IAgentHostUntitledProvisionalSessionService>({ get: () => undefined }),
		));
		const widget = upcastPartial<IChatWidget>({});
		// The completion carries the opaque backend chat URI, stored verbatim on
		// the accepted reference entry.
		const chatResource = URI.parse('ahp-chat://chat-2/base64session');

		// The host inserts `#chat:<title> ` (trailing space) spanning columns 1..19.
		const built = completions.buildItem(new Position(1, 19), {
			insertText: '#chat:Design chat ',
			start: { lineNumber: 1, column: 1 },
			end: { lineNumber: 1, column: 19 },
			attachment: {
				kind: 'chat',
				uri: chatResource,
				endTurn: 'turn-5',
				title: 'Design chat',
			},
		}, widget);

		const argument = built?.command?.arguments?.[0] as { id: string; range: Range } | undefined;
		assert.deepStrictEqual({ id: argument?.id, range: argument?.range }, {
			// Stable dynamic-variable id, so the parser treats the reference as one part.
			id: createChatReferenceVariableEntry(chatResource, 'turn-5', 'Design chat').id,
			// Covers `#chat:Design chat` (columns 1..18, end-exclusive) — the whole
			// token minus the trailing space, never a partial slice.
			range: new Range(1, 1, 1, 18),
		});
	});
});

suite('AgentHostInputCompletions plain text', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('builds a Monaco text completion without an accept command', () => {
		const completions = store.add(new TestableAgentHostInputCompletions(
			new LanguageFeaturesService(),
			new MockChatWidgetService(),
			new TestChatSessionsService(),
			new TestConfigurationService(),
			upcastPartial<IAgentHostConnectionsService>({ resolveSessionResource: () => undefined }),
			upcastPartial<IAgentHostUntitledProvisionalSessionService>({ get: () => undefined }),
		));

		const built = completions.buildItem(new Position(1, 13), {
			insertText: 'microsoft/playwright-mcp',
			start: { lineNumber: 1, column: 13 },
			end: { lineNumber: 1, column: 13 },
			attachment: { kind: 'text' },
		}, upcastPartial<IChatWidget>({}));

		assert.deepStrictEqual(built, {
			label: 'microsoft/playwright-mcp',
			insertText: 'microsoft/playwright-mcp',
			filterText: 'microsoft/playwright-mcp',
			range: {
				insert: new Range(1, 13, 1, 13),
				replace: new Range(1, 13, 1, 13),
			},
			kind: CompletionItemKind.Text,
		});
	});

	test('preserves slash command labels that differ only by an acceptance space', () => {
		const completions = store.add(new TestableAgentHostInputCompletions(
			new LanguageFeaturesService(),
			new MockChatWidgetService(),
			new TestChatSessionsService(),
			new TestConfigurationService(),
			upcastPartial<IAgentHostConnectionsService>({ resolveSessionResource: () => undefined }),
			upcastPartial<IAgentHostUntitledProvisionalSessionService>({ get: () => undefined }),
		));
		const results = ['/review', '/review '].map(label => {
			const built = completions.buildItem(new Position(1, 2), {
				insertText: '/review ',
				label,
				attachment: { kind: 'text' },
			}, upcastPartial<IChatWidget>({}));
			return {
				label: built?.label,
				insertText: built?.insertText,
				filterText: built?.filterText,
			};
		});

		assert.deepStrictEqual(results, [
			{ label: '/review', insertText: '/review ', filterText: '/review ' },
			{ label: '/review ', insertText: '/review ', filterText: '/review ' },
		]);
	});

	test('keeps plain-text slash commands visible when the host labels them with descriptions', () => {
		const completions = store.add(new TestableAgentHostInputCompletions(
			new LanguageFeaturesService(),
			new MockChatWidgetService(),
			new TestChatSessionsService(),
			new TestConfigurationService(),
			upcastPartial<IAgentHostConnectionsService>({ resolveSessionResource: () => undefined }),
			upcastPartial<IAgentHostUntitledProvisionalSessionService>({ get: () => undefined }),
		));
		const results = ['/', '/rev'].map(text => {
			const position = new Position(1, text.length + 1);
			const built = completions.buildItem(position, {
				insertText: '/review ',
				label: 'Review the workspace',
				start: { lineNumber: 1, column: 1 },
				end: position,
				attachment: { kind: 'text' },
			}, upcastPartial<IChatWidget>({}))!;
			const list = { suggestions: [built] };
			const provider = { _debugDisplayName: 'testPlainTextSlashCommands', provideCompletionItems: () => list };
			const model = new CompletionModel(
				[new SuggestCompletionItem(position, built, list, provider)],
				position.column,
				{ leadingLineContent: text, characterCountDelta: 0 },
				WordDistance.None,
				EditorOptions.suggest.defaultValue,
				EditorOptions.snippetSuggestions.defaultValue,
				undefined,
			);
			return model.items.map(item => ({
				label: item.completion.label,
				insertText: item.completion.insertText,
				filterText: item.completion.filterText,
				command: item.completion.command,
			}));
		});

		const expected = [{
			label: { label: '/review', description: 'Review the workspace' },
			insertText: '/review ',
			filterText: '/review ',
			command: undefined,
		}];
		assert.deepStrictEqual(results, [expected, expected]);
	});
});

suite('SlashCommandCompletions fork variants', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	class ForkCompletionChatSessionsService extends MockChatSessionsService {
		lookupCount = 0;
		lastToken: CancellationToken | undefined;

		constructor(
			private readonly supportsFork: boolean,
			private readonly lookupError?: Error,
		) {
			super();
		}

		override async getOrCreateChatSession(_sessionResource: URI, token: CancellationToken): Promise<IChatSession> {
			this.lookupCount++;
			this.lastToken = token;
			if (token.isCancellationRequested) {
				throw new Error('lookup cancelled');
			}
			if (this.lookupError) {
				throw this.lookupError;
			}
			return upcastPartial<IChatSession>({
				forkSession: this.supportsFork ? async () => { throw new Error('Not implemented'); } : undefined,
			});
		}
	}

	const forkCommand: IChatSlashData = {
		command: 'fork',
		detail: 'Fork this chat',
		executeImmediately: true,
		locations: [ChatAgentLocation.Chat],
		completionVariants: [
			{ label: '/fork', insertText: '/fork ', executeImmediately: true },
			{ label: '/fork <title>', insertText: '/fork ', argumentHint: 'title' },
			{ label: '/fork prompt <prompt>', insertText: '/fork prompt ', argumentHint: 'prompt' },
		],
	};

	function completionRanges(suggestion: CompletionItem): { readonly insert: Range; readonly replace: Range } {
		if (Range.isIRange(suggestion.range)) {
			return { insert: Range.lift(suggestion.range), replace: Range.lift(suggestion.range) };
		}
		return { insert: Range.lift(suggestion.range.insert), replace: Range.lift(suggestion.range.replace) };
	}

	async function provideSuggestions(agentHost: boolean, commands: readonly IChatSlashData[], chatSessionsService: ForkCompletionChatSessionsService, token = CancellationToken.None, inputWidget?: IChatWidget, inputModel?: ITextModel): Promise<{ readonly suggestions: readonly CompletionItem[]; readonly model: ITextModel }> {
		const languageFeaturesService = new LanguageFeaturesService();
		const inputUri = inputModel?.uri ?? URI.from({ scheme: Schemas.vscodeChatInput, path: '/fork-completions' });
		const sessionResource = URI.from({ scheme: agentHost ? 'agent-host-test' : 'test', path: '/session' });
		const widget = inputWidget ?? upcastDeepPartial<IChatWidget>({
			viewModel: upcastPartial<IChatViewModel>({ model: upcastPartial<IChatModel>({ sessionResource }) }),
			parsedInput: { parts: [] },
			location: ChatAgentLocation.Chat,
			input: { currentModeKind: ChatModeKind.Ask },
			attachmentCapabilities: { supportsPromptAttachments: true },
			scopedContextKeyService: { contextMatchesRules: () => true },
		});
		store.add(new SlashCommandCompletions(
			languageFeaturesService,
			upcastPartial<IChatWidgetService>({ getWidgetByInputUri: () => widget }),
			upcastPartial<IChatSlashCommandService>({ getCommands: () => [...commands] }),
			upcastPartial<ICustomizationHarnessService>({}),
			upcastPartial<IChatService>({}),
			chatSessionsService,
			upcastPartial<IMcpService>({}),
			new NullLogService(),
		));
		const model = inputModel ?? store.add(createTextModel('/fo', null, undefined, inputUri));
		const provider = languageFeaturesService.completionProvider.ordered(model).find(provider => provider._debugDisplayName === 'globalSlashCommands');
		assert.ok(provider);

		const result = await provider.provideCompletionItems(model, new Position(1, 4), { triggerKind: CompletionTriggerKind.Invoke }, token);
		assert.ok(result);
		return { suggestions: result.suggestions, model };
	}

	test('offers all fork variants for agent host sessions that support forking', async () => {
		const chatSessionsService = new ForkCompletionChatSessionsService(true);
		const { suggestions, model } = await provideSuggestions(true, [forkCommand], chatSessionsService);

		assert.deepStrictEqual(suggestions.map(suggestion => ({
			label: suggestion.label,
			insertText: suggestion.insertText,
			submitsImmediately: suggestion.command?.id === ChatSubmitAction.ID,
			range: completionRanges(suggestion),
			filterText: suggestion.filterText,
		})), [
			{ label: { label: '/fork', description: 'Fork this chat' }, insertText: '/fork ', submitsImmediately: true, range: { insert: new Range(1, 1, 1, 4), replace: new Range(1, 1, 1, 4) }, filterText: '/fork' },
			{ label: { label: '/fork <title>', description: 'Fork this chat' }, insertText: '/fork ', submitsImmediately: false, range: { insert: new Range(1, 1, 1, 4), replace: new Range(1, 1, 1, 4) }, filterText: '/fork' },
			{ label: { label: '/fork prompt <prompt>', description: 'Fork this chat' }, insertText: '/fork prompt ', submitsImmediately: false, range: { insert: new Range(1, 1, 1, 4), replace: new Range(1, 1, 1, 4) }, filterText: '/fork' },
		]);
		for (const suggestion of suggestions) {
			model.setValue('/fo');
			const range = completionRanges(suggestion).replace;
			model.applyEdits([{ range, text: suggestion.insertText }]);
			assert.strictEqual(model.getValue(), suggestion.insertText);
			assert.strictEqual(range.startColumn + suggestion.insertText.length, model.getLineMaxColumn(1));
		}
	});

	test('accepts fork title and prompt completion commands through the input editor', async () => {
		const cases = [
			{ label: '/fork <title>', insertText: '/fork ', argumentHint: 'title', cursorColumn: 7 },
			{ label: '/fork prompt <prompt>', insertText: '/fork prompt ', argumentHint: 'prompt', cursorColumn: 14 },
		];

		for (const testCase of cases) {
			const parsedInputEmitter = store.add(new Emitter<void>());
			const viewModelEmitter = store.add(new Emitter<void>());
			const activeInputEditorEmitter = store.add(new Emitter<void>());
			let inputEditor: IChatWidget['inputEditor'];
			let hintContribution: InputEditorCommandArgumentHint | undefined;
			const sessionResource = URI.from({ scheme: 'agent-host-test', path: `/session-${testCase.argumentHint}` });
			const model = store.add(createTextModel('/fo', null, undefined, URI.from({ scheme: Schemas.vscodeChatInput, path: `/fork-completions-${testCase.argumentHint}` })));
			const widget = upcastDeepPartial<IChatWidget>({
				get inputEditor() {
					return inputEditor;
				},
				viewModel: upcastPartial<IChatViewModel>({ model: upcastPartial<IChatModel>({ sessionResource }) }),
				parsedInput: { parts: [] },
				location: ChatAgentLocation.Chat,
				input: { currentModeKind: ChatModeKind.Ask },
				attachmentCapabilities: { supportsPromptAttachments: true },
				scopedContextKeyService: { contextMatchesRules: () => true },
				onDidChangeParsedInput: parsedInputEmitter.event,
				onDidChangeViewModel: viewModelEmitter.event,
				onDidChangeActiveInputEditor: activeInputEditorEmitter.event,
				getContrib: (id: string) => id === InputEditorCommandArgumentHint.ID ? hintContribution : undefined,
			});
			const { suggestions } = await provideSuggestions(true, [forkCommand], new ForkCompletionChatSessionsService(true), CancellationToken.None, widget, model);
			const suggestion = suggestions.find(candidate => typeof candidate.label !== 'string' && candidate.label.label === testCase.label);
			assert.ok(suggestion, `Expected ${testCase.label} completion`);
			const completion = suggestion;
			const command = completion.command;
			assert.ok(command, `Expected ${testCase.label} to register an accept command`);
			const acceptCommand = CommandsRegistry.getCommand(command.id);
			assert.ok(acceptCommand, `Expected ${command.id} accept command to be registered`);

			withTestCodeEditor(model, {}, (editor, _viewModel, instantiationService) => {
				const editorStore = new DisposableStore();
				let decorations: readonly IDecorationOptions[] = [];
				try {
					inputEditor = editor;
					assert.ok(ChatWidget.CONTRIBS.includes(InputEditorCommandArgumentHint), 'InputEditorCommandArgumentHint should be registered as a chat widget contribution');
					hintContribution = editorStore.add(instantiationService.createInstance(InputEditorCommandArgumentHint, widget));
					const setDecorationsByType = editor.setDecorationsByType.bind(editor);
					editor.setDecorationsByType = (description, decorationTypeKey, options) => {
						if (decorationTypeKey === 'chat-command-argument-hint') {
							decorations = options;
						}
						return setDecorationsByType(description, decorationTypeKey, options);
					};

					editor.setPosition(new Position(1, 4));
					editor.executeEdits('test', [{ range: completionRanges(completion).replace, text: completion.insertText }]);
					instantiationService.invokeFunction(accessor => acceptCommand.handler(accessor, ...(command.arguments ?? [])));

					assert.deepStrictEqual({
						value: editor.getValue(),
						selection: editor.getSelection(),
						decorations: decorations.map(decoration => ({
							range: decoration.range,
							contentText: decoration.renderOptions?.after?.contentText,
						})),
					}, {
						value: completion.insertText,
						selection: new Selection(1, testCase.cursorColumn, 1, testCase.cursorColumn),
						decorations: [{
							range: { startLineNumber: 1, endLineNumber: 1, startColumn: testCase.cursorColumn, endColumn: 1000 },
							contentText: testCase.argumentHint,
						}],
					});
				} finally {
					editorStore.dispose();
				}
			});
		}
	});

	test('offers no fork variants when the agent host does not support forking', async () => {
		const { suggestions } = await provideSuggestions(true, [forkCommand], new ForkCompletionChatSessionsService(false));

		assert.deepStrictEqual(suggestions, []);
	});

	test('uses the original slash command completion outside agent host sessions', async () => {
		const chatSessionsService = new ForkCompletionChatSessionsService(true);
		const { suggestions } = await provideSuggestions(false, [forkCommand], chatSessionsService);

		assert.deepStrictEqual(suggestions.map(suggestion => ({ label: suggestion.label, insertText: suggestion.insertText, command: suggestion.command?.id })), [
			{ label: { label: '/fork', description: 'Fork this chat' }, insertText: '', command: ChatSubmitAction.ID },
		]);
		assert.strictEqual(chatSessionsService.lookupCount, 0);
	});

	test('does not query capabilities when no fork command is available', async () => {
		const chatSessionsService = new ForkCompletionChatSessionsService(true);
		const { suggestions } = await provideSuggestions(true, [{
			command: 'review',
			detail: 'Review the workspace',
			locations: [ChatAgentLocation.Chat],
		}], chatSessionsService);

		assert.strictEqual(chatSessionsService.lookupCount, 0);
		assert.deepStrictEqual(suggestions.map(suggestion => suggestion.label), [
			{ label: '/review', description: 'Review the workspace' },
		]);
	});

	test('offers no fork variants when the capability lookup is cancelled', async () => {
		const chatSessionsService = new ForkCompletionChatSessionsService(false);
		const cancellationTokenSource = new CancellationTokenSource();
		cancellationTokenSource.cancel();
		const { suggestions } = await provideSuggestions(true, [forkCommand], chatSessionsService, cancellationTokenSource.token);

		assert.strictEqual(chatSessionsService.lastToken, cancellationTokenSource.token);
		assert.deepStrictEqual(suggestions, []);
		cancellationTokenSource.dispose();
	});

	test('offers no fork variants when the capability lookup fails', async () => {
		const { suggestions } = await provideSuggestions(true, [forkCommand], new ForkCompletionChatSessionsService(false, new Error('lookup failed')));

		assert.deepStrictEqual(suggestions, []);
	});
});

suite('AgentHostInputCompletions skills', () => {
	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('ranks matches on later words without changing the inserted skill', () => {
		const completions = store.add(new TestableAgentHostInputCompletions(
			new LanguageFeaturesService(),
			new MockChatWidgetService(),
			new TestChatSessionsService(),
			new TestConfigurationService(),
			upcastPartial<IAgentHostConnectionsService>({ resolveSessionResource: () => undefined }),
			upcastPartial<IAgentHostUntitledProvisionalSessionService>({ get: () => undefined }),
		));
		const built = completions.buildItem(new Position(1, 8), {
			insertText: '/daily-hiring-summary ',
			attachment: {
				kind: 'skill',
				uri: URI.parse('example:/skills/daily-hiring-summary'),
				displayName: 'daily-hiring-summary',
			},
		}, upcastPartial<IChatWidget>({}));

		assert.deepStrictEqual({
			label: built?.label,
			insertText: built?.insertText,
			filterText: built?.filterText,
		}, {
			label: { label: '/daily-hiring-summary', description: undefined },
			insertText: '/daily-hiring-summary ',
			filterText: '/hiring-summary /summary /daily-hiring-summary',
		});
	});
});

suite('AgentHostInputCompletions follow-up suggestions', () => {

	const store = new DisposableStore();

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('carries the retrigger hint into the command accept handler', () => {
		const completions = store.add(new TestableAgentHostInputCompletions(
			new LanguageFeaturesService(),
			new MockChatWidgetService(),
			new TestChatSessionsService(),
			new TestConfigurationService(),
			upcastPartial<IAgentHostConnectionsService>({ resolveSessionResource: () => undefined }),
			upcastPartial<IAgentHostUntitledProvisionalSessionService>({ get: () => undefined }),
		));

		const built = completions.buildItem(new Position(1, 12), {
			insertText: 'enable ',
			start: { lineNumber: 1, column: 6 },
			end: { lineNumber: 1, column: 12 },
			attachment: {
				kind: 'command',
				command: 'mcp',
				description: 'Enable an MCP server',
				retriggerSuggestions: true,
			},
		}, upcastPartial<IChatWidget>({}));
		const acceptArgument = built?.command?.arguments?.[0] as { retriggerSuggestions?: boolean } | undefined;

		assert.deepStrictEqual({
			command: built?.command?.id,
			retriggerSuggestions: acceptArgument?.retriggerSuggestions,
		}, {
			command: '_chatAgentHostAddReferenceCmd',
			retriggerSuggestions: true,
		});
	});

	test('carries the submit hint into the command accept handler', () => {
		const completions = store.add(new TestableAgentHostInputCompletions(
			new LanguageFeaturesService(),
			new MockChatWidgetService(),
			new TestChatSessionsService(),
			new TestConfigurationService(),
			upcastPartial<IAgentHostConnectionsService>({ resolveSessionResource: () => undefined }),
			upcastPartial<IAgentHostUntitledProvisionalSessionService>({ get: () => undefined }),
		));

		const built = completions.buildItem(new Position(1, 14), {
			insertText: 'list ',
			start: { lineNumber: 1, column: 9 },
			end: { lineNumber: 1, column: 14 },
			attachment: {
				kind: 'command',
				command: 'skills',
				description: 'List skills',
				submitOnAccept: true,
			},
		}, upcastPartial<IChatWidget>({}));
		const acceptArgument = built?.command?.arguments?.[0] as { submitOnAccept?: boolean } | undefined;

		assert.deepStrictEqual({
			command: built?.command?.id,
			submitOnAccept: acceptArgument?.submitOnAccept,
		}, {
			command: '_chatAgentHostAddReferenceCmd',
			submitOnAccept: true,
		});
	});
});

suite('escapeForCharClass', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('passes through simple characters unchanged', () => {
		assert.strictEqual(escapeForCharClass('a'), 'a');
		assert.strictEqual(escapeForCharClass('#'), '#');
		assert.strictEqual(escapeForCharClass('@'), '@');
	});

	test('escapes backslash', () => {
		assert.strictEqual(escapeForCharClass('\\'), '\\\\');
	});

	test('escapes closing bracket', () => {
		assert.strictEqual(escapeForCharClass(']'), '\\]');
	});

	test('escapes caret', () => {
		assert.strictEqual(escapeForCharClass('^'), '\\^');
	});

	test('escapes hyphen', () => {
		assert.strictEqual(escapeForCharClass('-'), '\\-');
	});

	test('escapes multiple special chars in one string', () => {
		assert.strictEqual(escapeForCharClass('-^]\\'), '\\-\\^\\]\\\\');
	});

	test('is safe to use for chatVariableLeader and chatAgentLeader', () => {
		// These are the actual values used in the product code
		const escaped = `[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]`;
		const re = new RegExp(escaped);
		assert.ok(re.test('#'));
		assert.ok(re.test('@'));
		assert.ok(!re.test('a'));
		assert.ok(!re.test('/'));
	});
});

suite('prompt slash command matching', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('matches later words in hyphenated skill names', () => {
		const filterText = getPromptSlashCommandFilterText('daily-hiring-summary');
		const matches = ['/daily', '/hiring', '/hiring-sum', '/summary', '/missing'].map(pattern =>
			!!fuzzyScore(pattern, pattern.toLowerCase(), 0, filterText!, filterText!.toLowerCase(), 0, FuzzyScoreOptions.default));
		assert.deepStrictEqual(matches, [true, true, true, true, false]);
		const score = (word: string) => fuzzyScore('/hiring', '/hiring', 0, word, word.toLowerCase(), 0, FuzzyScoreOptions.default)?.[0];
		assert.ok(score(filterText!)! > score('/daily-hiring-summary')!);
	});

	test('preserves colon and space forms for plugin commands', () => {
		assert.strictEqual(getPromptSlashCommandFilterText('my-plugin:daily-hiring-summary'),
			'/hiring-summary /summary /my-plugin:daily-hiring-summary /my-plugin daily-hiring-summary');
		assert.strictEqual(getPromptSlashCommandFilterText('my-plugin:review'), '/my-plugin:review /my-plugin review');
	});

	test('uses the label for commands without word separators', () => {
		assert.strictEqual(getPromptSlashCommandFilterText('summary'), undefined);
	});
});

suite('attached context completion ranking', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const suggestOptions = EditorOptions.suggest.defaultValue;

	test('sorts before other chat input completions', () => {
		assert.ok(attachedContextCompletionSortText < ' ');
	});

	test('filters attachments before matching the current token exactly', () => {
		assert.deepStrictEqual({
			at: getAttachedContextCompletionMatch('@', '@', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
			atAttachment: getAttachedContextCompletionMatch('@att', '@', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
			hashName: getAttachedContextCompletionMatch('#screen', '#', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
			hashAttachment: getAttachedContextCompletionMatch('#att', '#', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
			unmatched: getAttachedContextCompletionMatch('#xyz', '#', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
		}, {
			at: '@',
			atAttachment: '@att',
			hashName: '#screen',
			hashAttachment: '#att',
			unmatched: undefined,
		});
	});

	test('honors graceful Suggest filtering', () => {
		assert.deepStrictEqual({
			graceful: getAttachedContextCompletionMatch('#attahcment', '#', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
			strict: getAttachedContextCompletionMatch('#attahcment', '#', 'Screen Recording.mov', 'file', { ...suggestOptions, filterGraceful: false })?.filterText,
		}, {
			graceful: '#attahcment',
			strict: undefined,
		});
	});

	test('refreshes across supported punctuation', () => {
		assert.deepStrictEqual({
			triggerCharacters: attachedContextCompletionAdditionalTriggerCharacters,
			colon: getAttachedContextCompletionMatch('#attachment:', '#', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
			hyphen: getAttachedContextCompletionMatch('#attachment:screen-', '#', 'Screen-Recording.mov', 'file', suggestOptions)?.filterText,
		}, {
			triggerCharacters: [':', '-'],
			colon: '#attachment:',
			hyphen: '#attachment:screen-',
		});
	});

	test('uses only the token prefix through an interior cursor', () => {
		const range = {
			insert: new Range(1, 1, 1, 5),
			replace: new Range(1, 1, 1, 8),
			varWord: { word: '#attxyz', startColumn: 1, endColumn: 8 },
		};
		const typedWord = getCompletionRangeWord(range);

		assert.deepStrictEqual({
			typedWord,
			filterText: typedWord === undefined ? undefined : getAttachedContextCompletionMatch(typedWord, '#', 'Screen Recording.mov', 'file', suggestOptions)?.filterText,
		}, {
			typedWord: '#att',
			filterText: '#att',
		});
	});

	test('preserves fuzzy relevance between attached contexts', () => {
		const strongMatch = getAttachedContextCompletionMatch('#readme', '#', 'README.md', 'file', suggestOptions);
		const weakMatch = getAttachedContextCompletionMatch('#readme', '#', 'Areadme-copy.txt', 'file', suggestOptions);

		assert.deepStrictEqual({
			matches: !!strongMatch && !!weakMatch,
			strongBeforeWeak: !!strongMatch && !!weakMatch && getAttachedContextCompletionSortText(strongMatch.score) < getAttachedContextCompletionSortText(weakMatch.score),
			weakBeforeAgentHost: !!weakMatch && getAttachedContextCompletionSortText(weakMatch.score) < '000000',
		}, {
			matches: true,
			strongBeforeWeak: true,
			weakBeforeAgentHost: true,
		});
	});
});

suite('computeCompletionRanges', () => {

	let store: DisposableStore;

	setup(() => {
		store = new DisposableStore();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// Helper: builds the same regex patterns used in the product code
	function variableNameDef() {
		return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][\\w:-]*`, 'g');
	}

	function fileWordPattern() {
		return new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, 'g');
	}

	function toolVariableNameDef() {
		return new RegExp(`(?<=^|\\s)[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]\\w*`, 'g');
	}

	// --- VariableNameDef pattern tests ---

	suite('with VariableNameDef regex', () => {

		test('matches #variable at start of line', () => {
			const model = store.add(createTextModel('#file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 1, 1, 6),
				replace: new Range(1, 1, 1, 6),
				varWord: { word: '#file', startColumn: 1, endColumn: 6 },
			});
		});

		test('matches @variable at start of line', () => {
			const model = store.add(createTextModel('@file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 1, 1, 6),
				replace: new Range(1, 1, 1, 6),
				varWord: { word: '@file', startColumn: 1, endColumn: 6 },
			});
		});

		test('matches #variable mid-line after space', () => {
			const model = store.add(createTextModel('hello #file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 7, 1, 12),
				replace: new Range(1, 7, 1, 12),
				varWord: { word: '#file', startColumn: 7, endColumn: 12 },
			});
		});

		test('matches @variable mid-line after space', () => {
			const model = store.add(createTextModel('hello @file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 12), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 7, 1, 12),
				replace: new Range(1, 7, 1, 12),
				varWord: { word: '@file', startColumn: 7, endColumn: 12 },
			});
		});

		test('matches # alone (just the leader)', () => {
			const model = store.add(createTextModel('#', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#');
		});

		test('matches @ alone (just the leader)', () => {
			const model = store.add(createTextModel('@', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 2), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@');
		});

		test('matches variable with colons and hyphens', () => {
			const model = store.add(createTextModel('#file:test-1', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 13), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file:test-1');
		});

		test('cursor in middle of variable produces partial insert range', () => {
			const model = store.add(createTextModel('@selection', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 5), variableNameDef());
			assert.ok(result);
			assert.deepStrictEqual(result, {
				insert: new Range(1, 1, 1, 5),
				replace: new Range(1, 1, 1, 11),
				varWord: { word: '@selection', startColumn: 1, endColumn: 11 },
			});
		});
	});

	// --- fileWordPattern tests ---

	suite('with fileWordPattern regex', () => {

		test('matches #file:path/to/file.ts', () => {
			const model = store.add(createTextModel('#file:path/to/file.ts', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file:path/to/file.ts');
		});

		test('matches @file:path/to/file.ts', () => {
			const model = store.add(createTextModel('@file:path/to/file.ts', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 22), fileWordPattern());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@file:path/to/file.ts');
		});

		test('stops at whitespace', () => {
			const model = store.add(createTextModel('#file:test rest', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 11), fileWordPattern());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file:test');
		});
	});

	// --- toolVariableNameDef tests ---

	suite('with toolVariableNameDef regex', () => {

		test('matches #tool at start of line', () => {
			const model = store.add(createTextModel('#tool', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#tool');
		});

		test('matches @tool at start of line', () => {
			const model = store.add(createTextModel('@tool', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 6), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@tool');
		});

		test('matches #tool after space', () => {
			const model = store.add(createTextModel('use #fetch', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#fetch');
		});

		test('matches @tool after space', () => {
			const model = store.add(createTextModel('use @fetch', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 11), toolVariableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@fetch');
		});
	});

	// --- Edge cases ---

	suite('edge cases', () => {

		test('returns undefined inside a normal word', () => {
			const model = store.add(createTextModel('hello', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
			assert.strictEqual(result, undefined);
		});

		test('returns undefined when no space before cursor mid-line', () => {
			const model = store.add(createTextModel('ab', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 3), variableNameDef());
			assert.strictEqual(result, undefined);
		});

		test('returns empty range at blank position after space', () => {
			const model = store.add(createTextModel('hello ', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 7), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord, null);
			assert.deepStrictEqual(result.insert, Range.fromPositions(new Position(1, 7)));
		});

		test('returns empty range at start of empty line', () => {
			const model = store.add(createTextModel('', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 1), variableNameDef());
			assert.ok(result);
			assert.strictEqual(result.varWord, null);
		});

		test('onlyOnWordStart=true rejects variable preceded by a word', () => {
			const model = store.add(createTextModel('abc#file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 9), variableNameDef(), true);
			assert.strictEqual(result, undefined);
		});

		test('onlyOnWordStart=true accepts variable after space', () => {
			const model = store.add(createTextModel('abc #file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '#file');
		});

		test('onlyOnWordStart=true accepts @variable after space', () => {
			const model = store.add(createTextModel('abc @file', null, undefined, URI.parse('test:input')));
			const result = computeCompletionRanges(model, new Position(1, 10), variableNameDef(), true);
			assert.ok(result);
			assert.strictEqual(result.varWord?.word, '@file');
		});
	});
});

suite('isAtTriggerCharacterToken', () => {

	let store: DisposableStore;

	setup(() => {
		store = new DisposableStore();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	const triggerChars = ['@', '#'];

	function check(text: string, column: number, expected: boolean): void {
		const model = store.add(createTextModel(text, null, undefined, URI.parse('test:input')));
		assert.strictEqual(
			isAtTriggerCharacterToken(model, new Position(1, column), triggerChars),
			expected,
			`text=${JSON.stringify(text)} column=${column}`,
		);
	}

	test('cursor right after a trigger character at start of line', () => {
		check('@', 2, true);
	});

	test('cursor inside a trigger-led token at start of line', () => {
		check('@file', 4, true);
	});

	test('cursor at end of a trigger-led token at start of line', () => {
		check('@file', 6, true);
	});

	test('cursor inside a trigger-led token mid-line', () => {
		check('hello @file', 10, true);
	});

	test('cursor inside a # trigger-led token', () => {
		check('hello #file', 10, true);
	});

	test('cursor inside a non-trigger-led word at start of line', () => {
		check('hello', 4, false);
	});

	test('cursor inside a non-trigger-led word mid-line', () => {
		check('say hello', 8, false);
	});

	test('cursor at start of empty line', () => {
		check('', 1, false);
	});

	test('cursor right after whitespace, no token yet', () => {
		check('hello ', 7, false);
	});

	test('cursor after a trigger-led token followed by space', () => {
		// Cursor sits in the empty token after the space, not in the @file token.
		check('@file ', 7, false);
	});

	test('cursor in token whose first char is not a trigger char', () => {
		check('abc@def', 8, false); // first char of token is 'a', not '@'
	});

	test('cursor in slash command arguments', () => {
		const slashTriggerChars = ['/', ' '];
		assert.deepStrictEqual(([
			['/mcp enable ', 13],
			['/mcp enable ser', 16],
			['  /mcp enable server', 21],
			['say /mcp enable server', 23],
		] as const).map(([text, column]) => {
			const model = store.add(createTextModel(text, null, undefined, URI.parse('test:input')));
			return isAtTriggerCharacterToken(model, new Position(1, column), slashTriggerChars);
		}), [true, true, true, false]);
	});

	test('returns false when no trigger characters are configured', () => {
		const model = store.add(createTextModel('@file', null, undefined, URI.parse('test:input')));
		assert.strictEqual(isAtTriggerCharacterToken(model, new Position(1, 4), []), false);
	});
});
