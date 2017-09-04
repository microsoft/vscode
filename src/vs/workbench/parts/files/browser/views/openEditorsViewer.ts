/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import { EditorLabel } from 'vs/workbench/browser/labels';
import { DefaultController, ClickBehavior, DefaultDragAndDrop } from 'vs/base/parts/tree/browser/treeDefaults';
import { IDataSource, ITree, IAccessibilityProvider, IDragAndDropData, IDragOverReaction, DRAG_OVER_ACCEPT, DRAG_OVER_REJECT, ContextMenuEvent, IRenderer } from 'vs/base/parts/tree/browser/tree';
import { ExternalElementsDragAndDropData, ElementsDragAndDropData, DesktopDragAndDropData } from 'vs/base/parts/tree/browser/treeDnd';
import { ActionBar, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import dom = require('vs/base/browser/dom');
import { IMouseEvent, DragMouseEvent } from 'vs/base/browser/mouseEvent';
import { IResourceInput, Position } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEditorGroup, IEditorStacksModel } from 'vs/workbench/common/editor';
import { OpenEditor } from 'vs/workbench/parts/files/common/explorerModel';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { explorerItemToFileResource } from 'vs/workbench/parts/files/common/files';
import { ITextFileService, AutoSaveMode } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorStacksModel, EditorGroup } from 'vs/workbench/common/editor/editorStacksModel';
import { SaveFileAction, RevertFileAction, SaveFileAsAction, OpenToSideAction, SelectResourceForCompareAction, CompareResourcesAction, SaveAllInGroupAction, CompareWithSavedAction } from 'vs/workbench/parts/files/browser/fileActions';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { CloseOtherEditorsInGroupAction, CloseEditorAction, CloseEditorsInGroupAction, CloseUnmodifiedEditorsInGroupAction } from 'vs/workbench/browser/parts/editor/editorActions';

const $ = dom.$;

export class DataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		if (element instanceof EditorStacksModel) {
			return 'root';
		}
		if (element instanceof EditorGroup) {
			return (<IEditorGroup>element).id.toString();
		}

		return (<OpenEditor>element).getId();
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof EditorStacksModel || element instanceof EditorGroup;
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		if (element instanceof EditorStacksModel) {
			return TPromise.as((<IEditorStacksModel>element).groups);
		}

		const editorGroup = <IEditorGroup>element;
		return TPromise.as(editorGroup.getEditors().map(ei => new OpenEditor(ei, editorGroup)));
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IOpenEditorTemplateData {
	container: HTMLElement;
	root: EditorLabel;
	actionBar: ActionBar;
}

interface IEditorGroupTemplateData {
	root: HTMLElement;
	name: HTMLSpanElement;
	actionBar: ActionBar;
}

export class Renderer implements IRenderer {

	public static ITEM_HEIGHT = 22;
	private static EDITOR_GROUP_TEMPLATE_ID = 'editorgroup';
	private static OPEN_EDITOR_TEMPLATE_ID = 'openeditor';

	constructor(
		private actionProvider: ActionProvider,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		// noop
	}

