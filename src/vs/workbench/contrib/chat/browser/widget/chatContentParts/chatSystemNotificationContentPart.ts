/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatSystemNotificationPart } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';
import { ChatProgressSubPart } from './chatProgressContentPart.js';

export class ChatSystemNotificationContentPart extends Disposable implements IChatContentPart {
	readonly domNode: HTMLElement;

	constructor(
		private readonly notification: IChatSystemNotificationPart,
		renderer: IMarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const rendered = this._register(renderer.render(notification.content));
		this.domNode = this._register(instantiationService.createInstance(ChatProgressSubPart, rendered.element, Codicon.check, undefined)).domNode;
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === 'systemNotification' && other.content.value === this.notification.content.value;
	}
}
