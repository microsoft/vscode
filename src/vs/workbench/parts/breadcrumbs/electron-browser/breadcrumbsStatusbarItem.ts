/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { BreadcrumbsWidget, RenderedBreadcrumbsItem, BreadcrumbsItem } from 'vs/workbench/parts/breadcrumbs/electron-browser/breadcrumbsWidget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { posix } from 'path';
import URI from 'vs/base/common/uri';
import { getPathLabel, getBaseLabel } from 'vs/base/common/labels';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';

export class BreadcrumbsStatusbarItem implements IStatusbarItem {

	private _widget: BreadcrumbsWidget;
	private _disposables: IDisposable[] = [];

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IContextViewService private readonly _contextViewService: IContextViewService
	) {
	}

	dispose(): void {
		dispose(this._disposables);
	}

	render(element: HTMLElement): IDisposable {
		this._widget = new BreadcrumbsWidget(element);
		this._widget.layout(300);
		this._disposables.push(this._widget);
		this._disposables.push(this._widget.onDidSelectItem(this._onDidSelectItem, this));
		this._disposables.push(this._editorService.onDidActiveEditorChange(this._onDidChangeActiveEditor, this));
		this._onDidChangeActiveEditor();
		return this;
	}

	private _onDidChangeActiveEditor(): void {
		let { activeEditor } = this._editorService;
		if (!activeEditor) {
			this._widget.replace(undefined, []);
			return;
		}
		let resource = activeEditor.getResource();
		if (!resource) {
			this._widget.replace(undefined, []);
			return;
		}

		interface Element {
			name: string;
			uri: URI;
		}

		function render(element: Element, target: HTMLElement) {
			target.innerText = getBaseLabel(element.uri);
			target.title = getPathLabel(element.uri, undefined, undefined);
		}

		let items: RenderedBreadcrumbsItem<Element>[] = [];
		let path = resource.path;
		while (path !== '/') {
			let name = posix.basename(path);
			let uri = resource.with({ path });
			path = posix.dirname(path);
			items.unshift(new RenderedBreadcrumbsItem(render, { name, uri }, items.length !== 0));
		}

		this._widget.replace(undefined, items);
	}

	private _onDidSelectItem(item: BreadcrumbsItem): void {
		console.log(item, this._contextViewService._serviceBrand);

		// this._contextViewService.showContextView({
		// 	getAnchor() {
		// 		return item.node;
		// 	},
		// 	render(container) {
		// 		container.innerText = JSON.stringify(item, undefined, 4);
		// 		return null;
		// 	}
		// });
	}
}
