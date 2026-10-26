/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mockObject, upcastDeepPartial, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IChatAcceptInputOptions } from '../../browser/chat.js';
import { IChatTipService } from '../../browser/chatTipService.js';
import { ChatWidget } from '../../browser/widget/chatWidget.js';
import { toPasteVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { IChatVariablesService } from '../../common/attachments/chatVariables.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { LocalChatSessionUri } from '../../common/model/chatUri.js';
import { ChatAgentService, IChatAgentService } from '../../common/participants/chatAgents.js';
import { IChatSlashCommandService } from '../../common/participants/chatSlashCommands.js';
import { ChatRequestSlashCommandPart, IParsedChatRequest } from '../../common/requestParser/chatParserTypes.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { MockChatService } from '../common/chatService/mockChatService.js';
import { MockChatVariablesService } from '../common/mockChatVariables.js';
import { MockPromptsService } from '../common/promptSyntax/service/mockPromptsService.js';

suite('ChatWidget Slash Commands', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fork prompt cleanup does not inspect the composer for unrelated submissions', () => {
		const scenarios = [
			{ resource: URI.parse('agent-host-copilot:/source'), query: 'programmatic prompt', options: undefined },
			{ resource: URI.parse('agent-host-copilot:/source'), query: undefined, options: { preserveInput: true } },
			{ resource: URI.parse('local:/source'), query: undefined, options: undefined },
		];
		const privateMethods = ChatWidget.prototype as unknown as {
			_createForkPromptInputCleanup(query: string | undefined, options: IChatAcceptInputOptions | undefined): (() => void) | undefined;
		};
		for (const { resource, query, options } of scenarios) {
			const widget = upcastDeepPartial<ChatWidget>({
				viewModel: { sessionResource: resource },
				getInput: () => assert.fail('unrelated submissions must not inspect the draft'),
			});
			const cleanup = privateMethods._createForkPromptInputCleanup.call(widget, query, options);
			assert.strictEqual(cleanup, undefined);
		}
	});

	test('fork prompt cleanup clears only the unchanged agent-host source input model', () => {
		const sourceState = observableValue('sourceInput', {
			inputText: '/fork prompt preserve this',
			attachments: [{ id: 'source-attachment' }],
		});
		const targetState = observableValue('targetInput', {
			inputText: 'new target typing',
			attachments: [{ id: 'target-attachment' }],
		});
		const inputModel = {
			state: sourceState,
			setState: (change: Partial<ReturnType<typeof sourceState.get>>) => sourceState.set({ ...sourceState.get(), ...change }, undefined),
		};
		let input = sourceState.get().inputText;
		let attachmentIds = new Set(['source-attachment']);
		const widgetModel = {
			sessionResource: URI.parse('agent-host-copilot:/source'),
			model: { inputModel },
		};
		const widget = {
			viewModel: widgetModel,
			getInput: () => input,
			input: { attachmentModel: { getAttachmentIDs: () => attachmentIds, get attachments() { return sourceState.get().attachments; } } },
			parsedInput: upcastPartial<IParsedChatRequest>({
				parts: [new ChatRequestSlashCommandPart(new OffsetRange(0, '/fork'.length), new Range(1, 1, 1, 6), { command: 'fork', detail: 'Fork', locations: [ChatAgentLocation.Chat] })],
			}),
		} as unknown as ChatWidget;
		const privateMethods = ChatWidget.prototype as unknown as {
			_createForkPromptInputCleanup(query: string | undefined, options: IChatAcceptInputOptions | undefined): (() => void) | undefined;
		};

		const cleanup = privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined);
		assert.ok(cleanup);
		cleanup();
		assert.deepStrictEqual(sourceState.get(), { inputText: '', attachments: [] });
		assert.deepStrictEqual(targetState.get(), { inputText: 'new target typing', attachments: [{ id: 'target-attachment' }] });

		sourceState.set({ inputText: '/fork prompt preserve this', attachments: [{ id: 'source-attachment' }] }, undefined);
		input = '/fork prompt preserve this';
		attachmentIds = new Set(['source-attachment']);
		const editedCleanup = privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined)!;
		sourceState.set({ ...sourceState.get(), inputText: 'new source typing' }, undefined);
		editedCleanup();
		assert.strictEqual(sourceState.get().inputText, 'new source typing');

		sourceState.set({ inputText: '/fork prompt preserve this', attachments: [{ id: 'source-attachment' }] }, undefined);
		attachmentIds = new Set(['source-attachment']);
		const attachmentCleanup = privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined)!;
		sourceState.set({ ...sourceState.get(), attachments: [{ id: 'new-attachment' }] }, undefined);
		attachmentIds = new Set(['new-attachment']);
		attachmentCleanup();
		assert.deepStrictEqual(sourceState.get().attachments, [{ id: 'new-attachment' }]);

		widgetModel.sessionResource = URI.parse('local:/source');
		assert.strictEqual(privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined), undefined);
		widgetModel.sessionResource = URI.parse('agent-host-copilot:/source');
		assert.strictEqual(privateMethods._createForkPromptInputCleanup.call(widget, 'programmatic', undefined), undefined);
		assert.strictEqual(privateMethods._createForkPromptInputCleanup.call(widget, undefined, { preserveInput: true }), undefined);
		assert.ok(privateMethods._createForkPromptInputCleanup.call(widget, '', undefined), 'an empty query submits the composer input');
		widgetModel.sessionResource = URI.parse('remote-example-copilot:/source');
		assert.ok(privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined), 'remote agent-host sessions own fork-prompt cleanup');

		input = '  @agent /fork prompt prefixed';
		(widget as unknown as { parsedInput: IParsedChatRequest }).parsedInput = upcastPartial<IParsedChatRequest>({
			parts: [new ChatRequestSlashCommandPart(new OffsetRange(9, 14), new Range(1, 10, 1, 15), { command: 'fork', detail: 'Fork', locations: [ChatAgentLocation.Chat] })],
		});
		assert.ok(privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined), 'a global fork after whitespace and an agent mention owns its prompt');
		input = 'plain text /fork prompt mention';
		(widget as unknown as { parsedInput: IParsedChatRequest }).parsedInput = upcastPartial<IParsedChatRequest>({ parts: [] });
		assert.strictEqual(privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined), undefined);
	});

	test('fork prompt cleanup preserves changed attachment content with unchanged IDs', () => {
		const original = toPasteVariableEntry('Pasted text', 'original content', { id: 'same-id' });
		const updated = toPasteVariableEntry('Pasted text', 'edited content', { id: 'same-id' });
		const inputText = '/fork prompt preserve this';
		const state = observableValue('sourceInput', { inputText, attachments: [original] });
		const inputModel = {
			state,
			setState: (change: Partial<ReturnType<typeof state.get>>) => state.set({ ...state.get(), ...change }, undefined),
		};
		const widget = {
			viewModel: {
				sessionResource: URI.parse('agent-host-copilot:/source'),
				model: { inputModel },
			},
			getInput: () => state.get().inputText,
			input: { attachmentModel: { getAttachmentIDs: () => new Set(state.get().attachments.map(attachment => attachment.id)), get attachments() { return state.get().attachments; } } },
			parsedInput: upcastPartial<IParsedChatRequest>({
				parts: [new ChatRequestSlashCommandPart(new OffsetRange(0, 5), new Range(1, 1, 1, 6), { command: 'fork', detail: 'Fork', locations: [ChatAgentLocation.Chat] })],
			}),
		} as unknown as ChatWidget;
		const privateMethods = ChatWidget.prototype as unknown as {
			_createForkPromptInputCleanup(query: string | undefined, options: IChatAcceptInputOptions | undefined): (() => void) | undefined;
		};
		const cleanup = privateMethods._createForkPromptInputCleanup.call(widget, undefined, undefined);
		assert.ok(cleanup);
		state.set({ inputText, attachments: [] }, undefined);
		state.set({ inputText, attachments: [updated] }, undefined);
		cleanup();
		assert.deepStrictEqual(state.get(), { inputText, attachments: [updated] });
	});

	test('during-request execution retains attachments for a non-preserved slash command', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IPromptsService, disposables.add(new MockPromptsService()));
		instantiationService.stub(IChatVariablesService, new MockChatVariablesService());

		const chatSlashCommandService = mockObject<IChatSlashCommandService>()({ _serviceBrand: undefined });
		let executedPrompt: string | undefined;
		let executedRequestOptions: IChatSendRequestOptions | undefined;
		chatSlashCommandService.getCommands.returns([{ command: 'btw', executeDuringRequest: true, silent: true }]);
		let acceptedInput: { storeToHistory: boolean | undefined; preserveFocus: boolean | undefined } | undefined;
		chatSlashCommandService.executeCommand.callsFake(async (command, prompt, _progress, _history, _location, _sessionResource, _token, requestOptions) => {
			assert.strictEqual(command, 'btw');
			assert.ok(acceptedInput);
			executedPrompt = prompt;
			executedRequestOptions = requestOptions;
		});
		instantiationService.stub(IChatSlashCommandService, chatSlashCommandService);
		const recordedSlashCommands: string[] = [];

		const pastedText = toPasteVariableEntry('Pasted text #1', 'Long pasted text');
		let hasActiveRequest = false;
		const widget = {
			viewModel: {
				sessionResource: LocalChatSessionUri.forSession('test-session'),
				model: {
					getRequests: () => [],
					hasActiveRequest: { get: () => hasActiveRequest },
				},
			},
			instantiationService,
			location: ChatAgentLocation.Chat,
			_lastSelectedAgent: undefined,
			_lockedAgent: undefined,
			attachmentCapabilities: undefined,
			chatAgentService: instantiationService.get(IChatAgentService),
			chatSlashCommandService,
			chatTipService: mockObject<IChatTipService>()({
				recordSlashCommandUsage: (command: string) => recordedSlashCommands.push(command),
			}),
			input: {
				currentModeKind: ChatModeKind.Ask,
				getAttachedContext: () => ({ asArray: () => [pastedText] }),
				acceptInput(storeToHistory?: boolean, preserveFocus?: boolean): void {
					acceptedInput = { storeToHistory, preserveFocus };
				},
			},
		} as unknown as ChatWidget;

		const privateMethods = ChatWidget.prototype as unknown as {
			_getAttachedContextForConcurrentSlashCommand(preserveInput: boolean | undefined): NonNullable<IChatSendRequestOptions['attachedContext']>;
			_executeSlashCommandDuringRequest(input: string, requestOptions: IChatSendRequestOptions, storeToHistory: boolean, preserveFocus: boolean | undefined): Promise<boolean>;
		};
		// Owned /fork prompt input deliberately does not use preserveInput: its
		// source attachments remain part of the request both before and during an
		// active request. A true preserveInput remains an unrelated-draft path.
		const idleForkPromptContext = privateMethods._getAttachedContextForConcurrentSlashCommand.call(widget, false);
		hasActiveRequest = true;
		const activeForkPromptContext = privateMethods._getAttachedContextForConcurrentSlashCommand.call(widget, false);
		hasActiveRequest = false;
		const attachedContext = idleForkPromptContext;
		const preservedInputContext = privateMethods._getAttachedContextForConcurrentSlashCommand.call(widget, true);
		const handledWithoutActiveRequest = await privateMethods._executeSlashCommandDuringRequest.call(widget, '   /btw   keep indentation', { attachedContext }, true, true);
		hasActiveRequest = true;
		const handled = await privateMethods._executeSlashCommandDuringRequest.call(widget, '   /btw   keep indentation', { attachedContext }, true, true);

		assert.deepStrictEqual({
			handledWithoutActiveRequest,
			handled,
			executedPrompt,
			acceptedInput,
			attachedContext: executedRequestOptions?.attachedContext,
			idleForkPromptContext,
			activeForkPromptContext,
			preservedInputContext,
			recordedSlashCommands,
		}, {
			handledWithoutActiveRequest: false,
			handled: true,
			executedPrompt: 'keep indentation',
			acceptedInput: { storeToHistory: true, preserveFocus: true },
			attachedContext: [pastedText],
			idleForkPromptContext: [pastedText],
			activeForkPromptContext: [pastedText],
			preservedInputContext: [],
			recordedSlashCommands: ['btw'],
		});
	});
});
