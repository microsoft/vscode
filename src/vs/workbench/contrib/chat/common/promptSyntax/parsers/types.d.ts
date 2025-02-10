/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ParseError } from '../../promptFileReferenceErrors.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IRange, Range } from '../../../../../../editor/common/core/range.js';

/**
 * Interface for a resolve error.
 */
export interface IResolveError {
	/**
	 * Localized error message.
	 */
	message: string;

	/**
	 * Whether this error is for the root reference
	 * object, or for one of its possible children.
	 */
	isRootError: boolean;
}

/**
 * List of all available prompt reference types.
 */
type PromptReferenceTypes = 'file';

/**
 * Interface for a generic prompt reference.
 */
export interface IPromptReference extends IDisposable {
	/**
	 * Type of the prompt reference.
	 */
	readonly type: PromptReferenceTypes;

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
	readonly errorCondition: ParseError | undefined;

	/**
	 * List of all errors that occurred while resolving the current
	 * reference including all possible errors of nested children.
	 */
	readonly allErrors: readonly ParseError[];

	/**
	 * The top most error of the current reference or any of its
	 * possible child reference errors.
	 */
	readonly topError: IResolveError | undefined;

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
 * The special case of the {@linkcode IPromptReference} that pertains
 * to a file resource on the disk.
 */
export interface IPromptFileReference extends IPromptReference {
	readonly type: 'file';
}
