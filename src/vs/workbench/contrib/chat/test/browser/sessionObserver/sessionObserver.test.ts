/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatDraftRequestService } from '../../../browser/sessionObserver/chatDraftRequestService.js';
import { CopilotCliEventMapper, cliUserOrigin } from '../../../browser/sessionObserver/copilotCliTranscriptSource.js';
import { chatSessionAttentionRegistry, IChatDraftResolution, IChatInputSuggestionEvent, IChatRequestSubmission, IChatSessionEventInput, IChatSessionObservedInfo, IChatSessionObserverService, IChatSessionsObservedChangeEvent, IChatSessionTranscriptSink } from '../../../common/sessionObserver/chatSessionObserver.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from '../../../../../../editor/common/languages.js';
import { LanguageFeaturesService } from '../../../../../../editor/common/services/languageFeaturesService.js';
import { createTextModel } from '../../../../../../editor/test/common/testTextModel.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatInputSuggestionService } from '../../../browser/sessionObserver/chatInputSuggestionService.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { ChatRequestQueueKind, IChatRequestAcceptedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { CHAT_QUESTION_ANSWER_SCHEME } from '../../../browser/widget/chatContentParts/chatQuestionAnswerEditor.js';
import { ChatModelProjector } from '../../../browser/sessionObserver/chatModelTranscriptSource.js';
import { ChatSessionAnnotationService } from '../../../browser/sessionObserver/chatSessionAnnotationService.js';
import { ChatSessionAttentionService } from '../../../browser/sessionObserver/chatSessionAttentionService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { IChatModel } from '../../../common/model/chatModel.js';
import { ChatSessionObserverService } from '../../../browser/sessionObserver/chatSessionObserverService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';

suite('chatSessionObserver', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const t = (s: number) => new Date(Date.UTC(2026, 10, 8, 18, 0, s)).toISOString();
	let n = 0;
	const ev = (type: string, s: number, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ type, id: `e${++n}`, timestamp: t(s), data, ...extra });

	test('the CLI mapper tells the user\'s words from injected ones', () => {
		assert.strictEqual(cliUserOrigin({}, 'Fix it'), 'user');
		assert.strictEqual(cliUserOrigin({ source: 'autopilot' }, 'continue'), 'autopilot');
		assert.strictEqual(cliUserOrigin({ source: 'skill-pdf' }, 'x'), 'skill');
		assert.strictEqual(cliUserOrigin({}, '<system_notification>done</system_notification>'), 'notification');
	});

	test('the CLI mapper keeps state across batches: tools, edits, questions, steering and hand-backs', () => {
		n = 0;
		const m = new CopilotCliEventMapper();
		const first = m.map([
			ev('session.start', 0, { selectedModel: 'claude-opus-5.5', context: { repository: 'acme/pay', branch: 'fix/retry' } }),
			ev('user.message', 1, { content: 'Fix retries; keep it minimal' }),
			ev('assistant.message', 2, { content: '', reasoningText: 'Look first.', toolRequests: [{ toolCallId: 'c1', name: 'edit', arguments: { path: '/w/a.ts', old_str: 'a', new_str: 'b' } }] }),
			ev('tool.execution_start', 3, { toolCallId: 'c1', toolName: 'edit', arguments: { path: '/w/a.ts', old_str: 'a', new_str: 'b' } }),
		]);
		assert.deepStrictEqual(first.map(e => e.kind), ['turnStarted', 'userMessage', 'reasoning', 'toolCall']);
		assert.strictEqual(m.status, 'working');

		const second = m.map([
			ev('tool.execution_complete', 4, { toolCallId: 'c1', success: true, result: { content: 'edited' } }),
			ev('user.message', 5, { content: 'also add a test', delivery: 'steering' }),
			ev('assistant.message', 6, { content: '', toolRequests: [{ toolCallId: 'q1', name: 'ask_user', arguments: { question: 'Which runner?', choices: ['vitest', 'mocha'] } }] }),
		]);
		assert.deepStrictEqual(second.map(e => e.kind), ['toolOutput', 'toolResult', 'edit', 'userMessage', 'toolCall', 'question']);
		// A steering message joins the running turn rather than starting one.
		assert.strictEqual(second[3].turnId, first[0].turnId);
		const q = second[5];
		assert.ok(q.kind === 'question' && q.questions[0].options?.join() === 'vitest,mocha');
		assert.strictEqual(m.status, 'question');

		const third = m.map([
			ev('tool.execution_complete', 7, { toolCallId: 'q1', success: true, result: { content: 'vitest' } }),
			ev('assistant.message', 8, { content: 'Done: retries fixed, test added.' }),
			ev('assistant.turn_end', 9, {}),
		]);
		assert.deepStrictEqual(third.map(e => e.kind), ['toolOutput', 'toolResult', 'questionAnswer', 'agentText', 'turnEnded']);
		assert.strictEqual(m.status, 'waiting');
		assert.strictEqual(m.repository, 'acme/pay');
	});

	test('the CLI mapper still sees hand-backs after a tool that never logged its completion', () => {
		const handBack = (s: number) => [ev('assistant.message', s, { content: 'Done. Commit?' }), ev('assistant.turn_end', s + 1, {})];
		const orphan = (s: number) => [ev('assistant.message', s, { content: '', toolRequests: [{ toolCallId: `o${s}`, name: 'bash', arguments: { command: 'sleep 999' } }] }), ev('tool.execution_start', s + 1, { toolCallId: `o${s}`, toolName: 'bash', arguments: {} })];
		for (const cut of ['abort', 'session.shutdown']) {
			n = 0;
			const m = new CopilotCliEventMapper();
			m.map([ev('user.message', 1, { content: 'go', delivery: 'idle' }), ...orphan(2), ev(cut, 4, {}), ev('user.message', 5, { content: 'try again' }), ...handBack(6)]);
			assert.strictEqual(m.status, 'waiting', cut);
		}
		n = 0;
		const m = new CopilotCliEventMapper();
		const out = m.map([ev('user.message', 1, { content: 'go', delivery: 'idle' }), ...orphan(2), ...handBack(4), ev('user.message', 6, { content: 'next', delivery: 'idle' }), ...handBack(7)]);
		assert.strictEqual(out.filter(e => e.kind === 'turnEnded').length, 1);
		assert.strictEqual(m.status, 'waiting');
	});

	test('drafts: one per session per owner, edit then send resolves with the edit', () => {
		const drafts = store.add(new ChatDraftRequestService());
		const resolved: IChatDraftResolution[] = [];
		store.add(drafts.onDidResolveDraft(r => resolved.push(r)));
		const session = URI.parse('copilotcli:/s1');
		drafts.setDraft({ id: 'd1', owner: 'ext', session, text: 'Stop retrying the same test', label: 'Suggested', createdAt: 1 });
		drafts.setDraft({ id: 'd2', owner: 'ext', session, text: 'Run the full suite', label: 'Suggested', createdAt: 2 });
		assert.deepStrictEqual(drafts.getDrafts(session).map(d => d.id), ['d2']);
		assert.deepStrictEqual(resolved.map(r => [r.draft.id, r.outcome]), [['d1', 'expired']]);

		drafts.reportDraftState('d2', 'editing', 'chatView');
		assert.strictEqual(drafts.getDrafts(session).length, 0);
		assert.strictEqual(drafts.editingDraft(session)?.id, 'd2');
		drafts.resolveDraft('d2', 'steered', { finalText: 'Run the full suite first', edited: true });
		assert.deepStrictEqual(resolved.at(-1), { draft: resolved.at(-1)!.draft, outcome: 'steered', edited: true, finalText: 'Run the full suite first' });
		assert.strictEqual(drafts.editingDraft(session), undefined);
	});

	test('input suggestions: ghost text on an empty input or a prefix, and a submission tied to the accept', async () => {
		const session = URI.parse('copilotcli:/s1');
		const model = store.add(createTextModel('', null, undefined, URI.from({ scheme: Schemas.vscodeChatInput, path: '/input-1' })));
		const options: unknown[] = [];
		const widget = {
			viewModel: { sessionResource: session, model: { hasRequests: true } }, visible: true, onDidShow: Event.None, onDidChangeViewModel: Event.None,
			inputEditor: { getModel: () => model, hasTextFocus: () => false, onDidFocusEditorText: Event.None, updateOptions: (o: unknown) => options.push(o), getOption: () => '', getContribution: () => undefined },
		} as unknown as IChatWidget;
		const widgets = { getAllWidgets: () => [widget], onDidAddWidget: Event.None, onDidRemoveWidget: Event.None } as unknown as IChatWidgetService;
		const accepted = store.add(new Emitter<IChatRequestAcceptedEvent>());
		const chatService = { onDidAcceptRequest: accepted.event } as unknown as IChatService;
		const observer = { activeSessions: [{ resource: session, host: 'chatView' }] } as unknown as IChatSessionObserverService;
		const features = new LanguageFeaturesService();
		const drafts = store.add(new ChatDraftRequestService());
		const models: ITextModel[] = [];
		const service = store.add(new ChatInputSuggestionService(features, widgets, chatService, observer, drafts, new TestConfigurationService(), { getModels: () => models } as unknown as IModelService));
		const states: IChatInputSuggestionEvent[] = [];
		const submissions: IChatRequestSubmission[] = [];
		store.add(service.onDidChangeSuggestionState(e => states.push(e)));
		store.add(service.onDidSubmitRequest(e => submissions.push(e)));

		const provider = features.inlineCompletionsProvider.all(model)[0];
		const ctx = { triggerKind: InlineCompletionTriggerKind.Automatic, selectedSuggestionInfo: undefined, includeInlineEdits: false, includeInlineCompletions: true, requestIssuedDateTime: 0, earliestShownDateTime: 0 } as never;
		const provide = async () => (await provider.provideInlineCompletions(model, model.getFullModelRange().getEndPosition(), ctx, CancellationToken.None))?.items[0];

		assert.strictEqual(await provide(), undefined);
		service.setSuggestion('ext', session, { id: 'r1', text: 'Run the full suite, then commit.' });
		const item = await provide();
		assert.strictEqual(item?.insertText, 'Run the full suite, then commit.');
		// Shown in the visible input before it is focused, and kept there on blur.
		assert.deepStrictEqual(options.at(-1), { inlineSuggest: { enabled: true, keepOnBlur: true } });

		// A prefix of the suggestion keeps it; other text hides it (never over what the user typed).
		model.setValue('Run the');
		assert.strictEqual((await provide())?.insertText, 'Run the full suite, then commit.');
		model.setValue('Push it');
		assert.strictEqual(await provide(), undefined);
		assert.deepStrictEqual(states.map(s => [s.state, s.reason]), [['hidden', 'userTypedFirst']]);

		model.setValue('');
		const shown = (await provide())!;
		provider.handleItemDidShow?.({ items: [shown] }, shown, '', undefined as never);
		provider.handleEndOfLifetime?.({ items: [shown] }, shown, { kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction: false }, undefined as never);
		assert.deepStrictEqual(states.slice(1).map(s => s.state), ['shown', 'accepted']);

		drafts.setDraft({ id: 'd1', owner: 'ext', session, text: 'Check the CHANGELOG', label: 'Suggested', createdAt: 1 });
		drafts.stageForSubmit('d1');
		accepted.fire({ chatSessionResource: session, isNewSession: false, text: 'Run the full suite, then commit.', queue: ChatRequestQueueKind.Steering });
		assert.strictEqual(submissions.length, 1);
		assert.deepStrictEqual({ kind: submissions[0].kind, from: submissions[0].fromSuggestion?.id, draft: submissions[0].fromDraft?.id }, { kind: 'steer', from: 'r1', draft: 'd1' });
		assert.strictEqual(service.getSuggestion(session), undefined);
	});

	function suggestionHarness(session: URI) {
		const input = store.add(createTextModel('', null, undefined, URI.from({ scheme: Schemas.vscodeChatInput, path: '/input-2' })));
		const widget = {
			viewModel: { sessionResource: session, model: { hasRequests: true } }, visible: true, onDidShow: Event.None, onDidChangeViewModel: Event.None,
			inputEditor: { getModel: () => input, hasTextFocus: () => false, onDidFocusEditorText: Event.None, updateOptions: () => { }, getOption: () => '', getContribution: () => undefined },
		} as unknown as IChatWidget;
		const widgets = { getAllWidgets: () => [widget], onDidAddWidget: Event.None, onDidRemoveWidget: Event.None } as unknown as IChatWidgetService;
		const chatService = { onDidAcceptRequest: Event.None } as unknown as IChatService;
		const observer = { activeSessions: [{ resource: session, host: 'agentsWindow' }] } as unknown as IChatSessionObserverService;
		const features = new LanguageFeaturesService();
		const drafts = store.add(new ChatDraftRequestService());
		const models: ITextModel[] = [];
		const service = store.add(new ChatInputSuggestionService(features, widgets, chatService, observer, drafts, new TestConfigurationService(), { getModels: () => models } as unknown as IModelService));
		const states: IChatInputSuggestionEvent[] = [];
		const submissions: IChatRequestSubmission[] = [];
		store.add(service.onDidChangeSuggestionState(e => states.push(e)));
		store.add(service.onDidSubmitRequest(e => submissions.push(e)));
		const ctx = { triggerKind: InlineCompletionTriggerKind.Automatic, selectedSuggestionInfo: undefined, includeInlineEdits: false, includeInlineCompletions: true, requestIssuedDateTime: 0, earliestShownDateTime: 0 } as never;
		const provide = async (model = input) => (await features.inlineCompletionsProvider.all(model)[0].provideInlineCompletions(model, model.getFullModelRange().getEndPosition(), ctx, CancellationToken.None))?.items[0];
		return { service, states, submissions, provide, provider: features.inlineCompletionsProvider.all(input)[0], input, models };
	}

	test('answer surfaces: a shown carousel takes the answer from the input; the suggested pick accepts it', async () => {
		const session = URI.parse('agent-host-claude:/s2');
		const { service, states, submissions, provide } = suggestionHarness(session);
		const answerBox = store.add(createTextModel('', null, undefined, URI.from({ scheme: CHAT_QUESTION_ANSWER_SCHEME, path: '/a1', query: session.toString() })));
		service.setSuggestion('ext', session, { id: 'a1', answer: { questionId: 'q1', selectedOptions: ['vitest'], freeform: 'with coverage' } });

		const claim = service.claimAnswerSurface(session);
		assert.strictEqual(await provide(), undefined);
		assert.strictEqual((await provide(answerBox))?.insertText, 'with coverage');

		service.reportAnswerInteraction(session, 'shown');
		service.reportAnswerInteraction(session, 'shown');
		service.reportAnswer(session, { kind: 'answer', selected: ['vitest'], text: '' });
		claim.dispose();
		assert.deepStrictEqual(states.map(s => [s.state, s.host, s.selectedOptions?.join()]), [['shown', 'agentsWindow', undefined], ['accepted', 'agentsWindow', 'vitest']]);
		assert.deepStrictEqual(submissions.map(s => [s.kind, s.text, s.fromSuggestion?.id]), [['answer', 'vitest', 'a1']]);
		assert.strictEqual(service.getSuggestion(session), undefined);
	});

	test('answer surfaces: suggested feedback taken in with Tab and then rewritten still links the decision', () => {
		const session = URI.parse('agent-host-codex:/s3');
		const { service, states, submissions } = suggestionHarness(session);
		service.setSuggestion('ext', session, { id: 'p1', answer: { reviewId: 'r1', freeform: 'Split step 3 into two PRs' } });
		const claim = service.claimAnswerSurface(session);
		service.reportAnswerInteraction(session, 'accepted', 25);
		service.reportAnswer(session, { kind: 'planDecision', selected: [], text: 'Keep one PR, but add a migration test' });
		claim.dispose();
		assert.deepStrictEqual(states.map(s => [s.state, s.acceptedChars]), [['accepted', 25]]);
		assert.deepStrictEqual(submissions.map(s => [s.kind, s.fromSuggestion?.id, s.fromSuggestion?.acceptedChars]), [['planDecision', 'p1', 25]]);
	});

	test('input suggestions: Esc dismisses it for good; only a newer one shows again', async () => {
		const session = URI.parse('agent-host-copilotcli:/s4');
		const { service, states, provide, provider } = suggestionHarness(session);
		service.setSuggestion('ext', session, { id: 'r1', text: 'Dig deeper on Helmsignal.' });
		const shown = (await provide())!;
		provider.handleItemDidShow?.({ items: [shown] }, shown, '', undefined as never);
		provider.handleEndOfLifetime?.({ items: [shown] }, shown, { kind: InlineCompletionEndOfLifeReasonKind.Rejected }, undefined as never);
		assert.strictEqual(await provide(), undefined);
		assert.deepStrictEqual(states.map(s => s.state), ['shown', 'rejected']);
		service.setSuggestion('ext', session, { id: 'r2', text: 'Pick Helmsignal.' });
		assert.strictEqual((await provide())?.insertText, 'Pick Helmsignal.');
	});

	test('input suggestions: a new one is taken only if it keeps every word typed, and never replaces one being typed along or taken in', async () => {
		const session = URI.parse('agent-host-copilotcli:/s5');
		const { service, provide, provider, input } = suggestionHarness(session);
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'r1', text: 'Commit it, but don\'t push yet.' }), true);
		input.setValue('Not yet, first');
		// It would drop their words: not taken, and the one there stays.
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'r2', text: 'Show me the diff first.' }), false);
		assert.strictEqual(service.getSuggestion(session)?.id, 'r1');
		// It goes on from them: taken, and shown.
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'r3', text: 'Not yet, first show me the diff.' }), true);
		assert.strictEqual((await provide())?.insertText, 'Not yet, first show me the diff.');
		// They type along it: a newer one that also fits doesn't change it under them.
		input.setValue('Not yet, first show');
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'r4', text: 'Not yet, first show the tests.' }), false);
		// Tab took it in, and they edit it: it stays theirs.
		const shown = (await provide())!;
		provider.handleItemDidShow?.({ items: [shown] }, shown, '', undefined as never);
		provider.handleEndOfLifetime?.({ items: [shown] }, shown, { kind: InlineCompletionEndOfLifeReasonKind.Accepted, alternativeAction: false }, undefined as never);
		input.setValue('Not yet, first show me the full diff.');
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'r5', text: 'Not yet, first show me the full diff. Then commit.' }), false);
		// Once they cleared it and began another reply, it no longer holds what Tab took in.
		input.setValue('Make it shorter');
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'r6', text: 'Make it shorter, please.' }), true);
		// An empty input takes any.
		input.setValue('');
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'r7', text: 'Commit it.' }), true);
	});

	test('answer surfaces: a new answer is taken only if its words go on from what the answer box holds', () => {
		const session = URI.parse('agent-host-copilotcli:/s6');
		const { service, models } = suggestionHarness(session);
		const answerBox = store.add(createTextModel('', null, undefined, URI.from({ scheme: CHAT_QUESTION_ANSWER_SCHEME, path: '/a6', query: session.toString() })));
		models.push(answerBox);
		const claim = service.claimAnswerSurface(session);
		answerBox.setValue('Option 1, but drop the');
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'a1', answer: { questionId: 'q1', selectedOptions: ['Option 2'], freeform: 'Shorter, please.' } }), false);
		assert.strictEqual(service.setSuggestion('ext', session, { id: 'a2', answer: { questionId: 'q1', selectedOptions: ['Option 1'], freeform: 'Option 1, but drop the parentheses.' } }), true);
		claim.dispose();
	});

	test('input suggestions: a widget switching sessions drops the last session\'s ghost text before showing the new one\'s', async () => {
		const a = URI.parse('agent-host-copilotcli:/a');
		const b = URI.parse('agent-host-copilotcli:/b');
		const input = store.add(createTextModel('', null, undefined, URI.from({ scheme: Schemas.vscodeChatInput, path: '/input-3' })));
		const calls: string[] = [];
		const inline = { stop: () => calls.push('stop'), trigger: () => calls.push('trigger'), state: observableValue('state', undefined) };
		const controller = { model: observableValue('model', inline) };
		const switched = store.add(new Emitter<void>());
		const widget = {
			viewModel: { sessionResource: a, model: { hasRequests: true } }, visible: true, onDidShow: Event.None, onDidChangeViewModel: switched.event,
			inputEditor: { getModel: () => input, hasTextFocus: () => false, onDidFocusEditorText: Event.None, updateOptions: () => { }, getOption: () => '', getContribution: () => controller },
		} as unknown as IChatWidget & { viewModel: { sessionResource: URI } };
		const widgets = { getAllWidgets: () => [widget], onDidAddWidget: Event.None, onDidRemoveWidget: Event.None } as unknown as IChatWidgetService;
		const observer = { activeSessions: [{ resource: a, host: 'agentsWindow' }, { resource: b, host: 'agentsWindow' }] } as unknown as IChatSessionObserverService;
		const features = new LanguageFeaturesService();
		const service = store.add(new ChatInputSuggestionService(features, widgets, { onDidAcceptRequest: Event.None } as unknown as IChatService, observer, store.add(new ChatDraftRequestService()), new TestConfigurationService(), { getModels: () => [] } as unknown as IModelService));
		const ctx = { triggerKind: InlineCompletionTriggerKind.Automatic, selectedSuggestionInfo: undefined, includeInlineEdits: false, includeInlineCompletions: true, requestIssuedDateTime: 0, earliestShownDateTime: 0 } as never;
		const provide = async () => (await features.inlineCompletionsProvider.all(input)[0].provideInlineCompletions(input, input.getFullModelRange().getEndPosition(), ctx, CancellationToken.None))?.items[0];

		service.setSuggestion('ext', a, { id: 'ra', text: 'Ship the redesign.' });
		service.setSuggestion('ext', b, { id: 'rb', text: 'Test the contact form.' });
		assert.strictEqual((await provide())?.insertText, 'Ship the redesign.');

		calls.length = 0;
		widget.viewModel.sessionResource = b;
		switched.fire();
		// Stopped first, so the input asks again rather than keep A's still-valid item.
		assert.deepStrictEqual(calls.slice(0, 2), ['stop', 'trigger']);
		assert.strictEqual((await provide())?.insertText, 'Test the contact form.');

		// To a session with no suggestion: the last one's ghost text is dropped all the same.
		service.setSuggestion('ext', a, undefined);
		calls.length = 0;
		widget.viewModel.sessionResource = a;
		switched.fire();
		assert.strictEqual(calls[0], 'stop');
		assert.strictEqual(await provide(), undefined);
	});

	test('a reloaded model mints new request IDs; index IDs emit only what is new', () => {
		const md = (value: string) => ({ kind: 'markdownContent', content: { value } });
		const request = (id: string, text: string, parts: unknown[]) => ({
			id, timestamp: 1, message: { text }, variableData: { variables: [] }, isSystemInitiated: false,
			response: { entireResponse: { value: parts }, isComplete: true, completedAt: 2, isCanceled: false, result: {} },
		});
		const chatModel = (requests: unknown[]) => ({
			getRequests: () => requests, getPendingRequests: () => [], lastRequest: requests.at(-1), lastMessageDate: 2,
			requestNeedsInput: { get: () => undefined }, hasActiveRequest: { get: () => false },
		}) as unknown as IChatModel;
		const appended: IChatSessionEventInput[] = [];
		const sink: IChatSessionTranscriptSink = { append: e => appended.push(...e), patchInfo: () => { }, storeContent: text => ({ id: String(text.length), size: text.length }) };

		const first = [request('a', 'Open a PR for the retry fix', [md('Opened PR #12.')])];
		const projector = new ChatModelProjector(chatModel(first), sink, () => [], { indexIds: true });
		projector.flush();
		assert.deepStrictEqual(appended.map(e => e.kind), ['turnStarted', 'userMessage', 'agentText', 'turnEnded']);

		projector.setModel(chatModel([request('a2', 'Open a PR for the retry fix', [md('Opened PR #12.')]), request('b2', 'Address the review comment', [md('Pushed the fix.')])]));
		projector.flush();
		assert.deepStrictEqual(appended.slice(4).map(e => [e.kind, e.turnId]), [['turnStarted', 't:1'], ['userMessage', 't:1'], ['agentText', 't:1'], ['turnEnded', 't:1']]);
	});

	test('an open response its host keeps open for a background shell ends for the user once the agent falls quiet', () => {
		let clock = 1_000_000;
		let shells = 1;
		const md = (value: string) => ({ kind: 'markdownContent', content: { value } });
		const tool = (id: string, complete: boolean) => ({ kind: 'toolInvocationSerialized', toolCallId: id, toolId: 'bash', invocationMessage: 'sleep 100', isComplete: complete, isConfirmed: { type: 1 }, presentation: undefined, resultDetails: undefined, source: undefined, toolSpecificData: undefined });
		const response = { entireResponse: { value: [tool('c1', true), md('Started `sleep 100` in the background and left it running.')] as unknown[] }, isComplete: false, completedAt: undefined as number | undefined, isCanceled: false, result: {} };
		const request = { id: 'r1', timestamp: clock, message: { text: 'Start sleep 100 in the background' }, variableData: { variables: [] }, isSystemInitiated: false, response };
		let active = true;
		const model = {
			getRequests: () => [request], getPendingRequests: () => [], lastRequest: request, lastMessageDate: clock,
			requestNeedsInput: { get: () => undefined }, hasActiveRequest: { get: () => active }, backgroundShellCount: { get: () => shells },
		} as unknown as IChatModel;
		const appended: IChatSessionEventInput[] = [];
		const info: unknown[] = [];
		const sink: IChatSessionTranscriptSink = { append: e => appended.push(...e), patchInfo: i => info.push(i), storeContent: text => ({ id: String(text.length), size: text.length }) };
		const projector = new ChatModelProjector(model, sink, () => [], { now: () => clock });

		projector.flush();
		assert.strictEqual(projector.status, 'working');
		assert.strictEqual(projector.quietCheckInMs, 3_000);
		assert.deepStrictEqual(appended.filter(e => e.kind === 'turnEnded' || e.kind === 'agentText'), []);

		clock += 3_000;
		projector.flush();
		assert.deepStrictEqual(appended.slice(-2).map(e => [e.kind, e.id]), [['agentText', 'md:req:r1:1'], ['turnEnded', 'end:req:r1:quiet1']]);
		assert.strictEqual(projector.status, 'waiting');
		assert.strictEqual((info.at(-1) as { status: string }).status, 'waiting');

		// The shell finishes and the host closes the response with nothing new: no second end.
		active = false;
		shells = 0;
		response.isComplete = true;
		response.completedAt = clock + 60_000;
		const before = appended.length;
		projector.flush();
		assert.deepStrictEqual(appended.slice(before), []);
	});

	test('a quiet response reopens when the agent works again, and waits longer with no background shell', () => {
		let clock = 1_000_000;
		const md = (value: string) => ({ kind: 'markdownContent', content: { value } });
		const tool = (id: string, complete: boolean) => ({ kind: 'toolInvocationSerialized', toolCallId: id, toolId: 'read_bash', invocationMessage: 'read', isComplete: complete, isConfirmed: { type: 1 }, presentation: undefined, resultDetails: undefined, source: undefined, toolSpecificData: undefined });
		const response = { entireResponse: { value: [md('Done. Anything else?')] as unknown[] }, isComplete: false, completedAt: undefined, isCanceled: false, result: {} };
		const request = { id: 'r1', timestamp: clock, message: { text: 'Ship it' }, variableData: { variables: [] }, isSystemInitiated: false, response };
		const model = {
			getRequests: () => [request], getPendingRequests: () => [], lastRequest: request, lastMessageDate: clock,
			requestNeedsInput: { get: () => undefined }, hasActiveRequest: { get: () => true },
		} as unknown as IChatModel;
		const appended: IChatSessionEventInput[] = [];
		const sink: IChatSessionTranscriptSink = { append: e => appended.push(...e), patchInfo: () => { }, storeContent: text => ({ id: String(text.length), size: text.length }) };
		const projector = new ChatModelProjector(model, sink, () => [], { now: () => clock });
		projector.flush();
		clock += 3_000;
		projector.flush();
		assert.ok(!appended.some(e => e.kind === 'turnEnded'));
		clock += 12_000;
		projector.flush();
		assert.deepStrictEqual(appended.filter(e => e.kind === 'turnEnded').map(e => e.id), ['end:req:r1:quiet1']);

		response.entireResponse.value = [md('Done. Anything else?'), tool('c2', false)];
		const before = appended.length;
		projector.flush();
		assert.deepStrictEqual(appended.slice(before)[0], { id: 'req:r1:quiet1', at: clock, turnId: 'req:r1', kind: 'turnStarted', trigger: 'system' });
		assert.strictEqual(projector.status, 'working');
	});

	test('session list: a window\'s own list joins the agent sessions model\'s, which wins on the same session', async () => {
		const info = (resource: string, title: string): IChatSessionObservedInfo => ({
			resource: URI.parse(resource), provider: 'agentHost', title, status: 'waiting', createdAt: 1, lastActivityAt: Date.now(), readState: { isRead: true }, archived: false,
			capabilities: { steering: true, queueing: true, inputSuggestions: true, questions: true, planReview: true },
			fidelity: { reasoning: 'none', toolOutput: 'truncated', diffs: 'none', timestamps: 'perTurn', modelCalls: false, liveWithoutWidget: false, liveLatencyMs: 0 },
		});
		const agentSession = { resource: URI.parse('agent-host-copilotcli:/b'), providerType: 'agent-host', label: 'From the model', status: 1, timing: { created: 1, lastRequestEnded: Date.now() }, isRead: () => true, isArchived: () => false };
		const model = { resolved: true, sessions: [agentSession], onDidResolve: Event.None, onDidChangeSessions: Event.None, onDidChangeSessionArchivedState: Event.None };
		const widgets = { onDidAddWidget: Event.None, onDidChangeFocusedWidget: Event.None, onDidChangeFocusedSession: Event.None, getAllWidgets: () => [], lastFocusedWidget: undefined };
		const source = { priority: 0, canObserve: () => false, observe: async () => ({ dispose() { } }), dispose() { } };
		const observer = store.add(new ChatSessionObserverService(
			{ model } as never, widgets as never, { onDidChangeFocus: Event.None, hasFocus: false } as never, { isSessionsWindow: true } as never, {} as never,
			{ createInstance: () => source } as never, new NullLogService(), { onModelAdded: Event.None, getModels: () => [] } as never,
		));
		const changed = store.add(new Emitter<void>());
		let listed = [info('agent-host-copilotcli:/a', 'Only in the window'), info('agent-host-copilotcli:/b', 'From the window')];
		store.add(observer.registerSessionList({ onDidChange: changed.event, getSessions: () => listed }));
		const titles = async () => (await observer.getSessions()).map(i => i.title).sort();
		assert.deepStrictEqual(await titles(), ['From the model', 'Only in the window']);
		const events: IChatSessionsObservedChangeEvent[] = [];
		store.add(observer.onDidChangeSessions(e => events.push(e)));
		listed = [...listed, info('agent-host-copilotcli:/c', 'New in the window')];
		changed.fire();
		assert.deepStrictEqual(events.map(e => e.added.map(i => i.title)), [['New in the window']]);
		assert.deepStrictEqual(await titles(), ['From the model', 'New in the window', 'Only in the window']);
	});

	test('annotations: per owner, merged in time order, and gone with their owner', () => {
		const service = store.add(new ChatSessionAnnotationService());
		const session = URI.parse('agent-host-copilotcli:/s9');
		const changed: string[] = [];
		store.add(service.onDidChangeAnnotations(uri => changed.push(uri.toString())));
		service.setAnnotations('ext1', session, [{ id: 'd2', timestamp: 20, label: 'later' }]);
		service.setAnnotations('ext2', session, [{ id: 'x1', timestamp: 10, label: 'earlier' }]);
		assert.deepStrictEqual(service.getAnnotations(session).map(a => a.id), ['x1', 'd2']);
		service.clearOwner('ext2');
		assert.deepStrictEqual(service.getAnnotations(session).map(a => a.id), ['d2']);
		service.setAnnotations('ext1', session, []);
		assert.deepStrictEqual(service.getAnnotations(session), []);
		assert.strictEqual(changed.length, 4);
	});

	test('attention: a mark per owner, found by the session or its chat, gone with its owner', () => {
		const session = URI.parse('agent-host-copilotcli:/s10');
		const chat = URI.parse('vscode-chat-session://local/s10');
		const changed: string[] = [];
		store.add(chatSessionAttentionRegistry.onDidChange(uri => changed.push(uri.toString())));
		chatSessionAttentionRegistry.set('ext1', chat, { icon: ThemeIcon.fromId('comment-draft'), tooltip: 'A steer to review' });
		assert.strictEqual(chatSessionAttentionRegistry.get(session), undefined);
		assert.strictEqual(chatSessionAttentionRegistry.get(session, chat)?.tooltip, 'A steer to review');
		chatSessionAttentionRegistry.clearOwner('ext1');
		assert.strictEqual(chatSessionAttentionRegistry.get(session, chat), undefined);
		chatSessionAttentionRegistry.set('ext1', chat, undefined);
		assert.strictEqual(changed.length, 2);
	});

	test('attention: an OS notification goes the needs-input way (window attention, then a toast that opens the session), unless notifications are off', async () => {
		const session = URI.parse('agent-host-copilotcli:/s11');
		const calls: string[] = [];
		const host = {
			focus: async (_w: unknown, o?: { mode: number }) => { calls.push(`focus:${o?.mode}`); },
			showToast: async (o: { title: string; body: string; dedupeKey?: string }) => { calls.push(`toast:${o.title}|${o.body}|${o.dedupeKey}`); return { clicked: true, supported: true }; },
		} as unknown as IHostService;
		const widgets = { getWidgetBySessionResource: () => undefined, openSession: async () => { calls.push('open'); return undefined; } } as unknown as IChatWidgetService;
		const chatService = { getSession: () => ({ title: 'Ambient names' }) } as unknown as IChatService;
		const config = new TestConfigurationService({ [ChatConfiguration.NotifyWindowOnConfirmation]: 'off' });
		const service = store.add(new ChatSessionAttentionService(host, config, widgets, chatService));

		const off = await service.notify('ext', session, { body: 'NAP drafted a steer' });
		assert.deepStrictEqual([off.shown, off.reason, await off.clicked], [false, 'off', false]);
		assert.strictEqual(calls.length, 0);

		await config.setUserConfiguration(ChatConfiguration.NotifyWindowOnConfirmation, 'always');
		const shown = await service.notify('ext', session, { body: 'NAP drafted a steer' });
		assert.strictEqual(shown.shown, true);
		assert.strictEqual(await shown.clicked, true);
		assert.ok(calls.includes(`toast:Session: Ambient names|NAP drafted a steer|chat-session:${session.toString()}:attention`));
		assert.strictEqual(calls.at(-1), 'open');
	});
});

