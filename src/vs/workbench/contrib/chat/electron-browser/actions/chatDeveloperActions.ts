/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';

export function registerChatDeveloperActions() {
	registerAction2(OpenChatStorageFolderAction);
}

class OpenChatStorageFolderAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openStorageFolder';

	constructor() {
		super({
			id: OpenChatStorageFolderAction.ID,
			title: localize2('workbench.action.chat.openStorageFolder.label', "Open Chat Storage Folder"),
			icon: Codicon.attach,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatService = accessor.get(IChatService);
		const nativeHostService = accessor.get(INativeHostService);
		const storagePath = chatService.getChatStorageFolder();
		nativeHostService.showItemInFolder(storagePath.fsPath);
	}
}
