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
		const items: (IQuickPickItem & { signal: AccessibilitySignal })[] = AccessibilitySignal.allAccessibilitySignals.map((signal, idx) => ({
			label: userGestureSignals.includes(signal) ? `${signal.name} (${configurationService.getValue(signal.settingsKey + '.sound')})` : signal.name,
			signal,
			buttons: userGestureSignals.includes(signal) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('sounds.help.settings', 'Enable/Disable Sound'),
				alwaysVisible: true
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { signal: AccessibilitySignal }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => accessibilitySignalService.isSoundEnabled(i.signal));
		qp.onDidAccept(() => {
			const enabledCues = qp.selectedItems.map(i => i.signal);
			const disabledCues = AccessibilitySignal.allAccessibilitySignals.filter(cue => !enabledCues.includes(cue));
			for (const cue of enabledCues) {
				if (!userGestureSignals.includes(cue)) {
					let { sound, announcement } = configurationService.getValue<{ sound: string; announcement?: string }>(cue.settingsKey);
					sound = accessibilityService.isScreenReaderOptimized() ? 'auto' : 'on';
					if (announcement) {
						configurationService.updateValue(cue.settingsKey, { sound, announcement });
					} else {
						configurationService.updateValue(cue.settingsKey, { sound });
					}
				}
			}
			for (const cue of disabledCues) {
				const announcement = cue.announcementMessage ? configurationService.getValue(cue.settingsKey + '.announcement') : undefined;
				const sound = userGestureSignals.includes(cue) ? 'never' : 'off';
				if (announcement) {
					configurationService.updateValue(cue.settingsKey, { sound, announcement });
				} else {
					configurationService.updateValue(cue.settingsKey, { sound });
				}
			}
			qp.hide();
		});
		qp.onDidChangeActive(() => {
			accessibilitySignalService.playSound(qp.activeItems[0].signal.sound.getSound(true), true);
		});
		qp.placeholder = localize('audioCues.help.placeholder', 'Select a sound to play and configure');
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
		const items: (IQuickPickItem & { signal: AccessibilitySignal })[] = AccessibilitySignal.allAccessibilitySignals.filter(c => !!c.announcementMessage).map((signal, idx) => ({
			label: userGestureSignals.includes(signal) ? `${signal.name} (${configurationService.getValue(signal.settingsKey + '.announcement')})` : signal.name,
			signal,
			buttons: userGestureSignals.includes(signal) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('announcement.help.settings', 'Enable/Disable Announcement'),
				alwaysVisible: true
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { signal: AccessibilitySignal }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => accessibilitySignalService.isAnnouncementEnabled(i.signal));
		qp.onDidAccept(() => {
			const enabledAnnouncements = qp.selectedItems.map(i => i.signal);
			const disabledAnnouncements = AccessibilitySignal.allAccessibilitySignals.filter(cue => !enabledAnnouncements.includes(cue));
			for (const cue of enabledAnnouncements) {
				if (!userGestureSignals.includes(cue)) {
					let { sound, announcement } = configurationService.getValue<{ sound: string; announcement?: string }>(cue.settingsKey);
					announcement = cue.announcementMessage && accessibilityService.isScreenReaderOptimized() ? 'auto' : undefined;
					if (announcement) {
						configurationService.updateValue(cue.settingsKey, { sound, announcement });
					}
				}
			}
			for (const cue of disabledAnnouncements) {
				const announcement = userGestureSignals.includes(cue) ? 'never' : 'off';
				const sound = configurationService.getValue(cue.settingsKey + '.sound');
				configurationService.updateValue(cue.settingsKey, { sound, announcement });
			}
			qp.hide();
		});
		qp.placeholder = localize('announcement.help.placeholder', 'Select an announcement to configure');
		qp.canSelectMany = true;
		await qp.show();
	}
}
