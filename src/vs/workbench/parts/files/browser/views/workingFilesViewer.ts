/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import platform = require('vs/base/common/platform');
import {$} from 'vs/base/browser/builder';
import {IDataSource, ITree, ISorter, IElementCallback, IAccessibilityProvider, IDragAndDropData, IDragOverReaction, DRAG_OVER_ACCEPT, DRAG_OVER_REJECT, ContextMenuEvent} from 'vs/base/parts/tree/browser/tree';
import {FileLabel} from 'vs/base/browser/ui/filelabel/fileLabel';
import {ExternalElementsDragAndDropData, ElementsDragAndDropData, DesktopDragAndDropData} from 'vs/base/parts/tree/browser/treeDnd';
import {ClickBehavior, DefaultController, DefaultDragAndDrop} from 'vs/base/parts/tree/browser/treeDefaults';
import errors = require('vs/base/common/errors');
import mime = require('vs/base/common/mime');
import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {IMouseEvent, DragMouseEvent} from 'vs/base/browser/mouseEvent';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {Separator} from 'vs/base/browser/ui/actionbar/actionbar';
import actions = require('vs/base/common/actions');
import {ActionsRenderer} from 'vs/base/parts/tree/browser/actionsRenderer';
import {ContributableActionProvider} from 'vs/workbench/browser/actionBarRegistry';
import {keybindingForAction, CloseOneWorkingFileAction, CloseOtherWorkingFilesAction, CloseAllWorkingFilesAction, SelectResourceForCompareAction, CompareResourcesAction, SaveFileAsAction, SaveFileAction, RevertFileAction, OpenToSideAction} from 'vs/workbench/parts/files/browser/fileActions';
import {asFileResource, ITextFileService, AutoSaveMode} from 'vs/workbench/parts/files/common/files';
import {WorkingFileEntry, WorkingFilesModel} from 'vs/workbench/parts/files/common/workingFilesModel';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {CommonKeybindings, Keybinding} from 'vs/base/common/keyCodes';

const ROOT_ID = '__WORKING_FILES_ROOT';

export class WorkingFilesDataSource implements IDataSource {

	constructor() { }

	public getId(tree: ITree, element: any): string {
		if (element instanceof WorkingFileEntry) {
			return (<WorkingFileEntry>element).resource.toString();
		}

		return ROOT_ID;
	}

	public hasChildren(tree: ITree, element: any): boolean {
		if (element instanceof WorkingFilesModel) {
			return (<WorkingFilesModel>element).count() > 0;
		}

		return false;
	}

