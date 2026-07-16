/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatSpeechToTextState, IChatSpeechToTextService, REMOTE_ENABLED_SETTING } from './speechToText/chatSpeechToTextService.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const NOTIFICATION_ID = 'chat.dictation.firstUse';
const DISMISSED_STORAGE_KEY = 'chat.dictation.tipDismissed';

export class ChatDictationNotificationContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatDictationNotification';

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IChatInputNotificationService private readonly _notificationService: IChatInputNotificationService,
		@IChatSpeechToTextService private readonly _speechToTextService: IChatSpeechToTextService,
	) {
		super();
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(REMOTE_ENABLED_SETTING)) {
				this._update();
			}
		}));
		this._register(this._notificationService.onDidDismiss(id => {
			if (id === NOTIFICATION_ID) {
				this._dismissPermanently();
			}
		}));
		this._register(this._speechToTextService.onDidChangeState(state => {
			if (state === ChatSpeechToTextState.Recording && this._isRemoteEnabled()) {
				this._dismissPermanently();
			}
		}));
		this._update();
	}

	private _update(): void {
		if (!this._isRemoteEnabled() || this._storageService.getBoolean(DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false)) {
			this._notificationService.deleteNotification(NOTIFICATION_ID);
			return;
		}
		this._notificationService.setNotification({
			id: NOTIFICATION_ID,
			telemetryId: 'chatDictationFirstUse',
			severity: ChatInputNotificationSeverity.Info,
			message: localize('chatDictation.tip.title', "Dictate Your Chat Request"),
			description: localize('chatDictation.tip.description', "Select the microphone to start, then select stop. Review or edit the transcript and send it when ready."),
			actions: [],
			dismissible: true,
			autoDismissOnMessage: false,
		});
	}

	private _dismissPermanently(): void {
		this._storageService.store(DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._notificationService.deleteNotification(NOTIFICATION_ID);
	}

	private _isRemoteEnabled(): boolean {
		return this._configurationService.getValue<boolean>(REMOTE_ENABLED_SETTING) === true;
	}
}
