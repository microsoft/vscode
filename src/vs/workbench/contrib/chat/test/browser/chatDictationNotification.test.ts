/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ChatDictationNotificationContribution } from '../../browser/chatDictationNotification.js';
import { ChatSpeechToTextState, IChatSpeechToTextService, REMOTE_ENABLED_SETTING } from '../../browser/speechToText/chatSpeechToTextService.js';
import { IChatInputNotification, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';

class TestSpeechToTextService extends Disposable implements IChatSpeechToTextService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeState = this._register(new Emitter<ChatSpeechToTextState>());
	readonly onDidChangeState = this._onDidChangeState.event;
	readonly onDidUpdateTranscript = Event.None;
	readonly onDidFail = Event.None;
	readonly onDidChangePreparingModel = Event.None;
	state = ChatSpeechToTextState.Idle;
	readonly isConfigured = true;
	readonly isPreparingModel = false;

	async start(): Promise<void> { }
	async stopAndTranscribe(): Promise<string | undefined> { return undefined; }
	cancel(): void { }

	setState(state: ChatSpeechToTextState): void {
		this.state = state;
		this._onDidChangeState.fire(state);
	}
}

class TestNotificationService extends Disposable implements IChatInputNotificationService {
	declare readonly _serviceBrand: undefined;
	readonly onDidChange = Event.None;
	private readonly _onDidDismiss = this._register(new Emitter<string>());
	readonly onDidDismiss = this._onDidDismiss.event;
	notification: IChatInputNotification | undefined;

	setNotification(notification: IChatInputNotification): void {
		this.notification = notification;
	}

	deleteNotification(id: string): void {
		if (this.notification?.id === id) {
			this.notification = undefined;
		}
	}

	dismissNotification(id: string): void {
		this._onDidDismiss.fire(id);
	}

	getActiveNotification(): IChatInputNotification | undefined {
		return this.notification;
	}

	handleMessageSent(): void { }
	announceRendered(): void { }
}

suite('ChatDictationNotificationContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows only after enablement and persists first-use dismissal', async () => {
		const configurationService = new TestConfigurationService();
		const storageService = store.add(new InMemoryStorageService());
		const notificationService = store.add(new TestNotificationService());
		const speechToTextService = store.add(new TestSpeechToTextService());
		store.add(new ChatDictationNotificationContribution(
			configurationService,
			storageService,
			notificationService,
			speechToTextService,
		));

		assert.strictEqual(notificationService.notification, undefined);
		await configurationService.setUserConfiguration(REMOTE_ENABLED_SETTING, true);
		const configurationEvent: IConfigurationChangeEvent = {
			source: ConfigurationTarget.APPLICATION,
			affectedKeys: new Set([REMOTE_ENABLED_SETTING]),
			change: { keys: [REMOTE_ENABLED_SETTING], overrides: [] },
			affectsConfiguration: key => key === REMOTE_ENABLED_SETTING,
		};
		configurationService.onDidChangeConfigurationEmitter.fire(configurationEvent);
		assert.strictEqual(notificationService.getActiveNotification()?.id, 'chat.dictation.firstUse');

		speechToTextService.setState(ChatSpeechToTextState.Recording);

		assert.deepStrictEqual({
			notification: notificationService.notification,
			dismissed: storageService.getBoolean('chat.dictation.tipDismissed', StorageScope.APPLICATION, false),
		}, {
			notification: undefined,
			dismissed: true,
		});
	});
});
