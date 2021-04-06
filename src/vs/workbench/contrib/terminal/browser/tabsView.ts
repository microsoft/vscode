/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalTabsWidget } from 'vs/workbench/contrib/terminal/browser/terminalTabsWidget';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { IView } from 'vs/workbench/common/views';
import { IProgressIndicator } from 'vs/platform/progress/common/progress';

export class TabsView extends Disposable {
	private height: number;
	private width: number;
	private _widget!: HTMLElement;
	private _splitView!: SplitView;
	private readonly _splitViewDisposables = this._register(new DisposableStore());
	private _children: SplitTabsPane[] = [];

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	constructor(
		context: string,
		private container: HTMLElement,
		private parentContainer: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		if (context === 'terminal') {
			const div = document.createElement('div');
			div.classList.add('tabs-widget');
			this._instantiationService.createInstance(TerminalTabsWidget, div);
			this._widget = div;
		}
		this._createSplitView();
		this.width = parentContainer.offsetWidth;
		this.height = parentContainer.offsetHeight;
		this._splitView.layout(this.width);
	}

	public get splitView(): SplitView {
		return this._splitView;
	}

	private _createSplitView(): void {
		this._splitView = new SplitView(this.parentContainer, { orientation: Orientation.HORIZONTAL });
		this._splitViewDisposables.clear();
		this._splitViewDisposables.add(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));
		const widgetWidth = 140;
		// this._splitView.addView(new SplitTabsPane(this._widget, widgetWidth, this._terminalService), widgetWidth, 0);
		// this._splitView.addView(new SplitTabsPane(this._container, this._width - widgetWidth, this._terminalService), this._width - widgetWidth, 1);
		this._children.push(new SplitTabsPane(this._widget, widgetWidth, this._terminalService));
		this._children.push(new SplitTabsPane(this.container, this.width - widgetWidth, this._terminalService));
	}

	public layout(width: number, height: number): void {
		this.width = width;
		this.height = height;
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

	private readonly _item: HTMLElement;

	private readonly _terminalService: ITerminalService;

	constructor(
		readonly item: HTMLElement,
		public height: number,
		@ITerminalService terminalService: ITerminalService
	) {
		this.element = document.createElement('div');
		this.element.className = 'terminal-tabs-split-pane';
		console.log(item);
		console.log(this.element);
		this.element.appendChild(item);
		console.log('after', this.element);
		this._item = item;
		this._terminalService = terminalService;

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
		if (!size || !this.height) {
			return;
		}

		if (this._item.classList.contains('tabs-widget')) {

		} else {
			this._terminalService.terminalTabs.forEach(t => t.layout(size, this.height));
		}
	}

	public orthogonalLayout(size: number): void {
		this.height = size;
	}
}

