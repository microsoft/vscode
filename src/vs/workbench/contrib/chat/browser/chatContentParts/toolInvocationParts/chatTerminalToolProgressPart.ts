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
import { IChatTerminalToolProgressPart, ITerminalChatService, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService, type IDetachedTerminalInstance } from '../../../../terminal/browser/terminal.js';
import { DetachedProcessInfo } from '../../../../terminal/browser/detachedTerminal.js';
import { TerminalInstanceColorProvider } from '../../../../terminal/browser/terminalInstance.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { Disposable, DisposableStore, ImmortalReference, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { DecorationSelector, getTerminalCommandDecorationState, getTerminalCommandDecorationTooltip } from '../../../../terminal/browser/xterm/decorationStyles.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalCommand, TerminalCapability, type ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { stripIcons } from '../../../../../../base/common/iconLabels.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { AccessibilityVerbositySettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { EditorPool } from '../chatContentCodePools.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { removeAnsiEscapeCodes } from '../../../../../../base/common/strings.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import type { XtermTerminal } from '../../../../terminal/browser/xterm/xtermTerminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

const MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT = 200;
const CSI_SEQUENCE_REGEX = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Remembers whether a tool invocation was last expanded so state survives virtualization re-renders.
 */
const expandedStateByInvocation = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

