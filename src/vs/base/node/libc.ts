/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { familySync, MUSL } from 'detect-libc';
import * as Platform from '../common/platform.js';

/** The libc family the current process is linked against. */
export type LibcFamily = 'glibc' | 'musl';

let _cached: LibcFamily | undefined;
let _cacheValid = false;

/**
 * Returns the libc family of the running Node process on Linux, or `undefined`
 * on non-Linux platforms (where the question is meaningless).
 *
 * Delegates to the `detect-libc` package, which probes cheap signals first (the
 * ELF interpreter of `/proc/self/exe`, then `/usr/bin/ldd`) and only falls back
 * to Node's process report — with the libuv/socket section excluded so it does
 * not peg the CPU on busy hosts. When detection is inconclusive we assume
 * `glibc`, the dominant Linux libc.
 *
 * Cached after first call; libc never changes mid-process. This is the
 * synchronous variant; add a promise-based `detectLibc` wrapping
 * `detect-libc`'s async `family()` if a non-blocking caller ever needs one.
 */
export function detectLibcSync(): LibcFamily | undefined {
	if (_cacheValid) {
		return _cached;
	}
	if (Platform.isLinux) {
		_cached = familySync() === MUSL ? 'musl' : 'glibc';
	} else {
		_cached = undefined;
	}
	_cacheValid = true;
	return _cached;
}
