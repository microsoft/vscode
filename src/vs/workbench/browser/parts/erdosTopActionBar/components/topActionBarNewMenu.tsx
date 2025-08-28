/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './topActionBarNewMenu.css';

import React from 'react';

import { localize } from '../../../../../nls.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IAction, Separator } from '../../../../../base/common/actions.js';
import { ActionBarMenuButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarMenuButton.js';
import { useErdosActionBarContext } from '../../../../../platform/erdosActionBar/browser/erdosActionBarContext.js';
import { ErdosNewFolderFromTemplateAction, ErdosNewFolderFromGitAction } from '../../../actions/erdosActions.js';

const erdosNew = localize('erdosNew', "New");
const erdosNewFile = localize('erdosNewFile', "New File...");
const erdosNewFileFolder = localize('erdosNewFileFolder', "New File/Folder");

export const TopActionBarNewMenu = () => {
	const erdosActionBarContext = useErdosActionBarContext();

	const actions = () => {
		const actions: IAction[] = [];
		erdosActionBarContext.appendCommandAction(actions, {
			id: 'welcome.showNewFileEntries',
			label: erdosNewFile
		});
		actions.push(new Separator());
		erdosActionBarContext.appendCommandAction(actions, {
			id: ErdosNewFolderFromTemplateAction.ID,
		});
		erdosActionBarContext.appendCommandAction(actions, {
			id: ErdosNewFolderFromGitAction.ID
		});
		actions.push(new Separator());
		erdosActionBarContext.appendCommandAction(actions, {
			id: 'workbench.action.newWindow'
		});
		return actions;
	};

	return (
		<ActionBarMenuButton
			actions={actions}
			icon={ThemeIcon.fromId('erdos-new')}
			label={erdosNew}
			tooltip={erdosNewFileFolder}
		/>
	);
};
