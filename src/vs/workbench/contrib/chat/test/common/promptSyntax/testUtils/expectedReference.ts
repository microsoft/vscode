/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { ParseError } from '../../../../common/promptFileReferenceErrors.js';
import { IPromptFileReference } from '../../../../common/promptSyntax/parsers/types.js';
import { TErrorCondition } from '../../../../common/promptSyntax/parsers/basePromptParser.js';

/**
 * Options for the {@link ExpectedReference} class.
 */
interface IExpectedReferenceOptions {
	/**
	 * Final `URI` of the reference.
	 */
	readonly uri: URI;

	/**
	 * Full text of the reference as it appears in the source text.
	 */
	readonly text: string;

	/**
	 * The `path` part of the reference (e.g., the `/abs/path/to/file.md`
	 * part of the `[](/abs/path/to/file.md)` reference).
	 */
	readonly path: string;

	/**
	 * Start line of the reference in the source text. Because links cannot
	 * contain line breaks, the end line number is also equal to this value.
	 */
	readonly startLine: number;

	/**
	 * Start column of the full reference text as it appears in the source text.
	 */
	readonly startColumn: number;

	/**
	 * Start column number of the `path` part of the reference.
	 */
	readonly pathStartColumn: number;

	/**
	 * Either an `error` that was generated during attempt to resolve this reference,
	 * or a list of expected child references if the attempt was successful.
	 */
	readonly childrenOrError?: TErrorCondition | ExpectedReference[];
}

/**
 * An expected child reference to use in tests.
 */
export class ExpectedReference {
	constructor(private readonly options: IExpectedReferenceOptions) { }

	/**
	 * Validate that the provided reference is equal to this object.
	 */
	public validateEqual(other: IPromptFileReference) {
		const { uri, text, path, childrenOrError = [] } = this.options;
		const errorPrefix = `[${uri}] `;

		/**
		 * Validate the base properties of the reference first.
		 */

		assert.strictEqual(
			other.uri.toString(),
			uri.toString(),
			`${errorPrefix} Incorrect 'uri'.`,
		);

		assert.strictEqual(
			other.text,
			text,
			`${errorPrefix} Incorrect 'text'.`,
		);

		assert.strictEqual(
			other.path,
			path,
			`${errorPrefix} Incorrect 'path'.`,
		);

		const range = new Range(
			this.options.startLine,
			this.options.startColumn,
			this.options.startLine,
			this.options.startColumn + text.length,
		);

		assert(
			range.equalsRange(other.range),
			`${errorPrefix} Incorrect 'range': expected '${range}', got '${other.range}'.`,
		);

		if (path.length) {
			assertDefined(
				other.linkRange,
				`${errorPrefix} Link range must be defined.`,
			);

			const linkRange = new Range(
				this.options.startLine,
				this.options.pathStartColumn,
				this.options.startLine,
				this.options.pathStartColumn + path.length,
			);

			assert(
				linkRange.equalsRange(other.linkRange),
				`${errorPrefix} Incorrect 'linkRange': expected '${linkRange}', got '${other.linkRange}'.`,
			);
		} else {
			assert.strictEqual(
				other.linkRange,
				undefined,
				`${errorPrefix} Link range must be 'undefined'.`,
			);
		}

		/**
		 * Next validate children or error condition.
		 */

		if (childrenOrError instanceof ParseError) {
			const error = childrenOrError;
			const { errorCondition } = other;
			assertDefined(
				errorCondition,
				`${errorPrefix} Expected 'errorCondition' to be defined.`,
			);

			assert(
				errorCondition instanceof ParseError,
				`${errorPrefix} Expected 'errorCondition' to be a 'ParseError'.`,
			);

			assert(
				error.sameTypeAs(errorCondition),
				`${errorPrefix} Incorrect 'errorCondition' type.`,
			);

			return;
		}

		const children = childrenOrError;
		const { references } = other;

		for (let i = 0; i < children.length; i++) {
			children[i].validateEqual(references[i]);
		}

		if (references.length > children.length) {
			const extraReference = references[children.length];

			// sanity check
			assertDefined(
				extraReference,
				`${errorPrefix} Extra reference must be defined.`,
			);

			throw new Error(`${errorPrefix} Expected no more references, got '${extraReference.text}'.`);
		}

		if (children.length > references.length) {
			const expectedReference = children[references.length];

			// sanity check
			assertDefined(
				expectedReference,
				`${errorPrefix} Expected reference must be defined.`,
			);

			throw new Error(`${errorPrefix} Expected another reference '${expectedReference.options.text}', got 'undefined'.`);
		}
	}
}
