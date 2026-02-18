/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatSessionEmbeddingsService } from '../../common/chatSessionEmbeddingsService.js';
import { CHAT_CATEGORY } from './chatActions.js';

export function registerChatSessionSearchActions() {
	registerAction2(class RebuildConversationIndexAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.chat.rebuildConversationIndex',
				title: localize2('chat.rebuildIndex', "Rebuild Conversation Search Index"),
				category: CHAT_CATEGORY,
				f1: true,
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const embeddingsService = accessor.get(IChatSessionEmbeddingsService);
			await embeddingsService.rebuildIndex();
		}
	});
}
