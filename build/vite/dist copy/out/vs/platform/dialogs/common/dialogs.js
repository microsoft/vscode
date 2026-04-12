/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename } from '../../../base/common/resources.js';
import Severity from '../../../base/common/severity.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { mnemonicButtonLabel } from '../../../base/common/labels.js';
import { isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { deepClone } from '../../../base/common/objects.js';
export const IDialogService = createDecorator('dialogService');
var DialogKind;
(function (DialogKind) {
    DialogKind[DialogKind["Confirmation"] = 1] = "Confirmation";
    DialogKind[DialogKind["Prompt"] = 2] = "Prompt";
    DialogKind[DialogKind["Input"] = 3] = "Input";
})(DialogKind || (DialogKind = {}));
export class AbstractDialogHandler {
    getConfirmationButtons(dialog) {
        return this.getButtons(dialog, DialogKind.Confirmation);
    }
    getPromptButtons(dialog) {
        return this.getButtons(dialog, DialogKind.Prompt);
    }
    getInputButtons(dialog) {
        return this.getButtons(dialog, DialogKind.Input);
    }
    getButtons(dialog, kind) {
        // We put buttons in the order of "default" button first and "cancel"
        // button last. There maybe later processing when presenting the buttons
        // based on OS standards.
        const buttons = [];
        switch (kind) {
            case DialogKind.Confirmation: {
                const confirmationDialog = dialog;
                if (confirmationDialog.primaryButton) {
                    buttons.push(confirmationDialog.primaryButton);
                }
                else {
                    buttons.push(localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"));
                }
                if (confirmationDialog.cancelButton) {
                    buttons.push(confirmationDialog.cancelButton);
                }
                else {
                    buttons.push(localize('cancelButton', "Cancel"));
                }
                break;
            }
            case DialogKind.Prompt: {
                const promptDialog = dialog;
                if (Array.isArray(promptDialog.buttons) && promptDialog.buttons.length > 0) {
                    buttons.push(...promptDialog.buttons.map(button => button.label));
                }
                if (promptDialog.cancelButton) {
                    if (promptDialog.cancelButton === true) {
                        buttons.push(localize('cancelButton', "Cancel"));
                    }
                    else if (typeof promptDialog.cancelButton === 'string') {
                        buttons.push(promptDialog.cancelButton);
                    }
                    else {
                        if (promptDialog.cancelButton.label) {
                            buttons.push(promptDialog.cancelButton.label);
                        }
                        else {
                            buttons.push(localize('cancelButton', "Cancel"));
                        }
                    }
                }
                if (buttons.length === 0) {
                    buttons.push(localize({ key: 'okButton', comment: ['&& denotes a mnemonic'] }, "&&OK"));
                }
                break;
            }
            case DialogKind.Input: {
                const inputDialog = dialog;
                if (inputDialog.primaryButton) {
                    buttons.push(inputDialog.primaryButton);
                }
                else {
                    buttons.push(localize({ key: 'okButton', comment: ['&& denotes a mnemonic'] }, "&&OK"));
                }
                if (inputDialog.cancelButton) {
                    buttons.push(inputDialog.cancelButton);
                }
                else {
                    buttons.push(localize('cancelButton', "Cancel"));
                }
                break;
            }
        }
        return buttons;
    }
    getDialogType(type) {
        if (typeof type === 'string') {
            return type;
        }
        if (typeof type === 'number') {
            return (type === Severity.Info) ? 'info' : (type === Severity.Error) ? 'error' : (type === Severity.Warning) ? 'warning' : 'none';
        }
        return undefined;
    }
    getPromptResult(prompt, buttonIndex, checkboxChecked) {
        const promptButtons = [...(prompt.buttons ?? [])];
        if (prompt.cancelButton && typeof prompt.cancelButton !== 'string' && typeof prompt.cancelButton !== 'boolean') {
            promptButtons.push(prompt.cancelButton);
        }
        let result = promptButtons[buttonIndex]?.run({ checkboxChecked });
        if (!(result instanceof Promise)) {
            result = Promise.resolve(result);
        }
        return { result, checkboxChecked };
    }
}
export const IFileDialogService = createDecorator('fileDialogService');
export var ConfirmResult;
(function (ConfirmResult) {
    ConfirmResult[ConfirmResult["SAVE"] = 0] = "SAVE";
    ConfirmResult[ConfirmResult["DONT_SAVE"] = 1] = "DONT_SAVE";
    ConfirmResult[ConfirmResult["CANCEL"] = 2] = "CANCEL";
})(ConfirmResult || (ConfirmResult = {}));
const MAX_CONFIRM_FILES = 10;
export function getFileNamesMessage(fileNamesOrResources) {
    const message = [];
    message.push(...fileNamesOrResources.slice(0, MAX_CONFIRM_FILES).map(fileNameOrResource => typeof fileNameOrResource === 'string' ? fileNameOrResource : basename(fileNameOrResource)));
    if (fileNamesOrResources.length > MAX_CONFIRM_FILES) {
        if (fileNamesOrResources.length - MAX_CONFIRM_FILES === 1) {
            message.push(localize('moreFile', "...1 additional file not shown"));
        }
        else {
            message.push(localize('moreFiles', "...{0} additional files not shown", fileNamesOrResources.length - MAX_CONFIRM_FILES));
        }
    }
    message.push('');
    return message.join('\n');
}
/**
 * A utility method to ensure the options for the message box dialog
 * are using properties that are consistent across all platforms and
 * specific to the platform where necessary.
 */
export function massageMessageBoxOptions(options, productService) {
    const massagedOptions = deepClone(options);
    let buttons = (massagedOptions.buttons ?? []).map(button => mnemonicButtonLabel(button).withMnemonic);
    let buttonIndeces = (options.buttons || []).map((button, index) => index);
    let defaultId = 0; // by default the first button is default button
    let cancelId = massagedOptions.cancelId ?? buttons.length - 1; // by default the last button is cancel button
    // Apply HIG per OS when more than one button is used
    if (buttons.length > 1) {
        const cancelButton = typeof cancelId === 'number' ? buttons[cancelId] : undefined;
        if (isLinux || isMacintosh) {
            // Linux: the GNOME HIG (https://developer.gnome.org/hig/patterns/feedback/dialogs.html?highlight=dialog)
            // recommend the following:
            // "Always ensure that the cancel button appears first, before the affirmative button. In left-to-right
            //  locales, this is on the left. This button order ensures that users become aware of, and are reminded
            //  of, the ability to cancel prior to encountering the affirmative button."
            //
            // Electron APIs do not reorder buttons for us, so we ensure a reverse order of buttons and a position
            // of the cancel button (if provided) that matches the HIG
            // macOS: the HIG (https://developer.apple.com/design/human-interface-guidelines/components/presentation/alerts)
            // recommend the following:
            // "Place buttons where people expect. In general, place the button people are most likely to choose on the trailing side in a
            //  row of buttons or at the top in a stack of buttons. Always place the default button on the trailing side of a row or at the
            //  top of a stack. Cancel buttons are typically on the leading side of a row or at the bottom of a stack."
            //
            // However: it seems that older macOS versions where 3 buttons were presented in a row differ from this
            // recommendation. In fact, cancel buttons were placed to the left of the default button and secondary
            // buttons on the far left. To support these older macOS versions we have to manually shuffle the cancel
            // button in the same way as we do on Linux. This will not have any impact on newer macOS versions where
            // shuffling is done for us.
            if (typeof cancelButton === 'string' && buttons.length > 1 && cancelId !== 1) {
                buttons.splice(cancelId, 1);
                buttons.splice(1, 0, cancelButton);
                const cancelButtonIndex = buttonIndeces[cancelId];
                buttonIndeces.splice(cancelId, 1);
                buttonIndeces.splice(1, 0, cancelButtonIndex);
                cancelId = 1;
            }
            if (isLinux && buttons.length > 1) {
                buttons = buttons.reverse();
                buttonIndeces = buttonIndeces.reverse();
                defaultId = buttons.length - 1;
                if (typeof cancelButton === 'string') {
                    cancelId = defaultId - 1;
                }
            }
        }
        else if (isWindows) {
            // Windows: the HIG (https://learn.microsoft.com/en-us/windows/win32/uxguide/win-dialog-box)
            // recommend the following:
            // "One of the following sets of concise commands: Yes/No, Yes/No/Cancel, [Do it]/Cancel,
            //  [Do it]/[Don't do it], [Do it]/[Don't do it]/Cancel."
            //
            // Electron APIs do not reorder buttons for us, so we ensure the position of the cancel button
            // (if provided) that matches the HIG
            if (typeof cancelButton === 'string' && buttons.length > 1 && cancelId !== buttons.length - 1 /* last action */) {
                buttons.splice(cancelId, 1);
                buttons.push(cancelButton);
                const buttonIndex = buttonIndeces[cancelId];
                buttonIndeces.splice(cancelId, 1);
                buttonIndeces.push(buttonIndex);
                cancelId = buttons.length - 1;
            }
        }
    }
    massagedOptions.buttons = buttons;
    massagedOptions.defaultId = defaultId;
    massagedOptions.cancelId = cancelId;
    massagedOptions.noLink = true;
    massagedOptions.title = massagedOptions.title || productService.nameLong;
    return {
        options: massagedOptions,
        buttonIndeces
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9ncy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFNaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sUUFBUSxNQUFNLGtDQUFrQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHOUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckUsT0FBTyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbkYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBeVE1RCxNQUFNLENBQUMsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUFpQixlQUFlLENBQUMsQ0FBQztBQTJDL0UsSUFBSyxVQUlKO0FBSkQsV0FBSyxVQUFVO0lBQ2QsMkRBQWdCLENBQUE7SUFDaEIsK0NBQU0sQ0FBQTtJQUNOLDZDQUFLLENBQUE7QUFDTixDQUFDLEVBSkksVUFBVSxLQUFWLFVBQVUsUUFJZDtBQUVELE1BQU0sT0FBZ0IscUJBQXFCO0lBRWhDLHNCQUFzQixDQUFDLE1BQXFCO1FBQ3JELE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFUyxnQkFBZ0IsQ0FBQyxNQUF3QjtRQUNsRCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRVMsZUFBZSxD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