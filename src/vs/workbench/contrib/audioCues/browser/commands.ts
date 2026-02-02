/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { Action2 } from 'vs/platform/actions/common/actions';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';

export class ShowAudioCueHelp extends Action2 {
	static readonly ID = 'audioCues.help';

	constructor() {
		super({
			id: ShowAudioCueHelp.ID,
			title: {
				value: localize('audioCues.help', "Help: List Audio Cues"),
				original: 'Help: List Audio Cues'
			},
			f1: true,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const audioCueService = accessor.get(IAudioCueService);
		const quickPickService = accessor.get(IQuickInputService);
		const preferencesService = accessor.get(IPreferencesService);
		const accessibilityService = accessor.get(IAccessibilityService);

		const items: (IQuickPickItem & { audioCue: AudioCue })[] = AudioCue.allAudioCues.map((cue, idx) => ({
			label: accessibilityService.isScreenReaderOptimized() ?
				`${cue.name}${audioCueService.isEnabled(cue) ? '' : ' (' + localize('disabled', "Disabled") + ')'}`
				: `${audioCueService.isEnabled(cue) ? '$(check)' : '     '} ${cue.name}`,
			audioCue: cue,
			buttons: [{
				iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
				tooltip: localize('audioCues.help.settings', 'Enable/Disable Audio Cue'),
			}],
		}));

		const quickPick = quickPickService.pick<IQuickPickItem & { audioCue: AudioCue }>(
			items,
			{
				activeItem: items[0],
				onDidFocus: (item) => {
					audioCueService.playSound(item.audioCue.sound.getSound(true), true);
				},
				onDidTriggerItemButton: (context) => {
					preferencesService.openSettings({ query: context.item.audioCue.settingsKey });
				},
				placeHolder: localize('audioCues.help.placeholder', 'Select an audio cue to play'),
			}
		);

		await quickPick;
	}
}
