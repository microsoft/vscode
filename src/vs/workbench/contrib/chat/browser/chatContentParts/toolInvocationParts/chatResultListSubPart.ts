/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Location } from '../../../../../../editor/common/languages.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { toTerminalCommandVariableEntry, toTerminalCommandVariableEntryFromData } from '../../../common/chatVariableEntries.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { ChatAttachmentsContentPart } from '../chatAttachmentsContentPart.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatCollapsibleListContentPart, CollapsibleListPool, IChatCollapsibleListItem } from '../chatReferencesContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatResultListSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		message: string | IMarkdownString,
		toolDetails: Array<URI | Location>,
		listPool: CollapsibleListPool,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		const container = dom.$('div.chat-result-list-subpart');

		const terminalReferences: URI[] = [];
		const otherReferences: Array<URI | Location> = [];
		for (const detail of toolDetails) {
			if (URI.isUri(detail) && detail.scheme === Schemas.vscodeTerminal) {
				terminalReferences.push(detail);
			} else {
				otherReferences.push(detail);
			}
		}

		if (terminalReferences.length) {
			let attachmentEntries;
			const meta = toolInvocation.toolMetadata;
			if (typeof meta === 'object' && meta) {
				const terminalMeta = 'terminalCommand' in meta ? meta.terminalCommand : undefined;
				if (terminalMeta && typeof terminalMeta === 'object' && 'commandId' in terminalMeta && 'commandLine' in terminalMeta && 'output' in terminalMeta) {
					attachmentEntries = terminalReferences.map(uri => toTerminalCommandVariableEntryFromData(
						uri,
						typeof terminalMeta.commandId === 'string' ? terminalMeta.commandId : undefined,
						typeof terminalMeta.commandLine === 'string' ? terminalMeta.commandLine : undefined,
						typeof terminalMeta.output === 'string' ? terminalMeta.output : ''
					));
				}
			} else {
				attachmentEntries = terminalReferences.map(toTerminalCommandVariableEntry);
			}
			const attachmentsPart = this._register(instantiationService.createInstance(ChatAttachmentsContentPart, {
				variables: attachmentEntries ?? [],
			}));
			if (attachmentsPart.domNode) {
				attachmentsPart.domNode.classList.add('chat-result-terminal-attachments');
				container.appendChild(attachmentsPart.domNode);
			}
		}

		if (otherReferences.length) {
			const collapsibleListPart = this._register(instantiationService.createInstance(
				ChatCollapsibleListContentPart,
				otherReferences.map<IChatCollapsibleListItem>(detail => ({
					kind: 'reference',
					reference: detail,
				})),
				message,
				context,
				listPool,
			));
			this._register(collapsibleListPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
			container.appendChild(collapsibleListPart.domNode);
		}

		this.domNode = container;
	}
}
