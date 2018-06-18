/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SplitView, Sizing, Orientation, ISplitViewStyles, IView as ISplitViewView } from 'vs/base/browser/ui/splitview/splitview';
import { $ } from 'vs/base/browser/dom';
import { Event, mapEvent } from 'vs/base/common/event';
import { IView } from 'vs/base/browser/ui/grid/gridview';

function toSplitViewView(view: IView, getHeight: () => number): ISplitViewView {
	return {
		element: view.element,
		maximumSize: view.maximumWidth,
		minimumSize: view.minimumWidth,
		onDidChange: mapEvent(view.onDidChange, widthAndHeight => widthAndHeight ? widthAndHeight.width : 0),
		layout: size => view.layout(size, getHeight())
	};
}

export class CenteredViewLayout {

	private splitView: SplitView;
	private element: HTMLElement;
	private height: number;
	private style: ISplitViewStyles;

	constructor(private container: HTMLElement, private view: IView) {
		this.container.appendChild(this.view.element);
	}

	layout(width: number, height: number): void {
		this.height = height;
		if (this.splitView) {
			this.splitView.layout(width);
		} else {
			this.view.layout(width, height);
		}
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

	resetView(view: IView): void {
		this.view = view;
		if (this.splitView) {
			this.splitView.removeView(1);
			this.splitView.addView(toSplitViewView(this.view, () => this.height), Sizing.Distribute, 1);
			this.splitView.distributeViewSizes();
		}
	}

	activate(active: boolean): void {
		if (active === !!this.splitView) {
			return;
		}

		if (active) {
			this.element = $('.centered-view-layout');
			this.container.removeChild(this.view.element);
			this.container.appendChild(this.element);
			this.splitView = new SplitView(this.element, {
				inverseAltBehavior: true,
				orientation: Orientation.HORIZONTAL,
				styles: this.style
			});

			const getEmptyView = () => ({
				element: $('.centered-layout-margin'),
				layout: () => undefined,
				minimumSize: 20,
				maximumSize: Number.POSITIVE_INFINITY,
				onDidChange: Event.None
			});

			this.splitView.addView(getEmptyView(), Sizing.Distribute);
			this.splitView.addView(toSplitViewView(this.view, () => this.height), Sizing.Distribute);
			this.splitView.addView(getEmptyView(), Sizing.Distribute);
		} else {
			this.splitView.dispose();
			this.splitView = undefined;
			this.container.removeChild(this.element);
			this.container.appendChild(this.view.element);
		}
	}

	dispose(): void {
		if (this.splitView) {
			this.splitView.dispose();
		}
	}
}
