/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// eslint-disable-next-line local/code-translation-remind
import { localize } from 'vs/nls';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { DeferredPromise } from 'vs/base/common/async';
import { env } from 'vs/base/common/process';

export class RecorderContribution implements IWorkbenchContribution {
	constructor(
		@ICommandService commandService: ICommandService,
		@IProgressService progressService: IProgressService,
	) {
		let stopAudioRecordingPromise: DeferredPromise<void> | undefined = undefined;

		CommandsRegistry.registerCommand('workbench.action.toggleAudioChat', async () => {
			if (stopAudioRecordingPromise) {
				stopAudioRecordingPromise.complete();
				stopAudioRecordingPromise = undefined;
			} else {
				stopAudioRecordingPromise = new DeferredPromise<void>();

				await progressService.withProgress({
					location: ProgressLocation.Window,
					title: localize('audioChat', "Audio Chat"),
					command: 'workbench.action.toggleAudioChat'
				}, async progress => {
					progress.report({ message: localize('audioChatGettingReady', "Getting audio device ready...") });

					const audioDevice = await navigator.mediaDevices.getUserMedia({ audio: true });
					const audioRecorder = new MediaRecorder(audioDevice, { mimeType: 'audio/webm;codecs=opus' });
					audioRecorder.start();

					progress.report({ message: localize('audioChatRecording', "Recording...") });

					const chunks: Blob[] = [];
					audioRecorder.ondataavailable = e => {
						chunks.push(e.data);
					};

					const donePromise = new DeferredPromise<void>();
					audioRecorder.onstop = async () => {
						const blob = new Blob(chunks);

						const formData = new FormData();
						const file = new File([blob], 'input.webm', { type: 'audio/webm' });

						formData.set('file', file);
						formData.set('model', 'whisper-1');

						try {
							const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
								method: 'POST',
								body: formData,
								headers: {
									'Authorization': `Bearer ${env['OPENAI_API_KEY']}`
								}
							});

							const reply = await response.json();

							commandService.executeCommand('chat.action.askQuickQuestion', reply.text);
						} catch (error) {
							console.error(error);
						} finally {
							donePromise.complete();
						}
					};

					await stopAudioRecordingPromise!.p;

					audioRecorder.stop();

					progress.report({ message: localize('audioChatProcessing', "Processing...") });

					return donePromise.p;
				});
			}
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RecorderContribution, LifecyclePhase.Restored);
