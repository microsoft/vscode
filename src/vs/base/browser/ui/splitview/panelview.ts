/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./splitview';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { $, append, toggleClass } from 'vs/base/browser/dom';
import { IOptions, SplitView, IView } from './splitview2';
export { IOptions } from './splitview2';

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
	private header: HTMLElement;
	private body: HTMLElement;
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

		const onHeaderKeyDown = chain(domEvent(header, 'keydown')).map(e => new StandardKeyboardEvent(e));

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space)
			.event(this.toggleExpansion, this, this.disposables);

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.LeftArrow)
			.event(this.collapse, this, this.disposables);

		onHeaderKeyDown.filter(e => e.keyCode === KeyCode.RightArrow)
			.event(this.expand, this, this.disposables);

		// TODO@Joao move this down to panelview
		// onHeaderKeyDown.filter(e => e.keyCode === KeyCode.UpArrow)
		// 	.event(focusPrevious, this, this.disposables);

		// onHeaderKeyDown.filter(e => e.keyCode === KeyCode.DownArrow)
		// 	.event(focusNext, this, this.disposables);

		this.body = append(panel, $('.panel-body'));
	}

	private renderHeader(): void {
		toggleClass(this.header, 'expanded', this.state === PanelState.Expanded);
		this.header.setAttribute('aria-expanded', String(this.state === PanelState.Expanded));
	}

	layout(size: number): void {
		this.layoutBody(size - Panel.HEADER_SIZE);
	}

	focus(): void {

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
	}

	collapse(): void {
		if (this.state === PanelState.Collapsed) {
			return;
		}

		this.renderHeader();
	}

	protected abstract renderBody(container: HTMLElement): void;
	protected abstract layoutBody(size: number): void;

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class PanelView implements IDisposable {

	private splitview: SplitView;

	constructor(private container: HTMLElement, options?: IOptions) {
		this.splitview = new SplitView(container, options);
	}

	addPanel(): void {

	}

	removePanel(): void {

	}

	layout(size: number): void {

	}

	dispose(): void {
	}
}
