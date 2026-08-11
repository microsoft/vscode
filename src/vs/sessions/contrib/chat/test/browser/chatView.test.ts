/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatViewSessionTypeDelegate, findTranscriptContextEntry, getChatViewSessionType, getGettingReadyMessage, NewChatView, shouldShowGettingReady } from '../../browser/chatView.js';
import { SessionsChatViewStateService } from '../../browser/chatViewStateService.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';

suite('Sessions - Chat View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards new chat visibility to the aquarium host', () => {
		const forwarded: boolean[] = [];
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_widget: Object.assign(Object.create(NewChatWidget.prototype), {
				setHostVisible: (visible: boolean) => forwarded.push(visible),
			}),
		});

		view.setVisible(false);
		view.setVisible(true);

		assert.deepStrictEqual(forwarded, [false, true]);
	});

	test('does not forward aquarium visibility to the peer chat composer', () => {
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_widget: Object.create(NewChatInSessionWidget.prototype),
		});

		assert.doesNotThrow(() => view.setVisible(false));
	});

	test('defaults the session target to Agent Host and preserves the loaded session type', () => {
		assert.deepStrictEqual({
			beforeChatAssigned: getChatViewSessionType(undefined),
			agentHost: getChatViewSessionType(URI.parse(`${SessionType.AgentHostClaude}:///chat`)),
			extensionHost: getChatViewSessionType(URI.parse(`${SessionType.CopilotCLI}:///chat`)),
		}, {
			beforeChatAssigned: SessionType.AgentHostCopilot,
			agentHost: SessionType.AgentHostClaude,
			extensionHost: SessionType.CopilotCLI,
		});
	});

	test('announces the destination session type before its chat model loads', () => {
		const delegate = disposables.add(new ChatViewSessionTypeDelegate());
		const changes: string[] = [];
		disposables.add(delegate.onDidChangeActiveSessionProvider(type => changes.push(type)));

		delegate.setChatResource(URI.parse(`${SessionType.AgentHostClaude}:///chat`));
		delegate.setChatResource(URI.parse(`${SessionType.CopilotCLI}:///chat`));

		assert.deepStrictEqual({
			initial: getChatViewSessionType(undefined),
			changes,
		}, {
			initial: SessionType.AgentHostCopilot,
			changes: [SessionType.AgentHostClaude, SessionType.CopilotCLI],
		});
	});

	test('stores view state independently by chat resource', () => {
		const service = new SessionsChatViewStateService();
		const first = URI.parse('test:///first');
		const second = URI.parse('test:///second');

		service.set(first, { scrollTop: 120, isAtBottom: false });
		service.set(second, { scrollTop: 700, isAtBottom: true });
		assert.deepStrictEqual({
			first: service.get(first),
			second: service.get(second),
		}, {
			first: { scrollTop: 120, isAtBottom: false },
			second: { scrollTop: 700, isAtBottom: true },
		});
	});

	test('bounds stored view state', () => {
		const service = new SessionsChatViewStateService();
		for (let index = 0; index <= CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT; index++) {
			service.set(URI.parse(`test:///${index}`), { scrollTop: index });
		}

		assert.deepStrictEqual({
			evicted: service.get(URI.parse('test:///0')),
			retained: service.get(URI.parse(`test:///${CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT}`)),
		}, {
			evicted: undefined,
			retained: { scrollTop: CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT },
		});
	});


	test('shows getting ready until a hidden bootstrap completes or visible content appears', () => {
		assert.deepStrictEqual({
			empty: shouldShowGettingReady(0, 0, undefined),
			hiddenPending: shouldShowGettingReady(1, 0, true),
			hiddenComplete: shouldShowGettingReady(1, 0, false),
			visiblePending: shouldShowGettingReady(2, 1, true),
		}, {
			empty: true,
			hiddenPending: true,
			hiddenComplete: false,
			visiblePending: false,
		});
	});

	test('shows current worktree activity while getting ready', () => {
		assert.deepStrictEqual({
			activity: getGettingReadyMessage(true, 'Creating isolated worktree (42%)', 'Getting ready...'),
			fallback: getGettingReadyMessage(true, undefined, 'Getting ready...'),
			visibleRequest: getGettingReadyMessage(false, 'Creating isolated worktree (42%)', 'Getting ready...'),
		}, {
			activity: 'Creating isolated worktree (42%)',
			fallback: 'Getting ready...',
			visibleRequest: undefined,
		});
	});

	test('finds transcript context in hidden request attachments', () => {
		const attachment: IChatRequestTranscriptContextVariableEntry = {
			kind: 'transcriptContext',
			id: 'pr',
			name: 'PR',
			value: '{}',
			uri: URI.parse('https://github.com/owner/repo/pull/42'),
		};

		assert.strictEqual(findTranscriptContextEntry([{
			variableData: { variables: [] },
			attachedContext: [attachment],
		}]), attachment);
	});

});
