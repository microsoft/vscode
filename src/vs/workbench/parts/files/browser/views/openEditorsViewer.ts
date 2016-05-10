/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import tree = require('vs/base/parts/tree/browser/tree');

export class DataSource implements tree.IDataSource {

	public getId(tree: tree.ITree, element: any): string {
		return null;
	}

	public hasChildren(tree: tree.ITree, element: any): boolean {
		return false;
	}

	public getChildren(tree: tree.ITree, element: any): TPromise<any> {
		return TPromise.as([]);
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
