/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable } from '../../../../base/common/observable.js';
import { ChatWindowLayoutCell, ChatWindowLayoutMode, ChatWindowLayoutNode, IChatWindowLayoutBranch, ChatWindowTerminalPosition, computeChatWindowLayout } from '../common/chatWindowLayout.js';

/** A part of a chat window as its layout places it. */
export interface IChatWindowLayoutPart {
	readonly element: HTMLElement;
	layout(width: number, height: number, top: number, left: number): void;
}

function isBranch(node: ChatWindowLayoutNode): node is IChatWindowLayoutBranch {
	return (node as Partial<IChatWindowLayoutBranch>).children !== undefined;
}

interface IBox { readonly top: number; readonly left: number; readonly width: number; readonly height: number }

/**
 * Places the parts of a chat window in its container as its layout mode says, from the chat window layout model.
 *
 * Interim: the window part grid of the workbench takes this over, with sizes the user can change and keep.
 */
export class ChatWindowPartsLayout extends Disposable {

	private _dimension: { width: number; height: number } | undefined;

	private readonly _layout = derived(this, reader => computeChatWindowLayout({
		mode: this._layoutMode.read(reader),
		terminalPosition: ChatWindowTerminalPosition.FullWidth,
		terminalsVisible: false,
		activityBar: false,
		inputOnly: false,
	}));

	constructor(
		private readonly _parts: ReadonlyMap<ChatWindowLayoutCell, IChatWindowLayoutPart>,
		private readonly _layoutMode: IObservable<ChatWindowLayoutMode>,
		private readonly _gap: IObservable<number>,
	) {
		super();
		for (const part of _parts.values()) {
			part.element.style.position = 'absolute';
		}
		this._register(autorun(reader => {
			this._layout.read(reader);
			this._gap.read(reader);
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
		if (this._dimension) {
			this._place(layout.topology, { top: 0, left: 0, ...this._dimension });
		}
	}

	private _place(node: ChatWindowLayoutNode, box: IBox): void {
		if (!isBranch(node)) {
			const part = this._parts.get(node.cell);
			if (part && node.visible) {
				part.element.style.top = `${box.top}px`;
				part.element.style.left = `${box.left}px`;
				part.element.style.width = `${box.width}px`;
				part.element.style.height = `${box.height}px`;
				part.layout(box.width, box.height, box.top, box.left);
			}
			return;
		}
		const children = node.children.filter(child => this._isShown(child));
		const gap = this._gap.get();
		const row = node.orientation === 'row';
		const total = (row ? box.width : box.height) - gap * Math.max(0, children.length - 1);
		const size = children.length ? total / children.length : 0;
		children.forEach((child, index) => {
			const offset = index * (size + gap);
			this._place(child, row
				? { top: box.top, left: box.left + offset, width: size, height: box.height }
				: { top: box.top + offset, left: box.left, width: box.width, height: size });
		});
	}

	private _isShown(node: ChatWindowLayoutNode): boolean {
		return isBranch(node) ? node.children.some(child => this._isShown(child)) : node.visible && this._parts.has(node.cell);
	}
}
