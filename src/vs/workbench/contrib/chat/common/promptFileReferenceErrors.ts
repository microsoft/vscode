/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * Base prompt parsing error class.
 */
export abstract class ParseError extends Error {
	/**
	 * Error type name.
	 */
	public readonly abstract errorType: string;

	constructor(
		message?: string,
		options?: ErrorOptions,
	) {
		super(message, options);
	}

	/**
	 * Check if provided object is of the same type as this error.
	 */
	public sameTypeAs(other: unknown): other is typeof this {
		if (other === null || other === undefined) {
			return false;
		}

		return other instanceof this.constructor;
	}

	/**
	 * Check if provided object is equal to this error.
	 */
	public equal(other: unknown): boolean {
		return this.sameTypeAs(other);
	}
}

/**
 * A generic error for failing to resolve prompt contents stream.
 */
export class FailedToResolveContentsStream extends ParseError {
	public override errorType = 'FailedToResolveContentsStream';

	constructor(
		public readonly uri: URI,
		public readonly originalError: unknown,
		message: string = `Failed to resolve prompt contents stream for '${uri.toString()}': ${originalError}.`,
	) {
		super(message);
	}
}


/**
 * Base resolve error class used when file reference resolution fails.
 */
export abstract class ResolveError extends ParseError {
	public abstract override errorType: string;

	constructor(
		public readonly uri: URI,
		message?: string,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

/**
 * Error that reflects the case when attempt to open target file fails.
 */
export class OpenFailed extends FailedToResolveContentsStream {
	public override errorType = 'OpenError';

	constructor(
		uri: URI,
		originalError: unknown,
	) {
		super(
			uri,
			originalError,
			`Failed to open '${uri.fsPath}': ${originalError}.`,
		);
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
	public override errorType = 'RecursiveReferenceError';

	constructor(
		uri: URI,
		public readonly recursivePath: string[],
	) {
		const references = recursivePath.join(' -> ');

		super(
			uri,
			`Recursive references found: ${references}.`,
		);
	}

	/**
	 * Returns a string representation of the recursive path.
	 */
	public get recursivePathString(): string {
		return this.recursivePath.join(' -> ');
	}

	/**
	 * Check if provided object is of the same type as this
	 * error, contains the same recursive path and URI.
	 */
	public override equal(other: unknown): other is this {
		if (!this.sameTypeAs(other)) {
			return false;
		}

		if (this.uri.toString() !== other.uri.toString()) {
			return false;
		}

		return this.recursivePathString === other.recursivePathString;
	}

	/**
	 * Returns a string representation of the error object.
	 */
	public override toString(): string {
		return `"${this.message}"(${this.uri})`;
	}
}

/**
 * Error for the case when a resource URI doesn't point to a prompt file.
 */
export class NotPromptFile extends ResolveError {
	public override errorType = 'NotPromptFileError';

	constructor(
		uri: URI,
		message: string = '',
	) {

		const suffix = message ? `: ${message}` : '';

		super(
			uri,
			`Resource at ${uri.path} is not a prompt file${suffix}`,
		);
	}
}

/**
 * Error for the case when a resource URI points to a folder.
 */
export class FolderReference extends NotPromptFile {
	public override errorType = 'FolderReferenceError';

	constructor(
		uri: URI,
		message: string = '',
	) {

		const suffix = message ? `: ${message}` : '';

		super(
			uri,
			`Entity at '${uri.path}' is a folder${suffix}`,
		);
	}
}