	public getHeight(tree: ITree, element: any): number {
		return Renderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: ITree, element: any): string {
		if (element instanceof EditorGroup) {
			return Renderer.EDITOR_GROUP_TEMPLATE_ID;
		}

		return Renderer.OPEN_EDITOR_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (templateId === Renderer.EDITOR_GROUP_TEMPLATE_ID) {
			const editorGroupTemplate: IEditorGroupTemplateData = Object.create(null);
			editorGroupTemplate.root = dom.append(container, $('.editor-group'));
			editorGroupTemplate.name = dom.append(editorGroupTemplate.root, $('span.name'));
			editorGroupTemplate.actionBar = new ActionBar(container);

			const editorGroupActions = this.actionProvider.getEditorGroupActions();
			editorGroupActions.forEach(a => {
				const key = this.keybindingService.lookupKeybinding(a.id);
				editorGroupTemplate.actionBar.push(a, { icon: true, label: false, keybinding: key ? key.getLabel() : void 0 });
			});

			return editorGroupTemplate;
		}

		const editorTemplate: IOpenEditorTemplateData = Object.create(null);
		editorTemplate.container = container;
		editorTemplate.actionBar = new ActionBar(container);

		const openEditorActions = this.actionProvider.getOpenEditorActions();
		openEditorActions.forEach(a => {
			const key = this.keybindingService.lookupKeybinding(a.id);
			editorTemplate.actionBar.push(a, { icon: true, label: false, keybinding: key ? key.getLabel() : void 0 });
		});

		editorTemplate.root = this.instantiationService.createInstance(EditorLabel, container, void 0);

		return editorTemplate;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === Renderer.EDITOR_GROUP_TEMPLATE_ID) {
			this.renderEditorGroup(tree, element, templateData);
		} else {
			this.renderOpenEditor(tree, element, templateData);
		}
	}

	private renderEditorGroup(tree: ITree, editorGroup: IEditorGroup, templateData: IEditorGroupTemplateData): void {
		templateData.name.textContent = editorGroup.label;
		templateData.actionBar.context = { group: editorGroup };
	}

	private renderOpenEditor(tree: ITree, editor: OpenEditor, templateData: IOpenEditorTemplateData): void {
		editor.isDirty() ? dom.addClass(templateData.container, 'dirty') : dom.removeClass(templateData.container, 'dirty');
		templateData.root.setEditor(editor.editorInput, { italic: editor.isPreview(), extraClasses: ['open-editor'] });
		templateData.actionBar.context = { group: editor.editorGroup, editor: editor.editorInput };
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		if (templateId === Renderer.OPEN_EDITOR_TEMPLATE_ID) {
			(<IOpenEditorTemplateData>templateData).actionBar.dispose();
			(<IOpenEditorTemplateData>templateData).root.dispose();
		}
		if (templateId === Renderer.EDITOR_GROUP_TEMPLATE_ID) {
			(<IEditorGroupTemplateData>templateData).actionBar.dispose();
		}
	}
}

export class Controller extends DefaultController {

	constructor(private actionProvider: ActionProvider, private model: IEditorStacksModel,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_DOWN, keyboardSupport: false });
	}

	public onClick(tree: ITree, element: any, event: IMouseEvent): boolean {

		// Close opened editor on middle mouse click
		if (element instanceof OpenEditor && event.browserEvent && event.browserEvent.button === 1 /* Middle Button */) {
			const position = this.model.positionOfGroup(element.editorGroup);

			this.editorService.closeEditor(position, element.editorInput).done(null, errors.onUnexpectedError);

			return true;
		}

		return super.onClick(tree, element, event);
	}

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent, origin: string = 'mouse'): boolean {
		const payload = { origin: origin };
		const isDoubleClick = (origin === 'mouse' && event.detail === 2);

		// Cancel Event
		const isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
		if (!isMouseDown) {
			event.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
		}
		event.stopPropagation();

		// Status group should never get selected nor expanded/collapsed
		if (!(element instanceof OpenEditor)) {
			return true;
		}

		// Set DOM focus
		tree.DOMFocus();

		// Allow to unselect
		if (event.shiftKey) {
			const selection = tree.getSelection();
			if (selection && selection.length > 0 && selection[0] === element) {
				tree.clearSelection(payload);
			}
		}

		// Select, Focus and open files
		else {
			tree.setFocus(element, payload);

			if (isDoubleClick) {
				event.preventDefault(); // focus moves to editor, we need to prevent default
			}

			tree.setSelection([element], payload);
			this.openEditor(element, { preserveFocus: !isDoubleClick, pinned: isDoubleClick, sideBySide: event.ctrlKey || event.metaKey });
		}

		return true;
	}

	// Do not allow left / right to expand and collapse groups #7848
	protected onLeft(tree: ITree, event: IKeyboardEvent): boolean {
		return true;
	}

	protected onRight(tree: ITree, event: IKeyboardEvent): boolean {
		return true;
	}

	public onContextMenu(tree: ITree, element: any, event: ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}
		// Check if clicked on some element
		if (element === tree.getInput()) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(element);
		const group = element instanceof EditorGroup ? element : (<OpenEditor>element).editorGroup;
		const editor = element instanceof OpenEditor ? (<OpenEditor>element).editorInput : undefined;

		let anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.actionProvider.getSecondaryActions(tree, element),
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			},
			getActionsContext: () => ({ group, editor })
		});

		return true;
	}

	public openEditor(element: OpenEditor, options: { preserveFocus: boolean; pinned: boolean; sideBySide: boolean; }): void {
		if (element) {
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'openEditors' });
			let position = this.model.positionOfGroup(element.editorGroup);
			if (options.sideBySide && position !== Position.THREE) {
				position++;
			}
			this.editorGroupService.activateGroup(this.model.groupAt(position));
			this.editorService.openEditor(element.editorInput, options, position)
				.done(() => this.editorGroupService.activateGroup(this.model.groupAt(position)), errors.onUnexpectedError);
		}
	}
}

