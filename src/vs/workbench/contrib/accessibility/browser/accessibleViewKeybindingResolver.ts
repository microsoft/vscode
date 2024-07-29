/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IPickerQuickAccessItem } from 'vs/platform/quickinput/browser/pickerQuickAccess';

export function resolveContentAndKeybindingItems(keybindingService: IKeybindingService, value?: string): { content: MarkdownString; configureKeybindingItems: IPickerQuickAccessItem[] | undefined; configuredKeybindingItems: IPickerQuickAccessItem[] | undefined } | undefined {
	if (!value) {
		return;
	}
	const configureKeybindingItems: IPickerQuickAccessItem[] = [];
	const configuredKeybindingItems: IPickerQuickAccessItem[] = [];
	const matches = value.matchAll(/\<keybinding:(?<commandId>.*)\>/gm);
	for (const match of [...matches]) {
		const commandId = match?.groups?.commandId;
		let kbLabel;
		if (match?.length && commandId) {
			const keybinding = keybindingService.lookupKeybinding(commandId)?.getAriaLabel();
			if (!keybinding) {
				kbLabel = ` (unassigned keybinding)`;
				configureKeybindingItems.push({
					label: commandId,
					id: commandId
				});
			} else {
				kbLabel = ' (' + keybinding + ')';
				configuredKeybindingItems.push({
					label: commandId,
					id: commandId
				});
			}
			value = value.replace(match[0], kbLabel);
		}
	}
	const content = new MarkdownString(value);
	content.isTrusted = true;
	return { content, configureKeybindingItems: configureKeybindingItems.length ? configureKeybindingItems : undefined, configuredKeybindingItems: configuredKeybindingItems.length ? configuredKeybindingItems : undefined };
}

