/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import tree = require('vs/base/parts/tree/browser/tree');
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import dom = require('vs/base/browser/dom');
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {EditorStacksModel, EditorGroup, IEditorGroup, IEditorStacksModel} from 'vs/workbench/common/editor/editorStacksModel';
import {EditorInput} from 'vs/workbench/common/editor';

const $ = dom.emmet;

export class DataSource implements tree.IDataSource {

	public getId(tree: tree.ITree, element: any): string {
		if (element instanceof EditorStacksModel) {
			return 'root';
		}
		if (element instanceof EditorGroup) {
			return (<IEditorGroup>element).id.toString();
		}

		return (<EditorInput>element).getId();
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return element instanceof EditorStacksModel || element instanceof EditorGroup;
	}

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		if (element instanceof EditorStacksModel) {
			return TPromise.as((<IEditorStacksModel>element).groups);
		}

		return TPromise.as((<IEditorGroup>element).getEditors());
	}

	public getParent(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface IEditorTemplateData {
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

		const editorTemplate: IEditorTemplateData = Object.create(null);
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

	private renderEditorGroup(tree: tree.ITree, editorGroup: IEditorGroup, templateData: IEditorTemplateData): void {
		templateData.root.textContent = editorGroup.label;
	}

	private renderOpenEditor(tree: tree.ITree, editor: EditorInput, templateData: IEditorTemplateData): void {
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
