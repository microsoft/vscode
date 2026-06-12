/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Platform from '../common/platform.js';

/** The libc family the current process is linked against. */
export type LibcFamily = 'glibc' | 'musl';

let _cached: LibcFamily | undefined;
let _cacheValid = false;

/**
 * Returns the libc family of the running Node process on Linux, or
 * `undefined` on non-Linux platforms (where the question is meaningless).
 *
 * Mechanism: Node's process report exposes `glibcVersionRuntime` in the
 * header on glibc-linked builds and omits it on musl-linked builds. The
 * field's presence is itself the signal — no `ldd` subprocess, no
 * `/etc/os-release` parsing, no filesystem probe.
 *
 * Cached after first call. `process.report.getReport()` is expensive
 * (serializes heap + native stack + libuv state) so the cache pays for
 * itself; libc never changes mid-process.
 */
export function detectLibc(): LibcFamily | undefined {
	if (_cacheValid) {
		return _cached;
	}
	if (Platform.isLinux) {
		const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
		_cached = report?.header?.glibcVersionRuntime ? 'glibc' : 'musl';
	} else {
		_cached = undefined;
	}
	_cacheValid = true;
	return _cached;
}
