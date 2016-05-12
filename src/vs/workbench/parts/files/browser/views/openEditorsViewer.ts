/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import {Keybinding} from 'vs/base/common/keyCodes';
import errors = require('vs/base/common/errors');
import {TPromise} from 'vs/base/common/winjs.base';
import {IAction, Action} from 'vs/base/common/actions';
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import tree = require('vs/base/parts/tree/browser/tree');
import {IActionProvider} from 'vs/base/parts/tree/browser/actionsRenderer';
import {IActionItem, ActionBar} from 'vs/base/browser/ui/actionbar/actionbar';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import dom = require('vs/base/browser/dom');
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {ITextFileService, FileEditorInput} from 'vs/workbench/parts/files/common/files';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {EditorStacksModel, EditorGroup, IEditorGroup, IEditorStacksModel} from 'vs/workbench/common/editor/editorStacksModel';
import {EditorInput, EditorOptions, UntitledEditorInput} from 'vs/workbench/common/editor';
import {keybindingForAction} from 'vs/workbench/parts/files/browser/fileActions';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';

const $ = dom.emmet;

export class OpenEditor {

	constructor(private editor: EditorInput, private group: IEditorGroup) {
		// noop
	}

	public get editorInput() {
		return this.editor;
	}

	public get editorGroup() {
		return this.group;
	}

	public getId(): string {
		return `openeditor:${this.group.id}:${this.editor.getName()}:${this.editor.getDescription()}`;
	}

	public getName(): string {
		return this.editor.getName();
	}

	public getDescription(): string {
		return this.editor.getDescription();
	}

	public isPreview(): boolean {
		return this.group.isPreview(this.editor);
	}

	public isDirty(textFileService: ITextFileService, untitledEditorService: IUntitledEditorService): boolean {
		if (this.editor instanceof FileEditorInput) {
			return textFileService.isDirty((<FileEditorInput>this.editor).getResource());
		}

		return untitledEditorService.isDirty((<UntitledEditorInput>this.editor).getResource());
	}
}

export class DataSource implements tree.IDataSource {

	public getId(tree: tree.ITree, element: any): string {
		if (element instanceof EditorStacksModel) {
			return 'root';
		}
		if (element instanceof EditorGroup) {
			return (<IEditorGroup>element).id.toString();
		}

		return (<OpenEditor>element).getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return element instanceof EditorStacksModel || element instanceof EditorGroup;
	}

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		if (element instanceof EditorStacksModel) {
			return TPromise.as((<IEditorStacksModel>element).groups);
		}

		const editorGroup = <IEditorGroup>element;
		return TPromise.as(editorGroup.getEditors().map(ei => new OpenEditor(ei, editorGroup)));
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IOpenEditorTemplateData {
	root: HTMLElement;
	name: HTMLSpanElement;
	description: HTMLSpanElement;
	actionBar: ActionBar;
}

interface IEditorGroupTemplateData {
	root: HTMLElement;
}

export class Renderer implements tree.IRenderer {

	public static ITEM_HEIGHT = 22;
	private static EDITOR_GROUP_TEMPLATE_ID = 'editorgroup';
	private static OPEN_EDITOR_TEMPLATE_ID = 'openeditor';

	constructor(private actionProvider: ActionProvider,
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {
		// noop
	}

	public getHeight(tree: tree.ITree, element: any): number {
		return Renderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		if (element instanceof EditorGroup) {
			return Renderer.EDITOR_GROUP_TEMPLATE_ID;
		}

		return Renderer.OPEN_EDITOR_TEMPLATE_ID;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {
		if (templateId === Renderer.EDITOR_GROUP_TEMPLATE_ID) {
			const editorGroupTemplate: IEditorGroupTemplateData = Object.create(null);
			editorGroupTemplate.root = dom.append(container, $('.editor-group'));

			return editorGroupTemplate;
		}

		const editorTemplate: IOpenEditorTemplateData = Object.create(null);
		editorTemplate.root = dom.append(container, $('.open-editor'));
		editorTemplate.name = dom.append(editorTemplate.root, $('span.name'));
		editorTemplate.description = dom.append(editorTemplate.root, $('span.description'));

		editorTemplate.actionBar = new ActionBar(container);
		editorTemplate.actionBar.push(this.actionProvider.getOpenEditorActions(), { icon: true, label: false});

		return editorTemplate;
	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === Renderer.EDITOR_GROUP_TEMPLATE_ID) {
			this.renderEditorGroup(tree, element, templateData);
		} else {
			this.renderOpenEditor(tree, element, templateData);
		}
	}

	private renderEditorGroup(tree: tree.ITree, editorGroup: IEditorGroup, templateData: IOpenEditorTemplateData): void {
		templateData.root.textContent = editorGroup.label;
	}

	private renderOpenEditor(tree: tree.ITree, editor: OpenEditor, templateData: IOpenEditorTemplateData): void {
		editor.isPreview() ? dom.addClass(templateData.root, 'preview') : dom.removeClass(templateData.root, 'preview');
		editor.isDirty(this.textFileService, this.untitledEditorService) ? dom.addClass(templateData.root, 'dirty') : dom.removeClass(templateData.root, 'dirty');
		templateData.name.textContent = editor.getName();
		templateData.description.textContent = editor.getDescription();
		templateData.actionBar.context = editor;
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		if (templateId === Renderer.OPEN_EDITOR_TEMPLATE_ID) {
			(<IOpenEditorTemplateData>templateData).actionBar.dispose();
		}
	}
}

export class Controller extends treedefaults.DefaultController {

