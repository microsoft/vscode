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

class SplitPaneContainer implements IView {
	public minimumSize: number = 40;
	public maximumSize: number = Number.MAX_VALUE;

	// TODO: Swap height and width when rotation is implemented
	private _height: number;
	private _width: number;
	private _splitView: SplitView;
	private _children: SplitPane[] = [];

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	constructor(
		private _container: HTMLElement,
		public orientation: Orientation
	) {
		this._width = this._container.offsetWidth;
		this._height = this._container.offsetHeight;
		this._splitView = new SplitView(this._container, { orientation: this.orientation });
		this._splitView.onDidSashReset(() => this._resetSize());
		this.render(this._container);
		this._splitView.layout(this._width);
	}

	public split(instance: ITerminalInstance, index: number = this._children.length): void {
		this._addChild(this._width / (this._children.length + 1), instance, index);
	}

	private _resetSize(): void {
		let totalSize = 0;
		for (let i = 0; i < this._splitView.length; i++) {
			totalSize += this._splitView.getViewSize(i);
		}
		const newSize = Math.floor(totalSize / this._splitView.length);
		for (let i = 0; i < this._splitView.length - 1; i++) {
			this._splitView.resizeView(i, newSize);
		}
	}

	private _addChild(size: number, instance: ITerminalInstance, index: number): void {
		const child = new SplitPane(this._height);
		child.orientation = this.orientation;
		child.instance = instance;
		this._splitView.addView(child, size, index);

		if (typeof index === 'number') {
			this._children.splice(index, 0, child);
		} else {
			this._children.push(child);
		}

		this._resetSize();

		this._onDidChange = anyEvent(...this._children.map(c => c.onDidChange));
	}

	public render(container: HTMLElement): void {
		this._container = container;
	}

	public remove(instance: ITerminalInstance): void {
		let index = null;
		for (let i = 0; i < this._children.length; i++) {
			if (this._children[i].instance === instance) {
				index = i;
			}
		}
		if (index !== null) {
			this._children.splice(index, 1);
			this._splitView.removeView(index);
			this._resetSize();
		}
	}

	public layoutBox(width: number, height: number): void {
		if (this.orientation === Orientation.HORIZONTAL) {
			this.layout(height);
			this.orthogonalLayout(width);
		} else {
			this.layout(width);
			this.orthogonalLayout(height);
		}
	}

	public layout(size: number): void {
		// Only layout when both sizes are known
		this._height = size;
		if (!this._height) {
			return;
		}

		this._children.forEach(c => c.orthogonalLayout(this._height));
	}

	public orthogonalLayout(size: number): void {
		this._width = size;

		if (this._splitView) {
			this._splitView.layout(this._width);
		}
	}
}

class SplitPane implements IView {
	public minimumSize: number = 40;
	public maximumSize: number = Number.MAX_VALUE;

	public instance: ITerminalInstance;
	public orientation: Orientation | undefined;
	protected _size: number;
	private _isContainerSet: boolean = false;

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	constructor(
		public orthogonalSize: number
	) {
	}

	public render(container: HTMLElement): void {
		if (!container) {
			return;
		}
		if (!this._isContainerSet && this.instance) {
			this.instance.attachToElement(container);
			this._isContainerSet = true;
		}
	}

	public layout(size: number): void {
		// Only layout when both sizes are known
		this._size = size;
		if (!this._size || !this.orthogonalSize) {
			return;
		}

		if (this.orientation === Orientation.VERTICAL) {
			this.instance.layout({ width: this.orthogonalSize, height: this._size });
		} else {
			this.instance.layout({ width: this._size, height: this.orthogonalSize });
		}
	}

	public orthogonalLayout(size: number): void {
		this.orthogonalSize = size;
	}
}

export class TerminalTab extends Disposable implements ITerminalTab {
	private _terminalInstances: ITerminalInstance[] = [];
	private _splitPaneContainer: SplitPaneContainer | undefined;
	private _tabElement: HTMLElement;

