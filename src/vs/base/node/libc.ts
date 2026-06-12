/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Platform from '../common/platform.js';

/**
 * The libc family the current process is linked against. Only Linux
 * has a meaningful distinction; everywhere else the answer is
 * `'glibc'` by convention (these helpers are only consulted to pick a
 * Linux SKU suffix, where `'glibc'` means "no `-musl` suffix").
 */
export type LibcFamily = 'glibc' | 'musl';

let _cached: LibcFamily | undefined;

/**
 * Returns the libc family of the running Node process.
 *
 * Mechanism: Node's process report exposes `glibcVersionRuntime` in the
 * header on glibc-linked builds and omits it on musl-linked builds. So
 * the field's presence is itself the signal — no `ldd` subprocess, no
 * `/etc/os-release` parsing, no filesystem probe.
 *
 * Returns `'glibc'` on non-Linux platforms (the answer is unused there
 * but the type stays simple — callers always get a defined value and
 * can use it in a single equality check).
 *
 * Cached after first call. Node's libc never changes mid-process.
 */
export function detectLibc(): LibcFamily {
	if (_cached !== undefined) {
		return _cached;
	}
	if (!Platform.isLinux) {
		_cached = 'glibc';
		return _cached;
	}
	const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
	_cached = report?.header?.glibcVersionRuntime ? 'glibc' : 'musl';
	return _cached;
}
