/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { IRectangle } from '../../../../platform/window/common/window.js';

const AGENTS_LAUNCHER_WIDTH = 640;
const AGENTS_LAUNCHER_HORIZONTAL_MARGIN = 48;
const AGENTS_LAUNCHER_MIN_HEIGHT = 120;
const AGENTS_LAUNCHER_MAX_HEIGHT_RATIO = 0.6;
const AGENTS_LAUNCHER_TOP_RATIO = 0.22;

/**
 * Computes the bounds of the Agents Launcher on the display beneath the pointer, in the display's coordinates, for a composer whose
 * content is `contentHeight` CSS pixels high at `zoomFactor`. The composer is as wide as zoomed content allows.
 */
export function computeAgentsLauncherBounds(display: IRectangle, contentHeight: number, zoomFactor = 1): IRectangle {
	const width = Math.min(Math.round(AGENTS_LAUNCHER_WIDTH * zoomFactor), Math.max(1, display.width - AGENTS_LAUNCHER_HORIZONTAL_MARGIN));
	const maximumHeight = Math.max(1, Math.floor(display.height * AGENTS_LAUNCHER_MAX_HEIGHT_RATIO));
	const height = Math.min(Math.max(Math.round(AGENTS_LAUNCHER_MIN_HEIGHT * zoomFactor), Math.ceil(contentHeight * zoomFactor)), maximumHeight);

	return {
		x: Math.round(display.x + (display.width - width) / 2),
		y: Math.round(display.y + display.height * AGENTS_LAUNCHER_TOP_RATIO),
		width,
		height,
	};
}

/** The window operations that present the Agents Launcher, which {@link AgentsLauncherPresenter} sequences. */
export interface IAgentsLauncherWindowPresentation {
	/** The ID of the Agents Launcher's window, should it have one. */
	getWindowId(): number | undefined;
	/** Creates the window should there be none, and lays it out to show: resolves to its ID, or to `undefined` should it be unable to show. */
	prepare(): Promise<number | undefined>;
	setOpacity(windowId: number, opacity: number): Promise<void>;
	/** Moves the window to the bounds {@link prepare} laid it out for. */
	position(windowId: number): Promise<void>;
	show(windowId: number): Promise<void>;
	focus(windowId: number): void;
	/** Resolves once the window has rendered a frame since the call, or after a timeout should it render none. */
	whenRendered(windowId: number): Promise<unknown>;
	hide(windowId: number): Promise<void>;
}

/**
 * Shows and hides the Agents Launcher's window as requested last. A show is a sequence of window operations, any of which a
 * later request interrupts, so that a hide while showing never leaves the window shown, focused, or transparent.
 */
export class AgentsLauncherPresenter {

	private readonly _visible = observableValue<boolean>(this, false);
	/** Whether the Agents Launcher is requested to be visible, as of the latest show or hide. */
	readonly visible: IObservable<boolean> = this._visible;

	/** Counts requests, so that each show continues only while it is the latest one. */
	private _generation = 0;

	constructor(private readonly _presentation: IAgentsLauncherWindowPresentation) { }

	async show(): Promise<void> {
		const generation = ++this._generation;
		const isCurrent = () => generation === this._generation;
		this._visible.set(true, undefined);

		let windowId: number | undefined;
		try {
			const id = windowId = await this._presentation.prepare();
			if (id === undefined) {
				if (isCurrent()) {
					this._visible.set(false, undefined);
				}
				return;
			}
			// Transparent until it has painted: a window shown again can present an old or empty frame for a moment, such
			// as after it was hidden for a while, which flickers.
			for (const step of [
				() => this._presentation.setOpacity(id, 0),
				() => this._presentation.position(id),
				() => this._presentation.show(id),
				() => {
					this._presentation.focus(id);
					return this._presentation.whenRendered(id);
				},
				() => this._presentation.setOpacity(id, 1),
			]) {
				if (!isCurrent()) {
					return this._abandon(id);
				}
				await step();
			}
		} catch (error) {
			if (isCurrent()) {
				this._visible.set(false, undefined);
				if (windowId !== undefined) {
					await this._abandon(windowId);
				}
			}
			throw error;
		}
	}

	async hide(): Promise<void> {
		this._generation++;
		this._visible.set(false, undefined);
		const windowId = this._presentation.getWindowId();
		if (windowId !== undefined) {
			await this._presentation.hide(windowId);
		}
	}

	toggle(): Promise<void> {
		return this._visible.get() ? this.hide() : this.show();
	}

	/** Forgets the window, which has closed, without operating on it. */
	reset(): void {
		this._generation++;
		this._visible.set(false, undefined);
	}

	/** Hides the window of an interrupted show unless a later show presents it. */
	private async _abandon(windowId: number): Promise<void> {
		// A hide before the window was created had no window to hide yet.
		if (!this._visible.get()) {
			await this._presentation.hide(windowId).catch(() => { /* the window may have closed meanwhile */ });
		}
	}
}
