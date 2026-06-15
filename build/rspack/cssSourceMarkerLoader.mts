/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';

/**
 * Prepends a marker comment with the CSS module's repo-relative source path.
 *
 * Native CSS (`experiments.css`) concatenates every imported `.css` module into
 * a single stylesheet, but it preserves comments. This marker therefore lets
 * tooling that reads the bundled stylesheet (e.g. the cascade-order-dependency
 * detector and its bisection) map each concatenated "document" back to the
 * exact source file by name, instead of relying on the generic copyright
 * banner which carries no filename.
 *
 * `this.rootContext` is the rspack `context` option (the repo root), so no
 * `__dirname` handling is needed.
 */
export default function cssSourceMarkerLoader(this: { resourcePath: string; rootContext: string }, source: string): string {
	const rel = path.relative(this.rootContext, this.resourcePath).replace(/\\/g, '/');
	return `/* @css-source: ${rel} */\n${source}`;
}
