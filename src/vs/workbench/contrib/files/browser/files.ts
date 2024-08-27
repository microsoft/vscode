/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IListService } from 'vs/platform/list/browser/listService';
import { OpenEditor, ISortOrderConfiguration } from 'vs/workbench/contrib/files/common/files';
import { EditorResourceAccessor, SideBySideEditor, IEditorIdentifier } from 'vs/workbench/common/editor';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExplorerItem } from 'vs/workbench/contrib/files/common/explorerModel';
import { coalesce } from 'vs/base/common/arrays';
import { AsyncDataTree } from 'vs/base/browser/ui/tree/asyncDataTree';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditableData } from 'vs/workbench/common/views';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ResourceFileEdit } from 'vs/editor/browser/services/bulkEditService';
import { ProgressLocation } from 'vs/platform/progress/common/progress';
import { isActiveElement } from 'vs/base/browser/dom';

export interface IExplorerService {
	readonly _serviceBrand: undefined;
	readonly roots: ExplorerItem[];
	readonly sortOrderConfiguration: ISortOrderConfiguration;

	getContext(respectMultiSelection: boolean, ignoreNestedChildren?: boolean): ExplorerItem[];
	hasViewFocus(): boolean;
	setEditable(stat: ExplorerItem, data: IEditableData | null): Promise<void>;
	getEditable(): { stat: ExplorerItem; data: IEditableData } | undefined;
	getEditableData(stat: ExplorerItem): IEditableData | undefined;
	// If undefined is passed checks if any element is currently being edited.
	isEditable(stat: ExplorerItem | undefined): boolean;
	findClosest(resource: URI): ExplorerItem | null;
	findClosestRoot(resource: URI): ExplorerItem | null;
	refresh(): Promise<void>;
	setToCopy(stats: ExplorerItem[], cut: boolean): Promise<void>;
	isCut(stat: ExplorerItem): boolean;
	applyBulkEdit(edit: ResourceFileEdit[], options: { undoLabel: string; progressLabel: string; confirmBeforeUndo?: boolean; progressLocation?: ProgressLocation.Explorer | ProgressLocation.Window }): Promise<void>;

	/**
	 * Selects and reveal the file element provided by the given resource if its found in the explorer.
	 * Will try to resolve the path in case the explorer is not yet expanded to the file yet.
	 */
	select(resource: URI, reveal?: boolean | string): Promise<void>;

	registerView(contextAndRefreshProvider: IExplorerView): void;
}

export const IExplorerService = createDecorator<IExplorerService>('explorerService');

export interface IExplorerView {
	autoReveal: boolean | 'force' | 'focusNoScroll';
	getContext(respectMultiSelection: boolean): ExplorerItem[];
	refresh(recursive: boolean, item?: ExplorerItem, cancelEditing?: boolean): Promise<void>;
	selectResource(resource: URI | undefined, reveal?: boolean | string, retry?: number): Promise<void>;
	setTreeInput(): Promise<void>;
	itemsCopied(tats: ExplorerItem[], cut: boolean, previousCut: ExplorerItem[] | undefined): void;
	setEditable(stat: ExplorerItem, isEditing: boolean): Promise<void>;
	isItemVisible(item: ExplorerItem): boolean;
	isItemCollapsed(item: ExplorerItem): boolean;
	hasFocus(): boolean;
	getFocus(): ExplorerItem[];
	focusNext(): void;
	focusLast(): void;
}

function getFocus(listService: IListService): unknown | undefined {
	const list = listService.lastFocusedList;
	const element = list?.getHTMLElement();
	if (element && isActiveElement(element)) {
		let focus: unknown;
		if (list instanceof List) {
			const focused = list.getFocusedElements();
			if (focused.length) {
				focus = focused[0];
			}
		} else if (list instanceof AsyncDataTree) {
			const focused = list.getFocus();
			if (focused.length) {
				focus = focused[0];
			}
		}

		return focus;
	}

	return undefined;
}

