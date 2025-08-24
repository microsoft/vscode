/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './customFolderMenuItems.css';

import React from 'react';

import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { CustomFolderMenuItem } from './customFolderMenuItem.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { OpenFolderAction } from '../../../actions/workspaceActions.js';
import { Verbosity } from '../../../../../platform/label/common/label.js';
import { CustomFolderMenuSeparator } from './customFolderMenuSeparator.js';
import { ClearRecentWorkspacesAction } from '../../editor/workspaceActions.js';
import { IWindowOpenable } from '../../../../../platform/window/common/window.js';
import { CustomFolderRecentlyUsedMenuItem } from './customFolderRecentlyUsedMenuItem.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { CommandCenter } from '../../../../../platform/commandCenter/common/commandCenter.js';
import { EmptyWorkspaceSupportContext, WorkbenchStateContext } from '../../../../common/contextkeys.js';
import { CommandAction } from '../../../../../platform/erdosActionBar/browser/erdosActionBarState.js';
import { useErdosReactServicesContext } from '../../../../../base/browser/erdosReactRendererContext.js';
import { IRecentlyOpened, isRecentWorkspace, isRecentFolder } from '../../../../../platform/workspaces/common/workspaces.js';
import { ErdosNewFolderFromTemplateAction, ErdosNewFolderFromGitAction, ErdosOpenFolderInNewWindowAction } from '../../../actions/erdosActions.js';

const kCloseFolder = 'workbench.action.closeFolder';

interface CustomFolderMenuItemsProps {
	recentlyOpened: IRecentlyOpened;
	onMenuItemSelected: () => void;
}

export const CustomFolderMenuItems = (props: CustomFolderMenuItemsProps) => {
	const services = useErdosReactServicesContext();

	const CommandActionCustomFolderMenuItem = (commandAction: CommandAction) => {
		const commandInfo = CommandCenter.commandInfo(commandAction.id);

		if (!commandInfo || !services.contextKeyService.contextMatchesRules(commandAction.when)) {
			return null;
		}

		const enabled = !commandInfo.precondition ||
			services.contextKeyService.contextMatchesRules(commandInfo.precondition);
		const label = commandAction.label ||
			(typeof (commandInfo.title) === 'string' ?
				commandInfo.title :
				commandInfo.title.value);

		return (
			<>
				{commandAction.separator && <CustomFolderMenuSeparator />}
				<CustomFolderMenuItem
					enabled={enabled}
					label={label}
					onSelected={() => {
						props.onMenuItemSelected();
						services.commandService.executeCommand(commandAction.id);
					}}
				/>
			</>
		);
	};

	const RecentWorkspacesCustomFolderMenuItems = () => {
		if (!props.recentlyOpened.workspaces.length) {
			return null;
		}

		return (
			<>
				<CustomFolderMenuSeparator />
				{props.recentlyOpened.workspaces.slice(0, 10).map((recent, index) => {
					let uri: URI;
					let label: string;
					let openable: IWindowOpenable;
					if (isRecentWorkspace(recent)) {
						uri = recent.workspace.configPath;
						label = recent.label || services.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
						openable = { workspaceUri: uri };
					} else if (isRecentFolder(recent)) {
						uri = recent.folderUri;
						label = recent.label || services.labelService.getWorkspaceLabel(uri, { verbose: Verbosity.LONG });
						openable = { folderUri: uri };
					} else {
						return null;
					}

					return (
						<CustomFolderRecentlyUsedMenuItem
							key={index}
							enabled={true}
							label={label}
							onOpen={e => {
								props.onMenuItemSelected();
								services.hostService.openWindow([openable], {
									forceNewWindow: (!isMacintosh && (e.ctrlKey || e.shiftKey)) || (isMacintosh && (e.metaKey || e.altKey)),
									remoteAuthority: recent.remoteAuthority || null
								});
							}}
							onOpenInNewWindow={e => {
								props.onMenuItemSelected();
								services.hostService.openWindow([openable], {
									forceNewWindow: true,
									remoteAuthority: recent.remoteAuthority || null
								});
							}}
						/>
					);
				})}
			</>
		);
	};

	return (
		<div className='custom-folder-menu-items'>
			<CommandActionCustomFolderMenuItem id={ErdosNewFolderFromTemplateAction.ID} />
			<CommandActionCustomFolderMenuItem id={ErdosNewFolderFromGitAction.ID} />
			<CustomFolderMenuSeparator />
			<CommandActionCustomFolderMenuItem
				id={OpenFolderAction.ID}
				label={(() => localize('erdosOpenFolder', "Open Folder..."))()} />
			<CommandActionCustomFolderMenuItem id={ErdosOpenFolderInNewWindowAction.ID} />
			<CommandActionCustomFolderMenuItem
				id={kCloseFolder}
				label={(() => localize('erdosCloseFolder', "Close Folder"))()}
				separator={true}
				when={ContextKeyExpr.and(
					WorkbenchStateContext.isEqualTo('folder'),
					EmptyWorkspaceSupportContext
				)}
			/>
			<RecentWorkspacesCustomFolderMenuItems />
			<CustomFolderMenuSeparator />
			<CommandActionCustomFolderMenuItem id={ClearRecentWorkspacesAction.ID} />
		</div>
	);
};
