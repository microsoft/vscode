/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
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

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	private markdownPart: ChatMarkdownContentPart | undefined;
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? [];
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		terminalData: IChatTerminalToolInvocationData | ILegacyChatTerminalToolInvocationData,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		editorPool: EditorPool,
		currentWidthDelegate: () => number,
		codeBlockStartIndex: number,
		codeBlockModelCollection: CodeBlockModelCollection,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
	) {
		super(toolInvocation);

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);

		const elements = h('.chat-terminal-content-part@container', [
			h('.chat-terminal-content-title@title'),
			h('.chat-terminal-content-message@message')
		]);

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;

		const markdownRenderer = instantiationService.createInstance(MarkdownRenderer, {});
		const titlePart = this._register(instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.title,
			new MarkdownString(`$(${Codicon.terminal.id})\n\n\`\`\`${terminalData.language}\n${command}\n\`\`\``, { supportThemeIcons: true }),
			undefined,
			markdownRenderer,
		));
		this._register(titlePart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

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
		this.markdownPart = this._register(instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {}, currentWidthDelegate(), codeBlockModelCollection, { codeBlockRenderOptions }));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));

		elements.message.append(this.markdownPart.domNode);
		const progressPart = instantiationService.createInstance(ChatCustomProgressPart, elements.container, this.getIcon());
		this.domNode = progressPart.domNode;
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
