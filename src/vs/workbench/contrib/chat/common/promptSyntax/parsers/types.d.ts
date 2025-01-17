/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ParseError } from '../../promptFileReferenceErrors.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';

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
	 * Flag that indicates if resolving this reference failed.
	 * The `undefined` means that no attempt to resolve the reference
	 * was made so far or such an attempt is still in progress.
	 *
	 * See also {@linkcode errorCondition}.
	 */
	readonly resolveFailed: boolean | undefined;

	/**
	 * If failed to resolve the reference this property contains an error
	 * object that describes the failure reason.
	 *
	 * See also {@linkcode resolveFailed}.
	 */
	readonly errorCondition: ParseError | undefined;

	/**
	 * All references that the current reference may have,
	 * including the all possible nested child references.
	 */
	allReferences: readonly IPromptFileReference[];

	/**
	 * All *valid* references that the current reference may have,
	 * including the all possible nested child references.
	 *
	 * A valid reference is the one that points to an existing resource,
	 * without creating a circular reference loop or having any other
	 * issues that would make the reference resolve logic to fail.
	 */
	allValidReferences: readonly IPromptFileReference[];
}

/**
 * The special case of the {@linkcode IPromptReference} that pertains
 * to a file resource on the disk.
 */
export interface IPromptFileReference extends IPromptReference {
	readonly type: 'file';
}
