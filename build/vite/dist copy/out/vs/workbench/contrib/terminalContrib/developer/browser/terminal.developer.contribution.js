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
var DevModeContribution_1;
import { Delayer } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, combinedDisposable, dispose } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import './media/developer.css';
registerTerminalAction({
    id: "workbench.action.terminal.showTextureAtlas" /* TerminalDeveloperCommandId.ShowTextureAtlas */,
    title: localize2('workbench.action.terminal.showTextureAtlas', 'Show Terminal Texture Atlas'),
    category: Categories.Developer,
    precondition: ContextKeyExpr.or(TerminalContextKeys.isOpen),
    run: async (c, accessor) => {
        const fileService = accessor.get(IFileService);
        const openerService = accessor.get(IOpenerService);
        const workspaceContextService = accessor.get(IWorkspaceContextService);
        const bitmap = await c.service.activeInstance?.xterm?.textureAtlas;
        if (!bitmap) {
            return;
        }
        const cwdUri = workspaceContextService.getWorkspace().folders[0].uri;
        const fileUri = URI.joinPath(cwdUri, 'textureAtlas.png');
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('bitmaprenderer');
        if (!ctx) {
            return;
        }
        ctx.transferFromImageBitmap(bitmap);
        const blob = await new Promise((res) => canvas.toBlob(res));
        if (!blob) {
            return;
        }
        await fileService.writeFile(fileUri, VSBuffer.wrap(new Uint8Array(await blob.arrayBuffer())));
        openerService.open(fileUri);
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.writeDataToTerminal" /* TerminalDeveloperCommandId.WriteDataToTerminal */,
    title: localize2('workbench.action.terminal.writeDataToTerminal', 'Write Data to Terminal'),
    category: Categories.Developer,
    run: async (c, accessor) => {
        const quickInputService = accessor.get(IQuickInputService);
        const instance = await c.service.getActiveOrCreateInstance();
        await c.service.revealActiveTerminal();
        await instance.processReady;
        if (!instance.xterm) {
            throw new Error('Cannot write data to terminal if xterm isn\'t initialized');
        }
        const data = await quickInputService.input({
            value: '',
            placeHolder: 'Enter data (supports \\n, \\r, \\xAB)',
            prompt: localize('workbench.action.terminal.writeDataToTerminal.prompt', "Enter data to write directly to the terminal, bypassing the pty"),
        });
        if (!data) {
            return;
        }
        let escapedData = data
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r');
        while (true) {
            const match = escapedData.match(/\\x([0-9a-fA-F]{2})/);
            if (match === null || match.index === undefined || match.length < 2) {
                break;
            }
            escapedData = escapedData.slice(0, match.index) + String.fromCharCode(parseInt(match[1], 16)) + escapedData.slice(match.index + 4);
        }
        const xterm = instance.xterm;
        xterm._writeText(escapedData);
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.recordSession" /* TerminalDeveloperCommandId.RecordSession */,
    title: localize2('workbench.action.terminal.recordSession', 'Record Terminal Session'),
    category: Categories.Developer,
    run: async (c, accessor) => {
        const clipboardService = accessor.get(IClipboardService);
        const commandService = accessor.get(ICommandService);
        const statusbarService = accessor.get(IStatusbarService);
        const store = new DisposableStore();
        // Set up status bar entry
        const text = localize('workbench.action.terminal.recordSession.recording', "Recording terminal session...");
        const statusbarEntry = {
            text,
            name: text,
            ariaLabel: text,
            showProgress: true
        };
        const statusbarHandle = statusbarService.addEntry(statusbarEntry, 'recordSession', 0 /* StatusbarAlignment.LEFT */);
        store.add(statusbarHandle);
        // Create, reveal and focus instance
        const instance = await c.service.createTerminal();
        c.service.setActiveInstance(instance);
        await c.service.revealActiveTerminal();
        await Promise.all([
            instance.processReady,
            instance.focusWhenReady(true)
        ]);
        // Record session
        return new Promise(resolve => {
            const events = [];
            const endRecording = () => {
                const session = JSON.stringify(events, null, 2);
                clipboardService.writeText(session);
                store.dispose();
                resolve();
            };
            const timer = store.add(new Delayer(5000));
            store.add(Event.runAndSubscribe(instance.onDimensionsChanged, () => {
                events.push({
                    type: 'resize',
                    cols: instance.cols,
                    rows: instance.rows
                });
                timer.trigger(endRecording);
            }));
            store.add(commandService.onWillExecuteCommand(e => {
                events.push({
                    type: 'command',
                    id: e.commandId,
                });
                timer.trigger(endRecording);
            }));
            store.add(instance.onWillData(data => {
                events.push({
                    type: 'output',
                    data,
                });
                timer.trigger(endRecording);
            }));
            store.add(instance.onDidSendText(data => {
                events.push({
                    type: 'sendText',
                    data,
                });
                timer.trigger(endRecording);
            }));
            store.add(instance.xterm.raw.onData(data => {
                events.push({
                    type: 'input',
                    data,
                });
                timer.trigger(endRecording);
            }));
            let commandDetectedRegistered = false;
            store.add(Event.runAndSubscribe(instance.capabilities.onDidAddCapability, e => {
                if (commandDetectedRegistered) {
                    return;
                }
                const commandDetection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
                if (!commandDetection) {
                    return;
                }
                store.add(commandDetection.promptInputModel.onDidChangeInput(e => {
                    events.push({
                        type: 'promptInputChange',
                        data: commandDetection.promptInputModel.getCombinedString(),
                    });
                    timer.trigger(endRecording);
                }));
                commandDetectedRegistered = true;
            }));
        });
    }
});
registerTerminalAction({
    id: "workbench.action.terminal.restartPtyHost" /* TerminalDeveloperCommandId.RestartPtyHost */,
    title: localize2('workbench.action.terminal.restartPtyHost', 'Restart Pty Host'),
    category: Categories.Developer,
    run: async (c, accessor) => {
        const logService = accessor.get(ITerminalLogService);
        const backends = Array.from(c.instanceService.getRegisteredBackends());
        const unresponsiveBackends = backends.filter(e => !e.isResponsive);
        // Restart only unresponsive backends if there are any
        const restartCandidates = unresponsiveBackends.length > 0 ? unresponsiveBackends : backends;
        for (const backend of restartCandidates) {
            logService.warn(`Restarting pty host for authority "${backend.remoteAuthority}"`);
            backend.restartPtyHost();
        }
    }
});
var DevModeContributionState;
(function (DevModeContributionState) {
    DevModeContributionState[DevModeContributionState["Off"] = 0] = "Off";
    DevModeContributionState[DevModeContributionState["WaitingForCapability"] = 1] = "WaitingForCapability";
    DevModeContributionState[DevModeContributionState["On"] = 2] = "On";
})(DevModeContributionState || (DevModeContributionState = {}));
let DevModeContribution = class DevModeContribution extends Disposable {
    static { DevModeContribution_1 = this; }
    static { this.ID = 'terminal.devMode'; }
    static get(instance) {
        return instance.getContribution(DevModeContribution_1.ID);
    }
    constructor(_ctx, _configurationService) {
        super();
        this._ctx = _ctx;
        this._configurationService = _configurationService;
        this._activeDevModeDisposables = this._register(new MutableDisposable());
        this._currentColor = 0;
        this._state = 0 /* DevModeContributionState.Off */;
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.developer.devMode" /* TerminalSettingId.DevMode */)) {
                this._updateDevMode();
            }
        }));
    }
    xtermReady(xterm) {
        this._xterm = xterm;
        this._updateDevMode();
    }
    _updateDevMode() {
        const devMode = this._isEnabled();
        this._xterm?.raw.element?.classList.toggle('dev-mode', devMode);
        const commandDetection = this._ctx.instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (devMode) {
            if (commandDetection) {
                if (this._state === 2 /* DevModeContributionState.On */) {
                    return;
                }
                this._state = 2 /* DevModeContributionState.On */;
                const commandDecorations = new DisposableMap();
                const otherDisposables = new DisposableStore();
                this._activeDevModeDisposables.value = combinedDisposable(commandDecorations, otherDisposables, 
                // Prompt input
                this._ctx.instance.onDidBlur(() => this._updateDevMode()), this._ctx.instance.onDidFocus(() => this._updateDevMode()), commandDetection.promptInputModel.onDidChangeInput(() => this._updateDevMode()), 
                // Sequence markers
                commandDetection.onCommandFinished(command => {
                    const colorClass = `color-${this._currentColor}`;
                    const decorations = [];
                    commandDecorations.set(command, combinedDisposable(...decorations));
                    if (command.promptStartMarker) {
                        const d = this._ctx.instance.xterm.raw?.registerDecoration({
                            marker: command.promptStartMarker
                        });
                        if (d) {
                            decorations.push(d);
                            otherDisposables.add(d.onRender(e => {
                                e.textContent = 'A';
                                e.classList.add('xterm-sequence-decoration', 'top', 'left', colorClass);
                            }));
                        }
                    }
                    if (command.marker) {
                        const d = this._ctx.instance.xterm.raw?.registerDecoration({
                            marker: command.marker,
                            x: command.startX
                        });
                        if (d) {
                            decorations.push(d);
                            otherDisposables.add(d.onRender(e => {
                                e.textContent = 'B';
                                e.classList.add('xterm-sequence-decoration', 'top', 'right', colorClass);
                            }));
                        }
                    }
                    if (command.executedMarker) {
                        const d = this._ctx.instance.xterm.raw?.registerDecoration({
                            marker: command.executedMarker,
                            x: command.executedX
                        });
                        if (d) {
                            decorations.push(d);
                            otherDisposables.add(d.onRender(e => {
                                e.textContent = 'C';
                                e.classList.add('xterm-sequence-decoration', 'bottom', 'left', colorClass);
                            }));
                        }
                    }
                    if (command.endMarker) {
                        const d = this._ctx.instance.xterm.raw?.registerDecoration({
                            marker: command.endMarker
                        });
                        if (d) {
                            decorations.push(d);
                            otherDisposables.add(d.onRender(e => {
                                e.textContent = 'D';
                                e.classList.add('xterm-sequence-decoration', 'bottom', 'right', colorClass);
                            }));
                        }
                    }
                    this._currentColor = (this._currentColor + 1) % 2;
                }), commandDetection.onCommandInvalidated(commands => {
                    for (const c of commands) {
                        const decorations = commandDecorations.get(c);
                        if (decorations) {
                            dispose(decorations);
                        }
                        commandDecorations.deleteAndDispose(c);
                    }
                }));
            }
            else {
                if (this._state === 1 /* DevModeContributionState.WaitingForCapability */) {
                    return;
                }
                this._state = 1 /* DevModeContributionState.WaitingForCapability */;
                this._activeDevModeDisposables.value = this._ctx.instance.capabilities.onDidAddCommandDetectionCapability(e => {
                    this._updateDevMode();
                });
            }
        }
        else {
            if (this._state === 0 /* DevModeContributionState.Off */) {
                return;
            }
            this._state = 0 /* DevModeContributionState.Off */;
            this._activeDevModeDisposables.clear();
        }
    }
    _isEnabled() {
        return this._configurationService.getValue("terminal.integrated.developer.devMode" /* TerminalSettingId.DevMode */) || false;
    }
};
DevModeContribution = DevModeContribution_1 = __decorate([
    __param(1, IConfigurationService)
], DevModeContribution);
registerTerminalContribution(DevModeContribution.ID, DevModeContribution);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuZGV2ZWxvcGVyLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9kZXZlbG9wZXIvYnJvd3Nlci90ZXJtaW5hbC5kZXZlbG9wZXIuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQWUsaUJBQWlCLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEssT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzdGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFP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