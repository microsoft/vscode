/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISashEvent, Orientation, OrthogonalEdge, Sash, SashState } from '../../../base/browser/ui/sash/sash.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { observableValue } from '../../../base/common/observable.js';

/** Describes an in-progress or completed quick input resize operation. */
interface IQuickInputResizeState {
	readonly width?: number;
	readonly height?: number;
	readonly done: boolean;
}

/** Describes the current quick input dimensions and resize constraints. */
interface IQuickInputResizeLayout {
	readonly width: number;
	readonly height: number;
	readonly requestedHeight: number;
	readonly minWidth: number;
	readonly maxWidth: number;
	readonly minHeight: number;
	readonly maxHeight: number;
}

/**
 * Controls the resize sashes for an unanchored quick input widget.
 *
 * Horizontal resizing keeps the widget centered. Vertical resizing preserves
 * the requested height when filtering temporarily reduces the content height.
 */
export class QuickInputResizeController extends Disposable {
	readonly resizeState = observableValue<IQuickInputResizeState | undefined>(this, undefined);

	private readonly westSash: Sash;
	private readonly eastSash: Sash;
	private readonly southSash: Sash;
	private enabled = true;
	private currentLayout: IQuickInputResizeLayout = {
		width: 0,
		height: 0,
		requestedHeight: 0,
		minWidth: 0,
		maxWidth: 0,
		minHeight: 0,
		maxHeight: 0
	};
	private drag: {
		readonly width: number;
		readonly height: number;
		readonly requestedHeight: number;
		readonly maxHeight: number;
	} | undefined;

	constructor(container: HTMLElement) {
		super();

		this.westSash = this._register(new Sash(container, {
			getVerticalSashLeft: () => 0,
			getVerticalSashTop: () => 0,
			getVerticalSashHeight: () => container.clientHeight
		}, { orientation: Orientation.VERTICAL }));
		this.eastSash = this._register(new Sash(container, {
			getVerticalSashLeft: () => container.clientWidth,
			getVerticalSashTop: () => 0,
			getVerticalSashHeight: () => container.clientHeight
		}, { orientation: Orientation.VERTICAL }));
		this.southSash = this._register(new Sash(container, {
			getHorizontalSashTop: () => container.clientHeight,
			getHorizontalSashLeft: () => 0,
			getHorizontalSashWidth: () => container.clientWidth
		}, { orientation: Orientation.HORIZONTAL, orthogonalEdge: OrthogonalEdge.South }));
		this.southSash.orthogonalStartSash = this.westSash;
		this.southSash.orthogonalEndSash = this.eastSash;

		this._register(this.westSash.addClass('quick-input-resize-sash'));
		this._register(this.westSash.addClass('quick-input-resize-west'));
		this._register(this.eastSash.addClass('quick-input-resize-sash'));
		this._register(this.eastSash.addClass('quick-input-resize-east'));
		this._register(this.southSash.addClass('quick-input-resize-sash'));
		this._register(this.southSash.addClass('quick-input-resize-south'));

		this._register(Event.any(this.westSash.onDidStart, this.eastSash.onDidStart, this.southSash.onDidStart)(() => {
			if (!this.drag) {
				this.drag = {
					width: this.currentLayout.width,
					height: Math.max(this.currentLayout.minHeight, Math.min(this.currentLayout.maxHeight, this.currentLayout.requestedHeight)),
					requestedHeight: this.currentLayout.requestedHeight,
					maxHeight: this.currentLayout.maxHeight
				};
			}
		}));
		this._register(Event.any(this.westSash.onDidEnd, this.eastSash.onDidEnd, this.southSash.onDidEnd)(() => {
			if (this.drag) {
				this.drag = undefined;
				this.resizeState.set({ done: true }, undefined);
			}
		}));

		this._register(this.westSash.onDidChange(event => this.resizeWidth(event, -1)));
		this._register(this.eastSash.onDidChange(event => this.resizeWidth(event, 1)));
		this._register(this.southSash.onDidChange(event => this.resizeHeight(event)));
	}

