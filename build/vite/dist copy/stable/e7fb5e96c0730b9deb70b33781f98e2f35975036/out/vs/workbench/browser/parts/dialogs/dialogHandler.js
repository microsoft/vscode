/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BrowserDialogHandler_1;
import { localize } from '../../../../nls.js';
import { AbstractDialogHandler } from '../../../../platform/dialogs/common/dialogs.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import Severity from '../../../../base/common/severity.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRendererService, openLinkFromMarkdown } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { createWorkbenchDialogOptions } from './dialog.js';
import { IHostService } from '../../../services/host/browser/host.js';
let BrowserDialogHandler = class BrowserDialogHandler extends AbstractDialogHandler {
    static { BrowserDialogHandler_1 = this; }
    static { this.ALLOWABLE_COMMANDS = new Set([
        'copy',
        'cut',
        'editor.action.selectAll',
        'editor.action.clipboardCopyAction',
        'editor.action.clipboardCutAction',
        'editor.action.clipboardPasteAction'
    ]); }
    constructor(logService, layoutService, keybindingService, instantiationService, clipboardService, openerService, markdownRendererService, hostService) {
        super();
        this.logService = logService;
        this.layoutService = layoutService;
        this.keybindingService = keybindingService;
        this.clipboardService = clipboardService;
        this.openerService = openerService;
        this.markdownRendererService = markdownRendererService;
        this.hostService = hostService;
    }
    async prompt(prompt) {
        this.logService.trace('DialogService#prompt', prompt.message);
        const buttons = this.getPromptButtons(prompt);
        const { button, checkboxChecked } = await this.doShow(prompt.type, prompt.message, buttons, prompt.detail, prompt.cancelButton ? buttons.length - 1 : -1 /* Disabled */, prompt.checkbox, undefined, typeof prompt?.custom === 'object' ? prompt.custom : undefined, prompt.token);
        return this.getPromptResult(prompt, button, checkboxChecked);
    }
    async confirm(confirmation) {
        this.logService.trace('DialogService#confirm', confirmation.message);
        const buttons = this.getConfirmationButtons(confirmation);
        const { button, checkboxChecked } = await this.doShow(confirmation.type ?? 'question', confirmation.message, buttons, confirmation.detail, buttons.length - 1, confirmation.checkbox, undefined, typeof confirmation?.custom === 'object' ? confirmation.custom : undefined, confirmation.token);
        return { confirmed: button === 0, checkboxChecked };
    }
    async input(input) {
        this.logService.trace('DialogService#input', input.message);
        const buttons = this.getInputButtons(input);
        const { button, checkboxChecked, values } = await this.doShow(input.type ?? 'question', input.message, buttons, input.detail, buttons.length - 1, input?.checkbox, input.inputs, typeof input.custom === 'object' ? input.custom : undefined, input.token);
        return { confirmed: button === 0, checkboxChecked, values };
    }
    async about(title, details, detailsToCopy) {
        const { button } = await this.doShow(Severity.Info, title, [
            localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
            localize('ok', "OK")
        ], details, 1);
        if (button === 0) {
            this.clipboardService.writeText(detailsToCopy);
        }
    }
    async doShow(type, message, buttons, detail, cancelId, checkbox, inputs, customOptions, token) {
        const dialogDisposables = new DisposableStore();
        const renderBody = customOptions ? (parent) => {
            parent.classList.add(...(customOptions.classes || []));
            customOptions.markdownDetails?.forEach(markdownDetail => {
                const result = dialogDisposables.add(this.markdownRendererService.render(markdownDetail.markdown, {
                    actionHandler: markdownDetail.actionHandler || ((link, mdStr) => {
                        return openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted, true /* skip URL validation to prevent another dialog from showing which is unsupported */);
                    }),
                }));
                parent.appendChild(result.element);
                result.element.classList.add(...(markdownDetail.classes || []));
            });
        } : undefined;
        const dialog = new Dialog(this.layoutService.activeContainer, message, buttons, createWorkbenchDialogOptions({
            detail,
            cancelId,
            type: this.getDialogType(type),
            renderBody,
            icon: customOptions?.icon,
            disableCloseAction: customOptions?.disableCloseAction,
            buttonOptions: customOptions?.buttonDetails?.map(detail => ({ sublabel: detail })),
            checkboxLabel: checkbox?.label,
            checkboxChecked: checkbox?.checked,
            inputs
        }, this.keybindingService, this.layoutService, this.hostService, BrowserDialogHandler_1.ALLOWABLE_COMMANDS));
        dialogDisposables.add(dialog);
        if (token) {
            dialogDisposables.add(token.onCancellationRequested(() => dialogDisposables.dispose()));
        }
        const result = await dialog.show();
        dialogDisposables.dispose();
        return result;
    }
};
BrowserDialogHandler = BrowserDialogHandler_1 = __decorate([
    __param(0, ILogService),
    __param(1, ILayoutService),
    __param(2, IKeybindingService),
    __param(3, IInstantiationService),
    __param(4, IClipboardService),
    __param(5, IOpenerService),
    __param(6, IMarkdownRendererService),
    __param(7, IHostService)
], BrowserDialogHandler);
export { BrowserDialogHandler };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9nSGFuZGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2RpYWxvZ3MvZGlhbG9nSGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBNEcscUJBQXFCLEVBQTJDLE1BQU0sZ0RBQWdELENBQUM7QUFDMU8sT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLFFBQVEsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRCxPQUFPLEVBQUUsTUFBTSxFQUFpQixNQUFNLDhDQUE4QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUM5RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMzSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQzNELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUUvRCxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLHFCQUFxQjs7YUFFdEMsdUJBQWtCLEdBQUcsSUFBSSxHQUFH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