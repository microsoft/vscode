/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize, localize2 } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { Action2 } from 'vs/platform/actions/common/actions';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';

export class ShowSignalSoundHelp extends Action2 {
	static readonly ID = 'signals.sounds.help';

	constructor() {
		super({
			id: ShowSignalSoundHelp.ID,
			title: localize2('signals.sound.help', "Help: List Signal Sounds"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const accessibilityService = accessor.get(IAccessibilityService);
		const userGestureSignals = [AccessibilitySignal.save, AccessibilitySignal.format];
		const items: (IQuickPickItem & { audioCue: AccessibilitySignal })[] = AccessibilitySignal.allAccessibilitySignals.map((signal, idx) => ({
			label: userGestureSignals.includes(signal) ? `${signal.name} (${configurationService.getValue(signal.signalSettingsKey + '.sound')})` : signal.name,
			audioCue: signal,
			buttons: userGestureSignals.includes(signal) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('sounds.help.settings', 'Enable/Disable Sound'),
				alwaysVisible: true
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { audioCue: AccessibilitySignal }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => accessibilitySignalService.isSoundEnabled(i.audioCue));
		qp.onDidAccept(() => {
			const enabledCues = qp.selectedItems.map(i => i.audioCue);
			const disabledCues = AccessibilitySignal.allAccessibilitySignals.filter(cue => !enabledCues.includes(cue));
			for (const cue of enabledCues) {
				if (!userGestureSignals.includes(cue)) {
					let { audioCue, announcement } = configurationService.getValue<{ audioCue: string; announcement?: string }>(cue.signalSettingsKey);
					audioCue = accessibilityService.isScreenReaderOptimized() ? 'auto' : 'on';
					if (announcement) {
						configurationService.updateValue(cue.signalSettingsKey, { audioCue, announcement });
					} else {
						configurationService.updateValue(cue.signalSettingsKey, { audioCue });
					}
				}
			}
			for (const cue of disabledCues) {
				const announcement = cue.announcementMessage ? configurationService.getValue(cue.signalSettingsKey + '.announcement') : undefined;
				const audioCue = userGestureSignals.includes(cue) ? 'never' : 'off';
				if (announcement) {
					configurationService.updateValue(cue.signalSettingsKey, { audioCue, announcement });
				} else {
					configurationService.updateValue(cue.signalSettingsKey, { audioCue });
				}
			}
			qp.hide();
		});
		qp.onDidChangeActive(() => {
			accessibilitySignalService.playSound(qp.activeItems[0].audioCue.sound.getSound(true), true);
		});
		qp.placeholder = localize('audioCues.help.placeholder', 'Select an audio cue to play and configure');
		qp.canSelectMany = true;
		await qp.show();
	}
}

export class ShowAccessibilityAnnouncementHelp extends Action2 {
	static readonly ID = 'accessibility.announcement.help';

	constructor() {
		super({
			id: ShowAccessibilityAnnouncementHelp.ID,
			title: localize2('accessibility.announcement.help', "Help: List Signal Announcements"),
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const accessibilityService = accessor.get(IAccessibilityService);
		const userGestureSignals = [AccessibilitySignal.save, AccessibilitySignal.format];
		const items: (IQuickPickItem & { audioCue: AccessibilitySignal })[] = AccessibilitySignal.allAccessibilitySignals.filter(c => !!c.announcementMessage).map((signal, idx) => ({
			label: userGestureSignals.includes(signal) ? `${signal.name} (${configurationService.getValue(signal.signalSettingsKey + '.announcement')})` : signal.name,
			audioCue: signal,
			buttons: userGestureSignals.includes(signal) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('announcement.help.settings', 'Enable/Disable Announcement'),
				alwaysVisible: true
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { audioCue: AccessibilitySignal }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => accessibilitySignalService.isAnnouncementEnabled(i.audioCue));
		qp.onDidAccept(() => {
			const enabledAlerts = qp.selectedItems.map(i => i.audioCue);
			const disabledAlerts = AccessibilitySignal.allAccessibilitySignals.filter(cue => !enabledAlerts.includes(cue));
			for (const cue of enabledAlerts) {
				if (!userGestureSignals.includes(cue)) {
					let { audioCue, alert } = configurationService.getValue<{ audioCue: string; alert?: string }>(cue.signalSettingsKey);
					alert = cue.announcementMessage && accessibilityService.isScreenReaderOptimized() ? 'auto' : undefined;
					if (alert) {
						configurationService.updateValue(cue.signalSettingsKey, { audioCue, alert });
					}
				}
			}
			for (const cue of disabledAlerts) {
				const alert = userGestureSignals.includes(cue) ? 'never' : 'off';
				const audioCue = configurationService.getValue(cue.signalSettingsKey + '.audioCue');
				configurationService.updateValue(cue.signalSettingsKey, { audioCue, alert });
			}
			qp.hide();
		});
		qp.placeholder = localize('alert.help.placeholder', 'Select an alert to configure');
		qp.canSelectMany = true;
		await qp.show();
	}
}
