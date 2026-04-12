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
var TerminalClipboardContribution_1;
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalConfigurationService } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { shouldPasteTerminalText } from './terminalClipboard.js';
import { Emitter } from '../../../../../base/common/event.js';
import { BrowserFeatures } from '../../../../../base/browser/canIUse.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isLinux, isMacintosh } from '../../../../../base/common/platform.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { registerActiveInstanceAction, registerActiveXtermAction } from '../../../terminal/browser/terminalActions.js';
import { localize2 } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { terminalStrings } from '../../../terminal/common/terminalStrings.js';
import { isString } from '../../../../../base/common/types.js';
// #region Terminal Contributions
let TerminalClipboardContribution = class TerminalClipboardContribution extends Disposable {
    static { TerminalClipboardContribution_1 = this; }
    static { this.ID = 'terminal.clipboard'; }
    static get(instance) {
        return instance.getContribution(TerminalClipboardContribution_1.ID);
    }
    constructor(_ctx, _clipboardService, _configurationService, _instantiationService, _notificationService, _terminalConfigurationService) {
        super();
        this._ctx = _ctx;
        this._clipboardService = _clipboardService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._notificationService = _notificationService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._overrideCopySelection = undefined;
        this._onWillPaste = this._register(new Emitter());
        this.onWillPaste = this._onWillPaste.event;
        this._onDidPaste = this._register(new Emitter());
        this.onDidPaste = this._onDidPaste.event;
    }
    xtermReady(xterm) {
        this._xterm = xterm;
        // TODO: This should be a different event on xterm, copying html should not share the requesting run command event
        this._register(xterm.onDidRequestCopyAsHtml(e => this.copySelection(true, e.command)));
        this._register(xterm.raw.onSelectionChange(async () => {
            if (this._configurationService.getValue("terminal.integrated.copyOnSelection" /* TerminalSettingId.CopyOnSelection */)) {
                if (this._overrideCopySelection === false) {
                    return;
                }
                if (this._ctx.instance.hasSelection()) {
                    await this.copySelection();
                }
            }
        }));
    }
    async copySelection(asHtml, command) {
        // TODO: Confirm this is fine that it's no longer awaiting xterm promise
        this._xterm?.copySelection(asHtml, command);
    }
    /**
     * Focuses and pastes the contents of the clipboard into the terminal instance.
     */
    async paste() {
        let text = await this._clipboardService.readText();
        if (!text) {
            const [resource] = await this._clipboardService.readResources();
            if (resource?.scheme === Schemas.file) {
                text = resource.fsPath;
            }
        }
        await this._paste(text);
    }
    /**
     * Focuses and pastes the contents of the selection clipboard into the terminal instance.
     */
    async pasteSelection() {
        await this._paste(await this._clipboardService.readText('selection'));
    }
    async _paste(value) {
        if (!this._xterm) {
            return;
        }
        let currentText = value;
        const shouldPasteText = await this._instantiationService.invokeFunction(shouldPasteTerminalText, currentText, this._xterm?.raw.modes.bracketedPasteMode);
        if (!shouldPasteText) {
            return;
        }
        if (typeof shouldPasteText === 'object') {
            currentText = shouldPasteText.modifiedText;
        }
        this._ctx.instance.focus();
        this._onWillPaste.fire(currentText);
        this._xterm.raw.paste(currentText);
        this._onDidPaste.fire(currentText);
    }
    async handleMouseEvent(event) {
        switch (event.button) {
            case 1: { // Middle click
                if (this._terminalConfigurationService.config.middleClickBehavior === 'paste') {
                    this.paste();
                    return { handled: true };
                }
                break;
            }
            case 2: { // Right click
                // Ignore shift click as it forces the context menu
                if (event.shiftKey) {
                    return;
                }
                const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
                if (rightClickBehavior !== 'copyPaste' && rightClickBehavior !== 'paste') {
                    return;
                }
                if (rightClickBehavior === 'copyPaste' && this._ctx.instance.hasSelection()) {
                    await this.copySelection();
                    this._ctx.instance.clearSelection();
                }
                else {
                    if (BrowserFeatures.clipboard.readText) {
                        this.paste();
                    }
                    else {
                        this._notificationService.info(`This browser doesn't support the clipboard.readText API needed to trigger a paste, try ${isMacintosh ? '⌘' : 'Ctrl'}+V instead.`);
                    }
                }
                // Clear selection after all click event bubbling is finished on Mac to prevent
                // right-click selecting a word which is seemed cannot be disabled. There is a
                // flicker when pasting but this appears to give the best experience if the
                // setting is enabled.
                if (isMacintosh) {
                    setTimeout(() => this._ctx.instance.clearSelection(), 0);
                }
                return { handled: true };
            }
        }
    }
    /**
     * Override the copy on selection feature with a custom value.
     * @param value Whether to enable copySelection.
     */
    overrideCopyOnSelection(value) {
        if (this._overrideCopySelection !== undefined) {
            throw new Error('Cannot set a copy on selection override multiple times');
        }
        this._overrideCopySelection = value;
        return toDisposable(() => this._overrideCopySelection = undefined);
    }
};
TerminalClipboardContribution = TerminalClipboardContribution_1 = __decorate([
    __param(1, IClipboardService),
    __param(2, IConfigurationService),
    __param(3, IInstantiationService),
    __param(4, INotificationService),
    __param(5, ITerminalConfigurationService)
], TerminalClipboardContribution);
export { TerminalClipboardContribution };
registerTerminalContribution(TerminalClipboardContribution.ID, TerminalClipboardContribution, false);
// #endregion
// #region Actions
const terminalAvailableWhenClause = ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated);
// TODO: Move these commands into this terminalContrib/
registerActiveInstanceAction({
    id: "workbench.action.terminal.copyLastCommand" /* TerminalCommandId.CopyLastCommand */,
    title: localize2('workbench.action.terminal.copyLastCommand', "Copy Last Command"),
    precondition: terminalAvailableWhenClause,
    run: async (instance, c, accessor) => {
        const clipboardService = accessor.get(IClipboardService);
        const commands = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */)?.commands;
        if (!commands || commands.length === 0) {
            return;
        }
        const command = commands[commands.length - 1];
        if (!command.command) {
            return;
        }
        await clipboardService.writeText(command.command);
    }
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.copyLastCommandOutput" /* TerminalCommandId.CopyLastCommandOutput */,
    title: localize2('workbench.action.terminal.copyLastCommandOutput', "Copy Last Command Output"),
    precondition: terminalAvailableWhenClause,
    run: async (instance, c, accessor) => {
        const clipboardService = accessor.get(IClipboardService);
        const commands = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */)?.commands;
        if (!commands || commands.length === 0) {
            return;
        }
        const command = commands[commands.length - 1];
        if (!command?.hasOutput()) {
            return;
        }
        const output = command.getOutput();
        if (isString(output)) {
            await clipboardService.writeText(output);
        }
    }
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.copyLastCommandAndLastCommandOutput" /* TerminalCommandId.CopyLastCommandAndLastCommandOutput */,
    title: localize2('workbench.action.terminal.copyLastCommandAndOutput', "Copy Last Command and Output"),
    precondition: terminalAvailableWhenClause,
    run: async (instance, c, accessor) => {
        const clipboardService = accessor.get(IClipboardService);
        const commands = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */)?.commands;
        if (!commands || commands.length === 0) {
            return;
        }
        const command = commands[commands.length - 1];
        if (!command?.hasOutput()) {
            return;
        }
        const output = command.getOutput();
        if (isString(output)) {
            await clipboardService.writeText(`${command.command !== '' ? command.command + '\n' : ''}${output}`);
        }
    }
});
// Some commands depend on platform features
if (BrowserFeatures.clipboard.writeText) {
    registerActiveXtermAction({
        id: "workbench.action.terminal.copySelection" /* TerminalCommandId.CopySelection */,
        title: localize2('workbench.action.terminal.copySelection', 'Copy Selection'),
        // TODO: Why is copy still showing up when text isn't selected?
        precondition: ContextKeyExpr.or(TerminalContextKeys.textSelectedInFocused, ContextKeyExpr.and(terminalAvailableWhenClause, TerminalContextKeys.textSelected)),
        keybinding: [{
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 33 /* KeyCode.KeyC */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.or(ContextKeyExpr.and(TerminalContextKeys.textSelected, TerminalContextKeys.focus), TerminalContextKeys.textSelectedInFocused)
            }],
        run: (activeInstance) => activeInstance.copySelection()
    });
    registerActiveXtermAction({
        id: "workbench.action.terminal.copyAndClearSelection" /* TerminalCommandId.CopyAndClearSelection */,
        title: localize2('workbench.action.terminal.copyAndClearSelection', 'Copy and Clear Selection'),
        precondition: ContextKeyExpr.or(TerminalContextKeys.textSelectedInFocused, ContextKeyExpr.and(terminalAvailableWhenClause, TerminalContextKeys.textSelected)),
        keybinding: [{
                win: { primary: 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: ContextKeyExpr.or(ContextKeyExpr.and(TerminalContextKeys.textSelected, TerminalContextKeys.focus), TerminalContextKeys.textSelectedInFocused)
            }],
        run: async (xterm) => {
            await xterm.copySelection();
            xterm.clearSelection();
        }
    });
    registerActiveXtermAction({
        id: "workbench.action.terminal.copySelectionAsHtml" /* TerminalCommandId.CopySelectionAsHtml */,
        title: localize2('workbench.action.terminal.copySelectionAsHtml', 'Copy Selection as HTML'),
        f1: true,
        category: terminalStrings.actionCategory,
        precondition: ContextKeyExpr.or(TerminalContextKeys.textSelectedInFocused, ContextKeyExpr.and(terminalAvailableWhenClause, TerminalContextKeys.textSelected)),
        run: (xterm) => xterm.copySelection(true)
    });
}
if (BrowserFeatures.clipboard.readText) {
    registerActiveInstanceAction({
        id: "workbench.action.terminal.paste" /* TerminalCommandId.Paste */,
        title: localize2('workbench.action.terminal.paste', 'Paste into Active Terminal'),
        precondition: terminalAvailableWhenClause,
        keybinding: [{
                primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */,
                win: { primary: 2048 /* KeyMod.CtrlCmd */ | 52 /* KeyCode.KeyV */, secondary: [2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 52 /* KeyCode.KeyV */] },
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 52 /* KeyCode.KeyV */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: TerminalContextKeys.focus
            }],
        run: (activeInstance) => TerminalClipboardContribution.get(activeInstance)?.paste()
    });
}
if (BrowserFeatures.clipboard.readText && isLinux) {
    registerActiveInstanceAction({
        id: "workbench.action.terminal.pasteSelection" /* TerminalCommandId.PasteSelection */,
        title: localize2('workbench.action.terminal.pasteSelection', 'Paste Selection into Active Terminal'),
        precondition: terminalAvailableWhenClause,
        keybinding: [{
                linux: { primary: 1024 /* KeyMod.Shift */ | 19 /* KeyCode.Insert */ },
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                when: TerminalContextKeys.focus
            }],
        run: (activeInstance) => TerminalClipboardContribution.get(activeInstance)?.pasteSelection()
    });
}
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuY2xpcGJvYXJkLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jbGlwYm9hcmQvYnJvd3Nlci90ZXJtaW5hbC5jbGlwYm9hcmQuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBb0IsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDakcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUE2Qiw2QkFBNkIsRUFBaUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoTCxPQUFPLEVBQUUsNEJBQTRCLEVBQTBGLE1BQU0saURBQWlELENBQUM7QUFDdkwsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUV6RSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXZILE9BQU8sRUFBRSxTQUFTLEVBQUUs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