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
import * as dom from '../../../../../base/browser/dom.js';
import { Separator } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { terminalDecorationMark } from '../terminalIcons.js';
import { getTerminalCommandDecorationState, getTerminalDecorationHoverContent, updateLayout } from './decorationStyles.js';
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR } from '../../common/terminalColorRegistry.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IChatContextPickService } from '../../../chat/browser/attachments/chatContextPickService.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalContext } from '../../../chat/browser/actions/chatContext.js';
import { getTerminalUri, parseTerminalUri } from '../terminalUri.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { isString } from '../../../../../base/common/types.js';
let DecorationAddon = class DecorationAddon extends Disposable {
    constructor(_resource, _capabilities, _clipboardService, _contextMenuService, _configurationService, _themeService, _openerService, _quickInputService, lifecycleService, _commandService, _accessibilitySignalService, _notificationService, _hoverService, _contextPickService, _chatWidgetService, _instantiationService) {
        super();
        this._resource = _resource;
        this._capabilities = _capabilities;
        this._clipboardService = _clipboardService;
        this._contextMenuService = _contextMenuService;
        this._configurationService = _configurationService;
        this._themeService = _themeService;
        this._openerService = _openerService;
        this._quickInputService = _quickInputService;
        this._commandService = _commandService;
        this._accessibilitySignalService = _accessibilitySignalService;
        this._notificationService = _notificationService;
        this._hoverService = _hoverService;
        this._contextPickService = _contextPickService;
        this._chatWidgetService = _chatWidgetService;
        this._instantiationService = _instantiationService;
        this._capabilityDisposables = this._register(new DisposableMap());
        this._decorations = new Map();
        this._registeredMenuItems = new Map();
        this._onDidRequestRunCommand = this._register(new Emitter());
        this.onDidRequestRunCommand = this._onDidRequestRunCommand.event;
        this._onDidRequestCopyAsHtml = this._register(new Emitter());
        this.onDidRequestCopyAsHtml = this._onDidRequestCopyAsHtml.event;
        this._register(toDisposable(() => this._dispose()));
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */) || e.affectsConfiguration("terminal.integrated.lineHeight" /* TerminalSettingId.LineHeight */)) {
                this.refreshLayouts();
            }
            else if (e.affectsConfiguration('workbench.colorCustomizations')) {
                this._refreshStyles(true);
            }
            else if (e.affectsConfiguration("terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */)) {
                this._removeCapabilityDisposables(2 /* TerminalCapability.CommandDetection */);
                this._updateDecorationVisibility();
            }
        }));
        this._register(this._themeService.onDidColorThemeChange(() => this._refreshStyles(true)));
        this._updateDecorationVisibility();
        this._register(this._capabilities.onDidAddCapability(c => this._createCapabilityDisposables(c.id)));
        this._register(this._capabilities.onDidRemoveCapability(c => this._removeCapabilityDisposables(c.id)));
        this._register(lifecycleService.onWillShutdown(() => this._disposeAllDecorations()));
    }
    _createCapabilityDisposables(c) {
        const capability = this._capabilities.get(c);
        if (!capability || this._capabilityDisposables.has(c)) {
            return;
        }
        const store = new DisposableStore();
        switch (capability.type) {
            case 4 /* TerminalCapability.BufferMarkDetection */:
                store.add(capability.onMarkAdded(mark => this.registerMarkDecoration(mark)));
                break;
            case 2 /* TerminalCapability.CommandDetection */: {
                const disposables = this._getCommandDetectionListeners(capability);
                for (const d of disposables) {
                    store.add(d);
                }
                break;
            }
        }
        this._capabilityDisposables.set(c, store);
    }
    _removeCapabilityDisposables(c) {
        this._capabilityDisposables.deleteAndDispose(c);
    }
    registerMarkDecoration(mark) {
        if (!this._terminal || (!this._showGutterDecorations && !this._showOverviewRulerDecorations)) {
            return undefined;
        }
        if (mark.hidden) {
            return undefined;
        }
        return this.registerCommandDecoration(undefined, undefined, mark);
    }
    _updateDecorationVisibility() {
        const showDecorations = this._configurationService.getValue("terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */);
        this._showGutterDecorations = (showDecorations === 'both' || showDecorations === 'gutter');
        this._showOverviewRulerDecorations = (showDecorations === 'both' || showDecorations === 'overviewRuler');
        this._disposeAllDecorations();
        if (this._showGutterDecorations || this._showOverviewRulerDecorations) {
            this._attachToCommandCapability();
            this._updateGutterDecorationVisibility();
        }
        const currentCommand = this._capabilities.get(2 /* TerminalCapability.CommandDetection */)?.executingCommandObject;
        if (currentCommand) {
            this.registerCommandDecoration(currentCommand, true);
        }
    }
    _disposeAllDecorations() {
        this._placeholderDecoration?.dispose();
        for (const value of this._decorations.values()) {
            value.decoration.dispose();
            dispose(value.disposables);
        }
    }
    _updateGutterDecorationVisibility() {
        // eslint-disable-next-line no-restricted-syntax
        const commandDecorationElements = this._terminal?.element?.querySelectorAll("terminal-command-decoration" /* DecorationSelector.CommandDecoration */);
        if (commandDecorationElements) {
            for (const commandDecorationElement of commandDecorationElements) {
                this._updateCommandDecorationVisibility(commandDecorationElement);
            }
        }
    }
    _updateCommandDecorationVisibility(commandDecorationElement) {
        if (this._showGutterDecorations) {
            commandDecorationElement.classList.remove("hide" /* DecorationSelector.Hide */);
        }
        else {
            commandDecorationElement.classList.add("hide" /* DecorationSelector.Hide */);
        }
    }
    refreshLayouts() {
        updateLayout(this._configurationService, this._placeholderDecoration?.element);
        for (const decoration of this._decorations) {
            updateLayout(this._configurationService, decoration[1].decoration.element);
        }
    }
    _refreshStyles(refreshOverviewRulerColors) {
        if (refreshOverviewRulerColors) {
            for (const decoration of this._decorations.values()) {
                const color = this._getDecorationCssColor(decoration.command)?.toString() ?? '';
                if (decoration.decoration.options?.overviewRulerOptions) {
                    decoration.decoration.options.overviewRulerOptions.color = color;
                }
                else if (decoration.decoration.options) {
                    decoration.decoration.options.overviewRulerOptions = { color };
                }
            }
        }
        this._updateClasses(this._placeholderDecoration?.element);
        for (const decoration of this._decorations.values()) {
            this._updateClasses(decoration.decoration.element, decoration.command, decoration.markProperties);
        }
    }
    _dispose() {
        for (const disposable of this._capabilityDisposables.values()) {
            dispose(disposable);
        }
        this.clearDecorations();
    }
    _clearPlaceholder() {
        this._placeholderDecoration?.dispose();
        this._placeholderDecoration = undefined;
    }
    clearDecorations() {
        this._placeholderDecoration?.marker.dispose();
        this._clearPlaceholder();
        this._disposeAllDecorations();
        this._decorations.clear();
    }
    _attachToCommandCapability() {
        if (this._capabilities.has(2 /* TerminalCapability.CommandDetection */)) {
            const capability = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
            const disposables = this._getCommandDetectionListeners(capability);
            const store = new DisposableStore();
            for (const d of disposables) {
                store.add(d);
            }
            this._capabilityDisposables.set(2 /* TerminalCapability.CommandDetection */, store);
        }
    }
    _getCommandDetectionListeners(capability) {
        this._removeCapabilityDisposables(2 /* TerminalCapability.CommandDetection */);
        const commandDetectionListeners = [];
        // Command started
        if (capability.executingCommandObject?.marker) {
            this.registerCommandDecoration(capability.executingCommandObject, true);
        }
        commandDetectionListeners.push(capability.onCommandStarted(command => this.registerCommandDecoration(command, true)));
        // Command finished
        for (const command of capability.commands) {
            this.registerCommandDecoration(command);
        }
        commandDetectionListeners.push(capability.onCommandFinished(command => {
            const buffer = this._terminal?.buffer?.active;
            const marker = command.promptStartMarker;
            // Edge case: Handle case where tsc watch commands clears buffer, but decoration of that tsc command re-appears
            const shouldRegisterDecoration = (command.exitCode === undefined ||
                // Only register decoration if the cursor is at or below the promptStart marker.
                (buffer && marker && buffer.baseY + buffer.cursorY >= marker.line));
            if (shouldRegisterDecoration) {
                this.registerCommandDecoration(command);
            }
            if (command.exitCode) {
                this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandFailed);
            }
            else {
                this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandSucceeded);
            }
        }));
        // Command invalidated
        commandDetectionListeners.push(capability.onCommandInvalidated(commands => {
            for (const command of commands) {
                const id = command.marker?.id;
                if (id) {
                    const match = this._decorations.get(id);
                    if (match) {
                        match.decoration.dispose();
                        dispose(match.disposables);
                    }
                }
            }
        }));
        // Current command invalidated
        commandDetectionListeners.push(capability.onCurrentCommandInvalidated((request) => {
            if (request.reason === "noProblemsReported" /* CommandInvalidationReason.NoProblemsReported */) {
                const lastDecoration = Array.from(this._decorations.entries())[this._decorations.size - 1];
                lastDecoration?.[1].decoration.dispose();
            }
            else if (request.reason === "windows" /* CommandInvalidationReason.Windows */) {
                this._clearPlaceholder();
            }
        }));
        return commandDetectionListeners;
    }
    activate(terminal) {
        this._terminal = terminal;
        this._attachToCommandCapability();
    }
    registerCommandDecoration(command, beforeCommandExecution, markProperties) {
        if (!this._terminal || (beforeCommandExecution && !command) || (!this._showGutterDecorations && !this._showOverviewRulerDecorations)) {
            return undefined;
        }
        const marker = command?.marker || markProperties?.marker;
        if (!marker) {
            throw new Error(`cannot add a decoration for a command ${JSON.stringify(command)} with no marker`);
        }
        this._clearPlaceholder();
        const color = this._getDecorationCssColor(command)?.toString() ?? '';
        const decoration = this._terminal.registerDecoration({
            marker,
            overviewRulerOptions: this._showOverviewRulerDecorations ? (beforeCommandExecution
                ? { color, position: 'left' }
                : { color, position: command?.exitCode ? 'right' : 'left' }) : undefined
        });
        if (!decoration) {
            return undefined;
        }
        if (beforeCommandExecution) {
            this._placeholderDecoration = decoration;
        }
        decoration.onRender(element => {
            if (element.classList.contains(".xterm-decoration-overview-ruler" /* DecorationSelector.OverviewRuler */)) {
                return;
            }
            if (!this._decorations.get(decoration.marker.id)) {
                decoration.onDispose(() => this._decorations.delete(decoration.marker.id));
                this._decorations.set(decoration.marker.id, {
                    decoration,
                    disposables: this._createDisposables(element, command, markProperties),
                    command,
                    markProperties: command?.markProperties || markProperties
                });
            }
            if (!element.classList.contains("codicon" /* DecorationSelector.Codicon */) || command?.marker?.line === 0) {
                // first render or buffer was cleared
                updateLayout(this._configurationService, element);
                this._updateClasses(element, command, command?.markProperties || markProperties);
            }
        });
        return decoration;
    }
    registerMenuItems(command, items) {
        const existingItems = this._registeredMenuItems.get(command);
        if (existingItems) {
            existingItems.push(...items);
        }
        else {
            this._registeredMenuItems.set(command, [...items]);
        }
        return toDisposable(() => {
            const commandItems = this._registeredMenuItems.get(command);
            if (commandItems) {
                for (const item of items.values()) {
                    const index = commandItems.indexOf(item);
                    if (index !== -1) {
                        commandItems.splice(index, 1);
                    }
                }
            }
        });
    }
    _createDisposables(element, command, markProperties) {
        if (command?.exitCode === undefined && !command?.markProperties) {
            return [];
        }
        else if (command?.markProperties || markProperties) {
            return [this._createHover(element, command || markProperties, markProperties?.hoverMessage)];
        }
        return [...this._createContextMenu(element, command), this._createHover(element, command)];
    }
    _createHover(element, command, hoverMessage) {
        return this._hoverService.setupDelayedHover(element, () => ({
            content: new MarkdownString(getTerminalDecorationHoverContent(command, hoverMessage, true))
        }));
    }
    _updateClasses(element, command, markProperties) {
        if (!element) {
            return;
        }
        for (const classes of element.classList) {
            element.classList.remove(classes);
        }
        element.classList.add("terminal-command-decoration" /* DecorationSelector.CommandDecoration */, "codicon" /* DecorationSelector.Codicon */, "xterm-decoration" /* DecorationSelector.XtermDecoration */);
        if (markProperties) {
            element.classList.add("default-color" /* DecorationSelector.DefaultColor */, ...ThemeIcon.asClassNameArray(terminalDecorationMark));
            if (!markProperties.hoverMessage) {
                //disable the mouse pointer
                element.classList.add("default" /* DecorationSelector.Default */);
            }
        }
        else {
            // command decoration
            const state = getTerminalCommandDecorationState(command);
            this._updateCommandDecorationVisibility(element);
            for (const className of state.classNames) {
                element.classList.add(className);
            }
            element.classList.add(...ThemeIcon.asClassNameArray(state.icon));
        }
        element.removeAttribute('title');
        element.removeAttribute('aria-label');
    }
    _createContextMenu(element, command) {
        // When the xterm Decoration gets disposed of, its element gets removed from the dom
        // along with its listeners
        return [
            dom.addDisposableListener(element, dom.EventType.MOUSE_DOWN, async (e) => {
                e.stopImmediatePropagation();
            }),
            dom.addDisposableListener(element, dom.EventType.CLICK, async (e) => {
                e.stopImmediatePropagation();
                const actions = await this._getCommandActions(command);
                this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => actions });
            }),
            dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, async (e) => {
                e.stopImmediatePropagation();
                const chatActions = await this._getCommandActions(command);
                const actions = this._getContextMenuActions();
                this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => [...actions, ...chatActions] });
            }),
        ];
    }
    _getContextMenuActions() {
        const label = localize('workbench.action.terminal.toggleVisibility', "Toggle Visibility");
        return [
            {
                class: undefined, tooltip: label, id: 'terminal.toggleVisibility', label, enabled: true,
                run: async () => {
                    this._showToggleVisibilityQuickPick();
                }
            }
        ];
    }
    async _getCommandActions(command) {
        const actions = [];
        const registeredMenuItems = this._registeredMenuItems.get(command);
        if (registeredMenuItems?.length) {
            actions.push(...registeredMenuItems, new Separator());
        }
        const attachToChatAction = this._createAttachToChatAction(command);
        if (attachToChatAction) {
            actions.push(attachToChatAction, new Separator());
        }
        if (command.command !== '') {
            const labelRun = localize("terminal.rerunCommand", 'Rerun Command');
            actions.push({
                class: undefined, tooltip: labelRun, id: 'terminal.rerunCommand', label: labelRun, enabled: true,
                run: async () => {
                    if (command.command === '') {
                        return;
                    }
                    if (!command.isTrusted) {
                        const shouldRun = await new Promise(r => {
                            this._notificationService.prompt(Severity.Info, localize('rerun', 'Do you want to run the command: {0}', command.command), [{
                                    label: localize('yes', 'Yes'),
                                    run: () => r(true)
                                }, {
                                    label: localize('no', 'No'),
                                    run: () => r(false)
                                }]);
                        });
                        if (!shouldRun) {
                            return;
                        }
                    }
                    this._onDidRequestRunCommand.fire({ command });
                }
            });
            // The second section is the clipboard section
            actions.push(new Separator());
            const labelCopy = localize("terminal.copyCommand", 'Copy Command');
            actions.push({
                class: undefined, tooltip: labelCopy, id: 'terminal.copyCommand', label: labelCopy, enabled: true,
                run: () => this._clipboardService.writeText(command.command)
            });
        }
        if (command.hasOutput()) {
            const labelCopyCommandAndOutput = localize("terminal.copyCommandAndOutput", 'Copy Command and Output');
            actions.push({
                class: undefined, tooltip: labelCopyCommandAndOutput, id: 'terminal.copyCommandAndOutput', label: labelCopyCommandAndOutput, enabled: true,
                run: () => {
                    const output = command.getOutput();
                    if (isString(output)) {
                        this._clipboardService.writeText(`${command.command !== '' ? command.command + '\n' : ''}${output}`);
                    }
                }
            });
            const labelText = localize("terminal.copyOutput", 'Copy Output');
            actions.push({
                class: undefined, tooltip: labelText, id: 'terminal.copyOutput', label: labelText, enabled: true,
                run: () => {
                    const text = command.getOutput();
                    if (isString(text)) {
                        this._clipboardService.writeText(text);
                    }
                }
            });
            const labelHtml = localize("terminal.copyOutputAsHtml", 'Copy Output as HTML');
            actions.push({
                class: undefined, tooltip: labelHtml, id: 'terminal.copyOutputAsHtml', label: labelHtml, enabled: true,
                run: () => this._onDidRequestCopyAsHtml.fire({ command })
            });
        }
        if (actions.length > 0) {
            actions.push(new Separator());
        }
        const labelRunRecent = localize('workbench.action.terminal.runRecentCommand', "Run Recent Command");
        actions.push({
            class: undefined, tooltip: labelRunRecent, id: 'workbench.action.terminal.runRecentCommand', label: labelRunRecent, enabled: true,
            run: () => this._commandService.executeCommand('workbench.action.terminal.runRecentCommand')
        });
        const labelGoToRecent = localize('workbench.action.terminal.goToRecentDirectory', "Go To Recent Directory");
        actions.push({
            class: undefined, tooltip: labelRunRecent, id: 'workbench.action.terminal.goToRecentDirectory', label: labelGoToRecent, enabled: true,
            run: () => this._commandService.executeCommand('workbench.action.terminal.goToRecentDirectory')
        });
        actions.push(new Separator());
        const labelAbout = localize("terminal.learnShellIntegration", 'Learn About Shell Integration');
        actions.push({
            class: undefined, tooltip: labelAbout, id: 'terminal.learnShellIntegration', label: labelAbout, enabled: true,
            run: () => this._openerService.open('https://code.visualstudio.com/docs/terminal/shell-integration')
        });
        return actions;
    }
    _createAttachToChatAction(command) {
        const chatIsEnabled = this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).some(w => w.attachmentCapabilities.supportsTerminalAttachments);
        if (!chatIsEnabled) {
            return undefined;
        }
        const labelAttachToChat = localize("terminal.attachToChat", 'Attach To Chat');
        return {
            class: undefined, tooltip: labelAttachToChat, id: 'terminal.attachToChat', label: labelAttachToChat, enabled: true,
            run: async () => {
                let widget = this._chatWidgetService.lastFocusedWidget ?? this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)?.find(w => w.attachmentCapabilities.supportsTerminalAttachments);
                // If no widget found (e.g., after window reload when chat hasn't been focused), open chat view
                if (!widget) {
                    widget = await this._chatWidgetService.revealWidget();
                }
                if (!widget) {
                    return;
                }
                let terminalContext;
                if (this._resource) {
                    const parsedUri = parseTerminalUri(this._resource);
                    terminalContext = this._instantiationService.createInstance(TerminalContext, getTerminalUri(parsedUri.workspaceId, parsedUri.instanceId, undefined, command.id));
                }
                if (terminalContext && widget.attachmentCapabilities.supportsTerminalAttachments) {
                    try {
                        const attachment = await terminalContext.asAttachment(widget);
                        if (attachment) {
                            widget.attachmentModel.addContext(attachment);
                            widget.focusInput();
                            return;
                        }
                    }
                    catch (err) {
                    }
                    this._store.add(this._contextPickService.registerChatContextItem(terminalContext));
                }
            }
        };
    }
    _showToggleVisibilityQuickPick() {
        const quickPick = this._register(this._quickInputService.createQuickPick());
        quickPick.hideInput = true;
        quickPick.hideCheckAll = true;
        quickPick.canSelectMany = true;
        quickPick.title = localize('toggleVisibility', 'Toggle visibility');
        const configValue = this._configurationService.getValue("terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */);
        const gutterIcon = {
            label: localize('gutter', 'Gutter command decorations'),
            picked: configValue !== 'never' && configValue !== 'overviewRuler'
        };
        const overviewRulerIcon = {
            label: localize('overviewRuler', 'Overview ruler command decorations'),
            picked: configValue !== 'never' && configValue !== 'gutter'
        };
        quickPick.items = [gutterIcon, overviewRulerIcon];
        const selectedItems = [];
        if (configValue !== 'never') {
            if (configValue !== 'gutter') {
                selectedItems.push(gutterIcon);
            }
            if (configValue !== 'overviewRuler') {
                selectedItems.push(overviewRulerIcon);
            }
        }
        quickPick.selectedItems = selectedItems;
        this._register(quickPick.onDidChangeSelection(async (e) => {
            let newValue = 'never';
            if (e.includes(gutterIcon)) {
                if (e.includes(overviewRulerIcon)) {
                    newValue = 'both';
                }
                else {
                    newValue = 'gutter';
                }
            }
            else if (e.includes(overviewRulerIcon)) {
                newValue = 'overviewRuler';
            }
            await this._configurationService.updateValue("terminal.integrated.shellIntegration.decorationsEnabled" /* TerminalSettingId.ShellIntegrationDecorationsEnabled */, newValue);
        }));
        quickPick.ok = false;
        quickPick.show();
    }
    _getDecorationCssColor(command) {
        let colorId;
        if (command?.exitCode === undefined) {
            colorId = TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR;
        }
        else {
            colorId = command.exitCode ? TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR : TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR;
        }
        return this._themeService.getColorTheme().getColor(colorId)?.toString();
    }
};
DecorationAddon = __decorate([
    __param(2, IClipboardService),
    __param(3, IContextMenuService),
    __param(4, IConfigurationService),
    __param(5, IThemeService),
    __param(6, IOpenerService),
    __param(7, IQuickInputService),
    __param(8, ILifecycleService),
    __param(9, ICommandService),
    __param(10, IAccessibilitySignalService),
    __param(11, INotificationService),
    __param(12, IHoverService),
    __param(13, IChatContextPickService),
    __param(14, IChatWidgetService),
    __param(15, IInstantiationService)
], DecorationAddon);
export { DecorationAddon };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvbkFkZG9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvYnJvd3Nlci94dGVybS9kZWNvcmF0aW9uQWRkb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQVcsU0FBUyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDM0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBZSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekksT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSxtRkFBbUYsQ0FBQztBQUNySixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDakcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsa0JBQWtCLEVBQWtCLE1BQU0seURBQXlELENBQUM7QUFHN0csT0FB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