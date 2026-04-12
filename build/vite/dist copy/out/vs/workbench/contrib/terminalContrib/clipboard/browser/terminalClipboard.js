/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isString } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
export async function shouldPasteTerminalText(accessor, text, bracketedPasteMode) {
    const configurationService = accessor.get(IConfigurationService);
    const dialogService = accessor.get(IDialogService);
    // If the clipboard has only one line, a warning should never show
    const textForLines = text.split(/\r?\n/);
    if (textForLines.length === 1) {
        return true;
    }
    // Get config value
    function parseConfigValue(value) {
        // Valid value
        if (isString(value)) {
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
    const configValue = parseConfigValue(configurationService.getValue("terminal.integrated.enableMultiLinePasteWarning" /* TerminalSettingId.EnableMultiLinePasteWarning */));
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
    const { result, checkboxChecked } = await dialogService.prompt({
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
    if (result.confirmed && checkboxChecked) {
        await configurationService.updateValue("terminal.integrated.enableMultiLinePasteWarning" /* TerminalSettingId.EnableMultiLinePasteWarning */, 'never');
    }
    if (result.singleLine) {
        return { modifiedText: text.replace(/\r?\n/g, '') };
    }
    return result.confirmed;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDbGlwYm9hcmQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2xpcGJvYXJkL2Jyb3dzZXIvdGVybWluYWxDbGlwYm9hcmQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFJbkYsTUFBTSxDQUFDLEtBQUssVUFBVSx1QkFBdUIsQ0FBQyxRQUEwQixFQUFFLElBQVksRUFBRSxrQkFBdUM7SUFDOUgsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDakUsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUVuRCxrRUFBa0U7SUFDbEUsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN6QyxJQUFJLFlBQVksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDL0IsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsbUJBQW1CO0lBQ25CLFNBQVMsZ0JBQWdCLENBQUMsS0FBYztRQUN2QyxjQUFjO1FBQ2QsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNyQixJQUFJLEtBQUssS0FBSyxNQUFNLElBQUksS0FBSyxLQUFLLFFBQVEsSUFBSSxLQUFLLEtBQUssT0FBTyxFQUFFLENBQUM7Z0JBQ2pF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