/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptMetadataRecord } from './record.js';
import { localize } from '../../../../../../../../nls.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { PromptMetadataDiagnostic, PromptMetadataError } from '../diagnostics.js';
import { FrontMatterRecord, FrontMatterString, FrontMatterToken } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'description';

/**
 * Prompt `description` metadata record inside the prompt header.
 */
export class PromptDescriptionMetadata extends PromptMetadataRecord {
	public override get recordName(): string {
		return RECORD_NAME;
	}

	/**
	 * Private field for tracking all diagnostic issues
	 * related to this metadata record.
	 */
	private readonly issues: PromptMetadataDiagnostic[];

	/**
	 * List of all diagnostic issues related to this metadata record.
	 */
	public get diagnostics(): readonly PromptMetadataDiagnostic[] {
		return this.issues;
	}

	/**
	 * Value token reference of the record.
	 */
	private valueToken: FrontMatterString | undefined;

	/**
	 * Clean text value of the record.
	 */
	public get text(): string | null {
		const { valueToken } = this;

		if (valueToken === undefined) {
			return null;
		}

		return valueToken.cleanText;
	}

	constructor(
		private readonly recordToken: FrontMatterRecord,
	) {
		// sanity check on the name of the record
		assert(
			PromptDescriptionMetadata.isDescriptionRecord(recordToken),
			`Record token must be 'description', got '${recordToken.nameToken.text}'.`,
		);

		super(recordToken.range);

		this.issues = [];
		this.collectDiagnostics();
	}

	/**
	 * Validate the metadata record and collect all issues
	 * related to its content.
	 */
	private collectDiagnostics(): void {
		const { valueToken } = this.recordToken;

		// validate that the record value is a string
		if ((valueToken instanceof FrontMatterString) === false) {
			this.issues.push(
				new PromptMetadataError(
					valueToken.range,
					localize(
						'prompt.header.metadata.description.diagnostics.invalid-value-type',
						"Value of the '{0}' metadata must be '{1}', got '{2}'.",
						RECORD_NAME,
						'string',
						valueToken.valueTypeName,
					),
				),
			);

			return;
		}

		this.valueToken = valueToken;
	}

	/**
	 * Check if a provided front matter token is a metadata record
	 * with name equal to `description`.
	 */
	public static isDescriptionRecord(
		token: FrontMatterToken,
	): boolean {
		if ((token instanceof FrontMatterRecord) === false) {
			return false;
		}

		if (token.nameToken.text === RECORD_NAME) {
			return true;
		}

		return false;
	}
}
