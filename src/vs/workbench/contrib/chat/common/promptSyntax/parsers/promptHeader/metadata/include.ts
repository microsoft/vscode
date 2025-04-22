/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptStringMetadata } from './record.js';
import { localize } from '../../../../../../../../nls.js';
import { INSTRUCTIONS_LANGUAGE_ID } from '../../../constants.js';
import { PromptMetadataDiagnostic, PromptMetadataError } from '../diagnostics.js';
import { FrontMatterRecord, FrontMatterToken } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'include';

/**
 * Prompt `include` metadata record inside the prompt header.
 */
export class PromptIncludeMetadata extends PromptStringMetadata {
	constructor(
		recordToken: FrontMatterRecord,
	) {
		super(RECORD_NAME, recordToken);
	}

	public override get recordName(): string {
		return RECORD_NAME;
	}

	protected override validate(): readonly PromptMetadataDiagnostic[] {
		const result: PromptMetadataDiagnostic[] = [
			...super.validate(),
		];

		// TODO: @legomushroom - validate that is a valid glob pattern

		return result;
	}

	/**
	 * TODO: @legomushroom
	 */
	public validateDocumentLanguage(
		languageId: string,
	): readonly PromptMetadataDiagnostic[] {
		const result: PromptMetadataDiagnostic[] = [];

		if (languageId !== INSTRUCTIONS_LANGUAGE_ID) {
			result.push(
				new PromptMetadataError(
					this.range,
					localize(
						'prompt.header.metadata.string.diagnostics.invalid-value-type',
						"The '{0}' metadata record is only valid in instruction files.",
						this.recordName,
					),
				),
			);
		}

		return result;
	}

	/**
	 * Check if a provided front matter token is a metadata record
	 * with name equal to `include`.
	 */
	public static isIncludeRecord(
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
