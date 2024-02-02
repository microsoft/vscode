/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize, localize2 } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { Action2 } from 'vs/platform/actions/common/actions';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';

export class ShowAudioCueHelp extends Action2 {
	static readonly ID = 'audioCues.help';

	constructor() {
		super({
			id: ShowAudioCueHelp.ID,
			title: localize2('audioCues.help', "Help: List Audio Cues"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const audioCueService = accessor.get(IAudioCueService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const accessibilityService = accessor.get(IAccessibilityService);
		const userGestureCues = [AudioCue.save, AudioCue.format];
		const items: (IQuickPickItem & { audioCue: AudioCue })[] = AudioCue.allAudioCues.map((cue, idx) => ({
			label: userGestureCues.includes(cue) ? `${cue.name} (${configurationService.getValue(cue.settingsKey)})` : cue.name,
			audioCue: cue,
			buttons: userGestureCues.includes(cue) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('audioCues.help.settings', 'Enable/Disable Audio Cue'),
				alwaysVisible: true
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { audioCue: AudioCue }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => audioCueService.isCueEnabled(i.audioCue));
		qp.onDidAccept(() => {
			const enabledCues = qp.selectedItems.map(i => i.audioCue);
			const disabledCues = AudioCue.allAudioCues.filter(cue => !enabledCues.includes(cue));
			for (const cue of enabledCues) {
				if (!userGestureCues.includes(cue)) {
					configurationService.updateValue(cue.settingsKey, accessibilityService.isScreenReaderOptimized() ? 'auto' : 'on');
				}
			}
			for (const cue of disabledCues) {
				if (userGestureCues.includes(cue)) {
					configurationService.updateValue(cue.settingsKey, 'never');
				} else {
					configurationService.updateValue(cue.settingsKey, 'off');
				}
			}
			qp.hide();
		});
		qp.onDidChangeActive(() => {
			audioCueService.playSound(qp.activeItems[0].audioCue.sound.getSound(true), true);
		});
		qp.placeholder = localize('audioCues.help.placeholder', 'Select an audio cue to play and configure');
		qp.canSelectMany = true;
		await qp.show();
	}
}

export class ShowAccessibilityAlertHelp extends Action2 {
	static readonly ID = 'accessibility.alert.help';

	constructor() {
		super({
			id: ShowAccessibilityAlertHelp.ID,
			title: localize2('accessibility.alert.help', "Help: List Alerts"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const audioCueService = accessor.get(IAudioCueService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const userGestureAlerts = [AudioCue.save, AudioCue.format];
		const items: (IQuickPickItem & { audioCue: AudioCue })[] = AudioCue.allAudioCues.filter(c => c.alertSettingsKey).map((cue, idx) => ({
			label: userGestureAlerts.includes(cue) && cue.alertSettingsKey ? `${cue.name} (${configurationService.getValue(cue.alertSettingsKey)})` : cue.name,
			audioCue: cue,
			buttons: userGestureAlerts.includes(cue) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('alert.help.settings', 'Enable/Disable Alert'),
				alwaysVisible: true
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { audioCue: AudioCue }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => audioCueService.isAlertEnabled(i.audioCue));
		qp.onDidAccept(() => {
			const enabledAlerts = qp.selectedItems.map(i => i.audioCue);
			const disabledAlerts = AudioCue.allAudioCues.filter(cue => !enabledAlerts.includes(cue));
			for (const cue of enabledAlerts) {
				if (!userGestureAlerts.includes(cue)) {
					configurationService.updateValue(cue.alertSettingsKey!, true);
				}
			}
			for (const cue of disabledAlerts) {
				if (userGestureAlerts.includes(cue)) {
					configurationService.updateValue(cue.alertSettingsKey!, 'never');
				} else {
					configurationService.updateValue(cue.alertSettingsKey!, false);
				}
			}
			qp.hide();
		});
		qp.placeholder = localize('alert.help.placeholder', 'Select an alert to configure');
		qp.canSelectMany = true;
		await qp.show();
	}
}
