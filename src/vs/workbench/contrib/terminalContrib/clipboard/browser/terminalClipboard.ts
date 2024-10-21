/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { Constants } from '../../../terminal/browser/terminal.contribution.js';
import { TerminalClipboardSettingId } from '../common/terminalClipboardConfiguration.js';
import { SmartPasteUtils } from './smartPasteUtils.js';

export async function shouldPasteTerminalText(accessor: ServicesAccessor, text: string, bracketedPasteMode: boolean | undefined, shellType: string): Promise<boolean | { modifiedText: string }> {
	const configurationService = accessor.get(IConfigurationService);
	const dialogService = accessor.get(IDialogService);

	// If the clipboard has only one line, a warning should never show
	const textForLines = text.split(/\r?\n/);

	const isSmartPasteAllowed = configurationService.getValue(TerminalClipboardSettingId.EnableSmartPaste);
	// If the string is a path process it depending on the shell type
	// multi line strings aren't handled
	let modifiedText = text;

	if (isSmartPasteAllowed) {
		modifiedText = SmartPasteUtils.handleSmartPaste(text, shellType);
	}

	if (textForLines.length === 1) {
		return text === modifiedText ? true : { modifiedText: modifiedText };
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

	const { result, checkboxChecked } = await dialogService.prompt<{ confirmed: boolean; singleLine: boolean }>({
		message: localize('confirmMoveTrashMessageFilesAndDirectories', "Are you sure you want to paste {0} lines of text into the terminal?", textForLines.length),
		detail,
		type: 'warning',
		buttons: [
			{
				label: localize({ key: 'multiLinePasteButton', comment: ['&& denotes a mnemonic'] }, "&&Paste"),
				run: () => ({ confirmed: true, singleLine: false })
			},
			{
				label: localize({ key: 'multiLinePasteButton.oneLine', comment: ['&& denotes a mnemonic'] }, "Paste as &&one line"),
				run: () => ({ confirmed: true, singleLine: true })
			}
		],
		cancelButton: true,
		checkbox: {
			label: localize('doNotAskAgain', "Do not ask me again")
		}
	});

	if (!result) {
		return false;
	}

	if (result.confirmed) {
		/* Send ctrl+v to PSReadline if its a pwsh instance */
		if (shellType === 'pwsh' && !result.singleLine) {
			return { modifiedText: String.fromCharCode('V'.charCodeAt(0) - Constants.CtrlLetterOffset) };
		}
		if (checkboxChecked) {
			await configurationService.updateValue(TerminalSettingId.EnableMultiLinePasteWarning, false);
		}
	}

	if (result.singleLine) {
		return { modifiedText: text.replace(/\r?\n/g, '') };
	}

	return result.confirmed;
}
