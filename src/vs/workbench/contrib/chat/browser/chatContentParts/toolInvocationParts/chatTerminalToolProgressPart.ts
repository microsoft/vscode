/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IPreferencesService, type IOpenSettingsOptions } from '../../../../../services/preferences/common/preferences.js';
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
import { TerminalContribSettingId } from '../../../../terminal/terminalContribExports.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import type { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { ChatConfiguration, CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES } from '../../../common/constants.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { IChatTerminalToolProgressPart, ITerminalChatService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { localize } from '../../../../../../nls.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalCommand, TerminalCapability, type ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as domSanitize from '../../../../../../base/browser/domSanitize.js';
import { DomSanitizerConfig } from '../../../../../../base/browser/domSanitize.js';
import { allowedMarkdownHtmlAttributes } from '../../../../../../base/browser/markdownRenderer.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { EditorPool } from '../chatContentCodePools.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';

const MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT = 200;

const sanitizerConfig = Object.freeze<DomSanitizerConfig>({
	allowedTags: {
		augment: ['b', 'i', 'u', 'code', 'span', 'div', 'body', 'pre'],
	},
	allowedAttributes: {
		augment: [...allowedMarkdownHtmlAttributes, 'style']
	}
});

/**
 * Remembers whether a tool invocation was last expanded so state survives virtualization re-renders.
 */
const expandedStateByInvocation = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart implements IChatTerminalToolProgressPart {
	public readonly domNode: HTMLElement;

	private readonly _actionBar: ActionBar;

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
	private readonly _isSerializedInvocation: boolean;
	private _terminalInstance: ITerminalInstance | undefined;

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
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
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
			h('.chat-terminal-content-title@title'),
			h('.chat-terminal-content-message@message'),
			h('.chat-terminal-output-container@output')
		]);

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
		const displayCommand = stripIcons(command);
		this._terminalOutputContextKey = ChatContextKeys.inChatTerminalToolOutput.bindTo(this._contextKeyService);

		const titlePart = this._register(_instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.title,
			new MarkdownString([
				`$(${Codicon.terminal.id})`,
				``,
				`\`\`\`${terminalData.language}`,
				`${command.replaceAll('```', '\\`\\`\\`')}`,
				`\`\`\``
			].join('\n'), { supportThemeIcons: true }),
			undefined,
		));
		this._register(titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

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
		const outputViewOptions: ChatTerminalToolOutputSectionOptions = {
			container: elements.output,
			title: elements.title,
			displayCommand,
			terminalData: this._terminalData,
			accessibleViewService: this._accessibleViewService,
			onDidChangeHeight: () => this._onDidChangeHeight.fire(),
			ensureTerminalInstance: () => this._ensureTerminalInstance(),
			resolveCommand: () => this._getResolvedCommand(),
			getTerminalTheme: () => this._terminalInstance?.xterm?.getXtermTheme() ?? this._terminalData.terminalTheme,
			getStoredCommandId: () => this._storedCommandId
		};
		this._outputView = this._register(new ChatTerminalToolOutputSection(outputViewOptions));
		this._register(this._outputView.onDidFocus(() => this._handleOutputFocus()));
		this._register(this._outputView.onDidBlur(e => this._handleOutputBlur(e)));
		this._register(toDisposable(() => this._handleDispose()));
		this._register(this._keybindingService.onDidUpdateKeybindings(() => {
			this._focusAction.value?.refreshKeybindingTooltip();
			this._showOutputAction.value?.refreshKeybindingTooltip();
		}));

		const progressPart = this._register(_instantiationService.createInstance(ChatProgressSubPart, elements.container, this.getIcon(), terminalData.autoApproveInfo));
		this.domNode = progressPart.domNode;

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

		// Ensure stored output surfaces immediately even if no terminal instance is available yet.
		if (this._terminalData.terminalCommandOutput) {
			this._addActions(undefined, terminalToolSessionId);
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

		if (terminalInstance) {
			const isTerminalHidden = terminalInstance && terminalToolSessionId ? this._terminalChatService.isBackgroundTerminal(terminalToolSessionId) : false;
			const resolvedCommand = this._getResolvedCommand(terminalInstance);
			const focusAction = this._instantiationService.createInstance(FocusChatInstanceAction, terminalInstance, resolvedCommand, this._terminalCommandUri, this._storedCommandId, isTerminalHidden);
			this._focusAction.value = focusAction;
			actionBar.push(focusAction, { icon: true, label: false, index: 0 });
		}

		this._ensureShowOutputAction();
	}

	private _getResolvedCommand(instance?: ITerminalInstance): ITerminalCommand | undefined {
		const target = instance ?? this._terminalInstance;
		if (!target) {
			return undefined;
		}
		return this._resolveCommand(target);
	}

	private _ensureShowOutputAction(): void {
		if (this._store.isDisposed) {
			return;
		}
		const command = this._getResolvedCommand();
		const hasStoredOutput = !!this._terminalData.terminalCommandOutput;
		if (!command && !hasStoredOutput) {
			return;
		}
		let showOutputAction = this._showOutputAction.value;
		if (!showOutputAction) {
			showOutputAction = this._instantiationService.createInstance(ToggleChatTerminalOutputAction, () => this._toggleOutputFromAction());
			this._showOutputAction.value = showOutputAction;
			if (command?.exitCode) {
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

	private _clearCommandAssociation(): void {
		this._terminalCommandUri = undefined;
		this._storedCommandId = undefined;
		if (this._terminalData.terminalCommandUri) {
			delete this._terminalData.terminalCommandUri;
		}
		if (this._terminalData.terminalToolSessionId) {
			delete this._terminalData.terminalToolSessionId;
		}
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
				commandDetectionListener.clear();
			});
			const resolvedImmediately = await tryResolveCommand();
			if (resolvedImmediately?.endMarker) {
				return;
			}
		};

		attachCommandDetection(terminalInstance.capabilities.get(TerminalCapability.CommandDetection));
		this._register(terminalInstance.capabilities.onDidAddCommandDetectionCapability(cd => attachCommandDetection(cd)));

		const instanceListener = this._register(terminalInstance.onDisposed(() => {
			if (this._terminalInstance === terminalInstance) {
				this._terminalInstance = undefined;
			}
			this._clearCommandAssociation();
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
		this._showOutputAction.value?.syncPresentation(this._outputView.isExpanded);
		if (didChange) {
			expandedStateByInvocation.set(this.toolInvocation, this._outputView.isExpanded);
		}
		return didChange;
	}

	private async _ensureTerminalInstance(): Promise<ITerminalInstance | undefined> {
		if (!this._terminalInstance && this._terminalData.terminalToolSessionId) {
			this._terminalInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(this._terminalData.terminalToolSessionId);
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
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const commands = commandDetection?.commands;
		if (!commands || commands.length === 0) {
			return undefined;
		}

		return commands.find(c => c.id === this._terminalData.terminalCommandId);
	}
}

interface ChatTerminalToolOutputSectionOptions {
	container: HTMLElement;
	title: HTMLElement;
	displayCommand: string;
	terminalData: IChatTerminalToolInvocationData;
	accessibleViewService: IAccessibleViewService;
	onDidChangeHeight: () => void;
	ensureTerminalInstance: () => Promise<ITerminalInstance | undefined>;
	resolveCommand: () => ITerminalCommand | undefined;
	getTerminalTheme: () => { background?: string; foreground?: string } | undefined;
	getStoredCommandId: () => string | undefined;
}

class ChatTerminalToolOutputSection extends Disposable {
	public readonly onDidFocus: Event<void>;
	public readonly onDidBlur: Event<FocusEvent>;

	public get isExpanded(): boolean {
		return this._container.classList.contains('expanded');
	}

	private readonly _container: HTMLElement;
	private readonly _title: HTMLElement;
	private readonly _displayCommand: string;
	private readonly _terminalData: IChatTerminalToolInvocationData;
	private readonly _accessibleViewService: IAccessibleViewService;
	private readonly _onDidChangeHeight: () => void;
	private readonly _ensureTerminalInstance: () => Promise<ITerminalInstance | undefined>;
	private readonly _resolveCommand: () => ITerminalCommand | undefined;
	private readonly _getTerminalTheme: () => { background?: string; foreground?: string } | undefined;
	private readonly _getStoredCommandId: () => string | undefined;

	private readonly _outputBody: HTMLElement;
	private _outputScrollbar: DomScrollableElement | undefined;
	private _outputContent: HTMLElement | undefined;
	private _outputResizeObserver: ResizeObserver | undefined;
	private _renderedOutputHeight: number | undefined;
	private _lastOutputTruncated = false;
	private readonly _outputAriaLabelBase: string;

	private readonly _onDidFocusEmitter = new Emitter<void>();
	private readonly _onDidBlurEmitter = new Emitter<FocusEvent>();

	constructor(options: ChatTerminalToolOutputSectionOptions) {
		super();
		this._container = options.container;
		this._title = options.title;
		this._displayCommand = options.displayCommand;
		this._terminalData = options.terminalData;
		this._accessibleViewService = options.accessibleViewService;
		this._onDidChangeHeight = options.onDidChangeHeight;
		this._ensureTerminalInstance = options.ensureTerminalInstance;
		this._resolveCommand = options.resolveCommand;
		this._getTerminalTheme = options.getTerminalTheme;
		this._getStoredCommandId = options.getStoredCommandId;
		this._outputAriaLabelBase = localize('chatTerminalOutputAriaLabel', 'Terminal output for {0}', this._displayCommand);

		this._container.classList.add('collapsed');
		this._outputBody = dom.$('.chat-terminal-output-body');

		this.onDidFocus = this._onDidFocusEmitter.event;
		this.onDidBlur = this._onDidBlurEmitter.event;
		this._register(this._onDidFocusEmitter);
		this._register(this._onDidBlurEmitter);

		this._register(dom.addDisposableListener(this._container, dom.EventType.FOCUS_IN, () => this._onDidFocusEmitter.fire()));
		this._register(dom.addDisposableListener(this._container, dom.EventType.FOCUS_OUT, event => this._onDidBlurEmitter.fire(event as FocusEvent)));
	}

	public async toggle(expanded: boolean): Promise<boolean> {
		const currentlyExpanded = this.isExpanded;
		if (expanded === currentlyExpanded) {
			return false;
		}

		this._setExpanded(expanded);

		if (!expanded) {
			this._renderedOutputHeight = undefined;
			this._onDidChangeHeight();
			return true;
		}

		const didCreate = await this._renderOutputIfNeeded();
		this._layoutOutput();
		this._scrollOutputToBottom();
		if (didCreate) {
			this._scheduleOutputRelayout();
		}
		return true;
	}

	public async ensureRendered(): Promise<void> {
		await this._renderOutputIfNeeded();
		if (this.isExpanded) {
			this._layoutOutput();
			this._scrollOutputToBottom();
		}
	}

	public focus(): void {
		this._outputScrollbar?.getDomNode().focus();
	}

	public containsElement(element: HTMLElement | null): boolean {
		return !!element && this._container.contains(element);
	}

	public updateAriaLabel(): void {
		if (!this._outputScrollbar) {
			return;
		}
		const scrollableDomNode = this._outputScrollbar.getDomNode();
		scrollableDomNode.setAttribute('role', 'region');
		const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.TerminalChatOutput);
		const label = accessibleViewHint
			? this._outputAriaLabelBase + ', ' + accessibleViewHint
			: this._outputAriaLabelBase;
		scrollableDomNode.setAttribute('aria-label', label);
	}

	public getCommandAndOutputAsText(): string | undefined {
		const commandHeader = localize('chatTerminalOutputAccessibleViewHeader', 'Command: {0}', this._displayCommand);
		const command = this._resolveCommand();
		const output = command?.getOutput()?.trimEnd();
		if (!output) {
			return `${commandHeader}\n${localize('chat.terminalOutputEmpty', 'No output was produced by the command.')}`;
		}
		let result = `${commandHeader}\n${output}`;
		if (this._lastOutputTruncated) {
			result += `\n\n${localize('chat.terminalOutputTruncated', 'Output truncated to first {0} lines.', CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES)}`;
		}
		return result;
	}

	private _setExpanded(expanded: boolean): void {
		this._container.classList.toggle('expanded', expanded);
		this._container.classList.toggle('collapsed', !expanded);
		this._title.classList.toggle('expanded', expanded);
	}

	private async _renderOutputIfNeeded(): Promise<boolean> {
		if (this._outputContent) {
			this._ensureOutputResizeObserver();
			return false;
		}

		const terminalInstance = await this._ensureTerminalInstance();
		const output = await this._collectOutput(terminalInstance);
		const serializedOutput = output ?? this._getStoredCommandOutput();
		if (!serializedOutput) {
			return false;
		}
		const content = this._renderOutput(serializedOutput);
		const theme = this._getTerminalTheme();
		if (theme && !content.classList.contains('chat-terminal-output-content-empty')) {
			// eslint-disable-next-line no-restricted-syntax
			const inlineTerminal = content.querySelector('div');
			if (inlineTerminal) {
				inlineTerminal.style.setProperty('background-color', theme.background || 'transparent');
				inlineTerminal.style.setProperty('color', theme.foreground || 'inherit');
			}
		}

		this._outputBody.replaceChildren(content);
		this._outputContent = content;
		if (!this._outputScrollbar) {
			this._outputScrollbar = this._register(new DomScrollableElement(this._outputBody, {
				vertical: ScrollbarVisibility.Auto,
				horizontal: ScrollbarVisibility.Auto,
				handleMouseWheel: true
			}));
			const scrollableDomNode = this._outputScrollbar.getDomNode();
			scrollableDomNode.tabIndex = 0;
			scrollableDomNode.style.maxHeight = `${MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT}px`;
			this._container.appendChild(scrollableDomNode);
			this._ensureOutputResizeObserver();
			this._outputContent = undefined;
			this._renderedOutputHeight = undefined;
		} else {
			this._ensureOutputResizeObserver();
		}
		this.updateAriaLabel();
		return true;
	}

	private async _collectOutput(terminalInstance: ITerminalInstance | undefined): Promise<{ text: string; truncated: boolean } | undefined> {
		const commandDetection = terminalInstance?.capabilities.get(TerminalCapability.CommandDetection);
		const commands = commandDetection?.commands;
		const xterm = await terminalInstance?.xtermReadyPromise;
		if (!commands || commands.length === 0 || !terminalInstance || !xterm) {
			return;
		}
		const commandId = this._terminalData.terminalCommandId ?? this._getStoredCommandId();
		if (!commandId) {
			return;
		}
		const command = commands.find(c => c.id === commandId);
		if (!command?.endMarker) {
			return;
		}
		const result = await xterm.getCommandOutputAsHtml(command, CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES);
		return { text: result.text, truncated: result.truncated ?? false };
	}

	private _getStoredCommandOutput(): { text: string; truncated: boolean } | undefined {
		const stored = this._terminalData.terminalCommandOutput;
		if (!stored?.text) {
			return;
		}
		return {
			text: stored.text,
			truncated: stored.truncated ?? false
		};
	}

	private _renderOutput(result: { text: string; truncated: boolean }): HTMLElement {
		this._lastOutputTruncated = result.truncated;
		const container = document.createElement('div');
		container.classList.add('chat-terminal-output-content');

		if (result.text.trim() === '') {
			container.classList.add('chat-terminal-output-content-empty');
			const empty = document.createElement('div');
			empty.classList.add('chat-terminal-output-empty');
			empty.textContent = localize('chat.terminalOutputEmpty', 'No output was produced by the command.');
			container.appendChild(empty);
		} else {
			const pre = document.createElement('pre');
			pre.classList.add('chat-terminal-output');
			domSanitize.safeSetInnerHtml(pre, result.text, sanitizerConfig);
			container.appendChild(pre);
		}

		if (result.truncated) {
			const note = document.createElement('div');
			note.classList.add('chat-terminal-output-info');
			note.textContent = localize('chat.terminalOutputTruncated', 'Output truncated to first {0} lines.', CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES);
			container.appendChild(note);
		}

		return container;
	}

	private _scheduleOutputRelayout(): void {
		dom.getActiveWindow().requestAnimationFrame(() => {
			this._layoutOutput();
			this._scrollOutputToBottom();
		});
	}

	private _layoutOutput(): void {
		if (!this._outputScrollbar || !this.isExpanded) {
			return;
		}
		const scrollableDomNode = this._outputScrollbar.getDomNode();
		const viewportHeight = Math.min(this._getOutputContentHeight(), MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT);
		scrollableDomNode.style.height = `${viewportHeight}px`;
		this._outputScrollbar.scanDomNode();
		if (this._renderedOutputHeight !== viewportHeight) {
			this._renderedOutputHeight = viewportHeight;
			this._onDidChangeHeight();
		}
	}

	private _scrollOutputToBottom(): void {
		if (!this._outputScrollbar) {
			return;
		}
		const dimensions = this._outputScrollbar.getScrollDimensions();
		this._outputScrollbar.setScrollPosition({ scrollTop: dimensions.scrollHeight });
	}

	private _getOutputContentHeight(): number {
		const firstChild = this._outputBody.firstElementChild as HTMLElement | null;
		if (!firstChild) {
			return this._outputBody.scrollHeight;
		}
		const style = dom.getComputedStyle(this._outputBody);
		const paddingTop = Number.parseFloat(style.paddingTop || '0');
		const paddingBottom = Number.parseFloat(style.paddingBottom || '0');
		const padding = paddingTop + paddingBottom;
		return firstChild.scrollHeight + padding;
	}

	private _ensureOutputResizeObserver(): void {
		if (this._outputResizeObserver || !this._outputScrollbar) {
			return;
		}
		const observer = new ResizeObserver(() => this._layoutOutput());
		observer.observe(this._container);
		this._outputResizeObserver = observer;
		this._register(toDisposable(() => {
			observer.disconnect();
			this._outputResizeObserver = undefined;
		}));
	}
}

export const focusMostRecentChatTerminalCommandId = 'workbench.action.chat.focusMostRecentChatTerminal';
export const focusMostRecentChatTerminalOutputCommandId = 'workbench.action.chat.focusMostRecentChatTerminalOutput';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: focusMostRecentChatTerminalCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ChatContextKeys.inChatSession,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyT,
	handler: async (accessor: ServicesAccessor) => {
		const terminalChatService = accessor.get(ITerminalChatService);
		const part = terminalChatService.getMostRecentProgressPart();
		if (!part) {
			return;
		}
		await part.focusTerminal();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: focusMostRecentChatTerminalOutputCommandId,
	weight: KeybindingWeight.WorkbenchContrib,
	when: ChatContextKeys.inChatSession,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyO,
	handler: async (accessor: ServicesAccessor) => {
		const terminalChatService = accessor.get(ITerminalChatService);
		const part = terminalChatService.getMostRecentProgressPart();
		if (!part) {
			return;
		}
		await part.toggleOutputFromKeyboard();
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: focusMostRecentChatTerminalCommandId,
		title: localize('chat.focusMostRecentTerminal', 'Chat: Focus Most Recent Terminal'),
	},
	when: ChatContextKeys.inChatSession
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: focusMostRecentChatTerminalOutputCommandId,
		title: localize('chat.focusMostRecentTerminalOutput', 'Chat: Focus Most Recent Terminal Output'),
	},
	when: ChatContextKeys.inChatSession
});

export const openTerminalSettingsLinkCommandId = '_chat.openTerminalSettingsLink';

CommandsRegistry.registerCommand(openTerminalSettingsLinkCommandId, async (accessor, scopeRaw: string) => {
	const preferencesService = accessor.get(IPreferencesService);

	if (scopeRaw === 'global') {
		preferencesService.openSettings({
			query: `@id:${ChatConfiguration.GlobalAutoApprove}`
		});
	} else {
		const scope = parseInt(scopeRaw);
		const target = !isNaN(scope) ? scope as ConfigurationTarget : undefined;
		const options: IOpenSettingsOptions = {
			jsonEditor: true,
			revealSetting: {
				key: TerminalContribSettingId.AutoApprove
			}
		};
		switch (target) {
			case ConfigurationTarget.APPLICATION: preferencesService.openApplicationSettings(options); break;
			case ConfigurationTarget.USER:
			case ConfigurationTarget.USER_LOCAL: preferencesService.openUserSettings(options); break;
			case ConfigurationTarget.USER_REMOTE: preferencesService.openRemoteSettings(options); break;
			case ConfigurationTarget.WORKSPACE:
			case ConfigurationTarget.WORKSPACE_FOLDER: preferencesService.openWorkspaceSettings(options); break;
			default: {
				// Fallback if something goes wrong
				preferencesService.openSettings({
					target: ConfigurationTarget.USER,
					query: `@id:${TerminalContribSettingId.AutoApprove}`,
				});
				break;
			}
		}
	}
});


class ToggleChatTerminalOutputAction extends Action implements IAction {
	private _expanded = false;

	constructor(
		private readonly _toggle: () => Promise<void>,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) {
		super(
			'chat.showTerminalOutput',
			localize('showTerminalOutput', 'Show Output'),
			ThemeIcon.asClassName(Codicon.chevronRight),
			true,
		);
		this._updateTooltip();
	}

	public override async run(): Promise<void> {
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
		const keybinding = this._keybindingService.lookupKeybinding(focusMostRecentChatTerminalOutputCommandId);
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
	) {
		super(
			'chat.focusTerminalInstance',
			isTerminalHidden ? localize('showTerminal', 'Show and Focus Terminal') : localize('focusTerminal', 'Focus Terminal'),
			ThemeIcon.asClassName(Codicon.openInProduct),
			true,
		);
		this._updateTooltip();
	}

	public override async run() {
		this.label = localize('focusTerminal', 'Focus Terminal');
		this._updateTooltip();
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
		const keybinding = this._keybindingService.lookupKeybinding(focusMostRecentChatTerminalCommandId);
		const label = keybinding?.getLabel();
		this.tooltip = label ? `${this.label} (${label})` : this.label;
	}
}
