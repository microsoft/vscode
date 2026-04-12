/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { IWorkingCopyHistoryService } from '../../../services/workingCopy/common/workingCopyHistory.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { LOCAL_HISTORY_MENU_CONTEXT_KEY } from '../browser/localHistory.js';
import { findLocalHistoryEntry, ITimelineCommandArgument } from '../browser/localHistoryCommands.js';
import { isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Schemas } from '../../../../base/common/network.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';

//#region Delete

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.localHistory.revealInOS',
			title: isWindows ? localize2('revealInWindows', "Reveal in File Explorer") : isMacintosh ? localize2('revealInMac', "Reveal in Finder") : localize2('openContainer', "Open Containing Folder"),
			menu: {
				id: MenuId.TimelineItemContext,
				group: '4_reveal',
				order: 1,
				when: ContextKeyExpr.and(LOCAL_HISTORY_MENU_CONTEXT_KEY, ResourceContextKey.Scheme.isEqualTo(Schemas.file))
			}
		});
	}
	async run(accessor: ServicesAccessor, item: ITimelineCommandArgument): Promise<void> {
		const workingCopyHistoryService = accessor.get(IWorkingCopyHistoryService);
		const nativeHostService = accessor.get(INativeHostService);

		const { entry } = await findLocalHistoryEntry(workingCopyHistoryService, item);
		if (entry) {
			await nativeHostService.showItemInFolder(entry.location.with({ scheme: Schemas.file }).fsPath);
		}
	}
});

//#endregion
