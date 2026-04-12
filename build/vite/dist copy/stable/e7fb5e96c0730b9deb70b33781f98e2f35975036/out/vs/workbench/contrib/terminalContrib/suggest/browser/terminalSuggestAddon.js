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
var SuggestAddon_1;
import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { commonPrefixLength } from '../../../../../base/common/strings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { terminalSuggestConfigSection, normalizeQuickSuggestionsConfig } from '../common/terminalSuggestConfiguration.js';
import { LineContext } from '../../../../services/suggest/browser/simpleCompletionModel.js';
import { SimpleSuggestWidget } from '../../../../services/suggest/browser/simpleSuggestWidget.js';
import { ITerminalCompletionService } from './terminalCompletionService.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { createCancelablePromise, IntervalTimer, TimeoutTimer } from '../../../../../base/common/async.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { ITerminalConfigurationService } from '../../../terminal/browser/terminal.js';
import { GOLDEN_LINE_HEIGHT_RATIO } from '../../../../../editor/common/config/fontInfo.js';
import { TerminalCompletionModel } from './terminalCompletionModel.js';
import { TerminalCompletionItem, TerminalCompletionItemKind } from './terminalCompletionItem.js';
import { localize } from '../../../../../nls.js';
import { TerminalSuggestTelemetry } from './terminalSuggestTelemetry.js';
import { terminalSymbolAliasIcon, terminalSymbolArgumentIcon, terminalSymbolEnumMember, terminalSymbolFileIcon, terminalSymbolFlagIcon, terminalSymbolInlineSuggestionIcon, terminalSymbolMethodIcon, terminalSymbolOptionIcon, terminalSymbolFolderIcon, terminalSymbolSymbolicLinkFileIcon, terminalSymbolSymbolicLinkFolderIcon, terminalSymbolCommitIcon, terminalSymbolBranchIcon, terminalSymbolTagIcon, terminalSymbolStashIcon, terminalSymbolRemoteIcon, terminalSymbolPullRequestIcon, terminalSymbolPullRequestDoneIcon, terminalSymbolSymbolTextIcon } from './terminalSymbolIcons.js';
import { TerminalSuggestShownTracker } from './terminalSuggestShownTracker.js';
import { isString } from '../../../../../base/common/types.js';
export function isInlineCompletionSupported(shellType) {
    if (!shellType) {
        return false;
    }
    return shellType === "bash" /* PosixShellType.Bash */ ||
        shellType === "zsh" /* PosixShellType.Zsh */ ||
        shellType === "fish" /* PosixShellType.Fish */ ||
        shellType === "pwsh" /* GeneralShellType.PowerShell */ ||
        shellType === "gitbash" /* WindowsShellType.GitBash */;
}
let SuggestAddon = class SuggestAddon extends Disposable {
    static { SuggestAddon_1 = this; }
    static { this.lastAcceptedCompletionTimestamp = 0; }
    constructor(_sessionId, shellType, _capabilities, _terminalSuggestWidgetVisibleContextKey, _terminalCompletionService, _configurationService, _instantiationService, _terminalConfigurationService, _logService) {
        super();
        this._sessionId = _sessionId;
        this._capabilities = _capabilities;
        this._terminalSuggestWidgetVisibleContextKey = _terminalSuggestWidgetVisibleContextKey;
        this._terminalCompletionService = _terminalCompletionService;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._logService = _logService;
        this._promptInputModelSubscriptions = this._register(new MutableDisposable());
        this._enableWidget = true;
        this._isFilteringDirectories = false;
        this._cursorIndexDelta = 0;
        this._requestedCompletionsIndex = 0;
        this._lastUserDataTimestamp = 0;
        this._ignoreFocusEvents = false;
        this._requestCompletionsOnNextSync = false;
        this.isPasting = false;
        this._onBell = this._register(new Emitter());
        this.onBell = this._onBell.event;
        this._onAcceptedCompletion = this._register(new Emitter());
        this.onAcceptedCompletion = this._onAcceptedCompletion.event;
        this._onDidReceiveCompletions = this._register(new Emitter());
        this.onDidReceiveCompletions = this._onDidReceiveCompletions.event;
        this._onDidFontConfigurationChange = this._register(new Emitter());
        this.onDidFontConfigurationChange = this._onDidFontConfigurationChange.event;
        this._kindToIconMap = new Map([
            [TerminalCompletionItemKind.File, terminalSymbolFileIcon],
            [TerminalCompletionItemKind.Folder, terminalSymbolFolderIcon],
            [TerminalCompletionItemKind.SymbolicLinkFile, terminalSymbolSymbolicLinkFileIcon],
            [TerminalCompletionItemKind.SymbolicLinkFolder, terminalSymbolSymbolicLinkFolderIcon],
            [TerminalCompletionItemKind.Method, terminalSymbolMethodIcon],
            [TerminalCompletionItemKind.Alias, terminalSymbolAliasIcon],
            [TerminalCompletionItemKind.Argument, terminalSymbolArgumentIcon],
            [TerminalCompletionItemKind.Option, terminalSymbolOptionIcon],
            [TerminalCompletionItemKind.OptionValue, terminalSymbolEnumMember],
            [TerminalCompletionItemKind.Flag, terminalSymbolFlagIcon],
            [TerminalCompletionItemKind.Commit, terminalSymbolCommitIcon],
            [TerminalCompletionItemKind.Branch, terminalSymbolBranchIcon],
            [TerminalCompletionItemKind.Tag, terminalSymbolTagIcon],
            [TerminalCompletionItemKind.Stash, terminalSymbolStashIcon],
            [TerminalCompletionItemKind.Remote, terminalSymbolRemoteIcon],
            [TerminalCompletionItemKind.PullRequest, terminalSymbolPullRequestIcon],
            [TerminalCompletionItemKind.PullRequestDone, terminalSymbolPullRequestDoneIcon],
            [TerminalCompletionItemKind.InlineSuggestion, terminalSymbolInlineSuggestionIcon],
            [TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop, terminalSymbolInlineSuggestionIcon],
        ]);
        this._kindToKindLabelMap = new Map([
            [TerminalCompletionItemKind.File, localize('file', 'File')],
            [TerminalCompletionItemKind.Folder, localize('folder', 'Folder')],
            [TerminalCompletionItemKind.SymbolicLinkFile, localize('symbolicLinkFile', 'Symbolic Link File')],
            [TerminalCompletionItemKind.SymbolicLinkFolder, localize('symbolicLinkFolder', 'Symbolic Link Folder')],
            [TerminalCompletionItemKind.Method, localize('method', 'Method')],
            [TerminalCompletionItemKind.Alias, localize('alias', 'Alias')],
            [TerminalCompletionItemKind.Argument, localize('argument', 'Argument')],
            [TerminalCompletionItemKind.Option, localize('option', 'Option')],
            [TerminalCompletionItemKind.OptionValue, localize('optionValue', 'Option Value')],
            [TerminalCompletionItemKind.Flag, localize('flag', 'Flag')],
            [TerminalCompletionItemKind.Commit, localize('commit', 'Commit')],
            [TerminalCompletionItemKind.Branch, localize('branch', 'Branch')],
            [TerminalCompletionItemKind.Tag, localize('tag', 'Tag')],
            [TerminalCompletionItemKind.Stash, localize('stash', 'Stash')],
            [TerminalCompletionItemKind.Remote, localize('remote', 'Remote')],
            [TerminalCompletionItemKind.PullRequest, localize('pullRequest', 'Pull Request')],
            [TerminalCompletionItemKind.PullRequestDone, localize('pullRequestDone', 'Pull Request (Done)')],
            [TerminalCompletionItemKind.InlineSuggestion, localize('inlineSuggestion', 'Inline Suggestion')],
            [TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop, localize('inlineSuggestionAlwaysOnTop', 'Inline Suggestion')],
        ]);
        this._inlineCompletion = {
            label: '',
            // Right arrow is used to accept the completion. This is a common keybinding in pwsh, zsh
            // and fish.
            inputData: '\x1b[C',
            replacementRange: [0, 0],
            provider: 'core:inlineSuggestion',
            detail: 'Inline suggestion',
            kind: TerminalCompletionItemKind.InlineSuggestion,
            kindLabel: 'Inline suggestion',
            icon: this._kindToIconMap.get(TerminalCompletionItemKind.InlineSuggestion),
        };
        this._inlineCompletionItem = new TerminalCompletionItem(this._inlineCompletion);
        this._shouldSyncWhenReady = false;
        // Initialize shell type, including a promise that completions can await for that resolves:
        // - immediately if shell type
        // - after a short delay if shell type gets set
        // - after a long delay if it doesn't get set
        this.shellType = shellType;
        if (this.shellType) {
            this._shellTypeInit = Promise.resolve();
        }
        else {
            const intervalTimer = this._register(new IntervalTimer());
            const timeoutTimer = this._register(new TimeoutTimer());
            this._shellTypeInit = new Promise(r => {
                intervalTimer.cancelAndSet(() => {
                    if (this.shellType) {
                        r();
                    }
                }, 50);
                timeoutTimer.cancelAndSet(r, 5000);
            }).then(() => {
                this._store.delete(intervalTimer);
                this._store.delete(timeoutTimer);
            });
        }
        this._register(Event.runAndSubscribe(this._capabilities.onDidChangeCapabilities, () => {
            const commandDetection = this._capabilities.get(2 /* TerminalCapability.CommandDetection */);
            if (commandDetection) {
                if (this._promptInputModel !== commandDetection.promptInputModel) {
                    this._promptInputModel = commandDetection.promptInputModel;
                    this._suggestTelemetry = this._register(this._instantiationService.createInstance(TerminalSuggestTelemetry, commandDetection, this._promptInputModel));
                    this._promptInputModelSubscriptions.value = combinedDisposable(this._promptInputModel.onDidChangeInput(e => this._sync(e)), this._promptInputModel.onDidFinishInput(() => {
                        this.hideSuggestWidget(true);
                    }));
                    if (this._shouldSyncWhenReady) {
                        this._sync(this._promptInputModel);
                        this._shouldSyncWhenReady = false;
                    }
                }
            }
            else {
                this._promptInputModel = undefined;
            }
        }));
        this._register(this._terminalConfigurationService.onConfigChanged(() => this._cachedFontInfo = undefined));
        this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
            if (!e || e.affectsConfiguration("terminal.integrated.suggest.inlineSuggestion" /* TerminalSuggestSettingId.InlineSuggestion */)) {
                const value = this._configurationService.getValue(terminalSuggestConfigSection).inlineSuggestion;
                this._inlineCompletionItem.isInvalid = value === 'off';
                switch (value) {
                    case 'alwaysOnTopExceptExactMatch': {
                        this._inlineCompletion.kind = TerminalCompletionItemKind.InlineSuggestion;
                        break;
                    }
                    case 'alwaysOnTop':
                    default: {
                        this._inlineCompletion.kind = TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop;
                        break;
                    }
                }
                this._model?.forceRefilterAll();
            }
        }));
    }
    activate(xterm) {
        this._terminal = xterm;
        this._register(xterm.onKey(async (e) => {
            this._lastUserData = e.key;
            this._lastUserDataTimestamp = Date.now();
        }));
        this._register(xterm.onScroll(() => this.hideSuggestWidget(true)));
        this._register(xterm.onResize(() => this._relayoutOnResize()));
    }
    async _handleCompletionProviders(terminal, token, explicitlyInvoked) {
        this._logService.trace('SuggestAddon#_handleCompletionProviders');
        // Nothing to handle if the terminal is not attached
        if (!terminal?.element || !this._enableWidget || !this._promptInputModel) {
            return;
        }
        // Only show the suggest widget if the terminal is focused
        if (!dom.isAncestorOfActiveElement(terminal.element)) {
            return;
        }
        // Wait for the shell type to initialize. This will wait a short period after launching to
        // allow the shell type to be set if possible. This prevents user requests sometimes getting
        // lost if requested shortly after the terminal is created. Completion providers can still
        // work with undefined shell types such as Pseudoterminal-based extension terminals.
        await this._shellTypeInit;
        let doNotRequestExtensionCompletions = false;
        // Ensure that a key has been pressed since the last accepted completion in order to prevent
        // completions being requested again right after accepting a completion
        if (this._promptInputModel.value !== '' && this._lastUserDataTimestamp < SuggestAddon_1.lastAcceptedCompletionTimestamp) {
            doNotRequestExtensionCompletions = true;
        }
        this._currentPromptInputState = {
            value: this._promptInputModel.value,
            prefix: this._promptInputModel.prefix,
            suffix: this._promptInputModel.suffix,
            cursorIndex: this._promptInputModel.cursorIndex,
            ghostTextIndex: this._promptInputModel.ghostTextIndex
        };
        this._requestedCompletionsIndex = this._currentPromptInputState.cursorIndex;
        // Show loading indicator before making async completion request (only for explicit invocations)
        if (explicitlyInvoked && this._container) {
            const suggestWidget = this._ensureSuggestWidget(terminal);
            const cursorPosition = this._getCursorPosition(terminal);
            if (cursorPosition) {
                suggestWidget.showTriggered(true, cursorPosition);
            }
        }
        const quickSuggestionsConfig = normalizeQuickSuggestionsConfig(this._configurationService.getValue(terminalSuggestConfigSection).quickSuggestions);
        const allowFallbackCompletions = explicitlyInvoked || quickSuggestionsConfig.unknown === 'on';
        this._logService.trace('SuggestAddon#_handleCompletionProviders provideCompletions');
        // Trim ghost text from the prompt value when requesting completions
        const ghostTextIndex = this._mostRecentPromptInputState?.ghostTextIndex === undefined ? -1 : this._mostRecentPromptInputState?.ghostTextIndex;
        const promptValue = ghostTextIndex > -1 ? this._currentPromptInputState.value.substring(0, ghostTextIndex) : this._currentPromptInputState.value;
        const providedCompletions = await this._terminalCompletionService.provideCompletions(promptValue, this._currentPromptInputState.cursorIndex, allowFallbackCompletions, this.shellType, this._capabilities, token, false, doNotRequestExtensionCompletions, explicitlyInvoked);
        this._logService.trace('SuggestAddon#_handleCompletionProviders provideCompletions done');
        if (token.isCancellationRequested) {
            return;
        }
        this._onDidReceiveCompletions.fire();
        this._cursorIndexDelta = this._promptInputModel.cursorIndex - this._requestedCompletionsIndex;
        this._leadingLineContent = this._promptInputModel.prefix.substring(0, this._requestedCompletionsIndex + this._cursorIndexDelta);
        const completions = providedCompletions?.flat() || [];
        if (!explicitlyInvoked && !completions.length) {
            this.hideSuggestWidget(true);
            return;
        }
        const firstChar = this._leadingLineContent.length === 0 ? '' : this._leadingLineContent[0];
        // This is a TabExpansion2 result
        if (this._leadingLineContent.includes(' ') || firstChar === '[') {
            this._leadingLineContent = this._promptInputModel.prefix;
        }
        let normalizedLeadingLineContent = this._leadingLineContent;
        // If there is a single directory in the completions:
        // - `\` and `/` are normalized such that either can be used
        // - Using `\` or `/` will request new completions. It's important that this only occurs
        //   when a directory is present, if not completions like git branches could be requested
        //   which leads to flickering
        this._isFilteringDirectories = completions.some(e => e.kind === TerminalCompletionItemKind.Folder);
        if (this._isFilteringDirectories) {
            const firstDir = completions.find(e => e.kind === TerminalCompletionItemKind.Folder);
            const textLabel = isString(firstDir?.label) ? firstDir.label : firstDir?.label.label;
            // Get path separator from the completion label, which is coming from the extension host
            const labelSep = textLabel?.match(/(?<sep>[\\\/])/)?.groups?.sep;
            if (labelSep) {
                this._pathSeparator = labelSep;
            }
            if (this._pathSeparator) {
                normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
            }
        }
        // Add any "ghost text" suggestion suggested by the shell. This aligns with behavior of the
        // editor and how it interacts with inline completions. This object is tracked and reused as
        // it may change on input.
        this._refreshInlineCompletion(completions);
        // Add any missing icons based on the completion item kind
        for (const completion of completions) {
            if (!completion.icon) {
                if (completion.kind !== undefined) {
                    completion.icon = this._kindToIconMap.get(completion.kind);
                    completion.kindLabel = this._kindToKindLabelMap.get(completion.kind);
                }
                else {
                    completion.icon = terminalSymbolSymbolTextIcon;
                }
            }
        }
        const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
        const items = completions.filter(c => !!c.label).map(c => new TerminalCompletionItem(c, this._pathSeparator));
        if (isInlineCompletionSupported(this.shellType)) {
            items.push(this._inlineCompletionItem);
        }
        this._logService.trace('TerminalCompletionService#_collectCompletions create model');
        const model = new TerminalCompletionModel(items, lineContext);
        this._logService.trace('TerminalCompletionService#_collectCompletions create model done');
        if (token.isCancellationRequested) {
            this._completionRequestTimestamp = undefined;
            return;
        }
        this._showCompletions(model, explicitlyInvoked);
    }
    setContainerWithOverflow(container) {
        const containerChanged = this._container !== container;
        const parentChanged = this._suggestWidget?.element.domNode.parentElement !== container;
        if (!containerChanged && !parentChanged) {
            return;
        }
        this._container = container;
        if (this._suggestWidget) {
            container.appendChild(this._suggestWidget.element.domNode);
        }
    }
    setScreen(screen) {
        this._screen = screen;
    }
    toggleExplainMode() {
        this._suggestWidget?.toggleExplainMode();
    }
    toggleSuggestionFocus() {
        this._suggestWidget?.toggleDetailsFocus();
    }
    toggleSuggestionDetails() {
        this._suggestWidget?.toggleDetails();
    }
    resetWidgetSize() {
        this._suggestWidget?.resetWidgetSize();
    }
    async requestCompletions(explicitlyInvoked) {
        this._logService.trace('SuggestAddon#requestCompletions');
        if (!this._promptInputModel) {
            this._shouldSyncWhenReady = true;
            return;
        }
        if (this.isPasting) {
            return;
        }
        if (this._cancellationTokenSource) {
            this._cancellationTokenSource.cancel();
            this._cancellationTokenSource.dispose();
        }
        this._cancellationTokenSource = new CancellationTokenSource();
        const token = this._cancellationTokenSource.token;
        // Track the time when completions are requested
        this._completionRequestTimestamp = Date.now();
        await this._handleCompletionProviders(this._terminal, token, explicitlyInvoked);
        // If completions are not shown (widget not visible), reset the tracker
        if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
            this._completionRequestTimestamp = undefined;
        }
    }
    _addPropertiesToInlineCompletionItem(completions) {
        const inlineCompletionLabel = (isString(this._inlineCompletionItem.completion.label) ? this._inlineCompletionItem.completion.label : this._inlineCompletionItem.completion.label.label).trim();
        const inlineCompletionMatchIndex = completions.findIndex(c => isString(c.label) ? c.label === inlineCompletionLabel : c.label.label === inlineCompletionLabel);
        if (inlineCompletionMatchIndex !== -1) {
            // Remove the existing inline completion item from the completions list
            const richCompletionMatchingInline = completions.splice(inlineCompletionMatchIndex, 1)[0];
            // Apply its properties to the inline completion item
            this._inlineCompletionItem.completion.label = richCompletionMatchingInline.label;
            this._inlineCompletionItem.completion.detail = richCompletionMatchingInline.detail;
            this._inlineCompletionItem.completion.documentation = richCompletionMatchingInline.documentation;
        }
        else if (this._inlineCompletionItem.completion) {
            this._inlineCompletionItem.completion.detail = undefined;
            this._inlineCompletionItem.completion.documentation = undefined;
        }
    }
    _requestTriggerCharQuickSuggestCompletions() {
        if (!this._wasLastInputVerticalArrowKey() && !this._wasLastInputTabKey()) {
            // Only request on trigger character when it's a regular input, or on an arrow if the widget
            // is already visible
            if (!this._wasLastInputIncludedEscape() || this._terminalSuggestWidgetVisibleContextKey.get()) {
                this.requestCompletions();
                return true;
            }
        }
        return false;
    }
    _checkProviderTriggerCharacters(char) {
        for (const provider of this._terminalCompletionService.providers) {
            if (!provider.triggerCharacters) {
                continue;
            }
            for (const triggerChar of provider.triggerCharacters) {
                if (char === triggerChar) {
                    return true;
                }
            }
        }
        return false;
    }
    _wasLastInputRightArrowKey() {
        return !!this._lastUserData?.match(/^\x1b[\[O]?C$/);
    }
    _wasLastInputVerticalArrowKey() {
        return !!this._lastUserData?.match(/^\x1b[\[O]?[A-B]$/);
    }
    /**
     * Whether the last input included the escape character. Typically this will mean it was more
     * than just a simple character, such as arrow keys, home, end, etc.
     */
    _wasLastInputIncludedEscape() {
        return !!this._lastUserData?.includes('\x1b');
    }
    _wasLastInputArrowKey() {
        // Never request completions if the last key sequence was up or down as the user was likely
        // navigating history
        return !!this._lastUserData?.match(/^\x1b[\[O]?[A-D]$/);
    }
    _wasLastInputTabKey() {
        return this._lastUserData === '\t';
    }
    _sync(promptInputState) {
        const config = this._configurationService.getValue(terminalSuggestConfigSection);
        const quickSuggestions = normalizeQuickSuggestionsConfig(config.quickSuggestions);
        {
            let sent = false;
            // If completions were requested from the addon
            if (this._requestCompletionsOnNextSync) {
                this._requestCompletionsOnNextSync = false;
                sent = this._requestTriggerCharQuickSuggestCompletions();
            }
            // If the cursor moved to the right
            if (!this._mostRecentPromptInputState || promptInputState.cursorIndex > this._mostRecentPromptInputState.cursorIndex) {
                // Quick suggestions - Trigger whenever a new non-whitespace character is used
                if (!this._terminalSuggestWidgetVisibleContextKey.get()) {
                    const commandLineHasSpace = promptInputState.prefix.trim().match(/\s/);
                    if ((!commandLineHasSpace && quickSuggestions.commands === 'on') ||
                        (commandLineHasSpace && quickSuggestions.arguments === 'on')) {
                        if (promptInputState.prefix.match(/[^\s]$/)) {
                            sent = this._requestTriggerCharQuickSuggestCompletions();
                        }
                    }
                }
                // Trigger characters - this happens even if the widget is showing
                if (config.suggestOnTriggerCharacters && !sent) {
                    const prefix = promptInputState.prefix;
                    if (
                    // Only trigger on `-` if it's after a space. This is required to not clear
                    // completions when typing the `-` in `git cherry-pick`
                    prefix?.match(/\s[\-]$/) ||
                        // Only trigger on `\` and `/` if it's a directory. Not doing so causes problems
                        // with git branches in particular
                        this._isFilteringDirectories && prefix?.match(/[\\\/]$/)) {
                        sent = this._requestTriggerCharQuickSuggestCompletions();
                    }
                    if (!sent) {
                        for (const provider of this._terminalCompletionService.providers) {
                            if (!provider.triggerCharacters) {
                                continue;
                            }
                            for (const char of provider.triggerCharacters) {
                                if (prefix?.endsWith(char)) {
                                    sent = this._requestTriggerCharQuickSuggestCompletions();
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            // If the cursor moved to the left
            if (this._mostRecentPromptInputState && promptInputState.cursorIndex < this._mostRecentPromptInputState.cursorIndex && promptInputState.cursorIndex > 0) {
                // We only want to refresh via trigger characters in this case if the widget is
                // already visible
                if (this._terminalSuggestWidgetVisibleContextKey.get()) {
                    // Backspace or left past a trigger character
                    if (config.suggestOnTriggerCharacters && !sent && this._mostRecentPromptInputState.cursorIndex > 0) {
                        const char = this._mostRecentPromptInputState.value[this._mostRecentPromptInputState.cursorIndex - 1];
                        if (char && (
                        // Only trigger on `\` and `/` if it's a directory. Not doing so causes problems
                        // with git branches in particular
                        this._isFilteringDirectories && char.match(/[\\\/]$/) ||
                            // Check if the character is a trigger character from providers
                            this._checkProviderTriggerCharacters(char))) {
                            sent = this._requestTriggerCharQuickSuggestCompletions();
                        }
                    }
                }
            }
        }
        // Hide the widget if ghost text was just completed via right arrow
        if (this._wasLastInputRightArrowKey() &&
            this._mostRecentPromptInputState?.ghostTextIndex !== -1 &&
            promptInputState.ghostTextIndex === -1 &&
            this._mostRecentPromptInputState?.value === promptInputState.value) {
            this.hideSuggestWidget(false);
        }
        this._mostRecentPromptInputState = promptInputState;
        if (!this._promptInputModel || !this._terminal || !this._suggestWidget || this._leadingLineContent === undefined) {
            return;
        }
        const previousPromptInputState = this._currentPromptInputState;
        this._currentPromptInputState = promptInputState;
        // Hide the widget if the latest character was a space
        if (this._currentPromptInputState.cursorIndex > 1 && this._currentPromptInputState.value.at(this._currentPromptInputState.cursorIndex - 1) === ' ') {
            if (!this._wasLastInputArrowKey()) {
                this.hideSuggestWidget(false);
                return;
            }
        }
        // Hide the widget if the cursor moves to the left and invalidates the completions.
        // Originally this was to the left of the initial position that the completions were
        // requested, but since extensions are expected to allow the client-side to filter, they are
        // only invalidated when whitespace is encountered.
        if (this._currentPromptInputState && this._currentPromptInputState.cursorIndex < this._leadingLineContent.length) {
            if (this._currentPromptInputState.cursorIndex <= 0 || previousPromptInputState?.value[this._currentPromptInputState.cursorIndex]?.match(/[\\\/\s]/)) {
                this.hideSuggestWidget(false);
                return;
            }
        }
        if (this._terminalSuggestWidgetVisibleContextKey.get()) {
            this._cursorIndexDelta = this._currentPromptInputState.cursorIndex - (this._requestedCompletionsIndex);
            let normalizedLeadingLineContent = this._currentPromptInputState.value.substring(0, this._requestedCompletionsIndex + this._cursorIndexDelta);
            if (this._isFilteringDirectories && this._pathSeparator) {
                normalizedLeadingLineContent = normalizePathSeparator(normalizedLeadingLineContent, this._pathSeparator);
            }
            const lineContext = new LineContext(normalizedLeadingLineContent, this._cursorIndexDelta);
            this._suggestWidget.setLineContext(lineContext);
        }
        this._refreshInlineCompletion(this._model?.items.map(i => i.completion) || []);
        // Hide and clear model if there are no more items
        if (!this._suggestWidget.hasCompletions()) {
            this.hideSuggestWidget(false);
            return;
        }
        const cursorPosition = this._getCursorPosition(this._terminal);
        if (!cursorPosition) {
            return;
        }
        this._suggestWidget.showSuggestions(0, false, true, cursorPosition);
    }
    _refreshInlineCompletion(completions) {
        if (!isInlineCompletionSupported(this.shellType)) {
            // If the shell type is not supported, the inline completion item is invalid
            return;
        }
        const oldIsInvalid = this._inlineCompletionItem.isInvalid;
        if (!this._currentPromptInputState || this._currentPromptInputState.ghostTextIndex === -1) {
            this._inlineCompletionItem.isInvalid = true;
        }
        else {
            this._inlineCompletionItem.isInvalid = false;
            // Update properties
            const spaceIndex = this._currentPromptInputState.value.lastIndexOf(' ', this._currentPromptInputState.ghostTextIndex - 1);
            const replacementIndex = spaceIndex === -1 ? 0 : spaceIndex + 1;
            const suggestion = this._currentPromptInputState.value.substring(replacementIndex);
            this._inlineCompletion.label = suggestion;
            // Update replacementRange (inclusive start, exclusive end) for replacement
            const end = this._currentPromptInputState.cursorIndex - this._cursorIndexDelta;
            this._inlineCompletion.replacementRange = [replacementIndex, end];
            // Reset the completion item as the object reference must remain the same but its
            // contents will differ across syncs. This is done so we don't need to reassign the
            // model and the slowdown/flickering that could potentially cause.
            this._addPropertiesToInlineCompletionItem(completions);
            const x = new TerminalCompletionItem(this._inlineCompletion, this._pathSeparator);
            this._inlineCompletionItem.idx = x.idx;
            this._inlineCompletionItem.score = x.score;
            this._inlineCompletionItem.labelLow = x.labelLow;
            this._inlineCompletionItem.textLabel = x.textLabel;
            this._inlineCompletionItem.fileExtLow = x.fileExtLow;
            this._inlineCompletionItem.labelLowExcludeFileExt = x.labelLowExcludeFileExt;
            this._inlineCompletionItem.labelLowNormalizedPath = x.labelLowNormalizedPath;
            this._inlineCompletionItem.punctuationPenalty = x.punctuationPenalty;
            this._inlineCompletionItem.word = x.word;
            this._model?.forceRefilterAll();
        }
        // Force a filter all in order to re-evaluate the inline completion
        if (this._inlineCompletionItem.isInvalid !== oldIsInvalid) {
            this._model?.forceRefilterAll();
        }
    }
    _getTerminalDimensions() {
        const cssCellDims = this._terminal._core._renderService.dimensions.css.cell;
        return {
            width: cssCellDims.width,
            height: cssCellDims.height,
        };
    }
    _getCursorPosition(terminal) {
        const dimensions = this._getTerminalDimensions();
        if (!dimensions.width || !dimensions.height) {
            return undefined;
        }
        const xtermBox = this._screen.getBoundingClientRect();
        return {
            left: xtermBox.left + terminal.buffer.active.cursorX * dimensions.width,
            top: xtermBox.top + terminal.buffer.active.cursorY * dimensions.height,
            height: dimensions.height
        };
    }
    _getFontInfo() {
        if (this._cachedFontInfo) {
            return this._cachedFontInfo;
        }
        const core = this._terminal._core;
        const font = this._terminalConfigurationService.getFont(dom.getActiveWindow(), core);
        let lineHeight = font.lineHeight;
        const fontSize = font.fontSize;
        const fontFamily = font.fontFamily;
        const letterSpacing = font.letterSpacing;
        const fontWeight = this._configurationService.getValue('editor.fontWeight');
        // Unlike editor suggestions, line height in terminal is always multiplied to the font size.
        // Make sure that we still enforce a minimum line height to avoid content from being clipped.
        // See https://github.com/microsoft/vscode/issues/255851
        lineHeight = lineHeight * fontSize;
        // Enforce integer, minimum constraints
        lineHeight = Math.round(lineHeight);
        const minTerminalLineHeight = GOLDEN_LINE_HEIGHT_RATIO * fontSize;
        if (lineHeight < minTerminalLineHeight) {
            lineHeight = minTerminalLineHeight;
        }
        const fontInfo = {
            fontSize,
            lineHeight,
            fontWeight: fontWeight.toString(),
            letterSpacing,
            fontFamily
        };
        this._cachedFontInfo = fontInfo;
        return fontInfo;
    }
    _getAdvancedExplainModeDetails() {
        return `promptInputModel: ${this._promptInputModel?.getCombinedString()}`;
    }
    _showCompletions(model, explicitlyInvoked) {
        this._logService.trace('SuggestAddon#_showCompletions');
        if (!this._terminal?.element || !this._container) {
            return;
        }
        const suggestWidget = this._ensureSuggestWidget(this._terminal);
        this._logService.trace('SuggestAddon#_showCompletions setCompletionModel');
        suggestWidget.setCompletionModel(model);
        this._register(suggestWidget.onDidFocus(() => this._terminal?.focus()));
        if (!this._promptInputModel || !explicitlyInvoked && model.items.length === 0) {
            return;
        }
        this._model = model;
        const cursorPosition = this._getCursorPosition(this._terminal);
        if (!cursorPosition) {
            return;
        }
        // Track the time when completions are shown for the first time
        if (this._completionRequestTimestamp !== undefined) {
            const completionLatency = Date.now() - this._completionRequestTimestamp;
            if (this._suggestTelemetry && this._discoverability) {
                const firstShown = this._discoverability.getFirstShown(this.shellType);
                this._discoverability.updateShown();
                this._suggestTelemetry.logCompletionLatency(this._sessionId, completionLatency, firstShown);
            }
            this._completionRequestTimestamp = undefined;
        }
        this._logService.trace('SuggestAddon#_showCompletions suggestWidget.showSuggestions');
        suggestWidget.showSuggestions(0, false, !explicitlyInvoked, cursorPosition);
    }
    _ensureSuggestWidget(terminal) {
        if (!this._suggestWidget) {
            this._suggestWidget = this._register(this._instantiationService.createInstance(SimpleSuggestWidget, this._container, this._instantiationService.createInstance(PersistedWidgetSize), {
                statusBarMenuId: MenuId.MenubarTerminalSuggestStatusMenu,
                showStatusBarSettingId: "terminal.integrated.suggest.showStatusBar" /* TerminalSuggestSettingId.ShowStatusBar */,
                selectionModeSettingId: "terminal.integrated.suggest.selectionMode" /* TerminalSuggestSettingId.SelectionMode */,
                preventDetailsPlacements: [1 /* SimpleSuggestDetailsPlacement.West */],
            }, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.event.bind(this), this._getAdvancedExplainModeDetails.bind(this)));
            this._register(this._suggestWidget.onDidSelect(async (e) => this.acceptSelectedSuggestion(e)));
            this._register(this._suggestWidget.onDidHide(() => this._terminalSuggestWidgetVisibleContextKey.reset()));
            this._register(this._suggestWidget.onDidShow(() => this._terminalSuggestWidgetVisibleContextKey.set(true)));
            this._register(this._configurationService.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration("terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */) || e.affectsConfiguration("terminal.integrated.fontSize" /* TerminalSettingId.FontSize */) || e.affectsConfiguration("terminal.integrated.lineHeight" /* TerminalSettingId.LineHeight */) || e.affectsConfiguration("terminal.integrated.fontFamily" /* TerminalSettingId.FontFamily */) || e.affectsConfiguration('editor.fontSize') || e.affectsConfiguration('editor.fontFamily')) {
                    this._onDidFontConfigurationChange.fire();
                }
            }));
            this._register(this._suggestWidget.onDidFocus(async (e) => {
                if (this._ignoreFocusEvents) {
                    return;
                }
                const focusedItem = e.item;
                const focusedIndex = e.index;
                if (focusedItem === this._focusedItem) {
                    return;
                }
                // Cancel any previous resolution
                this._currentSuggestionDetails?.cancel();
                this._currentSuggestionDetails = undefined;
                this._focusedItem = focusedItem;
                // Check if the item needs resolution and hasn't been resolved yet
                if (focusedItem && (!focusedItem.completion.documentation || !focusedItem.completion.detail)) {
                    this._currentSuggestionDetails = createCancelablePromise(async (token) => {
                        try {
                            await focusedItem.resolve(token);
                        }
                        catch (error) {
                            // Silently fail - the item is still usable without details
                            this._logService.warn(`Failed to resolve suggestion details for item ${focusedItem} at index ${focusedIndex}`, error);
                        }
                    });
                    this._currentSuggestionDetails.then(() => {
                        // Check if this is still the focused item and it's still in the list
                        if (focusedItem !== this._focusedItem || !this._suggestWidget?.list || focusedIndex >= this._suggestWidget.list.length) {
                            return;
                        }
                        // Re-render the specific item to show resolved details (like editor does)
                        this._ignoreFocusEvents = true;
                        // Use splice to replace the item and trigger re-render
                        this._suggestWidget.list.splice(focusedIndex, 1, [focusedItem]);
                        this._suggestWidget.list.setFocus([focusedIndex]);
                        this._ignoreFocusEvents = false;
                    });
                }
            }));
            // eslint-disable-next-line no-restricted-syntax
            const element = this._terminal?.element?.querySelector('.xterm-helper-textarea');
            if (element) {
                this._register(dom.addDisposableListener(dom.getActiveDocument(), 'click', (event) => {
                    const target = event.target;
                    if (this._terminal?.element?.contains(target)) {
                        this._suggestWidget?.hide();
                    }
                }));
            }
            this._register(this._suggestWidget.onDidShow(() => this._updateDiscoverabilityState()));
            this._register(this._suggestWidget.onDidBlurDetails((e) => {
                const elt = e.relatedTarget;
                if (this._terminal?.element?.contains(elt)) {
                    // Do nothing, just the terminal getting focused
                    // If there was a mouse click, the suggest widget will be
                    // hidden above
                    return;
                }
                this._suggestWidget?.hide();
            }));
            this._terminalSuggestWidgetVisibleContextKey.set(false);
        }
        return this._suggestWidget;
    }
    _updateDiscoverabilityState() {
        if (!this._discoverability) {
            this._discoverability = this._register(this._instantiationService.createInstance(TerminalSuggestShownTracker, this.shellType));
        }
        if (!this._suggestWidget || this._discoverability?.done) {
            return;
        }
        this._discoverability?.update(this._suggestWidget.element.domNode);
    }
    resetDiscoverability() {
        this._discoverability?.resetState();
    }
    selectPreviousSuggestion() {
        this._suggestWidget?.selectPrevious();
    }
    selectPreviousPageSuggestion() {
        this._suggestWidget?.selectPreviousPage();
    }
    selectNextSuggestion() {
        this._suggestWidget?.selectNext();
    }
    selectNextPageSuggestion() {
        this._suggestWidget?.selectNextPage();
    }
    acceptSelectedSuggestion(suggestion, respectRunOnEnter) {
        if (!suggestion) {
            suggestion = this._suggestWidget?.getFocusedItem();
        }
        const initialPromptInputState = this._mostRecentPromptInputState;
        if (!suggestion?.item || !initialPromptInputState || this._leadingLineContent === undefined || !this._model) {
            this._suggestTelemetry?.acceptCompletion(this._sessionId, undefined, this._mostRecentPromptInputState?.value);
            return;
        }
        SuggestAddon_1.lastAcceptedCompletionTimestamp = Date.now();
        this._suggestWidget?.hide();
        const currentPromptInputState = this._currentPromptInputState ?? initialPromptInputState;
        // The replacement text is any text after the replacement index for the completions, this
        // includes any text that was there before the completions were requested and any text added
        // since to refine the completion.
        const startIndex = suggestion.item.completion.replacementRange?.[0] ?? currentPromptInputState.cursorIndex;
        const replacementText = currentPromptInputState.value.substring(startIndex, currentPromptInputState.cursorIndex);
        // Right side of replacement text in the same word
        let rightSideReplacementText = '';
        if (
        // The line didn't end with ghost text
        (currentPromptInputState.ghostTextIndex === -1 || currentPromptInputState.ghostTextIndex > currentPromptInputState.cursorIndex) &&
            // There is more than one charatcer
            currentPromptInputState.value.length > currentPromptInputState.cursorIndex + 1 &&
            // THe next character is not a space
            currentPromptInputState.value.at(currentPromptInputState.cursorIndex) !== ' ') {
            const spaceIndex = currentPromptInputState.value.substring(currentPromptInputState.cursorIndex, currentPromptInputState.ghostTextIndex === -1 ? undefined : currentPromptInputState.ghostTextIndex).indexOf(' ');
            rightSideReplacementText = currentPromptInputState.value.substring(currentPromptInputState.cursorIndex, spaceIndex === -1 ? undefined : currentPromptInputState.cursorIndex + spaceIndex);
        }
        const completion = suggestion.item.completion;
        let resultSequence = completion.inputData;
        // Use for amend the label if inputData is not defined
        if (resultSequence === undefined) {
            let completionText = isString(completion.label) ? completion.label : completion.label.label;
            if ((completion.kind === TerminalCompletionItemKind.Folder || completion.isFileOverride) && completionText.includes(' ')) {
                // Escape spaces in files or folders so they're valid paths
                completionText = completionText.replaceAll(' ', '\\ ');
            }
            let runOnEnter = false;
            if (respectRunOnEnter) {
                const runOnEnterConfig = this._configurationService.getValue(terminalSuggestConfigSection).runOnEnter;
                switch (runOnEnterConfig) {
                    case 'always': {
                        runOnEnter = true;
                        break;
                    }
                    case 'exactMatch': {
                        runOnEnter = replacementText.toLowerCase() === completionText.toLowerCase();
                        break;
                    }
                    case 'exactMatchIgnoreExtension': {
                        runOnEnter = replacementText.toLowerCase() === completionText.toLowerCase();
                        if (completion.isFileOverride) {
                            runOnEnter ||= replacementText.toLowerCase() === completionText.toLowerCase().replace(/\.[^\.]+$/, '');
                        }
                        break;
                    }
                }
            }
            const commonPrefixLen = commonPrefixLength(replacementText, completionText);
            const commonPrefix = replacementText.substring(replacementText.length - 1 - commonPrefixLen, replacementText.length - 1);
            const completionSuffix = completionText.substring(commonPrefixLen);
            if (currentPromptInputState.suffix.length > 0 && currentPromptInputState.prefix.endsWith(commonPrefix) && currentPromptInputState.suffix.startsWith(completionSuffix)) {
                // Move right to the end of the completion
                resultSequence = '\x1bOC'.repeat(completionText.length - commonPrefixLen);
            }
            else {
                resultSequence = [
                    // Backspace (left) to remove all additional input
                    '\x7F'.repeat(replacementText.length - commonPrefixLen),
                    // Delete (right) to remove any additional text in the same word
                    '\x1b[3~'.repeat(rightSideReplacementText.length),
                    // Write the completion
                    completionSuffix,
                    // Run on enter if needed
                    runOnEnter ? '\r' : ''
                ].join('');
            }
        }
        // For folders, allow the next completion request to get completions for that folder
        if (completion.kind === TerminalCompletionItemKind.Folder) {
            SuggestAddon_1.lastAcceptedCompletionTimestamp = 0;
        }
        // Add trailing space if enabled and not a folder or symbolic link folder
        const config = this._configurationService.getValue(terminalSuggestConfigSection);
        if (config.insertTrailingSpace && completion.kind !== TerminalCompletionItemKind.Folder && completion.kind !== TerminalCompletionItemKind.SymbolicLinkFolder) {
            resultSequence += ' ';
            this._lastUserDataTimestamp = Date.now();
            this._requestCompletionsOnNextSync = true;
        }
        // Send the completion
        this._onAcceptedCompletion.fire(resultSequence);
        this._suggestTelemetry?.acceptCompletion(this._sessionId, completion, this._mostRecentPromptInputState?.value);
        this.hideSuggestWidget(true);
    }
    hideSuggestWidget(cancelAnyRequest) {
        this._discoverability?.resetTimer();
        if (cancelAnyRequest) {
            this._cancellationTokenSource?.cancel();
            this._cancellationTokenSource = undefined;
            // Also cancel any pending resolution requests
            this._currentSuggestionDetails?.cancel();
            this._currentSuggestionDetails = undefined;
        }
        this._currentPromptInputState = undefined;
        this._leadingLineContent = undefined;
        this._focusedItem = undefined;
        this._suggestWidget?.hide();
    }
    _relayoutOnResize() {
        if (!this._terminalSuggestWidgetVisibleContextKey.get() || !this._terminal) {
            return;
        }
        const cursorPosition = this._getCursorPosition(this._terminal);
        if (!cursorPosition) {
            this.hideSuggestWidget(true);
            return;
        }
        this._suggestWidget?.relayout(cursorPosition);
    }
};
SuggestAddon = SuggestAddon_1 = __decorate([
    __param(4, ITerminalCompletionService),
    __param(5, IConfigurationService),
    __param(6, IInstantiationService),
    __param(7, ITerminalConfigurationService),
    __param(8, ITerminalLogService)
], SuggestAddon);
export { SuggestAddon };
let PersistedWidgetSize = class PersistedWidgetSize {
    constructor(_storageService) {
        this._storageService = _storageService;
        this._key = "terminal.integrated.suggestSize" /* TerminalStorageKeys.TerminalSuggestSize */;
    }
    restore() {
        const raw = this._storageService.get(this._key, 0 /* StorageScope.PROFILE */) ?? '';
        try {
            const obj = JSON.parse(raw);
            if (dom.Dimension.is(obj)) {
                return dom.Dimension.lift(obj);
            }
        }
        catch {
            // ignore
        }
        return undefined;
    }
    store(size) {
        this._storageService.store(this._key, JSON.stringify(size), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
    }
    reset() {
        this._storageService.remove(this._key, 0 /* StorageScope.PROFILE */);
    }
};
PersistedWidgetSize = __decorate([
    __param(0, IStorageService)
], PersistedWidgetSize);
export function normalizePathSeparator(path, sep) {
    if (sep === '/') {
        return path.replaceAll('\\', '/');
    }
    return path.replaceAll('/', '\\');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdWdnZXN0QWRkb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3Rlcm1pbmFsU3VnZ2VzdEFkZG9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXRHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sbURBQW1ELENBQUM7QUFLakgsT0FBTyxFQUFFLDRCQUE0QixFQUE0QiwrQkFBK0IsRUFBc0MsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4TCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDNUYsT0FBTyxFQUE2QixtQkFBbUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzdILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVFLE9BQU8sRUFBNEYsbUJBQW1CLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNwTCxPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEcsT0FBTyxFQUFFLHVCQUF1QixFQUFxQixhQUFhLEVBQUUs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