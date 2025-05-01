/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { PromptMetadataDiagnostic, PromptMetadataError, PromptMetadataWarning } from '../diagnostics.js';
import { FrontMatterRecord, FrontMatterString } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Abstract class for all metadata records in the prompt header.
 */
export abstract class PromptMetadataRecord {

	/**
	 * Private field for tracking all diagnostic issues
	 * related to this metadata record.
	 */
	protected readonly issues: PromptMetadataDiagnostic[];

	/**
	 * Full range of the metadata's record text in the prompt header.
	 */
	public get range(): Range {
		return this.recordToken.range;
	}

	constructor(
		protected readonly recordToken: FrontMatterRecord,
		protected readonly languageId: string,
	) {

		this.issues = [];
	}

	/**
	 * Validate the metadata record and collect all issues
	 * related to its content.
	 */
	public abstract validate(): readonly PromptMetadataDiagnostic[];

	/**
	 * Name of the metadata record.
	 */
	public abstract get recordName(): string;

	/**
	 * List of all diagnostic issues related to this metadata record.
	 */
	public get diagnostics(): readonly PromptMetadataDiagnostic[] {
		return this.issues;
	}

	/**
	 * List of all `error` issue diagnostics.
	 */
	public get errorDiagnostics(): readonly PromptMetadataError[] {
		return this.diagnostics
			.filter((diagnostic) => {
				return (diagnostic instanceof PromptMetadataError);
			});
	}

	/**
	 * List of all `warning` issue diagnostics.
	 */
	public get warningDiagnostics(): readonly PromptMetadataWarning[] {
		return this.diagnostics
			.filter((diagnostic) => {
				return (diagnostic instanceof PromptMetadataWarning);
			});
	}
}

/**
 * Base class for all metadata records with a `string` value.
 */
// TODO: @legomushroom - move out
export abstract class PromptStringMetadata extends PromptMetadataRecord {
	/**
	 * Value token reference of the record.
	 */
	protected valueToken: FrontMatterString | undefined;

	/**
	 * Clean text value of the record.
	 */
	public get text(): string | undefined {
		return this.valueToken?.cleanText;
	}

	constructor(
		protected readonly expectedRecordName: string,
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		// sanity check on the name of the record
		const recordName = recordToken.nameToken.text;
		assert(
			recordName === expectedRecordName,
			`Record token must be '${expectedRecordName}', got '${recordName}'.`,
		);

		super(recordToken, languageId);
	}

	/**
	 * Validate the metadata record has a 'string' value.
	 */
	public override validate(): readonly PromptMetadataDiagnostic[] {
		const { valueToken } = this.recordToken;

		// validate that the record value is a string
		if ((valueToken instanceof FrontMatterString) === false) {
			this.issues.push(
				new PromptMetadataError(
					valueToken.range,
					localize(
						'prompt.header.metadata.string.diagnostics.invalid-value-type',
						"Value of the '{0}' metadata must be '{1}', got '{2}'.",
						this.recordName,
						'string',
						valueToken.valueTypeName,
					),
				),
			);

			delete this.valueToken;
			return this.issues;
		}

		this.valueToken = valueToken;
		return this.issues;
	}
}

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - move out
export abstract class PromptEnumMetadata<
	TValidValues extends string = string,
> extends PromptStringMetadata {
	constructor(
		// TODO: @legomushroom
		private readonly validValues: readonly TValidValues[],
		expectedRecordName: string,
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(expectedRecordName, recordToken, languageId);
	}

	/**
	 * TODO: @legomushroom
	 */
	private value: TValidValues | undefined;

	/**
	 * TODO: @legomushroom
	 */
	public get enumValue(): TValidValues | undefined {
		return this.value;
	}

	// TODO: @legomushroom - can be removed?
	public override get recordName(): string {
		return this.expectedRecordName;
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
			this.valueToken instanceof FrontMatterString,
			`Record token must be 'string', got '${this.valueToken}'.`,
		);

		const { cleanText } = this.valueToken;
		if (isOneOf(cleanText, this.validValues)) {
			this.value = cleanText;

			return this.issues;
		}

		this.issues.push(
			new PromptMetadataError(
				this.valueToken.range,
				localize(
					'prompt.header.metadata.enum.diagnostics.invalid-value',
					"Value of the '{0}' metadata must be one of {1}, got '{2}'.",
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

/**
 * TODO: @legomushroom
 */
// TODO: @legomushroom - move closer to assert?
const isOneOf = <T, K extends T>(
	value: T,
	validValues: readonly K[],
): value is K => {
	// TODO: @legomushroom - type casting
	return validValues.includes(<K>value);
};
