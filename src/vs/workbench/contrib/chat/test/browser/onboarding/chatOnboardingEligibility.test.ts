/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IChatWidget, IChatWidgetService, IChatWidgetViewContext, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { ChatOnboardingEligibility } from '../../../browser/onboarding/chatOnboardingEligibility.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../../common/chatService/chatService.js';
import { localChatSessionType, SessionType } from '../../../common/chatSessionsService.js';
import { EditorChatUsage } from '../../../common/editorChatUsage.js';
import { IChatViewModel } from '../../../common/model/chatViewModel.js';

suite('ChatOnboardingEligibility', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IWidgetOptions {
		readonly sessionType?: string;
		readonly visible?: boolean;
		readonly viewContext?: IChatWidgetViewContext;
	}

	function createHarness(options: { readonly messagesSent?: number; readonly bypass?: boolean } = {}) {
		const storageService = disposables.add(new InMemoryStorageService());
		for (let i = 0; i < (options.messagesSent ?? 0); i++) {
			new EditorChatUsage(storageService).recordSubmission('local', i === 0, false, false, 1_000);
		}
		const onDidAcceptRequest = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidAcceptRequest = onDidAcceptRequest.event;
		}();

		const widgets: IChatWidget[] = [];
		const onDidAddWidget = disposables.add(new Emitter<IChatWidget>());
		const onDidChangeWidgetVisibility = disposables.add(new Emitter<IChatWidget>());
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = onDidAddWidget.event;
			override readonly onDidRemoveWidget = disposables.add(new Emitter<IChatWidget>()).event;
			override readonly onDidChangeWidgetVisibility = onDidChangeWidgetVisibility.event;
			override getAllWidgets() { return widgets; }
			override getWidgetsByLocations() { return widgets; }
		}();

		const addWidget = (widgetOptions: IWidgetOptions = {}) => {
			let sessionType = widgetOptions.sessionType ?? SessionType.AgentHostCopilot;
			let visible = widgetOptions.visible ?? true;
			const onDidChangeViewModel = disposables.add(new Emitter<IChatWidgetViewModelChangeEvent>());
			const widget = new class extends mock<IChatWidget>() {
				override readonly viewContext = widgetOptions.viewContext ?? { viewId: 'workbench.panel.chat.view.copilot' };
				override readonly onDidChangeViewModel = onDidChangeViewModel.event;
				override get visible() { return visible; }
				override get viewModel() {
					return new class extends mock<IChatViewModel>() {
						override readonly sessionResource = URI.from({ scheme: sessionType, path: '/untitled-1' });
					}();
				}
			}();
			widgets.push(widget);
			onDidAddWidget.fire(widget);
			return {
				widget,
				setVisible: (value: boolean) => {
					visible = value;
					onDidChangeWidgetVisibility.fire(widget);
				},
				switchSession: (value: string) => {
					sessionType = value;
					onDidChangeViewModel.fire({ previousSessionResource: undefined, currentSessionResource: undefined });
				},
			};
		};

		const bypass = observableValue('bypass', options.bypass ?? false);
		const eligibility = disposables.add(new ChatOnboardingEligibility(bypass, chatService, chatWidgetService, storageService));
		return {
			eligibility,
			bypass,
			addWidget,
			sendRequest: () => onDidAcceptRequest.fire({ chatSessionResource: URI.parse('vscode-chat-session://local/1'), isNewSession: true }),
		};
	}

	test('offers a visible Chat view showing a Copilot harness chat to a new user', () => {
		const { eligibility, addWidget } = createHarness();
		const before = eligibility.eligibleChat.get();
		addWidget({ viewContext: {} });
		addWidget({ sessionType: localChatSessionType });
		const hidden = addWidget({ visible: false });
		const beforeVisible = eligibility.eligibleChat.get();
		hidden.setVisible(true);

		assert.deepStrictEqual({
			before,
			beforeVisible,
			afterVisible: eligibility.eligibleChat.get() === hidden.widget,
			isNewUser: eligibility.isNewUser.get(),
		}, {
			before: undefined,
			beforeVisible: undefined,
			afterVisible: true,
			isNewUser: true,
		});
	});

	test('follows the chat harness as the Chat view switches sessions', () => {
		const { eligibility, addWidget } = createHarness();
		const chat = addWidget({ sessionType: localChatSessionType });
		const withLocalHarness = eligibility.eligibleChat.get();
		chat.switchSession(SessionType.AgentHostCopilot);
		const withCopilotHarness = eligibility.eligibleChat.get() === chat.widget;
		chat.switchSession(localChatSessionType);

		assert.deepStrictEqual({ withLocalHarness, withCopilotHarness, backToLocal: eligibility.eligibleChat.get() }, {
			withLocalHarness: undefined,
			withCopilotHarness: true,
			backToLocal: undefined,
		});
	});

	test('excludes users who have sent a chat message unless the check is bypassed', () => {
		const sentBefore = createHarness({ messagesSent: 1 });
		const chat = sentBefore.addWidget();
		const whenSent = sentBefore.eligibility.eligibleChat.get();
		sentBefore.bypass.set(true, undefined);
		const whenBypassed = sentBefore.eligibility.eligibleChat.get() === chat.widget;

		const sendsNow = createHarness();
		sendsNow.addWidget();
		const beforeSending = sendsNow.eligibility.eligibleChat.get() !== undefined;
		sendsNow.sendRequest();

		assert.deepStrictEqual({
			whenSent,
			whenBypassed,
			beforeSending,
			afterSending: sendsNow.eligibility.eligibleChat.get(),
			isNewUserAfterSending: sendsNow.eligibility.isNewUser.get(),
		}, {
			whenSent: undefined,
			whenBypassed: true,
			beforeSending: true,
			afterSending: undefined,
			isNewUserAfterSending: false,
		});
	});
});
