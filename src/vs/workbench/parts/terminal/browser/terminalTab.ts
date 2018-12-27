/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as aria from 'vs/base/browser/ui/aria/aria';
import * as nls from 'vs/nls';
import { ITerminalInstance, IShellLaunchConfig, ITerminalTab, Direction, ITerminalService, ITerminalConfigHelper } from 'vs/workbench/parts/terminal/common/terminal';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { SplitView, Orientation, IView, Sizing } from 'vs/base/browser/ui/splitview/splitview';
import { IPartService, Position } from 'vs/workbench/services/part/common/partService';

const SPLIT_PANE_MIN_SIZE = 120;
const TERMINAL_MIN_USEFUL_SIZE = 250;

class SplitPaneContainer {
	private _height: number;
	private _width: number;
	private _splitView: SplitView;
	private _splitViewDisposables: IDisposable[];
	private _children: SplitPane[] = [];


	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	constructor(
		private _container: HTMLElement,
		public orientation: Orientation
	) {
		this._width = this._container.offsetWidth;
		this._height = this._container.offsetHeight;
		this._createSplitView();
		this._splitView.layout(this.orientation === Orientation.HORIZONTAL ? this._width : this._height);
	}

	private _createSplitView(): void {
		this._splitView = new SplitView(this._container, { orientation: this.orientation });
		this._splitViewDisposables = [];
		this._splitViewDisposables.push(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));
	}

	public split(instance: ITerminalInstance, index: number = this._children.length): void {
		this._addChild(instance, index);
	}

	public resizePane(index: number, direction: Direction, amount: number): void {
		// TODO: Should resize pane up/down resize the panel?

		// Only resize the correct dimension
		const isHorizontal = direction === Direction.Left || direction === Direction.Right;
		if (isHorizontal && this.orientation !== Orientation.HORIZONTAL ||
			!isHorizontal && this.orientation !== Orientation.VERTICAL) {
			return;
		}

		// Only resize when there is mor ethan one pane
		if (this._children.length <= 1) {
			return;
		}

		// Get sizes
		const sizes: number[] = [];
		for (let i = 0; i < this._splitView.length; i++) {
			sizes.push(this._splitView.getViewSize(i));
		}

		// Remove size from right pane, unless index is the last pane in which case use left pane
		const isSizingEndPane = index !== this._children.length - 1;
		const indexToChange = isSizingEndPane ? index + 1 : index - 1;
		if (isSizingEndPane && direction === Direction.Left) {
			amount *= -1;
		} else if (!isSizingEndPane && direction === Direction.Right) {
			amount *= -1;
		} else if (isSizingEndPane && direction === Direction.Up) {
			amount *= -1;
		} else if (!isSizingEndPane && direction === Direction.Down) {
			amount *= -1;
		}

		// Ensure the size is not reduced beyond the minimum, otherwise weird things can happen
		if (sizes[index] + amount < SPLIT_PANE_MIN_SIZE) {
			amount = SPLIT_PANE_MIN_SIZE - sizes[index];
		} else if (sizes[indexToChange] - amount < SPLIT_PANE_MIN_SIZE) {
			amount = sizes[indexToChange] - SPLIT_PANE_MIN_SIZE;
		}

		// Apply the size change
		sizes[index] += amount;
		sizes[indexToChange] -= amount;
		for (let i = 0; i < this._splitView.length - 1; i++) {
			this._splitView.resizeView(i, sizes[i]);
		}
	}

	private _addChild(instance: ITerminalInstance, index: number): void {
		const child = new SplitPane(instance, this.orientation === Orientation.HORIZONTAL ? this._height : this._width);
		child.orientation = this.orientation;
		if (typeof index === 'number') {
			this._children.splice(index, 0, child);
		} else {
			this._children.push(child);
		}

		this._withDisabledLayout(() => this._splitView.addView(child, Sizing.Distribute, index));

		this._onDidChange = Event.any(...this._children.map(c => c.onDidChange));
	}

	public remove(instance: ITerminalInstance): void {
		let index: number | null = null;
		for (let i = 0; i < this._children.length; i++) {
			if (this._children[i].instance === instance) {
				index = i;
			}
		}
		if (index !== null) {
			this._children.splice(index, 1);
			this._splitView.removeView(index, Sizing.Distribute);
		}
	}

	public layout(width: number, height: number): void {
		this._width = width;
		this._height = height;
		if (this.orientation === Orientation.HORIZONTAL) {
			this._children.forEach(c => c.orthogonalLayout(height));
			this._splitView.layout(width);
		} else {
			this._children.forEach(c => c.orthogonalLayout(width));
			this._splitView.layout(height);
		}
	}

	public setOrientation(orientation: Orientation): void {
		if (this.orientation === orientation) {
			return;
		}
		this.orientation = orientation;

		// Remove old split view
		while (this._container.children.length > 0) {
			this._container.removeChild(this._container.children[0]);
		}
		this._splitViewDisposables.forEach(d => d.dispose());
		this._splitViewDisposables = [];
		this._splitView.dispose();

		// Create new split view with updated orientation
		this._createSplitView();
		this._withDisabledLayout(() => {
			this._children.forEach(child => {
				child.orientation = orientation;
				this._splitView.addView(child, 1);
			});
		});
	}

	private _withDisabledLayout(innerFunction: () => void): void {
		// Whenever manipulating views that are going to be changed immediately, disabling
		// layout/resize events in the terminal prevent bad dimensions going to the pty.
		this._children.forEach(c => c.instance.disableLayout = true);
		innerFunction();
		this._children.forEach(c => c.instance.disableLayout = false);
	}
}