	public getChildren(tree: ITree, element: any): TPromise<any[]> {
		if (element instanceof WorkingFilesModel) {
			return TPromise.as((<WorkingFilesModel>element).getEntries());
		}

		return TPromise.as([]);
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

export class WorkingFilesSorter implements ISorter {

	constructor() { }

	public compare(tree: ITree, element: any, otherElement: any): number {
		return WorkingFilesModel.compare(element, otherElement);
	}
}

export class WorkingFilesRenderer extends ActionsRenderer {

	public static FILE_ITEM_HEIGHT = 22;

	constructor(
		model: WorkingFilesModel,
		actionProvider: WorkingFilesActionProvider,
		actionRunner: actions.IActionRunner,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super({
			actionProvider: actionProvider,
			actionRunner: actionRunner
		});
	}

	public getHeight(tree: ITree, element: any): number {
		return WorkingFilesRenderer.FILE_ITEM_HEIGHT;
	}

	public renderContents(tree: ITree, element: any, container: HTMLElement): IElementCallback {
		let entry = <WorkingFileEntry>element;
		let $el = $(container).clearChildren();
		let item = $('.working-files-item').appendTo($el);

		let label = $('.working-files-item-label').appendTo(item);
		new FileLabel(label.getHTMLElement(), entry.resource, this.contextService);

		if (entry.dirty) {
			$(container.parentElement).addClass('working-file-dirty');
		} else {
			$(container.parentElement).removeClass('working-file-dirty');
		}

		return null;
	}
}

export class WorkingFilesAccessibilityProvider implements IAccessibilityProvider {

	getAriaLabel(tree: ITree, element: any): string {
		let entry = <WorkingFileEntry>element;

		return nls.localize('workingFilesViewerAriaLabel', "{0}, Working Files", paths.basename(entry.resource.fsPath));
	}
}

export class WorkingFilesActionProvider extends ContributableActionProvider {
	private model: WorkingFilesModel;

	constructor(model: WorkingFilesModel,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();

		this.model = model;
	}

	public hasActions(tree: ITree, element: WorkingFileEntry): boolean {
		return element instanceof WorkingFileEntry || super.hasActions(tree, element);
	}

	// we don't call into super here because we put only one primary action to the left (Remove/Dirty Indicator)
	public getActions(tree: ITree, element: WorkingFileEntry): TPromise<actions.IAction[]> {
		let actions: actions.IAction[] = [];

		if (element instanceof WorkingFileEntry) {
			actions.push(this.instantiationService.createInstance(CloseOneWorkingFileAction, this.model, element));
		}

		return TPromise.as(actions);
	}

	public hasSecondaryActions(tree: ITree, element: WorkingFileEntry): boolean {
		return element instanceof WorkingFileEntry || super.hasActions(tree, element);
	}

	public getSecondaryActions(tree: ITree, element: WorkingFileEntry): TPromise<actions.IAction[]> {
		return super.getSecondaryActions(tree, element).then((actions) => {
			if (element instanceof WorkingFileEntry) {

				// Open to side
				let openToSideAction = this.instantiationService.createInstance(OpenToSideAction, tree, element.resource, false);
				actions.unshift(openToSideAction); // be on top

				// Files: Save / Revert
				let autoSaveEnabled = (this.textFileService.getAutoSaveMode() !== AutoSaveMode.OFF);
				if ((!autoSaveEnabled || element.dirty) && element.isFile) {
					actions.push(new Separator());

					let saveAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
					saveAction.setResource(element.resource);
					saveAction.enabled = element.dirty;
					actions.push(saveAction);

					let revertAction = this.instantiationService.createInstance(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL);
					revertAction.setResource(element.resource);
					revertAction.enabled = element.dirty;
					actions.push(revertAction);
				}

				// Untitled: Save / Save As
				if (element.isUntitled) {
					actions.push(new Separator());

					if (this.untitledEditorService.hasAssociatedFilePath(element.resource)) {
						let saveUntitledAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
						saveUntitledAction.setResource(element.resource);
						actions.push(saveUntitledAction);
					}

					let saveAsAction = this.instantiationService.createInstance(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL);
					saveAsAction.setResource(element.resource);
					actions.push(saveAsAction);
				}

				// Compare
				if (!element.isUntitled) {
					actions.push(new Separator());

					// Run Compare
					let runCompareAction = this.instantiationService.createInstance(CompareResourcesAction, element.resource, tree);
					if (runCompareAction._isEnabled()) {
						actions.push(runCompareAction);
					}

					// Select for Compare
					actions.push(this.instantiationService.createInstance(SelectResourceForCompareAction, element.resource, tree));
				}

				// Close
				actions.push(new Separator());
				actions.push(this.instantiationService.createInstance(CloseOneWorkingFileAction, this.model, element));
				actions.push(this.instantiationService.createInstance(CloseAllWorkingFilesAction, this.model));

				if (this.model.count() > 1) {
					actions.push(this.instantiationService.createInstance(CloseOtherWorkingFilesAction, this.model, element));
				}
			}

			return actions;
		});
	}
}

export class WorkingFilesDragAndDrop extends DefaultDragAndDrop {
	private model: WorkingFilesModel;

	constructor(model: WorkingFilesModel, @IWorkspaceContextService private contextService: IWorkspaceContextService) {
		super();

		this.model = model;
	}

	public getDragURI(tree: ITree, element: WorkingFileEntry): string {
		return element.resource.toString();
	}

	public onDragStart(tree: ITree, data: IDragAndDropData, originalEvent: DragMouseEvent): void {
		let sources = data.getData();
		let source: WorkingFileEntry = null;
		if (Array.isArray(sources)) {
			source = sources[0];
		}

		// Native only: when a DownloadURL attribute is defined on the data transfer it is possible to
		// drag a file from the browser to the desktop and have it downloaded there.
		if (!(data instanceof DesktopDragAndDropData) && source && source.isFile) {
			let name = paths.basename(source.resource.fsPath);
			originalEvent.dataTransfer.setData('DownloadURL', [mime.MIME_BINARY, name, source.resource.toString()].join(':'));
		}
	}

	public onDragOver(baum: ITree, data: IDragAndDropData, target: WorkingFileEntry, originalEvent: DragMouseEvent): IDragOverReaction {
		if (!(target instanceof WorkingFileEntry)) {
			return DRAG_OVER_REJECT;
		}

		if (data instanceof ExternalElementsDragAndDropData) {
			let resource = asFileResource(data.getData()[0]);

			if (!resource) {
				return DRAG_OVER_REJECT;
			}

			return resource.isDirectory ? DRAG_OVER_REJECT : DRAG_OVER_ACCEPT;
		}

		if (data instanceof DesktopDragAndDropData) {
			return DRAG_OVER_REJECT;
		}

		if (!(data instanceof ElementsDragAndDropData)) {
			return DRAG_OVER_REJECT;
		}

		let sourceResource: uri;
		let targetResource = target.resource;
		let draggedData = data.getData()[0];

		if (draggedData instanceof WorkingFileEntry) {
			sourceResource = draggedData.resource;
		} else {
			let source = asFileResource(draggedData);
			if (!source) {
				return DRAG_OVER_REJECT;
			}

			sourceResource = source.resource;
		}

		if (!targetResource || !sourceResource) {
			return DRAG_OVER_REJECT;
		}

		return targetResource.toString() === sourceResource.toString() ? DRAG_OVER_REJECT : DRAG_OVER_ACCEPT;
	}

	public drop(tree: ITree, data: IDragAndDropData, target: WorkingFileEntry, originalEvent: DragMouseEvent): void {
		let draggedElement: WorkingFileEntry;

		// Support drop from explorer viewer
		if (data instanceof ExternalElementsDragAndDropData) {
			let resource = asFileResource(data.getData()[0]);
			draggedElement = this.model.addEntry(resource.resource);
		}

		// Drop within viewer
		else {
			let source: WorkingFileEntry[] = data.getData();
			if (Array.isArray(source)) {
				draggedElement = source[0];
			}
		}

		if (draggedElement) {
			this.model.reorder(draggedElement, target);
		}
	}
}

export class WorkingFilesController extends DefaultController {
	private actionProvider: WorkingFilesActionProvider;
	private model: WorkingFilesModel;

	constructor(model: WorkingFilesModel, provider: WorkingFilesActionProvider,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_DOWN });

		this.model = model;
		this.actionProvider = provider;

		this.downKeyBindingDispatcher.set(CommonKeybindings.ENTER, this.onEnterDown.bind(this));
		if (platform.isMacintosh) {
			this.upKeyBindingDispatcher.set(CommonKeybindings.WINCTRL_ENTER, this.onModifierEnterUp.bind(this)); // Mac: somehow Cmd+Enter does not work
		} else {
			this.upKeyBindingDispatcher.set(CommonKeybindings.CTRLCMD_ENTER, this.onModifierEnterUp.bind(this)); // Mac: somehow Cmd+Enter does not work
		}
	}

