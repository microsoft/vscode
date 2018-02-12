/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, IShellLaunchConfig, ITerminalTab } from 'vs/workbench/parts/terminal/common/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import Event, { Emitter, anyEvent } from 'vs/base/common/event';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { SplitView, Orientation, IView } from 'vs/base/browser/ui/splitview/splitview';

class SplitPane implements IView {
	// TODO: What's a good number for the min?
	public minimumSize: number = 10;
	public maximumSize: number = Number.MAX_VALUE;
	protected _size: number;

	public orientation: Orientation | undefined;
	private _splitView: SplitView | undefined;
	private _children: SplitPane[] = [];
	private _container: HTMLElement;

	public instance: ITerminalInstance;
	private _isContainerSet: boolean = false;

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> {
		return this._onDidChange;
	}

	constructor(
		private _parent?: SplitPane,
		public orthogonalSize?: number,
		private _needsReattach?: boolean
	) {
	}

	protected branch(container: HTMLElement, orientation: Orientation, instance: ITerminalInstance): void {
		this.orientation = orientation;
		while (container.children.length > 0) {
			container.removeChild(container.firstChild);
		}

		this._splitView = new SplitView(container, { orientation });
		this.layout(this._size);
		this.orthogonalLayout(this.orthogonalSize);

		this.addChild(this.orthogonalSize / 2, this._size, this.instance, 0, this._isContainerSet);
		this.addChild(this.orthogonalSize / 2, this._size, instance);
	}

	public split(instance: ITerminalInstance): void {
		if (this._parent && this._parent.orientation === orientation) {
			const index = this._parent._children.indexOf(this);
			this._parent.addChild(this._size / 2, this.orthogonalSize, instance, index + 1);
		} else {
			// TODO: Ensure terminal reattach is handled properly
			this.branch(this._container, this.orientation, instance);
		}
	}

	private addChild(size: number, orthogonalSize: number, instance: ITerminalInstance, index?: number, needsReattach?: boolean): void {
		const child = new SplitPane(this, orthogonalSize, needsReattach);
		child.orientation = this.orientation;
		child.instance = instance;
		this._splitView.addView(child, size, index);

		if (typeof index === 'number') {
			this._children.splice(index, 0, child);
		} else {
			this._children.push(child);
		}

		this._onDidChange = anyEvent(...this._children.map(c => c.onDidChange));
	}

	public render(container: HTMLElement): void {
		if (!container) {
			return;
		}
		this._container = container;
		console.log('render');
		// throw new Error("Method not implemented.");
		if (!this._isContainerSet && this.instance) {
			if (this._needsReattach) {
				console.log('reattachToElement');
				(<any>this.instance).reattachToElement(container);
			} else {
				console.log('attachToElement');
				this.instance.attachToElement(container);
			}
			this._isContainerSet = true;
		}
	}

	public layout(size: number): void {
		this._size = size;
		if (!this._size || !this.orthogonalSize) {
			return;
		}

		console.log('layout', size, this.orthogonalSize);

		if (this.orientation === Orientation.VERTICAL) {
			this.instance.layout({ width: this.orthogonalSize, height: this._size });
		} else {
			this.instance.layout({ width: this._size, height: this.orthogonalSize });
		}
	}

	public orthogonalLayout(size: number): void {
		this.orthogonalSize = size;
		console.log('orthogonalLayout', this._size, this.orthogonalSize);

		if (this._splitView) {
			this._splitView.layout(this.orthogonalSize);
		}
	}
}

class RootSplitPane extends SplitPane {
	private _width: number;
	private _height: number;

	protected branch(container: HTMLElement, orientation: Orientation, instance: ITerminalInstance): void {
		if (orientation === Orientation.VERTICAL) {
			this._size = this._width;
			this.orthogonalSize = this._height;
		} else {
			this._size = this._height;
			this.orthogonalSize = this._width;
		}

		super.branch(container, orientation, instance);
	}

	public layoutBox(width: number, height: number): void {
		if (this.orientation === Orientation.VERTICAL) {
			this.layout(width);
			this.orthogonalLayout(height);
		} else if (this.orientation === Orientation.HORIZONTAL) {
			this.layout(height);
			this.orthogonalLayout(width);
		} else {
			this._width = width;
			this._height = height;
		}
	}
}

export class TerminalTab extends Disposable implements ITerminalTab {
	private _terminalInstances: ITerminalInstance[] = [];
	private _rootSplitPane: RootSplitPane;
	private _splitPanes: SplitPane[] = [];

	// private _activeInstanceIndex: number;

	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }

	private _onDisposed: Emitter<ITerminalTab>;
	public get onDisposed(): Event<ITerminalTab> { return this._onDisposed.event; }

	constructor(
		terminalFocusContextKey: IContextKey<boolean>,
		configHelper: TerminalConfigHelper,
		private _container: HTMLElement,
		shellLaunchConfig: IShellLaunchConfig,
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		super();
		this._onDisposed = new Emitter<ITerminalTab>();

		const instance = this._instantiationService.createInstance(TerminalInstance,
			terminalFocusContextKey,
			configHelper,
			undefined,
			shellLaunchConfig);
		this._terminalInstances.push(instance);
		// this._activeInstanceIndex = 0;
		instance.addDisposable(instance.onDisposed(instance => this._onInstanceDisposed(instance)));

		this._rootSplitPane = new RootSplitPane();
		this._rootSplitPane.instance = instance;
		// TODO: Only render if it's visible?
		this._rootSplitPane.render(this._container);
		// TODO: Is _splitPanes useful?
		this._splitPanes.push(this._rootSplitPane);
	}

	public dispose(): void {
		super.dispose();
		this._terminalInstances = [];
	}

	private _onInstanceDisposed(instance: ITerminalInstance): void {

		// TODO: Listen for disposed on TerminalService and handle appropriately (remove the tab and its instance from the service)

		this._onDisposed.fire(this);
		this.dispose();
	}

	public attachToElement(element: HTMLElement): void {
		this._container = element;
	}

	public get title(): string {
		let title = this.terminalInstances[0].title;
		for (let i = 1; i < this.terminalInstances.length; i++) {
			title += `, ${this.terminalInstances[i].title}`;
		}
		return title;
	}

	public setVisible(visible: boolean): void {
		if (this._container) {
			this._container.style.display = visible ? 'block' : 'none';
		}
		// TODO: probably don't need to tell terminal instances about visiblility anymore?
		this.terminalInstances.forEach(i => i.setVisible(visible));
	}

	public split(
		terminalFocusContextKey: IContextKey<boolean>,
		configHelper: TerminalConfigHelper,
		shellLaunchConfig: IShellLaunchConfig
	): void {
		const instance = this._instantiationService.createInstance(TerminalInstance,
			terminalFocusContextKey,
			configHelper,
			undefined,
			shellLaunchConfig);
		this._terminalInstances.push(instance);
		instance.addDisposable(instance.onDisposed(instance => this._onInstanceDisposed(instance)));

		this._rootSplitPane.orientation = Orientation.HORIZONTAL;
		this._rootSplitPane.split(instance);
	}

	public addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}

	public layout(width: number, height: number): void {
		this._rootSplitPane.layoutBox(width, height);
	}
}