class SplitPane implements IView {
	public minimumSize: number = SPLIT_PANE_MIN_SIZE;
	public maximumSize: number = Number.MAX_VALUE;

	public orientation: Orientation | undefined;
	protected _size: number;

	private _onDidChange: Event<number | undefined> = Event.None;
	public get onDidChange(): Event<number | undefined> { return this._onDidChange; }

	readonly element: HTMLElement;

	constructor(
		readonly instance: ITerminalInstance,
		public orthogonalSize: number
	) {
		this.element = document.createElement('div');
		this.element.className = 'terminal-split-pane';
		this.instance.attachToElement(this.element);
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
	private _tabElement: HTMLElement | null;
	private _panelPosition: Position = Position.BOTTOM;

	private _activeInstanceIndex: number;

	public get terminalInstances(): ITerminalInstance[] { return this._terminalInstances; }

	private readonly _onDisposed: Emitter<ITerminalTab>;
	public get onDisposed(): Event<ITerminalTab> { return this._onDisposed.event; }
	private readonly _onInstancesChanged: Emitter<void>;
	public get onInstancesChanged(): Event<void> { return this._onInstancesChanged.event; }

	constructor(
		terminalFocusContextKey: IContextKey<boolean>,
		configHelper: ITerminalConfigHelper,
		private _container: HTMLElement,
		shellLaunchConfig: IShellLaunchConfig,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IPartService private readonly _partService: IPartService
	) {
		super();
		this._onDisposed = new Emitter<ITerminalTab>();
		this._onInstancesChanged = new Emitter<void>();

		const instance = this._terminalService.createInstance(
			terminalFocusContextKey,
			configHelper,
			undefined,
			shellLaunchConfig,
			true);
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

	public get activeInstance(): ITerminalInstance | null {
		if (this._terminalInstances.length === 0) {
			return null;
		}
		return this._terminalInstances[this._activeInstanceIndex];
	}

	private _initInstanceListeners(instance: ITerminalInstance): void {
		instance.addDisposable(instance.onDisposed(instance => this._onInstanceDisposed(instance)));
		instance.addDisposable(instance.onFocused(instance => {
			aria.alert(nls.localize('terminalFocus', "Terminal {0}", this._terminalService.activeTabIndex + 1));
			this._setActiveInstance(instance);
		}));
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
			const newIndex = index < this._terminalInstances.length ? index : this._terminalInstances.length - 1;
			this.setActiveInstanceByIndex(newIndex);
			// TODO: Only focus the new instance if the tab had focus?
			if (this.activeInstance) {
				this.activeInstance.focus(true);
			}
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
			this._panelPosition = this._partService.getPanelPosition();
			const orientation = this._panelPosition === Position.BOTTOM ? Orientation.HORIZONTAL : Orientation.VERTICAL;
			const newLocal = new SplitPaneContainer(this._tabElement, orientation);
			this._splitPaneContainer = newLocal;
			this.terminalInstances.forEach(instance => this._splitPaneContainer!.split(instance));
		}
	}

	public get title(): string {
		let title = this.terminalInstances[0].title;
		for (let i = 1; i < this.terminalInstances.length; i++) {
			if (this.terminalInstances[i].title) {
				title += `, ${this.terminalInstances[i].title}`;
			}
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
		configHelper: ITerminalConfigHelper,
		shellLaunchConfig: IShellLaunchConfig
	): ITerminalInstance | undefined {
		const newTerminalSize = ((this._panelPosition === Position.BOTTOM ? this._container.clientWidth : this._container.clientHeight) / (this._terminalInstances.length + 1));
		if (newTerminalSize < TERMINAL_MIN_USEFUL_SIZE) {
			return undefined;
		}
		const instance = this._terminalService.createInstance(
			terminalFocusContextKey,
			configHelper,
			undefined,
			shellLaunchConfig,
			true);
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
			// Check if the panel position changed and rotate panes if so
			const newPanelPosition = this._partService.getPanelPosition();
			const panelPositionChanged = newPanelPosition !== this._panelPosition;
			if (panelPositionChanged) {
				const newOrientation = newPanelPosition === Position.BOTTOM ? Orientation.HORIZONTAL : Orientation.VERTICAL;
				this._splitPaneContainer.setOrientation(newOrientation);
				this._panelPosition = newPanelPosition;
			}

			this._splitPaneContainer.layout(width, height);
		}
	}

	public focusPreviousPane(): void {
		const newIndex = this._activeInstanceIndex === 0 ? this._terminalInstances.length - 1 : this._activeInstanceIndex - 1;
		this.setActiveInstanceByIndex(newIndex);
	}

	public focusNextPane(): void {
		const newIndex = this._activeInstanceIndex === this._terminalInstances.length - 1 ? 0 : this._activeInstanceIndex + 1;
		this.setActiveInstanceByIndex(newIndex);
	}

	public resizePane(direction: Direction): void {
		if (!this._splitPaneContainer) {
			return;
		}

		const isHorizontal = (direction === Direction.Left || direction === Direction.Right);
		const font = this._terminalService.configHelper.getFont();
		// TODO: Support letter spacing and line height
		const amount = isHorizontal ? font.charWidth : font.charHeight;
		if (amount) {
			this._splitPaneContainer.resizePane(this._activeInstanceIndex, direction, amount);
		}
	}
}
