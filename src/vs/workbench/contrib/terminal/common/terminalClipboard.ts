/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';

export async function shouldPasteTerminalText(accessor: ServicesAccessor, text: string, bracketedPasteMode: boolean | undefined): Promise<boolean> {
	const configurationService = accessor.get(IConfigurationService);
	const dialogService = accessor.get(IDialogService);

	// If the clipboard has only one line, a warning should never show
	const textForLines = text.split(/\r?\n/);
	if (textForLines.length === 1) {
		return true;
	}

	// Get config value
	function parseConfigValue(value: unknown): 'auto' | 'always' | 'never' {
		// Valid value
		if (typeof value === 'string') {
			if (value === 'auto' || value === 'always' || value === 'never') {
				return value;
			}
		}
		// Legacy backwards compatibility
		if (typeof value === 'boolean') {
			return value ? 'auto' : 'never';
		}
		// Invalid value fallback
		return 'auto';
	}
	const configValue = parseConfigValue(configurationService.getValue(TerminalSettingId.EnableMultiLinePasteWarning));

	// Never show it
	if (configValue === 'never') {
		return true;
	}

	// Special edge cases to not show for auto
	if (configValue === 'auto') {
		// Ignore check if the shell is in bracketed paste mode (ie. the shell can handle multi-line
		// text).
		if (bracketedPasteMode) {
			return true;
		}

		const textForLines = text.split(/\r?\n/);
		// Ignore check when a command is copied with a trailing new line
		if (textForLines.length === 2 && textForLines[1].trim().length === 0) {
			return true;
		}
	}

	const displayItemsCount = 3;
	const maxPreviewLineLength = 30;

	let detail = localize('preview', "Preview:");
	for (let i = 0; i < Math.min(textForLines.length, displayItemsCount); i++) {
		const line = textForLines[i];
		const cleanedLine = line.length > maxPreviewLineLength ? `${line.slice(0, maxPreviewLineLength)}…` : line;
		detail += `\n${cleanedLine}`;
	}

	if (textForLines.length > displayItemsCount) {
		detail += `\n…`;
	}

	const { confirmed, checkboxChecked } = await dialogService.confirm({
		message: localize('confirmMoveTrashMessageFilesAndDirectories', "Are you sure you want to paste {0} lines of text into the terminal?", textForLines.length),
		detail,
		primaryButton: localize({ key: 'multiLinePasteButton', comment: ['&& denotes a mnemonic'] }, "&&Paste"),
		checkbox: {
			label: localize('doNotAskAgain', "Do not ask me again")
		}
	});

	if (confirmed && checkboxChecked) {
		await configurationService.updateValue(TerminalSettingId.EnableMultiLinePasteWarning, false);
	}

	return confirmed;
}
