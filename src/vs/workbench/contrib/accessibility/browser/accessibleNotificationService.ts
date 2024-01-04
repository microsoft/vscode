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
	private _events: Map<AccessibleNotificationEvent, {
		audioCue: AudioCue;
		alertMessage: string;
		alertSetting?: string;
	}> = new Map();
	constructor(
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@ILogService private readonly _logService: ILogService) {
		super();
		this._events.set(AccessibleNotificationEvent.Clear, { audioCue: AudioCue.clear, alertMessage: localize('cleared', "Cleared"), alertSetting: AccessibilityAlertSettingId.Clear });
		this._events.set(AccessibleNotificationEvent.Save, { audioCue: AudioCue.save, alertMessage: localize('saved', "Saved"), alertSetting: AccessibilityAlertSettingId.Save });
		this._events.set(AccessibleNotificationEvent.Format, { audioCue: AudioCue.format, alertMessage: localize('formatted', "Formatted"), alertSetting: AccessibilityAlertSettingId.Format });
		this._events.set(AccessibleNotificationEvent.Breakpoint, { audioCue: AudioCue.break, alertMessage: localize('breakpoint', "Breakpoint"), alertSetting: AccessibilityAlertSettingId.Breakpoint });
		this._events.set(AccessibleNotificationEvent.Error, { audioCue: AudioCue.error, alertMessage: localize('error', "Error"), alertSetting: AccessibilityAlertSettingId.Error });
		this._events.set(AccessibleNotificationEvent.Warning, { audioCue: AudioCue.warning, alertMessage: localize('warning', "Warning"), alertSetting: AccessibilityAlertSettingId.Warning });
		this._events.set(AccessibleNotificationEvent.Folded, { audioCue: AudioCue.foldedArea, alertMessage: localize('foldedArea', "Folded Area"), alertSetting: AccessibilityAlertSettingId.FoldedArea });
		this._events.set(AccessibleNotificationEvent.TerminalQuickFix, { audioCue: AudioCue.terminalQuickFix, alertMessage: localize('terminalQuickFix', "Quick Fix"), alertSetting: AccessibilityAlertSettingId.TerminalQuickFix });
		this._events.set(AccessibleNotificationEvent.TerminalBell, { audioCue: AudioCue.terminalBell, alertMessage: localize('terminalBell', "Terminal Bell"), alertSetting: AccessibilityAlertSettingId.TerminalBell });
		this._events.set(AccessibleNotificationEvent.TerminalCommandFailed, { audioCue: AudioCue.terminalCommandFailed, alertMessage: localize('terminalCommandFailed', "Terminal Command Failed"), alertSetting: AccessibilityAlertSettingId.TerminalCommandFailed });
		this._events.set(AccessibleNotificationEvent.TaskFailed, { audioCue: AudioCue.taskFailed, alertMessage: localize('taskFailed', "Task Failed"), alertSetting: AccessibilityAlertSettingId.TaskFailed });
		this._events.set(AccessibleNotificationEvent.TaskCompleted, { audioCue: AudioCue.taskCompleted, alertMessage: localize('taskCompleted', "Task Completed"), alertSetting: AccessibilityAlertSettingId.TaskCompleted });
		this._events.set(AccessibleNotificationEvent.ChatRequestSent, { audioCue: AudioCue.chatRequestSent, alertMessage: localize('chatRequestSent', "Chat Request Sent"), alertSetting: AccessibilityAlertSettingId.ChatRequestSent });
		this._events.set(AccessibleNotificationEvent.NotebookCellCompleted, { audioCue: AudioCue.notebookCellCompleted, alertMessage: localize('notebookCellCompleted', "Notebook Cell Completed"), alertSetting: AccessibilityAlertSettingId.NotebookCellCompleted });
		this._events.set(AccessibleNotificationEvent.NotebookCellFailed, { audioCue: AudioCue.notebookCellFailed, alertMessage: localize('notebookCellFailed', "Notebook Cell Failed"), alertSetting: AccessibilityAlertSettingId.NotebookCellFailed });
		this._events.set(AccessibleNotificationEvent.OnDebugBreak, { audioCue: AudioCue.onDebugBreak, alertMessage: localize('onDebugBreak', "On Debug Break"), alertSetting: AccessibilityAlertSettingId.OnDebugBreak });

		this._register(this._workingCopyService.onDidSave((e) => this._notifyBasedOnUserGesture(AccessibleNotificationEvent.Save, e.reason === SaveReason.EXPLICIT)));
	}

	notify(event: AccessibleNotificationEvent, userGesture?: boolean, forceSound?: boolean, allowManyInParallel?: boolean): void {
		if (event === AccessibleNotificationEvent.Format) {
			return this._notifyBasedOnUserGesture(AccessibleNotificationEvent.Format, userGesture);
		}
		const { audioCue, alertMessage, alertSetting } = this._events.get(event)!;
		const audioCueSetting = this._configurationService.getValue(audioCue.settingsKey);
		if (audioCueSetting === 'on' || audioCueSetting === 'auto' && this._accessibilityService.isScreenReaderOptimized() || forceSound) {
			this._logService.debug('AccessibleNotificationService playing sound: ', audioCue.name);
			this._audioCueService.playSound(audioCue.sound.getSound(), allowManyInParallel);
		}

		if (alertSetting && this._configurationService.getValue(alertSetting) === true) {
			this._logService.debug('AccessibleNotificationService alerting: ', alertMessage);
			this._accessibilityService.alert(alertMessage);
		}
	}

	/**
	 * Line feature contributions can use this to notify the user of changes to the line.
	 */
	notifyLineChanges(events: AccessibleNotificationEvent[]): void {
		const audioCues = events.map(e => this._events.get(e)!.audioCue);
		if (audioCues.length) {
			this._logService.debug('AccessibleNotificationService playing sounds if enabled: ', events.map(e => this._events.get(e)!.audioCue.name).join(', '));
			this._audioCueService.playAudioCues(audioCues);
		}

		const alerts = events.filter(e => this._configurationService.getValue(this._events.get(e)!.alertSetting!) === true).map(e => this._events.get(e)?.alertMessage);
		if (alerts.length) {
			this._logService.debug('AccessibleNotificationService alerting: ', alerts.join(', '));
			this._accessibilityService.alert(alerts.join(', '));
		}
	}

	private _notifyBasedOnUserGesture(event: AccessibleNotificationEvent, userGesture?: boolean): void {
		const { audioCue, alertMessage, alertSetting } = this._events.get(event)!;
		if (!alertSetting) {
			return;
		}
		const audioCueSetting: NotificationSetting = this._configurationService.getValue(audioCue.settingsKey);
		if (this._shouldNotify(audioCueSetting, userGesture)) {
			this._logService.debug('AccessibleNotificationService playing sound: ', audioCue.name);
			// Play sound bypasses the usual audio cue checks IE screen reader optimized, auto, etc.
			this._audioCueService.playSound(audioCue.sound.getSound(), true);
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
	notifyLineChanges(event: AccessibleNotificationEvent[]): void { }
}