	constructor(private actionProvider: ActionProvider, private model: IEditorStacksModel,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super({ clickBehavior: treedefaults.ClickBehavior.ON_MOUSE_DOWN });
	}

	protected onLeftClick(tree: tree.ITree, element: any, event: IMouseEvent, origin: string = 'mouse'): boolean {
		const payload = { origin: origin };
		const isDoubleClick = (origin === 'mouse' && event.detail === 2);
		// Status group should never get selected nor expanded/collapsed
		if (!(element instanceof OpenEditor)) {
			event.preventDefault();
			event.stopPropagation();

			return true;
		}

		// Cancel Event
		const isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
		if (!isMouseDown) {
			event.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
		}
		event.stopPropagation();

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
			const preserveFocus = !isDoubleClick;
			tree.setFocus(element, payload);

			if (isDoubleClick) {
				event.preventDefault(); // focus moves to editor, we need to prevent default
			}

			tree.setSelection([element], payload);
			this.openEditor(element, preserveFocus);
		}

		return true;
	}

	protected onEnter(tree: tree.ITree, event: IKeyboardEvent): boolean {
		var element = tree.getFocus();

		// Editor groups should never get selected nor expanded/collapsed
		if (element instanceof EditorGroup) {
			event.preventDefault();
			event.stopPropagation();

			return true;
		}

		this.openEditor(element, false);

		return super.onEnter(tree, event);
	}

	public onContextMenu(tree: tree.ITree, element: any, event: tree.ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}
		if (!(element instanceof OpenEditor)) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(element);

		let anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.actionProvider.getSecondaryActions(tree, element),
			getKeyBinding: (a): Keybinding => keybindingForAction(a.id),
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			},
			getActionsContext: () => element
		});

		return true;
	}

	private openEditor(element: OpenEditor, preserveFocus: boolean): void {
		if (element) {
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'workbench.files.openFile', from: 'openEditors' });
			const position = this.model.positionOfGroup(element.editorGroup);
			this.editorService.openEditor(element.editorInput, EditorOptions.create({ preserveFocus }), position)
				.done(() => this.editorService.activateGroup(position), errors.onUnexpectedError);
		}
	}
}

export class AccessibilityProvider implements tree.IAccessibilityProvider {

	getAriaLabel(tree: tree.ITree, element: any): string {
		if (element instanceof EditorGroup) {
			return nls.localize('editorGroupAriaLabel', "{0}, Editor Group", (<EditorGroup>element).label);
		}

		return nls.localize('openEditorAriaLabel', "{0}, Open Editor", (<OpenEditor>element).getName());
	}
}

export class ActionProvider implements IActionProvider {

	constructor(@IInstantiationService private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return element instanceof OpenEditor;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<IAction[]> {
		if (element instanceof OpenEditor) {
			return TPromise.as(this.getOpenEditorActions());
		}

		return TPromise.as([]);
	}

	public getOpenEditorActions(): IAction[] {
		return [this.instantiationService.createInstance(CloseOpenEditorAction)];
	}

	public hasSecondaryActions(tree: tree.ITree, element: any): boolean {
		return element instanceof OpenEditor;
	}

	public getSecondaryActions(tree: tree.ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
	}

	public getActionItem(tree: tree.ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

class CloseOpenEditorAction extends Action {

	public static ID = 'workbench.files.action.closeOpenEditor';

	constructor(@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(CloseOpenEditorAction.ID, nls.localize('closeEditor', "Close Editor"), 'action-close-file');
	}

	public run(openEditor: OpenEditor): TPromise<any> {
		const position = this.editorService.getStacksModel().positionOfGroup(openEditor.editorGroup);
		return this.editorService.closeEditor(position, openEditor.editorInput);
	}
}
