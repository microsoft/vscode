/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { CHAT_PET_OPEN_DOCUMENT_COMMAND_ID, IChatPetOpenDocumentArgs } from './chatPetDocument.js';
import { ChatPetDocumentContribution, openChatPetDocument } from './chatPetDocumentProvider.js';
import { CHAT_PET_TAUGHT_MOVES_COMMAND_ID } from './chatPetMoves.js';
import { ChatPetContextKeys, IChatPetService } from './chatPetService.js';
import { showChatPetTaughtMoves } from './chatPetTeaching.js';
import { ChatPetToolsContribution } from './tools/chatPetTools.js';
import { IChatPetWidgetService } from './widget/chatPetWidgetService.js';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CHAT_PET_TAUGHT_MOVES_COMMAND_ID,
			title: localize2('chatPet.taughtMoves.open', "Show Taught Pet Moves"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetContextKeys.enabled),
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return showChatPetTaughtMoves(accessor.get(IQuickInputService), accessor.get(IChatPetService), accessor.get(IChatPetWidgetService), accessor.get(IClipboardService));
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CHAT_PET_OPEN_DOCUMENT_COMMAND_ID,
			title: localize2('chatPet.document.open', "Open Pet Interactions File (pets.md)"),
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetContextKeys.enabled),
			f1: true,
		});
	}

	run(accessor: ServicesAccessor, args?: IChatPetOpenDocumentArgs): Promise<void> {
		if (!accessor.get(IChatPetService).enabled.get()) {
			return Promise.resolve();
		}
		return openChatPetDocument(accessor.get(IEditorService), {
			revealMove: typeof args?.revealMove === 'string' ? args.revealMove : undefined,
			insertMove: typeof args?.insertMove === 'string' ? args.insertMove : undefined,
		});
	}
});

registerWorkbenchContribution2(ChatPetToolsContribution.ID, ChatPetToolsContribution, WorkbenchPhase.Eventually);
// Before editors restore, so a `pets.md` left open comes back.
registerWorkbenchContribution2(ChatPetDocumentContribution.ID, ChatPetDocumentContribution, WorkbenchPhase.BlockRestore);
