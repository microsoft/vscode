var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TerminalInitialHintContribution_1;
import * as dom from '../../../../../base/browser/dom.js';
import { renderFormattedText } from '../../../../../base/browser/formattedTextRenderer.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { OS } from '../../../../../base/common/platform.js';
import { hasKey } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IChatAgentService } from '../../../chat/common/participants/chatAgents.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { ITerminalConfigurationService } from '../../../terminal/browser/terminal.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalInstance } from '../../../terminal/browser/terminalInstance.js';
import './media/terminalInitialHint.css';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
const $ = dom.$;
export class InitialHintAddon extends Disposable {
    get onDidRequestCreateHint() { return this._onDidRequestCreateHint.event; }
    constructor(_capabilities, _onDidChangeAgents) {
        super();
        this._capabilities = _capabilities;
        this._onDidChangeAgents = _onDidChangeAgents;
        this._onDidRequestCreateHint = this._register(new Emitter());
        this._disposables = this._register(new MutableDisposable());
    }
    activate(terminal) {
        const store = this._register(new DisposableStore());
        this._disposables.value = store;
        const capability = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (capability) {
            store.add(Event.once(capability.promptInputModel.onDidStartInput)(() => this._onDidRequestCreateHint.fire()));
        }
        else {
            this._register(this._capabilities.onDidAddCapability(e => {
                if (e.id === 2 /* TerminalCapability.CommandDetection */) {
                    const capability = e.capability;
                    store.add(Event.once(capability.promptInputModel.onDidStartInput)(() => this._onDidRequestCreateHint.fire()));
                    if (!capability.promptInputModel.value) {
                        this._onDidRequestCreateHint.fire();
                    }
                }
            }));
        }
        const agentListener = this._onDidChangeAgents((e) => {
            if (e?.locations.includes(ChatAgentLocation.Terminal)) {
                this._onDidRequestCreateHint.fire();
                agentListener.dispose();
            }
        });
        this._disposables.value?.add(agentListener);
    }
}
let TerminalInitialHintContribution = class TerminalInitialHintContribution extends Disposable {
    static { TerminalInitialHintContribution_1 = this; }
    static { this.ID = 'terminal.initialHint'; }
    static get(instance) {
        return instance.getContribution(TerminalInitialHintContribution_1.ID);
    }
    constructor(_ctx, _chatAgentService, _configurationService, _instantiationService, _terminalConfigurationService) {
        super();
        this._ctx = _ctx;
        this._chatAgentService = _chatAgentService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._decoration = this._register(new MutableDisposable());
        this._cursorMoveListener = this._register(new MutableDisposable());
    }
    xtermOpen(xterm) {
        // Don't show if the terminal was launched by an extension or a feature like debug
        if (hasKey(this._ctx.instance, { shellLaunchConfig: true }) && (this._ctx.instance.shellLaunchConfig.isExtensionOwnedTerminal || this._ctx.instance.shellLaunchConfig.isFeatureTerminal || this._ctx.instance.shellLaunchConfig.hideFromUser)) {
            return;
        }
        // Don't show if disabled
        if (!this._configurationService.getValue("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */)) {
            return;
        }
        // Don't show if keybindings are sent to shell, the hint's keybindings won't work
        if (this._terminalConfigurationService.config.sendKeybindingsToShell) {
            return;
        }
        this._xterm = xterm;
        this._addon = this._register(this._instantiationService.createInstance(InitialHintAddon, this._ctx.instance.capabilities, this._chatAgentService.onDidChangeAgents));
        this._xterm.raw.loadAddon(this._addon);
        this._register(this._addon.onDidRequestCreateHint(() => this._createHint()));
    }
    _disposeHint() {
        this._hintWidget?.remove();
        this._hintWidget = undefined;
        this._decoration.clear();
    }
    _createHint() {
        const instance = this._ctx.instance instanceof TerminalInstance ? this._ctx.instance : undefined;
        const commandDetectionCapability = instance?.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (!instance || !this._xterm || this._hintWidget || !commandDetectionCapability || commandDetectionCapability.promptInputModel.value || !!instance.shellLaunchConfig.attachPersistentProcess || commandDetectionCapability.commands.length > 0) {
            return;
        }
        if (!this._configurationService.getValue("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */)) {
            return;
        }
        if (!this._decoration.value) {
            const marker = this._xterm.raw.registerMarker();
            if (!marker) {
                return;
            }
            if (this._xterm.raw.buffer.active.cursorX === 0) {
                return;
            }
            this._register(marker);
            this._decoration.value = this._xterm.raw.registerDecoration({
                marker,
                x: this._xterm.raw.buffer.active.cursorX + 1,
            });
        }
        this._register(this._xterm.raw.onKey(() => this.dispose()));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */) && !this._configurationService.getValue("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */)) {
                this.dispose();
            }
        }));
        const inputModel = commandDetectionCapability.promptInputModel;
        if (inputModel) {
            this._register(inputModel.onDidChangeInput(() => {
                if (inputModel.value) {
                    this.dispose();
                }
            }));
        }
        // Listen to cursor move and recreate the hint (only if no input has been received)
        // Fixes #286080 an issue where the hint would not reposition correctly when the terminal's prompt changed
        this._cursorMoveListener.value = this._xterm.raw.onCursorMove(() => {
            if (!inputModel?.value) {
                this._disposeHint();
                this._createHint();
            }
        });
        if (!this._decoration.value) {
            return;
        }
        this._register(this._decoration.value.onRender((e) => {
            if (!this._hintWidget && this._xterm?.isFocused) {
                const widget = this._register(this._instantiationService.createInstance(TerminalInitialHintWidget, instance));
                this._addon?.dispose();
                this._hintWidget = widget.getDomNode();
                if (!this._hintWidget) {
                    return;
                }
                e.appendChild(this._hintWidget);
                e.classList.add('terminal-initial-hint');
                const font = this._xterm.getFont();
                if (font) {
                    e.style.fontFamily = font.fontFamily;
                    e.style.fontSize = font.fontSize + 'px';
                }
            }
            if (this._hintWidget && this._xterm) {
                const decoration = this._hintWidget.parentElement;
                if (decoration) {
                    decoration.style.width = (this._xterm.raw.cols - this._xterm.raw.buffer.active.cursorX) / this._xterm.raw.cols * 100 + '%';
                }
            }
        }));
    }
};
TerminalInitialHintContribution = TerminalInitialHintContribution_1 = __decorate([
    __param(1, IChatAgentService),
    __param(2, IConfigurationService),
    __param(3, IInstantiationService),
    __param(4, ITerminalConfigurationService)
], TerminalInitialHintContribution);
export { TerminalInitialHintContribution };
registerTerminalContribution(TerminalInitialHintContribution.ID, TerminalInitialHintContribution, false);
let TerminalInitialHintWidget = class TerminalInitialHintWidget extends Disposable {
    constructor(_instance, _chatAgentService, _chatEntitlementService, _commandService, _configurationService, _contextMenuService, _keybindingService, _telemetryService) {
        super();
        this._instance = _instance;
        this._chatAgentService = _chatAgentService;
        this._chatEntitlementService = _chatEntitlementService;
        this._commandService = _commandService;
        this._configurationService = _configurationService;
        this._contextMenuService = _contextMenuService;
        this._keybindingService = _keybindingService;
        this._telemetryService = _telemetryService;
        this._toDispose = this._register(new DisposableStore());
        this._isVisible = false;
        this._ariaLabel = '';
        this._toDispose.add(_instance.onDidFocus(() => {
            if (this._instance.hasFocus && this._isVisible && this._ariaLabel && this._configurationService.getValue("accessibility.verbosity.terminalChat" /* AccessibilityVerbositySettingId.TerminalInlineChat */)) {
                status(this._ariaLabel);
            }
        }));
        this._toDispose.add(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */) && !this._configurationService.getValue("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */)) {
                this.dispose();
            }
        }));
    }
    /**
     * Creates wrapped hint elements with click listeners for responsive hint layouts.
     * Returns a before link and an after prose span containing a link.
     */
    _createWrappedHintElements(text, keybindingLabel, clickHandler) {
        const [beforeText, afterText] = text.split(keybindingLabel);
        const before = $('a', undefined, beforeText);
        this._toDispose.add(dom.addDisposableListener(before, dom.EventType.CLICK, clickHandler));
        const after = $('span.terminal-initial-hint-prose', undefined);
        const afterLink = $('a', undefined, afterText);
        this._toDispose.add(dom.addDisposableListener(afterLink, dom.EventType.CLICK, clickHandler));
        after.appendChild(afterLink);
        return { before, after };
    }
    _getHintInlineChat() {
        const ariaLabelParts = [];
        const handleClick = () => {
            this._telemetryService.publicLog2('workbenchActionExecuted', {
                id: 'terminalInlineChat.hintAction',
                from: 'hint'
            });
            this._commandService.executeCommand("workbench.action.terminal.chat.start" /* TerminalChatCommandId.Start */, { from: 'hint' });
        };
        const handleDontShowClick = () => {
            this._configurationService.updateValue("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */, false);
        };
        const hintHandler = {
            disposables: this._toDispose,
            callback: (index, _event) => {
                switch (index) {
                    case '0':
                        handleClick();
                        break;
                }
            }
        };
        const dontShowHintHandler = {
            disposables: this._toDispose,
            callback: (index, _event) => {
                switch (index) {
                    case '0':
                        handleDontShowClick();
                        break;
                }
            }
        };
        const hintElement = $('div.terminal-initial-hint');
        hintElement.style.display = 'block';
        // Chat hint
        if (!this._chatEntitlementService.sentiment.hidden) {
            const keybindingHint = this._keybindingService.lookupKeybinding("workbench.action.terminal.chat.start" /* TerminalChatCommandId.Start */);
            const keybindingHintLabel = keybindingHint?.getLabel();
            if (keybindingHint && keybindingHintLabel) {
                const terminalAgents = this._chatAgentService.getActivatedAgents().filter(candidate => candidate.locations.includes(ChatAgentLocation.Terminal));
                if (terminalAgents?.length) {
                    const actionPart = localize('emptyHintText', 'Open chat {0}. ', keybindingHintLabel);
                    const { before, after } = this._createWrappedHintElements(actionPart, keybindingHintLabel, handleClick);
                    hintElement.appendChild(before);
                    const label = hintHandler.disposables.add(new KeybindingLabel(hintElement, OS));
                    label.set(keybindingHint);
                    label.element.style.width = 'min-content';
                    label.element.style.display = 'inline';
                    label.element.style.cursor = 'pointer';
                    this._toDispose.add(dom.addDisposableListener(label.element, dom.EventType.CLICK, handleClick));
                    hintElement.appendChild(after);
                    hintElement.appendChild($('span.terminal-initial-hint-separator'));
                    ariaLabelParts.push(actionPart);
                }
            }
            else {
                const hintMsg = localize({
                    key: 'inlineChatHint',
                    comment: [
                        'Preserve double-square brackets and their order',
                    ]
                }, '[[Open chat]] or start typing to dismiss.');
                const rendered = renderFormattedText(hintMsg, { actionHandler: hintHandler });
                hintElement.appendChild(rendered);
                ariaLabelParts.push(localize('openChatHint', 'Open chat or start typing to dismiss.'));
            }
        }
        // Suggest hint
        const suggestEnabled = this._configurationService.getValue("terminal.integrated.suggest.enabled" /* TerminalSuggestSettingId.Enabled */);
        const suggestKeybinding = suggestEnabled ? this._keybindingService.lookupKeybinding("workbench.action.terminal.triggerSuggest" /* TerminalSuggestCommandId.TriggerSuggest */) : undefined;
        const suggestKeybindingLabel = suggestKeybinding?.getLabel();
        if (suggestKeybinding && suggestKeybindingLabel) {
            const suggestActionPart = localize('showSuggestHint', 'Show suggestions {0}. ', suggestKeybindingLabel);
            const handleSuggestClick = () => {
                this._commandService.executeCommand("workbench.action.terminal.triggerSuggest" /* TerminalSuggestCommandId.TriggerSuggest */);
            };
            const { before: suggestBefore, after: suggestAfter } = this._createWrappedHintElements(suggestActionPart, suggestKeybindingLabel, handleSuggestClick);
            hintElement.appendChild(suggestBefore);
            const suggestLabel = hintHandler.disposables.add(new KeybindingLabel(hintElement, OS));
            suggestLabel.set(suggestKeybinding);
            suggestLabel.element.style.width = 'min-content';
            suggestLabel.element.style.display = 'inline';
            suggestLabel.element.style.cursor = 'pointer';
            this._toDispose.add(dom.addDisposableListener(suggestLabel.element, dom.EventType.CLICK, handleSuggestClick));
            hintElement.appendChild(suggestAfter);
            // Layout-only separator; visibility and spacing are controlled via CSS (including responsive breakpoints).
            hintElement.appendChild($('span.terminal-initial-hint-separator'));
            ariaLabelParts.push(suggestActionPart);
        }
        // Don't show the hint if there's nothing to hint about
        if (ariaLabelParts.length === 0) {
            return undefined;
        }
        // Dismiss hint - normal mode version
        const typeToDismiss = localize({
            key: 'hintTextDismiss',
            comment: [
                'Preserve double-square brackets and their order',
            ]
        }, '[[don\'t show]] this again.');
        const typeToDismissRendered = renderFormattedText(typeToDismiss, { actionHandler: dontShowHintHandler });
        typeToDismissRendered.classList.add('detail', 'terminal-initial-hint-prose');
        const proseBefore = $('span.terminal-initial-hint-prose', undefined, localize('hintTextDismissProse', " Start typing to dismiss or "));
        hintElement.appendChild(proseBefore);
        hintElement.appendChild(typeToDismissRendered);
        // Dismiss hint - compact mode version
        const typeToDismissCompact = localize({
            key: 'hintTextDismissCompact',
            comment: [
                'Preserve double-square brackets and their order',
            ]
        }, '[[Don\'t show this again]]');
        const typeToDismissCompactRendered = renderFormattedText(typeToDismissCompact, { actionHandler: dontShowHintHandler });
        typeToDismissCompactRendered.classList.add('detail', 'terminal-initial-hint-compact');
        hintElement.appendChild(typeToDismissCompactRendered);
        ariaLabelParts.push(localize('hintTextDismissAriaLabel', 'Start typing to dismiss or don\'t show this again.'));
        return { ariaLabel: ariaLabelParts.join(' '), hintHandler, hintElement };
    }
    getDomNode() {
        if (!this._domNode) {
            const result = this._getHintInlineChat();
            if (!result) {
                return undefined;
            }
            const { hintElement, ariaLabel } = result;
            this._domNode = $('.terminal-initial-hint');
            this._domNode.style.paddingLeft = '4px';
            this._domNode.append(hintElement);
            this._ariaLabel = ariaLabel.concat(localize('disableHint', ' Toggle {0} in settings to disable this hint.', "accessibility.verbosity.terminalChat" /* AccessibilityVerbositySettingId.TerminalInlineChat */));
            this._toDispose.add(dom.addDisposableListener(this._domNode, 'click', () => {
                this._domNode?.remove();
                this._domNode = undefined;
            }));
            this._toDispose.add(dom.addDisposableListener(this._domNode, dom.EventType.CONTEXT_MENU, (e) => {
                this._contextMenuService.showContextMenu({
                    getAnchor: () => { return new StandardMouseEvent(dom.getActiveWindow(), e); },
                    getActions: () => {
                        return [{
                                id: 'workench.action.disableTerminalInitialHint',
                                label: localize('disableInitialHint', "Disable Initial Hint"),
                                tooltip: localize('disableInitialHint', "Disable Initial Hint"),
                                enabled: true,
                                class: undefined,
                                run: () => this._configurationService.updateValue("terminal.integrated.initialHint" /* TerminalInitialHintSettingId.Enabled */, false)
                            }
                        ];
                    }
                });
            }));
        }
        return this._domNode;
    }
    dispose() {
        this._domNode?.remove();
        super.dispose();
    }
};
TerminalInitialHintWidget = __decorate([
    __param(1, IChatAgentService),
    __param(2, IChatEntitlementService),
    __param(3, ICommandService),
    __param(4, IConfigurationService),
    __param(5, IContextMenuService),
    __param(6, IKeybindingService),
    __param(7, ITelemetryService)
], TerminalInitialHintWidget);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuaW5pdGlhbEhpbnQuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2lubGluZUhpbnQvYnJvd3Nlci90ZXJtaW5hbC5pbml0aWFsSGludC5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUtBLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUF5QixtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFFcEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxFQUFFLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxP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