// Commands can get executed from a command palette, from a context menu or from some list using a keybinding
// To cover all these cases we need to properly compute the resource on which the command is being executed
export function getResourceForCommand(commandArg: unknown, editorService: IEditorService, listService: IListService): URI | undefined {
	if (URI.isUri(commandArg)) {
		return commandArg;
	}

	const focus = getFocus(listService);
	if (focus instanceof ExplorerItem) {
		return focus.resource;
	} else if (focus instanceof OpenEditor) {
		return focus.getResource();
	}

	return EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
}

export function getMultiSelectedResources(commandArg: unknown, listService: IListService, editorSerice: IEditorService, editorGroupService: IEditorGroupsService, explorerService: IExplorerService): Array<URI> {
	const list = listService.lastFocusedList;
	const element = list?.getHTMLElement();
	if (element && isActiveElement(element)) {
		// Explorer
		if (list instanceof AsyncDataTree && list.getFocus().every(item => item instanceof ExplorerItem)) {
			// Explorer
			const context = explorerService.getContext(true, true);
			if (context.length) {
				return context.map(c => c.resource);
			}
		}

		// Open editors view
		if (list instanceof List) {
			const selection = coalesce(list.getSelectedElements().filter(s => s instanceof OpenEditor).map((oe: OpenEditor) => oe.getResource()));
			const focusedElements = list.getFocusedElements();
			const focus = focusedElements.length ? focusedElements[0] : undefined;
			let mainUriStr: string | undefined = undefined;
			if (URI.isUri(commandArg)) {
				mainUriStr = commandArg.toString();
			} else if (focus instanceof OpenEditor) {
				const focusedResource = focus.getResource();
				mainUriStr = focusedResource ? focusedResource.toString() : undefined;
			}
			// We only respect the selection if it contains the main element.
			const mainIndex = selection.findIndex(s => s.toString() === mainUriStr);
			if (mainIndex !== -1) {
				// Move the main resource to the front of the selection.
				const mainResource = selection[mainIndex];
				selection.splice(mainIndex, 1);
				selection.unshift(mainResource);
				return selection;
			}
		}
	}

	// Check for tabs multiselect
	const activeGroup = editorGroupService.activeGroup;
	const selection = activeGroup.selectedEditors;
	if (selection.length > 1 && URI.isUri(commandArg)) {
		// If the resource is part of the tabs selection, return all selected tabs/resources.
		// It's possible that multiple tabs are selected but the action was applied to a resource that is not part of the selection.
		const mainEditorSelectionIndex = selection.findIndex(e => e.matches({ resource: commandArg }));
		if (mainEditorSelectionIndex !== -1) {
			const mainEditor = selection[mainEditorSelectionIndex];
			selection.splice(mainEditorSelectionIndex, 1);
			selection.unshift(mainEditor);
			return selection.map(editor => EditorResourceAccessor.getOriginalUri(editor)).filter(uri => !!uri);
		}
	}

	const result = getResourceForCommand(commandArg, editorSerice, listService);
	return !!result ? [result] : [];
}

export function getOpenEditorsViewMultiSelection(accessor: ServicesAccessor): Array<IEditorIdentifier> | undefined {
	const list = accessor.get(IListService).lastFocusedList;
	const element = list?.getHTMLElement();
	if (element && isActiveElement(element)) {
		// Open editors view
		if (list instanceof List) {
			const selection = coalesce(list.getSelectedElements().filter(s => s instanceof OpenEditor));
			const focusedElements = list.getFocusedElements();
			const focus = focusedElements.length ? focusedElements[0] : undefined;
			let mainEditor: IEditorIdentifier | undefined = undefined;
			if (focus instanceof OpenEditor) {
				mainEditor = focus;
			}
			// We only respect the selection if it contains the main element.
			if (selection.some(s => s === mainEditor)) {
				return selection;
			}
			return mainEditor ? [mainEditor] : undefined;
		}
	}

	return undefined;
}
