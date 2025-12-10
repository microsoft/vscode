/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../common/chat.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, type IChatMarkdownContent, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo, IChatWidgetService } from '../../chat.js';
import { ChatQueryTitlePart } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, type IChatMarkdownContentPartOptions } from '../chatMarkdownContentPart.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatTerminalToolProgressPart.css';
import type { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { IChatTerminalToolProgressPart, ITerminalChatService, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService, type IDetachedTerminalInstance } from '../../../../terminal/browser/terminal.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { DecorationSelector, getTerminalCommandDecorationState, getTerminalCommandDecorationTooltip } from '../../../../terminal/browser/xterm/decorationStyles.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { localize } from '../../../../../../nls.js';
import { ITerminalCommand, TerminalCapability, type ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { URI } from '../../../../../../base/common/uri.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { EditorPool } from '../chatContentCodePools.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { DetachedTerminalCommandMirror } from '../../../../terminal/browser/chatTerminalCommandMirror.js';
import { DetachedProcessInfo } from '../../../../terminal/browser/detachedTerminal.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { TerminalContribCommandId } from '../../../../terminal/terminalContribExports.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { isNumber } from '../../../../../../base/common/types.js';
import { removeAnsiEscapeCodes } from '../../../../../../base/common/strings.js';
import { Color } from '../../../../../../base/common/color.js';
import { TERMINAL_BACKGROUND_COLOR } from '../../../../terminal/common/terminalColorRegistry.js';
import { PANEL_BACKGROUND } from '../../../../../common/theme.js';
import { editorBackground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';

const MIN_OUTPUT_ROWS = 1;
const MAX_OUTPUT_ROWS = 10;

/**
 * Remembers whether a tool invocation was last expanded so state survives virtualization re-renders.
 */
const expandedStateByInvocation = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

/**
 * Options for configuring a terminal command decoration.
 */
interface ITerminalCommandDecorationOptions {
	/**
	 * The terminal data associated with the tool invocation.
	 */
	readonly terminalData: IChatTerminalToolInvocationData;

	/**
	 * Returns the HTML element representing the command block in the terminal output.
	 * May return `undefined` if the command block is not currently rendered.
	 * Called when attaching the decoration to the command block container.
	 */
	getCommandBlock(): HTMLElement | undefined;

	/**
	 * Returns the HTML element representing the icon for the command, if any.
	 * May return `undefined` if no icon is present.
	 * Used to determine where to insert the decoration relative to the icon.
	 */
	getIconElement(): HTMLElement | undefined;

	/**
	 * Returns the resolved terminal command associated with this decoration, if available.
	 * May return `undefined` if the command has not been resolved yet.
	 * Used to access command metadata for the decoration.
	 */
	getResolvedCommand(): ITerminalCommand | undefined;
}

class TerminalCommandDecoration extends Disposable {
	private readonly _element: HTMLElement;
	private _interactionElement: HTMLElement | undefined;

	constructor(
		private readonly _options: ITerminalCommandDecorationOptions,
		@IHoverService private readonly _hoverService: IHoverService
	) {
		super();
		const decorationElements = h('span.chat-terminal-command-decoration@decoration', { role: 'img', tabIndex: 0 });
		this._element = decorationElements.decoration;
		this._attachElementToContainer();
	}

	private _attachElementToContainer(): void {
		const container = this._options.getCommandBlock();
		if (!container) {
			return;
		}

		const decoration = this._element;
		if (!decoration.isConnected || decoration.parentElement !== container) {
			const icon = this._options.getIconElement();
			if (icon && icon.parentElement === container) {
				icon.insertAdjacentElement('afterend', decoration);
			} else {
				container.insertBefore(decoration, container.firstElementChild ?? null);
			}
		}

		this._register(this._hoverService.setupDelayedHover(decoration, () => ({
			content: this._getHoverText()
		})));
		this._attachInteractionHandlers(decoration);
	}

	private _getHoverText(): string {
		const command = this._options.getResolvedCommand();
		const storedState = this._options.terminalData.terminalCommandState;
		return getTerminalCommandDecorationTooltip(command, storedState) || '';
	}

	public update(command?: ITerminalCommand): void {
		this._attachElementToContainer();
		const decoration = this._element;
		const resolvedCommand = command ?? this._options.getResolvedCommand();
		this._apply(decoration, resolvedCommand);
	}

	private _apply(decoration: HTMLElement, command: ITerminalCommand | undefined): void {
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
		} else if (!storedState) {
			const now = Date.now();
			terminalData.terminalCommandState = { exitCode: undefined, timestamp: now };
			storedState = terminalData.terminalCommandState;
		}

		const decorationState = getTerminalCommandDecorationState(command, storedState);
		const tooltip = getTerminalCommandDecorationTooltip(command, storedState);

		decoration.className = `chat-terminal-command-decoration ${DecorationSelector.CommandDecoration}`;
		decoration.classList.add(DecorationSelector.Codicon);
		for (const className of decorationState.classNames) {
			decoration.classList.add(className);
		}
		decoration.classList.add(...ThemeIcon.asClassNameArray(decorationState.icon));
		const isInteractive = !decoration.classList.contains(DecorationSelector.Default);
		decoration.tabIndex = isInteractive ? 0 : -1;
		if (isInteractive) {
			decoration.removeAttribute('aria-disabled');
		} else {
			decoration.setAttribute('aria-disabled', 'true');
		}
		const hoverText = tooltip || decorationState.hoverMessage;
		if (hoverText) {
			decoration.setAttribute('aria-label', hoverText);
		} else {
			decoration.removeAttribute('aria-label');
		}
	}

	private _attachInteractionHandlers(decoration: HTMLElement): void {
		if (this._interactionElement === decoration) {
			return;
		}
		this._interactionElement = decoration;
	}
}

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart implements IChatTerminalToolProgressPart {
	public readonly domNode: HTMLElement;

	private readonly _actionBar: ActionBar;

	private readonly _titleElement: HTMLElement;
	private readonly _outputView: ChatTerminalToolOutputSection;
	private readonly _terminalOutputContextKey: IContextKey<boolean>;
	private _terminalSessionRegistration: IDisposable | undefined;
	private readonly _elementIndex: number;
	private readonly _contentIndex: number;
	private readonly _sessionResource: URI;

	private readonly _showOutputAction = this._register(new MutableDisposable<ToggleChatTerminalOutputAction>());
	private _showOutputActionAdded = false;
	private readonly _focusAction = this._register(new MutableDisposable<FocusChatInstanceAction>());

	private readonly _terminalData: IChatTerminalToolInvocationData;
	private _terminalCommandUri: URI | undefined;
	private _storedCommandId: string | undefined;
	private readonly _commandText: string;
	private readonly _isSerializedInvocation: boolean;
	private _terminalInstance: ITerminalInstance | undefined;
	private readonly _decoration: TerminalCommandDecoration;

	private markdownPart: ChatMarkdownContentPart | undefined;
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? [];
	}

	public get elementIndex(): number {
		return this._elementIndex;
	}

	public get contentIndex(): number {
		return this._contentIndex;
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		terminalData: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData,
		context: IChatContentPartRenderContext,
		renderer: IMarkdownRenderer,
		editorPool: EditorPool,
		currentWidthDelegate: () => number,
		codeBlockStartIndex: number,
		codeBlockModelCollection: CodeBlockModelCollection,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(toolInvocation);

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

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
		this._commandText = command;
		this._terminalOutputContextKey = ChatContextKeys.inChatTerminalToolOutput.bindTo(this._contextKeyService);

		this._decoration = this._register(this._instantiationService.createInstance(TerminalCommandDecoration, {
			terminalData: this._terminalData,
			getCommandBlock: () => elements.commandBlock,
			getIconElement: () => undefined,
			getResolvedCommand: () => this._getResolvedCommand()
		}));

		const titlePart = this._register(_instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.commandBlock,
			new MarkdownString([
				`\`\`\`${terminalData.language}`,
				`${command.replaceAll('```', '\\`\\`\\`')}`,
				`\`\`\``
			].join('\n'), { supportThemeIcons: true }),
			undefined,
		));
		this._register(titlePart.onDidChangeHeight(() => {
			this._decoration.update();
			this._onDidChangeHeight.fire();
		}));

		this._outputView = this._register(this._instantiationService.createInstance(
			ChatTerminalToolOutputSection,
			() => this._onDidChangeHeight.fire(),
			() => this._ensureTerminalInstance(),
			() => this._getResolvedCommand(),
			() => this._terminalData.terminalCommandOutput,
			() => this._commandText,
			() => this._terminalData.terminalTheme,
		));
		elements.container.append(this._outputView.domNode);
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
		let pastTenseMessage: string | undefined;
		if (toolInvocation.pastTenseMessage) {
			pastTenseMessage = `${typeof toolInvocation.pastTenseMessage === 'string' ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value}`;
		}
		const markdownContent = new MarkdownString(pastTenseMessage, {
			supportThemeIcons: true,
			isTrusted: isMarkdownString(toolInvocation.pastTenseMessage) ? toolInvocation.pastTenseMessage.isTrusted : false,
		});
		const chatMarkdownContent: IChatMarkdownContent = {
			kind: 'markdownContent',
			content: markdownContent,
		};

		const codeBlockRenderOptions: ICodeBlockRenderOptions = {
			hideToolbar: true,
			reserveWidth: 19,
			verticalPadding: 5,
			editorOptions: {
				wordWrap: 'on'
			}
		};

		const markdownOptions: IChatMarkdownContentPartOptions = {
			codeBlockRenderOptions,
			accessibilityOptions: pastTenseMessage ? {
				statusMessage: localize('terminalToolCommand', '{0}', stripIcons(pastTenseMessage))
			} : undefined
		};

		this.markdownPart = this._register(_instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {}, currentWidthDelegate(), codeBlockModelCollection, markdownOptions));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		elements.message.append(this.markdownPart.domNode);
		const progressPart = this._register(_instantiationService.createInstance(ChatProgressSubPart, elements.container, this.getIcon(), terminalData.autoApproveInfo));
		this.domNode = progressPart.domNode;
		this._decoration.update();

		if (expandedStateByInvocation.get(toolInvocation)) {
			void this._toggleOutput(true);
		}
		this._register(this._terminalChatService.registerProgressPart(this));
	}

	private async _initializeTerminalActions(): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		const terminalToolSessionId = this._terminalData.terminalToolSessionId;
		if (!terminalToolSessionId) {
			this._addActions();
			return;
		}

		const attachInstance = async (instance: ITerminalInstance | undefined) => {
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
			const listener = this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(async instance => {
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
	}

	private _addActions(terminalInstance?: ITerminalInstance, terminalToolSessionId?: string): void {
		if (this._store.isDisposed) {
			return;
		}
		const actionBar = this._actionBar;
		this._removeFocusAction();
		const resolvedCommand = this._getResolvedCommand(terminalInstance);

		if (terminalInstance) {
			const isTerminalHidden = terminalInstance && terminalToolSessionId ? this._terminalChatService.isBackgroundTerminal(terminalToolSessionId) : false;
			const focusAction = this._instantiationService.createInstance(FocusChatInstanceAction, terminalInstance, resolvedCommand, this._terminalCommandUri, this._storedCommandId, isTerminalHidden);
			this._focusAction.value = focusAction;
			actionBar.push(focusAction, { icon: true, label: false, index: 0 });
		}

		this._ensureShowOutputAction(resolvedCommand);
		this._decoration.update(resolvedCommand);
	}

	private _getResolvedCommand(instance?: ITerminalInstance): ITerminalCommand | undefined {
		const target = instance ?? this._terminalInstance;
		if (!target) {
			return undefined;
		}
		return this._resolveCommand(target);
	}

	private _ensureShowOutputAction(command?: ITerminalCommand): void {
		if (this._store.isDisposed) {
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
			const exitCode = resolvedCommand?.exitCode ?? this._terminalData.terminalCommandState?.exitCode;
			if (exitCode) {
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
			} else if (existingIndex >= 0) {
				return;
			}
		}

		if (this._showOutputActionAdded) {
			return;
		}
		actionBar.push([showOutputAction], { icon: true, label: false });
		this._showOutputActionAdded = true;
	}

	private _clearCommandAssociation(options?: { clearPersistentData?: boolean }): void {
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

	private _registerInstanceListener(terminalInstance: ITerminalInstance): void {
		const commandDetectionListener = this._register(new MutableDisposable<IDisposable>());
		const tryResolveCommand = async (): Promise<ITerminalCommand | undefined> => {
			const resolvedCommand = this._resolveCommand(terminalInstance);
			this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
			return resolvedCommand;
		};

		const attachCommandDetection = async (commandDetection: ICommandDetectionCapability | undefined) => {
			commandDetectionListener.clear();
			if (!commandDetection) {
				await tryResolveCommand();
				return;
			}

			commandDetectionListener.value = commandDetection.onCommandFinished(() => {
				this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
				const resolvedCommand = this._getResolvedCommand(terminalInstance);
				if (resolvedCommand?.endMarker) {
					commandDetectionListener.clear();
				}
			});
			const resolvedImmediately = await tryResolveCommand();
			if (resolvedImmediately?.endMarker) {
				commandDetectionListener.clear();
				return;
			}
		};

		attachCommandDetection(terminalInstance.capabilities.get(TerminalCapability.CommandDetection));
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

	private _removeFocusAction(): void {
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

	private async _toggleOutput(expanded: boolean): Promise<boolean> {
		const didChange = await this._outputView.toggle(expanded);
		const isExpanded = this._outputView.isExpanded;
		this._titleElement.classList.toggle('chat-terminal-content-title-no-bottom-radius', isExpanded);
		this._showOutputAction.value?.syncPresentation(isExpanded);
		if (didChange) {
			expandedStateByInvocation.set(this.toolInvocation, isExpanded);
		}
		return didChange;
	}

	private async _ensureTerminalInstance(): Promise<ITerminalInstance | undefined> {
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

	private _handleOutputFocus(): void {
		this._terminalOutputContextKey.set(true);
		this._terminalChatService.setFocusedProgressPart(this);
		this._outputView.updateAriaLabel();
	}

	private _handleOutputBlur(event: FocusEvent): void {
		const nextTarget = event.relatedTarget as HTMLElement | null;
		if (this._outputView.containsElement(nextTarget)) {
			return;
		}
		this._terminalOutputContextKey.reset();
		this._terminalChatService.clearFocusedProgressPart(this);
	}

	private _handleDispose(): void {
		this._terminalOutputContextKey.reset();
		this._terminalChatService.clearFocusedProgressPart(this);
	}

	public getCommandAndOutputAsText(): string | undefined {
		return this._outputView.getCommandAndOutputAsText();
	}

	public focusOutput(): void {
		this._outputView.focus();
	}

	private _focusChatInput(): void {
		const widget = this._chatWidgetService.getWidgetBySessionResource(this._sessionResource);
		widget?.focusInput();
	}

	public async focusTerminal(): Promise<void> {
		if (this._focusAction.value) {
			await this._focusAction.value.run();
			return;
		}
		if (this._terminalCommandUri) {
			this._terminalService.openResource(this._terminalCommandUri);
		}
	}

	public async toggleOutputFromKeyboard(): Promise<void> {
		if (!this._outputView.isExpanded) {
			await this._toggleOutput(true);
			this.focusOutput();
			return;
		}
		await this._collapseOutputAndFocusInput();
	}

	private async _toggleOutputFromAction(): Promise<void> {
		if (!this._outputView.isExpanded) {
			await this._toggleOutput(true);
			return;
		}
		await this._toggleOutput(false);
	}

	private async _collapseOutputAndFocusInput(): Promise<void> {
		if (this._outputView.isExpanded) {
			await this._toggleOutput(false);
		}
		this._focusChatInput();
	}

	private _resolveCommand(instance: ITerminalInstance): ITerminalCommand | undefined {
		if (instance.isDisposed) {
			return undefined;
		}
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const commands = commandDetection?.commands;
		if (!commands || commands.length === 0) {
			return undefined;
		}

		return commands.find(c => c.id === this._terminalData.terminalCommandId);
	}
}

class ChatTerminalToolOutputSection extends Disposable {
	public readonly domNode: HTMLElement;

	public get isExpanded(): boolean {
		return this.domNode.classList.contains('expanded');
	}

	private readonly _outputBody: HTMLElement;
	private _scrollableContainer: DomScrollableElement | undefined;
	private _renderedOutputHeight: number | undefined;
	private _mirror: DetachedTerminalCommandMirror | undefined;
	private _snapshotMirror: DetachedTerminalSnapshotMirror | undefined;
	private readonly _contentContainer: HTMLElement;
	private readonly _terminalContainer: HTMLElement;
	private readonly _emptyElement: HTMLElement;
	private _lastRenderedLineCount: number | undefined;

	private readonly _onDidFocusEmitter = this._register(new Emitter<void>());
	public get onDidFocus() { return this._onDidFocusEmitter.event; }
	private readonly _onDidBlurEmitter = this._register(new Emitter<FocusEvent>());
	public get onDidBlur() { return this._onDidBlurEmitter.event; }

	constructor(
		private readonly _onDidChangeHeight: () => void,
		private readonly _ensureTerminalInstance: () => Promise<ITerminalInstance | undefined>,
		private readonly _resolveCommand: () => ITerminalCommand | undefined,
		private readonly _getTerminalCommandOutput: () => IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined,
		private readonly _getCommandText: () => string,
		private readonly _getStoredTheme: () => IChatTerminalToolInvocationData['terminalTheme'] | undefined,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();

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

	public async toggle(expanded: boolean): Promise<boolean> {
		const currentlyExpanded = this.isExpanded;
		if (expanded === currentlyExpanded) {
			if (expanded) {
				await this._updateTerminalContent();
			}
			return false;
		}

		this._setExpanded(expanded);

		if (!expanded) {
			this._renderedOutputHeight = undefined;
			this._onDidChangeHeight();
			return true;
		}

		if (!this._scrollableContainer) {
			await this._createScrollableContainer();
		}
		await this._updateTerminalContent();
		this._layoutOutput();
		this._scrollOutputToBottom();
		this._scheduleOutputRelayout();
		return true;
	}

	public focus(): void {
		this._scrollableContainer?.getDomNode().focus();
	}

	public containsElement(element: HTMLElement | null): boolean {
		return !!element && this.domNode.contains(element);
	}

	public updateAriaLabel(): void {
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
		const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.TerminalChatOutput);
		const label = accessibleViewHint
			? ariaLabel + ', ' + accessibleViewHint
			: ariaLabel;
		scrollableDomNode.setAttribute('aria-label', label);
	}

	public getCommandAndOutputAsText(): string | undefined {
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

	private _setExpanded(expanded: boolean): void {
		this.domNode.classList.toggle('expanded', expanded);
		this.domNode.classList.toggle('collapsed', !expanded);
	}

	private async _createScrollableContainer(): Promise<void> {
		this._scrollableContainer = this._register(new DomScrollableElement(this._outputBody, {
			vertical: ScrollbarVisibility.Hidden,
			horizontal: ScrollbarVisibility.Auto,
			handleMouseWheel: true
		}));
		const scrollableDomNode = this._scrollableContainer.getDomNode();
		scrollableDomNode.tabIndex = 0;
		this.domNode.appendChild(scrollableDomNode);
		this.updateAriaLabel();
	}

	private async _updateTerminalContent(): Promise<void> {
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

		this._renderUnavailableMessage(liveTerminalInstance);
	}

	private async _renderLiveOutput(liveTerminalInstance: ITerminalInstance, command: ITerminalCommand): Promise<boolean> {
		if (this._mirror) {
			return true;
		}
		await liveTerminalInstance.xtermReadyPromise;
		if (liveTerminalInstance.isDisposed || !liveTerminalInstance.xterm) {
			this._disposeLiveMirror();
			return false;
		}
		this._mirror = this._register(this._instantiationService.createInstance(DetachedTerminalCommandMirror, liveTerminalInstance.xterm!, command));
		await this._mirror.attach(this._terminalContainer);
		const result = await this._mirror.renderCommand();
		if (!result || result.lineCount === 0) {
			this._showEmptyMessage(localize('chat.terminalOutputEmpty', 'No output was produced by the command.'));
		} else {
			this._hideEmptyMessage();
		}
		this._layoutOutput(result?.lineCount ?? 0);
		return true;
	}

	private async _renderSnapshotOutput(snapshot: NonNullable<IChatTerminalToolInvocationData['terminalCommandOutput']>): Promise<void> {
		if (this._snapshotMirror) {
			this._layoutOutput(snapshot.lineCount ?? 0);
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
		} else {
			this._showEmptyMessage(localize('chat.terminalOutputEmpty', 'No output was produced by the command.'));
		}
		const lineCount = result?.lineCount ?? snapshot.lineCount ?? 0;
		this._layoutOutput(lineCount);
	}

	private _renderUnavailableMessage(liveTerminalInstance: ITerminalInstance | undefined): void {
		dom.clearNode(this._terminalContainer);
		this._lastRenderedLineCount = undefined;
		if (!liveTerminalInstance) {
			this._showEmptyMessage(localize('chat.terminalOutputTerminalMissing', 'Terminal is no longer available.'));
		} else {
			this._showEmptyMessage(localize('chat.terminalOutputCommandMissing', 'Command information is not available.'));
		}
	}

	private async _resolveLiveTerminal(): Promise<ITerminalInstance | undefined> {
		const instance = await this._ensureTerminalInstance();
		return instance && !instance.isDisposed ? instance : undefined;
	}

	private _showEmptyMessage(message: string): void {
		this._emptyElement.textContent = message;
		this._terminalContainer.classList.add('chat-terminal-output-terminal-no-output');
		this.domNode.classList.add('chat-terminal-output-container-no-output');
	}

	private _hideEmptyMessage(): void {
		this._emptyElement.textContent = '';
		this._terminalContainer.classList.remove('chat-terminal-output-terminal-no-output');
		this.domNode.classList.remove('chat-terminal-output-container-no-output');
	}

	private _disposeLiveMirror(): void {
		if (this._mirror) {
			this._mirror.dispose();
			this._mirror = undefined;
		}
	}

	private _scheduleOutputRelayout(): void {
		dom.getActiveWindow().requestAnimationFrame(() => {
			this._layoutOutput();
			this._scrollOutputToBottom();
		});
	}

	private _handleResize(): void {
		if (!this._scrollableContainer) {
			return;
		}
		if (this.isExpanded) {
			this._layoutOutput();
			this._scrollOutputToBottom();
		} else {
			this._scrollableContainer.scanDomNode();
		}
	}

	private _layoutOutput(lineCount?: number): void {
		if (!this._scrollableContainer) {
			return;
		}

		if (lineCount !== undefined) {
			this._lastRenderedLineCount = lineCount;
		} else {
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
		if (this._renderedOutputHeight !== appliedHeight) {
			this._renderedOutputHeight = appliedHeight;
			this._onDidChangeHeight();
		}
	}

	private _scrollOutputToBottom(): void {
		if (!this._scrollableContainer) {
			return;
		}
		const dimensions = this._scrollableContainer.getScrollDimensions();
		this._scrollableContainer.setScrollPosition({ scrollTop: dimensions.scrollHeight });
	}

	private _getOutputContentHeight(lineCount: number, rowHeight: number, padding: number): number {
		const contentRows = Math.max(lineCount, MIN_OUTPUT_ROWS);
		const adjustedRows = contentRows + (lineCount > MAX_OUTPUT_ROWS ? 1 : 0);
		return (adjustedRows * rowHeight) + padding;
	}

	private _getOutputPadding(): number {
		const style = dom.getComputedStyle(this._outputBody);
		const paddingTop = Number.parseFloat(style.paddingTop || '0');
		const paddingBottom = Number.parseFloat(style.paddingBottom || '0');
		return paddingTop + paddingBottom;
	}

	private _computeRowHeightPx(): number {
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

	private _applyBackgroundColor(): void {
		const theme = this._themeService.getColorTheme();
		const isInEditor = ChatContextKeys.inChatEditor.getValue(this._contextKeyService);
		const backgroundColor = theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
		if (backgroundColor) {
			this.domNode.style.backgroundColor = backgroundColor.toString();
		}
	}
}

class DetachedTerminalSnapshotMirror extends Disposable {
	private _detachedTerminal: Promise<IDetachedTerminalInstance> | undefined;
	private _output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined;
	private _attachedContainer: HTMLElement | undefined;
	private _container: HTMLElement | undefined;
	private _dirty = true;
	private _lastRenderedLineCount: number | undefined;

	constructor(
		output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined,
		private readonly _getTheme: () => IChatTerminalToolInvocationData['terminalTheme'] | undefined,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._output = output;
	}

	public setOutput(output: IChatTerminalToolInvocationData['terminalCommandOutput'] | undefined): void {
		this._output = output;
		this._dirty = true;
	}

	public async attach(container: HTMLElement): Promise<void> {
		const terminal = await this._getTerminal();
		container.classList.add('chat-terminal-output-terminal');
		if (this._attachedContainer !== container || container.firstChild === null) {
			terminal.attachToElement(container);
			this._attachedContainer = container;
		}
		this._container = container;
		this._applyTheme(container);
	}

	public async render(): Promise<{ lineCount?: number } | undefined> {
		const output = this._output;
		if (!output) {
			return undefined;
		}
		if (!this._dirty) {
			return { lineCount: this._lastRenderedLineCount ?? output.lineCount };
		}
		const terminal = await this._getTerminal();
		terminal.xterm.clearBuffer();
		terminal.xterm.clearSearchDecorations?.();
		if (this._container) {
			this._applyTheme(this._container);
		}
		const text = output.text ?? '';
		const lineCount = output.lineCount ?? this._estimateLineCount(text);
		if (!text) {
			this._dirty = false;
			this._lastRenderedLineCount = lineCount;
			return { lineCount: 0 };
		}
		await new Promise<void>(resolve => terminal.xterm.write(text, resolve));
		this._dirty = false;
		this._lastRenderedLineCount = lineCount;
		return { lineCount };
	}

	private _estimateLineCount(text: string): number {
		if (!text) {
			return 0;
		}
		const sanitized = text.replace(/\r/g, '');
		const segments = sanitized.split('\n');
		const count = sanitized.endsWith('\n') ? segments.length - 1 : segments.length;
		return Math.max(count, 1);
	}

	private _applyTheme(container: HTMLElement): void {
		const theme = this._getTheme();
		if (!theme) {
			container.style.removeProperty('background-color');
			container.style.removeProperty('color');
			return;
		}
		if (theme.background) {
			container.style.backgroundColor = theme.background;
		}
		if (theme.foreground) {
			container.style.color = theme.foreground;
		}
	}

	private async _getTerminal(): Promise<IDetachedTerminalInstance> {
		if (!this._detachedTerminal) {
			this._detachedTerminal = this._createTerminal();
		}
		return this._detachedTerminal;
	}

	private async _createTerminal(): Promise<IDetachedTerminalInstance> {
		const terminal = await this._terminalService.createDetachedTerminal({
			cols: 80,
			rows: 10,
			readonly: true,
			processInfo: new DetachedProcessInfo({ initialCwd: '' }),
			disableOverviewRuler: true,
			colorProvider: {
				getBackgroundColor: theme => {
					const storedBackground = this._getTheme()?.background;
					if (storedBackground) {
						const color = Color.fromHex(storedBackground);
						if (color) {
							return color;
						}
					}
					const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
					if (terminalBackground) {
						return terminalBackground;
					}
					// Use editor background when in chat editor, panel background otherwise
					const isInEditor = ChatContextKeys.inChatEditor.getValue(this._contextKeyService);
					return theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
				}
			}
		});
		return this._register(terminal);
	}
}

export class ToggleChatTerminalOutputAction extends Action implements IAction {
	private _expanded = false;

	constructor(
		private readonly _toggle: () => Promise<void>,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super(
			TerminalContribCommandId.ToggleChatTerminalOutput,
			localize('showTerminalOutput', 'Show Output'),
			ThemeIcon.asClassName(Codicon.chevronRight),
			true,
		);
		this._updateTooltip();
	}

	public override async run(): Promise<void> {
		type ToggleChatTerminalOutputTelemetryEvent = {
			previousExpanded: boolean;
		};

		type ToggleChatTerminalOutputTelemetryClassification = {
			owner: 'meganrogge';
			comment: 'Track usage of the toggle chat terminal output action.';
			previousExpanded: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the terminal output was expanded before the toggle.' };
		};
		this._telemetryService.publicLog2<ToggleChatTerminalOutputTelemetryEvent, ToggleChatTerminalOutputTelemetryClassification>('terminal/chatToggleOutput', {
			previousExpanded: this._expanded
		});
		await this._toggle();
	}

	public syncPresentation(expanded: boolean): void {
		this._expanded = expanded;
		this._updatePresentation();
		this._updateTooltip();
	}

	public refreshKeybindingTooltip(): void {
		this._updateTooltip();
	}

	private _updatePresentation(): void {
		if (this._expanded) {
			this.label = localize('hideTerminalOutput', 'Hide Output');
			this.class = ThemeIcon.asClassName(Codicon.chevronDown);
		} else {
			this.label = localize('showTerminalOutput', 'Show Output');
			this.class = ThemeIcon.asClassName(Codicon.chevronRight);
		}
	}

	private _updateTooltip(): void {
		const keybinding = this._keybindingService.lookupKeybinding(TerminalContribCommandId.FocusMostRecentChatTerminalOutput);
		const label = keybinding?.getLabel();
		this.tooltip = label ? `${this.label} (${label})` : this.label;
	}
}

export class FocusChatInstanceAction extends Action implements IAction {
	constructor(
		private _instance: ITerminalInstance | undefined,
		private _command: ITerminalCommand | undefined,
		private readonly _commandUri: URI | undefined,
		private readonly _commandId: string | undefined,
		isTerminalHidden: boolean,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super(
			TerminalContribCommandId.FocusChatInstanceAction,
			isTerminalHidden ? localize('showTerminal', 'Show and Focus Terminal') : localize('focusTerminal', 'Focus Terminal'),
			ThemeIcon.asClassName(Codicon.openInProduct),
			true,
		);
		this._updateTooltip();
	}

	public override async run() {
		this.label = localize('focusTerminal', 'Focus Terminal');
		this._updateTooltip();

		let target: FocusChatInstanceTelemetryEvent['target'] = 'none';
		let location: FocusChatInstanceTelemetryEvent['location'] = 'panel';
		if (this._instance) {
			target = 'instance';
			location = this._instance.target === TerminalLocation.Editor ? 'editor' : 'panel';
		} else if (this._commandUri) {
			target = 'commandUri';
		}

		type FocusChatInstanceTelemetryEvent = {
			target: 'instance' | 'commandUri' | 'none';
			location: 'panel' | 'editor';
		};

		type FocusChatInstanceTelemetryClassification = {
			owner: 'meganrogge';
			comment: 'Track usage of the focus chat terminal action.';
			target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether focusing targeted an existing instance or opened a command URI.' };
			location: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Location of the terminal instance when focusing.' };
		};
		this._telemetryService.publicLog2<FocusChatInstanceTelemetryEvent, FocusChatInstanceTelemetryClassification>('terminal/chatFocusInstance', {
			target,
			location
		});

		if (this._instance) {
			this._terminalService.setActiveInstance(this._instance);
			if (this._instance.target === TerminalLocation.Editor) {
				this._terminalEditorService.openEditor(this._instance);
			} else {
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

	public refreshKeybindingTooltip(): void {
		this._updateTooltip();
	}

	private _resolveCommand(): ITerminalCommand | undefined {
		if (this._command && !this._command.endMarker?.isDisposed) {
			return this._command;
		}
		if (!this._instance || !this._commandId) {
			return this._command;
		}
		const commandDetection = this._instance.capabilities.get(TerminalCapability.CommandDetection);
		const resolved = commandDetection?.commands.find(c => c.id === this._commandId);
		if (resolved) {
			this._command = resolved;
		}
		return this._command;
	}

	private _updateTooltip(): void {
		const keybinding = this._keybindingService.lookupKeybinding(TerminalContribCommandId.FocusMostRecentChatTerminal);
		const label = keybinding?.getLabel();
		this.tooltip = label ? `${this.label} (${label})` : this.label;
	}
}
