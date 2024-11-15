/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * Base resolve error class used when file reference resolution fails.
 */
abstract class ResolveError extends Error { }

/**
 * Error that reflects the case when attempt to open target file fails.
 */
export class FileOpenFailed extends ResolveError {
	constructor(
		public readonly uri: URI,
		public readonly originalError: unknown,
	) {
		super(`Failed to open file '${uri.toString()}'.`);
	}
}

/**
 * Error that reflects the case when attempt resolve nested file
 * references failes due to a recursive reference, e.g.,
 *
 * ```markdown
 * // a.md
 * #file:b.md
 * ```
 *
 * ```markdown
 * // b.md
 * #file:a.md
 * ```
 */
export class RecursiveReference extends ResolveError {
	constructor(
		public readonly uri: URI,
		public readonly originalError: unknown,
	) {
		// TODO: @legomushroom - add more details re the recursion
		super(`File '${uri.toString()}' contains recursive references.`);
	}
}