	/* protected */ public onClick(tree: ITree, element: any, event: IMouseEvent): boolean {

		// Close working file on middle mouse click
		if (element instanceof WorkingFileEntry && event.browserEvent && event.browserEvent.button === 1 /* Middle Button */) {
			const closeAction = this.instantiationService.createInstance(CloseOneWorkingFileAction, this.model, element);
			closeAction.run().done(() => {
				closeAction.dispose();
			}, errors.onUnexpectedError);

			return true;
		}

		return super.onClick(tree, element, event);
	}

	/* protected */ public onLeftClick(tree: ITree, element: any, event: IMouseEvent, origin: string = 'mouse'): boolean {
		let payload = { origin: origin };
		let isDoubleClick = (origin === 'mouse' && event.detail === 2);

		// Handle outside element click
		if (element instanceof WorkingFilesModel) {
			tree.clearFocus(payload);
			tree.clearSelection(payload);

			return false;
		}

		// Cancel Event
		let isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
		if (!isMouseDown) {
			event.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
		}
		event.stopPropagation();

		// Set DOM focus
		tree.DOMFocus();

		// Allow to unselect
		if (event.shiftKey) {
			let selection = tree.getSelection();
			if (selection && selection.length > 0 && selection[0] === element) {
				tree.clearSelection(payload);
			}
		}

		// Select, Focus and open files
		else {
			let preserveFocus = !isDoubleClick;
			tree.setFocus(element, payload);

			if (isDoubleClick) {
				event.preventDefault(); // focus moves to editor, we need to prevent default
			}

			tree.setSelection([element], payload);
			this.openEditor(<WorkingFileEntry>element, preserveFocus, event && (event.ctrlKey || event.metaKey));
		}

		return true;
	}

	private onEnterDown(tree: ITree, event: IKeyboardEvent): boolean {
		let payload = { origin: 'keyboard' };

		let element = tree.getFocus();
		if (element) {
			tree.setFocus(element, payload);
			this.openEditor(<WorkingFileEntry>element, false, false);
		}

		return true;
	}

	private onModifierEnterUp(tree: ITree, event: IKeyboardEvent): boolean {
		let element = tree.getFocus();
		if (element) {
			this.openEditor(<WorkingFileEntry>element, false, true);
		}

		return true;
	}

	public onContextMenu(tree: ITree, element: WorkingFileEntry, event: ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(element);

		let anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.actionProvider.getSecondaryActions(tree, element),
			getKeyBinding: (a): Keybinding => this.getKeyBinding(a),
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			}
		});

		return true;
	}

	private getKeyBinding(action: actions.IAction): Keybinding {
		return keybindingForAction(action.id);
	}

	private openEditor(element: WorkingFileEntry, preserveFocus: boolean, sideBySide: boolean): void {
		if (element) {
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'workingSet' });

			this.editorService.openEditor({
				resource: element.resource,
				options: {
					preserveFocus: preserveFocus
				}
			}, sideBySide).done(null, errors.onUnexpectedError);
		}
	}
}