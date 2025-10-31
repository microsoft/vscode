/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IPreferencesService, type IOpenSettingsOptions } from '../../../../../services/preferences/common/preferences.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../common/chat.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, type IChatMarkdownContent, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { ChatQueryTitlePart } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from '../chatMarkdownContentPart.js';
import { ChatProgressSubPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatTerminalToolProgressPart.css';
import { TerminalContribSettingId } from '../../../../terminal/terminalContribExports.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import type { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { ChatConfiguration, CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES } from '../../../common/constants.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ITerminalChatService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { localize } from '../../../../../../nls.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalCommand, TerminalCapability, type ICommandDetectionCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import * as domSanitize from '../../../../../../base/browser/domSanitize.js';
import { DomSanitizerConfig } from '../../../../../../base/browser/domSanitize.js';
import { allowedMarkdownHtmlAttributes } from '../../../../../../base/browser/markdownRenderer.js';
import { URI } from '../../../../../../base/common/uri.js';

const MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT = 200;

const sanitizerConfig = Object.freeze<DomSanitizerConfig>({
	allowedTags: {
		augment: ['b', 'i', 'u', 'code', 'span', 'div', 'body', 'pre'],
	},
	allowedAttributes: {
		augment: [...allowedMarkdownHtmlAttributes, 'style']
	}
});

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	private readonly _actionBar = this._register(new MutableDisposable<ActionBar>());

	private readonly _outputContainer: HTMLElement;
	private readonly _outputBody: HTMLElement;
	private readonly _titlePart: HTMLElement;
	private _outputScrollbar: DomScrollableElement | undefined;
	private _outputContent: HTMLElement | undefined;
	private _outputResizeObserver: ResizeObserver | undefined;

	private readonly _showOutputAction = this._register(new MutableDisposable<ToggleChatTerminalOutputAction>());
	private _showOutputActionAdded = false;
	private readonly _focusAction = this._register(new MutableDisposable<FocusChatInstanceAction>());

	private readonly _terminalData: IChatTerminalToolInvocationData;
	private _terminalInstance: ITerminalInstance | undefined;

	private markdownPart: ChatMarkdownContentPart | undefined;
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? [];
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
	) {
		super(toolInvocation);

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
		this._terminalData = terminalData;

		const elements = h('.chat-terminal-content-part@container', [
			h('.chat-terminal-content-title@title'),
			h('.chat-terminal-content-message@message'),
			h('.chat-terminal-output-container@output')
		]);

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;

		this._titlePart = elements.title;
		const titlePart = this._register(_instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.title,
			new MarkdownString(`$(${Codicon.terminal.id})\n\n\`\`\`${terminalData.language}\n${command}\n\`\`\``, { supportThemeIcons: true }),
			undefined,
		));
		this._register(titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		// Wait for terminal reconnection to ensure the terminal instance is available
		this._terminalService.whenConnected.then(async () => {
			// Append the action bar element after the title has been populated so flex order hacks aren't required.
			const actionBarEl = h('.chat-terminal-action-bar@actionBar');
			elements.title.append(actionBarEl.root);
			await this._createActionBar({ actionBar: actionBarEl.actionBar });
		});
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
		this.markdownPart = this._register(_instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {}, currentWidthDelegate(), codeBlockModelCollection, { codeBlockRenderOptions }));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		elements.message.append(this.markdownPart.domNode);
		this._outputContainer = elements.output;
		this._outputContainer.classList.add('collapsed');
		this._outputBody = dom.$('.chat-terminal-output-body');

		const progressPart = this._register(_instantiationService.createInstance(ChatProgressSubPart, elements.container, this.getIcon(), terminalData.autoApproveInfo));
		this.domNode = progressPart.domNode;
	}

	private async _createActionBar(elements: { actionBar: HTMLElement }): Promise<void> {
		this._actionBar.value = new ActionBar(elements.actionBar, {});

		const terminalToolSessionId = this._terminalData.terminalToolSessionId;
		if (!terminalToolSessionId) {
			return;
		}

		const attachInstance = async (instance: ITerminalInstance | undefined) => {
			if (!instance || this._terminalInstance === instance) {
				return;
			}
			this._terminalInstance = instance;
			this._registerInstanceListener(instance);
			await this._addFocusAction(instance, terminalToolSessionId);
			if (this._terminalData?.output?.html) {
				this._ensureShowOutputAction();
			}
		};

		await attachInstance(await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId));

		const listener = this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(async instance => {
			if (instance !== await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId)) {
				return;
			}
			attachInstance(instance);
			listener.dispose();
		});
		this._register(listener);
	}

	private async _addFocusAction(terminalInstance: ITerminalInstance, terminalToolSessionId: string) {
		if (!this._actionBar.value) {
			return;
		}
		const isTerminalHidden = this._terminalChatService.isBackgroundTerminal(terminalToolSessionId);
		const command = this._getResolvedCommand(terminalInstance);
		const focusAction = this._instantiationService.createInstance(FocusChatInstanceAction, terminalInstance, command, isTerminalHidden);
		this._focusAction.value = focusAction;
		this._actionBar.value.push(focusAction, { icon: true, label: false, index: 0 });
		this._ensureShowOutputAction();
	}

	private _ensureShowOutputAction(): void {
		if (!this._actionBar.value) {
			return;
		}
		const hasSerializedOutput = !!this._terminalData.output?.html;
		const commandFinished = !!this._getResolvedCommand()?.endMarker;
		if (!hasSerializedOutput && !commandFinished) {
			return;
		}
		let showOutputAction = this._showOutputAction.value;
		if (!showOutputAction) {
			showOutputAction = new ToggleChatTerminalOutputAction(expanded => this._toggleOutput(expanded));
			this._showOutputAction.value = showOutputAction;
		}
		showOutputAction.syncPresentation(this._outputContainer.classList.contains('expanded'));

		const actionBar = this._actionBar.value;
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

	private _getResolvedCommand(instance?: ITerminalInstance): ITerminalCommand | undefined {
		const target = instance ?? this._terminalInstance;
		if (!target) {
			return undefined;
		}
		return this._resolveCommand(target);
	}

	private _registerInstanceListener(terminalInstance: ITerminalInstance) {
		const commandDetectionListener = this._register(new MutableDisposable<IDisposable>());
		const tryResolveCommand = (): ITerminalCommand | undefined => {
			const resolvedCommand = this._resolveCommand(terminalInstance);
			if (resolvedCommand?.endMarker) {
				this._ensureShowOutputAction();
			}
			return resolvedCommand;
		};

		const attachCommandDetection = (commandDetection: ICommandDetectionCapability | undefined) => {
			commandDetectionListener.clear();
			if (!commandDetection) {
				return;
			}

			const resolvedImmediately = tryResolveCommand();
			if (resolvedImmediately?.endMarker) {
				return;
			}

			commandDetectionListener.value = commandDetection.onCommandFinished(() => {
				this._ensureShowOutputAction();
				commandDetectionListener.clear();
			});
		};

		attachCommandDetection(terminalInstance.capabilities.get(TerminalCapability.CommandDetection));
		this._register(terminalInstance.capabilities.onDidAddCommandDetectionCapability(cd => attachCommandDetection(cd)));

		const instanceListener = this._register(terminalInstance.onDisposed(() => {
			if (this._terminalInstance === terminalInstance) {
				this._terminalInstance = undefined;
			}
			commandDetectionListener.clear();
			this._actionBar.clear();
			this._focusAction.clear();
			const keepOutputAction = !!this._terminalData.output?.html;
			this._showOutputActionAdded = false;
			if (!keepOutputAction) {
				this._showOutputAction.clear();
			}
			this._ensureShowOutputAction();
			instanceListener.dispose();
		}));
	}

	private async _toggleOutput(expanded: boolean): Promise<boolean> {
		const currentlyExpanded = this._outputContainer.classList.contains('expanded');
		if (expanded === currentlyExpanded) {
			this._showOutputAction.value?.syncPresentation(currentlyExpanded);
			return false;
		}

		this._setOutputExpanded(expanded);

		if (!expanded) {
			this._layoutOutput();
			this._showOutputAction.value?.syncPresentation(false);
			return true;
		}

		const didCreate = await this._renderOutputIfNeeded();
		this._layoutOutput();
		this._scrollOutputToBottom();
		if (didCreate) {
			this._scheduleOutputRelayout();
		}
		this._showOutputAction.value?.syncPresentation(expanded);
		return true;
	}

	private _setOutputExpanded(expanded: boolean): void {
		this._outputContainer.classList.toggle('expanded', expanded);
		this._outputContainer.classList.toggle('collapsed', !expanded);
		this._titlePart.classList.toggle('expanded', expanded);
	}

	private async _renderOutputIfNeeded(): Promise<boolean> {
		if (this._outputContent) {
			this._ensureOutputResizeObserver();
			return false;
		}

		if (!this._terminalInstance) {
			const resource = this._getTerminalResource();
			if (resource) {
				this._terminalInstance = this._terminalService.getInstanceFromResource(resource);
			}
		}
		const output = await this._collectOutput(this._terminalInstance);
		const content = this._renderOutput(output);
		const theme = this._terminalInstance?.xterm?.getXtermTheme();
		if (theme) {
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
			this._outputContainer.appendChild(scrollableDomNode);
			this._ensureOutputResizeObserver();
			this._outputContent = undefined;
		} else {
			this._ensureOutputResizeObserver();
		}

		return true;
	}

	private _scrollOutputToBottom(): void {
		if (!this._outputScrollbar) {
			return;
		}
		const dimensions = this._outputScrollbar.getScrollDimensions();
		this._outputScrollbar.setScrollPosition({ scrollTop: dimensions.scrollHeight });
	}

	private _scheduleOutputRelayout(): void {
		dom.getActiveWindow().requestAnimationFrame(() => {
			this._layoutOutput();
			this._scrollOutputToBottom();
		});
	}

	private _layoutOutput(): void {
		if (!this._outputScrollbar || !this._outputContainer.classList.contains('expanded')) {
			return;
		}
		const scrollableDomNode = this._outputScrollbar.getDomNode();
		const viewportHeight = Math.min(this._outputBody.scrollHeight, MAX_TERMINAL_OUTPUT_PREVIEW_HEIGHT);
		scrollableDomNode.style.height = `${viewportHeight}px`;
		this._outputScrollbar.scanDomNode();
	}

	private _ensureOutputResizeObserver(): void {
		if (this._outputResizeObserver || !this._outputScrollbar) {
			return;
		}
		const observer = new ResizeObserver(() => this._layoutOutput());
		observer.observe(this._outputContainer);
		this._outputResizeObserver = observer;
		this._register(toDisposable(() => {
			observer.disconnect();
			this._outputResizeObserver = undefined;
		}));
	}

	private async _collectOutput(terminalInstance: ITerminalInstance | undefined): Promise<{ text: string; truncated: boolean }> {
		const storedOutput = this._terminalData.output;
		if (storedOutput?.html) {
			return { text: storedOutput.html, truncated: storedOutput.truncated ?? false };
		}
		if (!terminalInstance) {
			return { text: '', truncated: false };
		}
		const xterm = await terminalInstance.xtermReadyPromise;
		if (!xterm) {
			return { text: '', truncated: false };
		}
		const command = this._resolveCommand(terminalInstance);
		if (!command?.endMarker) {
			return { text: '', truncated: false };
		}
		const text = await xterm.getCommandOutputAsHtml(command, CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES);
		if (!text) {
			return { text: '', truncated: false };
		}

		return { text, truncated: false };
	}

	private _renderOutput(result: { text: string; truncated: boolean }): HTMLElement {
		const container = document.createElement('div');
		container.classList.add('chat-terminal-output-content');

		const pre = document.createElement('pre');
		pre.classList.add('chat-terminal-output');
		domSanitize.safeSetInnerHtml(pre, result.text, sanitizerConfig);
		container.appendChild(pre);

		if (result.truncated) {
			const note = document.createElement('div');
			note.classList.add('chat-terminal-output-info');
			note.textContent = localize('chat.terminalOutputTruncated', 'Output truncated to first {0} characters.', CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES);
			container.appendChild(note);
		}

		return container;
	}

	private _getTerminalResource(): URI | undefined {
		const commandUri = this._terminalData.terminalCommandUri;
		if (!commandUri) {
			return undefined;
		}
		return URI.isUri(commandUri) ? commandUri : URI.revive(commandUri);
	}


	private _resolveCommand(instance: ITerminalInstance): ITerminalCommand | undefined {
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const commands = commandDetection?.commands;
		if (!commands || commands.length === 0) {
			return undefined;
		}

		const commandId = this._terminalChatService.getTerminalCommandIdByToolSessionId(this._terminalData.terminalToolSessionId);
		if (commandId) {
			return commands.find(c => c.id === commandId);
		}
		return;
	}
}

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

	constructor(private readonly _toggle: (expanded: boolean) => Promise<boolean>) {
		super(
			'chat.showTerminalOutput',
			localize('showTerminalOutput', 'Show Output'),
			ThemeIcon.asClassName(Codicon.chevronRight),
			true,
		);
	}

	public override async run(): Promise<void> {
		const target = !this._expanded;
		await this._toggle(target);
	}

	public syncPresentation(expanded: boolean): void {
		this._expanded = expanded;
		this._updatePresentation();
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
}

export class FocusChatInstanceAction extends Action implements IAction {
	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _command: ITerminalCommand | undefined,
		isTerminalHidden: boolean,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
	) {
		super(
			'chat.focusTerminalInstance',
			isTerminalHidden ? localize('showTerminal', 'Show Terminal') : localize('focusTerminal', 'Focus Terminal'),
			ThemeIcon.asClassName(Codicon.openInProduct),
			true,
		);
	}

	public override async run() {
		this.label = localize('focusTerminal', 'Focus Terminal');
		this._terminalService.setActiveInstance(this._instance);
		if (this._instance.target === TerminalLocation.Editor) {
			this._terminalEditorService.openEditor(this._instance);
		} else {
			await this._terminalGroupService.showPanel(true);
		}
		this._terminalService.setActiveInstance(this._instance);
		await this._instance?.focusWhenReady(true);
		if (this._command) {
			this._instance.xterm?.markTracker.revealCommand(this._command);
		}
	}
}
