/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { $, append, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { firstIndex } from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { SplitView, IView } from './splitview2';

enum PanelState {
	Expanded,
	Collapsed
}

export interface IPanelOptions {
	ariaHeaderLabel?: string;
	minimumBodySize?: number;
	maximumBodySize?: number;
	collapsed?: boolean;
}

export abstract class Panel implements IView {

	private static HEADER_SIZE = 22;

	private state: PanelState = PanelState.Expanded;
	private _onDidChange = new Emitter<void>();
	private _minimumBodySize: number;
	private _maximumBodySize: number;
	private ariaHeaderLabel: string;
	readonly header: HTMLElement;
	private disposables: IDisposable[] = [];

	get minimumBodySize(): number {
		return this._minimumBodySize;
	}

	set minimumBodySize(size: number) {
		this._minimumBodySize = size;
		this._onDidChange.fire();
	}

	get maximumBodySize(): number {
		return this._maximumBodySize;
	}

	set maximumBodySize(size: number) {
		this._maximumBodySize = size;
		this._onDidChange.fire();
	}

	get minimumSize(): number {
		return Panel.HEADER_SIZE + (this.state === PanelState.Collapsed ? 0 : this._minimumBodySize);
	}

	get maximumSize(): number {
		return Panel.HEADER_SIZE + (this.state === PanelState.Collapsed ? 0 : this._maximumBodySize);
	}

	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(options: IPanelOptions = {}) {
		this.ariaHeaderLabel = options.ariaHeaderLabel || '';
		this._minimumBodySize = typeof options.minimumBodySize === 'number' ? options.minimumBodySize : 44;
		this._maximumBodySize = typeof options.maximumBodySize === 'number' ? options.maximumBodySize : Number.POSITIVE_INFINITY;
		this.state = options.collapsed ? PanelState.Collapsed : PanelState.Expanded;
	}

	render(container: HTMLElement): void {
		const panel = append(container, $('.panel'));
		const header = append(panel, $('.panel-header'));

		header.setAttribute('tabindex', '0');
		header.setAttribute('role', 'toolbar');
		header.setAttribute('aria-label', this.ariaHeaderLabel);
		this.renderHeader();

		const onHeaderKeyDown = chain(domEvent(header, 'keydown'))
			.map(e => new StandardKeyboardEvent(e));

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space)
			.event(this.toggleExpansion, this, this.disposables);

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow)
			.event(this.collapse, this, this.disposables);

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.RightArrow)
			.event(this.expand, this, this.disposables);

		domEvent(header, 'click')(this.toggleExpansion, this, this.disposables);

		// TODO@Joao move this down to panelview
		// onHeaderKeyDown.filter(e => e.keyCode === KeyCode.UpArrow)
		// 	.event(focusPrevious, this, this.disposables);

		// onHeaderKeyDown.filter(e => e.keyCode === KeyCode.DownArrow)
		// 	.event(focusNext, this, this.disposables);

		const body = append(panel, $('.panel-body'));
		this.renderBody(body);
	}

	layout(size: number): void {
		this.layoutBody(size - Panel.HEADER_SIZE);
	}

	focus(): void {
		// TODO@joao what to do
	}

	toggleExpansion(): void {
		if (this.state === PanelState.Expanded) {
			return this.collapse();
		} else {
			return this.expand();
		}
	}

	expand(): void {
		if (this.state === PanelState.Expanded) {
			return;
		}

		this.renderHeader();
		this._onDidChange.fire();
	}

	collapse(): void {
		if (this.state === PanelState.Collapsed) {
			return;
		}

		this.renderHeader();
		this._onDidChange.fire();
	}

	private renderHeader(): void {
		toggleClass(this.header, 'expanded', this.state === PanelState.Expanded);
		this.header.setAttribute('aria-expanded', String(this.state === PanelState.Expanded));
	}

	protected abstract renderBody(container: HTMLElement): void;
	protected abstract layoutBody(size: number): void;

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

interface IDndContext {
	draggable: PanelDraggable | null;
}

class PanelDraggable implements IDisposable {

	// see https://github.com/Microsoft/vscode/issues/14470
	private dragOverCounter = 0;
	private dropBackground: Color | undefined;
	private disposables: IDisposable[] = [];

