/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptMetadataRecord } from './record.js';
import { localize } from '../../../../../../../../../nls.js';
import { PromptMetadataDiagnostic, PromptMetadataError } from '../../diagnostics.js';
import { FrontMatterSequence } from '../../../../codecs/base/frontMatterCodec/tokens/frontMatterSequence.js';
import { FrontMatterRecord, FrontMatterString } from '../../../../codecs/base/frontMatterCodec/tokens/index.js';
import { Range } from '../../../../../../../../../editor/common/core/range.js';


/**
 * Base class for all metadata records with a `string` value.
 */
export abstract class PromptStringMetadata extends PromptMetadataRecord<string> {
	/**
	 * Value token reference of the record.
	 */
	protected valueToken: FrontMatterString | FrontMatterSequence | undefined;

	/**
	 * String value of a metadata record.
	 */
	public override get value(): string | undefined {
		return this.valueToken?.cleanText;
	}

	public get valueRange(): Range | undefined {
		return this.valueToken?.range;
	}

	constructor(
		expectedRecordName: string,
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(expectedRecordName, recordToken, languageId);
	}

	/**
	 * Validate the metadata record has a 'string' value.
	 */
	public override validate(): readonly PromptMetadataDiagnostic[] {
		const { valueToken } = this.recordToken;

		// validate that the record value is a string or a generic sequence
		// of tokens that can be interpreted as a string without quotes
		const isString = (valueToken instanceof FrontMatterString);
		const isSequence = (valueToken instanceof FrontMatterSequence);
		if (isString || isSequence) {
			this.valueToken = valueToken;
			return this.issues;
		}

		this.issues.push(
			new PromptMetadataError(
				valueToken.range,
				localize(
					'prompt.header.metadata.string.diagnostics.invalid-value-type',
					"The property '{0}' must be of type '{1}', got '{2}'.",
					this.recordName,
					'string',
					valueToken.valueTypeName.toString(),
				),
			),
		);

		delete this.valueToken;
		return this.issues;
	}
}