export class AccessibilityProvider implements IAccessibilityProvider {

	getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof EditorGroup) {
			return nls.localize('editorGroupAriaLabel', "{0}, Editor Group", (<EditorGroup>element).label);
		}

		return nls.localize('openEditorAriaLabel', "{0}, Open Editor", (<OpenEditor>element).editorInput.getName());
	}
}

export class ActionProvider extends ContributableActionProvider {

	constructor(
		private model: IEditorStacksModel,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		super();
	}

	public hasActions(tree: ITree, element: any): boolean {
		const multipleGroups = this.model.groups.length > 1;
		return element instanceof OpenEditor || (element instanceof EditorGroup && multipleGroups);
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		if (element instanceof OpenEditor) {
			return TPromise.as(this.getOpenEditorActions());
		}
		if (element instanceof EditorGroup) {
			return TPromise.as(this.getEditorGroupActions());
		}

		return TPromise.as([]);
	}

	public getOpenEditorActions(): IAction[] {
		return [this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, CloseEditorAction.LABEL)];
	}

	public getEditorGroupActions(): IAction[] {
		const saveAllAction = this.instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, SaveAllInGroupAction.LABEL);

		return [
			saveAllAction,
			this.instantiationService.createInstance(CloseUnmodifiedEditorsInGroupAction, CloseUnmodifiedEditorsInGroupAction.ID, CloseUnmodifiedEditorsInGroupAction.LABEL),
			this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, CloseEditorsInGroupAction.LABEL)
		];
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return element instanceof OpenEditor || element instanceof EditorGroup;
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		return super.getSecondaryActions(tree, element).then(result => {
			const autoSaveEnabled = this.textFileService.getAutoSaveMode() === AutoSaveMode.AFTER_SHORT_DELAY;

			if (element instanceof EditorGroup) {
				if (!autoSaveEnabled) {
					result.push(this.instantiationService.createInstance(SaveAllInGroupAction, SaveAllInGroupAction.ID, nls.localize('saveAll', "Save All")));
					result.push(new Separator());
				}

				result.push(this.instantiationService.createInstance(CloseUnmodifiedEditorsInGroupAction, CloseUnmodifiedEditorsInGroupAction.ID, nls.localize('closeAllUnmodified', "Close Unmodified")));
				result.push(this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, nls.localize('closeAll', "Close All")));
			} else {
				const openEditor = <OpenEditor>element;
				const resource = openEditor.getResource();
				if (resource) {
					// Open to side
					result.unshift(this.instantiationService.createInstance(OpenToSideAction, tree, resource, false));

					if (!openEditor.isUntitled()) {

						// Files: Save / Revert
						if (!autoSaveEnabled) {
							result.push(new Separator());

							const saveAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
							saveAction.setResource(resource);
							saveAction.enabled = openEditor.isDirty();
							result.push(saveAction);

							const revertAction = this.instantiationService.createInstance(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL);
							revertAction.setResource(resource);
							revertAction.enabled = openEditor.isDirty();
							result.push(revertAction);
						}
					}

					// Untitled: Save / Save As
					if (openEditor.isUntitled()) {
						result.push(new Separator());

						if (this.untitledEditorService.hasAssociatedFilePath(resource)) {
							let saveUntitledAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
							saveUntitledAction.setResource(resource);
							result.push(saveUntitledAction);
						}

						let saveAsAction = this.instantiationService.createInstance(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL);
						saveAsAction.setResource(resource);
						result.push(saveAsAction);
					}

					// Compare Actions
					result.push(new Separator());

					if (!openEditor.isUntitled()) {
						const compareWithSavedAction = this.instantiationService.createInstance(CompareWithSavedAction, CompareWithSavedAction.ID, nls.localize('compareWithSaved', "Compare with Saved"));
						compareWithSavedAction.setResource(resource);
						compareWithSavedAction.enabled = openEditor.isDirty();
						result.push(compareWithSavedAction);
					}

					const runCompareAction = this.instantiationService.createInstance(CompareResourcesAction, resource, tree);
					if (runCompareAction._isEnabled()) {
						result.push(runCompareAction);
					}
					result.push(this.instantiationService.createInstance(SelectResourceForCompareAction, resource, tree));

					result.push(new Separator());
				}

				result.push(this.instantiationService.createInstance(CloseEditorAction, CloseEditorAction.ID, nls.localize('close', "Close")));
				const closeOtherEditorsInGroupAction = this.instantiationService.createInstance(CloseOtherEditorsInGroupAction, CloseOtherEditorsInGroupAction.ID, nls.localize('closeOthers', "Close Others"));
				closeOtherEditorsInGroupAction.enabled = openEditor.editorGroup.count > 1;
				result.push(closeOtherEditorsInGroupAction);
				result.push(this.instantiationService.createInstance(CloseUnmodifiedEditorsInGroupAction, CloseUnmodifiedEditorsInGroupAction.ID, nls.localize('closeAllUnmodified', "Close Unmodified")));
				result.push(this.instantiationService.createInstance(CloseEditorsInGroupAction, CloseEditorsInGroupAction.ID, nls.localize('closeAll', "Close All")));
			}

			return result;
		});
	}
}

