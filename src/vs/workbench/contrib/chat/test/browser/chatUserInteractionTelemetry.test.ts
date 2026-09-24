/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatUserInteractionTimingResult, isChatFirstVisibleProgress } from '../../browser/chatUserInteractionTelemetry.js';
import { IChatProgress, IChatToolInvocation, IChatToolInvocationSerialized } from '../../common/chatService/chatService.js';
import { getChatSessionTelemetryContext } from '../../common/chatService/chatServiceTelemetry.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../../common/constants.js';
import { IChatProgressResponseContent, IChatRequestModel, IChatResponseModel } from '../../common/model/chatModel.js';
import { ToolInvocationPresentation } from '../../common/tools/languageModelToolsService.js';
import { createChatUserInteractionTestHarness } from './chatUserInteractionTestUtils.js';

suite('ChatUserInteractionTelemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses provider-neutral meaningful progress semantics', () => {
		const cases: [IChatProgress | IChatProgressResponseContent, boolean][] = [
			[{ kind: 'thinking' }, false],
			[{ kind: 'thinking', value: '' }, false],
			[{ kind: 'thinking', value: [' ', ''] }, false],
			[{ kind: 'thinking', value: 'Reasoning' }, true],
			[{ kind: 'thinking', value: ['', 'Reasoning'] }, true],
			[{ kind: 'progressMessage', content: new MarkdownString('Thinking'), shimmer: true }, false],
			[{ kind: 'markdownContent', content: new MarkdownString(' \n') }, false],
			[{ kind: 'markdownContent', content: new MarkdownString('Response') }, true],
			[upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation', presentation: ToolInvocationPresentation.Hidden }), false],
			[upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation' }), true],
			[upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized' }), true],
			[upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', presentation: ToolInvocationPresentation.Hidden }), false],
			[upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized', presentation: ToolInvocationPresentation.HiddenAfterComplete }), false],
		];
		for (const [part, expected] of cases) {
			assert.strictEqual(isChatFirstVisibleProgress(part), expected, JSON.stringify(part));
		}
	});

	test('reports the exact schema and correlated boundaries once after two frames, even without focus', () => {
		const h = createChatUserInteractionTestHarness(disposables);
		const response = h.createResponse(undefined, {
			requestId: 'request-id',
			agent: upcastPartial<NonNullable<IChatResponseModel['agent']>>({ id: 'agent-id', extensionId: new ExtensionIdentifier('publisher.extension') }),
			request: upcastPartial<IChatRequestModel>({
				modelId: 'model-id',
				modeInfo: {
					kind: ChatModeKind.Agent, isBuiltin: true, telemetryModeName: 'agent', permissionLevel: ChatPermissionLevel.AutoApprove,
					modeInstructions: undefined, telemetryModeId: undefined, applyCodeBlockSuggestionId: undefined,
				},
			}),
		});
		const view = h.createWidget(response.response);
		const timer = h.createInteraction({ context: { location: ChatAgentLocation.Chat, model: 'preparation-model' } });
		assert.strictEqual(timer.startedAt, 100);
		let finished = 0;
		timer.addDisposable(timer.onDidFinish(() => finished++));
		timer.observeResponse(response.response, () => view.widget);
		h.blur();
		response.progress();
		timer.checkResponse();
		assert.strictEqual(h.frames.size, 1);
		h.setTime(200);
		h.frame();
		assert.strictEqual(h.events.length, 0);
		h.setTime(350);
		h.frame();
		timer.cancel('cancelled');
		timer.setContext({ requestId: 'too-late' });
		timer.observeResponse(response.response, () => view.widget);
		const data = {
			timeToFirstProgress: 250, timeToTermination: undefined, result: 'success', interactionKind: 'turn',
			requestPhase: 'first', firstProgressKind: 'text',
			requestId: 'request-id', chatSessionId: 'agent-host-copilotcli:/session',
			agent: 'agent-id', agentExtensionId: 'publisher.extension', location: ChatAgentLocation.Chat,
			model: 'model-id', permissionLevel: ChatPermissionLevel.AutoApprove, chatMode: 'agent',
			sessionType: 'agent-host-copilotcli', harness: undefined, windowVisible: true, windowFocused: false,
		};
		assert.deepStrictEqual({ events: h.events, logs: h.logs, finished, observing: response.hasListeners() }, {
			events: [{ name: 'chat.userPerceivedTimeToFirstProgress', data }],
			logs: [
				{ message: '[ChatTTFP] start', args: [{ interactionId: timer.id, interactionKind: 'turn' }] },
				{ message: '[ChatTTFP] end', args: [{ interactionId: timer.id, ...data }] },
			],
			finished: 1, observing: false,
		});
		h.assertFinished('success');
	});

	for (const [part, kind] of [
		[{ kind: 'thinking', value: 'Reasoning' }, 'reasoning'],
		[upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation' }), 'tool'],
		[upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized' }), 'tool'],
	] satisfies [IChatProgressResponseContent, string][]) {
		test(`records ${kind} from ${part.kind} even when text arrives during rendering`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			const response = h.createResponse();
			const view = h.createWidget(response.response);
			h.createInteraction().observeResponse(response.response, () => view.widget);
			response.progress([part]);
			h.frame();
			response.progress([part, { kind: 'markdownContent', content: new MarkdownString('Answer') }]);
			h.frame();
			assert.strictEqual(h.events[0].data.firstProgressKind, kind);
			h.assertFinished('success');
		});
	}

	for (const [ids, phase] of [[['current'], 'first'], [['previous', 'current'], 'followup'], [[], 'unknown']] as const) {
		test(`records the ${phase} request phase from the exact request's history position`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			const response = h.createResponse(undefined, { requestId: 'current' });
			Object.defineProperty(response.response.session, 'getRequests', { value: () => ids.map(id => upcastPartial<IChatRequestModel>({ id })) });
			const view = h.createWidget(response.response);
			h.createInteraction().observeResponse(response.response, () => view.widget);
			response.progress();
			h.frame(2);
			assert.strictEqual(h.events[0].data.requestPhase, phase);
			h.assertFinished('success');
		});
	}

	test('does not report a progress kind that disappeared before the render acknowledgement', () => {
		const h = createChatUserInteractionTestHarness(disposables);
		const response = h.createResponse();
		const view = h.createWidget(response.response);
		h.createInteraction().observeResponse(response.response, () => view.widget);
		response.progress([{ kind: 'thinking', value: 'Reasoning' }]);
		h.frame();
		response.progress();
		h.frame();
		assert.strictEqual(h.events.length, 0);
		h.frame(2);
		assert.strictEqual(h.events[0].data.firstProgressKind, 'text');
		h.assertFinished('success');
	});

	test('counts a tool-only serialized response without waiting for markdown', () => {
		const h = createChatUserInteractionTestHarness(disposables);
		const response = h.createResponse();
		const view = h.createWidget(response.response);
		h.createInteraction().observeResponse(response.response, () => view.widget);
		response.progress([upcastPartial<IChatToolInvocationSerialized>({ kind: 'toolInvocationSerialized' })]);
		response.complete();
		h.setTime(240);
		h.frame(2);
		assert.strictEqual(h.events[0].data.timeToFirstProgress, 140);
		h.assertFinished('success');
	});

	for (const outcome of ['success', 'hidden'] as const) {
		test(`uses current participant attribution when the observation ends as ${outcome}`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			let agent = upcastPartial<NonNullable<IChatResponseModel['agent']>>({ id: 'default', extensionId: new ExtensionIdentifier('default.extension') });
			const response = h.createResponse();
			Object.defineProperty(response.response, 'agent', { get: () => agent });
			const view = h.createWidget(response.response);
			h.createInteraction().observeResponse(response.response, () => view.widget);
			agent = upcastPartial<NonNullable<IChatResponseModel['agent']>>({ id: 'detected', extensionId: new ExtensionIdentifier('detected.extension') });
			response.progress();
			if (outcome === 'hidden') {
				h.setDocumentVisible(false);
			} else {
				h.frame(2);
			}
			assert.deepStrictEqual([h.events[0].data.agent, h.events[0].data.agentExtensionId], ['detected', 'detected.extension']);
			h.assertFinished(outcome);
		});
	}

	test('preserves remote peer chat identity without connection or query information', () => {
		const session = URI.from({ scheme: 'remote-private-host-copilot', authority: 'private-authority', path: '/session-id', query: 'private-query' });
		assert.deepStrictEqual(['', 'peer-one', 'peer-two'].map(fragment => getChatSessionTelemetryContext(session.with({ fragment }))), [
			{ chatSessionId: 'session-id', sessionType: 'remote-agent-host', harness: 'copilot' },
			{ chatSessionId: 'session-id#peer-one', sessionType: 'remote-agent-host', harness: 'copilot' },
			{ chatSessionId: 'session-id#peer-two', sessionType: 'remote-agent-host', harness: 'copilot' },
		]);
	});

	for (const result of ['cancelled', 'error', 'completedWithoutProgress', 'notDispatched', 'queued', 'navigated', 'hidden', 'disposed'] satisfies Exclude<ChatUserInteractionTimingResult, 'success'>[]) {
		test(`reports ${result} with only a termination duration`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			const timer = h.createInteraction();
			h.blur();
			h.setTime(175);
			timer.cancel(result);
			timer.dispose();
			assert.deepStrictEqual(h.events, [{
				name: 'chat.userPerceivedTimeToFirstProgress',
				data: { result, requestPhase: 'unknown', interactionKind: 'turn', timeToFirstProgress: undefined, timeToTermination: 75, windowVisible: true, windowFocused: false },
			}]);
			h.assertFinished(result);
		});
	}

	for (const frames of [-1, 0, 1]) {
		test(`document hiding ${frames < 0 ? 'before progress' : `after ${frames} frames`} never resumes`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			const response = h.createResponse();
			const view = h.createWidget(response.response);
			const timer = h.createInteraction();
			timer.observeResponse(response.response, () => view.widget);
			if (frames >= 0) {
				response.progress();
				h.frame(frames);
			}
			h.setTime(160);
			h.setDocumentVisible(false);
			h.setTime(1000);
			h.setDocumentVisible(true);
			response.progress();
			h.frame(2);
			assert.deepStrictEqual([h.events[0].data.timeToFirstProgress, h.events[0].data.timeToTermination, response.hasListeners()], [undefined, 60, false]);
			h.assertFinished('hidden');
		});
	}

	for (const frames of [0, 1]) {
		test(`rechecks widget visibility after ${frames} frames`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			const response = h.createResponse();
			const view = h.createWidget(response.response);
			h.createInteraction().observeResponse(response.response, () => view.widget);
			response.progress();
			h.frame(frames);
			view.hide();
			h.frame();
			view.show();
			h.frame(2);
			h.assertFinished('hidden');
		});
	}

	for (const hidden of ['document', 'widget'] as const) {
		test(`initially hidden ${hidden} reports synchronously and installs no late observers`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			h.setDocumentVisible(hidden !== 'document');
			const timer = h.createInteraction({ visible: hidden !== 'widget', context: { sessionType: 'local' } });
			h.assertFinished('hidden');
			const response = h.createResponse();
			h.setDocumentVisible(true);
			timer.observeResponse(response.response, () => h.createWidget(response.response).widget);
			response.progress();
			assert.deepStrictEqual([timer.isActive, response.hasListeners(), h.events[0].data.sessionType, h.events[0].data.timeToTermination], [false, false, 'local', 0]);
			h.assertFinished('hidden');
		});
	}

	for (const [source, auxiliary] of [
		['window', false], ['window', true], ['render window', true], ['render document', true],
		['model', false], ['owner', false], ['cancellation', false],
	] as const) {
		test(`${source} termination ${auxiliary ? 'across windows ' : ''}clears the pending second frame and listeners`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			const render = auxiliary ? createChatUserInteractionTestHarness(disposables) : h;
			const response = h.createResponse();
			const view = render.createWidget(response.response);
			const timer = h.createInteraction();
			timer.observeResponse(response.response, () => view.widget);
			response.progress();
			render.frame();
			if (source === 'window') {
				h.close();
			} else if (source === 'render window') {
				render.close();
			} else if (source === 'render document') {
				render.setDocumentVisible(false);
				render.setDocumentVisible(true);
			} else if (source === 'model') {
				response.disposed.fire();
			} else if (source === 'owner') {
				timer.dispose();
			} else {
				timer.cancel('cancelled');
			}
			render.frame(2);
			assert.deepStrictEqual({ cancelledFrames: render.cancelledFrames, observing: response.hasListeners() }, { cancelledFrames: [2], observing: false });
			h.assertFinished(source === 'cancellation' ? 'cancelled' : source === 'render document' ? 'hidden' : 'disposed');
			if (auxiliary) {
				render.assertFinished();
			}
		});
	}
});
