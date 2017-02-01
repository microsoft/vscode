/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import paths = require('vs/base/common/paths');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { FileStat } from 'vs/workbench/parts/files/common/explorerViewModel';
import errors = require('vs/base/common/errors');
import { ITree } from 'vs/base/parts/tree/browser/tree';

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

export const openFocussedExplorerItemCommand = (accessor: ServicesAccessor) => openFocussedExplorerItem(accessor, false);
export const openFocussedExplorerSideBySideItemCommand = (accessor: ServicesAccessor) => openFocussedExplorerItem(accessor, true);

function openFocussedExplorerItem(accessor: ServicesAccessor, sideBySide: boolean): void {
	withFocussedExplorerItem(accessor).then(res => {
		if (res) {

			// Directory: Toggle expansion
			if (res.item.isDirectory) {
				res.tree.toggleExpansion(res.item);
			}

			// File: Open
			else {
				res.tree.setFocus(res.item, { origin: 'keyboard' });

				const editorService = accessor.get(IWorkbenchEditorService);
				editorService.openEditor({ resource: res.item.resource }, sideBySide).done(null, errors.onUnexpectedError);
			}
		}
	});
}

export const renameFocussedExplorerItemCommand = (accessor: ServicesAccessor) => {
	runExplorerActionOnFocussedItem(accessor, 'workbench.files.action.triggerRename');
};

export const deleteFocussedExplorerItemCommand = (accessor: ServicesAccessor) => {
	runExplorerActionOnFocussedItem(accessor, 'workbench.files.action.moveFileToTrash', { useTrash: false });
};

export const moveFocussedExplorerItemToTrashCommand = (accessor: ServicesAccessor) => {
	runExplorerActionOnFocussedItem(accessor, 'workbench.files.action.moveFileToTrash', { useTrash: true });
};

function withFocussedExplorerItem(accessor: ServicesAccessor): TPromise<{ viewlet: ExplorerViewlet, tree: ITree, item: FileStat }> {
	const viewletService = accessor.get(IViewletService);

	return viewletService.openViewlet(VIEWLET_ID, false).then((viewlet: ExplorerViewlet) => {
		const tree = viewlet.getExplorerView().getViewer();

		// Ignore if in highlight mode
		if (tree.getHighlight()) {
			return void 0;
		}

		return { viewlet, tree, item: tree.getFocus() };
	});
};

function runExplorerActionOnFocussedItem(accessor: ServicesAccessor, id: string, context?: any): void {
	withFocussedExplorerItem(accessor).then(res => {
		if (res) {
			res.viewlet.getViewletState().actionProvider.runAction(res.tree, res.item, id, context).done(null, errors.onUnexpectedError);
		}
	});
}