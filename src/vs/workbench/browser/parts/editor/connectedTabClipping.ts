/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IConnectedTabBounds {
	readonly tab: HTMLElement;
	readonly overflowEdge: HTMLElement;
	readonly fillLeft: number;
	readonly fillRight: number;
	readonly viewportLeft: number;
	readonly viewportRight: number;
	readonly shoulderExtent: number;
}

export function clearConnectedTabClipping(tab: HTMLElement | undefined, overflowEdge: HTMLElement | undefined): void {
	tab?.classList.remove('connected-tab-left-edge', 'connected-tab-right-edge', 'connected-tab-left-clipped', 'connected-tab-right-clipped', 'connected-tab-hidden');
	if (overflowEdge) {
		overflowEdge.style.removeProperty('top');
		overflowEdge.style.removeProperty('right');
		overflowEdge.style.removeProperty('bottom');
		overflowEdge.style.removeProperty('left');
		overflowEdge.classList.remove('connected-tab-left-clipped', 'connected-tab-right-clipped', 'connected-tab-hovered');
	}
}

export function updateConnectedTabClipping(bounds: IConnectedTabBounds, scrollLeft: number): void {
	const { tab, overflowEdge, fillLeft, fillRight, viewportLeft, viewportRight, shoulderExtent } = bounds;
	const visibleLeft = scrollLeft + viewportLeft;
	const visibleRight = scrollLeft + viewportRight;
	const visibleFillLeft = Math.max(fillLeft, visibleLeft);
	const visibleFillRight = Math.min(fillRight, visibleRight);
	const leftClipped = fillLeft < visibleLeft;
	const rightClipped = fillRight > visibleRight;
	const leftEdge = fillLeft - shoulderExtent < visibleLeft;
	const rightEdge = fillRight + shoulderExtent > visibleRight;
	const hidden = visibleFillLeft + shoulderExtent >= visibleFillRight;
	tab.classList.toggle('connected-tab-left-edge', leftEdge);
	tab.classList.toggle('connected-tab-right-edge', rightEdge);
	tab.classList.toggle('connected-tab-left-clipped', leftClipped);
	tab.classList.toggle('connected-tab-right-clipped', rightClipped);
	tab.classList.toggle('connected-tab-hidden', hidden);
	overflowEdge.classList.toggle('connected-tab-left-clipped', leftClipped && !hidden);
	overflowEdge.classList.toggle('connected-tab-right-clipped', rightEdge && !hidden);
}
