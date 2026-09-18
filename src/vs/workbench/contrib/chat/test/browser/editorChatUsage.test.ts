/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { TestLifecycleService } from '../../../../test/common/workbenchTestServices.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { EditorChatUsageContribution, EditorChatUsageTracker, IEditorChatUsageChannel } from '../../browser/editorChatUsage.contribution.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../common/chatService/chatService.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';

suite('EditorChatUsageTracker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	type Message = Parameters<IEditorChatUsageChannel['postData']>[0];

	function createChannels() {
		const peers = new Set<TestChannel>();
		class TestChannel extends Disposable implements IEditorChatUsageChannel {
			readonly emitter = this._register(new Emitter<Message>());
			readonly onDidReceiveData = this.emitter.event;
			constructor() {
				super();
				peers.add(this);
				this._register(toDisposable(() => peers.delete(this)));
			}
			postData(message: Message): void {
				for (const peer of peers) {
					if (peer !== this) {
						peer.emitter.fire(message);
					}
				}
			}
		}
		return () => disposables.add(new TestChannel());
	}

	test('separates same-window and other-window overlap and ignores the submitting session', async () => {
		await runWithFakedTimers({ useFakeTimers: true, startTime: 10_000 }, async () => {
			const storage = disposables.add(new InMemoryStorageService());
			const submissions = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
			const lifecycle = disposables.add(new TestLifecycleService());
			const channel = createChannels();
			let sameWindowBusy = false;
			const otherResource = URI.parse('local:/other');
			const otherChannel = channel();
			disposables.add(new EditorChatUsageTracker(otherChannel, resource => resource.path !== otherResource.path, Event.None, storage, lifecycle, new NullLogService()));
			disposables.add(new EditorChatUsageTracker(channel(), resource => sameWindowBusy && resource.path !== otherResource.path, submissions.event, storage, lifecycle, new NullLogService()));
			const send = async (resource: URI, isNewSession = false) => {
				submissions.fire({ chatSessionResource: resource, isNewSession });
				await timeout(250);
			};
			await send(URI.parse('local:/current'), true);
			sameWindowBusy = true;
			await send(URI.parse('local:/current'));
			await send(otherResource);
			otherChannel.dispose();
			sameWindowBusy = false;
			await send(URI.parse('local:/current'));
			assert.deepStrictEqual(new EditorChatUsage(storage).getTelemetry(), {
				editorSessionsByProvider: '{"local":1}',
				editorMessages: 4,
				editorMessagesWithOtherSessionInProgress: 1,
				editorMessagesWithOtherSessionInProgressAcrossWindows: 2,
				editorLastMessageSecondsAgo: 0,
			});
		});
	});

	test('Agents windows do not register a submission listener or contribute running sessions', () => {
		const storage = disposables.add(new InMemoryStorageService());
		disposables.add(new EditorChatUsageContribution(
			new class extends mock<IWorkbenchEnvironmentService>() { override readonly isSessionsWindow = true; }(),
			new class extends mock<IChatService>() { }(),
			new class extends mock<IAgentSessionsService>() { }(),
			storage, disposables.add(new TestLifecycleService()), new NullLogService(),
		));
		assert.strictEqual(new EditorChatUsage(storage).getTelemetry().editorMessages, 0);
	});
});
