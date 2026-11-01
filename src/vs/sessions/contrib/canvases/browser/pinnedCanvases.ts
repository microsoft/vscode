/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { ICanvas, ICanvasReference } from '../../../../workbench/contrib/canvases/common/canvas.js';

/** The custom view that shows the selected pinned canvas full-page. */
export const PINNED_CANVAS_PAGE_ID = 'sessions.customView.canvas';

/** How many canvases can be pinned at once. Each one keeps its owning session resident. */
export const MAX_PINNED_CANVASES = 5;

/** Editor resources (as strings) of the canvases that are pinned to the sidebar, for `resource in canvasesPinnedToSidebar` checks. */
export const CanvasesPinnedToSidebarContext = new RawContextKey<string[]>('canvasesPinnedToSidebar', [], localize('canvasesPinnedToSidebar', "The editor resources of the canvases that are pinned to the Agents window sidebar"));

/** Whether the pinned canvas that an action targets is connected to its live canvas. */
export const PinnedCanvasConnectedContext = new RawContextKey<boolean>('pinnedCanvasConnected', false, localize('pinnedCanvasConnected', "Whether the targeted pinned canvas is connected to its live canvas"));

/**
 * The persisted identity of a pinned canvas. It survives a window reload while the
 * live canvas resource and its source URL do not, so neither is part of it.
 */
export interface IPinnedCanvasIdentity {
	readonly providerId: string;
	readonly session: URI;
	readonly chat: URI;
	readonly extensionId: string;
	readonly canvasId: string;
	readonly instanceId: string;
}

export const enum PinnedCanvasState {
	/** Connected to its live canvas. */
	Live = 'live',
	/** Not connected yet: it reconnects when it is shown or its chat is shown, or its provider is connecting. */
	Pending = 'pending',
	/** Its canvas is no longer open in its chat. */
	Unavailable = 'unavailable',
}

export interface IPinnedCanvas {
	/** Stable identifier derived from {@link identity}. */
	readonly id: string;
	readonly identity: IPinnedCanvasIdentity;
	/** The live canvas this pin is bound to, `undefined` until it reconnects. */
	readonly reference: IObservable<ICanvasReference | undefined>;
	/** The live canvas state while bound. */
	readonly canvas: IObservable<ICanvas | undefined>;
	/** The live title, or the last known one. */
	readonly title: IObservable<string>;
	/** The title of the owning chat, when it is known. */
	readonly chatTitle: IObservable<string | undefined>;
	readonly state: IObservable<PinnedCanvasState>;
	/** Whether it is looking for its live canvas through its chat, without showing the chat. */
	readonly reconnecting: IObservable<boolean>;
}

/** A pin or the live canvas reference of one. */
export type PinnedCanvasTarget = IPinnedCanvas | ICanvasReference;

export const IPinnedCanvasService = createDecorator<IPinnedCanvasService>('pinnedCanvasService');

/**
 * Canvases pinned to the Agents window sidebar. A pinned canvas stays owned by its
 * chat but is kept live while another chat is shown, and can be shown full-page.
 */
export interface IPinnedCanvasService {
	readonly _serviceBrand: undefined;

	/** Whether canvases are enabled, so pins are kept live and listed. */
	readonly enabled: IObservable<boolean>;

	/** The pins in the order they were added, empty while canvases are disabled. */
	readonly entries: IObservable<readonly IPinnedCanvas[]>;

	/** The pin that the canvas page shows. */
	readonly selected: IObservable<IPinnedCanvas | undefined>;

	/** Returns the pin of a live canvas reference, or the pin itself. */
	getEntry(target: PinnedCanvasTarget, reader?: IReader): IPinnedCanvas | undefined;

	isPinned(reference: ICanvasReference, reader?: IReader): boolean;

	/** Whether the canvas page currently shows this canvas. */
	isShown(reference: ICanvasReference, reader?: IReader): boolean;

	/** The live state of a pinned canvas bound to this reference, or `undefined` when it is not pinned. */
	getTrackedCanvas(reference: ICanvasReference, reader?: IReader): ICanvas | undefined;

	/**
	 * Pins a live canvas of a chat. Returns `false` and tells the user when the canvas
	 * cannot be pinned, for example when {@link MAX_PINNED_CANVASES} are pinned already.
	 */
	pin(reference: ICanvasReference): boolean;

	unpin(target: PinnedCanvasTarget): void;

	/**
	 * Shows a pin on the canvas page, never its chat, and reconnects it when it is not
	 * connected to its live canvas.
	 */
	show(target: PinnedCanvasTarget): Promise<void>;

	/** Looks for the live canvas of a pin that is not connected, without showing its chat. */
	reconnect(target: PinnedCanvasTarget): void;

	/** Shows the chat that owns a pin. */
	goToChat(target: PinnedCanvasTarget): Promise<void>;

	/** Closes the live canvas of a pin, which also removes the pin. */
	closeCanvas(target: PinnedCanvasTarget): Promise<void>;
}
