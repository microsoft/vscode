/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asCSSUrl } from '../../../../base/browser/cssValue.js';
import { createStyleSheet } from '../../../../base/browser/domStylesheets.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { hash } from '../../../../base/common/hash.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';

interface ICanvasIconStyle {
	readonly className: string;
	readonly store: DisposableStore;
	references: number;
}

/** By icon data URI path, which holds the whole image, the style that shows it while anything does. */
const iconStyles = new Map<string, ICanvasIconStyle>();

/** CSS classes that show a canvas's icon, kept until they are disposed. */
export interface ICanvasIconClasses extends IDisposable {
	readonly classes: readonly string[];
}

/**
 * The CSS classes that show a canvas's icon in a place that takes icon classes, or its default codicon when it has none.
 * The icon is an image in its own colors at the base icon size, decorative beside the canvas's label; a surface that
 * shows compact icons sizes it down as it does its codicons. The image's style stays only while something that holds
 * its classes lives.
 */
export function acquireCanvasIconClasses(icon: URI | undefined): ICanvasIconClasses {
	if (!icon) {
		return { classes: ThemeIcon.asClassNameArray(Codicon.preview), dispose: () => { } };
	}
	const key = icon.path;
	let style = iconStyles.get(key);
	if (!style) {
		style = { className: getIconClassName(key), store: new DisposableStore(), references: 0 };
		const rule = `.${style.className} { display: inline-block; flex-shrink: 0; width: var(--vscode-codiconFontSize, 16px); height: var(--vscode-codiconFontSize, 16px); background: center / contain no-repeat ${asCSSUrl(icon)}; }`;
		createStyleSheet(undefined, element => element.textContent = rule, style.store);
		iconStyles.set(key, style);
	}
	style.references++;
	const acquired = style;
	let released = false;
	return {
		classes: [acquired.className],
		dispose: () => {
			if (released) {
				return;
			}
			released = true;
			if (--acquired.references === 0) {
				iconStyles.delete(key);
				acquired.store.dispose();
			}
		},
	};
}

/** A class name for the image, the same each time it is shown so that showing it again does not change its element. */
function getIconClassName(key: string): string {
	const base = `canvas-image-icon-${(hash(key) >>> 0).toString(36)}`;
	let className = base;
	for (let collision = 1; [...iconStyles.values()].some(style => style.className === className); collision++) {
		className = `${base}-${collision}`;
	}
	return className;
}

