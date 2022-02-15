/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { AudioCue, IAudioCueService } from 'vs/workbench/contrib/audioCues/browser/audioCueService';
import { IDebugService, State } from 'vs/workbench/contrib/debug/common/debug';

export class AudioCueLineDebuggerContribution
	extends Disposable
	implements IWorkbenchContribution {

	constructor(
		@IDebugService debugService: IDebugService,
		@IAudioCueService audioCueService: IAudioCueService,
	) {
		super();

		this._register(debugService.onDidChangeState(e => {
			if (e === State.Stopped) {
				audioCueService.playAudioCue(AudioCue.executionStopped);
			}
		}));
	}
}