const MIN_OUTPUT_HEIGHT = 20;

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
	private readonly _hoverListener: MutableDisposable<IDisposable>;
	private readonly _focusListener: MutableDisposable<IDisposable>;
	private _interactionElement: HTMLElement | undefined;

	constructor(private readonly _options: ITerminalCommandDecorationOptions) {
		super();
		const decorationElements = h('span.chat-terminal-command-decoration@decoration', { role: 'img', tabIndex: 0 });
		this._element = decorationElements.decoration;
		this._hoverListener = this._register(new MutableDisposable<IDisposable>());
		this._focusListener = this._register(new MutableDisposable<IDisposable>());
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

		this._attachInteractionHandlers(decoration);
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
			decoration.setAttribute('title', hoverText);
			decoration.setAttribute('aria-label', hoverText);
		} else {
			decoration.removeAttribute('title');
			decoration.removeAttribute('aria-label');
		}
	}

	private _attachInteractionHandlers(decoration: HTMLElement): void {
		if (this._interactionElement === decoration) {
			return;
		}
		this._interactionElement = decoration;
		this._hoverListener.value = dom.addDisposableListener(decoration, dom.EventType.MOUSE_ENTER, () => {
			if (!decoration.isConnected) {
				return;
			}
			this._apply(decoration, this._options.getResolvedCommand());
		});
		this._focusListener.value = dom.addDisposableListener(decoration, dom.EventType.FOCUS_IN, () => {
			if (!decoration.isConnected) {
				return;
			}
			this._apply(decoration, this._options.getResolvedCommand());
		});
	}
}

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
	private readonly _decoration: TerminalCommandDecoration;
	private readonly _commandStreamingListener: MutableDisposable<DisposableStore>;
	private _streamingCommand: ITerminalCommand | undefined;
	private _trackedCommandId: string | undefined;
	private _streamingQueue: Promise<void>;

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
		@ITerminalConfigurationService private readonly _terminalConfigurationService: ITerminalConfigurationService,
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
			h('.chat-terminal-content-message@message'),
			h('.chat-terminal-output-container@output')
		]);

		this._decoration = this._register(new TerminalCommandDecoration({
			terminalData: this._terminalData,
			getCommandBlock: () => elements.commandBlock,
			getIconElement: () => undefined,
			getResolvedCommand: () => this._getResolvedCommand()
		}));
		this._commandStreamingListener = this._register(new MutableDisposable<DisposableStore>());
		this._streamingCommand = undefined;
		this._trackedCommandId = this._terminalData.terminalCommandId ?? this._storedCommandId;
		this._streamingQueue = Promise.resolve();

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
		const displayCommand = stripIcons(command);
		this._terminalOutputContextKey = ChatContextKeys.inChatTerminalToolOutput.bindTo(this._contextKeyService);

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
		const outputViewOptions: ChatTerminalToolOutputSectionOptions = {
			rowHeightPx: this._terminalConfigurationService.config.fontSize,
			container: elements.output,
			title: elements.title,
			displayCommand,
			terminalData: this._terminalData,
			accessibleViewService: this._accessibleViewService,
			onDidChangeHeight: () => this._onDidChangeHeight.fire(),
			createDetachedTerminal: () => this._createDetachedTerminal()
		};
		this._outputView = this._register(new ChatTerminalToolOutputSection(outputViewOptions));
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
		let resolvedCommand = command;
		if (!resolvedCommand) {
			resolvedCommand = this._getResolvedCommand();
		}
		const hasRenderableOutput = this._outputView.hasRenderableOutput();
		if (!resolvedCommand && !hasRenderableOutput && !this._streamingCommand) {
			return;
		}
		let showOutputAction = this._showOutputAction.value;
		if (!showOutputAction) {
			showOutputAction = this._instantiationService.createInstance(ToggleChatTerminalOutputAction, () => this._toggleOutputFromAction());
			this._showOutputAction.value = showOutputAction;
			if (resolvedCommand?.exitCode) {
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
		this._decoration.update();
		this._commandStreamingListener.clear();
		this._streamingCommand = undefined;
		this._trackedCommandId = undefined;
	}

	private _registerInstanceListener(terminalInstance: ITerminalInstance): void {
		const commandDetectionListener = this._register(new MutableDisposable<DisposableStore>());
		const tryResolveCommand = async (): Promise<ITerminalCommand | undefined> => {
			const resolvedCommand = this._resolveCommand(terminalInstance);
			this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
			return resolvedCommand;
		};

		const attachCommandDetection = async (commandDetection: ICommandDetectionCapability | undefined) => {
			commandDetectionListener.clear();
			this._commandStreamingListener.clear();
			this._streamingCommand = undefined;
			this._trackedCommandId = this._terminalData.terminalCommandId ?? this._storedCommandId;
			if (!commandDetection) {
				await tryResolveCommand();
				return;
			}
			const store = new DisposableStore();
			commandDetectionListener.value = store;

			store.add(commandDetection.onCommandExecuted(command => {
				if (this._streamingCommand) {
					return;
				}
				const commandId = command.id;
				const expectedId = this._trackedCommandId ?? this._terminalData.terminalCommandId ?? this._storedCommandId;
				const commandMatchesExpected = expectedId !== undefined && commandId !== undefined && commandId === expectedId;
				if (!commandMatchesExpected) {
					return;
				}
				this._streamingCommand = command;
				this._trackedCommandId = commandId ?? expectedId;
				if (commandId && this._terminalData.terminalCommandId !== commandId) {
					this._terminalData.terminalCommandId = commandId;
				}
				this._outputView.beginStreaming();
				this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
				const streamingStore = new DisposableStore();
				this._commandStreamingListener.value = streamingStore;
				let capturing = true;
				streamingStore.add(toDisposable(() => { capturing = false; }));
				this._queueStreaming(terminalInstance, command);
				streamingStore.add(terminalInstance.onData(() => {
					if (!capturing || streamingStore.isDisposed) {
						return;
					}
					const currentCommand = this._streamingCommand;
					if (!currentCommand) {
						return;
					}
					this._queueStreaming(terminalInstance, currentCommand).then(() => {
						if (capturing && this._outputView.isOutputTruncated) {
							capturing = false;
						}
					});
				}));
			}));

			store.add(commandDetection.onCommandFinished(async command => {
				if (!terminalInstance || this._store.isDisposed) {
					return;
				}
				const finishedId = command.id;
				const handledById = this._trackedCommandId !== undefined && finishedId !== undefined && finishedId === this._trackedCommandId;
				if (!handledById) {
					return;
				}
				if (finishedId && this._terminalData.terminalCommandId !== finishedId) {
					this._terminalData.terminalCommandId = finishedId;
				}
				this._addActions(terminalInstance, this._terminalData.terminalToolSessionId);
				const appliedEmptyOutput = this._tryApplyEmptyOutput(command);
				if (!appliedEmptyOutput) {
					await this._queueStreaming(terminalInstance, command);
				}
				this._outputView.endStreaming();
				this._commandStreamingListener.clear();
				this._streamingCommand = undefined;
				this._trackedCommandId = undefined;
				commandDetectionListener.clear();
			}));

			await tryResolveCommand();
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

	private async _createDetachedTerminal(): Promise<IDetachedTerminalInstance> {
		const targetRef = this._terminalInstance?.targetRef ?? new ImmortalReference<TerminalLocation | undefined>(undefined);
		const colorProvider = this._instantiationService.createInstance(TerminalInstanceColorProvider, targetRef);
		return this._terminalService.createDetachedTerminal({
			cols: this._terminalInstance?.cols ?? 80,
			rows: 10,
			readonly: true,
			processInfo: new DetachedProcessInfo({ initialCwd: '' }),
			colorProvider
		});
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


	private _queueStreaming(instance: ITerminalInstance, command: ITerminalCommand): Promise<void> {
		const run = async () => {
			if (this._store.isDisposed || this._streamingCommand !== command) {
				return;
			}
			await this._syncStreamingSnapshot(instance, command);
		};
		// Keep the queue alive even if a prior snapshot rejected (markers can disappear as terminals dispose).
		// Without catching here, a single rejection would leave the chain permanently rejected and skip future runs.
		const next = this._streamingQueue.catch(() => undefined).then(() => run());
		this._streamingQueue = next.catch(() => undefined);
		return next;
	}

	private async _syncStreamingSnapshot(instance: ITerminalInstance, command: ITerminalCommand): Promise<void> {
		if (!instance || this._store.isDisposed || this._streamingCommand !== command) {
			return;
		}
		const xterm = instance.xterm;
		if (!xterm) {
			return;
		}
		const markers = this._resolveCommandMarkers(command);
		const startMarker = markers.start;
		const endMarker = markers.end;
		if (!startMarker || startMarker.line === -1) {
			return;
		}
		if (endMarker?.line === -1) {
			return;
		}
		const data = await xterm.getRangeAsVT(startMarker, endMarker);
		if (this._store.isDisposed || this._streamingCommand !== command || data === undefined) {
			return;
		}
		this._outputView.applyStreamingSnapshot(data);
	}

	private _resolveCommandMarkers(command: ITerminalCommand): { start: IXtermMarker | undefined; end: IXtermMarker | undefined } {
		type CommandMarkers = {
			endMarker?: IXtermMarker;
			commandFinishedMarker?: IXtermMarker;
			executedMarker?: IXtermMarker;
			commandExecutedMarker?: IXtermMarker;
		};

		const candidate = command as unknown as CommandMarkers;
		const start = candidate.executedMarker ?? candidate.commandExecutedMarker;
		const end = candidate.endMarker ?? candidate.commandFinishedMarker;
		return { start, end };
	}

	private _tryApplyEmptyOutput(command: ITerminalCommand): boolean {
		// When a command produces no output, the serialize addon can still capture the prompt,
		// which visually leaks the prompt. Detect the narrow marker range and explicitly treat it
		// as empty so we render the "no output" message instead of the prompt itself.
		// We only call getOutput if the marker range is small to avoid performance issues.
		const markers = this._resolveCommandMarkers(command);
		const startLine = command.marker?.line ?? markers.start?.line;
		const endLine = markers.end?.line ?? command.endMarker?.line;
		if (
			startLine === undefined || endLine === undefined ||
			startLine === -1 || endLine === -1 ||
			endLine - startLine > 2
		) {
			return false;
		}

		const output = command.getOutput();
		if (output && output.trim().length > 0) {
			return false;
		}

		this._outputView.applyEmptyOutput();
		return true;
	}
}

interface ChatTerminalToolOutputSectionOptions {
	rowHeightPx: number;
	container: HTMLElement;
	title: HTMLElement;
	displayCommand: string;
	terminalData: IChatTerminalToolInvocationData;
	accessibleViewService: IAccessibleViewService;
	onDidChangeHeight: () => void;
	createDetachedTerminal: () => Promise<IDetachedTerminalInstance>;
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
	private readonly _createDetachedTerminal: () => Promise<IDetachedTerminalInstance>;

	private readonly _outputBody: HTMLElement;
	private readonly _scrollable: DomScrollableElement;
	private _terminalContainer: HTMLElement;
	private _infoElement: HTMLElement | undefined;
	private readonly _detachedTerminal: MutableDisposable<IDetachedTerminalInstance>;
	private _outputResizeObserver: ResizeObserver | undefined;
	private _renderedOutputHeight: number | undefined;
	private _lastOutputTruncated = false;
	private _bufferedLineCount = 0;
	private _currentLineCounted = false;
	private readonly _outputAriaLabelBase: string;
	private _needsReplay = false;
	private _isStreaming = false;
	private _streamBuffer: string[] = [];
	private _lastRawSnapshot: string | undefined;
	private _xtermElement: HTMLElement | undefined;
	private _xtermViewport: HTMLElement | undefined;

	private readonly _onDidFocusEmitter = new Emitter<void>();
	private readonly _onDidBlurEmitter = new Emitter<FocusEvent>();

	constructor(private readonly _options: ChatTerminalToolOutputSectionOptions) {
		super();
		this._detachedTerminal = this._register(new MutableDisposable<IDetachedTerminalInstance>());
		this._container = _options.container;
		this._title = _options.title;
		this._displayCommand = _options.displayCommand;
		this._terminalData = _options.terminalData;
		this._accessibleViewService = _options.accessibleViewService;
		this._onDidChangeHeight = _options.onDidChangeHeight;
		this._createDetachedTerminal = _options.createDetachedTerminal;
		this._outputAriaLabelBase = localize('chatTerminalOutputAriaLabel', 'Terminal output for {0}', this._displayCommand);

		this._container.classList.add('collapsed');
		this._container.tabIndex = -1;
		const elements = h('.chat-terminal-output-body@body', [
			h('.chat-terminal-output-terminal@terminal')
		]);
		this._outputBody = elements.body;
		this._terminalContainer = elements.terminal;
		this._scrollable = this._register(new DomScrollableElement(this._outputBody, {
			vertical: ScrollbarVisibility.Auto,
			horizontal: ScrollbarVisibility.Auto,
			handleMouseWheel: true
		}));
		const scrollableDomNode = this._scrollable.getDomNode();
		scrollableDomNode.tabIndex = 0;
		scrollableDomNode.classList.add('chat-terminal-output-scroll-host');
		this._container.appendChild(scrollableDomNode);
		this._ensureOutputResizeObserver();

		this.onDidFocus = this._onDidFocusEmitter.event;
		this.onDidBlur = this._onDidBlurEmitter.event;
		this._register(this._onDidFocusEmitter);
		this._register(this._onDidBlurEmitter);

		this._register(dom.addDisposableListener(this._container, dom.EventType.FOCUS_IN, () => this._onDidFocusEmitter.fire()));
		this._register(dom.addDisposableListener(this._container, dom.EventType.FOCUS_OUT, event => this._onDidBlurEmitter.fire(event as FocusEvent)));

		const storedOutput = this._terminalData.terminalCommandOutput;
		if (storedOutput?.text) {
			this._streamBuffer = [storedOutput.text];
			this._resetLineState();
			this._updateLineState(storedOutput.text);
			this._lastOutputTruncated = storedOutput.truncated ?? false;
			this._needsReplay = true;
		}
		this._setStatusMessages();
		this._updateTerminalVisibility();
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

		await this._ensureUiAndReplay();
		this._layoutOutput();
		this._scrollOutputToBottom();
		this._scheduleOutputRelayout();
		return true;
	}

	public async ensureRendered(): Promise<void> {
		if (!this.isExpanded) {
			return;
		}
		await this._ensureUiAndReplay();
		this._layoutOutput();
		this._scrollOutputToBottom();
	}

	public focus(): void {
		if (this._shouldRenderTerminal()) {
			this._container.focus();
			return;
		}
		this._scrollable.getDomNode().focus();
	}

	public containsElement(element: HTMLElement | null): boolean {
		return !!element && this._container.contains(element);
	}

	public updateAriaLabel(): void {
		const shouldRender = this._shouldRenderTerminal();
		const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.TerminalChatOutput);
		const label = accessibleViewHint ? `${this._outputAriaLabelBase}, ${accessibleViewHint}` : this._outputAriaLabelBase;
		const scrollableDomNode = this._scrollable.getDomNode();
		if (shouldRender) {
			this._container.setAttribute('role', 'region');
			this._container.setAttribute('aria-label', label);
			scrollableDomNode.removeAttribute('role');
			scrollableDomNode.removeAttribute('aria-label');
		} else {
			scrollableDomNode.setAttribute('role', 'region');
			scrollableDomNode.setAttribute('aria-label', label);
			this._container.removeAttribute('role');
			this._container.removeAttribute('aria-label');
		}
	}

	public getCommandAndOutputAsText(): string | undefined {
		const commandHeader = localize('chatTerminalOutputAccessibleViewHeader', 'Command: {0}', this._displayCommand);
		const bufferText = removeAnsiEscapeCodes(this._streamBuffer.join('')).trimEnd();
		if (!bufferText) {
			return `${commandHeader}\n${localize('chat.terminalOutputEmpty', 'No output was produced by the command.')}`;
		}
		let result = `${commandHeader}\n${bufferText}`;
		if (this._lastOutputTruncated) {
			result += `\n\n${localize('chat.terminalOutputTruncated', 'Output truncated to first {0} lines.', CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES)}`;
		}
		return result;
	}

	public appendStreamingData(data: string): boolean {
		// Streams raw chunks into the preview buffer, enforcing the configured line limit and
		// mirroring any appended data into the detached xterm when it's live.
		if (!data || this._lastOutputTruncated) {
			return this._lastOutputTruncated;
		}
		this._isStreaming = true;
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '', truncated: false });
		const maxLines = CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES;
		const remainingLines = Math.max(0, maxLines - this._bufferedLineCount);
		const trimmed = this._trimToRemainingLines(data, remainingLines);
		const wasTrimmed = trimmed.length < data.length;
		if (!trimmed) {
			this._lastOutputTruncated = true;
			this._isStreaming = false;
			storedOutput.truncated = true;
			const combined = this._streamBuffer.join('');
			storedOutput.text = combined;
			this._setStatusMessages();
			this._updateTerminalVisibility();
			return true;
		}
		this._streamBuffer.push(trimmed);
		this._updateLineState(trimmed);
		storedOutput.text += trimmed;

		if (this.isExpanded && this._detachedTerminal.value) {
			this._detachedTerminal.value.xterm.write(trimmed);
			this._scrollOutputToBottom();
		} else {
			this._needsReplay = true;
		}
		if (this.isExpanded) {
			this._scheduleOutputRelayout();
		}
		this._updateTerminalVisibility();

		if (wasTrimmed || this._bufferedLineCount >= maxLines) {
			this._lastOutputTruncated = true;
			this._isStreaming = false;
			storedOutput.truncated = true;
			const combined = this._streamBuffer.join('');
			storedOutput.text = combined;
			this._setStatusMessages();
			this._updateTerminalVisibility();
			return true;
		}
		storedOutput.truncated = false;
		this._updateTerminalVisibility();
		const combined = this._streamBuffer.join('');
		storedOutput.text = combined;
		storedOutput.truncated = this._lastOutputTruncated;
		return false;
	}

	public applyStreamingSnapshot(snapshot: string): void {
		// Applies a serialized VT snapshot captured from the command markers. We try to diff the
		// new snapshot against the previously seen content to avoid costly full replays.
		if (this._lastRawSnapshot === snapshot) {
			return;
		}
		if (!this._lastRawSnapshot) {
			this._replaceStreamingDataFromRaw(snapshot);
			this._lastRawSnapshot = snapshot;
			return;
		}
		if (snapshot.startsWith(this._lastRawSnapshot)) {
			const appended = snapshot.slice(this._lastRawSnapshot.length);
			if (appended.length) {
				this.appendStreamingData(appended);
			}
			this._lastRawSnapshot = snapshot;
			return;
		}
		if (this._lastRawSnapshot.startsWith(snapshot)) {
			this._replaceStreamingDataFromRaw(snapshot);
			this._lastRawSnapshot = snapshot;
			return;
		}
		this._replaceStreamingDataFromRaw(snapshot);
		this._lastRawSnapshot = snapshot;
	}

	public applyEmptyOutput(): void {
		// Resets the preview state when the command produced no output so that prompts are not
		// surfaced as command output.
		this._isStreaming = false;
		this._streamBuffer = [];
		this._resetLineState();
		this._lastOutputTruncated = false;
		this._lastRawSnapshot = undefined;
		this._needsReplay = false;
		this._disposeDetachedTerminal();
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '', truncated: false });
		storedOutput.text = '';
		storedOutput.truncated = false;
		this._setStatusMessages();
		this._updateTerminalVisibility();
		this._scrollable.scanDomNode();
	}

	private _replaceStreamingDataFromRaw(snapshot: string): void {
		// Rebuilds the preview buffer from scratch using a serialized snapshot. This is used when
		// the diff path cannot determine an incremental change.
		const storedOutput = this._terminalData.terminalCommandOutput ?? (this._terminalData.terminalCommandOutput = { text: '', truncated: false });
		this._streamBuffer = [];
		this._resetLineState();
		this._lastOutputTruncated = false;
		storedOutput.text = '';
		storedOutput.truncated = false;

		const hasDetached = !!(this._detachedTerminal.value && this.isExpanded);
		if (hasDetached) {
			this._clearDetachedTerminal();
			this._needsReplay = false;
		} else {
			this._needsReplay = true;
		}

		if (!snapshot) {
			this._setStatusMessages();
			this._updateTerminalVisibility();
			return;
		}

		this.appendStreamingData(snapshot);
	}

	private _clearDetachedTerminal(): void {
		// Clears the detached xterm prior to replaying content so the terminal reflects the latest
		// snapshot exactly.
		const instance = this._detachedTerminal.value;
		if (!instance) {
			return;
		}
		const xterm = instance.xterm as unknown as XtermTerminal | undefined;
		if (!xterm) {
			return;
		}
		try {
			xterm.raw.clear();
			xterm.write('\x1b[3J\x1b[2J\x1b[H');
		} catch {
			// The detached terminal may be mid-dispose; ignore errors when clearing.
		}
	}

	public beginStreaming(): void {
		// Resets streaming state just before a command starts emitting fresh data.
		this._isStreaming = true;
		this._streamBuffer = [];
		this._resetLineState();
		this._lastOutputTruncated = false;
		this._lastRawSnapshot = undefined;
		this._needsReplay = true;
		if (this._detachedTerminal.value) {
			this._clearDetachedTerminal();
		}
		this._terminalData.terminalCommandOutput = { text: '', truncated: false };
		this._setSupplementalMessages([]);
		this._scrollable.scanDomNode();
		this._updateTerminalVisibility();
	}

	public endStreaming(): void {
		this._isStreaming = false;
		this._setStatusMessages();
		this._updateTerminalVisibility();
	}

	public hasRenderableOutput(): boolean {
		return this._hasRenderableOutput();
	}

	public get isOutputTruncated(): boolean {
		return this._lastOutputTruncated;
	}

	private _hasRenderableOutput(): boolean {
		return this._streamBuffer.some(chunk => {
			const withoutCsi = chunk.replace(CSI_SEQUENCE_REGEX, '');
			const withoutAnsi = removeAnsiEscapeCodes(withoutCsi);
			return withoutAnsi.replace(/\r/g, '').trim().length > 0;
		});
	}

	private _shouldRenderTerminal(): boolean {
		return this._isStreaming || this._hasRenderableOutput();
	}

	private _updateTerminalVisibility(): void {
		const shouldRender = this._shouldRenderTerminal();
		const scrollableDomNode = this._scrollable.getDomNode();
		this._terminalContainer.classList.toggle('chat-terminal-output-terminal-no-output', !shouldRender);
		this._container.tabIndex = shouldRender ? 0 : -1;
		scrollableDomNode.tabIndex = shouldRender ? -1 : 0;
		if (!shouldRender) {
			this._disposeDetachedTerminal();
		} else {
			this._ensureOutputResizeObserver();
		}
		this.updateAriaLabel();
	}

	private _disposeDetachedTerminal(): void {
		if (this._detachedTerminal.value) {
			this._detachedTerminal.clear();
		}
		if (this._outputResizeObserver) {
			this._outputResizeObserver.disconnect();
			this._outputResizeObserver = undefined;
		}
		this._xtermElement = undefined;
		this._xtermViewport = undefined;
		dom.clearNode(this._terminalContainer);
	}

	private _setExpanded(expanded: boolean): void {
		this._container.classList.toggle('expanded', expanded);
		this._container.classList.toggle('collapsed', !expanded);
		this._title.classList.toggle('expanded', expanded);
		if (!expanded) {
			const domNode = this._scrollable.getDomNode();
			domNode.style.removeProperty('height');
			domNode.style.removeProperty('max-height');
		}
	}

	private async _ensureUiAndReplay(): Promise<void> {
		if (!this._shouldRenderTerminal()) {
			this._updateTerminalVisibility();
			this.updateAriaLabel();
			return;
		}

		await this._ensureDetachedTerminalInstance();
		if (this._needsReplay) {
			await this._replayBuffer();
		}
		this._updateTerminalVisibility();
		this.updateAriaLabel();
	}

	private async _replayBuffer(): Promise<void> {
		const instance = await this._ensureDetachedTerminalInstance();
		if (!instance) {
			return;
		}
		this._clearDetachedTerminal();
		const concatenated = this._streamBuffer.join('');
		if (concatenated) {
			instance.xterm.write(concatenated);
		}
		this._needsReplay = false;
		this._setStatusMessages();
		this._scrollOutputToBottom();
	}

	private _scheduleOutputRelayout(): void {
		dom.getActiveWindow().requestAnimationFrame(() => {
			this._layoutOutput();
			this._scrollOutputToBottom();
		});
	}

	private _layoutOutput(): void {
		if (!this._terminalContainer || !this.isExpanded) {
			return;
		}
		const contentHeight = Math.max(this._calculateVisibleContentHeight(), MIN_OUTPUT_HEIGHT);
		const clampedHeight = Math.min(contentHeight, MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT);
		const measuredBodyHeight = Math.max(this._outputBody.scrollHeight, MIN_OUTPUT_HEIGHT);
		const appliedHeight = Math.min(clampedHeight, measuredBodyHeight);
		const domNode = this._scrollable?.getDomNode();
		if (domNode) {
			domNode.style.maxHeight = `${MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT}px`;
			domNode.style.height = `${appliedHeight}px`;
			this._scrollable?.scanDomNode();
		}
		if (this._renderedOutputHeight !== appliedHeight) {
			this._renderedOutputHeight = appliedHeight;
			this._onDidChangeHeight();
		}
	}

	private _scrollOutputToBottom(): void {
		if (this._xtermViewport) {
			this._xtermViewport.scrollTop = this._xtermViewport.scrollHeight;
		}
		this._scrollable.scanDomNode();
		const dimensions = this._scrollable.getScrollDimensions();
		this._scrollable.setScrollPosition({ scrollTop: dimensions.scrollHeight });
	}

	private _ensureOutputResizeObserver(): void {
		if (this._outputResizeObserver || !this._terminalContainer) {
			return;
		}
		const observer = new ResizeObserver(() => this._layoutOutput());
		if (this._xtermViewport) {
			observer.observe(this._xtermViewport);
		}
		observer.observe(this._terminalContainer);
		this._outputResizeObserver = observer;
		this._register(toDisposable(() => {
			observer.disconnect();
			this._outputResizeObserver = undefined;
		}));
	}

	private _calculateVisibleContentHeight(): number {
		const nonEmptyLines = this._countNonEmptyStreamLines();
		const effectiveLines = Math.max(nonEmptyLines, 1);
		const infoHeight = this._infoElement?.offsetHeight ?? 0;
		// TODO: handle this better, call some function that tells us if there's any output instead of checking text content
		if (this._infoElement?.textContent.includes('No output was produced by the command.')) {
			return infoHeight;
		}
		return Math.max(effectiveLines * this._options.rowHeightPx + infoHeight, this._options.rowHeightPx);
	}

	private _countNonEmptyStreamLines(): number {
		if (!this._streamBuffer.length) {
			return 0;
		}
		return Math.min(this._bufferedLineCount, CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES);
	}

	private async _ensureDetachedTerminalInstance(): Promise<IDetachedTerminalInstance | undefined> {
		if (!this._shouldRenderTerminal()) {
			return undefined;
		}
		const existing = this._detachedTerminal.value;
		if (existing) {
			if (!this._xtermElement) {
				this._captureXtermElements(existing);
			}
			return existing;
		}
		try {
			const instance = await this._createDetachedTerminal();
			this._detachedTerminal.value = instance;
			instance.attachToElement(this._terminalContainer);
			this._captureXtermElements(instance);
			this._scrollable.scanDomNode();
			return instance;
		} catch {
			return undefined;
		}
	}

	private _captureXtermElements(instance: IDetachedTerminalInstance): void {
		const xterm = instance.xterm as unknown as XtermTerminal | undefined;
		const rawElement = xterm?.raw.element;
		if (!rawElement) {
			this._xtermElement = undefined;
			this._xtermViewport = undefined;
			return;
		}

		// This is needed because xterm is not guaranteed to be created in the constructor,
		// so we can't create and store the references earlier.
		const findElementWithClass = (
			root: Element | undefined,
			className: string
		): HTMLElement | undefined => {
			if (!root) {
				return;
			}

			const stack = [root];

			while (stack.length) {
				const cur = stack.pop()!;
				if (dom.isHTMLElement(cur) && cur.classList.contains(className)) {
					return cur;
				}
				for (let i = cur.children.length - 1; i >= 0; i--) {
					stack.push(cur.children[i]);
				}
			}
			return;
		};

		const xtermElement = rawElement.classList.contains('xterm')
			? rawElement
			: findElementWithClass(rawElement, 'xterm');

		this._xtermElement = xtermElement ?? rawElement;
		const searchRoot = xtermElement ?? rawElement;
		this._xtermViewport = findElementWithClass(searchRoot, 'xterm-viewport');
		if (this._outputResizeObserver) {
			this._outputResizeObserver.disconnect();
			this._outputResizeObserver = undefined;
		}
		this._ensureOutputResizeObserver();
	}

	private _setStatusMessages(): void {
		const messages: string[] = [];
		const hasOutput = this._hasRenderableOutput();
		if (!hasOutput && !this._isStreaming) {
			messages.push(localize('chat.terminalOutputEmpty', 'No output was produced by the command.'));
		}
		if (this._lastOutputTruncated) {
			messages.push(localize('chat.terminalOutputTruncated', 'Output truncated to first {0} lines.', CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES));
		}
		this._setSupplementalMessages(messages);
	}

	private _setSupplementalMessages(messages: string[]): void {
		const hasContent = messages.some(message => message.trim().length > 0);
		if (!hasContent) {
			if (this._infoElement) {
				this._infoElement.remove();
				this._infoElement = undefined;
			}
			this._scrollable.scanDomNode();
			return;
		}
		if (!this._infoElement) {
			this._infoElement = dom.$('div.chat-terminal-output-info');
			this._outputBody.appendChild(this._infoElement);
		}
		this._infoElement.textContent = messages.join('\n\n');
		this._scrollable.scanDomNode();
	}

	private _resetLineState(): void {
		this._bufferedLineCount = 0;
		this._currentLineCounted = false;
	}

	private _updateLineState(chunk: string): void {
		if (!chunk) {
			return;
		}
		const { lineCount, lineHasContent } = this._processLineState(chunk);
		this._bufferedLineCount = lineCount;
		this._currentLineCounted = lineHasContent;
	}

	private _trimToRemainingLines(data: string, remainingLines: number): string {
		if (!data) {
			return '';
		}
		const { processedLength } = this._processLineState(data, remainingLines);
		return data.slice(0, processedLength);
	}

	private _processLineState(chunk: string, maxAdditionalLines?: number): { processedLength: number; lineCount: number; lineHasContent: boolean } {
		let lineCount = this._bufferedLineCount;
		let lineHasContent = this._currentLineCounted;
		const enforceLimit = typeof maxAdditionalLines === 'number';
		let linesRemaining = enforceLimit ? maxAdditionalLines! : Number.POSITIVE_INFINITY;
		for (let i = 0; i < chunk.length; i++) {
			const code = chunk.charCodeAt(i);
			if (code === 10 /* \n */) {
				if (enforceLimit && !lineHasContent && linesRemaining <= 0) {
					return { processedLength: i, lineCount, lineHasContent, };
				}
				lineHasContent = false;
				continue;
			}
			if (code === 13 /* \r */) {
				continue;
			}
			const char = chunk.charAt(i);
			if (!lineHasContent && char.trim().length === 0) {
				if (enforceLimit && linesRemaining <= 0) {
					return { processedLength: i, lineCount, lineHasContent };
				}
				continue;
			}
			if (!lineHasContent) {
				if (enforceLimit && linesRemaining <= 0) {
					return { processedLength: i, lineCount, lineHasContent };
				}
				lineHasContent = true;
				lineCount++;
				if (enforceLimit) {
					linesRemaining--;
				}
			}
		}
		return { processedLength: chunk.length, lineCount, lineHasContent };
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
export const disableSessionAutoApprovalCommandId = '_chat.disableSessionAutoApproval';

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

CommandsRegistry.registerCommand(disableSessionAutoApprovalCommandId, async (accessor, chatSessionId: string) => {
	const terminalChatService = accessor.get(ITerminalChatService);
	terminalChatService.setChatSessionAutoApproval(chatSessionId, false);
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