	private _onDidDrop = new Emitter<{ from: Panel, to: Panel }>();
	readonly onDidDrop = this._onDidDrop.event;

	constructor(private panel: Panel, private context: IDndContext) {
		domEvent(panel.header, 'dragstart')(this.onDragStart, this, this.disposables);
		domEvent(panel.header, 'dragenter')(this.onDragEnter, this, this.disposables);
		domEvent(panel.header, 'dragleave')(this.onDragLeave, this, this.disposables);
		domEvent(panel.header, 'dragend')(this.onDragEnd, this, this.disposables);
		domEvent(panel.header, 'drop')(this.onDrop, this, this.disposables);
	}

	private onDragStart(e: DragEvent): void {
		e.dataTransfer.effectAllowed = 'move';

		const dragImage = append(document.body, $('.monaco-panel-drag-image', {}, this.panel.header.textContent));
		e.dataTransfer.setDragImage(dragImage, -10, -10);
		setTimeout(() => document.body.removeChild(dragImage), 0);

		this.context.draggable = this;
	}

	private onDragEnter(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		this.dragOverCounter++;
		this.renderHeader();
	}

	private onDragLeave(e: DragEvent): void {
		if (!this.context.draggable || this.context.draggable === this) {
			return;
		}

		this.dragOverCounter--;

		if (this.dragOverCounter === 0) {
			this.renderHeader();
		}
	}

	private onDragEnd(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		this.dragOverCounter = 0;
		this.renderHeader();
		this.context.draggable = null;
	}

	private onDrop(e: DragEvent): void {
		if (!this.context.draggable) {
			return;
		}

		this.dragOverCounter = 0;
		this.renderHeader();

		if (this.context.draggable !== this) {
			this._onDidDrop.fire({ from: this.context.draggable.panel, to: this.panel });
		}

		this.context.draggable = null;
	}

	private renderHeader(): void {
		this.panel.header.style.backgroundColor = this.dragOverCounter === 0 && this.dropBackground
			? this.dropBackground.toString()
			: null;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class IPanelViewOptions {
	dnd?: boolean;
}

interface IPanelItem {
	panel: Panel;
	disposable: IDisposable;
}

export class PanelView implements IDisposable {

	private dnd: boolean;
	private dndContext: IDndContext = { draggable: null };
	private el: HTMLElement;
	private panelItems: IPanelItem[] = [];
	private splitview: SplitView;
	private animationTimer: number | null = null;

	constructor(private container: HTMLElement, options?: IPanelViewOptions) {
		this.dnd = !!options.dnd;
		this.el = append(container, $('.monaco-panel-view'));
		this.splitview = new SplitView(container);
	}

	addPanel(panel: Panel, size: number, index = this.splitview.length): void {
		const disposables: IDisposable[] = [];
		panel.onDidChange(this.setupAnimation, this, disposables);

		if (this.dnd) {
			const draggable = new PanelDraggable(panel, this.dndContext);
			disposables.push(draggable);
			draggable.onDidDrop(({ from, to }) => this.movePanel(from, to), null, disposables);
		}

		const panelItem = { panel, disposable: combinedDisposable(disposables) };

		this.panelItems.splice(index, 0, panelItem);
		this.splitview.addView(panel, size, index);
	}

	removePanel(panel: Panel): void {
		const index = firstIndex(this.panelItems, item => item.panel === panel);

		if (index === -1) {
			return;
		}

		this.splitview.removeView(index);
		const panelItem = this.panelItems.splice(index, 1)[0];
		panelItem.disposable.dispose();
	}

	movePanel(from: Panel, to: Panel): void {
		const fromIndex = firstIndex(this.panelItems, item => item.panel === from);
		const toIndex = firstIndex(this.panelItems, item => item.panel === to);

		if (fromIndex === -1 || toIndex === -1) {
			return;
		}

		this.splitview.moveView(fromIndex, toIndex);
	}

	layout(size: number): void {
		this.splitview.layout(size);
	}

	// TODO@Joao: move this to panelview
	private setupAnimation(): void {
		if (typeof this.animationTimer === 'number') {
			window.clearTimeout(this.animationTimer);
		}

		addClass(this.el, 'animated');

		this.animationTimer = window.setTimeout(() => {
			this.animationTimer = null;
			removeClass(this.el, 'animated');
		}, 200);
	}

	dispose(): void {

	}
}
