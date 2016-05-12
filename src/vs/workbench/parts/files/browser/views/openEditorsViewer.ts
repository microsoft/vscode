/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import {IAction} from 'vs/base/common/actions';
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import tree = require('vs/base/parts/tree/browser/tree');
import {IActionProvider} from 'vs/base/parts/tree/browser/actionsRenderer';
import {IActionItem} from 'vs/base/browser/ui/actionbar/actionbar';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import dom = require('vs/base/browser/dom');
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {EditorStacksModel, EditorGroup, IEditorGroup, IEditorStacksModel} from 'vs/workbench/common/editor/editorStacksModel';
import {EditorInput} from 'vs/workbench/common/editor';

const $ = dom.emmet;

export class OpenEditor {

	constructor(private editor: EditorInput, private group: IEditorGroup) {
		// noop
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
}

interface IEditorGroupTemplateData {
	root: HTMLElement;
}

export class Renderer implements tree.IRenderer {

	public static ITEM_HEIGHT = 22;
	private static EDITOR_GROUP_TEMPLATE_ID = 'editorgroup';
	private static OPEN_EDITOR_TEMPLATE_ID = 'openeditor';

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
		templateData.name.textContent = editor.getName();
		templateData.description.textContent = editor.getDescription();
	}

	public disposeTemplate(tree: tree.ITree, templateId: string, templateData: any): void {
		// noop
	}
}

export class Controller extends treedefaults.DefaultController {

	protected onLeftClick(tree: tree.ITree, element: any, event: IMouseEvent): boolean {
		// Status group should never get selected nor expanded/collapsed
		if (element instanceof EditorGroup) {
			event.preventDefault();
			event.stopPropagation();

			return true;
		}

		return super.onLeftClick(tree, element, event);
	}

	protected onEnter(tree: tree.ITree, event: IKeyboardEvent): boolean {
		var element = tree.getFocus();

		// Editor groups should never get selected nor expanded/collapsed
		if (element instanceof EditorGroup) {
			event.preventDefault();
			event.stopPropagation();

			return true;
		}

		return super.onEnter(tree, event);
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

	constructor(private instantiationService: IInstantiationService) {
		// noop
	}

	public hasActions(tree: tree.ITree, element: any): boolean {
		return element instanceof OpenEditor;
	}

	public getActions(tree: tree.ITree, element: any): TPromise<IAction[]> {
		return TPromise.as([]);
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
