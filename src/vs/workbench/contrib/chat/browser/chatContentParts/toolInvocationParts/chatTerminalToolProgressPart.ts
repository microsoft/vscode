/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IPreferencesService, type IOpenSettingsOptions } from '../../../../../services/preferences/common/preferences.js';
import { TerminalContribSettingId } from '../../../../terminal/terminalContribExports.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../common/chat.js';
import { IChatMarkdownContent, IChatToolInvocation, IChatToolInvocationSerialized, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from '../chatMarkdownContentPart.js';
import { ChatCustomProgressPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

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
		@IPreferencesService preferencesService: IPreferencesService,
	) {
		super(toolInvocation);

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;

		let content = `\`\`\`${terminalData.language}\n${command}\n\`\`\``;
		if (toolInvocation.pastTenseMessage) {
			content += `\n\n${typeof toolInvocation.pastTenseMessage === 'string' ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value}`;
		}
		const markdownContent = new MarkdownString(content, { supportThemeIcons: true });
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
		this.markdownPart = this._register(instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {
			actionHandler: {
				callback: (content) => {
					const [type, scopeRaw] = content.split('_');
					switch (type) {
						case 'settings': {
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
							break;
						}
					}
				},
				disposables: new DisposableStore(),
			},
		}, currentWidthDelegate(), codeBlockModelCollection, { codeBlockRenderOptions }));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		const icon = !toolInvocation.isConfirmed ?
			Codicon.error :
			toolInvocation.isComplete ?
				Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin');
		const progressPart = instantiationService.createInstance(ChatCustomProgressPart, this.markdownPart.domNode, icon);
		this.domNode = progressPart.domNode;
	}
}
