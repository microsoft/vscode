/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { VIEWLET_ID } from 'vs/workbench/parts/files/common/files';

// Commands

export const openFolderPickerCommand = (accessor: ServicesAccessor, forceNewWindow: boolean) => {
	const windowService = accessor.get(IWindowService);
	windowService.openFolderPicker(forceNewWindow);
};

export const openWindowCommand = (accessor: ServicesAccessor, paths: string[], forceNewWindow: boolean) => {
	const windowsService = accessor.get(IWindowsService);
	windowsService.openWindow(paths, { forceNewWindow });
};

export const openFileInNewWindowCommand = (accessor: ServicesAccessor) => {
	const windowService = accessor.get(IWindowService);
	const editorService = accessor.get(IWorkbenchEditorService);

	const fileResource = toResource(editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });

	windowService.openFilePicker(true, fileResource ? paths.dirname(fileResource.fsPath) : void 0);
};

export const revealInOSCommand = (accessor: ServicesAccessor, resource: URI) => {
	const windowsService = accessor.get(IWindowsService);
	windowsService.showItemInFolder(paths.normalize(resource.fsPath, true));
};

export const revealInExplorerCommand = (accessor: ServicesAccessor, resource: URI) => {
	const viewletService = accessor.get(IViewletService);
	const contextService = accessor.get(IWorkspaceContextService);

	viewletService.openViewlet(VIEWLET_ID, false).then((viewlet: ExplorerViewlet) => {
		const isInsideWorkspace = contextService.isInsideWorkspace(resource);
		if (isInsideWorkspace) {
			const explorerView = viewlet.getExplorerView();
			if (explorerView) {
				explorerView.expand();
				explorerView.select(resource, true);
			}
		} else {
			const openEditorsView = viewlet.getOpenEditorsView();
			if (openEditorsView) {
				openEditorsView.expand();
			}
		}
	});
};