export class DragAndDrop extends DefaultDragAndDrop {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService
	) {
		super();
	}

	public getDragURI(tree: ITree, element: OpenEditor): string {
		if (!(element instanceof OpenEditor)) {
			return null;
		}

		const resource = element.getResource();
		// Some open editors do not have a resource so use the name as drag identifier instead #7021
		return resource ? resource.toString() : element.editorInput.getName();
	}

	public getDragLabel(tree: ITree, elements: OpenEditor[]): string {
		if (elements.length > 1) {
			return String(elements.length);
		}

		return elements[0].editorInput.getName();
	}

	public onDragOver(tree: ITree, data: IDragAndDropData, target: OpenEditor | EditorGroup, originalEvent: DragMouseEvent): IDragOverReaction {
		if (!(target instanceof OpenEditor) && !(target instanceof EditorGroup)) {
			return DRAG_OVER_REJECT;
		}

		if (data instanceof ExternalElementsDragAndDropData) {
			let resource = explorerItemToFileResource(data.getData()[0]);

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

		return DRAG_OVER_ACCEPT;
	}

	public drop(tree: ITree, data: IDragAndDropData, target: OpenEditor | EditorGroup, originalEvent: DragMouseEvent): void {
		let draggedElement: OpenEditor | EditorGroup;
		const model = this.editorGroupService.getStacksModel();
		const positionOfTargetGroup = model.positionOfGroup(target instanceof EditorGroup ? target : target.editorGroup);
		const index = target instanceof OpenEditor ? target.editorGroup.indexOf(target.editorInput) : undefined;
		// Support drop from explorer viewer
		if (data instanceof ExternalElementsDragAndDropData) {
			let resource = explorerItemToFileResource(data.getData()[0]);
			(resource as IResourceInput).options = { index, pinned: true };
			this.editorService.openEditor(resource, positionOfTargetGroup).done(null, errors.onUnexpectedError);
		}

		// Drop within viewer
		else {
			let source: OpenEditor | EditorGroup[] = data.getData();
			if (Array.isArray(source)) {
				draggedElement = source[0];
			}
		}

		if (draggedElement) {
			if (draggedElement instanceof OpenEditor) {
				this.editorGroupService.moveEditor(draggedElement.editorInput, model.positionOfGroup(draggedElement.editorGroup), positionOfTargetGroup, { index });
			} else {
				this.editorGroupService.moveGroup(model.positionOfGroup(draggedElement), positionOfTargetGroup);
			}
		}
	}
}
