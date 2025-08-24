/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { localize } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';

export class ClearRecentWorkspacesAction extends Action2 {

	static readonly ID = 'workbench.action.clearRecentWorkspaces';

	constructor() {
		super({
			id: ClearRecentWorkspacesAction.ID,
			title: { value: localize('clearRecentWorkspaces', "Clear Recently Opened"), original: 'Clear Recently Opened' },
			f1: false,
			category: Categories.File
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const dialogService = accessor.get(IDialogService);
		const workspacesService = accessor.get(IWorkspacesService);

		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('confirmClearWorkspacesMessage', "Do you want to clear all recently opened workspaces?"),
			detail: localize('confirmClearDetail', "This action is irreversible!"),
			primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
		});

		if (!confirmed) {
			return;
		}

		workspacesService.clearRecentlyOpened();
	}
}

registerAction2(ClearRecentWorkspacesAction);
