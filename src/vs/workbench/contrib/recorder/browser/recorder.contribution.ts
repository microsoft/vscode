/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';

export class RecorderContribution implements IWorkbenchContribution {
	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService
	) {
		let audioRecorder: MediaRecorder;
		let audio: HTMLAudioElement;


		const entry = this.statusbarService.addEntry({
			name: 'Audio Recorder',
			text: '$(record) Start Recording',
			ariaLabel: 'Start Recording',
			tooltip: 'Start Recording',
			command: 'workbench.action.startAudioRecording'
		}, 'status.recorder', StatusbarAlignment.LEFT, 1000);

		CommandsRegistry.registerCommand('workbench.action.startAudioRecording', async () => {
			entry.update({
				name: 'Audio Recorder',
				text: '$(stop-circle) Stop Recording',
				ariaLabel: 'Stop Recording',
				tooltip: 'Stop Recording',
				command: 'workbench.action.stopAudioRecording'
			});

			const audioDevice = await navigator.mediaDevices.getUserMedia({ audio: true });
			audioRecorder = new MediaRecorder(audioDevice);
			audioRecorder.start();

			const chunks: Blob[] = [];
			audioRecorder.ondataavailable = e => {
				chunks.push(e.data);
			};

			audioRecorder.onstop = () => {
				audio = new Audio(window.URL.createObjectURL(new Blob(chunks, { 'type': 'audio/ogg; codecs=vorbis' })));
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
				text: '$(record) Start Recording',
				ariaLabel: 'Start Recording',
				tooltip: 'Start Recording',
				command: 'workbench.action.startAudioRecording'
			});

			audio.pause();
		});
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RecorderContribution, LifecyclePhase.Restored);
