/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IListService } from 'vs/platform/list/browser/listService';
import { ExplorerItem, OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { toResource } from 'vs/workbench/common/editor';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

// Commands can get exeucted from a command pallete, from a context menu or from some list using a keybinding
// To cover all these cases we need to properly compute the resource on which the command is being executed
export function getResourceForCommand(resource: URI | object, listService: IListService, editorService: IEditorService): URI {
	if (URI.isUri(resource)) {
		return resource;
	}

	let list = listService.lastFocusedList;
	if (list && list.getHTMLElement() === document.activeElement) {
		let focus: any;
		if (list instanceof List) {
			const focused = list.getFocusedElements();
			if (focused.length) {
				focus = focused[0];
			}
		} else {
			focus = list.getFocus();
		}

		if (focus instanceof ExplorerItem) {
			return focus.resource;
		} else if (focus instanceof OpenEditor) {
			return focus.getResource();
		}
	}

	return toResource(editorService.activeEditor, { supportSideBySide: true });
}

export function getMultiSelectedResources(resource: URI | object, listService: IListService, editorService: IEditorService): URI[] {
	const list = listService.lastFocusedList;
	if (list && list.getHTMLElement() === document.activeElement) {
		// Explorer
		if (list instanceof Tree) {
			const selection = list.getSelection().map((fs: ExplorerItem) => fs.resource);
			const focus = list.getFocus();
			const mainUriStr = URI.isUri(resource) ? resource.toString() : focus instanceof ExplorerItem ? focus.resource.toString() : undefined;
			// If the resource is passed it has to be a part of the returned context.
			// We only respect the selection if it contains the focused element.
			if (selection.some(s => URI.isUri(s) && s.toString() === mainUriStr)) {
				return selection;
			}
		}

		// Open editors view
		if (list instanceof List) {
			const selection = list.getSelectedElements().filter(s => s instanceof OpenEditor).map((oe: OpenEditor) => oe.getResource());
			const focusedElements = list.getFocusedElements();
			const focus = focusedElements.length ? focusedElements[0] : undefined;
			const mainUriStr = URI.isUri(resource) ? resource.toString() : (focus instanceof OpenEditor) ? focus.getResource().toString() : undefined;
			// We only respect the selection if it contains the main element.
			if (selection.some(s => s.toString() === mainUriStr)) {
				return selection;
			}
		}
	}

	const result = getResourceForCommand(resource, listService, editorService);
	return !!result ? [result] : [];
}
