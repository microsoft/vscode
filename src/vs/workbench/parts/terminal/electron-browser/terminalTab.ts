/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance, IShellLaunchConfig, ITerminalTab, Direction } from 'vs/workbench/parts/terminal/common/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { TerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminalInstance';
import Event, { Emitter, anyEvent } from 'vs/base/common/event';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { SplitView, Orientation, IView } from 'vs/base/browser/ui/splitview/splitview';

class SplitPane implements IView {
	public minimumSize: number = 100;
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
		this._splitView.onDidSashReset(() => this._resetSize());
		this.layout(this._size);
		this.orthogonalLayout(this.orthogonalSize);

		this.addChild(this.orthogonalSize / 2, this._size, this.instance, 0, this._isContainerSet);
		this.addChild(this.orthogonalSize / 2, this._size, instance);

		// Instance is now owned by the first child
		this.instance = null;
	}

	public split(instance: ITerminalInstance): void {
		if (this._parent && this._parent.orientation === this.orientation) {
			// TODO: Splitting sizes can be a bit weird when not splitting the right-most pane
			//       If we kept proportions when adding the view to the splitview it would be alright
			const index = this._parent._children.indexOf(this);
			this._parent.addChild(this._size / 2, this.orthogonalSize, instance, index + 1);
		} else {
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
		if (!this._isContainerSet && this.instance) {
			if (this._needsReattach) {
				(<any>this.instance).reattachToElement(container);
			} else {
				this.instance.attachToElement(container);
			}
			this._isContainerSet = true;
		}
	}

	public layout(size: number): void {
		// Only layout when both sizes are known
		this._size = size;
		if (!this._size || !this.orthogonalSize) {
			return;
		}

		if (this.instance) {
			if (this.orientation === Orientation.VERTICAL) {
				this.instance.layout({ width: this.orthogonalSize, height: this._size });
			} else {
				this.instance.layout({ width: this._size, height: this.orthogonalSize });
			}
			return;
		}

		for (const child of this.children) {
			child.orthogonalLayout(this._size);
		}
	}

	public orthogonalLayout(size: number): void {
		this.orthogonalSize = size;

		if (this._splitView) {
			this._splitView.layout(this.orthogonalSize);
		}
	}
}

class RootSplitPane extends SplitPane {
	private static _lastKnownWidth: number;
	private static _lastKnownHeight: number;

	private _width: number;
	private _height: number;

	protected branch(container: HTMLElement, orientation: Orientation, instance: ITerminalInstance): void {
		if (orientation === Orientation.VERTICAL) {
			this._size = this._width || RootSplitPane._lastKnownWidth;
			this.orthogonalSize = this._height || RootSplitPane._lastKnownHeight;
		} else {
			this._size = this._height || RootSplitPane._lastKnownHeight;
			this.orthogonalSize = this._width || RootSplitPane._lastKnownWidth;
		}

		super.branch(container, orientation, instance);
	}

	public layoutBox(width: number, height: number): void {
		RootSplitPane._lastKnownWidth = width;
		RootSplitPane._lastKnownHeight = height;
		if (this.orientation === Orientation.VERTICAL) {
			this.layout(width);
			this.orthogonalLayout(height);
		} else if (this.orientation === Orientation.HORIZONTAL) {
			this.layout(height);
			this.orthogonalLayout(width);
		} else {
			this._width = width;
			this._height = height;
			this.instance.layout({ width, height });
		}
	}
}

const directionOrientation: { [direction: number]: Orientation } = {
	[Direction.Left]: Orientation.HORIZONTAL,
	[Direction.Right]: Orientation.HORIZONTAL,
	[Direction.Up]: Orientation.VERTICAL,
	[Direction.Down]: Orientation.VERTICAL
};

export class TerminalTab extends Disposable implements ITerminalTab {
	private _terminalInstances: ITerminalInstance[] = [];
	private _rootSplitPane: RootSplitPane;
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

		this._rootSplitPane = new RootSplitPane();
		this._rootSplitPane.instance = instance;

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

		// Find the instance's SplitPane and unsplit it
		const pane = this._findSplitPane(instance);
		if (pane) {
			pane.remove();
		}

		// Fire events and dispose tab if it was the last instance
		this._onInstancesChanged.fire();
		if (this._terminalInstances.length === 0) {
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

	// TODO: Should this live inside SplitPane?
	private _findSplitPanePath(instance: ITerminalInstance, path: SplitPane[] = [this._rootSplitPane]): SplitPane[] {
		// Gets all split panes from the root to the pane containing the instance.
		const pane = path[path.length - 1];

		// Base case: path found
		if (pane.instance === instance) {
			return path;
		}

		// Rescurse child panes
		for (let i = 0; i < pane.children.length; i++) {
			const child = pane.children[i];

			const subPath = path.slice();
			subPath.push(child);
			const result = this._findSplitPanePath(instance, subPath);
			if (result) {
				return result;
			}
		}

		// No children contain instance
		return null;
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
		if (index >= this._terminalInstances.length) {
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
		this._terminalInstances.push(instance);
		this._initInstanceListeners(instance);

		if (this._rootSplitPane.instance) {
			this._rootSplitPane.orientation = Orientation.HORIZONTAL;
			this._rootSplitPane.split(instance);
		} else {
			// The original branch has already occured, find the inner SplitPane and split it
			const activePane = this._findSplitPane(this.activeInstance);
			activePane.orientation = Orientation.HORIZONTAL;
			activePane.split(instance);
		}
		if (this._tabElement) {
			this._rootSplitPane.render(this._tabElement);
		}
		this._setActiveInstance(instance);

		return instance;
	}

	public addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}

	public layout(width: number, height: number): void {
		this._rootSplitPane.layoutBox(width, height);
	}

	public focusDirection(direction: Direction): void {
		const activeInstance = this.activeInstance;
		if (!activeInstance) {
			return null;
		}

		const desiredOrientation = directionOrientation[direction];
		const isUpOrLeft = direction === Direction.Left || direction === Direction.Up;

		// Find the closest horizontal SplitPane ancestor with a child to the left
		let closestHorizontalPane: SplitPane = null;
		const panePath = this._findSplitPanePath(activeInstance);
		let index = panePath.length - 1;
		let ancestorIndex: number;
		while (--index >= 0) {
			const pane = panePath[index];
			// Continue up the path if not the desired orientation
			if (pane.orientation !== desiredOrientation) {
				continue;
			}

			// Find index of the panePath pane and break out of loop if it's not the left-most child
			ancestorIndex = pane.children.indexOf(panePath[index + 1]);
			// Make sure that the pane is not on the boundary
			if (isUpOrLeft) {
				if (ancestorIndex > 0) {
					closestHorizontalPane = pane;
					break;
				}
			} else {
				if (ancestorIndex < pane.children.length - 1) {
					closestHorizontalPane = pane;
					break;
				}
			}
		}

		// There are no panes to the left
		if (!closestHorizontalPane) {
			return;
		}

		let current: SplitPane;
		if (isUpOrLeft) {
			// Find the bottom/right-most instance
			current = closestHorizontalPane.children[ancestorIndex - 1];
			while (current.children && current.children.length > 0) {
				current = current.children[current.children.length - 1];
			}
		} else {
			// Find the top/left-most instance
			current = closestHorizontalPane.children[ancestorIndex + 1];
			while (current.children && current.children.length > 0) {
				current = current.children[0];
			}
		}

		// Focus the instance to the left
		current.instance.focus();
	}
}
