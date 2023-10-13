/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { AccessibleNotificationEvent, IAccessibilityService, IAccessibleNotificationService } from 'vs/platform/accessibility/common/accessibility';
import { AudioCue, IAudioCueService, Sound } from 'vs/platform/audioCues/browser/audioCueService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class AccessibleNotificationService extends Disposable implements IAccessibleNotificationService {
	declare readonly _serviceBrand: undefined;
	private _events: Map<AccessibleNotificationEvent, { audioCue: AudioCue; alertMessage: string }> = new Map();
	constructor(
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService) {
		super();
		this._events.set(AccessibleNotificationEvent.Clear, { audioCue: AudioCue.clear, alertMessage: localize('cleared', "Cleared") });
		this._events.set(AccessibleNotificationEvent.Save, { audioCue: AudioCue.save, alertMessage: localize('saved', "Saved") });
	}

	notify(event: AccessibleNotificationEvent): void {
		const { audioCue, alertMessage } = this._events.get(event)!;
		const audioCueValue = this._configurationService.getValue(audioCue.settingsKey);
		if (audioCueValue === 'on' || audioCueValue === 'auto' && this._accessibilityService.isScreenReaderOptimized()) {
			this._audioCueService.playAudioCue(audioCue);
		} else {
			this._accessibilityService.alert(alertMessage);
		}
	}

	notifySaved(userGesture: boolean): void {
		const { audioCue, alertMessage } = this._events.get(AccessibleNotificationEvent.Save)!;
		const alertSetting: NotificationSetting = this._configurationService.getValue('accessibility.alert.save');
		if (this._shouldNotify(alertSetting, userGesture)) {
			this._accessibilityService.alert(alertMessage);
		}
		const audioCueSetting: NotificationSetting = this._configurationService.getValue(audioCue.settingsKey);
		if (this._shouldNotify(audioCueSetting, userGesture)) {
			// Play sound bypasses the usual audio cue checks IE screen reader optimized, auto, etc.
			this._audioCueService.playSound(Sound.save, true);
		}
	}

	private _shouldNotify(settingValue: NotificationSetting, userGesture: boolean): boolean {
		return settingValue === 'always' || settingValue === 'userGesture' && userGesture;
	}
}
type NotificationSetting = 'never' | 'always' | 'userGesture';

export class TestAccessibleNotificationService extends Disposable implements IAccessibleNotificationService {

	declare readonly _serviceBrand: undefined;

	notify(event: AccessibleNotificationEvent): void { }
	notifySaved(userGesture: boolean): void { }
}
