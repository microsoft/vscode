/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../base/common/errors.js';
import { toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';

export const quadVertices = new Float32Array([
	1, 0,
	1, 1,
	0, 1,
	0, 0,
	0, 1,
	1, 0,
]);

export function ensureNonNullable<T>(value: T | null): T {
	if (!value) {
		throw new Error(`Value "${value}" cannot be null`);
	}
	return value;
}

// TODO: Move capabilities into ElementSizeObserver?
export function observeDevicePixelDimensions(element: HTMLElement, parentWindow: Window & typeof globalThis, callback: (deviceWidth: number, deviceHeight: number) => void): IDisposable {
	// Observe any resizes to the element and extract the actual pixel size of the element if the
	// devicePixelContentBoxSize API is supported. This allows correcting rounding errors when
	// converting between CSS pixels and device pixels which causes blurry rendering when device
	// pixel ratio is not a round number.
	let observer: ResizeObserver | undefined = new parentWindow.ResizeObserver((entries) => {
		const entry = entries.find((entry) => entry.target === element);
		if (!entry) {
			return;
		}

		// Disconnect if devicePixelContentBoxSize isn't supported by the browser
		if (!('devicePixelContentBoxSize' in entry)) {
			observer?.disconnect();
			observer = undefined;
			return;
		}

		// Fire the callback, ignore events where the dimensions are 0x0 as the canvas is likely hidden
		const width = entry.devicePixelContentBoxSize[0].inlineSize;
		const height = entry.devicePixelContentBoxSize[0].blockSize;
		if (width > 0 && height > 0) {
			callback(width, height);
		}
	});
	try {
		observer.observe(element, { box: ['device-pixel-content-box'] } as any);
	} catch {
		observer.disconnect();
		observer = undefined;
		throw new BugIndicatingError('Could not observe device pixel dimensions');
	}
	return toDisposable(() => observer?.disconnect());
}
