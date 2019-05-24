/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IListService, WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { OpenEditor } from 'vs/workbench/contrib/files/common/files';
import { toResource, SideBySideEditor } from 'vs/workbench/common/editor';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExplorerItem } from 'vs/workbench/contrib/files/common/explorerModel';
import { coalesce } from 'vs/base/common/arrays';

// Commands can get exeucted from a command pallete, from a context menu or from some list using a keybinding
// To cover all these cases we need to properly compute the resource on which the command is being executed
export function getResourceForCommand(resource: URI | object | undefined, listService: IListService, editorService: IEditorService): URI | undefined {
	if (URI.isUri(resource)) {
		return resource;
	}

	let list = listService.lastFocusedList;
	if (list && list.getHTMLElement() === document.activeElement) {
		let focus: unknown;
		if (list instanceof List) {
			const focused = list.getFocusedElements();
			if (focused.length) {
				focus = focused[0];
			}
		} else if (list instanceof WorkbenchAsyncDataTree) {
			const focused = list.getFocus();
			if (focused.length) {
				focus = focused[0];
			}
		}

		if (focus instanceof ExplorerItem) {
			return focus.resource;
		} else if (focus instanceof OpenEditor) {
			return focus.getResource();
		}
	}

	return editorService.activeEditor ? toResource(editorService.activeEditor, { supportSideBySide: SideBySideEditor.MASTER }) : undefined;
}

export function getMultiSelectedResources(resource: URI | object | undefined, listService: IListService, editorService: IEditorService): Array<URI> {
	const list = listService.lastFocusedList;
	if (list && list.getHTMLElement() === document.activeElement) {
		// Explorer
		if (list instanceof WorkbenchAsyncDataTree) {
			const selection = list.getSelection().map((fs: ExplorerItem) => fs.resource);
			const focusedElements = list.getFocus();
			const focus = focusedElements.length ? focusedElements[0] : undefined;
			const mainUriStr = URI.isUri(resource) ? resource.toString() : focus instanceof ExplorerItem ? focus.resource.toString() : undefined;
			// If the resource is passed it has to be a part of the returned context.
			// We only respect the selection if it contains the focused element.
			if (selection.some(s => URI.isUri(s) && s.toString() === mainUriStr)) {
				return selection;
			}
		}

		// Open editors view
		if (list instanceof List) {
			const selection = coalesce(list.getSelectedElements().filter(s => s instanceof OpenEditor).map((oe: OpenEditor) => oe.getResource()));
			const focusedElements = list.getFocusedElements();
			const focus = focusedElements.length ? focusedElements[0] : undefined;
			let mainUriStr: string | undefined = undefined;
			if (URI.isUri(resource)) {
				mainUriStr = resource.toString();
			} else if (focus instanceof OpenEditor) {
				const focusedResource = focus.getResource();
				mainUriStr = focusedResource ? focusedResource.toString() : undefined;
			}
			// We only respect the selection if it contains the main element.
			if (selection.some(s => s.toString() === mainUriStr)) {
				return selection;
			}
		}
	}

	const result = getResourceForCommand(resource, listService, editorService);
	return !!result ? [result] : [];
}
