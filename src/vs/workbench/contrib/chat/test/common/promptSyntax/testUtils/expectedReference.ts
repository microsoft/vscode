/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { TPromptReference } from '../../../../common/promptSyntax/parsers/types.js';

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

}

/**
 * An expected child reference to use in tests.
 */
export class ExpectedReference {
	constructor(private readonly options: IExpectedReferenceOptions) { }

	/**
	 * Validate that the provided reference is equal to this object.
	 */
	public validateEqual(other: TPromptReference) {
		const { uri, text, path = [] } = this.options;
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
	}

	/**
	 * Returns a string representation of the reference.
	 */
	public toString(): string {
		return `expected-reference/${this.options.text}`;
	}
}
