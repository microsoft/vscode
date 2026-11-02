/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ChatWindowLayoutCell, ChatWindowLayoutMode, ChatWindowLayoutNode, IChatWindowLayoutBranch, ChatWindowTerminalPosition, computeChatWindowLayout } from '../common/chatWindowLayout.js';

/** A part of a chat window as its layout places it. */
export interface IChatWindowLayoutPart {
	readonly element: HTMLElement;
	/** The largest height it takes, such as a chat that shows only its input; unbounded by default. */
	readonly maximumHeight?: number;
	/** Fires when {@link maximumHeight} changes. */
	readonly onDidChange?: Event<unknown>;
	layout(width: number, height: number, top: number, left: number): void;
}

/** A row or column of chrome as the layout places it, beside the parts. */
export interface IChatWindowLayoutChrome {
	readonly element: HTMLElement;
	readonly visible: IObservable<boolean>;
	/** The height of a row, the width of a column. */
	readonly size: IObservable<number>;
	layout(width: number, height: number): void;
}

function isBranch(node: ChatWindowLayoutNode): node is IChatWindowLayoutBranch {
	return (node as Partial<IChatWindowLayoutBranch>).children !== undefined;
}

interface IBox { readonly top: number; readonly left: number; readonly width: number; readonly height: number }

/** How much of the room of a branch a cell takes until it is bounded: the main part wider and taller than the chat. */
function getShare(cell: ChatWindowLayoutCell, orientation: 'row' | 'column'): number {
	switch (cell) {
		case ChatWindowLayoutCell.SidePane: return orientation === 'row' ? 0.6 : 0.55;
		case ChatWindowLayoutCell.Chat: return orientation === 'row' ? 0.4 : 0.45;
		case ChatWindowLayoutCell.Terminals: return orientation === 'column' ? 0.3 : 1;
		case ChatWindowLayoutCell.Column: return 1;
	}
}

/**
 * Divides `total` among children by their shares, in whole pixels, with fixed sizes and maximums first: what a bounded
 * child leaves goes to the others.
 */
export function divideChatWindowRoom(total: number, children: readonly { readonly share: number; readonly fixed?: number; readonly maximum?: number }[]): number[] {
	const sizes = children.map(child => child.fixed);
	let room = total - sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0);
	for (; ;) {
		const open = children.map((child, index) => ({ child, index })).filter(({ index }) => sizes[index] === undefined);
		const shares = open.reduce((sum, { child }) => sum + child.share, 0);
		const bounded = open.find(({ child }) => child.maximum !== undefined && room * child.share / shares > child.maximum);
		if (!bounded) {
			for (const { child, index } of open) {
				sizes[index] = shares ? room * child.share / shares : 0;
			}
			// Whole pixels, rounding where each child ends so that together they take the room.
			let end = 0;
			return sizes.map(size => {
				const start = Math.round(end);
				end += Math.max(0, size ?? 0);
				return Math.round(end) - start;
			});
		}
		sizes[bounded.index] = bounded.child.maximum!;
		room -= bounded.child.maximum!;
	}
}

/**
 * Places the parts of a chat window in its container as its layout mode says, from the chat window layout model, with
 * the provider's chrome: its title row above the chat while the main part is beside it, else across the window, and its
 * strip in a column of its own at the right while the chat is below the main part or hidden.
 *
 * Interim: the window part grid of the workbench takes this over, with sizes the user can change and keep.
 */
export class ChatWindowPartsLayout extends Disposable {

	private _dimension: { width: number; height: number } | undefined;

	private readonly _stripVisible: IObservable<boolean>;

	private readonly _layout = derived(this, reader => computeChatWindowLayout({
		mode: this._layoutMode.read(reader),
		terminalPosition: ChatWindowTerminalPosition.FullWidth,
		terminalsVisible: false,
		activityBar: this._stripVisible.read(reader),
		inputOnly: false,
	}));

	constructor(
		private readonly _parts: ReadonlyMap<ChatWindowLayoutCell, IChatWindowLayoutPart>,
		private readonly _layoutMode: IObservable<ChatWindowLayoutMode>,
		private readonly _gap: IObservable<number>,
		private readonly _chrome: { readonly titleRow?: IChatWindowLayoutChrome; readonly strip?: IChatWindowLayoutChrome } = {},
	) {
		super();
		this._stripVisible = _chrome.strip?.visible ?? constObservable(false);
		for (const element of [..._parts.values()].map(part => part.element).concat(_chrome.titleRow?.element ?? [], _chrome.strip?.element ?? [])) {
			element.style.position = 'absolute';
		}
		const constraints = [..._parts.values()].map(part => part.onDidChange ? observableSignalFromEvent(this, part.onDidChange) : undefined);
		this._register(autorun(reader => {
			this._layout.read(reader);
			this._gap.read(reader);
			_chrome.titleRow?.visible.read(reader);
			_chrome.titleRow?.size.read(reader);
			_chrome.strip?.size.read(reader);
			constraints.forEach(signal => signal?.read(reader));
			this._apply();
		}));
	}

