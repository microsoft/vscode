/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptStringMetadata } from './string.js';
import { localize } from '../../../../../../../../../nls.js';
import { assert } from '../../../../../../../../../base/common/assert.js';
import { isOneOf } from '../../../../../../../../../base/common/types.js';
import { PromptMetadataDiagnostic, PromptMetadataError } from '../../diagnostics.js';
import { FrontMatterSequence } from '../../../../codecs/base/frontMatterCodec/tokens/frontMatterSequence.js';
import { FrontMatterRecord, FrontMatterString } from '../../../../codecs/base/frontMatterCodec/tokens/index.js';

/**
 * Enum type is the special case of the {@link PromptStringMetadata string}
 * type that can take only a well-defined set of {@link validValues}.
 */
export abstract class PromptEnumMetadata<
	TValidValues extends string = string,
> extends PromptStringMetadata {
	constructor(
		private readonly validValues: readonly TValidValues[],
		expectedRecordName: string,
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(expectedRecordName, recordToken, languageId);
	}

	/**
	 * Valid enum value or 'undefined'.
	 */
	private enumValue: TValidValues | undefined;
	/**
	 * Valid enum value or 'undefined'.
	 */
	public override get value(): TValidValues | undefined {
		return this.enumValue;
	}

	/**
	 * Validate the metadata record has an allowed value.
	 */
	public override validate(): readonly PromptMetadataDiagnostic[] {
		super.validate();

		if (this.valueToken === undefined) {
			return this.issues;
		}

		// sanity check for our expectations about the validate call
		assert(
			this.valueToken instanceof FrontMatterString
			|| this.valueToken instanceof FrontMatterSequence,
			`Record token must be 'string', got '${this.valueToken}'.`,
		);

		const { cleanText } = this.valueToken;
		if (isOneOf(cleanText, this.validValues)) {
			this.enumValue = cleanText;

			return this.issues;
		}

		this.issues.push(
			new PromptMetadataError(
				this.valueToken.range,
				localize(
					'prompt.header.metadata.enum.diagnostics.invalid-value',
					"The property '{0}' must be one of {1}, got '{2}'.",
					this.recordName,
					this.validValues
						.map((value) => {
							return `'${value}'`;
						}).join(' | '),
					cleanText,
				),
			),
		);

		delete this.valueToken;
		return this.issues;
	}
}
