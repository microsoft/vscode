/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfirmationOptionKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ElicitationState, IChatElicitationRequest, IChatModelReference, IChatQuestionAnswers, IChatQuestionCarousel, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel, ChatRequestModel, ChatResponseModel, IChatChangeEvent } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatToolInvocation } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolDataSource } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ProjectBoardQuestionPreview } from '../../browser/projectBoardQuestions.js';

suite('ProjectBoardQuestionPreview', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPreview(chat: Pick<IChat, 'resource' | 'status'>, chatService: IChatService, logService: ILogService, chatSessionsService: IChatSessionsService = new class extends mock<IChatSessionsService>() {
		override getMaterializedSessionResource() { return undefined; }
	}()) {
		return store.add(new ProjectBoardQuestionPreview(chat, chatService, logService, chatSessionsService));
	}

	function setupPreview(resource = URI.parse('test-chat:session#child')) {
		const chat = new class extends mock<IChat>() {
			override readonly resource = resource;
			override readonly status = observableValue('status', SessionStatus.NeedsInput);
			override readonly isRead = observableValue('isRead', false);
		}();
		const changed = store.add(new Emitter<IChatChangeEvent>());
		const disposed = store.add(new Emitter<void>());
		const answers = store.add(new Emitter<{ requestId: string; resolveId: string; answers: IChatQuestionAnswers | undefined }>());
		const model = new class extends mock<ChatModel>() {
			override get sessionResource() { return chat.resource; }
			override readonly onDidChange = changed.event;
			override readonly onDidDispose = disposed.event;
			override readonly lastRequestObs = observableValue<ChatRequestModel | undefined>('lastRequest', undefined);
			override get lastRequest() { return this.lastRequestObs.get(); }
			override getRequests(): never { throw new Error('Must not scan transcript history'); }
		}();
		const response = store.add(new ChatResponseModel({
			session: model, responseContent: [], requestId: 'request', codeBlockInfos: undefined
		}));
		model.lastRequestObs.set(new class extends mock<ChatRequestModel>() {
			override readonly id = 'request';
			override readonly response = response;
		}(), undefined);
		const state = { acquired: 0, released: 0 };
		const notifications: { requestId: string; resolveId: string; answers: IChatQuestionAnswers | undefined }[] = [];
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidReceiveQuestionCarouselAnswer = answers.event;
			override notifyQuestionCarouselAnswer(requestId: string, resolveId: string, result: IChatQuestionAnswers | undefined): void {
				const notification = { requestId, resolveId, answers: result };
				notifications.push(notification);
				answers.fire(notification);
			}
			override acquireExistingSession(resource: URI) {
				assert.strictEqual(resource, chat.resource);
				state.acquired++;
				return { object: model, dispose: () => { state.released++; } };
			}
			override async acquireOrLoadSession(): Promise<never> { throw new Error('Must reuse the existing model'); }
		}();
		const logService = store.add(new NullLogService());
		return { chat, model, response, state, changed, disposed, answers, chatService, logService, notifications };
	}

	test('PB-15 answering uses the exact pending request, backend values and one shared completion', () => {
		const h = setupPreview();
		const carousel = new ChatQuestionCarouselData([{
			id: 'choice', type: 'singleSelect', title: 'Choose',
			options: [{ id: 'shown', label: 'Displayed choice', value: 'backend-value' }],
		}], false, 'resolve-choice');
		h.response.updateContent(carousel);
		const preview = createPreview(h.chat, h.chatService, h.logService);
		const pending = preview.questionCarousels.get()[0];
		assert.ok(preview.submit(pending, new Map([['choice', { selectedValue: 'backend-value' }]])));
		assert.strictEqual(preview.submit(pending, new Map([['choice', { freeformValue: 'Duplicate' }]])), false);
		assert.deepStrictEqual({
			notifications: h.notifications, data: carousel.data, settled: carousel.completion.isSettled,
			pending: preview.questionCarousels.get().length, read: h.chat.isRead.get(),
		}, {
			notifications: [{ requestId: 'request', resolveId: 'resolve-choice', answers: { choice: { selectedValue: 'backend-value' } } }],
			data: { choice: { selectedValue: 'backend-value' } }, settled: true, pending: 0, read: false,
		});
	});

	test('PB-15 custom answers and skip use the provider answer channel, stale and disposed requests cannot submit', () => {
		const h = setupPreview();
		const custom = new ChatQuestionCarouselData([{ id: 'text', type: 'text', title: 'Custom answer' }], true, 'custom');
		h.response.updateContent(custom);
		const preview = createPreview(h.chat, h.chatService, h.logService);
		assert.ok(preview.submit(preview.questionCarousels.get()[0], new Map([['text', 'My answer']])));
		const next = new ChatQuestionCarouselData([{ id: 'next', type: 'text', title: 'Next answer' }], true, 'next');
		h.response.updateContent(next);
		const pending = preview.questionCarousels.get()[0];
		h.answers.fire({ requestId: 'request', resolveId: 'next', answers: { next: 'Answered in the chat' } });
		assert.strictEqual(preview.submit(pending, new Map([['next', 'Stale board answer']])), false);
		const skipped = new ChatQuestionCarouselData([{ id: 'skip', type: 'text', title: 'Skip' }], true, 'skip');
		h.response.updateContent(skipped);
		assert.ok(preview.submit(preview.questionCarousels.get()[0], undefined));
		const disposed = new ChatQuestionCarouselData([{ id: 'disposed', type: 'text', title: 'Disposed' }], true, 'disposed');
		h.response.updateContent(disposed);
		const last = preview.questionCarousels.get()[0];
		preview.dispose();
		assert.strictEqual(preview.submit(last, new Map([['disposed', 'Too late']])), false);
		assert.deepStrictEqual(h.notifications, [
			{ requestId: 'request', resolveId: 'custom', answers: { text: 'My answer' } },
			{ requestId: 'request', resolveId: 'skip', answers: undefined },
		]);
	});

	test('PB-15 truncated or unresolvable forms never become partial interactive forms', () => {
		const h = setupPreview();
		h.response.updateContent(new ChatQuestionCarouselData(Array.from({ length: 9 }, (_, i) => ({ id: String(i), type: 'text', title: 'Too many questions' })), true));
		const preview = createPreview(h.chat, h.chatService, h.logService);
		assert.strictEqual(preview.questionCarousels.get().length, 0);
		assert.ok(preview.preview.get().kind === 'ready');
	});

	test('projects the actual question and display-ordered options without answering or marking read', () => {
		const { chat, response, chatService, logService } = setupPreview();
		const carousel = new ChatQuestionCarouselData([{
			id: 'database', type: 'singleSelect', title: 'Database',
			message: new MarkdownString('Which **database** should we use?'),
			description: 'Choose the deployment target.',
			detailedMessage: new MarkdownString('Consider **hosting costs** before choosing.'),
			required: true,
			options: [
				{ id: 'sqlite', label: 'SQLite', value: 'sqlite-value' },
				{ id: 'postgres', label: 'PostgreSQL', value: 'postgres-value' },
			],
			defaultValue: 'postgres', allowFreeformInput: true,
		}], true);
		carousel.message = new MarkdownString('Choose the **project** settings.');
		response.updateContent(carousel);
		const before = JSON.stringify(carousel);
		const preview = createPreview(chat, chatService, logService);
		assert.deepStrictEqual(preview.preview.get(), {
			kind: 'ready',
			questions: [{
				id: 'database', type: 'singleSelect', title: 'Database',
				text: 'Which **database** should we use?', description: 'Choose the deployment target.',
				detailedMessage: 'Consider **hosting costs** before choosing.', required: true,
				carouselMessage: 'Choose the **project** settings.',
				options: [{ id: 'postgres', label: 'PostgreSQL' }, { id: 'sqlite', label: 'SQLite' }],
				allowFreeformInput: true, allowSkip: true,
			}],
			permissions: [],
			unsupported: [],
			truncated: false,
		});
		assert.deepStrictEqual({ data: JSON.stringify(carousel), settled: carousel.completion.isSettled, read: chat.isRead.get() }, {
			data: before, settled: false, read: false,
		});
	});

	test('observes NeedsInput only and clears answers, response changes, and disposed previews', async () => {
		const { chat, response, state, chatService, logService } = setupPreview();
		chat.status.set(SessionStatus.Completed, undefined);
		const carousel = new ChatQuestionCarouselData([{ id: 'one', type: 'text', title: 'What should we build?' }], false);
		response.updateContent(carousel);
		const preview = createPreview(chat, chatService, logService);
		assert.deepStrictEqual({ kind: preview.preview.get().kind, acquired: state.acquired }, { kind: 'inactive', acquired: 0 });

		chat.status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(preview.preview.get().kind, 'ready');
		carousel.dismiss({ one: 'A board' });
		await timeout(0);
		assert.strictEqual(preview.preview.get().kind, 'unavailable');

		response.updateContent(new ChatQuestionCarouselData([{ id: 'two', type: 'text', title: 'Which color?' }], true));
		assert.strictEqual(preview.preview.get().kind, 'ready');
		chat.status.set(SessionStatus.InProgress, undefined);
		assert.deepStrictEqual({ kind: preview.preview.get().kind, ...state }, { kind: 'inactive', acquired: 1, released: 1 });

		preview.dispose();
		chat.status.set(SessionStatus.NeedsInput, undefined);
		response.updateContent(new ChatQuestionCarouselData([{ id: 'three', type: 'text', title: 'Ignored after disposal?' }], false));
		assert.deepStrictEqual({ kind: preview.preview.get().kind, ...state, read: chat.isRead.get() }, { kind: 'inactive', acquired: 1, released: 1, read: false });
	});

	test('serializes NeedsInput loads and releases late references after cancellation and disposal', async () => {
		const { chat, model, logService } = setupPreview();
		const loads: { promise: DeferredPromise<IChatModelReference | undefined>; token: CancellationToken }[] = [];
		let released = 0;
		const service = new class extends mock<IChatService>() {
			override readonly onDidReceiveQuestionCarouselAnswer = Event.None;
			override acquireExistingSession() { return undefined; }
			override acquireOrLoadSession(resource: URI, location: ChatAgentLocation, token: CancellationToken) {
				assert.strictEqual(resource, chat.resource);
				assert.strictEqual(location, ChatAgentLocation.Chat);
				const promise = new DeferredPromise<IChatModelReference | undefined>();
				loads.push({ promise, token });
				return promise.p;
			}
		}();
		const preview = createPreview(chat, service, logService);
		assert.deepStrictEqual({ kind: preview.preview.get().kind, loads: loads.length }, { kind: 'loading', loads: 1 });
		chat.status.set(SessionStatus.InProgress, undefined);
		assert.ok(loads[0].token.isCancellationRequested);
		chat.status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(loads.length, 1, 'Even a cancellation-ignoring provider cannot cause concurrent loads');

		await loads[0].promise.complete({ object: model, dispose: () => { released++; } });
		await timeout(0);
		assert.deepStrictEqual({ kind: preview.preview.get().kind, loads: loads.length, released }, { kind: 'loading', loads: 2, released: 1 });
		preview.dispose();
		assert.ok(loads[1].token.isCancellationRequested);
		await loads[1].promise.complete({ object: model, dispose: () => { released++; } });
		await timeout(0);
		assert.deepStrictEqual({ kind: preview.preview.get().kind, loads: loads.length, released }, { kind: 'inactive', loads: 2, released: 2 });
	});

	test('previews tool permission metadata and clears on approval without approving itself', () => {
		const { chat, response, chatService, logService } = setupPreview();
		const tool = new ChatToolInvocation({
			invocationMessage: 'Running migration',
			confirmationMessages: {
				title: 'Run the migration?', message: new MarkdownString('This changes **the database**.'),
				customOptions: [
					{ id: 'once', label: 'Run once', kind: ConfirmationOptionKind.Approve },
					{ id: 'deny', label: 'Do not run', kind: ConfirmationOptionKind.Deny },
				],
			},
		}, { id: 'migration', displayName: 'Migration', modelDescription: 'Migrate', source: ToolDataSource.Internal }, 'tool-call', undefined, {});
		response.updateContent(tool);
		const before = tool.state.get();
		const preview = createPreview(chat, chatService, logService);
		assert.deepStrictEqual(preview.preview.get(), {
			kind: 'ready', questions: [],
			permissions: [{ kind: 'tool', title: 'Run the migration?', text: 'This changes **the database**.', options: ['Run once', 'Do not run'] }],
			unsupported: [], truncated: false,
		});
		assert.strictEqual(tool.state.get(), before);
		IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.UserAction });
		assert.strictEqual(preview.preview.get().kind, 'unavailable');
	});

	test('bounds question, option, text, and response-part projection with immutable snapshots', () => {
		const { chat, response, chatService, logService } = setupPreview();
		const carousel = new ChatQuestionCarouselData(Array.from({ length: 9 }, (_, index) => ({
			id: `q${index}`, type: 'multiSelect', title: 'x'.repeat(2050),
			detailedMessage: new MarkdownString('z'.repeat(2050)),
			options: Array.from({ length: 17 }, (_, option) => ({ id: `${option}`, label: 'y'.repeat(2050), value: `${option}` })),
		})), true);
		response.updateContent(carousel);
		const preview = createPreview(chat, chatService, logService);
		const snapshot = preview.preview.get();
		assert.strictEqual(snapshot.kind, 'ready');
		if (snapshot.kind !== 'ready') {
			assert.fail('Expected question metadata');
		}
		assert.deepStrictEqual({
			questions: snapshot.questions.length, options: snapshot.questions[0].options.length,
			text: snapshot.questions[0].text.length, label: snapshot.questions[0].options[0].label.length,
			details: snapshot.questions[0].detailedMessage?.length,
			truncated: snapshot.truncated,
		}, { questions: 8, options: 16, text: 2048, label: 2048, details: 2048, truncated: true });
		assert.ok([snapshot, snapshot.questions, snapshot.questions[0], snapshot.questions[0].options, snapshot.questions[0].options[0]].every(Object.isFrozen));
		carousel.questions[0].title = 'Changed in the model';
		carousel.questions[0].options![0].label = 'Changed option';
		assert.strictEqual(snapshot.questions[0].text, 'x'.repeat(2048));
		assert.strictEqual(snapshot.questions[0].options[0].label, 'y'.repeat(2048));

		for (let index = 0; index < 256; index++) {
			response.updateContent({ kind: 'warning', content: new MarkdownString(`Warning ${index}`) });
		}
		const limited = preview.preview.get();
		assert.strictEqual(limited.kind, 'unavailable');
		if (limited.kind === 'unavailable') {
			assert.strictEqual(limited.reason, 'previewLimit', 'Do not scan older parts beyond the bounded tail');
		}
	});

	test('previews shared confirmations and elicitations but explicitly flags unsupported plan input', () => {
		const { chat, response, chatService, logService } = setupPreview();
		response.updateContent({ kind: 'confirmation', title: 'Deploy?', message: 'Choose an environment.', buttons: ['Stage', 'Production'], data: {} });
		response.updateContent({ kind: 'confirmation', title: 'Continue?', message: 'No button metadata.', data: {} });
		const elicitation = new class extends mock<IChatElicitationRequest>() {
			override readonly kind = 'elicitation2' as const;
			override readonly title = 'Connect account?';
			override readonly message = 'The server needs access.';
			override readonly acceptButtonLabel = 'Connect';
			override readonly rejectButtonLabel = 'Cancel';
			override readonly state = observableValue('elicitation', ElicitationState.Pending);
			override async accept(): Promise<never> { throw new Error('Preview must not accept'); }
			override readonly reject = async (): Promise<never> => { throw new Error('Preview must not reject'); };
		}();
		response.updateContent(elicitation);
		response.updateContent({ kind: 'planReview', title: 'Review plan', content: 'Plan contents', actions: [], canProvideFeedback: true });
		const preview = createPreview(chat, chatService, logService);
		const snapshot = preview.preview.get();
		assert.strictEqual(snapshot.kind, 'ready');
		if (snapshot.kind !== 'ready') {
			assert.fail('Expected pending input');
		}
		assert.deepStrictEqual(snapshot.permissions, [
			{ kind: 'confirmation', title: 'Deploy?', text: 'Choose an environment.', options: ['Stage', 'Production'] },
			{ kind: 'confirmation', title: 'Continue?', text: 'No button metadata.', options: undefined },
			{ kind: 'elicitation', title: 'Connect account?', text: 'The server needs access.', options: ['Connect', 'Cancel'] },
		]);
		assert.deepStrictEqual(snapshot.unsupported.map(input => input.kind), ['planReview']);
		assert.ok(snapshot.unsupported[0].message);
		elicitation.state.set(ElicitationState.Accepted, undefined);
		const accepted = preview.preview.get();
		assert.ok(accepted.kind === 'ready' && accepted.permissions.length === 2);
	});

	test('clears plain carousels only for matching answer notifications without mutating metadata', () => {
		const { chat, response, answers, chatService, logService } = setupPreview();
		const carousel: IChatQuestionCarousel = {
			kind: 'questionCarousel', resolveId: 'resolve', allowSkip: true,
			questions: [{ id: 'name', type: 'text', title: 'What is the project name?' }],
		};
		response.updateContent(carousel);
		const before = JSON.stringify(carousel);
		const preview = createPreview(chat, chatService, logService);
		answers.fire({ requestId: 'different-request', resolveId: 'resolve', answers: undefined });
		answers.fire({ requestId: 'request', resolveId: 'different-resolve', answers: undefined });
		assert.strictEqual(preview.preview.get().kind, 'ready');
		answers.fire({ requestId: 'request', resolveId: 'resolve', answers: undefined });
		assert.strictEqual(preview.preview.get().kind, 'unavailable');
		response.updateContent({ kind: 'markdownContent', content: new MarkdownString('Continuing') });
		assert.deepStrictEqual({ kind: preview.preview.get().kind, data: JSON.stringify(carousel), read: chat.isRead.get() }, {
			kind: 'unavailable', data: before, read: false,
		});
	});

	test('preserves the chat widget freeform defaults for text, single-select, and multi-select questions', () => {
		const { chat, response, chatService, logService } = setupPreview();
		response.updateContent(new ChatQuestionCarouselData([
			{ id: 'text', type: 'text', title: 'Name?' },
			{ id: 'single', type: 'singleSelect', title: 'Target?' },
			{ id: 'multi', type: 'multiSelect', title: 'Features?', allowFreeformInput: false },
		], false));
		const preview = createPreview(chat, chatService, logService);
		const snapshot = preview.preview.get();
		assert.ok(snapshot.kind === 'ready');
		assert.deepStrictEqual(snapshot.questions.map(question => ({ type: question.type, freeform: question.allowFreeformInput })), [
			{ type: 'text', freeform: true },
			{ type: 'singleSelect', freeform: true },
			{ type: 'multiSelect', freeform: false },
		]);
	});

	test('distinguishes missing models from load failures and observes a successfully loaded model', async () => {
		const { chat, model, response } = setupPreview();
		response.updateContent(new ChatQuestionCarouselData([{ id: 'loaded', type: 'text', title: 'Loaded question?' }], false));
		const errors: (string | Error)[] = [];
		const logService = store.add(new class extends NullLogService {
			override error(message: string | Error): void { errors.push(message); }
		}());
		let result: 'missing' | 'error' | 'loaded' = 'missing';
		let released = 0;
		const service = new class extends mock<IChatService>() {
			override readonly onDidReceiveQuestionCarouselAnswer = Event.None;
			override acquireExistingSession() { return undefined; }
			override async acquireOrLoadSession() {
				if (result === 'error') {
					throw new Error('Provider unavailable');
				}
				return result === 'loaded' ? { object: model, dispose: () => { released++; } } : undefined;
			}
		}();
		const preview = createPreview(chat, service, logService);
		await timeout(0);
		const missing = preview.preview.get();
		assert.ok(missing.kind === 'unavailable' && missing.reason === 'modelUnavailable');
		assert.strictEqual(errors.length, 0);

		result = 'error';
		chat.status.set(SessionStatus.InProgress, undefined);
		chat.status.set(SessionStatus.NeedsInput, undefined);
		await timeout(0);
		const failed = preview.preview.get();
		assert.ok(failed.kind === 'error' && failed.error === 'Provider unavailable' && failed.message.length > 0);
		assert.strictEqual(errors.length, 1);

		result = 'loaded';
		chat.status.set(SessionStatus.InProgress, undefined);
		chat.status.set(SessionStatus.NeedsInput, undefined);
		await timeout(0);
		assert.strictEqual(preview.preview.get().kind, 'ready');
		preview.dispose();
		assert.deepStrictEqual({ released, read: chat.isRead.get(), errors: errors.length }, { released: 1, read: false, errors: 1 });
	});

	test('logs and exposes completion failures instead of returning a successful empty preview', async () => {
		const { chat, response, chatService } = setupPreview();
		const errors: (string | Error)[] = [];
		const logService = store.add(new class extends NullLogService {
			override error(message: string | Error): void { errors.push(message); }
		}());
		const carousel = new ChatQuestionCarouselData([{ id: 'failure', type: 'text', title: 'A pending question?' }], false);
		response.updateContent(carousel);
		const preview = createPreview(chat, chatService, logService);
		await carousel.completion.error(new Error('Input transport failed'));
		await timeout(0);
		const failed = preview.preview.get();
		assert.ok(failed.kind === 'error' && failed.error === 'Input transport failed');
		assert.strictEqual(errors.length, 1);
	});

	test('observes only the latest visible request and releases subscriptions when the model is disposed', () => {
		const { chat, model, response, state, changed, disposed, answers, chatService, logService } = setupPreview();
		response.updateContent(new ChatQuestionCarouselData([{ id: 'old', type: 'text', title: 'Old question?' }], false));
		const preview = createPreview(chat, chatService, logService);
		const observed: string[] = [];
		store.add(autorun(reader => observed.push(preview.preview.read(reader).kind)));
		const latest = store.add(new ChatResponseModel({ session: model, responseContent: [], requestId: 'latest', codeBlockInfos: undefined }));
		model.lastRequestObs.set(new class extends mock<ChatRequestModel>() {
			override readonly id = 'latest';
			override readonly response = latest;
		}(), undefined);
		assert.strictEqual(preview.preview.get().kind, 'unavailable');
		latest.updateContent(new ChatQuestionCarouselData([{ id: 'new', type: 'text', title: 'New question?' }], true));
		const snapshot = preview.preview.get();
		assert.ok(snapshot.kind === 'ready' && snapshot.questions[0].id === 'new');
		response.updateContent(new ChatQuestionCarouselData([{ id: 'stale', type: 'text', title: 'Old transcript update' }], true));
		assert.strictEqual(preview.preview.get(), snapshot);
		latest.complete();
		assert.strictEqual(preview.preview.get().kind, 'unavailable');
		disposed.fire();
		const unavailable = preview.preview.get();
		assert.ok(unavailable.kind === 'unavailable' && unavailable.reason === 'modelDisposed');
		assert.deepStrictEqual({
			...state, modelListeners: changed.hasListeners(), answerListeners: answers.hasListeners(),
			disposeListeners: disposed.hasListeners(), observed,
		}, {
			acquired: 1, released: 1, modelListeners: false, answerListeners: false, disposeListeners: false,
			observed: ['ready', 'unavailable', 'ready', 'unavailable', 'unavailable'],
		});
	});

	test('does not invent tool options and explicitly flags post-approval rather than repeating the execution question', async () => {
		const { chat, response, chatService, logService } = setupPreview();
		const tool = new ChatToolInvocation({
			invocationMessage: 'Read files',
			confirmationMessages: { title: 'Read the files?', message: 'Read configuration files.', confirmResults: true },
		}, { id: 'read', displayName: 'Read', modelDescription: 'Read files', source: ToolDataSource.Internal }, 'read-call', undefined, {});
		response.updateContent(tool);
		const preview = createPreview(chat, chatService, logService);
		const pending = preview.preview.get();
		assert.ok(pending.kind === 'ready' && pending.permissions[0].options === undefined);
		IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.UserAction });
		await tool.didExecuteTool({ content: [{ kind: 'text', value: 'Tool results, not a question' }] });
		const result = preview.preview.get();
		assert.ok(result.kind === 'ready');
		assert.deepStrictEqual({ questions: result.questions, permissions: result.permissions, unsupported: result.unsupported.map(input => input.kind) }, {
			questions: [], permissions: [], unsupported: ['toolPostApproval'],
		});
	});

	test('bounds permission count and option labels as well as questionnaire content', () => {
		const { chat, response, chatService, logService } = setupPreview();
		for (let index = 0; index < 9; index++) {
			response.updateContent({
				kind: 'confirmation', title: `Permission ${index}`, message: 'Permission details', data: {},
				buttons: Array.from({ length: 17 }, (_, index) => `Option ${index}`),
			});
		}
		const preview = createPreview(chat, chatService, logService);
		const snapshot = preview.preview.get();
		assert.ok(snapshot.kind === 'ready');
		assert.deepStrictEqual({ count: snapshot.permissions.length, options: snapshot.permissions[0].options?.length, truncated: snapshot.truncated }, {
			count: 8, options: 16, truncated: true,
		});
		assert.ok([snapshot.permissions, snapshot.permissions[0], snapshot.permissions[0].options].every(Object.isFrozen));
	});

	test('disposal while awaiting answers removes observers and ignores subsequent completion', async () => {
		const { chat, response, state, changed, answers, chatService, logService } = setupPreview();
		const carousel = new ChatQuestionCarouselData([{ id: 'pending', type: 'text', title: 'Still waiting?' }], true);
		response.updateContent(carousel);
		const preview = createPreview(chat, chatService, logService);
		const snapshot = preview.preview.get();
		preview.dispose();
		carousel.dismiss(undefined);
		answers.fire({ requestId: 'request', resolveId: 'pending', answers: undefined });
		await timeout(0);
		assert.deepStrictEqual({
			...state, kind: preview.preview.get().kind, snapshot: snapshot.kind,
			modelListeners: changed.hasListeners(), answerListeners: answers.hasListeners(), read: chat.isRead.get(),
		}, { acquired: 1, released: 1, kind: 'inactive', snapshot: 'ready', modelListeners: false, answerListeners: false, read: false });
	});

	test('logs synchronous reference acquisition failures and does not automatically retry them', () => {
		const { chat } = setupPreview();
		let acquisitions = 0;
		const errors: (string | Error)[] = [];
		const logService = store.add(new class extends NullLogService {
			override error(message: string | Error): void { errors.push(message); }
		}());
		const service = new class extends mock<IChatService>() {
			override acquireExistingSession(): never {
				acquisitions++;
				throw new Error('Model reference failure');
			}
		}();
		const preview = createPreview(chat, service, logService);
		const failed = preview.preview.get();
		assert.ok(failed.kind === 'error' && failed.error === 'Model reference failure');
		assert.deepStrictEqual({ acquisitions, errors: errors.length, read: chat.isRead.get() }, { acquisitions: 1, errors: 1, read: false });
	});

	test('reuses the canonical model for a materialized draft without loading the untitled widget resource', () => {
		const untitled = URI.parse('agent-host-copilotcli:/untitled-preview');
		const canonical = URI.parse('agent-host-copilotcli:/release-dashboard');
		const { chat, response, state, chatService, logService } = setupPreview(canonical);
		const carousel = new ChatQuestionCarouselData([{
			id: 'layout', type: 'singleSelect', title: 'Release dashboard',
			message: 'Which layout should the release dashboard use?',
			options: ['List', 'Grid', 'Timeline'].map(label => ({ id: label, label, value: label })),
			allowFreeformInput: false,
		}], false);
		response.updateContent(carousel);
		const chatSessionsService = new class extends mock<IChatSessionsService>() {
			override getMaterializedSessionResource(resource: URI) {
				return resource.toString() === untitled.toString() ? canonical : undefined;
			}
		}();
		const preview = createPreview({ resource: untitled, status: chat.status }, chatService, logService, chatSessionsService);
		const snapshot = preview.preview.get();
		assert.ok(snapshot.kind === 'ready');
		assert.deepStrictEqual({
			text: snapshot.questions[0].text,
			options: snapshot.questions[0].options.map(option => option.label),
			acquired: state.acquired, read: chat.isRead.get(), settled: carousel.completion.isSettled,
		}, {
			text: 'Which layout should the release dashboard use?',
			options: ['List', 'Grid', 'Timeline'], acquired: 1, read: false, settled: false,
		});
		preview.dispose();
		assert.strictEqual(state.released, 1);
	});
});
