/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatModelReference, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel, ChatRequestModel, ChatResponseModel, IChatChangeEvent, IChatModelInputState, IChatRequestModelParameters } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { getProjectBoardSubmittedAt, projectBoardMetadataLimits, ProjectBoardMetadata } from '../../browser/projectBoardMetadata.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ChatAgentService, IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { MockChatService } from '../../../../../workbench/contrib/chat/test/common/chatService/mockChatService.js';

suite('ProjectBoardMetadata', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const resource = URI.parse('test-chat:session#child');
		const changed = store.add(new Emitter<IChatChangeEvent>());
		const disposed = store.add(new Emitter<void>());
		const state = { acquired: 0, released: 0, scans: 0, credits: 0 };
		const inputState = observableValue<IChatModelInputState>('input', {
			attachments: [], mode: { id: 'agent', kind: ChatModeKind.Agent }, selectedModel: undefined,
			inputText: '', selections: [], contrib: {},
		});
		let tail: ChatRequestModel[] | undefined;
		const model = new class extends mock<ChatModel>() {
			override readonly inputModel = new class extends mock<ChatModel['inputModel']>() {
				override readonly state = inputState;
			}();
			override get sessionResource() { return resource; }
			override readonly onDidChange = changed.event;
			override readonly onDidDispose = disposed.event;
			override readonly requestInProgress = observableValue('requestInProgress', false);
			override readonly lastRequestObs = observableValue<ChatRequestModel | undefined>('lastRequest', undefined);
			override get lastRequest() { return this.lastRequestObs.get(); }
			override get sessionCost() { return state.credits; }
			override getRequests() {
				state.scans++;
				assert.ok(tail, 'Must not scan transcript for ordinary lastRequest');
				return tail;
			}
			override getPendingRequests(): never { throw new Error('Queued requests are not submitted prompts'); }
			override get timestamp(): never { throw new Error('Creation time is not submitted time'); }
		}();
		const log = store.add(new class extends NullLogService {
			readonly errors: unknown[] = [];
			override error(message: string | Error, ...args: unknown[]) { this.errors.push([message, ...args]); }
		}());
		const reference = (): IChatModelReference => ({ object: model, dispose: () => { state.released++; } });
		const chatService = new class extends mock<IChatService>() {
			override acquireExistingSession(uri: URI) {
				assert.strictEqual(uri.toString(), resource.toString());
				state.acquired++;
				return reference();
			}
			override async acquireOrLoadSession(): Promise<never> { throw new Error('Must reuse the existing model'); }
		}();
		const sessions = new class extends mock<IChatSessionsService>() {
			override getMaterializedSessionResource() { return undefined; }
		}();
		const create = (service: IChatService = chatService, sessionService: IChatSessionsService = sessions) => store.add(new ProjectBoardMetadata({ resource }, service, log, sessionService));
		const request = (text = 'Submitted prompt', timestamp: number | undefined = 100, options: Partial<IChatRequestModelParameters> = {}) => new ChatRequestModel({
			session: model, message: { text, parts: [] }, variableData: { variables: [] },
			timestamp, fallbackTimestamp: 99999, ...options,
		});
		return { resource, model, changed, disposed, state, inputState, log, create, reference, request, setTail: (requests: ChatRequestModel[]) => { tail = requests; } };
	}

	test('existing model uses submitted request time, ignoring response output and visit time', () => {
		const fixture = setup();
		const request = fixture.request();
		const response = store.add(new ChatResponseModel({ session: fixture.model, requestId: request.id, responseContent: [], codeBlockInfos: undefined, timestamp: 900 }));
		request.response = response;
		fixture.model.lastRequestObs.set(request, undefined);
		const metadata = fixture.create();
		const before = metadata.metadata.get();
		assert.strictEqual(before.kind, 'ready');
		assert.strictEqual(before.submittedAt, 100);
		assert.strictEqual(before.prompt, 'Submitted prompt');
		response.updateContent({ kind: 'markdownContent', content: { value: 'Agent output at T3' } });
		fixture.changed.fire({ kind: 'setCustomTitle', title: 'Generated title' });
		assert.strictEqual(metadata.metadata.get(), before, 'Agent output/visit-like model changes must not churn prompt metadata');
		assert.strictEqual(fixture.state.scans, 0);
	});

	test('new submitted requests update prompt and time', () => {
		const { model, request, create } = setup();
		model.lastRequestObs.set(request('First', 100), undefined);
		const metadata = create();
		model.lastRequestObs.set(request('Second', 500), undefined);
		const result = metadata.metadata.get();
		assert.strictEqual(result.kind, 'ready');
		assert.deepStrictEqual([result.prompt, result.submittedAt], ['Second', 500]);
	});

	test('PB-20 interrupted-response actions are discovered from the retained metadata model and clear on replacement', () => {
		const h = setup();
		const request = h.request();
		const response = store.add(new ChatResponseModel({ session: h.model, requestId: request.id, responseContent: [], codeBlockInfos: undefined }));
		request.response = response;
		h.model.lastRequestObs.set(request, undefined);
		const metadata = h.create();
		response.setResult({ errorDetails: {
			message: 'Interrupted',
			confirmationButtons: [{ label: 'Keep Going', data: { agentHostResumeTurn: true }, resend: true, preserveRequestId: true }],
		} });
		response.complete();
		assert.strictEqual(metadata.actions.get()?.request, request);
		assert.strictEqual(metadata.actions.get()?.error?.confirmationButtons?.[0].label, 'Keep Going');
		assert.strictEqual(h.state.acquired, 1);
		h.model.lastRequestObs.set(h.request('New request'), undefined);
		assert.strictEqual(metadata.actions.get(), undefined);
		assert.strictEqual(h.state.scans, 0);
	});

	test('PB-19 configuration uses the retained model without propagating input text or cursor changes', () => {
		const fixture = setup();
		const metadata = fixture.create();
		assert.strictEqual(metadata.configuration.get(), undefined);
		metadata.setIncludeConfiguration(true);
		const before = metadata.configuration.get();
		fixture.inputState.set({ ...fixture.inputState.get(), inputText: 'Private unsent text', selections: [] }, undefined);
		assert.strictEqual(metadata.configuration.get(), before, 'Typing must not rebuild board configuration rows');
		fixture.inputState.set({ ...fixture.inputState.get(), permissionLevel: ChatPermissionLevel.AutoApprove }, undefined);
		assert.strictEqual(metadata.configuration.get()?.permissionLevel, ChatPermissionLevel.AutoApprove);
		assert.strictEqual(fixture.state.acquired, 1);
		assert.ok(!Object.hasOwn(metadata.configuration.get()!, 'inputText'));
		metadata.setIncludeConfiguration(false);
		assert.strictEqual(metadata.configuration.get(), undefined);
	});

	test('PB-18 real chat model usage updates credits before a running response completes', () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IChatService, new MockChatService());
		instantiation.stub(IChatAgentService, store.add(instantiation.createInstance(ChatAgentService)));
		const model = store.add(instantiation.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const first = model.addRequest({ text: 'Previous turn', parts: [] }, { variables: [] }, 100);
		model.acceptResponseProgress(first, { kind: 'usage', promptTokens: 10, completionTokens: 10, copilotCredits: 10, sessionCopilotCredits: 10 });
		first.response!.complete();
		const service = new class extends mock<IChatService>() {
			override acquireExistingSession(): IChatModelReference { return { object: model, dispose() { } }; }
		}();
		const sessions = new class extends mock<IChatSessionsService>() {
			override getMaterializedSessionResource() { return undefined; }
		}();
		const metadata = store.add(new ProjectBoardMetadata({ resource: model.sessionResource }, service, new NullLogService(), sessions));
		metadata.setIncludeCredits(true);
		assert.strictEqual(metadata.credits.get(), 10);
		const running = model.addRequest({ text: 'Running turn', parts: [] }, { variables: [] }, 200);
		for (const cost of [0, 2.5, 2.6]) {
			model.acceptResponseProgress(running, { kind: 'usage', promptTokens: 10, completionTokens: 10, copilotCredits: cost });
			assert.strictEqual(metadata.credits.get(), 10 + cost, 'Billing refinements with identical token counts remain reactive');
			assert.strictEqual(running.response!.isComplete, false);
		}
		model.acceptResponseProgress(running, { kind: 'markdownContent', content: { value: 'Still streaming' } });
		assert.strictEqual(metadata.credits.get(), 12.6, 'Streaming without a usage report must not invent additional cost');
		running.response!.setSubagentCopilotCredits('child-call', 1);
		assert.strictEqual(metadata.credits.get(), 13.6);
		model.acceptResponseProgress(running, { kind: 'usage', promptTokens: 10, completionTokens: 10, copilotCredits: 2.6, sessionCopilotCredits: 15 });
		assert.strictEqual(metadata.credits.get(), 15, 'Delayed provider totals update without double counting');
		assert.strictEqual(running.response!.isComplete, false);
	});

	test('PB-18 credits reuse the session total, update on usage and release subscriptions when hidden', () => {
		const fixture = setup();
		const request = fixture.request();
		const response = store.add(new ChatResponseModel({ session: fixture.model, requestId: request.id, responseContent: [], codeBlockInfos: undefined }));
		request.response = response;
		fixture.model.lastRequestObs.set(request, undefined);
		fixture.setTail([request]);
		const metadata = fixture.create();
		assert.strictEqual(fixture.state.scans, 0, 'Hidden credit metrics must not scan history');
		metadata.setIncludeCredits(true);
		assert.strictEqual(metadata.credits.get(), undefined, 'Absent billing data is not zero');
		fixture.state.credits = 0;
		response.setUsage({ kind: 'usage', promptTokens: 10, completionTokens: 20, sessionCopilotCredits: 0 });
		assert.strictEqual(metadata.credits.get(), 0, 'Reported zero remains visible');
		fixture.state.credits = 12.5;
		response.setUsage({ kind: 'usage', promptTokens: 10, completionTokens: 20, copilotCredits: 2, sessionCopilotCredits: 12.5 });
		assert.strictEqual(metadata.credits.get(), 12.5, 'Use shared total, not turn + session totals');
		const scansBeforeOutput = fixture.state.scans;
		response.updateContent({ kind: 'markdownContent', content: { value: 'Streaming text must not rescan billing history' } });
		assert.strictEqual(fixture.state.scans, scansBeforeOutput);
		metadata.setIncludeCredits(false);
		const scans = fixture.state.scans;
		response.setUsage({ kind: 'usage', promptTokens: 10, completionTokens: 20, copilotCredits: 4 });
		assert.strictEqual(metadata.credits.get(), undefined);
		assert.strictEqual(fixture.state.scans, scans);
		metadata.setIncludeCredits(true);
		fixture.disposed.fire();
		assert.strictEqual(metadata.credits.get(), undefined);
	});

	test('PB-18 historical usage remains reactive when a newer turn has no credits', () => {
		const fixture = setup();
		const previous = fixture.request('Previous', 100);
		const response = store.add(new ChatResponseModel({ session: fixture.model, requestId: previous.id, responseContent: [], codeBlockInfos: undefined }));
		previous.response = response;
		const latest = fixture.request('Latest', 200);
		fixture.setTail([previous, latest]);
		fixture.model.lastRequestObs.set(latest, undefined);
		const metadata = fixture.create();
		metadata.setIncludeCredits(true);
		fixture.state.credits = 7;
		response.setUsage({ kind: 'usage', promptTokens: 1, completionTokens: 1, copilotCredits: 7 });
		assert.strictEqual(metadata.credits.get(), 7);
		assert.strictEqual(fixture.state.acquired, 1);
	});

	test('PB-18 invalid billing data is logged and exposed, never shown as a successful value', () => {
		const fixture = setup();
		const request = fixture.request();
		const response = store.add(new ChatResponseModel({ session: fixture.model, requestId: request.id, responseContent: [], codeBlockInfos: undefined }));
		request.response = response;
		fixture.setTail([request]);
		fixture.model.lastRequestObs.set(request, undefined);
		const metadata = fixture.create();
		metadata.setIncludeCredits(true);
		response.setUsage({ kind: 'usage', promptTokens: 0, completionTokens: 0, copilotCredits: NaN });
		assert.strictEqual(metadata.credits.get(), undefined);
		assert.strictEqual(metadata.creditsError.get(), 'Invalid reported AI credit usage');
		assert.strictEqual(metadata.metadata.get().kind, 'ready');
		assert.ok(fixture.log.errors.length);
		fixture.state.credits = 3;
		response.setUsage({ kind: 'usage', promptTokens: 0, completionTokens: 0, copilotCredits: 3 });
		assert.strictEqual(metadata.credits.get(), 3);
		assert.strictEqual(metadata.creditsError.get(), undefined);
		assert.strictEqual(metadata.metadata.get().kind, 'ready');
	});

	test('nonvisible loaded-model recency reads no prompt, context or response and acquires no reference', () => {
		const { model, state, request, setTail } = setup();
		const submitted = new Proxy(request(), {
			get(target, property, receiver) {
				if (property === 'message' || property === 'variableData' || property === 'response') {
					throw new Error('Do not copy hidden-card transcript data');
				}
				return Reflect.get(target, property, receiver);
			}
		});
		model.lastRequestObs.set(submitted, undefined);
		assert.strictEqual(getProjectBoardSubmittedAt(model), 100);
		assert.deepStrictEqual(state, { acquired: 0, released: 0, scans: 0, credits: 0 });
		model.lastRequestObs.set(request('New submitted prompt', 500), undefined);
		assert.strictEqual(getProjectBoardSubmittedAt(model), 500);
		const hidden = request('Internal', 900, { isHiddenFromTranscript: true });
		setTail([submitted, hidden]);
		model.lastRequestObs.set(hidden, undefined);
		assert.strictEqual(getProjectBoardSubmittedAt(model), 100);
		model.lastRequestObs.set(request('Unknown time', 100, { timestamp: undefined }), undefined);
		assert.strictEqual(getProjectBoardSubmittedAt(model), undefined);
	});

	test('unknown and invalid timestamps never fall back to request display or model creation time', () => {
		const { model, request, create } = setup();
		const metadata = create();
		for (const timestamp of [undefined, NaN, Infinity, 0, -1]) {
			const latest = request('Historical prompt', 100, { timestamp });
			model.lastRequestObs.set(latest, undefined);
			const result = metadata.metadata.get();
			assert.strictEqual(result.kind, 'ready');
			assert.strictEqual(result.submittedAt, undefined);
			assert.ok(result.message);
		}
	});

	test('empty model is unavailable while empty-text requests keep their real time without implying failure', () => {
		const { model, request, create } = setup();
		const metadata = create();
		assert.strictEqual(metadata.metadata.get().kind, 'unavailable');
		model.lastRequestObs.set(request('  ', 100), undefined);
		const result = metadata.metadata.get();
		assert.strictEqual(result.kind, 'ready');
		assert.deepStrictEqual([result.prompt, result.submittedAt], [undefined, 100]);
		assert.strictEqual(result.message, 'The latest request has no stored prompt text.');
	});

	test('attachment context remains available when a request has no text prompt', () => {
		const { model, request, create } = setup();
		const uri = URI.file('/test/plan.md');
		model.lastRequestObs.set(request('', 100, { variableData: { variables: [{ kind: 'file', id: 'plan', name: 'plan.md', value: uri }] } }), undefined);
		const result = create().metadata.get();
		assert.strictEqual(result.kind, 'ready');
		assert.deepStrictEqual(result.context, [{ label: 'plan.md', uri }]);
		assert.strictEqual(result.message, 'The latest request has attached context but no stored prompt text.');
	});

	test('hidden and system initiated requests are skipped in a bounded tail', () => {
		const { model, request, create, setTail } = setup();
		const submitted = request('User', 100);
		const hidden = request('Internal', 500, { isHiddenFromTranscript: true });
		const hiddenRow = request('Internal row', 600, { isRequestHiddenFromTranscript: true });
		const system = request('Automatic', 700, { isSystemInitiated: true });
		setTail([submitted, hidden, hiddenRow, system]);
		model.lastRequestObs.set(system, undefined);
		const metadata = create();
		const result = metadata.metadata.get();
		assert.strictEqual(result.kind, 'ready');
		assert.deepStrictEqual([result.prompt, result.submittedAt], ['User', 100]);
		setTail([submitted, ...Array.from({ length: projectBoardMetadataLimits.requestTail }, () => hidden)]);
		model.lastRequestObs.set(hidden, undefined);
		assert.strictEqual(metadata.metadata.get().kind, 'unavailable');
	});

	test('queued input is never read from the separate pending queue', () => {
		const { model, request, create, changed } = setup();
		model.lastRequestObs.set(request('Sent', 100), undefined);
		const metadata = create();
		const before = metadata.metadata.get();
		changed.fire({ kind: 'setCustomTitle', title: 'Generated title' });
		assert.strictEqual(metadata.metadata.get(), before);
	});

	test('historical models load through materialized resources with explicit loading state', async () => {
		const { resource, model, request, reference, create } = setup();
		model.lastRequestObs.set(request('Resumed historical prompt', 123), undefined);
		const loaded = new DeferredPromise<IChatModelReference | undefined>();
		const materialized = URI.parse('test-chat:published#child');
		const service = new class extends mock<IChatService>() {
			override acquireExistingSession(uri: URI) { assert.strictEqual(uri, materialized); return undefined; }
			override acquireOrLoadSession(uri: URI, location: ChatAgentLocation, token: CancellationToken) {
				assert.deepStrictEqual([uri, location, token.isCancellationRequested], [materialized, ChatAgentLocation.Chat, false]);
				return loaded.p;
			}
		}();
		const sessions = new class extends mock<IChatSessionsService>() {
			override getMaterializedSessionResource(uri: URI) { assert.strictEqual(uri, resource); return materialized; }
		}();
		const metadata = create(service, sessions);
		assert.strictEqual(metadata.metadata.get().kind, 'loading');
		await loaded.complete(reference());
		const result = metadata.metadata.get();
		assert.strictEqual(result.kind, 'ready');
		assert.deepStrictEqual([result.prompt, result.submittedAt], ['Resumed historical prompt', 123]);
	});

	test('undefined load results are explicitly unavailable', async () => {
		const { create } = setup();
		const loaded = new DeferredPromise<IChatModelReference | undefined>();
		const metadata = create(new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
			override acquireOrLoadSession() { return loaded.p; }
		}());
		await loaded.complete(undefined);
		assert.strictEqual(metadata.metadata.get().kind, 'unavailable');
	});

	test('disposal cancels loading and releases a late reference without publishing', async () => {
		const { create, reference, state } = setup();
		const loaded = new DeferredPromise<IChatModelReference | undefined>();
		let token: CancellationToken | undefined;
		const metadata = create(new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
			override acquireOrLoadSession(_resource: URI, _location: ChatAgentLocation, cancellation: CancellationToken) { token = cancellation; return loaded.p; }
		}());
		const before = metadata.metadata.get();
		metadata.dispose();
		assert.strictEqual(token?.isCancellationRequested, true);
		await loaded.complete(reference());
		assert.deepStrictEqual([state.released, metadata.metadata.get()], [1, before]);
	});

	test('disposing a retained model releases its reference and stops observation', () => {
		const { model, request, create, disposed, state } = setup();
		model.lastRequestObs.set(request(), undefined);
		const metadata = create();
		disposed.fire();
		assert.strictEqual(metadata.metadata.get().kind, 'unavailable');
		model.lastRequestObs.set(request('Ignored', 600), undefined);
		assert.strictEqual(metadata.metadata.get().kind, 'unavailable');
		metadata.dispose();
		assert.strictEqual(state.released, 1);
	});

	test('disposing the helper releases its reference without disposing the shared model', () => {
		const { model, request, create, state } = setup();
		model.lastRequestObs.set(request(), undefined);
		const metadata = create();
		const before = metadata.metadata.get();
		metadata.dispose();
		model.lastRequestObs.set(request('Ignored after release', 600), undefined);
		assert.strictEqual(metadata.metadata.get(), before);
		assert.strictEqual(state.released, 1);
	});

	test('projection failures are logged once and recover on subsequent model updates', () => {
		const { model, request, create, changed, log, setTail } = setup();
		model.lastRequestObs.set(request(), undefined);
		const metadata = create();
		// The mock rejects history access unless the test explicitly provides a tail.
		model.lastRequestObs.set(request('Hidden', 500, { isHiddenFromTranscript: true }), undefined);
		assert.strictEqual(metadata.metadata.get().kind, 'error');
		changed.fire({ kind: 'setCustomTitle', title: 'Another agent update' });
		assert.strictEqual(log.errors.length, 1);
		const restored = request('User', 100);
		setTail([restored]);
		changed.fire({ kind: 'setCustomTitle', title: 'Recovered model' });
		const result = metadata.metadata.get();
		assert.strictEqual(result.kind, 'ready');
		assert.strictEqual(result.prompt, 'User');
	});

	test('load errors are logged and exposed for owner notification; cancellation is silent', async () => {
		const { create, log } = setup();
		const failed = new DeferredPromise<IChatModelReference | undefined>();
		const metadata = create(new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
			override acquireOrLoadSession() { return failed.p; }
		}());
		await failed.error(new Error('Provider disconnected'));
		const result = metadata.metadata.get();
		assert.strictEqual(result.kind, 'error');
		assert.strictEqual(result.error, 'Provider disconnected');
		assert.ok(result.message.includes('Provider disconnected'));
		assert.strictEqual(log.errors.length, 1);
		const cancelled = new DeferredPromise<IChatModelReference | undefined>();
		const disposedMetadata = create(new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
			override acquireOrLoadSession() { return cancelled.p; }
		}());
		disposedMetadata.dispose();
		await cancelled.error(new Error('Cancelled load'));
		assert.strictEqual(log.errors.length, 1);
	});

	test('snapshots bound text and safe context while observing variable data changes', () => {
		const { model, request, create, changed } = setup();
		const latest = request('x'.repeat(10000), 100, { variableData: { variables: [
			{ kind: 'generic', id: 'unsafe', name: 'Unsafe', value: URI.parse('command:workbench.action.closeWindow') },
			{ kind: 'generic', id: 'string', name: 'Not a URI', value: 'file:///guess' },
			...Array.from({ length: 20 }, (_, index) => ({ kind: 'file' as const, id: String(index), name: `File ${index}`, value: URI.file(`C:\\project\\${index}.ts`) })),
		] } });
		model.lastRequestObs.set(latest, undefined);
		const metadata = create();
		let publications = 0;
		store.add(autorun(reader => { metadata.metadata.read(reader); publications++; }));
		const result = metadata.metadata.get();
		assert.strictEqual(result.kind, 'ready');
		assert.strictEqual(result.prompt?.length, projectBoardMetadataLimits.promptLength);
		assert.strictEqual(result.context.length, projectBoardMetadataLimits.contextEntries);
		assert.strictEqual(result.context[0].label, 'File 0');
		latest.variableData = { variables: [{ kind: 'generic', id: 'location', name: 'Selected code', value: { uri: URI.file('C:\\project\\selection.ts'), range: { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 } } }] };
		changed.fire({ kind: 'setCustomTitle', title: 'Generated title' });
		const updated = metadata.metadata.get();
		assert.strictEqual(updated.kind, 'ready');
		assert.deepStrictEqual(updated.context.map(item => item.label), ['Selected code']);
		assert.strictEqual(publications, 2);
	});
});