	layout(width: number, height: number): void {
		this._dimension = { width, height };
		this._apply();
	}

	private _apply(): void {
		const layout = this._layout.get();
		for (const [cell, part] of this._parts) {
			part.element.style.display = layout.tabOrder.includes(cell) ? '' : 'none';
		}
		const strip = this._chrome.strip;
		if (strip) {
			strip.element.style.display = layout.tabOrder.includes(ChatWindowLayoutCell.Column) ? '' : 'none';
		}
		const titleRow = this._chrome.titleRow;
		const titleHeight = titleRow?.visible.get() ? titleRow.size.get() : 0;
		if (titleRow) {
			titleRow.element.style.display = titleHeight ? '' : 'none';
		}
		if (!this._dimension) {
			return;
		}
		const window = { top: 0, left: 0, ...this._dimension };
		// Above the chat's column only while the main part is beside the chat: the main part then runs to the top of the window.
		const overChat = layout.mode === ChatWindowLayoutMode.SideBySide;
		const boxes = new Map<ChatWindowLayoutCell, IBox>();
		this._measure(layout.topology, overChat ? window : { ...window, top: titleHeight, height: Math.max(0, window.height - titleHeight) }, boxes);
		const chatBox = boxes.get(ChatWindowLayoutCell.Chat);
		if (overChat && chatBox) {
			boxes.set(ChatWindowLayoutCell.Chat, { ...chatBox, top: chatBox.top + titleHeight, height: Math.max(0, chatBox.height - titleHeight) });
		}
		for (const [cell, box] of boxes) {
			const part = this._parts.get(cell);
			if (part) {
				this._place(part.element, box);
				part.layout(box.width, box.height, box.top, box.left);
			} else if (cell === ChatWindowLayoutCell.Column && strip) {
				this._place(strip.element, box);
				strip.layout(box.width, box.height);
			}
		}
		if (titleRow && titleHeight) {
			const box = overChat && chatBox ? { top: 0, left: chatBox.left, width: chatBox.width, height: titleHeight } : { top: 0, left: 0, width: window.width, height: titleHeight };
			this._place(titleRow.element, box);
			titleRow.layout(box.width, box.height);
		}
	}

	private _place(element: HTMLElement, box: IBox): void {
		element.style.top = `${box.top}px`;
		element.style.left = `${box.left}px`;
		element.style.width = `${box.width}px`;
		element.style.height = `${box.height}px`;
	}

	private _measure(node: ChatWindowLayoutNode, box: IBox, boxes: Map<ChatWindowLayoutCell, IBox>): void {
		if (!isBranch(node)) {
			if (this._isShown(node)) {
				boxes.set(node.cell, box);
			}
			return;
		}
		const children = node.children.filter(child => this._isShown(child));
		const gap = this._gap.get();
		const row = node.orientation === 'row';
		const total = (row ? box.width : box.height) - gap * Math.max(0, children.length - 1);
		const sizes = divideChatWindowRoom(total, children.map(child => {
			if (isBranch(child)) {
				return { share: 1 };
			}
			if (child.cell === ChatWindowLayoutCell.Column) {
				return { share: 1, fixed: row ? this._chrome.strip?.size.get() ?? 0 : undefined };
			}
			const maximum = row ? undefined : this._parts.get(child.cell)?.maximumHeight;
			return { share: getShare(child.cell, node.orientation), maximum: maximum !== undefined && Number.isFinite(maximum) ? maximum : undefined };
		}));
		let offset = 0;
		children.forEach((child, index) => {
			const size = sizes[index];
			this._measure(child, row
				? { top: box.top, left: box.left + offset, width: size, height: box.height }
				: { top: box.top + offset, left: box.left, width: box.width, height: size }, boxes);
			offset += size + gap;
		});
	}

	private _isShown(node: ChatWindowLayoutNode): boolean {
		if (isBranch(node)) {
			return node.children.some(child => this._isShown(child));
		}
		return node.visible && (this._parts.has(node.cell) || (node.cell === ChatWindowLayoutCell.Column && !!this._chrome.strip));
	}
}
