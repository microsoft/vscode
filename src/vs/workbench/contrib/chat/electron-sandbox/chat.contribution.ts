/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toAction } from 'vs/base/common/actions';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { INotificationService, NotificationPriority, Severity } from 'vs/platform/notification/common/notification';
import { IWorkbenchVoiceRecognitionService } from 'vs/workbench/services/voiceRecognition/electron-sandbox/workbenchVoiceRecognitionService';

let activeVoiceTranscription: DisposableStore | undefined;

function stopVoiceTranscription() {
	activeVoiceTranscription?.dispose();
	activeVoiceTranscription = undefined;
}

CommandsRegistry.registerCommand('workbench.action.toggleVoiceTranscription', async services => {
	if (activeVoiceTranscription) {
		stopVoiceTranscription();
	} else {
		const voiceRecognitionService = services.get(IWorkbenchVoiceRecognitionService);
		const notificationService = services.get(INotificationService);

		activeVoiceTranscription = new DisposableStore();

		const cts = new CancellationTokenSource();
		activeVoiceTranscription.add(toDisposable(() => cts.dispose(true)));

		const voiceTranscriptionNotification = notificationService.notify({
			severity: Severity.Info,
			priority: NotificationPriority.URGENT,
			sticky: true,
			message: 'Listening...',
			actions: {
				primary: [
					toAction({ id: 'stopVoiceTranscription', label: 'Stop', run: () => stopVoiceTranscription() })
				]
			}
		});

		activeVoiceTranscription.add(toDisposable(() => voiceTranscriptionNotification.close()));

		activeVoiceTranscription.add(voiceRecognitionService.transcribe(cts.token)(text => {
			if (text) {
				voiceTranscriptionNotification.updateMessage(text);
			}
		}));
	}
});
