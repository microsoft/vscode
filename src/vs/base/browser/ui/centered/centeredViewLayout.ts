/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SplitView, Orientation, ISplitViewStyles, IView as ISplitViewView } from 'vs/base/browser/ui/splitview/splitview';
import { $ } from 'vs/base/browser/dom';
import { Event, mapEvent } from 'vs/base/common/event';
import { IView } from 'vs/base/browser/ui/grid/gridview';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export interface CenteredViewState {
	leftMarginRatio: number;
	rightMarginRatio: number;
}

const GOLDEN_RATIO = {
	leftMarginRatio: 0.1909,
	rightMarginRatio: 0.1909
};

function createEmptyView() {
	return {
		element: $('.centered-layout-margin'),
		layout: () => undefined,
		minimumSize: 60,
		maximumSize: Number.POSITIVE_INFINITY,
		onDidChange: Event.None
	};
}

function toSplitViewView(view: IView, getHeight: () => number): ISplitViewView {
	return {
		element: view.element,
		maximumSize: view.maximumWidth,
		minimumSize: view.minimumWidth,
		onDidChange: mapEvent(view.onDidChange, widthAndHeight => widthAndHeight && widthAndHeight.width),
		layout: size => view.layout(size, getHeight())
	};
}

export class CenteredViewLayout {

	private splitView: SplitView;
	private width: number = 0;
	private height: number = 0;
	private style: ISplitViewStyles;
	private didLayout = false;
	private splitViewDisposables: IDisposable[] = [];

	constructor(private container: HTMLElement, private view: IView, public readonly state: CenteredViewState = GOLDEN_RATIO) {
		this.container.appendChild(this.view.element);
	}

	layout(width: number, height: number): void {
		this.width = width;
		this.height = height;
		if (this.splitView) {
			this.splitView.layout(width);
			if (!this.didLayout) {
				this.resizeMargins();
			}
		} else {
			this.view.layout(width, height);
		}
		this.didLayout = true;
	}

	private resizeMargins(): void {
		this.splitView.resizeView(0, this.state.leftMarginRatio * this.width);
		this.splitView.resizeView(2, this.state.rightMarginRatio * this.width);
	}

	isActive(): boolean {
		return !!this.splitView;
	}

	styles(style: ISplitViewStyles): void {
		this.style = style;
		if (this.splitView) {
			this.splitView.style(this.style);
		}
	}

	activate(active: boolean): void {
		if (active === this.isActive()) {
			return;
		}

		if (active) {
			this.container.removeChild(this.view.element);
			this.splitView = new SplitView(this.container, {
				inverseAltBehavior: true,
				orientation: Orientation.HORIZONTAL,
				styles: this.style
			});

			this.splitViewDisposables.push(this.splitView.onDidSashChange(() => {
				this.state.leftMarginRatio = this.splitView.getViewSize(0) / this.width;
				this.state.rightMarginRatio = this.splitView.getViewSize(2) / this.width;
			}));
			this.splitViewDisposables.push(this.splitView.onDidSashReset(() => {
				this.state.leftMarginRatio = GOLDEN_RATIO.leftMarginRatio;
				this.state.rightMarginRatio = GOLDEN_RATIO.rightMarginRatio;
				this.resizeMargins();
			}));

			this.splitView.layout(this.width);
			this.splitView.addView(toSplitViewView(this.view, () => this.height), 0);
			this.splitView.addView(createEmptyView(), this.state.leftMarginRatio * this.width, 0);
			this.splitView.addView(createEmptyView(), this.state.rightMarginRatio * this.width, 2);
		} else {
			this.container.removeChild(this.splitView.el);
			this.splitViewDisposables = dispose(this.splitViewDisposables);
			this.splitView.dispose();
			this.splitView = undefined;
			this.container.appendChild(this.view.element);
		}
	}

	dispose(): void {
		this.splitViewDisposables = dispose(this.splitViewDisposables);

		if (this.splitView) {
			this.splitView.dispose();
			this.splitView = undefined;
		}
	}
}
