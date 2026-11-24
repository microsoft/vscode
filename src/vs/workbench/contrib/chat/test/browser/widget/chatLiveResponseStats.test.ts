/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import type { IDelayedHoverOptions } from '../../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { TestExtensionService, TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { ChatLiveResponseStats } from '../../../browser/widget/chatLiveResponseStats.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatResponseStats, ChatResponseStatsTokens } from '../../../common/constants.js';
import { ChatModel, IChatModel, IChatResponseModel } from '../../../common/model/chatModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

suite('ChatLiveResponseStats', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the working time and latest model call speed, or the output tokens so far, of the running response at the configured location', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IExtensionService, new TestExtensionService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IChatAgentService, store.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IHoverService, NullHoverService);
		const model = store.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const chatModel = observableValue<IChatModel | undefined>('chatModel', model);
		const lastResponse = derived(reader => chatModel.read(reader)?.lastRequestObs.read(reader)?.response);
		const stats = store.add(instantiationService.createInstance(ChatLiveResponseStats, ChatResponseStats.Title, lastResponse));
		const progressStats = store.add(instantiationService.createInstance(ChatLiveResponseStats, ChatResponseStats.Progress, lastResponse));
		const shownIn = (widget: ChatLiveResponseStats) => widget.element.hidden ? undefined : { text: widget.element.textContent, label: widget.element.ariaLabel };
		const shown = () => shownIn(stats);
		const configure = async (value: string, key = ChatConfiguration.ResponseStats) => {
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([key]),
				change: { keys: [key], overrides: [] },
				affectsConfiguration: section => section === key,
			});
		};

		const request = model.addRequest({ text: 'test', parts: [] }, { variables: [] }, 0);
		await timeout(2500);
		const off = shown();
		await configure(ChatResponseStats.Title);
		const title = shown();
		await timeout(1000);
		const nextSecond = shown();
		// A subagent's call is reported on its parent turn, whose own completion tokens it does not change.
		model.acceptResponseProgress(request, { kind: 'usage', promptTokens: 900, completionTokens: 40, latestModelCall: { duration: 5000, outputTokens: 300 } });
		const timedModelCall = shown();
		await configure(ChatResponseStatsTokens.Count, ChatConfiguration.ResponseStatsTokens);
		const outputTokens = shown();
		model.acceptResponseProgress(request, { kind: 'usage', promptTokens: 950, completionTokens: 11_000, latestModelCall: { duration: 4000 } });
		const moreOutputTokens = shown();
		await configure(ChatResponseStatsTokens.Speed, ChatConfiguration.ResponseStatsTokens);
		model.acceptResponseProgress(request, { kind: 'usage', promptTokens: 900, completionTokens: 40, latestModelCall: { duration: 5000, outputTokens: 300 } });
		const pendingTool = new ChatToolInvocation(
			{ invocationMessage: 'Inspecting workspace', confirmationMessages: { title: 'Inspect workspace?', message: 'Allow the inspection.' } },
			{ id: 'inspect', displayName: 'Inspect', modelDescription: 'Inspect', source: ToolDataSource.Internal },
			'pending-inspection', undefined, {},
		);
		model.acceptResponseProgress(request, pendingTool);
		await timeout(5000);
		const waitingForConfirmation = shown();
		IChatToolInvocation.confirmWith(pendingTool, { type: ToolConfirmKind.UserAction });
		await timeout(600);
		const resumed = shown();
		model.acceptResponseProgress(request, { kind: 'usage', promptTokens: 950, completionTokens: 25 });
		const untimedModelCall = shown();
		request.response?.complete();
		const completed = shown();
		const nextRequest = model.addRequest({ text: 'again', parts: [] }, { variables: [] }, 0);
		const nextResponseStarted = shown();
		await timeout(1000);
		const nextResponse = { title: shown(), progress: shownIn(progressStats) };
		await configure(ChatResponseStats.Progress);
		const progress = { title: shown(), progress: shownIn(progressStats) };
		await configure('unknown');
		const unknownValue = { title: shown(), progress: shownIn(progressStats) };
		await configure(ChatResponseStats.Title);
		chatModel.set(undefined, undefined);
		const otherChat = shown();
		nextRequest.response?.complete();

		assert.deepStrictEqual({ off, title, nextSecond, timedModelCall, outputTokens, moreOutputTokens, waitingForConfirmation, resumed, untimedModelCall, completed, nextResponseStarted, nextResponse, progress, unknownValue, otherChat }, {
			off: undefined,
			title: { text: '2s', label: 'Elapsed time 2s' },
			nextSecond: { text: '3s', label: 'Elapsed time 3s' },
			timedModelCall: { text: '3s \u00b7 60 tk/s', label: 'Elapsed time 3s, 60 tokens per second' },
			outputTokens: { text: '3s \u00b7 40 tokens', label: 'Elapsed time 3s, 40 output tokens' },
			moreOutputTokens: { text: '3s \u00b7 11.0k tokens', label: 'Elapsed time 3s, 11,040 output tokens' },
			waitingForConfirmation: { text: '3s \u00b7 60 tk/s', label: 'Elapsed time 3s, 60 tokens per second' },
			resumed: { text: '4s \u00b7 60 tk/s', label: 'Elapsed time 4s, 60 tokens per second' },
			untimedModelCall: { text: '4s', label: 'Elapsed time 4s' },
			completed: undefined,
			nextResponseStarted: { text: '0s', label: 'Elapsed time 0s' },
			nextResponse: { title: { text: '1s', label: 'Elapsed time 1s' }, progress: undefined },
			progress: { title: undefined, progress: { text: '1s', label: 'Elapsed time 1s' } },
			unknownValue: { title: undefined, progress: undefined },
			otherChat: undefined,
		});
	}));

	test('its hover shows the stats in full while its host truncates them', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration(ChatConfiguration.ResponseStats, ChatResponseStats.ProgressWithMessage);
		await configurationService.setUserConfiguration(ChatConfiguration.ResponseStatsTokens, ChatResponseStatsTokens.Count);
		instantiationService.stub(IConfigurationService, configurationService);
		let hoverOptions: (() => IDelayedHoverOptions) | IDelayedHoverOptions | undefined;
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			setupDelayedHover: (_target, options) => {
				hoverOptions = options;
				return Disposable.None;
			},
		});
		// The response has worked for 2m 43s and waits for a confirmation, which keeps that time still.
		const response = upcastPartial<IChatResponseModel>({
			isIncomplete: constObservable(true),
			confirmationAdjustedTimestamp: constObservable(1000),
			isPendingConfirmation: constObservable({ startedWaitingAt: 164_000 }),
			completionTokenCountObs: constObservable(12_840),
		});
		const stats = store.add(instantiationService.createInstance(ChatLiveResponseStats, ChatResponseStats.ProgressWithMessage, constObservable(response)));
		const row = append(mainWindow.document.body, $('div', { style: 'display: flex; width: 400px;' }));
		store.add(toDisposable(() => row.remove()));
		row.appendChild(stats.element);
		const hover = () => (typeof hoverOptions === 'function' ? hoverOptions() : hoverOptions)?.content;
		const whole = hover();
		// As a host does that leaves the stats only part of its row.
		stats.element.style.overflow = 'hidden';
		stats.element.style.width = '30px';
		const truncated = hover();

		assert.deepStrictEqual({ whole, truncated }, {
			whole: 'Time spent working and the output tokens of the response so far',
			truncated: '2m 43s \u00b7 12.8k tokens\nTime spent working and the output tokens of the response so far',
		});
	});
});
