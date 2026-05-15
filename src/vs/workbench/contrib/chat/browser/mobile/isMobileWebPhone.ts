/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { isWeb } from '../../../../../base/common/platform.js';

let cached: boolean | undefined;

/**
 * Heuristic for "mobile web phone": the workbench is running in a web browser
 * on a device that has a coarse pointer (touch) and no hover capability.
 *
 * - `isWeb` excludes the Electron desktop builds.
 * - `(pointer: coarse)` requires a primary pointing device that is not precise
 *   (i.e. a finger). Mice and trackpads do not match.
 * - `(hover: none)` excludes touch laptops and tablets with a Magic Keyboard /
 *   pen / mouse attached — they report `hover: hover` because they have a
 *   secondary precise pointer.
 *
 * Cached on first call. The detection should not flip during a session because
 * input device capabilities don't change at runtime in any meaningful way for
 * our purposes.
 */
export function isMobileWebPhone(): boolean {
	if (cached !== undefined) {
		return cached;
	}
	if (!isWeb) {
		cached = false;
		return cached;
	}
	const mm = mainWindow.matchMedia?.('(pointer: coarse) and (hover: none)');
	cached = !!mm?.matches;
	return cached;
}

/** Exposed for tests so a clean state can be obtained between cases. */
export function resetIsMobileWebPhoneCacheForTests(): void {
	cached = undefined;
}
