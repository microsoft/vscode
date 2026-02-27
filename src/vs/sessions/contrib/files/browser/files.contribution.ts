/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, ViewContainerLocation, Extensions as ViewContainerExtensions, WindowVisibility } from '../../../../workbench/common/views.js';
import { WorkspaceFolderCountContext } from '../../../../workbench/common/contextkeys.js';
import { ExplorerView } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';

const SESSIONS_FILES_CONTAINER_ID = 'workbench.sessions.auxiliaryBar.filesContainer';

const filesViewIcon = registerIcon('sessions-files-view-icon', Codicon.files, localize2('sessionsFilesViewIcon', 'View icon of the files view in the sessions window.').value);

class RegisterFilesViewContribution implements IWorkbenchContribution {

	static readonly ID = 'sessions.registerFilesView';

	constructor() {
		const viewContainerRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

		// Register a new Files view container in the auxiliary bar for the sessions window
		const filesViewContainer = viewContainerRegistry.registerViewContainer({
			id: SESSIONS_FILES_CONTAINER_ID,
			title: localize2('files', "Files"),
			icon: filesViewIcon,
			order: 11,
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [SESSIONS_FILES_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: SESSIONS_FILES_CONTAINER_ID,
			hideIfEmpty: true,
			windowVisibility: WindowVisibility.Sessions,
		}, ViewContainerLocation.AuxiliaryBar, { doNotRegisterOpenCommand: true });

		// Re-register the explorer view inside the new Files container
		viewsRegistry.registerViews([{
			id: 'sessions.files.explorer',
			name: localize2('files', "Files"),
			containerIcon: filesViewIcon,
			ctorDescriptor: new SyncDescriptor(ExplorerView),
			canToggleVisibility: true,
			canMoveView: false,
			when: WorkspaceFolderCountContext.notEqualsTo('0'),
			windowVisibility: WindowVisibility.Sessions,
		}], filesViewContainer);
	}
}

registerWorkbenchContribution2(RegisterFilesViewContribution.ID, RegisterFilesViewContribution, WorkbenchPhase.AfterRestored);
