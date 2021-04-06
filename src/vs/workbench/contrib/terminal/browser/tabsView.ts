/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalTabsWidget } from 'vs/workbench/contrib/terminal/browser/terminalTabsWidget';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { Event } from 'vs/base/common/event';
import { IView } from 'vs/workbench/common/views';
import * as dom from 'vs/base/browser/dom';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';
import { Sizing } from 'vs/base/browser/ui/grid/grid';

export class TabsView extends Disposable {
	private _height: number;
	private _width: number;
	private _widget: HTMLElement;
	private _splitView!: SplitView;
	private readonly _splitViewDisposables = this._register(new DisposableStore());
	private _children: SplitTabsPane[] = [];

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	constructor(
		context: string,
		private _container: HTMLElement,
		private _parentContainer: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		if (context === 'terminal') {
			const div = document.createElement('div');
			_instantiationService.createInstance(TerminalTabsWidget, div);
			this._widget = div;
		}
		this._createSplitView();
		this._width = _parentContainer.offsetWidth;
		this._height = _parentContainer.offsetHeight;
		this._splitView.layout(this._width);
	}

	public get splitView(): SplitView {
		return this._splitView;
	}

	private _createSplitView(): void {
		this._splitView = new SplitView(this._parentContainer, { orientation: Orientation.HORIZONTAL });
		this._splitViewDisposables.clear();
		this._splitViewDisposables.add(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));
		this._splitView.addView(new SplitTabsPane(this._widget, 140), 140, 0);
		this._splitView.addView(new SplitTabsPane(this._container, 300), 300, 1);
	}

	public layout(width: number, height: number): void {
		this._width = width;
		this._height = height;
		this._children.forEach(c => c.orthogonalLayout(width));
		this._splitView.layout(width);
	}
}
class SplitTabsPane implements IView {
	public minimumSize: number = 120;
	public maximumSize: number = Number.MAX_VALUE;

	public orientation: Orientation | undefined;

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	readonly element: HTMLElement;

	constructor(
		readonly item: HTMLElement,
		public orthogonalSize: number
	) {
		this.element = document.createElement('div');
		this.element.className = 'terminal-tabs-split-pane';
		console.log(item);
		console.log(this.element);
		this.element.appendChild(item);
		console.log('after', this.element);

	}
	id: string = 'split-tabs-view';
	focus(): void {
		throw new Error('Method not implemented.');
	}
	isVisible(): boolean {
		throw new Error('Method not implemented.');
	}
	isBodyVisible(): boolean {
		throw new Error('Method not implemented.');
	}
	setExpanded(expanded: boolean): boolean {
		throw new Error('Method not implemented.');
	}
	getProgressIndicator(): IProgressIndicator | undefined {
		throw new Error('Method not implemented.');
	}
	public layout(size: number): void {
		// Only layout when both sizes are known
		if (!size || !this.orthogonalSize) {
			return;
		}


	}

	public orthogonalLayout(size: number): void {
		this.orthogonalSize = size;
	}
}

