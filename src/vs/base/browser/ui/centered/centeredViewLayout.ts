/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SplitView, Sizing, IView, Orientation } from 'vs/base/browser/ui/splitview/splitview';
import { $ } from 'vs/base/browser/dom';
import { Event } from 'vs/base/common/event';

export class CenteredViewLayout {

	private splitView: SplitView;
	readonly element: HTMLElement;
	private active: boolean;

	constructor(container: HTMLElement, view: IView) {
		this.element = $('.centered-view-layout');
		container.appendChild(this.element);

		this.splitView = new SplitView(this.element, {
			inverseAltBehavior: true,
			orientation: Orientation.HORIZONTAL
		});

		this.splitView.addView(view, Sizing.Distribute);
	}

	layout(size: number): void {
		this.splitView.layout(size);
	}

	isActive(): boolean {
		return this.active;
	}

	activate(active: boolean): void {
		this.active = active;
		if (this.active) {
			const emptyView = {
				element: $('.'),
				layout: () => undefined,
				minimumSize: 20,
				maximumSize: Number.POSITIVE_INFINITY,
				onDidChange: Event.None
			};

			this.splitView.addView(emptyView, Sizing.Distribute, 0);
			this.splitView.addView(emptyView, Sizing.Distribute);
		} else {
			this.splitView.removeView(0);
			this.splitView.removeView(1);
		}
	}

	dispose(): void {
		this.splitView.dispose();
	}
}
