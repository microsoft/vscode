/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { userModelRouterFolder } from '../../../../../platform/agentHost/common/modelRouter.js';
import { ModelRouterEnabledSettingId } from '../../../../../platform/agentHost/common/modelRouterConfig.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { RemoteNameContext } from '../../../../common/contextkeys.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

/**
 * Shows the folder that holds the user's model routers in the file manager, so a router file
 * can be found when the model picker does not list it, such as after it was renamed.
 */
export class OpenModelRoutersFolderAction extends Action2 {
	static readonly ID = 'workbench.action.chat.openModelRoutersFolder';

	constructor() {
		super({
			id: OpenModelRoutersFolderAction.ID,
			title: localize2('openModelRoutersFolder', "Open Model Routers Folder"),
			category: CHAT_CATEGORY,
			f1: true,
			// The routers of a remote agent host are on its machine, where there is no folder to show.
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${ModelRouterEnabledSettingId}`, true),
				RemoteNameContext.isEqualTo(''),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const fileService = accessor.get(IFileService);
		const nativeHostService = accessor.get(INativeHostService);
		const folder = userModelRouterFolder(accessor.get(IPathService).userHome({ preferLocal: true }));
		// The folder is otherwise created with the first router.
		await fileService.createFolder(folder);
		const { children } = await fileService.resolve(folder);
		// Showing a file opens the folder it is in; showing an empty folder selects it in its parent.
		await nativeHostService.showItemInFolder((children?.at(0)?.resource ?? folder).fsPath);
	}
}
