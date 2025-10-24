/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
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
import { ChatConfiguration } from '../../../common/constants.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ITerminalChatService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { Action, IAction } from '../../../../../../base/common/actions.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalCommand, TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';

const MAX_TERMINAL_OUTPUT_PREVIEW_LENGTH = 20000;

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	private readonly _actionBar = this._register(new MutableDisposable<ActionBar>());

	private readonly _outputContainer: HTMLElement;
	private _outputContent: HTMLElement | undefined;

	private _showOutputAction: IAction | undefined;

	private readonly _terminalData: IChatTerminalToolInvocationData;
	private _attachedCommand: ITerminalCommand | undefined;
	private _terminalForOutput: ITerminalInstance | undefined;

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
			if (!instance || this._terminalForOutput === instance) {
				return;
			}
			this._terminalForOutput = instance;
			this._attachedCommand = this._resolveCommand(instance);
			this._registerInstanceListener(instance);
			await this._addFocusAction(instance, terminalToolSessionId);
		};

		await attachInstance(this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId));

		if (this._terminalForOutput) {
			return;
		}

		const listener = this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(instance => {
			if (instance !== this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId)) {
				return;
			}
			attachInstance(instance);
			listener.dispose();
		});
		this._register(listener);
	}

	private async _addFocusAction(terminalInstance: ITerminalInstance, terminalToolSessionId: string) {
		const isTerminalHidden = this._terminalChatService.isBackgroundTerminal(terminalToolSessionId);
		const focusAction = this._register(this._instantiationService.createInstance(FocusChatInstanceAction, terminalInstance, this._attachedCommand, isTerminalHidden));
		this._actionBar.value?.push(focusAction, { icon: true, label: false });
		await this._addShowOutputAction();
	}

	private async _addShowOutputAction() {
		this._showOutputAction = new Action(
			'chat.showTerminalOutput',
			localize('showTerminalOutput', 'Show Output'),
			ThemeIcon.asClassName(Codicon.chevronRight),
			true,
			async () => {
				if (!this._showOutputAction) {
					return;
				}
				const expanded = !this._outputContainer.classList.contains('expanded');
				this._outputContainer.classList.toggle('expanded', expanded);
				this._outputContainer.classList.toggle('collapsed', !expanded);

				if (expanded) {
					let didCreate = false;
					if (!this._outputContent && this._terminalForOutput) {
						const output = await this._collectOutput(this._terminalForOutput);
						this._outputContent = this._renderOutput(output);
						this._outputContainer.replaceChildren(this._outputContent);
						didCreate = true;
					}
					if (didCreate) {
						dom.getActiveWindow().requestAnimationFrame(() => {
							this._outputContainer.scrollTop = this._outputContainer.scrollHeight;
						});
					}
					this._showOutputAction.label = localize('hideTerminalOutput', 'Hide Output');
					this._showOutputAction.class = ThemeIcon.asClassName(Codicon.chevronDown);
				} else {
					this._showOutputAction.label = localize('showTerminalOutput', 'Show Output');
					this._showOutputAction.class = ThemeIcon.asClassName(Codicon.chevronRight);
				}
			}
		);
		this._actionBar.value?.push(this._showOutputAction, { icon: true, label: false });
	}

	private _registerInstanceListener(terminalInstance: ITerminalInstance) {
		const instanceListener = this._register(terminalInstance.onDisposed(() => {
			if (this._terminalForOutput === terminalInstance) {
				this._terminalForOutput = undefined;
				this._attachedCommand = undefined;
			}
			this._actionBar.value?.clear();
			instanceListener.dispose();
		}));
	}

	private async _collectOutput(terminalInstance: ITerminalInstance): Promise<{ text: string; truncated: boolean }> {
		this._attachedCommand ??= this._resolveCommand(terminalInstance);
		let text = this._attachedCommand?.getOutput() ?? '';

		if (!text && terminalInstance.xterm) {
			text = await terminalInstance.xterm.getContentsAsText();
		}

		if (!text) {
			return { text: '', truncated: false };
		}

		let truncated = false;
		if (text.length > MAX_TERMINAL_OUTPUT_PREVIEW_LENGTH) {
			text = text.slice(0, MAX_TERMINAL_OUTPUT_PREVIEW_LENGTH);
			truncated = true;
		}

		return { text, truncated };
	}

	private _renderOutput(result: { text: string; truncated: boolean }): HTMLElement {
		const container = document.createElement('div');
		container.classList.add('chat-terminal-output-content');

		const pre = document.createElement('pre');
		pre.classList.add('chat-terminal-output');
		pre.textContent = result.text || localize('chat.terminalNoOutput', 'No output captured for this command.');
		container.appendChild(pre);

		if (result.truncated) {
			const note = document.createElement('div');
			note.classList.add('chat-terminal-output-info');
			note.textContent = localize('chat.terminalOutputTruncated', 'Output truncated to first {0} characters.', MAX_TERMINAL_OUTPUT_PREVIEW_LENGTH);
			container.appendChild(note);
		}

		return container;
	}

	private _resolveCommand(instance: ITerminalInstance): ITerminalCommand | undefined {
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const commands = commandDetection?.commands;
		if (!commands || commands.length === 0) {
			return undefined;
		}

		const sessionId = this._terminalData.terminalToolSessionId;
		if (sessionId) {
			const bySession = commands.find(cmd => cmd.chatSessionId === sessionId);
			if (bySession) {
				return bySession;
			}
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

export class FocusChatInstanceAction extends Action implements IAction {
	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _command: ITerminalCommand | undefined,
		isTerminalHidden: boolean,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalService private readonly terminalService: ITerminalService,
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
		this.terminalService.setActiveInstance(this._instance);
		if (this._instance.target === TerminalLocation.Editor) {
			this._terminalEditorService.openEditor(this._instance);
		} else {
			await this._terminalGroupService.showPanel(true);
		}
		await this._instance?.focusWhenReady(true);

		// Reveal the command if available so the user immediately sees it.
		let commandToReveal = this._command;
		if (!commandToReveal) {
			const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
			commandToReveal = capability?.commands?.[capability.commands.length - 1];
		}
		if (commandToReveal) {
			this._instance.xterm?.markTracker.revealCommand(commandToReveal);
		}
	}
}
