/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { basename } from '../../../../base/common/path.js';
import { assert, assertNever } from '../../../../base/common/assert.js';

/**
 * Base prompt parsing error class.
 */
abstract class ParseError extends Error {
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
 * A generic error for failing to resolve prompt contents stream.
 */
export class FailedToResolveContentsStream extends ResolveError {
	public override errorType = 'FailedToResolveContentsStream';

	constructor(
		uri: URI,
		public readonly originalError: unknown,
		message: string = `Failed to resolve prompt contents stream for '${uri.toString()}': ${originalError}.`,
	) {
		super(uri, message);
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
 * Character use to join filenames/paths in a chain of references that
 * lead to recursion.
 */
const DEFAULT_RECURSIVE_PATH_JOIN_CHAR = ' -> ';

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

	/**
	 * Cached default string representation of the recursive path.
	 */
	private defaultPathStringCache: string | undefined;

	constructor(
		uri: URI,
		public readonly recursivePath: string[],
	) {
		// sanity check - a recursive path must always have at least
		// two items in the list, otherwise it is not a recursive loop
		assert(
			recursivePath.length >= 2,
			`Recursive path must contain at least two paths, got '${recursivePath.length}'.`,
		);

		super(
			uri, 'Recursive references found.',
		);
	}

	public override get message(): string {
		return `${super.message} ${this.getRecursivePathString('fullpath')}`;
	}

	/**
	 * Returns a string representation of the recursive path.
	 */
	public getRecursivePathString(
		filename: 'basename' | 'fullpath',
		pathJoinCharacter: string = DEFAULT_RECURSIVE_PATH_JOIN_CHAR,
	): string {
		const isDefault = (filename === 'fullpath') &&
			(pathJoinCharacter === DEFAULT_RECURSIVE_PATH_JOIN_CHAR);

		if (isDefault && (this.defaultPathStringCache !== undefined)) {
			return this.defaultPathStringCache;
		}

		const result = this.recursivePath
			.map((path) => {
				if (filename === 'fullpath') {
					return `'${path}'`;
				}

				if (filename === 'basename') {
					return `'${basename(path)}'`;
				}

				assertNever(
					filename,
					`Unknown filename format '${filename}'.`,
				);
			})
			.join(pathJoinCharacter);

		if (isDefault) {
			this.defaultPathStringCache = result;
		}

		return result;
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

		// performance optimization - compare number of paths in the
		// recursive path chains first to avoid comparison of all strings
		if (this.recursivePath.length !== other.recursivePath.length) {
			return false;
		}

		const myRecursivePath = this.getRecursivePathString('fullpath');
		const theirRecursivePath = other.getRecursivePathString('fullpath');

		// performance optimization - if the path lengths don't match,
		// no need to compare entire strings as they must be different
		if (myRecursivePath.length !== theirRecursivePath.length) {
			return false;
		}

		return myRecursivePath === theirRecursivePath;
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
