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
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export class ShowSignalSoundHelp extends Action2 {
	static readonly ID = 'signals.sounds.help';

	constructor() {
		super({
			id: ShowSignalSoundHelp.ID,
			title: localize2('signals.sound.help', "Help: List Signal Sounds"),
			f1: true,
			metadata: {
				description: localize('accessibility.sound.help.description', "List all accessibility sounds / audio cues and configure their settings")
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const accessibilityService = accessor.get(IAccessibilityService);
		const preferencesService = accessor.get(IPreferencesService);
		const userGestureSignals = [AccessibilitySignal.save, AccessibilitySignal.format];
		const items: (IQuickPickItem & { signal: AccessibilitySignal })[] = AccessibilitySignal.allAccessibilitySignals.map((signal, idx) => ({
			label: userGestureSignals.includes(signal) ? `${signal.name} (${configurationService.getValue(signal.settingsKey + '.sound')})` : signal.name,
			signal,
			buttons: userGestureSignals.includes(signal) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('sounds.help.settings', 'Configure Sound'),
				alwaysVisible: true
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { signal: AccessibilitySignal }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => accessibilitySignalService.isSoundEnabled(i.signal) || userGestureSignals.includes(i.signal) && configurationService.getValue(i.signal.settingsKey + '.sound') !== 'never');
		qp.onDidAccept(() => {
			const enabledSounds = qp.selectedItems.map(i => i.signal);
			const disabledSounds = qp.items.map(i => (i as any).signal).filter(i => !enabledSounds.includes(i));
			for (const signal of enabledSounds) {
				let { sound, announcement } = configurationService.getValue<{ sound: string; announcement?: string }>(signal.settingsKey);
				sound = userGestureSignals.includes(signal) ? 'userGesture' : accessibilityService.isScreenReaderOptimized() ? 'auto' : 'on';
				if (announcement) {
					configurationService.updateValue(signal.settingsKey, { sound, announcement });
				} else {
					configurationService.updateValue(signal.settingsKey, { sound });
				}
			}
			for (const signal of disabledSounds) {
				let { sound, announcement } = configurationService.getValue<{ sound: string; announcement?: string }>(signal.settingsKey);
				sound = userGestureSignals.includes(signal) ? 'never' : 'off';
				if (announcement) {
					configurationService.updateValue(signal.settingsKey, { sound, announcement });
				} else {
					configurationService.updateValue(signal.settingsKey, { sound });
				}
			}
			qp.hide();
		});
		qp.onDidTriggerItemButton(e => {
			preferencesService.openUserSettings({ jsonEditor: true, revealSetting: { key: e.item.signal.settingsKey, edit: true } });
		});
		qp.onDidChangeActive(() => {
			accessibilitySignalService.playSound(qp.activeItems[0].signal.sound.getSound(true), true);
		});
		qp.placeholder = localize('sounds.help.placeholder', 'Select a sound to play and configure');
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
			metadata: {
				description: localize('accessibility.announcement.help.description', "List all accessibility announcements / alerts and configure their settings")
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationService = accessor.get(IConfigurationService);
		const accessibilityService = accessor.get(IAccessibilityService);
		const preferencesService = accessor.get(IPreferencesService);
		const userGestureSignals = [AccessibilitySignal.save, AccessibilitySignal.format];
		const items: (IQuickPickItem & { signal: AccessibilitySignal })[] = AccessibilitySignal.allAccessibilitySignals.filter(c => !!c.legacyAnnouncementSettingsKey).map((signal, idx) => ({
			label: userGestureSignals.includes(signal) ? `${signal.name} (${configurationService.getValue(signal.settingsKey + '.announcement')})` : signal.name,
			signal,
			buttons: userGestureSignals.includes(signal) ? [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('announcement.help.settings', 'Configure Announcement'),
				alwaysVisible: true,
			}] : []
		}));
		const qp = quickInputService.createQuickPick<IQuickPickItem & { signal: AccessibilitySignal }>();
		qp.items = items;
		qp.selectedItems = items.filter(i => accessibilitySignalService.isAnnouncementEnabled(i.signal) || userGestureSignals.includes(i.signal) && configurationService.getValue(i.signal.settingsKey + '.announcement') !== 'never');
		qp.onDidAccept(() => {
			const enabledAnnouncements = qp.selectedItems.map(i => i.signal);
			const disabledAnnouncements = AccessibilitySignal.allAccessibilitySignals.filter(cue => !!cue.legacyAnnouncementSettingsKey && !enabledAnnouncements.includes(cue));
			for (const signal of enabledAnnouncements) {
				let { sound, announcement } = configurationService.getValue<{ sound: string; announcement?: string }>(signal.settingsKey);
				announcement = userGestureSignals.includes(signal) ? 'userGesture' : signal.announcementMessage && accessibilityService.isScreenReaderOptimized() ? 'auto' : undefined;
				configurationService.updateValue(signal.settingsKey, { sound, announcement });
			}
			for (const signal of disabledAnnouncements) {
				const announcement = userGestureSignals.includes(signal) ? 'never' : 'off';
				const sound = configurationService.getValue(signal.settingsKey + '.sound');
				configurationService.updateValue(signal.settingsKey, announcement ? { sound, announcement } : { sound });
			}
			qp.hide();
		});
		qp.onDidTriggerItemButton(e => {
			preferencesService.openUserSettings({ jsonEditor: true, revealSetting: { key: e.item.signal.settingsKey, edit: true } });
		});
		qp.placeholder = localize('announcement.help.placeholder', 'Select an announcement to configure');
		qp.canSelectMany = true;
		await qp.show();
	}
}
