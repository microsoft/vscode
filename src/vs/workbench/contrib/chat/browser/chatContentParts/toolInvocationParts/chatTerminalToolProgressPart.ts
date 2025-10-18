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
import { ChatCustomProgressPart } from '../chatProgressContentPart.js';
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
import { localize } from '../../../../../../nls.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	private readonly _actionBar = this._register(new MutableDisposable<ActionBar>());

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
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(toolInvocation);

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);

		const elements = h('.chat-terminal-content-part@container', [
			h('.chat-terminal-content-title@title'),
			h('.chat-terminal-content-message@message')
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
		this._terminalService.whenConnected.then(() => {
			// Append the action bar element after the title has been populated so flex order hacks aren't required.
			const actionBarEl = h('.chat-terminal-action-bar@actionBar');
			elements.title.append(actionBarEl.root);
			this._createActionBar({ actionBar: actionBarEl.actionBar }, terminalData);
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
		const progressPart = _instantiationService.createInstance(ChatCustomProgressPart, elements.container, this.getIcon());
		this.domNode = progressPart.domNode;
	}

	private _createActionBar(elements: { actionBar: HTMLElement }, terminalData: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData): void {
		this._actionBar.value = new ActionBar(elements.actionBar, {});

		const terminalToolSessionId = 'terminalToolSessionId' in terminalData ? terminalData.terminalToolSessionId : undefined;
		if (!terminalToolSessionId || !elements.actionBar) {
			return;
		}
		const terminalInstance = this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
		if (terminalInstance) {
			this._registerInstanceListener(terminalInstance);
			this._addFocusAction(terminalInstance, terminalToolSessionId);
		} else {
			const listener = this._register(this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(terminalInstance => {
				this._registerInstanceListener(terminalInstance);
				this._addFocusAction(terminalInstance, terminalToolSessionId);
				this._store.delete(listener);
			}));
		}
	}

	private _addFocusAction(terminalInstance: ITerminalInstance, terminalToolSessionId: string) {
		const isTerminalHidden = this._terminalChatService.isBackgroundTerminal(terminalToolSessionId);
		const focusAction = this._register(this._instantiationService.createInstance(FocusChatInstanceAction, terminalInstance, isTerminalHidden));
		this._actionBar.value?.push([focusAction], { icon: true, label: false });
	}

	private _registerInstanceListener(terminalInstance: ITerminalInstance) {
		const instanceListener = this._register(terminalInstance.onDisposed(() => {
			this._actionBar.clear();
			instanceListener?.dispose();
		}));
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
		isTerminalHidden: boolean,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalEditorService private readonly _terminalEditorService: ITerminalEditorService
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
			this._terminalGroupService.showPanel(true);
		}
		await this._instance?.focusWhenReady(true);
	}
}