	/** Enables or disables all resize sashes. */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		this.updateSashStates();
	}

	/** Updates the rendered size and bounds used by the resize sashes. */
	layout(layout: IQuickInputResizeLayout): void {
		this.currentLayout = layout;
		this.westSash.layout();
		this.eastSash.layout();
		this.southSash.layout();
		this.updateSashStates();
	}

	/** Applies keyboard-provided dimension changes within the current bounds. */
	resize(widthChange: number, heightChange: number): void {
		if (!this.enabled) {
			return;
		}

		let width: number | undefined;
		if (widthChange !== 0) {
			const nextWidth = Math.max(this.currentLayout.minWidth, Math.min(this.currentLayout.maxWidth, this.currentLayout.width + widthChange));
			if (nextWidth !== this.currentLayout.width) {
				width = nextWidth;
			}
		}

		let height: number | undefined;
		if (heightChange !== 0 && !(this.currentLayout.requestedHeight > this.currentLayout.maxHeight && heightChange > 0)) {
			const currentHeight = Math.max(this.currentLayout.minHeight, Math.min(this.currentLayout.maxHeight, this.currentLayout.requestedHeight));
			const nextHeight = Math.max(this.currentLayout.minHeight, Math.min(this.currentLayout.maxHeight, currentHeight + heightChange));
			if (nextHeight !== currentHeight) {
				height = nextHeight;
			}
		}

		if (width !== undefined || height !== undefined) {
			this.resizeState.set({ width, height, done: true }, undefined);
		}
	}

	/** Applies a horizontal sash movement to the quick input width. */
	private resizeWidth(event: ISashEvent, direction: -1 | 1): void {
		if (!this.drag) {
			return;
		}

		const delta = (event.currentX - event.startX) * direction * 2;
		const width = Math.max(this.currentLayout.minWidth, Math.min(this.currentLayout.maxWidth, this.drag.width + delta));
		this.resizeState.set({ width, done: false }, undefined);
	}

	/** Applies a vertical sash movement to the quick input height. */
	private resizeHeight(event: ISashEvent): void {
		if (!this.drag) {
			return;
		}

		const delta = event.currentY - event.startY;
		if (this.drag.requestedHeight > this.drag.maxHeight && delta >= 0) {
			return;
		}
		const height = Math.max(this.currentLayout.minHeight, Math.min(this.currentLayout.maxHeight, this.drag.height + delta));
		this.resizeState.set({ height, done: false }, undefined);
	}

	/** Updates sash states to reflect the current enablement and resize bounds. */
	private updateSashStates(): void {
		if (!this.enabled) {
			this.westSash.state = SashState.Disabled;
			this.eastSash.state = SashState.Disabled;
			this.southSash.state = SashState.Disabled;
			this.southSash.orthogonalStartSash = undefined;
			this.southSash.orthogonalEndSash = undefined;
			return;
		}

		this.westSash.state = this.currentLayout.width <= this.currentLayout.minWidth ? SashState.AtMaximum
			: this.currentLayout.width >= this.currentLayout.maxWidth ? SashState.AtMinimum : SashState.Enabled;
		this.eastSash.state = this.currentLayout.width <= this.currentLayout.minWidth ? SashState.AtMinimum
			: this.currentLayout.width >= this.currentLayout.maxWidth ? SashState.AtMaximum : SashState.Enabled;
		const southState = this.currentLayout.maxHeight <= this.currentLayout.minHeight ? SashState.Disabled
			: this.currentLayout.height <= this.currentLayout.minHeight ? SashState.AtMinimum
				: this.currentLayout.height >= this.currentLayout.maxHeight ? SashState.AtMaximum : SashState.Enabled;
		this.southSash.state = southState;
		this.southSash.orthogonalStartSash = southState === SashState.Disabled ? undefined : this.westSash;
		this.southSash.orthogonalEndSash = southState === SashState.Disabled ? undefined : this.eastSash;
	}
}
