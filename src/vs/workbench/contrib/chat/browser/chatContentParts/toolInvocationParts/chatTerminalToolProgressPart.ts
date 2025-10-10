/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { isMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { TerminalCapabilityStore } from '../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { IPreferencesService, type IOpenSettingsOptions } from '../../../../../services/preferences/common/preferences.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { TerminalInstance, TerminalInstanceColorProvider } from '../../../../terminal/browser/terminalInstance.js';
import { XtermTerminal } from '../../../../terminal/browser/xterm/xtermTerminal.js';
// TODO@meganrogge fix
// eslint-disable-next-line local/code-import-patterns
import type { ITerminalExecuteStrategy } from '../../../../terminalContrib/chatAgentTools/browser/executeStrategy/executeStrategy.js';
import { migrateLegacyTerminalToolSpecificData } from '../../../common/chat.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, type IChatMarkdownContent, type IChatTerminalToolInvocationData, type ILegacyChatTerminalToolInvocationData } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { ChatQueryTitlePart } from '../chatConfirmationWidget.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from '../chatMarkdownContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatTerminalToolProgressPart.css';
import { TerminalContribSettingId } from '../../../../terminal/terminalContribExports.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import type { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';

export class ChatTerminalToolProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	private readonly container: HTMLElement;

	// HACK: Just for prototyping
	static trackingInstance?: {
		instance: ITerminalInstance;
		executeStrategy: ITerminalExecuteStrategy;
	};
	static _onDidChangeTrackingInstance = new Emitter<{
		instance: ITerminalInstance;
		executeStrategy: ITerminalExecuteStrategy;
	}>();
	static setTrackingInstance(instance: ITerminalInstance, executeStrategy: ITerminalExecuteStrategy) {
		this.trackingInstance = {
			instance,
			executeStrategy
		};
		this._onDidChangeTrackingInstance.fire(this.trackingInstance);
	}


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
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(toolInvocation);

		terminalData = migrateLegacyTerminalToolSpecificData(terminalData);

		const elements = h('.chat-terminal-content-part@container', [
			h('.chat-terminal-content-title@title'),
			h('.chat-terminal-content-message@message'),
			h('div@xtermElement')
		]);

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;

		const titlePart = this._register(instantiationService.createInstance(
			ChatQueryTitlePart,
			elements.title,
			new MarkdownString(`$(${Codicon.terminal.id})\n\n\`\`\`${terminalData.language}\n${command}\n\`\`\``, { supportThemeIcons: true }),
			undefined,
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
		// const icon = !toolInvocation.isConfirmed ?
		// 	Codicon.error :
		// 	toolInvocation.isComplete ?
		// 		Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin');
		this.container = elements.container;
		this.container.append(this.markdownPart.domNode);


		this._register(ChatTerminalToolProgressPart._onDidChangeTrackingInstance.event(async ({ instance, executeStrategy }) => {
			const xtermCtor = await TerminalInstance.getXtermConstructor(keybindingService, contextKeyService);
			const xterm = instantiationService.createInstance(XtermTerminal, xtermCtor, {
				rows: 10,
				cols: instance.cols,
				capabilities: new TerminalCapabilityStore(),
				xtermColorProvider: instantiationService.createInstance(TerminalInstanceColorProvider, TerminalLocation.Panel)
			}, undefined);
			xterm.attachToElement(elements.xtermElement);

			// Instead of writing data events directly, mirror from the marker
			this._register(executeStrategy.onUpdate(async () => {
				console.log('start marker set!');
			}));

			// TODO: Add class that mirrors a section of xterm.js?
			// TODO: Debounce?
			this._register(instance.onData(async () => {
				const startMarker = executeStrategy.startMarker;
				if (startMarker === undefined) {
					return;
				}
				const data = await instance.xterm?.getRangeAsVT(startMarker!, executeStrategy.endMarker);
				if (data === undefined) {
					return;
				}
				// TODO: More efficiently only write either diffed lines or just the viewport (and any new lines outside the viewport)
				xterm.raw.clear();
				xterm.write('\x1b[H\x1b[K');
				xterm.write(data);
			}));

			this.container.append(elements.xtermElement);
			this._onDidChangeHeight.fire();
		}));

		this.domNode = this.container;
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
