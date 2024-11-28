/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IChatAgentCommand } from '../../common/chatAgents.js';
import { chatSubcommandLeader } from '../../common/chatParserTypes.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IChatContentPart } from './chatContentParts.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';


export class ChatAgentCommandContentPart extends Disposable implements IChatContentPart {

	readonly domNode: HTMLElement = document.createElement('span');

	constructor(
		cmd: IChatAgentCommand,
		onClick: () => void,
		@IHoverService private readonly _hoverService: IHoverService,
	) {
		super();
		this._store.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate('element'), this.domNode, localize('rerun', "Detected command. Select to rerun without {0}{1}", chatSubcommandLeader, cmd.name)));
		this.domNode.classList.add('chat-agent-command');
		this.domNode.innerText = chatSubcommandLeader + cmd.name;
		this.domNode.setAttribute('aria-label', cmd.name);
		this.domNode.setAttribute('role', 'button');

		this.domNode.appendChild(renderIcon(Codicon.close));

		this._store.add(addDisposableListener(this.domNode, 'click', onClick));
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return false;
	}
}
