/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { triggerDownload } from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

export class RecorderContribution implements IWorkbenchContribution {
	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		let audioRecorder: MediaRecorder;
		let audio: HTMLAudioElement;
		let url: string;
		let blob: Blob;

		const entry = this.statusbarService.addEntry({
			name: 'Audio Recorder',
			text: '$(record) Start Recording',
			ariaLabel: 'Start Recording',
			tooltip: 'Start Recording',
			command: 'workbench.action.startAudioRecording'
		}, 'status.recorder', StatusbarAlignment.LEFT, 1000);

		CommandsRegistry.registerCommand('workbench.action.startAudioRecording', async () => {
			const audioDevice = await navigator.mediaDevices.getUserMedia({ audio: true });

			audioRecorder = new MediaRecorder(audioDevice, { mimeType: 'audio/webm;codecs=opus' });
			audioRecorder.start();

			entry.update({
				name: 'Audio Recorder',
				text: '$(stop-circle) Stop Recording',
				ariaLabel: 'Stop Recording',
				tooltip: 'Stop Recording',
				command: 'workbench.action.stopAudioRecording'
			});

			const chunks: Blob[] = [];
			audioRecorder.ondataavailable = e => {
				chunks.push(e.data);
			};

			audioRecorder.onstop = () => {
				blob = new Blob(chunks);
				url = window.URL.createObjectURL(blob);
				audio = new Audio(url);
			};
		});

		CommandsRegistry.registerCommand('workbench.action.stopAudioRecording', () => {
			entry.update({
				name: 'Audio Recorder',
				text: '$(play-circle) Play Recording',
				ariaLabel: 'Play Recording',
				tooltip: 'Play Recording',
				command: 'workbench.action.playAudioRecording'
			});

			audioRecorder.stop();
		});

		CommandsRegistry.registerCommand('workbench.action.playAudioRecording', () => {
			entry.update({
				name: 'Audio Recorder',
				text: '$(stop-circle) Stop Playing',
				ariaLabel: 'Stop Playing',
				tooltip: 'Stop Playing',
				command: 'workbench.action.stopAudioPlayback'
			});

			audio.play();
		});

		CommandsRegistry.registerCommand('workbench.action.stopAudioPlayback', () => {
			entry.update({
				name: 'Audio Recorder',
				text: '$(cloud-download) Download Recording',
				ariaLabel: 'Download Recording',
				tooltip: 'Download Recording',
				command: 'workbench.action.downloadAudioRecording'
			});

			audio.pause();
		});

		CommandsRegistry.registerCommand('workbench.action.downloadAudioRecording', () => {
			entry.update({
				name: 'Audio Recorder',
				text: '$(record) Start Recording',
				ariaLabel: 'Start Recording',
				tooltip: 'Start Recording',
				command: 'workbench.action.startAudioRecording'
			});

			triggerDownload(URI.parse(url), 'recording.webm');
		});

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.actions.transscribe',
					title: { value: 'OpenAI: Transcribe', original: 'OpenAI: Transcribe' },
					f1: true
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const dialogService = accessor.get(IDialogService);

				const { values } = await dialogService.input({
					message: 'Please enter your OpenAI token',
					inputs: [{
						type: 'text'
					}]
				});

				const formData = new FormData();
				const file = new File([blob], 'input.webm', { type: 'audio/webm' });

				formData.set('file', file);
				formData.set('model', 'whisper-1');

				try {
					const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
						method: 'POST',
						body: formData,
						headers: {
							'Authorization': `Bearer ${values![0]}`
						}
					});

					const reply = await response.json();

					dialogService.info(`You said: ${reply.text}`);
				} catch (error) {
					console.error(error);
				}
			}
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RecorderContribution, LifecyclePhase.Restored);
