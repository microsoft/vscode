/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ResolveError } from '../../promptFileReferenceErrors.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IRange, Range } from '../../../../../../editor/common/core/range.js';

/**
 * A resolve error with a parent prompt URI, if any.
 */
export interface IResolveError {
	/**
	 * Original error instance.
	 */
	readonly originalError: ResolveError;

	/**
	 * URI of the parent that references this error.
	 */
	readonly parentUri?: URI;
}

/**
 * Top most error of the reference tree.
 */
export interface ITopError extends IResolveError {
	/**
	 * Where does the error belong to:
	 *
	 *  - `root` - the error is the top most error of the entire tree
	 *  - `child` - the error is a child of the root error
	 *  - `indirect-child` - the error is a child of a child of the root error
	 */
	readonly errorSubject: 'root' | 'child' | 'indirect-child';

	/**
	 * Total number of all errors in the references tree, including the error
	 * of the current reference and all possible errors of its children.
	 */
	readonly errorsCount: number;

	/**
	 * Localized error message.
	 */
	readonly localizedMessage: string;
}

/**
 * Base interface for a generic prompt reference.
 */
interface IPromptReferenceBase extends IDisposable {
	/**
	 * Type of the prompt reference. E.g., `file`, `http`, `image`, etc.
	 */
	readonly type: string;

	/**
	 * Subtype of the prompt reference. For instance a `file` reference
	 * can be a `markdown link` or a prompt `#file:` variable reference.
	 */
	readonly subtype: string;

	/**
	 * URI component of the associated with this reference.
	 */
	readonly uri: URI;

	/**
	 * The full range of the prompt reference in the source text,
	 * including the {@linkcode linkRange} and any additional
	 * parts the reference may contain (e.g., the `#file:` prefix).
	 */
	readonly range: Range;

	/**
	 * Range of the link part that the reference points to.
	 */
	readonly linkRange: IRange | undefined;

	/**
	 * Text of the reference as it appears in the source.
	 */
	readonly text: string;

	/**
	 * Original link path as it appears in the source.
	 */
	readonly path: string;

	/**
	 * Whether the current reference points to a prompt snippet file.
	 */
	readonly isPromptSnippet: boolean;

	/**
	 * Flag that indicates if resolving this reference failed.
	 * The `undefined` means that no attempt to resolve the reference
	 * was made so far or such an attempt is still in progress.
	 *
	 * See also {@linkcode errorCondition}.
	 */
	readonly resolveFailed: boolean | undefined;

	/**
	 * If failed to resolve the reference this property contains
	 * an error object that describes the failure reason.
	 *
	 * See also {@linkcode resolveFailed}.
	 */
	readonly errorCondition: ResolveError | undefined;

	/**
	 * Get list of errors for the direct links of the current reference.
	 */
	readonly errors: readonly ResolveError[];

	/**
	 * List of all errors that occurred while resolving the current
	 * reference including all possible errors of nested children.
	 */
	readonly allErrors: readonly IResolveError[];

	/**
	 * The top most error of the current reference or any of its
	 * possible child reference errors.
	 */
	readonly topError: ITopError | undefined;

	/**
	 * Direct references of the current reference.
	 */
	references: readonly IPromptReference[];

	/**
	 * All references that the current reference may have,
	 * including all possible nested child references.
	 */
	allReferences: readonly IPromptReference[];

	/**
	 * All *valid* references that the current reference may have,
	 * including all possible nested child references.
	 *
	 * A valid reference is one that points to an existing resource,
	 * without creating a circular reference loop or having any other
	 * issues that would make the reference resolve logic to fail.
	 */
	allValidReferences: readonly IPromptReference[];

	/**
	 * Returns a promise that resolves when the reference contents
	 * are completely parsed and all existing tokens are returned.
	 */
	settled(): Promise<this>;

	/**
	 * Returns a promise that resolves when the reference contents,
	 * and contents for all possible nested child references are
	 * completely parsed and entire tree of references is built.
	 *
	 * The same as {@linkcode settled} but for all prompts in
	 * the reference tree.
	 */
	allSettled(): Promise<this>;
}

/**
 * The special case of the {@linkcode IPromptReferenceBase} that pertains
 * to a file resource on the disk.
 */
export interface IPromptFileReference extends IPromptReferenceBase {
	readonly type: 'file';

	/**
	 * Subtype of a file reference, - either a prompt `#file` variable,
	 * or a `markdown link` (e.g., `[caption](/path/to/file.md)`).
	 */
	readonly subtype: 'prompt' | 'markdown';
}

/**
 * List of all known prompt reference types.
 */
export type IPromptReference = IPromptFileReference;