	private _activeInstanceIndex: number;

	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }

	private _onDisposed: Emitter<ITerminalTab>;
	public get onDisposed(): Event<ITerminalTab> { return this._onDisposed.event; }
	private _onInstancesChanged: Emitter<void>;
	public get onInstancesChanged(): Event<void> { return this._onInstancesChanged.event; }

	constructor(
		terminalFocusContextKey: IContextKey<boolean>,
		configHelper: TerminalConfigHelper,
		private _container: HTMLElement,
		shellLaunchConfig: IShellLaunchConfig,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this._onDisposed = new Emitter<ITerminalTab>();
		this._onInstancesChanged = new Emitter<void>();

		const instance = this._instantiationService.createInstance(TerminalInstance,
			terminalFocusContextKey,
			configHelper,
			undefined,
			shellLaunchConfig);
		this._terminalInstances.push(instance);
		this._initInstanceListeners(instance);
		this._activeInstanceIndex = 0;

		if (this._container) {
			this.attachToElement(this._container);
		}
	}

	public dispose(): void {
		super.dispose();
		if (this._tabElement) {
			this._container.removeChild(this._tabElement);
			this._tabElement = null;
		}
		this._terminalInstances = [];
		this._onInstancesChanged.fire();
	}

	public get activeInstance(): ITerminalInstance {
		if (this._terminalInstances.length === 0) {
			return null;
		}
		return this._terminalInstances[this._activeInstanceIndex];
	}

	private _initInstanceListeners(instance: ITerminalInstance): void {
		instance.addDisposable(instance.onDisposed(instance => this._onInstanceDisposed(instance)));
		instance.addDisposable(instance.onFocused(instance => this._setActiveInstance(instance)));
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
			// TODO: Only focus the new instance if the tab had focus?
			this.activeInstance.focus(true);
		}

		// Remove the instance from the split pane if it has been created
		if (this._splitPaneContainer) {
			this._splitPaneContainer.remove(instance);
		}

		// Fire events and dispose tab if it was the last instance
		this._onInstancesChanged.fire();
		if (this._terminalInstances.length === 0) {
			this._onDisposed.fire(this);
			this.dispose();
		}
	}

	private _setActiveInstance(instance: ITerminalInstance): void {
		this.setActiveInstanceByIndex(this._getIndexFromId(instance.id));
	}

	private _getIndexFromId(terminalId: number): number {
		let terminalIndex = -1;
		this.terminalInstances.forEach((terminalInstance, i) => {
			if (terminalInstance.id === terminalId) {
				terminalIndex = i;
			}
		});
		if (terminalIndex === -1) {
			throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
		}
		return terminalIndex;
	}

	public setActiveInstanceByIndex(index: number): void {
		// Check for invalid value
		if (index < 0 || index >= this._terminalInstances.length) {
			return;
		}

		const didInstanceChange = this._activeInstanceIndex !== index;
		this._activeInstanceIndex = index;

		if (didInstanceChange) {
			this._onInstancesChanged.fire();
		}
	}

	public attachToElement(element: HTMLElement): void {
		this._container = element;
		this._tabElement = document.createElement('div');
		this._tabElement.classList.add('terminal-tab');
		this._container.appendChild(this._tabElement);
		if (!this._splitPaneContainer) {
			this._splitPaneContainer = new SplitPaneContainer(this._tabElement, Orientation.HORIZONTAL);
			this.terminalInstances.forEach(instance => this._splitPaneContainer.split(instance));
		}
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
		// TODO: Should this be pulled from the splitpanes instead? Currently there are 2 sources of truth.
		//       _terminalInstances is also the order they were created, not the order in which they appear
		this._terminalInstances.splice(this._activeInstanceIndex + 1, 0, instance);
		this._initInstanceListeners(instance);
		this._setActiveInstance(instance);

		if (this._splitPaneContainer) {
			this._splitPaneContainer.split(instance, this._activeInstanceIndex);
		}

		return instance;
	}

	public addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}

	public layout(width: number, height: number): void {
		if (this._splitPaneContainer) {
			this._splitPaneContainer.layoutBox(width, height);
		}
	}

	public focusPreviousPane(): void {
		this.setActiveInstanceByIndex(this._activeInstanceIndex - 1);
	}

	public focusNextPane(): void {
		this.setActiveInstanceByIndex(this._activeInstanceIndex + 1);
	}
}
