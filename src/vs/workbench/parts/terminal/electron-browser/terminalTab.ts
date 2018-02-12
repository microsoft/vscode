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

	public instance: ITerminalInstance;
	public orientation: Orientation | undefined;

	protected _size: number;

	private _splitView: SplitView | undefined;
	private _children: SplitPane[] = [];
	private _container: HTMLElement;
	private _isContainerSet: boolean = false;
	private _onDidChange: Event<number | undefined> = Event.None;

	public get children(): SplitPane[] { return this._children; }
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	constructor(
		private _parent?: SplitPane,
		public orthogonalSize?: number,
		private _needsReattach?: boolean
	) {
	}

	protected branch(container: HTMLElement, orientation: Orientation, instance: ITerminalInstance): void {
		this.orientation = orientation;
		container.removeChild((<any>this.instance)._wrapperElement);

		this._splitView = new SplitView(container, { orientation });
		this.layout(this._size);
		this.orthogonalLayout(this.orthogonalSize);

		this.addChild(this.orthogonalSize / 2, this._size, this.instance, 0, this._isContainerSet);
		this.addChild(this.orthogonalSize / 2, this._size, instance);

		// Instance is now owned by the first child
		this.instance = null;
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

	public remove(): void {
		if (!this._parent) {
			return;
		}

		this._parent.removeChild(this);
	}

	public removeChild(child: SplitPane): void {
		const index = this._children.indexOf(child);
		this._children.splice(index, 1);
		this._splitView.removeView(index);
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
		// Only layout when both sizes are known and the SplitPane owns an instance
		this._size = size;
		if (!this._size || !this.orthogonalSize || !this.instance) {
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
	private _tabElement: HTMLElement;

	private _activeInstanceIndex: number;

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
		this._activeInstanceIndex = 0;
		instance.addDisposable(instance.onDisposed(instance => this._onInstanceDisposed(instance)));

		this._rootSplitPane = new RootSplitPane();
		this._rootSplitPane.instance = instance;

		if (this._container) {
			this.attachToElement(this._container);
		}

		// TODO: Listen to instance focus and update activeInstanceIndex accordingly
	}

	public dispose(): void {
		super.dispose();
		this._terminalInstances = [];
	}

	public get activeInstance(): ITerminalInstance {
		if (this._terminalInstances.length === 0) {
			return null;
		}
		return this._terminalInstances[this._activeInstanceIndex];
	}

	private _onInstanceDisposed(instance: ITerminalInstance): void {
		// Get the index of the instance and remove it from the list
		const index = this._terminalInstances.indexOf(instance);
		const wasActiveInstance = instance === this.activeInstance;
		if (index !== -1) {
			this._terminalInstances.splice(index, 1);
		}

		// Adjust focus if the instance was active
		if (wasActiveInstance && this._terminalInstances.length > 0) {
			let newIndex = index < this._terminalInstances.length ? index : this._terminalInstances.length - 1;
			this.setActiveInstanceByIndex(newIndex);
			if (instance.hadFocusOnExit) {
				this.activeInstance.focus(true);
			}
		}

		// TODO: Find instance's SplitPane and unsplit it
		this._findSplitPane(instance).remove();

		// console.log('splitPane: ', splitPane);


		// Dispose the tab if it was the last instance
		if (this._terminalInstances.length === 0) {
			console.log('Disposed terminal tab!');
			this._onDisposed.fire(this);
			this.dispose();
		}
	}

	private _findSplitPane(instance: ITerminalInstance): SplitPane {
		const openList: SplitPane[] = [this._rootSplitPane];
		while (openList.length > 0) {
			const current = openList.shift();
			if (current.instance === instance) {
				return current;
			}
			openList.push.apply(openList, current.children);
		}
		return null;
	}

	public setActiveInstanceByIndex(index: number): boolean {
		// Check for invalid value
		if (index >= this._terminalInstances.length) {
			return false;
		}

		const didInstanceChange = this._activeInstanceIndex !== index;
		this._activeInstanceIndex = index;

		// TODO: Fire events like in TerminalService.setActiveInstanceByIndex?

		return didInstanceChange;
	}

	public attachToElement(element: HTMLElement): void {
		this._container = element;
		this._tabElement = document.createElement('div');
		this._tabElement.classList.add('terminal-tab');
		this._container.appendChild(this._tabElement);
		this._rootSplitPane.render(this._tabElement);
	}

	public get title(): string {
		let title = this.terminalInstances[0].title;
		for (let i = 1; i < this.terminalInstances.length; i++) {
			title += `, ${this.terminalInstances[i].title}`;
		}
		return title;
	}

	public setVisible(visible: boolean): void {
		if (this._tabElement) {
			this._tabElement.style.display = visible ? '' : 'none';
		}
		// TODO: probably don't need to tell terminal instances about visiblility anymore?
		this.terminalInstances.forEach(i => i.setVisible(visible));
	}

	public split(
		terminalFocusContextKey: IContextKey<boolean>,
		configHelper: TerminalConfigHelper,
		shellLaunchConfig: IShellLaunchConfig
	): ITerminalInstance {
		const instance = this._instantiationService.createInstance(TerminalInstance,
			terminalFocusContextKey,
			configHelper,
			undefined,
			shellLaunchConfig);
		this._terminalInstances.push(instance);
		instance.addDisposable(instance.onDisposed(instance => this._onInstanceDisposed(instance)));

		this._rootSplitPane.orientation = Orientation.HORIZONTAL;
		this._rootSplitPane.split(instance);
		if (this._tabElement) {
			this._rootSplitPane.render(this._tabElement);
		}
		// TOOD: Set this correctly
		this._activeInstanceIndex = 1;

		return instance;
	}

	public addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}

	public layout(width: number, height: number): void {
		this._rootSplitPane.layoutBox(width, height);
	}
}
