/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function hrtime(previous?: [number, number]): [number, number] {
	const now = self.performance.now() * 0.001;
	let seconds = Math.floor(now);
	let nanoseconds = Math.floor((now % 1) * 1000000000);
	// NOTE: This check is added probably because it's missed without strictFunctionTypes on
	if (previous?.[0] !== undefined && previous?.[1] !== undefined) {
		seconds = seconds - previous[0];
		nanoseconds = nanoseconds - previous[1];
		if (nanoseconds < 0) {
			seconds--;
			nanoseconds += 1000000000;
		}
	}
	return [seconds, nanoseconds];
}
