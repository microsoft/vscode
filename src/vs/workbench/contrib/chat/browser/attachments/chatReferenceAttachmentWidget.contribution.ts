/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../browser/labels.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { isChatReferenceVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatReferenceAttachmentWidget } from './chatAttachmentWidgets.js';
import { IChatAttachmentWidgetRegistry } from './chatAttachmentWidgetRegistry.js';

/**
 * Registers the {@link ChatReferenceAttachmentWidget} with the shared
 * {@link IChatAttachmentWidgetRegistry} so agent-host chat-reference
 * (`#chat:<title>`) attachments render as clickable chips in both the chat
 * input pill area and rendered past-request tiles. The widget is matched by the
 * first-class `chatReference` attachment `kind`.
 */
export class ChatReferenceAttachmentWidgetContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatReferenceAttachmentWidgetFactory';

	constructor(
		@IChatAttachmentWidgetRegistry registry: IChatAttachmentWidgetRegistry,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// One shared label pool serves every chat-reference chip; each widget
		// creates and disposes its own label from it, while the pool lives for
		// the lifetime of this contribution.
		const labels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		this._register(registry.registerFactory(
			'chatReference',
			(attachment, options, container) => {
				if (!isChatReferenceVariableEntry(attachment)) {
					throw new Error('Expected a chatReference attachment');
				}
				return instantiationService.createInstance(ChatReferenceAttachmentWidget, attachment, undefined, options, container, labels);
			},
		));
	}
}
