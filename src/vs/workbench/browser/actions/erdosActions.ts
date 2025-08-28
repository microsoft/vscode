/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ITelemetryData } from '../../../base/common/actions.js';
import { ServicesAccessor } from '../../../editor/browser/editorExtensions.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { ContextKeyExpr } from '../../../platform/contextkey/common/contextkey.js';
import { workspacesCategory } from './workspaceActions.js';
import { Action2, MenuId, registerAction2 } from '../../../platform/actions/common/actions.js';
import { EnterMultiRootWorkspaceSupportContext } from '../../common/contextkeys.js';
import { showNewFolderFromGitModalDialog } from '../erdosModalDialogs/newFolderFromGitModalDialog.js';
import { showNewFolderFlowModalDialog } from '../erdosNewFolderFlow/newFolderFlowModalDialog.js';

export class ErdosNewFolderFromTemplateAction extends Action2 {
	static readonly ID = 'erdos.workbench.action.newFolderFromTemplate';

	constructor() {
		super({
			id: ErdosNewFolderFromTemplateAction.ID,
			title: {
				value: localize('erdosNewFolderFromTemplate', "New Folder from Template..."),
				original: 'New Folder from Template...'
			},
			category: workspacesCategory,
			f1: true,
			precondition: EnterMultiRootWorkspaceSupportContext,
			menu: {
				id: MenuId.MenubarFileMenu,
				group: '1_newfolder',
				order: 3,
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await showNewFolderFlowModalDialog();
	}
}

export class ErdosNewFolderFromGitAction extends Action2 {
	static readonly ID = 'erdos.workbench.action.newFolderFromGit';

	constructor() {
		super({
			id: ErdosNewFolderFromGitAction.ID,
			title: {
				value: localize('erdosNewFolderFromGit', "New Folder from Git..."),
				original: 'New Folder from Git...'
			},
			category: workspacesCategory,
			f1: true,
			precondition: ContextKeyExpr.and(
				EnterMultiRootWorkspaceSupportContext,
				ContextKeyExpr.deserialize('config.git.enabled && !git.missing')
			),
			menu: {
				id: MenuId.MenubarFileMenu,
				group: '1_newfolder',
				order: 5,
			}
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await showNewFolderFromGitModalDialog();
	}
}

export class ErdosOpenFolderInNewWindowAction extends Action2 {
	static readonly ID = 'erdos.workbench.action.openWorkspaceInNewWindow';

	constructor() {
		super({
			id: ErdosOpenFolderInNewWindowAction.ID,
			title: {
				value: localize('erdosOpenFolderInNewWindow', "Open Folder in New Window..."),
				original: 'Open Folder in New Window...'
			},
			category: workspacesCategory,
			f1: true,
			precondition: EnterMultiRootWorkspaceSupportContext,
		});
	}

	override async run(accessor: ServicesAccessor, data?: ITelemetryData): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		return fileDialogService.pickFolderAndOpen({
			forceNewWindow: true,
			telemetryExtraData: data
		});
	}
}

registerAction2(ErdosNewFolderFromTemplateAction);
registerAction2(ErdosNewFolderFromGitAction);
registerAction2(ErdosOpenFolderInNewWindowAction);
