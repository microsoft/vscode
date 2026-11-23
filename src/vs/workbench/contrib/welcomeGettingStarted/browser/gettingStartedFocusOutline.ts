/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getPartOverlayCornerRadius } from '../../../browser/part.js';

/** Keeps the Welcome focus outline aligned with the editor card's exposed corners. */
export function updateGettingStartedFocusOutlineRadius(container: HTMLElement): void {
	const editorPart = container.closest('.part.editor');
	const content = container.closest<HTMLElement>('.content');
	if (!editorPart || !content) {
		container.classList.remove('focus-outline-rounded');
		container.style.removeProperty('--getting-started-focus-outline-radius');
		return;
	}

	const radius = getPartOverlayCornerRadius(content, editorPart);
	if (radius === undefined) {
		container.classList.remove('focus-outline-rounded');
		container.style.removeProperty('--getting-started-focus-outline-radius');
		return;
	}

	const [topLeft, topRight, bottomRight, bottomLeft] = radius.split(' ').map(value => Number.parseFloat(value));
	const containerBounds = container.getBoundingClientRect();
	const contentBounds = content.getBoundingClientRect();
	const corner = (radius: number, horizontalInset: number, verticalInset: number) => {
		if (!Number.isFinite(radius) || radius <= 0 || horizontalInset < 0 || verticalInset < 0 || horizontalInset >= radius || verticalInset >= radius) {
			return { horizontal: 0, vertical: 0 };
		}

		return { horizontal: radius - horizontalInset, vertical: radius - verticalInset };
	};
	const corners = [
		corner(topLeft, containerBounds.left - contentBounds.left, containerBounds.top - contentBounds.top),
		corner(topRight, contentBounds.right - containerBounds.right, containerBounds.top - contentBounds.top),
		corner(bottomRight, contentBounds.right - containerBounds.right, contentBounds.bottom - containerBounds.bottom),
		corner(bottomLeft, containerBounds.left - contentBounds.left, contentBounds.bottom - containerBounds.bottom),
	];
	const horizontal = corners.map(({ horizontal }) => `${horizontal}px`).join(' ');
	const vertical = corners.map(({ vertical }) => `${vertical}px`).join(' ');
	container.style.setProperty('--getting-started-focus-outline-radius', `${horizontal} / ${vertical}`);
	container.classList.add('focus-outline-rounded');
}
