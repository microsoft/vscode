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
import { h } from '../../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../../base/browser/ui/actionbar/actionbar.js';
import { isMarkdownString, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../../common/chat.js';
import { IChatToolInvocation } from '../../../../common/chatService/chatService.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatQueryTitlePart } from '../chatConfirmationWidget.js';
import { ChatMarkdownContentPart } from '../chatMarkdownContentPart.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { ChatResourceGroupWidget } from '../chatResourceGroupWidget.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { extractImagesFromToolInvocationOutputDetails } from '../../../../common/chatImageExtraction.js';
import { TerminalToolAutoExpand } from './terminalToolAutoExpand.js';
import { ChatCollapsibleContentPart } from '../chatCollapsibleContentPart.js';
import '../media/chatTerminalToolProgressPart.css';
import { Action } from '../../../../../../../base/common/actions.js';
import { timeout } from '../../../../../../../base/common/async.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { getTerminalCommandDecorationState, getTerminalCommandDecorationTooltip } from '../../../../../terminal/browser/xterm/decorationStyles.js';
import * as dom from '../../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { localize } from '../../../../../../../nls.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { stripIcons } from '../../../../../../../base/common/iconLabels.js';
import { IAccessibleViewService } from '../../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { DetachedTerminalCommandMirror, DetachedTerminalSnapshotMirror } from '../../../../../terminal/browser/chatTerminalCommandMirror.js';
import { TerminalLocation } from '../../../../../../../platform/terminal/common/terminal.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { isNumber } from '../../../../../../../base/common/types.js';
import { removeAnsiEscapeCodes } from '../../../../../../../base/common/strings.js';
import { PANEL_BACKGROUND } from '../../../../../../common/theme.js';
import { editorBackground } from '../../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../../platform/theme/common/themeService.js';
/**
 * Minimum number of rows to display in the terminal output view.
 */
const MIN_OUTPUT_ROWS = 1;
/**
 * Maximum number of rows to display in the terminal output view before scrolling.
 */
const MAX_OUTPUT_ROWS = 10;
/**
 * Maximum number of characters to display in the command title before truncating.
 */
const MAX_COMMAND_TITLE_LENGTH = 50;
/**
 * Maximum number of retries when waiting for terminal output to appear.
 */
const MAX_OUTPUT_POLL_RETRIES = 10;
/**
 * Delay between retries when polling for terminal output (in milliseconds).
 */
const OUTPUT_POLL_DELAY_MS = 100;
/**
 * Minimum number of data events that indicate real output (vs shell integration sequences).
 */
const MIN_DATA_EVENTS_FOR_REAL_OUTPUT = 2;
/**
 * Remembers whether a tool invocation was last expanded so state survives virtualization re-renders.
 */
const expandedStateByInvocation = new WeakMap();
let TerminalCommandDecoration = class TerminalCommandDecoration extends Disposable {
    constructor(_options, _hoverService) {
        super();
        this._options = _options;
        this._hoverService = _hoverService;
        const decorationElements = h('span.chat-terminal-command-decoration@decoration', { role: 'img', tabIndex: 0 });
        this._element = decorationElements.decoration;
        this._attachElementToContainer();
    }
    _attachElementToContainer() {
        const container = this._options.getCommandBlock();
        if (!container) {
            return;
        }
        const decoration = this._element;
        if (!decoration.isConnected || decoration.parentElement !== container) {
            const icon = this._options.getIconElement();
            if (icon && icon.parentElement === container) {
                icon.insertAdjacentElement('afterend', decoration);
            }
            else {
                container.insertBefore(decoration, container.firstElementChild ?? null);
            }
        }
        this._register(this._hoverService.setupDelayedHover(decoration, () => ({
            content: this._getHoverText()
        })));
        this._attachInteractionHandlers(decoration);
    }
    _getHoverText() {
        const command = this._options.getResolvedCommand();
        const storedState = this._options.terminalData.terminalCommandState;
        return getTerminalCommandDecorationTooltip(command, storedState) || '';
    }
    update(command) {
        this._attachElementToContainer();
        const decoration = this._element;
        const resolvedCommand = command ?? this._options.getResolvedCommand();
        this._apply(decoration, resolvedCommand);
    }
    _apply(decoration, command) {
        const terminalData = this._options.terminalData;
        let storedState = terminalData.terminalCommandState;
        if (command) {
            const existingState = terminalData.terminalCommandState ?? {};
            terminalData.terminalCommandState = {
                ...existingState,
                exitCode: command.exitCode,
                timestamp: command.timestamp ?? existingState.timestamp,
                duration: command.duration ?? existingState.duration
            };
            storedState = terminalData.terminalCommandState;
        }
        else if (!storedState) {
            const now = Date.now();
            terminalData.terminalCommandState = { exitCode: undefined, timestamp: now };
            storedState = terminalData.terminalCommandState;
        }
        const decorationState = getTerminalCommandDecorationState(command, storedState);
        const tooltip = getTerminalCommandDecorationTooltip(command, storedState);
        decoration.className = `chat-terminal-command-decoration ${"terminal-command-decoration" /* DecorationSelector.CommandDecoration */}`;
        decoration.classList.add("codicon" /* DecorationSelector.Codicon */);
        for (const className of decorationState.classNames) {
            decoration.classList.add(className);
        }
        decoration.classList.add(...ThemeIcon.asClassNameArray(decorationState.icon));
        const isInteractive = !decoration.classList.contains("default" /* DecorationSelector.Default */);
        decoration.tabIndex = isInteractive ? 0 : -1;
        if (isInteractive) {
            decoration.removeAttribute('aria-disabled');
        }
        else {
            decoration.setAttribute('aria-disabled', 'true');
        }
        const hoverText = tooltip || decorationState.hoverMessage;
        if (hoverText) {
            decoration.setAttribute('aria-label', hoverText);
        }
        else {
            decoration.removeAttribute('aria-label');
        }
    }
    _attachInteractionHandlers(decoration) {
        if (this._interactionElement === decoration) {
            return;
        }
        this._interactionElement = decoration;
    }
};
TerminalCommandDecoration = __decorate([
    __param(1, IHoverService)
], TerminalCommandDecoration);
/**
 * A chat content part that displays terminal tool invocation progress.
 *
 * This component shows:
 * - The command being executed with syntax highlighting
 * - A status decoration indicating success/failure/running state
 * - Expandable terminal output with live streaming support
 * - Actions to focus the terminal, show/hide output, and continue in background
 *
 * The component supports two rendering modes:
 * - Standard mode: Shows full progress with status indicators
 * - Collapsible wrapper mode: For thinking containers with simplified UI
 *
 * Output auto-expansion behavior:
 * - Long-running commands with output auto-expand after a short delay
 * - Fast commands that complete quickly don't auto-expand (prevents flickering)
 * - Failed commands can be configured to auto-expand via settings
 * - Successful commands auto-collapse if output was auto-expanded
 */
let ChatTerminalToolProgressPart = class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart {
    get codeblocks() {
        return this.markdownPart?.codeblocks ?? [];
    }
    get elementIndex() {
        return this._elementIndex;
    }
    get contentIndex() {
        return this._contentIndex;
    }
    constructor(toolInvocation, terminalData, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, _instantiationService, _terminalChatService, _terminalService, _contextKeyService, _chatWidgetService, _keybindingService, _configurationService) {
        super(toolInvocation);
        this._instantiationService = _instantiationService;
        this._terminalChatService = _terminalChatService;
        this._terminalService = _terminalService;
        this._contextKeyService = _contextKeyService;
        this._chatWidgetService = _chatWidgetService;
        this._keybindingService = _keybindingService;
        this._configurationService = _configurationService;
        this._showOutputAction = this._register(new MutableDisposable());
        this._showOutputActionAdded = false;
        this._focusAction = this._register(new MutableDisposable());
        this._continueInBackgroundAction = this._register(new MutableDisposable());
        this._userToggledOutput = false;
        this._isInThinkingContainer = false;
        this._usesCollapsibleWrapper = false;
        this._elementIndex = context.elementIndex;
        this._contentIndex = context.contentIndex;
        this._sessionResource = context.element.sessionResource;
        terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
        this._terminalData = terminalData;
        this._terminalCommandUri = terminalData.terminalCommandUri ? URI.revive(terminalData.terminalCommandUri) : undefined;
        this._storedCommandId = this._terminalCommandUri ? new URLSearchParams(this._terminalCommandUri.query ?? '').get('command') ?? undefined : undefined;
        this._isSerializedInvocation = (toolInvocation.kind === 'toolInvocationSerialized');
        const elements = h('.chat-terminal-content-part@container', [
            h('.chat-terminal-content-title@title', [
                h('.chat-terminal-command-block@commandBlock')
            ]),
            h('.chat-terminal-content-message@message')
        ]);
        this._titleElement = elements.title;
        const command = (terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
        this._commandText = command;
        this._terminalOutputContextKey = ChatContextKeys.inChatTerminalToolOutput.bindTo(this._contextKeyService);
        this._decoration = this._register(this._instantiationService.createInstance(TerminalCommandDecoration, {
            terminalData: this._terminalData,
            getCommandBlock: () => elements.commandBlock,
            getIconElement: () => undefined,
            getResolvedCommand: () => this._getResolvedCommand()
        }));
        // Use presentationOverrides for display if available (e.g., extracted Python code with syntax highlighting)
        const displayCommand = terminalData.presentationOverrides?.commandLine ?? command;
        const displayLanguage = terminalData.presentationOverrides?.language ?? terminalData.language;
        const titlePart = this._register(_instantiationService.createInstance(ChatQueryTitlePart, elements.commandBlock, new MarkdownString([
            `\`\`\`${displayLanguage}`,
            `${displayCommand.replaceAll('```', '\\`\\`\\`')}`,
            `\`\`\``
        ].join('\n'), { supportThemeIcons: true }), undefined));
        this._register(titlePart.onDidChangeHeight(() => {
            this._decoration.update();
        }));
        this._outputView = this._register(this._instantiationService.createInstance(ChatTerminalToolOutputSection, () => this._ensureTerminalInstance(), () => this._getResolvedCommand(), () => this._terminalData.terminalCommandOutput, () => this._commandText, () => this._terminalData.terminalTheme, !!this._terminalData.terminalToolSessionId));
        // Only append the output section if there's a terminal session or stored output;
        // display-only invocations with no output don't need the output area at all
        if (this._terminalData.terminalToolSessionId || this._terminalData.terminalCommandOutput) {
            elements.container.append(this._outputView.domNode);
        }
        this._register(this._outputView.onDidFocus(() => this._handleOutputFocus()));
        this._register(this._outputView.onDidBlur(e => this._handleOutputBlur(e)));
        this._register(toDisposable(() => this._handleDispose()));
        this._register(this._keybindingService.onDidUpdateKeybindings(() => {
            this._focusAction.value?.refreshKeybindingTooltip();
            this._showOutputAction.value?.refreshKeybindingTooltip();
        }));
        const actionBarEl = h('.chat-terminal-action-bar@actionBar');
        elements.title.append(actionBarEl.root);
        this._actionBar = this._register(new ActionBar(actionBarEl.actionBar, {}));
        this._initializeTerminalActions();
        this._terminalService.whenConnected.then(() => this._initializeTerminalActions());
        let pastTenseMessage;
        if (toolInvocation.pastTenseMessage) {
            pastTenseMessage = `${typeof toolInvocation.pastTenseMessage === 'string' ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value}`;
        }
        const markdownContent = new MarkdownString(pastTenseMessage, {
            supportThemeIcons: true,
            isTrusted: isMarkdownString(toolInvocation.pastTenseMessage) ? toolInvocation.pastTenseMessage.isTrusted : false,
        });
        const chatMarkdownContent = {
            kind: 'markdownContent',
            content: markdownContent,
        };
        const codeBlockRenderOptions = {
            hideToolbar: true,
            reserveWidth: 19,
            verticalPadding: 5,
            editorOptions: {
                wordWrap: 'on'
            }
        };
        const markdownOptions = {
            codeBlockRenderOptions,
            accessibilityOptions: pastTenseMessage ? {
                statusMessage: localize('terminalToolCommand', '{0}', stripIcons(pastTenseMessage))
            } : undefined
        };
        this.markdownPart = this._register(_instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {}, currentWidthDelegate(), markdownOptions));
        elements.message.append(this.markdownPart.domNode);
        const progressPart = this._register(_instantiationService.createInstance(ChatProgressSubPart, elements.container, this.getIcon(), terminalData.autoApproveInfo));
        this._decoration.update();
        // Keep thinking-container semantics separate from wrapper semantics.
        const terminalToolsInThinking = this._configurationService.getValue(ChatConfiguration.TerminalToolsInThinking);
        const isSimpleTerminal = this._configurationService.getValue(ChatConfiguration.SimpleTerminalCollapsible);
        const requiresConfirmation = toolInvocation.kind === 'toolInvocation' && IChatToolInvocation.getConfirmationMessages(toolInvocation);
        this._isInThinkingContainer = terminalToolsInThinking && !requiresConfirmation;
        this._usesCollapsibleWrapper = this._isInThinkingContainer || isSimpleTerminal;
        if (this._usesCollapsibleWrapper) {
            this.domNode = this._createCollapsibleWrapper(progressPart.domNode, displayCommand, toolInvocation, context);
        }
        else {
            this.domNode = progressPart.domNode;
        }
        this._renderImagePills(toolInvocation, context, elements.container);
        // Only auto-expand in thinking containers if there's actual output to show
        const hasStoredOutput = !!terminalData.terminalCommandOutput;
        if (expandedStateByInvocation.get(toolInvocation) || (this._isInThinkingContainer && IChatToolInvocation.isComplete(toolInvocation) && hasStoredOutput)) {
            void this._toggleOutput(true);
        }
        this._register(this._terminalChatService.registerProgressPart(this));
    }
    /**
     * Renders image attachment pills below the terminal output when the tool
     * result contains image data parts. For collapsible wrappers, the single
     * widget is reparented between inside/outside based on expanded state.
     */
    _renderImagePills(toolInvocation, context, innerContainer) {
        const renderImages = () => {
            const extracted = extractImagesFromToolInvocationOutputDetails(toolInvocation, context.element.sessionResource);
            const imageParts = extracted.map(img => ({
                kind: 'data',
                value: img.data.buffer,
                mimeType: img.mimeType,
                uri: img.uri,
            }));
            if (imageParts.length === 0) {
                return;
            }
            const widget = this._register(this._instantiationService.createInstance(ChatResourceGroupWidget, imageParts));
            if (this._thinkingCollapsibleWrapper) {
                // Reparent the single widget between inner (expanded) and outer (collapsed)
                const wrapper = this._thinkingCollapsibleWrapper;
                const placeWidget = (expanded) => {
                    if (expanded) {
                        innerContainer.appendChild(widget.domNode);
                    }
                    else {
                        wrapper.domNode.appendChild(widget.domNode);
                    }
                };
                placeWidget(wrapper.expanded.get());
                this._register(autorun(reader => {
                    placeWidget(wrapper.expanded.read(reader));
                }));
            }
            else {
                innerContainer.appendChild(widget.domNode);
            }
        };
        if (toolInvocation.kind === 'toolInvocationSerialized') {
            renderImages();
        }
        else {
            this._register(autorun(reader => {
                const state = toolInvocation.state.read(reader);
                if (state.type === 4 /* IChatToolInvocation.StateKind.Completed */) {
                    renderImages();
                }
            }));
        }
    }
    _createCollapsibleWrapper(contentElement, commandText, toolInvocation, context) {
        // truncate header when it's too long
        const truncatedCommand = commandText.length > MAX_COMMAND_TITLE_LENGTH
            ? commandText.substring(0, MAX_COMMAND_TITLE_LENGTH) + '...'
            : commandText;
        const isComplete = IChatToolInvocation.isComplete(toolInvocation);
        const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
        const hasError = autoExpandFailures && this._terminalData.terminalCommandState?.exitCode !== undefined && this._terminalData.terminalCommandState.exitCode !== 0;
        const initialExpanded = !isComplete || hasError;
        const wrapper = this._register(this._instantiationService.createInstance(ChatTerminalThinkingCollapsibleWrapper, truncatedCommand, this._terminalData.commandLine.isSandboxWrapped === true, contentElement, context, initialExpanded, isComplete));
        this._thinkingCollapsibleWrapper = wrapper;
        // Sync terminal output expansion with the collapsible wrapper.
        // Skip the initial run — initial state is handled separately.
        let isFirstRun = true;
        this._register(autorun(r => {
            const expanded = wrapper.expanded.read(r);
            if (isFirstRun) {
                isFirstRun = false;
                return;
            }
            this._toggleOutput(expanded);
        }));
        return wrapper.domNode;
    }
    expandCollapsibleWrapper() {
        this._thinkingCollapsibleWrapper?.expand();
    }
    markCollapsibleWrapperComplete() {
        this._thinkingCollapsibleWrapper?.markComplete();
    }
    async _initializeTerminalActions() {
        if (this._store.isDisposed) {
            return;
        }
        const terminalToolSessionId = this._terminalData.terminalToolSessionId;
        if (!terminalToolSessionId) {
            this._addActions();
            return;
        }
        const attachInstance = async (instance) => {
            if (this._store.isDisposed) {
                return;
            }
            if (!instance) {
                if (this._isSerializedInvocation) {
                    this._clearCommandAssociation();
                }
                this._addActions(undefined, terminalToolSessionId);
                return;
            }
            const isNewInstance = this._terminalInstance !== instance;
            if (isNewInstance) {
                this._terminalInstance = instance;
                this._registerInstanceListener(instance);
            }
            // Always call _addActions to ensure actions are added, even if instance was set earlier
            // (e.g., by the output view during expanded state restoration)
            this._addActions(instance, terminalToolSessionId);
        };
        const initialInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
        await attachInstance(initialInstance);
        if (!initialInstance) {
            this._addActions(undefined, terminalToolSessionId);
        }
        if (this._store.isDisposed) {
            return;
        }
        if (!this._terminalSessionRegistration) {
            const listener = this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(async (instance) => {
                const registeredInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
                if (instance !== registeredInstance) {
                    return;
                }
                this._terminalSessionRegistration?.dispose();
                this._terminalSessionRegistration = undefined;
                await attachInstance(instance);
            });
            this._terminalSessionRegistration = this._store.add(listener);
        }
        // Listen for continue in background to remove the button
        this._store.add(this._terminalChatService.onDidContinueInBackground(sessionId => {
            if (sessionId === terminalToolSessionId) {
                this._terminalData.didContinueInBackground = true;
                this._removeContinueInBackgroundAction();
            }
        }));
    }
    _addActions(terminalInstance, terminalToolSessionId) {
        if (this._store.isDisposed) {
            return;
        }
        const actionBar = this._actionBar;
        this._removeFocusAction();
        const resolvedCommand = this._getResolvedCommand(terminalInstance);
        this._removeContinueInBackgroundAction();
        if (terminalInstance) {
            const isTerminalHidden = terminalInstance && terminalToolSessionId ? this._terminalChatService.isBackgroundTerminal(terminalToolSessionId) : false;
            const focusAction = this._instantiationService.createInstance(FocusChatInstanceAction, terminalInstance, resolvedCommand, this._terminalCommandUri, this._storedCommandId, isTerminalHidden);
            this._focusAction.value = focusAction;
            actionBar.push(focusAction, { icon: true, label: false, index: 0 });
            // Add continue in background action - only for foreground executions with running commands
            // Note: isBackground refers to whether the tool was invoked with isBackground=true (background execution),
            // not whether the terminal is hidden from the user
            if (terminalToolSessionId && !this._terminalData.isBackground && !this._terminalData.didContinueInBackground) {
                const isStillRunning = resolvedCommand?.exitCode === undefined && this._terminalData.terminalCommandState?.exitCode === undefined;
                if (isStillRunning) {
                    const continueAction = this._instantiationService.createInstance(ContinueInBackgroundAction, terminalToolSessionId);
                    this._continueInBackgroundAction.value = continueAction;
                    actionBar.push(continueAction, { icon: true, label: false, index: 0 });
                }
            }
        }
        this._ensureShowOutputAction(resolvedCommand);
        this._decoration.update(resolvedCommand);
    }
    _getResolvedCommand(instance) {
        const target = instance ?? this._terminalInstance;
        if (!target) {
            return undefined;
        }
        return this._resolveCommand(target);
    }
    _ensureShowOutputAction(command) {
        if (this._store.isDisposed) {
            return;
        }
        // don't show dropdown when rendered with the simplified/collapsible wrapper
        if (this._usesCollapsibleWrapper) {
            return;
        }
        const resolvedCommand = command ?? this._getResolvedCommand();
        const hasSnapshot = !!this._terminalData.terminalCommandOutput;
        if (!resolvedCommand && !hasSnapshot) {
            return;
        }
        let showOutputAction = this._showOutputAction.value;
        if (!showOutputAction) {
            showOutputAction = this._instantiationService.createInstance(ToggleChatTerminalOutputAction, () => this._toggleOutputFromAction());
            this._showOutputAction.value = showOutputAction;
            const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
            const exitCode = resolvedCommand?.exitCode ?? this._terminalData.terminalCommandState?.exitCode;
            if (exitCode !== undefined && exitCode !== 0 && autoExpandFailures) {
                this._toggleOutput(true);
            }
        }
        showOutputAction.syncPresentation(this._outputView.isExpanded);
        const actionBar = this._actionBar;
        if (this._showOutputActionAdded) {
            const existingIndex = actionBar.viewItems.findIndex(item => item.action === showOutputAction);
            if (existingIndex >= 0 && existingIndex !== actionBar.length() - 1) {
                actionBar.pull(existingIndex);
                this._showOutputActionAdded = false;
            }
            else if (existingIndex >= 0) {
                return;
            }
        }
        if (this._showOutputActionAdded) {
            return;
        }
        actionBar.push([showOutputAction], { icon: true, label: false });
        this._showOutputActionAdded = true;
    }
    _clearCommandAssociation(options) {
        this._terminalCommandUri = undefined;
        this._storedCommandId = undefined;
        if (options?.clearPersistentData) {
            if (this._terminalData.terminalCommandUri) {
                delete this._terminalData.terminalCommandUri;
            }
            if (this._terminalData.terminalToolSessionId) {
                delete this._terminalData.terminalToolSessionId;
            }
        }
        this._decoration.update();
    }
    /**
     * Determines whether the terminal output should auto-expand.
     * Returns false if already expanded, user has manually toggled, component is disposed,
     * or if the invocation was previously expanded (to preserve state across re-renders).
     */
    _shouldAutoExpand() {
        return !this._outputView.isExpanded &&
            !this._userToggledOutput &&
            !this._store.isDisposed &&
            !expandedStateByInvocation.get(this.toolInvocation);
    }
    /**
     * Registers event listeners on the terminal instance to track command execution,
     * manage auto-expansion of output, and handle command completion.
     *
     * This method sets up:
     * - Command detection listeners for tracking command lifecycle
     * - Auto-expand logic based on command output and duration
     * - Instance disposal handling to clean up actions and state
     */
    _registerInstanceListener(terminalInstance) {
        const commandDetectionListener = this._register(new MutableDisposable());
        const tryResolveCommand = async () => {
            const resolvedCommand = this._resolveCommand(terminalInstance);
            this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
            return resolvedCommand;
        };
        const attachCommandDetection = async (commandDetection) => {
            commandDetectionListener.clear();
            if (!commandDetection) {
                await tryResolveCommand();
                return;
            }
            const store = new DisposableStore();
            let receivedDataCount = 0;
            const hasRealOutput = () => {
                // Check for snapshot output
                if (this._terminalData.terminalCommandOutput?.text?.trim()) {
                    return true;
                }
                // Check for live output (cursor moved past executed marker)
                const command = this._getResolvedCommand(terminalInstance);
                if (!command?.executedMarker || terminalInstance.isDisposed) {
                    return false;
                }
                const buffer = terminalInstance.xterm?.raw.buffer.active;
                if (!buffer) {
                    return false;
                }
                const cursorLine = buffer.baseY + buffer.cursorY;
                if (cursorLine > command.executedMarker.line) {
                    return true;
                }
                // If we've received many data events, treat it as real output even if cursor
                // hasn't moved past the marker (e.g., progress bars updating on same line)
                // Shell integration sequences fire a couple times per command (PromptStart, CommandStart,
                // CommandExecuted), so we need a small threshold to filter those out
                return receivedDataCount > MIN_DATA_EVENTS_FOR_REAL_OUTPUT;
            };
            // Use the extracted auto-expand logic
            const autoExpand = store.add(new TerminalToolAutoExpand({
                commandDetection,
                onWillData: terminalInstance.onWillData,
                shouldAutoExpand: () => this._shouldAutoExpand(),
                hasRealOutput,
            }));
            store.add(autoExpand.onDidRequestExpand(() => {
                if (this._usesCollapsibleWrapper) {
                    this.expandCollapsibleWrapper();
                }
                this._toggleOutput(true);
            }));
            // Track data events to help hasRealOutput detect progress-style output
            store.add(terminalInstance.onWillData(() => {
                receivedDataCount++;
            }));
            store.add(commandDetection.onCommandExecuted(() => {
                this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
            }));
            store.add(commandDetection.onCommandFinished(() => {
                this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
                const resolvedCommand = this._getResolvedCommand(terminalInstance);
                this._handleCommandCompletion(resolvedCommand);
                if (resolvedCommand?.endMarker) {
                    commandDetectionListener.clear();
                }
            }));
            commandDetectionListener.value = store;
            const resolvedImmediately = await tryResolveCommand();
            if (resolvedImmediately?.endMarker) {
                commandDetectionListener.clear();
                this._handleCommandCompletion(resolvedImmediately);
                return;
            }
        };
        attachCommandDetection(terminalInstance.capabilities.get(2 /* TerminalCapability.CommandDetection */));
        this._register(terminalInstance.capabilities.onDidAddCommandDetectionCapability(cd => attachCommandDetection(cd)));
        const instanceListener = this._register(terminalInstance.onDisposed(() => {
            if (this._terminalInstance === terminalInstance) {
                this._terminalInstance = undefined;
            }
            this._clearCommandAssociation({ clearPersistentData: true });
            commandDetectionListener.clear();
            if (!this._store.isDisposed) {
                this._actionBar.clear();
            }
            this._removeFocusAction();
            this._showOutputActionAdded = false;
            this._showOutputAction.clear();
            this._addActions(undefined, this._terminalData.terminalToolSessionId);
            instanceListener.dispose();
        }));
    }
    _removeFocusAction() {
        if (this._store.isDisposed) {
            return;
        }
        const actionBar = this._actionBar;
        const focusAction = this._focusAction.value;
        if (actionBar && focusAction) {
            const existingIndex = actionBar.viewItems.findIndex(item => item.action === focusAction);
            if (existingIndex >= 0) {
                actionBar.pull(existingIndex);
            }
        }
        this._focusAction.clear();
    }
    _removeContinueInBackgroundAction() {
        if (this._store.isDisposed) {
            return;
        }
        const actionBar = this._actionBar;
        const continueAction = this._continueInBackgroundAction.value;
        if (actionBar && continueAction) {
            const existingIndex = actionBar.viewItems.findIndex(item => item.action === continueAction);
            if (existingIndex >= 0) {
                actionBar.pull(existingIndex);
            }
        }
        this._continueInBackgroundAction.clear();
    }
    /**
     * Handles the completion of a terminal command by updating the UI state.
     * This includes marking the collapsible wrapper as complete, auto-collapsing
     * successful commands, and keeping failed commands expanded.
     *
     * @param resolvedCommand The completed terminal command with exit code information.
     */
    _handleCommandCompletion(resolvedCommand) {
        // Update title to show completion state
        this.markCollapsibleWrapperComplete();
        // Auto-collapse on success (exit code 0)
        if (resolvedCommand?.exitCode === 0 && this._outputView.isExpanded && !this._userToggledOutput) {
            this._toggleOutput(false);
        }
        // Keep outer wrapper expanded on error for visibility
        const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
        if (autoExpandFailures && resolvedCommand?.exitCode !== undefined && resolvedCommand.exitCode !== 0 && this._thinkingCollapsibleWrapper) {
            this.expandCollapsibleWrapper();
        }
    }
    async _toggleOutput(expanded) {
        const didChange = await this._outputView.toggle(expanded);
        const isExpanded = this._outputView.isExpanded;
        this._titleElement.classList.toggle('chat-terminal-content-title-no-bottom-radius', isExpanded);
        this._showOutputAction.value?.syncPresentation(isExpanded);
        if (didChange) {
            expandedStateByInvocation.set(this.toolInvocation, isExpanded);
        }
        return didChange;
    }
    async _ensureTerminalInstance() {
        if (this._terminalInstance?.isDisposed) {
            this._terminalInstance = undefined;
        }
        if (!this._terminalInstance && this._terminalData.terminalToolSessionId) {
            this._terminalInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(this._terminalData.terminalToolSessionId);
            if (this._terminalInstance?.isDisposed) {
                this._terminalInstance = undefined;
            }
        }
        return this._terminalInstance;
    }
    _handleOutputFocus() {
        this._terminalOutputContextKey.set(true);
        this._terminalChatService.setFocusedProgressPart(this);
        this._outputView.updateAriaLabel();
    }
    _handleOutputBlur(event) {
        const nextTarget = event.relatedTarget;
        if (this._outputView.containsElement(nextTarget)) {
            return;
        }
        this._terminalOutputContextKey.reset();
        this._terminalChatService.clearFocusedProgressPart(this);
    }
    _handleDispose() {
        this._terminalOutputContextKey.reset();
        this._terminalChatService.clearFocusedProgressPart(this);
    }
    getCommandAndOutputAsText() {
        return this._outputView.getCommandAndOutputAsText();
    }
    focusOutput() {
        this._outputView.focus();
    }
    _focusChatInput() {
        const widget = this._chatWidgetService.getWidgetBySessionResource(this._sessionResource);
        widget?.focusInput();
    }
    async focusTerminal() {
        if (this._focusAction.value) {
            await this._focusAction.value.run();
            return;
        }
        if (this._terminalCommandUri) {
            this._terminalService.openResource(this._terminalCommandUri);
        }
    }
    async toggleOutputFromKeyboard() {
        this._userToggledOutput = true;
        if (!this._outputView.isExpanded) {
            await this._toggleOutput(true);
            this.focusOutput();
            return;
        }
        await this._collapseOutputAndFocusInput();
    }
    async _toggleOutputFromAction() {
        this._userToggledOutput = true;
        if (!this._outputView.isExpanded) {
            await this._toggleOutput(true);
            return;
        }
        await this._toggleOutput(false);
    }
    async _collapseOutputAndFocusInput() {
        if (this._outputView.isExpanded) {
            await this._toggleOutput(false);
        }
        this._focusChatInput();
    }
    _resolveCommand(instance) {
        if (instance.isDisposed) {
            return undefined;
        }
        const commandDetection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (!commandDetection) {
            return undefined;
        }
        const targetId = this._terminalData.terminalCommandId;
        if (!targetId) {
            return undefined;
        }
        const commands = commandDetection.commands;
        if (commands && commands.length > 0) {
            const fromHistory = commands.find(c => c.id === targetId);
            if (fromHistory) {
                return fromHistory;
            }
        }
        const executing = commandDetection.executingCommandObject;
        if (executing && executing.id === targetId) {
            return executing;
        }
        return undefined;
    }
};
ChatTerminalToolProgressPart = __decorate([
    __param(7, IInstantiationService),
    __param(8, ITerminalChatService),
    __param(9, ITerminalService),
    __param(10, IContextKeyService),
    __param(11, IChatWidgetService),
    __param(12, IKeybindingService),
    __param(13, IConfigurationService)
], ChatTerminalToolProgressPart);
export { ChatTerminalToolProgressPart };
/**
 * A component that displays terminal command output in an expandable/collapsible section.
 *
 * This component supports two modes of displaying output:
 * - **Live output**: Mirrors the output from a running terminal instance in real-time,
 *   supporting streaming updates, scroll-lock behavior, and user input forwarding.
 * - **Snapshot output**: Displays a static snapshot of previously captured terminal output,
 *   useful for serialized/restored chat sessions.
 *
 * Features:
 * - Automatic height calculation based on line count (min/max row limits)
 * - Scroll-lock behavior: stays at bottom during streaming, respects user scroll position
 * - Accessibility: proper ARIA labels and accessible view support
 * - Theme-aware background color that adapts to panel vs editor context
 */
let ChatTerminalToolOutputSection = class ChatTerminalToolOutputSection extends Disposable {
    get isExpanded() {
        return this.domNode.classList.contains('expanded');
    }
    get onDidFocus() { return this._onDidFocusEmitter.event; }
    get onDidBlur() { return this._onDidBlurEmitter.event; }
    constructor(_ensureTerminalInstance, _resolveCommand, _getTerminalCommandOutput, _getCommandText, _getStoredTheme, _hasTerminalSession, _accessibleViewService, _instantiationService, _terminalConfigurationService, _themeService, _contextKeyService) {
        super();
        this._ensureTerminalInstance = _ensureTerminalInstance;
        this._resolveCommand = _resolveCommand;
        this._getTerminalCommandOutput = _getTerminalCommandOutput;
        this._getCommandText = _getCommandText;
        this._getStoredTheme = _getStoredTheme;
        this._hasTerminalSession = _hasTerminalSession;
        this._accessibleViewService = _accessibleViewService;
        this._instantiationService = _instantiationService;
        this._terminalConfigurationService = _terminalConfigurationService;
        this._themeService = _themeService;
        this._contextKeyService = _contextKeyService;
        this._isAtBottom = true;
        this._isProgrammaticScroll = false;
        this._onDidFocusEmitter = this._register(new Emitter());
        this._onDidBlurEmitter = this._register(new Emitter());
        const containerElements = h('.chat-terminal-output-container@container', [
            h('.chat-terminal-output-body@body', [
                h('.chat-terminal-output-content@content', [
                    h('.chat-terminal-output-terminal@terminal'),
                    h('.chat-terminal-output-empty@empty')
                ])
            ])
        ]);
        this.domNode = containerElements.container;
        this.domNode.classList.add('collapsed');
        this._outputBody = containerElements.body;
        this._contentContainer = containerElements.content;
        this._terminalContainer = containerElements.terminal;
        this._emptyElement = containerElements.empty;
        this._contentContainer.appendChild(this._emptyElement);
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_IN, () => this._onDidFocusEmitter.fire()));
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_OUT, event => this._onDidBlurEmitter.fire(event)));
        const resizeObserver = new ResizeObserver(() => this._handleResize());
        resizeObserver.observe(this.domNode);
        this._register(toDisposable(() => resizeObserver.disconnect()));
        this._applyBackgroundColor();
        this._register(this._themeService.onDidColorThemeChange(() => this._applyBackgroundColor()));
    }
    async toggle(expanded) {
        const currentlyExpanded = this.isExpanded;
        if (expanded === currentlyExpanded) {
            if (expanded) {
                await this._updateTerminalContent();
            }
            return false;
        }
        if (!expanded) {
            this._setExpanded(false);
            this._isAtBottom = true;
            return true;
        }
        if (!this._scrollableContainer) {
            await this._createScrollableContainer();
        }
        await this._updateTerminalContent();
        // Only now show the expanded state (after content is ready)
        this._setExpanded(true);
        this._layoutOutput();
        this._scrollOutputToBottom();
        this._scheduleOutputRelayout();
        return true;
    }
    focus() {
        this._scrollableContainer?.getDomNode().focus();
    }
    containsElement(element) {
        return !!element && this.domNode.contains(element);
    }
    updateAriaLabel() {
        if (!this._scrollableContainer) {
            return;
        }
        const command = this._resolveCommand();
        const commandText = command?.command ?? this._getCommandText();
        if (!commandText) {
            return;
        }
        const ariaLabel = localize('chatTerminalOutputAriaLabel', 'Terminal output for {0}', commandText);
        const scrollableDomNode = this._scrollableContainer.getDomNode();
        scrollableDomNode.setAttribute('role', 'region');
        const accessibleViewHint = this._accessibleViewService.getOpenAriaHint("accessibility.verbosity.terminalChatOutput" /* AccessibilityVerbositySettingId.TerminalChatOutput */);
        const label = accessibleViewHint
            ? ariaLabel + ', ' + accessibleViewHint
            : ariaLabel;
        scrollableDomNode.setAttribute('aria-label', label);
    }
    getCommandAndOutputAsText() {
        const command = this._resolveCommand();
        const commandText = command?.command ?? this._getCommandText();
        if (!commandText) {
            return undefined;
        }
        const commandHeader = localize('chatTerminalOutputAccessibleViewHeader', 'Command: {0}', commandText);
        if (command) {
            const rawOutput = command.getOutput();
            if (!rawOutput || rawOutput.trim().length === 0) {
                return `${commandHeader}\n${localize('chat.terminalOutputEmpty', 'No output was produced by the command.')}`;
            }
            const lines = rawOutput.split('\n');
            return `${commandHeader}\n${lines.join('\n').trimEnd()}`;
        }
        const snapshot = this._getTerminalCommandOutput();
        if (!snapshot) {
            return `${commandHeader}\n${localize('chatTerminalOutputUnavailable', 'Command output is no longer available.')}`;
        }
        const plain = removeAnsiEscapeCodes((snapshot.text ?? ''));
        if (!plain.trim().length) {
            return `${commandHeader}\n${localize('chat.terminalOutputEmpty', 'No output was produced by the command.')}`;
        }
        let outputText = plain.trimEnd();
        if (snapshot.truncated) {
            outputText += `\n${localize('chatTerminalOutputTruncated', 'Output truncated.')}`;
        }
        return `${commandHeader}\n${outputText}`;
    }
    _setExpanded(expanded) {
        this.domNode.classList.toggle('expanded', expanded);
        this.domNode.classList.toggle('collapsed', !expanded);
    }
    async _createScrollableContainer() {
        this._scrollableContainer = this._register(new DomScrollableElement(this._outputBody, {
            vertical: 2 /* ScrollbarVisibility.Hidden */,
            horizontal: 2 /* ScrollbarVisibility.Hidden */,
            handleMouseWheel: true
        }));
        const scrollableDomNode = this._scrollableContainer.getDomNode();
        scrollableDomNode.tabIndex = 0;
        this.domNode.appendChild(scrollableDomNode);
        this.updateAriaLabel();
        // Show horizontal scrollbar on hover/focus, hide otherwise to prevent flickering during streaming
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_ENTER, () => {
            this._scrollableContainer?.updateOptions({ horizontal: 1 /* ScrollbarVisibility.Auto */ });
        }));
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_LEAVE, () => {
            this._scrollableContainer?.updateOptions({ horizontal: 2 /* ScrollbarVisibility.Hidden */ });
        }));
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_IN, () => {
            this._scrollableContainer?.updateOptions({ horizontal: 1 /* ScrollbarVisibility.Auto */ });
        }));
        this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_OUT, () => {
            this._scrollableContainer?.updateOptions({ horizontal: 2 /* ScrollbarVisibility.Hidden */ });
        }));
        // Track scroll state to enable scroll lock behavior (only for user scrolls)
        this._register(this._scrollableContainer.onScroll(() => {
            if (this._isProgrammaticScroll) {
                return;
            }
            this._isAtBottom = this._computeIsAtBottom();
        }));
    }
    async _updateTerminalContent() {
        const liveTerminalInstance = await this._resolveLiveTerminal();
        const command = liveTerminalInstance ? this._resolveCommand() : undefined;
        const snapshot = this._getTerminalCommandOutput();
        if (liveTerminalInstance && command) {
            const handled = await this._renderLiveOutput(liveTerminalInstance, command);
            if (handled) {
                return;
            }
        }
        this._disposeLiveMirror();
        if (snapshot) {
            await this._renderSnapshotOutput(snapshot);
            return;
        }
        if (!this._hasTerminalSession) {
            return;
        }
        this._renderUnavailableMessage(liveTerminalInstance);
    }
    async _renderLiveOutput(liveTerminalInstance, command) {
        if (this._mirror) {
            return true;
        }
        await liveTerminalInstance.xtermReadyPromise;
        if (this._store.isDisposed || liveTerminalInstance.isDisposed || !liveTerminalInstance.xterm) {
            this._disposeLiveMirror();
            return false;
        }
        const mirror = this._register(this._instantiationService.createInstance(DetachedTerminalCommandMirror, liveTerminalInstance.xterm, command));
        this._mirror = mirror;
        this._register(mirror.onDidUpdate(result => {
            // Hide empty message as soon as we get output
            if (result.lineCount && result.lineCount > 0) {
                this._hideEmptyMessage();
            }
            this._layoutOutput(result.lineCount);
            if (this._isAtBottom) {
                this._scrollOutputToBottom();
            }
        }));
        // Forward input from the mirror terminal to the live terminal instance
        this._register(mirror.onDidInput(data => {
            if (!liveTerminalInstance.isDisposed) {
                liveTerminalInstance.sendText(data, false);
            }
        }));
        await mirror.attach(this._terminalContainer);
        let result = await mirror.renderCommand();
        // Only show "No output" message if:
        // 1. Command has finished (has endMarker), AND
        // 2. There's no output after retrying
        // If command is still running, don't show the message - output may come later
        let commandFinished = !!command.endMarker;
        let hasOutput = result && result.lineCount && result.lineCount > 0;
        // If we got no output, poll until either output appears or command finishes
        // This handles cases where:
        // 1. Command is running but executedMarker isn't set yet (renderCommand returns undefined)
        // 2. Command finished quickly but buffer isn't ready yet
        if (!hasOutput) {
            for (let retry = 0; retry < MAX_OUTPUT_POLL_RETRIES && !hasOutput; retry++) {
                await timeout(OUTPUT_POLL_DELAY_MS);
                if (this._store.isDisposed) {
                    return true;
                }
                result = await mirror.renderCommand();
                hasOutput = result && result.lineCount && result.lineCount > 0;
                commandFinished = !!command.endMarker;
                // Stop polling if command finished (we'll show "no output" or output)
                if (commandFinished) {
                    break;
                }
            }
        }
        if (!hasOutput) {
            if (commandFinished) {
                this._showEmptyMessage(localize('chat.terminalOutputEmpty', 'No output was produced by the command.'));
            }
            // If command is still running, leave content empty but don't show "no output" message
        }
        else {
            this._hideEmptyMessage();
        }
        this._layoutOutput(result?.lineCount ?? 0);
        return true;
    }
    async _renderSnapshotOutput(snapshot) {
        if (this._snapshotMirror) {
            this._layoutOutput(snapshot.lineCount ?? this._lastRenderedLineCount ?? 0);
            return;
        }
        if (this._store.isDisposed) {
            return;
        }
        dom.clearNode(this._terminalContainer);
        this._snapshotMirror = this._register(this._instantiationService.createInstance(DetachedTerminalSnapshotMirror, snapshot, this._getStoredTheme));
        await this._snapshotMirror.attach(this._terminalContainer);
        this._snapshotMirror.setOutput(snapshot);
        const result = await this._snapshotMirror.render();
        const hasText = !!snapshot.text && snapshot.text.length > 0;
        if (hasText) {
            this._hideEmptyMessage();
        }
        else {
            this._showEmptyMessage(localize('chat.terminalOutputEmpty', 'No output was produced by the command.'));
        }
        const lineCount = result?.lineCount ?? snapshot.lineCount ?? 0;
        this._layoutOutput(lineCount);
    }
    _renderUnavailableMessage(liveTerminalInstance) {
        dom.clearNode(this._terminalContainer);
        this._lastRenderedLineCount = undefined;
        if (!liveTerminalInstance) {
            this._showEmptyMessage(localize('chat.terminalOutputTerminalMissing', 'Terminal is no longer available.'));
        }
        else {
            this._showEmptyMessage(localize('chat.terminalOutputCommandMissing', 'Command information is not available.'));
        }
    }
    async _resolveLiveTerminal() {
        const instance = await this._ensureTerminalInstance();
        return instance && !instance.isDisposed ? instance : undefined;
    }
    _showEmptyMessage(message) {
        this._emptyElement.textContent = message;
        this._terminalContainer.classList.add('chat-terminal-output-terminal-no-output');
        this.domNode.classList.add('chat-terminal-output-container-no-output');
    }
    _hideEmptyMessage() {
        this._emptyElement.textContent = '';
        this._terminalContainer.classList.remove('chat-terminal-output-terminal-no-output');
        this.domNode.classList.remove('chat-terminal-output-container-no-output');
    }
    _disposeLiveMirror() {
        if (this._mirror) {
            this._mirror.dispose();
            this._mirror = undefined;
        }
    }
    _scheduleOutputRelayout() {
        dom.getActiveWindow().requestAnimationFrame(() => {
            this._layoutOutput();
            this._scrollOutputToBottom();
        });
    }
    _handleResize() {
        if (!this._scrollableContainer) {
            return;
        }
        if (this.isExpanded) {
            this._layoutOutput();
            this._scrollOutputToBottom();
        }
        else {
            this._scrollableContainer.scanDomNode();
        }
    }
    _layoutOutput(lineCount) {
        if (!this._scrollableContainer) {
            return;
        }
        if (lineCount !== undefined) {
            this._lastRenderedLineCount = lineCount;
        }
        else {
            lineCount = this._lastRenderedLineCount;
        }
        this._scrollableContainer.scanDomNode();
        if (!this.isExpanded || lineCount === undefined) {
            return;
        }
        const scrollableDomNode = this._scrollableContainer.getDomNode();
        const rowHeight = this._computeRowHeightPx();
        const padding = this._getOutputPadding();
        const minHeight = rowHeight * MIN_OUTPUT_ROWS + padding;
        const maxHeight = rowHeight * MAX_OUTPUT_ROWS + padding;
        const contentHeight = this._getOutputContentHeight(lineCount, rowHeight, padding);
        const clampedHeight = Math.min(contentHeight, maxHeight);
        const measuredBodyHeight = Math.max(this._outputBody.clientHeight, minHeight);
        const appliedHeight = Math.min(clampedHeight, measuredBodyHeight);
        scrollableDomNode.style.height = appliedHeight < maxHeight ? `${appliedHeight}px` : '';
        this._scrollableContainer.scanDomNode();
    }
    _computeIsAtBottom() {
        if (!this._scrollableContainer) {
            return true;
        }
        const dimensions = this._scrollableContainer.getScrollDimensions();
        const scrollPosition = this._scrollableContainer.getScrollPosition();
        // Consider "at bottom" if within a small threshold to account for rounding
        const threshold = 5;
        return scrollPosition.scrollTop >= dimensions.scrollHeight - dimensions.height - threshold;
    }
    _scrollOutputToBottom() {
        if (!this._scrollableContainer) {
            return;
        }
        this._isProgrammaticScroll = true;
        const dimensions = this._scrollableContainer.getScrollDimensions();
        this._scrollableContainer.setScrollPosition({ scrollTop: dimensions.scrollHeight });
        this._isProgrammaticScroll = false;
    }
    _getOutputContentHeight(lineCount, rowHeight, padding) {
        const contentRows = Math.max(lineCount, MIN_OUTPUT_ROWS);
        // Always add an extra row for buffer space to prevent the last line from being cut off during streaming
        const adjustedRows = contentRows + 1;
        return (adjustedRows * rowHeight) + padding;
    }
    _getOutputPadding() {
        const style = dom.getComputedStyle(this._outputBody);
        const paddingTop = Number.parseFloat(style.paddingTop || '0');
        const paddingBottom = Number.parseFloat(style.paddingBottom || '0');
        return paddingTop + paddingBottom;
    }
    _computeRowHeightPx() {
        const window = dom.getActiveWindow();
        const font = this._terminalConfigurationService.getFont(window);
        const hasCharHeight = isNumber(font.charHeight) && font.charHeight > 0;
        const hasFontSize = isNumber(font.fontSize) && font.fontSize > 0;
        const hasLineHeight = isNumber(font.lineHeight) && font.lineHeight > 0;
        const charHeight = (hasCharHeight ? font.charHeight : (hasFontSize ? font.fontSize : 1)) ?? 1;
        const lineHeight = hasLineHeight ? font.lineHeight : 1;
        const rowHeight = Math.ceil(charHeight * lineHeight);
        return Math.max(rowHeight, 1);
    }
    _applyBackgroundColor() {
        const theme = this._themeService.getColorTheme();
        const isInEditor = ChatContextKeys.inChatEditor.getValue(this._contextKeyService);
        const backgroundColor = theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
        if (backgroundColor) {
            this.domNode.style.backgroundColor = backgroundColor.toString();
        }
    }
};
ChatTerminalToolOutputSection = __decorate([
    __param(6, IAccessibleViewService),
    __param(7, IInstantiationService),
    __param(8, ITerminalConfigurationService),
    __param(9, IThemeService),
    __param(10, IContextKeyService)
], ChatTerminalToolOutputSection);
let ToggleChatTerminalOutputAction = class ToggleChatTerminalOutputAction extends Action {
    constructor(_toggle, _keybindingService, _telemetryService) {
        super("workbench.action.terminal.chat.toggleChatTerminalOutput" /* TerminalContribCommandId.ToggleChatTerminalOutput */, localize('showTerminalOutput', 'Show Output'), ThemeIcon.asClassName(Codicon.chevronRight), true);
        this._toggle = _toggle;
        this._keybindingService = _keybindingService;
        this._telemetryService = _telemetryService;
        this._expanded = false;
        this._updateTooltip();
    }
    async run() {
        this._telemetryService.publicLog2('terminal/chatToggleOutput', {
            previousExpanded: this._expanded
        });
        await this._toggle();
    }
    syncPresentation(expanded) {
        this._expanded = expanded;
        this._updatePresentation();
        this._updateTooltip();
    }
    refreshKeybindingTooltip() {
        this._updateTooltip();
    }
    _updatePresentation() {
        if (this._expanded) {
            this.label = localize('hideTerminalOutput', 'Hide Output');
            this.class = ThemeIcon.asClassName(Codicon.chevronDown);
        }
        else {
            this.label = localize('showTerminalOutput', 'Show Output');
            this.class = ThemeIcon.asClassName(Codicon.chevronRight);
        }
    }
    _updateTooltip() {
        this.tooltip = this._keybindingService.appendKeybinding(this.label, "workbench.action.terminal.chat.focusMostRecentChatTerminalOutput" /* TerminalContribCommandId.FocusMostRecentChatTerminalOutput */);
    }
};
ToggleChatTerminalOutputAction = __decorate([
    __param(1, IKeybindingService),
    __param(2, ITelemetryService)
], ToggleChatTerminalOutputAction);
export { ToggleChatTerminalOutputAction };
let FocusChatInstanceAction = class FocusChatInstanceAction extends Action {
    constructor(_instance, _command, _commandUri, _commandId, isTerminalHidden, _terminalService, _terminalEditorService, _terminalGroupService, _keybindingService, _telemetryService) {
        super("workbench.action.terminal.chat.focusChatInstance" /* TerminalContribCommandId.FocusChatInstanceAction */, isTerminalHidden ? localize('showTerminal', 'Show and Focus Terminal') : localize('focusTerminal', 'Focus Terminal'), ThemeIcon.asClassName(Codicon.openInProduct), true);
        this._instance = _instance;
        this._command = _command;
        this._commandUri = _commandUri;
        this._commandId = _commandId;
        this._terminalService = _terminalService;
        this._terminalEditorService = _terminalEditorService;
        this._terminalGroupService = _terminalGroupService;
        this._keybindingService = _keybindingService;
        this._telemetryService = _telemetryService;
        this._updateTooltip();
    }
    async run() {
        this.label = this._instance?.shellLaunchConfig.hideFromUser ? localize('showAndFocusTerminal', 'Show and Focus Terminal') : localize('focusTerminal', 'Focus Terminal');
        this._updateTooltip();
        let target = 'none';
        let location = 'panel';
        if (this._instance) {
            target = 'instance';
            location = this._instance.target === TerminalLocation.Editor ? 'editor' : 'panel';
        }
        else if (this._commandUri) {
            target = 'commandUri';
        }
        this._telemetryService.publicLog2('terminal/chatFocusInstance', {
            target,
            location
        });
        if (this._instance) {
            this._terminalService.setActiveInstance(this._instance);
            if (this._instance.target === TerminalLocation.Editor) {
                this._terminalEditorService.openEditor(this._instance);
            }
            else {
                await this._terminalGroupService.showPanel(true);
            }
            this._terminalService.setActiveInstance(this._instance);
            await this._instance.focusWhenReady(true);
            const command = this._resolveCommand();
            if (command) {
                this._instance.xterm?.markTracker.revealCommand(command);
            }
            return;
        }
        if (this._commandUri) {
            this._terminalService.openResource(this._commandUri);
        }
    }
    refreshKeybindingTooltip() {
        this._updateTooltip();
    }
    _resolveCommand() {
        if (this._command && !this._command.endMarker?.isDisposed) {
            return this._command;
        }
        if (!this._instance || !this._commandId) {
            return this._command;
        }
        const commandDetection = this._instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        const resolved = commandDetection?.commands.find(c => c.id === this._commandId);
        if (resolved) {
            this._command = resolved;
        }
        return this._command;
    }
    _updateTooltip() {
        this.tooltip = this._keybindingService.appendKeybinding(this.label, "workbench.action.terminal.chat.focusMostRecentChatTerminal" /* TerminalContribCommandId.FocusMostRecentChatTerminal */);
    }
};
FocusChatInstanceAction = __decorate([
    __param(5, ITerminalService),
    __param(6, ITerminalEditorService),
    __param(7, ITerminalGroupService),
    __param(8, IKeybindingService),
    __param(9, ITelemetryService)
], FocusChatInstanceAction);
export { FocusChatInstanceAction };
let ContinueInBackgroundAction = class ContinueInBackgroundAction extends Action {
    constructor(_terminalToolSessionId, _terminalChatService) {
        super("workbench.action.terminal.chat.continueInBackground" /* TerminalContribCommandId.ContinueInBackground */, localize('continueInBackground', 'Continue in Background'), ThemeIcon.asClassName(Codicon.debugContinue), true);
        this._terminalToolSessionId = _terminalToolSessionId;
        this._terminalChatService = _terminalChatService;
    }
    async run() {
        this._terminalChatService.continueInBackground(this._terminalToolSessionId);
    }
};
ContinueInBackgroundAction = __decorate([
    __param(1, ITerminalChatService)
], ContinueInBackgroundAction);
export { ContinueInBackgroundAction };
let ChatTerminalThinkingCollapsibleWrapper = class ChatTerminalThinkingCollapsibleWrapper extends ChatCollapsibleContentPart {
    constructor(commandText, isSandboxWrapped, contentElement, context, initialExpanded, isComplete, hoverService, configurationService) {
        const title = isComplete
            ? localize('chat.terminal.ran.plain', "Ran {0}", commandText)
            : localize('chat.terminal.running.plain', "Running {0}", commandText);
        super(title, context, undefined, hoverService, configurationService);
        this._terminalContentElement = contentElement;
        this._commandText = commandText;
        this._isSandboxWrapped = isSandboxWrapped;
        this._isComplete = isComplete;
        this.domNode.classList.add('chat-terminal-thinking-collapsible');
        if (isComplete) {
            this.icon = Codicon.check;
        }
        this._setCodeFormattedTitle();
        this.setExpanded(initialExpanded);
    }
    _setCodeFormattedTitle() {
        if (!this._collapseButton) {
            return;
        }
        const labelElement = this._collapseButton.labelElement;
        labelElement.textContent = '';
        if (this._isSandboxWrapped) {
            const prefixText = this._isComplete
                ? localize('chat.terminal.ranInSandbox.prefix', "Ran ")
                : localize('chat.terminal.runningInSandbox.prefix', "Running ");
            const suffixText = localize('chat.terminal.sandbox.suffix', " in sandbox");
            labelElement.appendChild(document.createTextNode(prefixText));
            const codeElement = document.createElement('code');
            codeElement.textContent = this._commandText;
            labelElement.appendChild(codeElement);
            labelElement.appendChild(document.createTextNode(suffixText));
            return;
        }
        const prefixText = this._isComplete
            ? localize('chat.terminal.ran.prefix', "Ran ")
            : localize('chat.terminal.running.prefix', "Running ");
        const ranText = document.createTextNode(prefixText);
        const codeElement = document.createElement('code');
        codeElement.textContent = this._commandText;
        labelElement.appendChild(ranText);
        labelElement.appendChild(codeElement);
    }
    markComplete() {
        if (this._isComplete) {
            return;
        }
        this._isComplete = true;
        this.icon = Codicon.check;
        this._setCodeFormattedTitle();
    }
    initContent() {
        const listWrapper = dom.$('.chat-used-context-list.chat-terminal-thinking-content');
        listWrapper.appendChild(this._terminalContentElement);
        return listWrapper;
    }
    expand() {
        this.setExpanded(true);
    }
    hasSameContent(_other, _followingContent, _element) {
        return false;
    }
};
ChatTerminalThinkingCollapsibleWrapper = __decorate([
    __param(6, IHoverService),
    __param(7, IConfigurationService)
], ChatTerminalThinkingCollapsibleWrapper);
export { ChatTerminalThinkingCollapsibleWrapper };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbkYsT0FBTyxFQUFFLG1CQUFtQixFQUE4SSxNQUFNLCtDQUErQyxDQUFDO0FBQ2hPLE9BQU8sRUFBb0Msa0JBQWtCLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN4RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUVsRSxPQUFPLEVBQUUsdUJBQXVCLEVBQXdDLE1BQU0sK0JBQStCLENBQUM7QUFDOUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDcEUsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFeEUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0UsT0FBTyxFQUFFLDRDQUE0QyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDekcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFOUUsT0FBTywyQ0FBMkMsQ0FBQztBQUVuRCxPQUFPLEVBQUUsTUFBTSxFQUFXLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBaUMsb0JBQW9CLEVBQUUsNkJBQTZCLEVBQUUsc0JBQXNCLEVBQUUscUJBQXFCLEVBQXFCLGdCQUFnQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDck8sT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFvQixNQUFNLCtDQUErQyxDQUFDO0FBQy9JLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzFFLE9BQU8sRUFBc0IsaUNBQWlDLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUN2SyxPQUFPLEtBQUssR0FBRyxNQUFNLDBDQUEwQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRTNHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUd2RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUMvRyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUVoSCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFaEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDbkcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLDhCQUE4QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDN0ksT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDN0YsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUMvRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFM0Y7O0dBRUc7QUFDSCxNQUFNLGVBQWUsR0FBRyxDQUFDLENBQUM7QUFFMUI7O0dBRUc7QUFDSCxNQUFNLGVBQWUsR0FBRyxFQUFFLENBQUM7QUFFM0I7O0dBRUc7QUFDSCxNQUFNLHdCQUF3QixHQUFHLEVBQUUsQ0FBQztBQUVwQzs7R0FFRztBQUNILE1BQU0sdUJBQXVCLEdBQUcsRUFBRSxDQUFDO0FBRW5DOztHQUVHO0FBQ0gsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUM7QUFFakM7O0dBRUc7QUFDSCxNQUFNLCtCQUErQixHQUFHLENBQUMsQ0FBQztBQUUxQzs7R0FFRztBQUNILE1BQU0seUJBQXlCLEdBQUcsSUFBSSxPQUFPLEVBQWdFLENBQUM7QUFpQzlHLElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQTBCLFNBQVEsVUFBVTtJQUlqRCxZQUNrQixRQUEyQyxFQUM1QixhQUE0QjtRQUU1RCxLQUFLLEVBQUUsQ0FBQztRQUhTLGFBQVEsR0FBUixRQUFRLENBQW1DO1FBQzVCLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBRzVELE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxDQUFDLGtEQUFrRCxFQUFFLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRyxJQUFJLENBQUMsUUFBUSxHQUFHLGtCQUFrQixDQUFDLFVBQVUsQ0FBQztRQUM5QyxJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRU8seUJBQXlCO1FBQ2hDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDbEQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUNqQyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsSUFBSSxVQUFVLENBQUMsYUFBYSxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3ZFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDNUMsSUFBSSxJQUFJLElBQUksSUFBSSxDQUFDLGFBQWEsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDOUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsU0FBUyxDQUFDLFlBQVksQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLGlCQUFpQixJQUFJLElBQUksQ0FBQyxDQUFDO1lBQ3pFLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3RFLE9BQU8sRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFO1NBQzdCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxJQUFJLENBQUMsMEJBQTBCLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVPLGFBQWE7UUFDcEIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQ25ELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLG9CQUFvQixDQUFDO1FBQ3BFLE9BQU8sbUNBQW1DLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN4RSxDQUFDO0lBRU0sTUFBTSxDQUFDLE9BQTBCO1FBQ3ZDLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDakMsTUFBTSxlQUFlLEdBQUcsT0FBTyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUN0RSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRU8sTUFBTSxDQUFDLFVBQXVCLEVBQUUsT0FBcUM7UUFDNUUsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUM7UUFDaEQsSUFBSSxXQUFXLEdBQUcsWUFBWSxDQUFDLG9CQUFvQixDQUFDO1FBRXBELElBQUksT0FBTyxFQUFFLENBQUM7WUFDYixNQUFNLGFBQWEsR0FBRyxZQUFZLENBQUMsb0JBQW9CLElBQUksRUFBRSxDQUFDO1lBQzlELFlBQVksQ0FBQyxvQkFBb0IsR0FBRztnQkFDbkMsR0FBRyxhQUFhO2dCQUNoQixRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVE7Z0JBQzFCLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxJQUFJLGFBQWEsQ0FBQyxTQUFTO2dCQUN2RCxRQUFRLEVBQUUsT0FBTyxDQUFDLFFBQVEsSUFBSSxhQUFhLENBQUMsUUFBUTthQUNwRCxDQUFDO1lBQ0YsV0FBVyxHQUFHLFlBQVksQ0FBQyxvQkFBb0IsQ0FBQztRQUNqRCxDQUFDO2FBQU0sSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUN2QixZQUFZLENBQUMsb0JBQW9CLEdBQUcsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQztZQUM1RSxXQUFXLEdBQUcsWUFBWSxDQUFDLG9CQUFvQixDQUFDO1FBQ2pELENBQUM7UUFFRCxNQUFNLGVBQWUsR0FBRyxpQ0FBaUMsQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDaEYsTUFBTSxPQUFPLEdBQUcsbUNBQW1DLENBQUMsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTFFLFVBQVUsQ0FBQyxTQUFTLEdBQUcsb0NBQW9DLHdFQUFvQyxFQUFFLENBQUM7UUFDbEcsVUFBVSxDQUFDLFNBQVMsQ0FBQyxHQUFHLDRDQUE0QixDQUFDO1FBQ3JELEtBQUssTUFBTSxTQUFTLElBQUksZUFBZSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3BELFVBQVUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFDRCxVQUFVLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM5RSxNQUFNLGFBQWEsR0FBRyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsUUFBUSw0Q0FBNEIsQ0FBQztRQUNqRixVQUFVLENBQUMsUUFBUSxHQUFHLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3QyxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQ25CLFVBQVUsQ0FBQyxlQUFlLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDN0MsQ0FBQzthQUFNLENBQUM7WUFDUCxVQUFVLENBQUMsWUFBWSxDQUFDLGVBQWUsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNsRCxDQUFDO1FBQ0QsTUFBTSxTQUFTLEdBQUcsT0FBTyxJQUFJLGVBQWUsQ0FBQyxZQUFZLENBQUM7UUFDMUQsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNmLFVBQVUsQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ2xELENBQUM7YUFBTSxDQUFDO1lBQ1AsVUFBVSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMxQyxDQUFDO0lBQ0YsQ0FBQztJQUVPLDBCQUEwQixDQUFDLFVBQXVCO1FBQ3pELElBQUksSUFBSSxDQUFDLG1CQUFtQixLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQzdDLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLG1CQUFtQixHQUFHLFVBQVUsQ0FBQztJQUN2QyxDQUFDO0NBQ0QsQ0FBQTtBQWxHSyx5QkFBeUI7SUFNNUIsV0FBQSxhQUFhLENBQUE7R0FOVix5QkFBeUIsQ0FrRzlCO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtCRztBQUNJLElBQU0sNEJBQTRCLEdBQWxDLE1BQU0sNEJBQTZCLFNBQVEsNkJBQTZCO0lBK0I5RSxJQUFXLFVBQVU7UUFDcEIsT0FBTyxJQUFJLENBQUMsWUFBWSxFQUFFLFVBQVUsSUFBSSxFQUFFLENBQUM7SUFDNUMsQ0FBQztJQUVELElBQVcsWUFBWTtRQUN0QixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDM0IsQ0FBQztJQUVELElBQVcsWUFBWTtRQUN0QixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUM7SUFDM0IsQ0FBQztJQUVELFlBQ0MsY0FBbUUsRUFDbkUsWUFBcUYsRUFDckYsT0FBc0MsRUFDdEMsUUFBMkIsRUFDM0IsVUFBc0IsRUFDdEIsb0JBQWtDLEVBQ2xDLG1CQUEyQixFQUNKLHFCQUE2RCxFQUM5RCxvQkFBMkQsRUFDL0QsZ0JBQW1ELEVBQ2pELGtCQUF1RCxFQUN2RCxrQkFBdUQsRUFDdkQsa0JBQXVELEVBQ3BELHFCQUE2RDtRQUVwRixLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFSa0IsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUM3Qyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXNCO1FBQzlDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBa0I7UUFDaEMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0Qyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3RDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDbkMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQTVDcEUsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFrQyxDQUFDLENBQUM7UUFDckcsMkJBQXNCLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLGlCQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUEyQixDQUFDLENBQUM7UUFDaEYsZ0NBQTJCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUE4QixDQUFDLENBQUM7UUFTM0csdUJBQWtCLEdBQVksS0FBSyxDQUFDO1FBQ3BDLDJCQUFzQixHQUFZLEtBQUssQ0FBQztRQUN4Qyw0QkFBdUIsR0FBWSxLQUFLLENBQUM7UUFrQ2hELElBQUksQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQztRQUMxQyxJQUFJLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUM7UUFDMUMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDO1FBRXhELFlBQVksR0FBRyxxQ0FBcUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQztRQUNsQyxJQUFJLENBQUMsbUJBQW1CLEdBQUcsWUFBWSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDckgsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDckosSUFBSSxDQUFDLHVCQUF1QixHQUFHLENBQUMsY0FBYyxDQUFDLElBQUksS0FBSywwQkFBMEIsQ0FBQyxDQUFDO1FBRXBGLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyx1Q0FBdUMsRUFBRTtZQUMzRCxDQUFDLENBQUMsb0NBQW9DLEVBQUU7Z0JBQ3ZDLENBQUMsQ0FBQywyQ0FBMkMsQ0FBQzthQUM5QyxDQUFDO1lBQ0YsQ0FBQyxDQUFDLHdDQUF3QyxDQUFDO1NBQzNDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxhQUFhLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztRQUVwQyxNQUFNLE9BQU8sR0FBRyxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsVUFBVSxJQUFJLFlBQVksQ0FBQyxXQUFXLENBQUMsVUFBVSxJQUFJLFlBQVksQ0FBQyxXQUFXLENBQUMsVUFBVSxJQUFJLFlBQVksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDckwsSUFBSSxDQUFDLFlBQVksR0FBRyxPQUFPLENBQUM7UUFDNUIsSUFBSSxDQUFDLHlCQUF5QixHQUFHLGVBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFFMUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMseUJBQXlCLEVBQUU7WUFDdEcsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ2hDLGVBQWUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsWUFBWTtZQUM1QyxjQUFjLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztZQUMvQixrQkFBa0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLEVBQUU7U0FDcEQsQ0FBQyxDQUFDLENBQUM7UUFFSiw0R0FBNEc7UUFDNUcsTUFBTSxjQUFjLEdBQUcsWUFBWSxDQUFDLHFCQUFxQixFQUFFLFdBQVcsSUFBSSxPQUFPLENBQUM7UUFDbEYsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDLHFCQUFxQixFQUFFLFFBQVEsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDO1FBQzlGLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUNwRSxrQkFBa0IsRUFDbEIsUUFBUSxDQUFDLFlBQVksRUFDckIsSUFBSSxjQUFjLENBQUM7WUFDbEIsU0FBUyxlQUFlLEVBQUU7WUFDMUIsR0FBRyxjQUFjLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsRUFBRTtZQUNsRCxRQUFRO1NBQ1IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUMxQyxTQUFTLENBQ1QsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFO1lBQy9DLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDM0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUMxRSw2QkFBNkIsRUFDN0IsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEVBQ3BDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxFQUNoQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixFQUM5QyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUN2QixHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFDdEMsQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLENBQzFDLENBQUMsQ0FBQztRQUNILGlGQUFpRjtRQUNqRiw0RUFBNEU7UUFDNUUsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUMxRixRQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFDRCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3RSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLHNCQUFzQixDQUFDLEdBQUcsRUFBRTtZQUNsRSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSx3QkFBd0IsRUFBRSxDQUFDO1lBQ3BELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBR0osTUFBTSxXQUFXLEdBQUcsQ0FBQyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7UUFDN0QsUUFBUSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUMsQ0FBQztRQUNsRixJQUFJLGdCQUFvQyxDQUFDO1FBQ3pDLElBQUksY0FBYyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDckMsZ0JBQWdCLEdBQUcsR0FBRyxPQUFPLGNBQWMsQ0FBQyxnQkFBZ0IsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3ZKLENBQUM7UUFDRCxNQUFNLGVBQWUsR0FBRyxJQUFJLGNBQWMsQ0FBQyxnQkFBZ0IsRUFBRTtZQUM1RCxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsS0FBSztTQUNoSCxDQUFDLENBQUM7UUFDSCxNQUFNLG1CQUFtQixHQUF5QjtZQUNqRCxJQUFJLEVBQUUsaUJBQWlCO1lBQ3ZCLE9BQU8sRUFBRSxlQUFlO1NBQ3hCLENBQUM7UUFFRixNQUFNLHNCQUFzQixHQUE0QjtZQUN2RCxXQUFXLEVBQUUsSUFBSTtZQUNqQixZQUFZLEVBQUUsRUFBRTtZQUNoQixlQUFlLEVBQUUsQ0FBQztZQUNsQixhQUFhLEVBQUU7Z0JBQ2QsUUFBUSxFQUFFLElBQUk7YUFDZDtTQUNELENBQUM7UUFFRixNQUFNLGVBQWUsR0FBb0M7WUFDeEQsc0JBQXNCO1lBQ3RCLG9CQUFvQixFQUFFLGdCQUFnQixDQUFDLENBQUMsQ0FBQztnQkFDeEMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLGdCQUFnQixDQUFDLENBQUM7YUFDbkYsQ0FBQyxDQUFDLENBQUMsU0FBUztTQUNiLENBQUM7UUFFRixJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsb0JBQW9CLEVBQUUsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBRS9OLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbkQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7UUFDakssSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUUxQixxRUFBcUU7UUFDckUsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFVLGlCQUFpQixDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDeEgsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFVLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDbkgsTUFBTSxvQkFBb0IsR0FBRyxjQUFjLENBQUMsSUFBSSxLQUFLLGdCQUFnQixJQUFJLG1CQUFtQixDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3JJLElBQUksQ0FBQyxzQkFBc0IsR0FBRyx1QkFBdUIsSUFBSSxDQUFDLG9CQUFvQixDQUFDO1FBQy9FLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUMsc0JBQXNCLElBQUksZ0JBQWdCLENBQUM7UUFFL0UsSUFBSSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDOUcsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsT0FBTyxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUM7UUFDckMsQ0FBQztRQUVELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUVwRSwyRUFBMkU7UUFDM0UsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQztRQUM3RCxJQUFJLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsSUFBSSxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLElBQUksZUFBZSxDQUFDLEVBQUUsQ0FBQztZQUN6SixLQUFLLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUNELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVEOzs7O09BSUc7SUFDSyxpQkFBaUIsQ0FBQyxjQUFtRSxFQUFFLE9BQXNDLEVBQUUsY0FBMkI7UUFDakssTUFBTSxZQUFZLEdBQUcsR0FBRyxFQUFFO1lBQ3pCLE1BQU0sU0FBUyxHQUFHLDRDQUE0QyxDQUFDLGNBQWMsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ2hILE1BQU0sVUFBVSxHQUFpQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDdEUsSUFBSSxFQUFFLE1BQU07Z0JBQ1osS0FBSyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTTtnQkFDdEIsUUFBUSxFQUFFLEdBQUcsQ0FBQyxRQUFRO2dCQUN0QixHQUFHLEVBQUUsR0FBRyxDQUFDLEdBQUc7YUFDWixDQUFDLENBQUMsQ0FBQztZQUNKLElBQUksVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDN0IsT0FBTztZQUNSLENBQUM7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUU5RyxJQUFJLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO2dCQUN0Qyw0RUFBNEU7Z0JBQzVFLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQztnQkFDakQsTUFBTSxXQUFXLEdBQUcsQ0FBQyxRQUFpQixFQUFFLEVBQUU7b0JBQ3pDLElBQUksUUFBUSxFQUFFLENBQUM7d0JBQ2QsY0FBYyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQzVDLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxPQUFPLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7b0JBQzdDLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDO2dCQUNGLFdBQVcsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO29CQUMvQixXQUFXLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDNUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNMLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxjQUFjLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM1QyxDQUFDO1FBQ0YsQ0FBQyxDQUFDO1FBRUYsSUFBSSxjQUFjLENBQUMsSUFBSSxLQUFLLDBCQUEwQixFQUFFLENBQUM7WUFDeEQsWUFBWSxFQUFFLENBQUM7UUFDaEIsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDL0IsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2hELElBQUksS0FBSyxDQUFDLElBQUksb0RBQTRDLEVBQUUsQ0FBQztvQkFDNUQsWUFBWSxFQUFFLENBQUM7Z0JBQ2hCLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztJQUNGLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxjQUEyQixFQUFFLFdBQW1CLEVBQUUsY0FBbUUsRUFBRSxPQUFzQztRQUM5TCxxQ0FBcUM7UUFDckMsTUFBTSxnQkFBZ0IsR0FBRyxXQUFXLENBQUMsTUFBTSxHQUFHLHdCQUF3QjtZQUNyRSxDQUFDLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsd0JBQXdCLENBQUMsR0FBRyxLQUFLO1lBQzVELENBQUMsQ0FBQyxXQUFXLENBQUM7UUFFZixNQUFNLFVBQVUsR0FBRyxtQkFBbUIsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbEUsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFVLGlCQUFpQixDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDbEgsTUFBTSxRQUFRLEdBQUcsa0JBQWtCLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLEtBQUssU0FBUyxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsb0JBQW9CLENBQUMsUUFBUSxLQUFLLENBQUMsQ0FBQztRQUNqSyxNQUFNLGVBQWUsR0FBRyxDQUFDLFVBQVUsSUFBSSxRQUFRLENBQUM7UUFFaEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUN2RSxzQ0FBc0MsRUFDdEMsZ0JBQWdCLEVBQ2hCLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLGdCQUFnQixLQUFLLElBQUksRUFDeEQsY0FBYyxFQUNkLE9BQU8sRUFDUCxlQUFlLEVBQ2YsVUFBVSxDQUNWLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQywyQkFBMkIsR0FBRyxPQUFPLENBQUM7UUFFM0MsK0RBQStEO1FBQy9ELDhEQUE4RDtRQUM5RCxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDdEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDMUIsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUMsSUFBSSxVQUFVLEVBQUUsQ0FBQztnQkFDaEIsVUFBVSxHQUFHLEtBQUssQ0FBQztnQkFDbkIsT0FBTztZQUNSLENBQUM7WUFDRCxJQUFJLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUM7SUFDeEIsQ0FBQztJQUVNLHdCQUF3QjtRQUM5QixJQUFJLENBQUMsMkJBQTJCLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDNUMsQ0FBQztJQUVNLDhCQUE4QjtRQUNwQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsWUFBWSxFQUFFLENBQUM7SUFDbEQsQ0FBQztJQUVPLEtBQUssQ0FBQywwQkFBMEI7UUFDdkMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQzVCLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDO1FBQ3ZFLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNuQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLEtBQUssRUFBRSxRQUF1QyxFQUFFLEVBQUU7WUFDeEUsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUM1QixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDZixJQUFJLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO29CQUNsQyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztnQkFDakMsQ0FBQztnQkFDRCxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO2dCQUNuRCxPQUFPO1lBQ1IsQ0FBQztZQUNELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsS0FBSyxRQUFRLENBQUM7WUFDMUQsSUFBSSxhQUFhLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQztnQkFDbEMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzFDLENBQUM7WUFDRCx3RkFBd0Y7WUFDeEYsK0RBQStEO1lBQy9ELElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLHFCQUFxQixDQUFDLENBQUM7UUFDbkQsQ0FBQyxDQUFDO1FBRUYsTUFBTSxlQUFlLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsa0NBQWtDLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUNsSCxNQUFNLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUV0QyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUscUJBQXFCLENBQUMsQ0FBQztRQUNwRCxDQUFDO1FBRUQsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQzVCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyw0Q0FBNEMsQ0FBQyxLQUFLLEVBQUMsUUFBUSxFQUFDLEVBQUU7Z0JBQ3hHLE1BQU0sa0JBQWtCLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsa0NBQWtDLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDckgsSUFBSSxRQUFRLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztvQkFDckMsT0FBTztnQkFDUixDQUFDO2dCQUNELElBQUksQ0FBQyw0QkFBNEIsRUFBRSxPQUFPLEVBQUUsQ0FBQztnQkFDN0MsSUFBSSxDQUFDLDRCQUE0QixHQUFHLFNBQVMsQ0FBQztnQkFDOUMsTUFBTSxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDaEMsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLENBQUMsNEJBQTRCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUVELHlEQUF5RDtRQUN6RCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMseUJBQXlCLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDL0UsSUFBSSxTQUFTLEtBQUsscUJBQXFCLEVBQUUsQ0FBQztnQkFDekMsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxDQUFDO1lBQzFDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLFdBQVcsQ0FBQyxnQkFBb0MsRUFBRSxxQkFBOEI7UUFDdkYsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQzVCLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUNsQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUMxQixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUVuRSxJQUFJLENBQUMsaUNBQWlDLEVBQUUsQ0FBQztRQUN6QyxJQUFJLGdCQUFnQixFQUFFLENBQUM7WUFDdEIsTUFBTSxnQkFBZ0IsR0FBRyxnQkFBZ0IsSUFBSSxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztZQUNuSixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLGdCQUFnQixFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLGdCQUFnQixDQUFDLENBQUM7WUFDN0wsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDO1lBQ3RDLFNBQVMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXBFLDJGQUEyRjtZQUMzRiwyR0FBMkc7WUFDM0csbURBQW1EO1lBQ25ELElBQUkscUJBQXFCLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDOUcsTUFBTSxjQUFjLEdBQUcsZUFBZSxFQUFFLFFBQVEsS0FBSyxTQUFTLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsRUFBRSxRQUFRLEtBQUssU0FBUyxDQUFDO2dCQUNsSSxJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNwQixNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLDBCQUEwQixFQUFFLHFCQUFxQixDQUFDLENBQUM7b0JBQ3BILElBQUksQ0FBQywyQkFBMkIsQ0FBQyxLQUFLLEdBQUcsY0FBYyxDQUFDO29CQUN4RCxTQUFTLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDeEUsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTyxtQkFBbUIsQ0FBQyxRQUE0QjtRQUN2RCxNQUFNLE1BQU0sR0FBRyxRQUFRLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDO1FBQ2xELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVPLHVCQUF1QixDQUFDLE9BQTBCO1FBQ3pELElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUM1QixPQUFPO1FBQ1IsQ0FBQztRQUNELDRFQUE0RTtRQUM1RSxJQUFJLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1lBQ2xDLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxlQUFlLEdBQUcsT0FBTyxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQzlELE1BQU0sV0FBVyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDO1FBQy9ELElBQUksQ0FBQyxlQUFlLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QyxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQztRQUNwRCxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUN2QixnQkFBZ0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLDhCQUE4QixFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLENBQUM7WUFDbkksSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQztZQUNoRCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQVUsaUJBQWlCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUNsSCxNQUFNLFFBQVEsR0FBRyxlQUFlLEVBQUUsUUFBUSxJQUFJLElBQUksQ0FBQyxhQUFhLENBQUMsb0JBQW9CLEVBQUUsUUFBUSxDQUFDO1lBQ2hHLElBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxRQUFRLEtBQUssQ0FBQyxJQUFJLGtCQUFrQixFQUFFLENBQUM7Z0JBQ3BFLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNGLENBQUM7UUFDRCxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRS9ELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDbEMsSUFBSSxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUNqQyxNQUFNLGFBQWEsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssZ0JBQWdCLENBQUMsQ0FBQztZQUM5RixJQUFJLGFBQWEsSUFBSSxDQUFDLElBQUksYUFBYSxLQUFLLFNBQVMsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDcEUsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDOUIsSUFBSSxDQUFDLHNCQUFzQixHQUFHLEtBQUssQ0FBQztZQUNyQyxDQUFDO2lCQUFNLElBQUksYUFBYSxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUMvQixPQUFPO1lBQ1IsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1lBQ2pDLE9BQU87UUFDUixDQUFDO1FBQ0QsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ2pFLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUM7SUFDcEMsQ0FBQztJQUVPLHdCQUF3QixDQUFDLE9BQTJDO1FBQzNFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxTQUFTLENBQUM7UUFDckMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFNBQVMsQ0FBQztRQUNsQyxJQUFJLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxDQUFDO1lBQ2xDLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUMzQyxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUM7WUFDOUMsQ0FBQztZQUNELElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO2dCQUM5QyxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLENBQUM7WUFDakQsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0ssaUJBQWlCO1FBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVU7WUFDbEMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCO1lBQ3hCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVO1lBQ3ZCLENBQUMseUJBQXlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQ7Ozs7Ozs7O09BUUc7SUFDSyx5QkFBeUIsQ0FBQyxnQkFBbUM7UUFDcEUsTUFBTSx3QkFBd0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksaUJBQWlCLEVBQWUsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0saUJBQWlCLEdBQUcsS0FBSyxJQUEyQyxFQUFFO1lBQzNFLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUMvRCxJQUFJLENBQUMsV0FBVyxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUM3RSxPQUFPLGVBQWUsQ0FBQztRQUN4QixDQUFDLENBQUM7UUFFRixNQUFNLHNCQUFzQixHQUFHLEtBQUssRUFBRSxnQkFBeUQsRUFBRSxFQUFFO1lBQ2xHLHdCQUF3QixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN2QixNQUFNLGlCQUFpQixFQUFFLENBQUM7Z0JBQzFCLE9BQU87WUFDUixDQUFDO1lBRUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNwQyxJQUFJLGlCQUFpQixHQUFHLENBQUMsQ0FBQztZQUUxQixNQUFNLGFBQWEsR0FBRyxHQUFZLEVBQUU7Z0JBQ25DLDRCQUE0QjtnQkFDNUIsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO29CQUM1RCxPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO2dCQUNELDREQUE0RDtnQkFDNUQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDLENBQUM7Z0JBQzNELElBQUksQ0FBQyxPQUFPLEVBQUUsY0FBYyxJQUFJLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxDQUFDO29CQUM3RCxPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO2dCQUNELE1BQU0sTUFBTSxHQUFHLGdCQUFnQixDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztnQkFDekQsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO29CQUNiLE9BQU8sS0FBSyxDQUFDO2dCQUNkLENBQUM7Z0JBQ0QsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO2dCQUNqRCxJQUFJLFVBQVUsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksRUFBRSxDQUFDO29CQUM5QyxPQUFPLElBQUksQ0FBQztnQkFDYixDQUFDO2dCQUNELDZFQUE2RTtnQkFDN0UsMkVBQTJFO2dCQUMzRSwwRkFBMEY7Z0JBQzFGLHFFQUFxRTtnQkFDckUsT0FBTyxpQkFBaUIsR0FBRywrQkFBK0IsQ0FBQztZQUM1RCxDQUFDLENBQUM7WUFFRixzQ0FBc0M7WUFDdEMsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLHNCQUFzQixDQUFDO2dCQUN2RCxnQkFBZ0I7Z0JBQ2hCLFVBQVUsRUFBRSxnQkFBZ0IsQ0FBQyxVQUFVO2dCQUN2QyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELGFBQWE7YUFDYixDQUFDLENBQUMsQ0FBQztZQUNKLEtBQUssQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsRUFBRTtnQkFDNUMsSUFBSSxJQUFJLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztvQkFDbEMsSUFBSSxDQUFDLHdCQUF3QixFQUFFLENBQUM7Z0JBQ2pDLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMxQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosdUVBQXVFO1lBQ3ZFLEtBQUssQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRTtnQkFDMUMsaUJBQWlCLEVBQUUsQ0FBQztZQUNyQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRUosS0FBSyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUU7Z0JBQ2pELElBQUksQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQzlFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixLQUFLLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLGlCQUFpQixDQUFDLEdBQUcsRUFBRTtnQkFDakQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLENBQUM7Z0JBQzdFLE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUVuRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBRS9DLElBQUksZUFBZSxFQUFFLFNBQVMsRUFBRSxDQUFDO29CQUNoQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDbEMsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDSix3QkFBd0IsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1lBRXZDLE1BQU0sbUJBQW1CLEdBQUcsTUFBTSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3RELElBQUksbUJBQW1CLEVBQUUsU0FBUyxFQUFFLENBQUM7Z0JBQ3BDLHdCQUF3QixDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsbUJBQW1CLENBQUMsQ0FBQztnQkFDbkQsT0FBTztZQUNSLENBQUM7UUFDRixDQUFDLENBQUM7UUFFRixzQkFBc0IsQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsR0FBRyw2Q0FBcUMsQ0FBQyxDQUFDO1FBQy9GLElBQUksQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLGtDQUFrQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsc0JBQXNCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRW5ILE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ3hFLElBQUksSUFBSSxDQUFDLGlCQUFpQixLQUFLLGdCQUFnQixFQUFFLENBQUM7Z0JBQ2pELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUM7WUFDcEMsQ0FBQztZQUNELElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLG1CQUFtQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDN0Qsd0JBQXdCLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDakMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDekIsQ0FBQztZQUNELElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxLQUFLLENBQUM7WUFDcEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxDQUFDO1lBQy9CLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLENBQUMsQ0FBQztZQUN0RSxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUM1QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGtCQUFrQjtRQUN6QixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDNUIsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ2xDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBQzVDLElBQUksU0FBUyxJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQzlCLE1BQU0sYUFBYSxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxXQUFXLENBQUMsQ0FBQztZQUN6RixJQUFJLGFBQWEsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDeEIsU0FBUyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMvQixDQUFDO1FBQ0YsQ0FBQztRQUNELElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDM0IsQ0FBQztJQUVPLGlDQUFpQztRQUN4QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDNUIsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ2xDLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxLQUFLLENBQUM7UUFDOUQsSUFBSSxTQUFTLElBQUksY0FBYyxFQUFFLENBQUM7WUFDakMsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLGNBQWMsQ0FBQyxDQUFDO1lBQzVGLElBQUksYUFBYSxJQUFJLENBQUMsRUFBRSxDQUFDO2dCQUN4QixTQUFTLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQy9CLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzFDLENBQUM7SUFFRDs7Ozs7O09BTUc7SUFDSyx3QkFBd0IsQ0FBQyxlQUE2QztRQUM3RSx3Q0FBd0M7UUFDeEMsSUFBSSxDQUFDLDhCQUE4QixFQUFFLENBQUM7UUFFdEMseUNBQXlDO1FBQ3pDLElBQUksZUFBZSxFQUFFLFFBQVEsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUNoRyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzNCLENBQUM7UUFFRCxzREFBc0Q7UUFDdEQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFVLGlCQUFpQixDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDbEgsSUFBSSxrQkFBa0IsSUFBSSxlQUFlLEVBQUUsUUFBUSxLQUFLLFNBQVMsSUFBSSxlQUFlLENBQUMsUUFBUSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztZQUN6SSxJQUFJLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUNqQyxDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxhQUFhLENBQUMsUUFBaUI7UUFDNUMsTUFBTSxTQUFTLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQztRQUMvQyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsOENBQThDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDaEcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzRCxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YseUJBQXlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDaEUsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxLQUFLLENBQUMsdUJBQXVCO1FBQ3BDLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLFVBQVUsRUFBRSxDQUFDO1lBQ3hDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUM7UUFDcEMsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQ3pFLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLENBQUM7WUFDdEksSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsVUFBVSxFQUFFLENBQUM7Z0JBQ3hDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxTQUFTLENBQUM7WUFDcEMsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztJQUMvQixDQUFDO0lBRU8sa0JBQWtCO1FBQ3pCLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVPLGlCQUFpQixDQUFDLEtBQWlCO1FBQzFDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxhQUFtQyxDQUFDO1FBQzdELElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQztZQUNsRCxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN2QyxJQUFJLENBQUMsb0JBQW9CLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVPLGNBQWM7UUFDckIsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRU0seUJBQXlCO1FBQy9CLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO0lBQ3JELENBQUM7SUFFTSxXQUFXO1FBQ2pCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDMUIsQ0FBQztJQUVPLGVBQWU7UUFDdEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3pGLE1BQU0sRUFBRSxVQUFVLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRU0sS0FBSyxDQUFDLGFBQWE7UUFDekIsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzdCLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDcEMsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzlCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDOUQsQ0FBQztJQUNGLENBQUM7SUFFTSxLQUFLLENBQUMsd0JBQXdCO1FBQ3BDLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7UUFDL0IsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbEMsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQy9CLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNuQixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sSUFBSSxDQUFDLDRCQUE0QixFQUFFLENBQUM7SUFDM0MsQ0FBQztJQUVPLEtBQUssQ0FBQyx1QkFBdUI7UUFDcEMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLElBQUksQ0FBQztRQUMvQixJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNsQyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDL0IsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVPLEtBQUssQ0FBQyw0QkFBNEI7UUFDekMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3hCLENBQUM7SUFFTyxlQUFlLENBQUMsUUFBMkI7UUFDbEQsSUFBSSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDekIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLFlBQVksQ0FBQyxHQUFHLDZDQUFxQyxDQUFDO1FBQ3hGLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3ZCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDO1FBQ3RELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUM7UUFDM0MsSUFBSSxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNyQyxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxRQUFRLENBQUMsQ0FBQztZQUMxRCxJQUFJLFdBQVcsRUFBRSxDQUFDO2dCQUNqQixPQUFPLFdBQVcsQ0FBQztZQUNwQixDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFHLGdCQUFnQixDQUFDLHNCQUFzQixDQUFDO1FBQzFELElBQUksU0FBUyxJQUFJLFNBQVMsQ0FBQyxFQUFFLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDNUMsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRCxDQUFBO0FBaHZCWSw0QkFBNEI7SUFtRHRDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFlBQUEsa0JBQWtCLENBQUE7SUFDbEIsWUFBQSxrQkFBa0IsQ0FBQTtJQUNsQixZQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFlBQUEscUJBQXFCLENBQUE7R0F6RFgsNEJBQTRCLENBZ3ZCeEM7O0FBRUQ7Ozs7Ozs7Ozs7Ozs7O0dBY0c7QUFDSCxJQUFNLDZCQUE2QixHQUFuQyxNQUFNLDZCQUE4QixTQUFRLFVBQVU7SUFHckQsSUFBVyxVQUFVO1FBQ3BCLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFjRCxJQUFXLFVBQVUsS0FBSyxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBRWpFLElBQVcsU0FBUyxLQUFLLE9BQU8sSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFL0QsWUFDa0IsdUJBQXFFLEVBQ3JFLGVBQW1ELEVBQ25ELHlCQUFxRyxFQUNyRyxlQUE2QixFQUM3QixlQUFtRixFQUNuRixtQkFBNEIsRUFDckIsc0JBQStELEVBQ2hFLHFCQUE2RCxFQUNyRCw2QkFBNkUsRUFDN0YsYUFBNkMsRUFDeEMsa0JBQXVEO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBWlMsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUE4QztRQUNyRSxvQkFBZSxHQUFmLGVBQWUsQ0FBb0M7UUFDbkQsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUE0RTtRQUNyRyxvQkFBZSxHQUFmLGVBQWUsQ0FBYztRQUM3QixvQkFBZSxHQUFmLGVBQWUsQ0FBb0U7UUFDbkYsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFTO1FBQ0osMkJBQXNCLEdBQXRCLHNCQUFzQixDQUF3QjtRQUMvQywwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQ3BDLGtDQUE2QixHQUE3Qiw2QkFBNkIsQ0FBK0I7UUFDNUUsa0JBQWEsR0FBYixhQUFhLENBQWU7UUFDdkIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQXpCcEUsZ0JBQVcsR0FBWSxJQUFJLENBQUM7UUFDNUIsMEJBQXFCLEdBQVksS0FBSyxDQUFDO1FBUTlCLHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBRXpELHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWMsQ0FBQyxDQUFDO1FBa0I5RSxNQUFNLGlCQUFpQixHQUFHLENBQUMsQ0FBQywyQ0FBMkMsRUFBRTtZQUN4RSxDQUFDLENBQUMsaUNBQWlDLEVBQUU7Z0JBQ3BDLENBQUMsQ0FBQyx1Q0FBdUMsRUFBRTtvQkFDMUMsQ0FBQyxDQUFDLHlDQUF5QyxDQUFDO29CQUM1QyxDQUFDLENBQUMsbUNBQW1DLENBQUM7aUJBQ3RDLENBQUM7YUFDRixDQUFDO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxTQUFTLENBQUM7UUFDM0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxXQUFXLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDO1FBQzFDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUM7UUFDbkQsSUFBSSxDQUFDLGtCQUFrQixHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQztRQUVyRCxJQUFJLENBQUMsYUFBYSxHQUFHLGlCQUFpQixDQUFDLEtBQUssQ0FBQztRQUM3QyxJQUFJLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUV2RCxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdEgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRTlILE1BQU0sY0FBYyxHQUFHLElBQUksY0FBYyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLGNBQWMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFaEUsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDN0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM5RixDQUFDO0lBRU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFpQjtRQUNwQyxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDMUMsSUFBSSxRQUFRLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztZQUNwQyxJQUFJLFFBQVEsRUFBRSxDQUFDO2dCQUNkLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7WUFDckMsQ0FBQztZQUNELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7WUFDeEIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ2hDLE1BQU0sSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDekMsQ0FBQztRQUNELE1BQU0sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFFcEMsNERBQTREO1FBQzVELElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQy9CLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVNLEtBQUs7UUFDWCxJQUFJLENBQUMsb0JBQW9CLEVBQUUsVUFBVSxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDakQsQ0FBQztJQUVNLGVBQWUsQ0FBQyxPQUEyQjtRQUNqRCxPQUFPLENBQUMsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEQsQ0FBQztJQUVNLGVBQWU7UUFDckIsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ2hDLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sV0FBVyxHQUFHLE9BQU8sRUFBRSxPQUFPLElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQy9ELElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNsQixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx5QkFBeUIsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUNsRyxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqRSxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGVBQWUsdUdBQW9ELENBQUM7UUFDM0gsTUFBTSxLQUFLLEdBQUcsa0JBQWtCO1lBQy9CLENBQUMsQ0FBQyxTQUFTLEdBQUcsSUFBSSxHQUFHLGtCQUFrQjtZQUN2QyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ2IsaUJBQWlCLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRU0seUJBQXlCO1FBQy9CLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QyxNQUFNLFdBQVcsR0FBRyxPQUFPLEVBQUUsT0FBTyxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUMvRCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSxjQUFjLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdEcsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNiLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN0QyxJQUFJLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pELE9BQU8sR0FBRyxhQUFhLEtBQUssUUFBUSxDQUFDLDBCQUEwQixFQUFFLHdDQUF3QyxDQUFDLEVBQUUsQ0FBQztZQUM5RyxDQUFDO1lBQ0QsTUFBTSxLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwQyxPQUFPLEdBQUcsYUFBYSxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQztRQUMxRCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDbEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxHQUFHLGFBQWEsS0FBSyxRQUFRLENBQUMsK0JBQStCLEVBQUUsd0NBQXdDLENBQUMsRUFBRSxDQUFDO1FBQ25ILENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFCLE9BQU8sR0FBRyxhQUFhLEtBQUssUUFBUSxDQUFDLDBCQUEwQixFQUFFLHdDQUF3QyxDQUFDLEVBQUUsQ0FBQztRQUM5RyxDQUFDO1FBQ0QsSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2pDLElBQUksUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3hCLFVBQVUsSUFBSSxLQUFLLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxtQkFBbUIsQ0FBQyxFQUFFLENBQUM7UUFDbkYsQ0FBQztRQUNELE9BQU8sR0FBRyxhQUFhLEtBQUssVUFBVSxFQUFFLENBQUM7SUFDMUMsQ0FBQztJQUVPLFlBQVksQ0FBQyxRQUFpQjtRQUNyQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRU8sS0FBSyxDQUFDLDBCQUEwQjtRQUN2QyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUU7WUFDckYsUUFBUSxvQ0FBNEI7WUFDcEMsVUFBVSxvQ0FBNEI7WUFDdEMsZ0JBQWdCLEVBQUUsSUFBSTtTQUN0QixDQUFDLENBQUMsQ0FBQztRQUNKLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pFLGlCQUFpQixDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7UUFDL0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFFdkIsa0dBQWtHO1FBQ2xHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsR0FBRyxFQUFFO1lBQ3RGLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxhQUFhLENBQUMsRUFBRSxVQUFVLGtDQUEwQixFQUFFLENBQUMsQ0FBQztRQUNwRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7WUFDdEYsSUFBSSxDQUFDLG9CQUFvQixFQUFFLGFBQWEsQ0FBQyxFQUFFLFVBQVUsb0NBQTRCLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRTtZQUNuRixJQUFJLENBQUMsb0JBQW9CLEVBQUUsYUFBYSxDQUFDLEVBQUUsVUFBVSxrQ0FBMEIsRUFBRSxDQUFDLENBQUM7UUFDcEYsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO1lBQ3BGLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxhQUFhLENBQUMsRUFBRSxVQUFVLG9DQUE0QixFQUFFLENBQUMsQ0FBQztRQUN0RixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosNEVBQTRFO1FBQzVFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUU7WUFDdEQsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztnQkFDaEMsT0FBTztZQUNSLENBQUM7WUFDRCxJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sS0FBSyxDQUFDLHNCQUFzQjtRQUNuQyxNQUFNLG9CQUFvQixHQUFHLE1BQU0sSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDL0QsTUFBTSxPQUFPLEdBQUcsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQzFFLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBRWxELElBQUksb0JBQW9CLElBQUksT0FBTyxFQUFFLENBQUM7WUFDckMsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsb0JBQW9CLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDNUUsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixPQUFPO1lBQ1IsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUUxQixJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDM0MsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDL0IsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLENBQUMseUJBQXlCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRU8sS0FBSyxDQUFDLGlCQUFpQixDQUFDLG9CQUF1QyxFQUFFLE9BQXlCO1FBQ2pHLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sb0JBQW9CLENBQUMsaUJBQWlCLENBQUM7UUFDN0MsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsSUFBSSxvQkFBb0IsQ0FBQyxVQUFVLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUM5RixJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUMxQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsNkJBQTZCLEVBQUUsb0JBQW9CLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDN0ksSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7UUFDdEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQzFDLDhDQUE4QztZQUM5QyxJQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDOUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDMUIsQ0FBQztZQUNELElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3JDLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM5QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLHVFQUF1RTtRQUN2RSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDdkMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUN0QyxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzdDLElBQUksTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzFDLG9DQUFvQztRQUNwQywrQ0FBK0M7UUFDL0Msc0NBQXNDO1FBQ3RDLDhFQUE4RTtRQUM5RSxJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUMxQyxJQUFJLFNBQVMsR0FBRyxNQUFNLElBQUksTUFBTSxDQUFDLFNBQVMsSUFBSSxNQUFNLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztRQUVuRSw0RUFBNEU7UUFDNUUsNEJBQTRCO1FBQzVCLDJGQUEyRjtRQUMzRix5REFBeUQ7UUFDekQsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2hCLEtBQUssSUFBSSxLQUFLLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyx1QkFBdUIsSUFBSSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDO2dCQUM1RSxNQUFNLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2dCQUNwQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQzVCLE9BQU8sSUFBSSxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsTUFBTSxHQUFHLE1BQU0sTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUN0QyxTQUFTLEdBQUcsTUFBTSxJQUFJLE1BQU0sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7Z0JBQy9ELGVBQWUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQztnQkFDdEMsc0VBQXNFO2dCQUN0RSxJQUFJLGVBQWUsRUFBRSxDQUFDO29CQUNyQixNQUFNO2dCQUNQLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixJQUFJLGVBQWUsRUFBRSxDQUFDO2dCQUNyQixJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLHdDQUF3QyxDQUFDLENBQUMsQ0FBQztZQUN4RyxDQUFDO1lBQ0Qsc0ZBQXNGO1FBQ3ZGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDMUIsQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUMzQyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTyxLQUFLLENBQUMscUJBQXFCLENBQUMsUUFBK0U7UUFDbEgsSUFBSSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxzQkFBc0IsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUMzRSxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUM1QixPQUFPO1FBQ1IsQ0FBQztRQUNELEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsOEJBQThCLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1FBQ2pKLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDekMsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ25ELE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUM1RCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDMUIsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLDBCQUEwQixFQUFFLHdDQUF3QyxDQUFDLENBQUMsQ0FBQztRQUN4RyxDQUFDO1FBQ0QsTUFBTSxTQUFTLEdBQUcsTUFBTSxFQUFFLFNBQVMsSUFBSSxRQUFRLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxvQkFBbUQ7UUFDcEYsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsc0JBQXNCLEdBQUcsU0FBUyxDQUFDO1FBQ3hDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsb0NBQW9DLEVBQUUsa0NBQWtDLENBQUMsQ0FBQyxDQUFDO1FBQzVHLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSx1Q0FBdUMsQ0FBQyxDQUFDLENBQUM7UUFDaEgsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsb0JBQW9CO1FBQ2pDLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDdEQsT0FBTyxRQUFRLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztJQUNoRSxDQUFDO0lBRU8saUJBQWlCLENBQUMsT0FBZTtRQUN4QyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUM7UUFDekMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMseUNBQXlDLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRU8saUJBQWlCO1FBQ3hCLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUNwQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBQ3BGLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFTyxrQkFBa0I7UUFDekIsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDbEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUVPLHVCQUF1QjtRQUM5QixHQUFHLENBQUMsZUFBZSxFQUFFLENBQUMscUJBQXFCLENBQUMsR0FBRyxFQUFFO1lBQ2hELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUM5QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxhQUFhO1FBQ3BCLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoQyxPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUM5QixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUN6QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLGFBQWEsQ0FBQyxTQUFrQjtRQUN2QyxJQUFJLENBQUMsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDaEMsT0FBTztRQUNSLENBQUM7UUFFRCxJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsc0JBQXNCLEdBQUcsU0FBUyxDQUFDO1FBQ3pDLENBQUM7YUFBTSxDQUFDO1lBQ1AsU0FBUyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztRQUN6QyxDQUFDO1FBRUQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3hDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLFNBQVMsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNqRCxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQzdDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3pDLE1BQU0sU0FBUyxHQUFHLFNBQVMsR0FBRyxlQUFlLEdBQUcsT0FBTyxDQUFDO1FBQ3hELE1BQU0sU0FBUyxHQUFHLFNBQVMsR0FBRyxlQUFlLEdBQUcsT0FBTyxDQUFDO1FBQ3hELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxTQUFTLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3pELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM5RSxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ2xFLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsYUFBYSxHQUFHLFNBQVMsQ0FBQyxDQUFDLENBQUMsR0FBRyxhQUFhLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUN6QyxDQUFDO0lBRU8sa0JBQWtCO1FBQ3pCLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztZQUNoQyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUNuRSxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUNyRSwyRUFBMkU7UUFDM0UsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDO1FBQ3BCLE9BQU8sY0FBYyxDQUFDLFNBQVMsSUFBSSxVQUFVLENBQUMsWUFBWSxHQUFHLFVBQVUsQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDO0lBQzVGLENBQUM7SUFFTyxxQkFBcUI7UUFDNUIsSUFBSSxDQUFDLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ2hDLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQztRQUNsQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztRQUNuRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsaUJBQWlCLENBQUMsRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLHFCQUFxQixHQUFHLEtBQUssQ0FBQztJQUNwQyxDQUFDO0lBRU8sdUJBQXVCLENBQUMsU0FBaUIsRUFBRSxTQUFpQixFQUFFLE9BQWU7UUFDcEYsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDekQsd0dBQXdHO1FBQ3hHLE1BQU0sWUFBWSxHQUFHLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDckMsT0FBTyxDQUFDLFlBQVksR0FBRyxTQUFTLENBQUMsR0FBRyxPQUFPLENBQUM7SUFDN0MsQ0FBQztJQUVPLGlCQUFpQjtRQUN4QixNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3JELE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLFVBQVUsSUFBSSxHQUFHLENBQUMsQ0FBQztRQUM5RCxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxhQUFhLElBQUksR0FBRyxDQUFDLENBQUM7UUFDcEUsT0FBTyxVQUFVLEdBQUcsYUFBYSxDQUFDO0lBQ25DLENBQUM7SUFFTyxtQkFBbUI7UUFDMUIsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3JDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDaEUsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxJQUFJLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQztRQUN2RSxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFDdkUsTUFBTSxVQUFVLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM5RixNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUMsQ0FBQztRQUNyRCxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFTyxxQkFBcUI7UUFDNUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNqRCxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUNsRixNQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDekYsSUFBSSxlQUFlLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2pFLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQTdiSyw2QkFBNkI7SUE4QmhDLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLDZCQUE2QixDQUFBO0lBQzdCLFdBQUEsYUFBYSxDQUFBO0lBQ2IsWUFBQSxrQkFBa0IsQ0FBQTtHQWxDZiw2QkFBNkIsQ0E2YmxDO0FBRU0sSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBK0IsU0FBUSxNQUFNO0lBR3pELFlBQ2tCLE9BQTRCLEVBQ3pCLGtCQUF1RCxFQUN4RCxpQkFBcUQ7UUFFeEUsS0FBSyxvSEFFSixRQUFRLENBQUMsb0JBQW9CLEVBQUUsYUFBYSxDQUFDLEVBQzdDLFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUMzQyxJQUFJLENBQ0osQ0FBQztRQVRlLFlBQU8sR0FBUCxPQUFPLENBQXFCO1FBQ1IsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN2QyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBTGpFLGNBQVMsR0FBRyxLQUFLLENBQUM7UUFhekIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFZSxLQUFLLENBQUMsR0FBRztRQVV4QixJQUFJLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUEwRiwyQkFBMkIsRUFBRTtZQUN2SixnQkFBZ0IsRUFBRSxJQUFJLENBQUMsU0FBUztTQUNoQyxDQUFDLENBQUM7UUFDSCxNQUFNLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN0QixDQUFDO0lBRU0sZ0JBQWdCLENBQUMsUUFBaUI7UUFDeEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxRQUFRLENBQUM7UUFDMUIsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFTSx3QkFBd0I7UUFDOUIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFTyxtQkFBbUI7UUFDMUIsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBRyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDM0QsSUFBSSxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN6RCxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDLG9CQUFvQixFQUFFLGFBQWEsQ0FBQyxDQUFDO1lBQzNELElBQUksQ0FBQyxLQUFLLEdBQUcsU0FBUyxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDMUQsQ0FBQztJQUNGLENBQUM7SUFFTyxjQUFjO1FBQ3JCLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxLQUFLLHNJQUE2RCxDQUFDO0lBQ2pJLENBQUM7Q0FDRCxDQUFBO0FBeERZLDhCQUE4QjtJQUt4QyxXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsaUJBQWlCLENBQUE7R0FOUCw4QkFBOEIsQ0F3RDFDOztBQUVNLElBQU0sdUJBQXVCLEdBQTdCLE1BQU0sdUJBQXdCLFNBQVEsTUFBTTtJQUNsRCxZQUNTLFNBQXdDLEVBQ3hDLFFBQXNDLEVBQzdCLFdBQTRCLEVBQzVCLFVBQThCLEVBQy9DLGdCQUF5QixFQUNVLGdCQUFrQyxFQUM1QixzQkFBOEMsRUFDL0MscUJBQTRDLEVBQy9DLGtCQUFzQyxFQUN2QyxpQkFBb0M7UUFFeEUsS0FBSyw0R0FFSixnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSx5QkFBeUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLGdCQUFnQixDQUFDLEVBQ3BILFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUM1QyxJQUFJLENBQ0osQ0FBQztRQWhCTSxjQUFTLEdBQVQsU0FBUyxDQUErQjtRQUN4QyxhQUFRLEdBQVIsUUFBUSxDQUE4QjtRQUM3QixnQkFBVyxHQUFYLFdBQVcsQ0FBaUI7UUFDNUIsZUFBVSxHQUFWLFVBQVUsQ0FBb0I7UUFFWixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQWtCO1FBQzVCLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBd0I7UUFDL0MsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUMvQyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ3ZDLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFReEUsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFFZSxLQUFLLENBQUMsR0FBRztRQUN4QixJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3hLLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUV0QixJQUFJLE1BQU0sR0FBOEMsTUFBTSxDQUFDO1FBQy9ELElBQUksUUFBUSxHQUFnRCxPQUFPLENBQUM7UUFDcEUsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsTUFBTSxHQUFHLFVBQVUsQ0FBQztZQUNwQixRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUNuRixDQUFDO2FBQU0sSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDN0IsTUFBTSxHQUFHLFlBQVksQ0FBQztRQUN2QixDQUFDO1FBYUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBNEUsNEJBQTRCLEVBQUU7WUFDMUksTUFBTTtZQUNOLFFBQVE7U0FDUixDQUFDLENBQUM7UUFFSCxJQUFJLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3hELElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssZ0JBQWdCLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQ3ZELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3hELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsQ0FBQztZQUNELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDeEQsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMxQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDdkMsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDYixJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxXQUFXLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzFELENBQUM7WUFDRCxPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3RELENBQUM7SUFDRixDQUFDO0lBRU0sd0JBQXdCO1FBQzlCLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRU8sZUFBZTtRQUN0QixJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxVQUFVLEVBQUUsQ0FBQztZQUMzRCxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUM7UUFDdEIsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3pDLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUN0QixDQUFDO1FBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLDZDQUFxQyxDQUFDO1FBQzlGLE1BQU0sUUFBUSxHQUFHLGdCQUFnQixFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNoRixJQUFJLFFBQVEsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDMUIsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUN0QixDQUFDO0lBRU8sY0FBYztRQUNyQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSywwSEFBdUQsQ0FBQztJQUMzSCxDQUFDO0NBQ0QsQ0FBQTtBQTlGWSx1QkFBdUI7SUFPakMsV0FBQSxnQkFBZ0IsQ0FBQTtJQUNoQixXQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGlCQUFpQixDQUFBO0dBWFAsdUJBQXVCLENBOEZuQzs7QUFFTSxJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEyQixTQUFRLE1BQU07SUFDckQsWUFDa0Isc0JBQThCLEVBQ1Isb0JBQTBDO1FBRWpGLEtBQUssNEdBRUosUUFBUSxDQUFDLHNCQUFzQixFQUFFLHdCQUF3QixDQUFDLEVBQzFELFNBQVMsQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUM1QyxJQUFJLENBQ0osQ0FBQztRQVJlLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBUTtRQUNSLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBc0I7SUFRbEYsQ0FBQztJQUVlLEtBQUssQ0FBQyxHQUFHO1FBQ3hCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUM3RSxDQUFDO0NBQ0QsQ0FBQTtBQWhCWSwwQkFBMEI7SUFHcEMsV0FBQSxvQkFBb0IsQ0FBQTtHQUhWLDBCQUEwQixDQWdCdEM7O0FBRU0sSUFBTSxzQ0FBc0MsR0FBNUMsTUFBTSxzQ0FBdUMsU0FBUSwwQkFBMEI7SUFNckYsWUFDQyxXQUFtQixFQUNuQixnQkFBeUIsRUFDekIsY0FBMkIsRUFDM0IsT0FBc0MsRUFDdEMsZUFBd0IsRUFDeEIsVUFBbUIsRUFDSixZQUEyQixFQUNuQixvQkFBMkM7UUFFbEUsTUFBTSxLQUFLLEdBQUcsVUFBVTtZQUN2QixDQUFDLENBQUMsUUFBUSxDQUFDLHlCQUF5QixFQUFFLFNBQVMsRUFBRSxXQUFXLENBQUM7WUFDN0QsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxhQUFhLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRXJFLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxjQUFjLENBQUM7UUFDOUMsSUFBSSxDQUFDLFlBQVksR0FBRyxXQUFXLENBQUM7UUFDaEMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDO1FBQzFDLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxDQUFDO1FBRTlCLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBRWpFLElBQUksVUFBVSxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDO1FBQzNCLENBQUM7UUFFRCxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFFTyxzQkFBc0I7UUFDN0IsSUFBSSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMzQixPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDO1FBQ3ZELFlBQVksQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBRTlCLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDNUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVc7Z0JBQ2xDLENBQUMsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLEVBQUUsTUFBTSxDQUFDO2dCQUN2RCxDQUFDLENBQUMsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQ2pFLE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUMzRSxZQUFZLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUM5RCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ25ELFdBQVcsQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztZQUM1QyxZQUFZLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3RDLFlBQVksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQzlELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVc7WUFDbEMsQ0FBQyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxNQUFNLENBQUM7WUFDOUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN4RCxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sV0FBVyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkQsV0FBVyxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO1FBRTVDLFlBQVksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDbEMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRU0sWUFBWTtRQUNsQixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUN0QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUMxQixJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRWtCLFdBQVc7UUFDN0IsTUFBTSxXQUFXLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyx3REFBd0QsQ0FBQyxDQUFDO1FBQ3BGLFdBQVcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDdEQsT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUVNLE1BQU07UUFDWixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hCLENBQUM7SUFFUSxjQUFjLENBQUMsTUFBNEIsRUFBRSxpQkFBeUMsRUFBRSxRQUFzQjtRQUN0SCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRCxDQUFBO0FBMUZZLHNDQUFzQztJQWFoRCxXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEscUJBQXFCLENBQUE7R0FkWCxzQ0FBc0MsQ0EwRmxEIn0=