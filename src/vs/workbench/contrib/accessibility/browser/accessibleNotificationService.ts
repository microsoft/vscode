/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { AccessibleNotificationEvent, IAccessibilityService, IAccessibleNotificationService } from 'vs/platform/accessibility/common/accessibility';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { SaveReason } from 'vs/workbench/common/editor';
import { AccessibilityAlertSettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';

export class AccessibleNotificationService extends Disposable implements IAccessibleNotificationService {
	declare readonly _serviceBrand: undefined;
	private _events: Map<AccessibleNotificationEvent, { audioCue: AudioCue; alertMessage: string; alertSetting?: string }> = new Map();
	constructor(
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@ILogService private readonly _logService: ILogService) {
		super();
		this._events.set(AccessibleNotificationEvent.Clear, { audioCue: AudioCue.clear, alertMessage: localize('cleared', "Cleared") });
		this._events.set(AccessibleNotificationEvent.Save, { audioCue: AudioCue.save, alertMessage: localize('saved', "Saved"), alertSetting: AccessibilityAlertSettingId.Save });
		this._events.set(AccessibleNotificationEvent.Format, { audioCue: AudioCue.format, alertMessage: localize('formatted', "Formatted"), alertSetting: AccessibilityAlertSettingId.Format });

		this._register(this._workingCopyService.onDidSave((e) => this._notify(AccessibleNotificationEvent.Save, e.reason === SaveReason.EXPLICIT)));
	}

	notify(event: AccessibleNotificationEvent, userGesture?: boolean): void {
		if (event === AccessibleNotificationEvent.Format) {
			return this._notify(event, userGesture);
		}
		const { audioCue, alertMessage } = this._events.get(event)!;
		const audioCueValue = this._configurationService.getValue(audioCue.settingsKey);
		if (audioCueValue === 'on' || audioCueValue === 'auto' && this._accessibilityService.isScreenReaderOptimized()) {
			this._logService.debug('AccessibleNotificationService playing sound: ', audioCue.name);
			this._audioCueService.playAudioCue(audioCue);
		} else {
			this._logService.debug('AccessibleNotificationService alerting: ', alertMessage);
			this._accessibilityService.alert(alertMessage);
		}
	}

	private _notify(event: AccessibleNotificationEvent, userGesture?: boolean): void {
		const { audioCue, alertMessage, alertSetting } = this._events.get(event)!;
		if (!alertSetting) {
			return;
		}
		const audioCueSetting: NotificationSetting = this._configurationService.getValue(audioCue.settingsKey);
		if (this._shouldNotify(audioCueSetting, userGesture)) {
			this._logService.debug('AccessibleNotificationService playing sound: ', audioCue.name);
			// Play sound bypasses the usual audio cue checks IE screen reader optimized, auto, etc.
			this._audioCueService.playSound(audioCue.sound.getSound(), true);
			return;
		}
		if (audioCueSetting !== 'never') {
			// Never do both sound and alert
			return;
		}
		const alertSettingValue: NotificationSetting = this._configurationService.getValue(alertSetting);
		if (this._shouldNotify(alertSettingValue, userGesture)) {
			this._logService.debug('AccessibleNotificationService alerting: ', alertMessage);
			this._accessibilityService.alert(alertMessage);
		}
	}

	private _shouldNotify(settingValue: NotificationSetting, userGesture?: boolean): boolean {
		return settingValue === 'always' || settingValue === 'userGesture' && userGesture === true;
	}
}
type NotificationSetting = 'never' | 'always' | 'userGesture';

export class TestAccessibleNotificationService extends Disposable implements IAccessibleNotificationService {

	declare readonly _serviceBrand: undefined;

	notify(event: AccessibleNotificationEvent, userGesture?: boolean): void { }
}
