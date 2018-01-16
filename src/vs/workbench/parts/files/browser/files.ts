/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { IListService } from 'vs/platform/list/browser/listService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { FileStat, OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { toResource } from 'vs/workbench/common/editor';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { List } from 'vs/base/browser/ui/list/listWidget';

// Commands can get exeucted from a command pallete, from a context menu or from some list using a keybinding
// To cover all these cases we need to properly compute the resource on which the command is being executed
export function getResourceForCommand(resource: URI, listService: IListService, editorService: IWorkbenchEditorService): URI {
	if (URI.isUri(resource)) {
		return resource;
	}

	const list = listService.lastFocusedList;
	if (list && list.isDOMFocused()) {
		const focus = list.getFocus();
		if (focus instanceof FileStat) {
			return focus.resource;
		} else if (focus instanceof OpenEditor) {
			return focus.getResource();
		}
	}

	return toResource(editorService.getActiveEditorInput(), { supportSideBySide: true });
}

export function getMultiSelectedResources(resource: URI, listService: IListService, editorService: IWorkbenchEditorService): URI[] {
	const list = listService.lastFocusedList;
	if (list && list.isDOMFocused()) {
		const focus = list.getFocus();
		// Explorer
		if (list instanceof Tree) {
			const selection = list.getSelection();
			if (selection && selection.indexOf(focus) >= 0) {
				return selection.map(fs => fs.resource);
			}
		}
		// Open editors view
		if (list instanceof List) {
			const selection = list.getSelectedElements();
			if (selection && selection.indexOf(focus) >= 0) {
				return selection.filter(s => s instanceof OpenEditor).map((oe: OpenEditor) => oe.getResource());
			}
		}
	}

	const result = getResourceForCommand(resource, listService, editorService);
	return !!result ? [result] : [];
}
