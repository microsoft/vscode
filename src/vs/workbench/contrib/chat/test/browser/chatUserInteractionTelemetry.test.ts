/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ChatUserInteractionTimingResult, isChatFirstVisibleProgress } from '../../browser/chatUserInteractionTelemetry.js';
import { IChatProgress, IChatToolInvocation } from '../../common/chatService/chatService.js';
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
		];
		for (const [part, expected] of cases) {
			assert.strictEqual(isChatFirstVisibleProgress(part), expected, JSON.stringify(part));
		}
	});

	test('reports the exact schema and correlated boundaries once after two frames, even without focus', () => {
		const h = createChatUserInteractionTestHarness(disposables);
		const response = h.createResponse(undefined, {
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
		timer.setContext({ requestId: 'request-id' });
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

	for (const result of ['cancelled', 'error', 'completedWithoutProgress', 'notDispatched', 'navigated', 'hidden', 'timedOut', 'disposed'] satisfies Exclude<ChatUserInteractionTimingResult, 'success'>[]) {
		test(`reports ${result} with only a termination duration`, () => {
			const h = createChatUserInteractionTestHarness(disposables);
			const timer = h.createInteraction();
			h.blur();
			h.setTime(175);
			timer.cancel(result);
			timer.dispose();
			assert.deepStrictEqual(h.events, [{
				name: 'chat.userPerceivedTimeToFirstProgress',
				data: { result, interactionKind: 'turn', timeToFirstProgress: undefined, timeToTermination: 75, windowVisible: true, windowFocused: false },
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
