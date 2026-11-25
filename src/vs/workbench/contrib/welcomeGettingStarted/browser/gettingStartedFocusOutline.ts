/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ISizeService } from '../../../../platform/theme/common/sizeService.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { getPartOverlayCornerRadius } from '../../../browser/part.js';

/** Refreshes the Welcome focus outline when size tokens or themes change the editor card's corners without a layout. */
export class GettingStartedFocusOutline extends Disposable {
	private readonly pendingUpdate = this._register(new MutableDisposable());

	constructor(
		private readonly container: HTMLElement,
		sizeService: Pick<ISizeService, 'onDidChangeSizes'>,
		themeService: Pick<IThemeService, 'onDidColorThemeChange'>,
	) {
		super();
		const update = () => {
			this.update();
			// Auxiliary windows receive cloned theme styles in a later mutation-observer callback.
			this.pendingUpdate.value = scheduleAtNextAnimationFrame(getWindow(this.container), () => this.update());
		};
		this._register(sizeService.onDidChangeSizes(update));
		this._register(themeService.onDidColorThemeChange(update));
	}

	update(): void {
		updateGettingStartedFocusOutlineRadius(this.container);
	}
}

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
