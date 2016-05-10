/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import treedefaults = require('vs/base/parts/tree/browser/treeDefaults');
import tree = require('vs/base/parts/tree/browser/tree');
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {EditorStacksModel, EditorGroup, IEditorGroup, IEditorStacksModel} from 'vs/workbench/common/editor/editorStacksModel';
import {EditorInput} from 'vs/workbench/common/editor';

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

export class Renderer implements tree.IRenderer {
	public static ITEM_HEIGHT = 22;

	public getHeight(tree: tree.ITree, element: any): number {
		return Renderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: tree.ITree, element: any): string {
		return null;
	}

	public renderTemplate(tree: tree.ITree, templateId: string, container: HTMLElement): any {

	}

	public renderElement(tree: tree.ITree, element: any, templateId: string, templateData: any): void {
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
