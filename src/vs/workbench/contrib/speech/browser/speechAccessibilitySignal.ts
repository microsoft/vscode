/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ISpeechService } from 'vs/workbench/contrib/speech/common/speechService';

export class SpeechAccessibilitySignalContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.speechAccessibilitySignal';

	constructor(
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@ISpeechService private readonly _speechService: ISpeechService,
	) {
		super();

		this._register(this._speechService.onDidStartSpeechToTextSession(() => this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStarted)));
		this._register(this._speechService.onDidEndSpeechToTextSession(() => this._accessibilitySignalService.playSignal(AccessibilitySignal.voiceRecordingStopped)));
	}
}
