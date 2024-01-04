/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ISaveAudioCueService } from 'vs/platform/accessibility/common/accessibility';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { SaveReason } from 'vs/workbench/common/editor';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';

export class SaveAudioCueService extends Disposable implements ISaveAudioCueService {
	declare readonly _serviceBrand: undefined;
	constructor(
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService) {
		super();

		this._register(this._workingCopyService.onDidSave((e) => this._audioCueService.playAudioCue(AudioCue.save, { userGesture: e.reason === SaveReason.EXPLICIT })));
	}
}

export class TestAccessibleNotificationService extends Disposable implements ISaveAudioCueService {
	declare readonly _serviceBrand: undefined;
}
