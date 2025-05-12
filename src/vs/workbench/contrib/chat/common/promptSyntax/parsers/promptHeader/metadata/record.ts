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
	private readonly issues: PromptMetadataDiagnostic[];

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
		this.issues.push(...this.validate());
	}

	/**
	 * Validate the metadata record and collect all issues
	 * related to its content.
	 */
	protected abstract validate(): readonly PromptMetadataDiagnostic[];

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
		expectedRecordName: string,
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
	protected override validate(): readonly PromptMetadataDiagnostic[] {
		const { valueToken } = this.recordToken;

		const result: PromptMetadataDiagnostic[] = [];

		// validate that the record value is a string
		if ((valueToken instanceof FrontMatterString) === false) {
			result.push(
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

			return result;
		}

		this.valueToken = valueToken;
		return result;
	}
}
