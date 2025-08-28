/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './topActionBarOpenMenu.css';

import React from 'react';

import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { unmnemonicLabel } from '../../../../../base/common/labels.js';
import { Verbosity } from '../../../../../platform/label/common/label.js';
import { IWindowOpenable } from '../../../../../platform/window/common/window.js';
import { Action, IAction, Separator } from '../../../../../base/common/actions.js';
import { OpenRecentAction } from '../../../actions/windowActions.js';
import { IsMacNativeContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IOpenRecentAction } from '../../titlebar/menubarControl.js';
import { ClearRecentFilesAction } from '../../editor/editorActions.js';
import { IRecent, isRecentFolder, isRecentWorkspace } from '../../../../../platform/workspaces/common/workspaces.js';
import { ActionBarMenuButton } from '../../../../../platform/erdosActionBar/browser/components/actionBarMenuButton.js';
import { useErdosActionBarContext } from '../../../../../platform/erdosActionBar/browser/erdosActionBarContext.js';
import { OpenFileAction, OpenFileFolderAction, OpenFolderAction } from '../../../actions/workspaceActions.js';
import { useErdosTopActionBarContext } from '../erdosTopActionBarContext.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';

const MAX_MENU_RECENT_ENTRIES = 10;

const erdosOpen = localize('erdosOpen', "Open");
const erdosOpenFile = localize('erdosOpenFile', "Open File...");
const erdosOpenFolder = localize('erdosOpenFolder', "Open Folder...");
const erdosOpenFileFolder = localize('erdosOpenFileFolder', "Open File/Folder");

export const TopActionBarOpenMenu = () => {
	const services = useErdosReactServicesContext();
	const erdosActionBarContext = useErdosActionBarContext()!;
	const erdosTopActionBarContext = useErdosTopActionBarContext()!;


	function recentMenuActions(recent: IRecent[]) {
		const actions: IAction[] = [];
		if (recent.length > 0) {
			for (let i = 0; i < MAX_MENU_RECENT_ENTRIES && i < recent.length; i++) {
				actions.push(createOpenRecentMenuAction(recent[i]));
			}
			actions.push(new Separator());
		}
		return actions;
	}

	function createOpenRecentMenuAction(recent: IRecent): IOpenRecentAction {

		let label: string;
		let uri: URI;
		let commandId: string;
		let openable: IWindowOpenable;
		const remoteAuthority = recent.remoteAuthority;

		if (isRecentFolder(recent)) {
			uri = recent.folderUri;
			label = recent.label || services.labelService.getWorkspaceLabel(uri, { verbose: Verbosity.LONG });
			commandId = 'openRecentFolder';
			openable = { folderUri: uri };
		} else if (isRecentWorkspace(recent)) {
			uri = recent.workspace.configPath;
			label = recent.label || services.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
			commandId = 'openRecentWorkspace';
			openable = { workspaceUri: uri };
		} else {
			uri = recent.fileUri;
			label = recent.label || services.labelService.getUriLabel(uri);
			commandId = 'openRecentFile';
			openable = { fileUri: uri };
		}

		const ret: IAction = new Action(commandId, unmnemonicLabel(label), undefined, undefined, event => {
			const browserEvent = event as KeyboardEvent;
			const openInNewWindow = event && ((!isMacintosh && (browserEvent.ctrlKey || browserEvent.shiftKey)) || (isMacintosh && (browserEvent.metaKey || browserEvent.altKey)));

			return services.hostService.openWindow([openable], {
				forceNewWindow: !!openInNewWindow,
				remoteAuthority: remoteAuthority || null
			});
		});

		return Object.assign(ret, { uri, remoteAuthority });
	}


	const actions = async () => {
		const actions: IAction[] = [];
		if (IsMacNativeContext.getValue(services.contextKeyService)) {
			erdosActionBarContext.appendCommandAction(actions, {
				id: OpenFileFolderAction.ID,
				label: erdosOpenFile
			});
		} else {
			erdosActionBarContext.appendCommandAction(actions, {
				id: OpenFileAction.ID
			});
		}
		erdosActionBarContext.appendCommandAction(actions, {
			id: OpenFolderAction.ID,
			label: erdosOpenFolder
		});
		actions.push(new Separator());

		const recent = await services.workspacesService.getRecentlyOpened();
		if (recent && erdosTopActionBarContext) {
			const recentActions = [
				...recentMenuActions(recent.workspaces),
				...recentMenuActions(recent.files)
			];
			if (recentActions.length > 0) {
				actions.push(...recentActions);
				actions.push(new Separator());
				erdosActionBarContext.appendCommandAction(actions, {
					id: OpenRecentAction.ID
				});
				actions.push(new Separator());
				erdosActionBarContext.appendCommandAction(actions, {
					id: ClearRecentFilesAction.ID
				});
			}
		}
		return actions;
	};

	return (
		<ActionBarMenuButton
			actions={actions}
			icon={ThemeIcon.fromId('folder-opened')}
			iconFontSize={18}
			label={erdosOpen}
			tooltip={erdosOpenFileFolder}
		/>
	);
};
