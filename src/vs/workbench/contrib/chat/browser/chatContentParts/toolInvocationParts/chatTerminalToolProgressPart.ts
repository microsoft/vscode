/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import { generateUuid } from '../../../../../../base/common/uuid.js';
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
	private static readonly trackingInstances = new Map<string, {
		instance: ITerminalInstance;
		executeStrategy: ITerminalExecuteStrategy;
	}>();

	// Map from real terminal instance IDs to chat terminal parts
	private static readonly instanceToPartMap = new Map<string, Set<ChatTerminalToolProgressPart>>();

	// Track the latest part for each terminal instance type (command, output display, etc)
	private static readonly latestPartPerInstance = new Map<string, string>();

	static _onDidChangeTrackingInstance = new Emitter<{
		instance: ITerminalInstance;
		executeStrategy: ITerminalExecuteStrategy;
		targetInstanceId: string;
	}>();

	static setTrackingInstance(instance: ITerminalInstance, executeStrategy: ITerminalExecuteStrategy, targetInstanceId: string) {
		this.trackingInstances.set(targetInstanceId, { instance, executeStrategy });

		// This is a special tracking ID for determining which response should show the terminal output
		this.latestPartPerInstance.set(instance.sessionId, targetInstanceId);

		const terminalParts = this.instanceToPartMap.get(targetInstanceId);
		if (terminalParts && terminalParts.size > 0) {
			for (const part of terminalParts) {
				part.setupTerminalForInstance(instance, executeStrategy);
			}
		}

		this._onDidChangeTrackingInstance.fire({ instance, executeStrategy, targetInstanceId });
	}

	private markdownPart: ChatMarkdownContentPart | undefined;
	private xterm: XtermTerminal | undefined;
	private terminalAttached = false;
	private lastData: string | undefined;
	private dataListener: { dispose: () => void } | undefined;
	private persistentStartMarker: IXtermMarker | undefined;
	private persistentEndMarker: IXtermMarker | undefined;

	/**
	 * Sets up the terminal instance with proper event listeners
	 */
	private async setupTerminalForInstance(
		instance: ITerminalInstance,
		executeStrategy: ITerminalExecuteStrategy,
		instantiationService?: IInstantiationService,
		keybindingService?: IKeybindingService,
		contextKeyService?: IContextKeyService,
		xtermElement?: HTMLElement
	) {
		if (!this.xterm && instantiationService && keybindingService && contextKeyService && xtermElement) {
			const xtermCtor = await TerminalInstance.getXtermConstructor(keybindingService, contextKeyService);
			const capabilities = new TerminalCapabilityStore();
			this._register(capabilities);
			this.xterm = this._register(instantiationService.createInstance(XtermTerminal, xtermCtor, {
				rows: 10,
				cols: instance.cols,
				capabilities,
				xtermColorProvider: instantiationService.createInstance(TerminalInstanceColorProvider, TerminalLocation.Panel)
			}, undefined));

			if (!this.terminalAttached) {
				this.xterm.attachToElement(xtermElement);
				this.terminalAttached = true;
				this.container.append(xtermElement);
				// Ensure terminal is visible immediately
				queueMicrotask(() => this._onDidChangeHeight.fire());
			}
		} else if (!this.xterm) {
			console.warn(`Can't create terminal for ${this.externalInstanceId} yet - missing required services`);
			return;
		}

		if (this.dataListener) {
			this.dataListener.dispose();
			this.dataListener = undefined;
		}

		this.dataListener = executeStrategy.onDidCreateStartMarker(async (marker) => {
			if (marker) {
				this.persistentStartMarker = marker;
			}
			await this.updateTerminalContent(instance, executeStrategy, marker);
		});


		if (this.dataListener) {
			this._register(this.dataListener);
		}

		this.instanceType = instance.sessionId;
		if (executeStrategy.startMarker) {
			try {
				await this.updateTerminalContent(instance, executeStrategy, executeStrategy.startMarker);
			} catch (e) {
				console.error(`Error getting initial terminal data for ${this.externalInstanceId}:`, e);
			}
		}

		this._onDidChangeHeight.fire();
	}

	/**
	 * Updates the terminal content display with the latest output between markers
	 */
	private async updateTerminalContent(
		instance: ITerminalInstance,
		executeStrategy: ITerminalExecuteStrategy,
		startMarker?: IXtermMarker,
		data?: string
	): Promise<void> {
		const latestPartId = ChatTerminalToolProgressPart.latestPartPerInstance.get(this.instanceType!);
		if (latestPartId !== this.externalInstanceId) {
			return;
		}

		// Use markers in order of preference
		if (!startMarker) {
			// Try persistent marker first
			if (this.persistentStartMarker) {
				startMarker = this.persistentStartMarker;
			}
			// Fall back to strategy marker
			else if (executeStrategy.startMarker) {
				startMarker = executeStrategy.startMarker;
				// Save for future use
				this.persistentStartMarker = startMarker;
			}
		}

		if (!startMarker) {
			return;
		}

		const endMarker = this.persistentEndMarker || executeStrategy.endMarker;
		if (executeStrategy.endMarker && !this.persistentEndMarker) {
			this.persistentEndMarker = executeStrategy.endMarker;
		}

		data = await instance.xterm?.getRangeAsVT(startMarker, endMarker);
		if (!data) {
			return;
		}

		if (data === this.lastData) {
			return;
		}

		this.lastData = data;
		if (this.xterm) {
			this.xterm.raw.clear();
			this.xterm.write('\x1b[H\x1b[K');
			this.xterm.write(data);
		}
	}

	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? [];
	}

	override dispose(): void {
		this.xterm = undefined;
		this.dataListener = undefined;

		const parts = ChatTerminalToolProgressPart.instanceToPartMap.get(this.externalInstanceId);
		if (parts) {
			parts.delete(this);
			if (parts.size === 0) {
				ChatTerminalToolProgressPart.instanceToPartMap.delete(this.externalInstanceId);
			}
		}

		super.dispose();
	}

	private readonly externalInstanceId: string;
	private instanceType: string | undefined;

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

		this.externalInstanceId = terminalData.terminalToolSessionId || generateUuid();

		// Register this part in the static map for lookup
		let parts = ChatTerminalToolProgressPart.instanceToPartMap.get(this.externalInstanceId);
		if (!parts) {
			parts = new Set<ChatTerminalToolProgressPart>();
			ChatTerminalToolProgressPart.instanceToPartMap.set(this.externalInstanceId, parts);
		}
		parts.add(this);

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


		const existingTracking = ChatTerminalToolProgressPart.trackingInstances.get(this.externalInstanceId);
		if (existingTracking) {
			this.setupTerminalForInstance(existingTracking.instance, existingTracking.executeStrategy, instantiationService, keybindingService, contextKeyService, elements.xtermElement);
		}

		// Listen for when our specific terminal instance is set
		this._register(ChatTerminalToolProgressPart._onDidChangeTrackingInstance.event(async ({ instance, executeStrategy, targetInstanceId }) => {
			// Skip if this event is not for this instance
			if (targetInstanceId !== this.externalInstanceId) {
				return;
			}

			this.setupTerminalForInstance(instance, executeStrategy, instantiationService, keybindingService, contextKeyService, elements.xtermElement);
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
