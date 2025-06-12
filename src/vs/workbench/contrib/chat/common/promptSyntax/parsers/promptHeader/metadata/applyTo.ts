/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptStringMetadata } from './base/string.js';
import { localize } from '../../../../../../../../nls.js';
import { INSTRUCTIONS_LANGUAGE_ID } from '../../../promptTypes.js';
import { isEmptyPattern, parse, splitGlobAware } from '../../../../../../../../base/common/glob.js';
import { PromptMetadataDiagnostic, PromptMetadataError, PromptMetadataWarning } from '../diagnostics.js';
import { FrontMatterRecord, FrontMatterToken } from '../../../codecs/base/frontMatterCodec/tokens/index.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'applyTo';

/**
 * Prompt `applyTo` metadata record inside the prompt header.
 */
export class PromptApplyToMetadata extends PromptStringMetadata {
	constructor(
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(RECORD_NAME, recordToken, languageId);
	}

	public override get recordName(): string {
		return RECORD_NAME;
	}

	public override validate(): readonly PromptMetadataDiagnostic[] {
		super.validate();

		// if we don't have a value token, validation must
		// has failed already so nothing to do more
		if (this.valueToken === undefined) {
			return this.issues;
		}

		// the applyTo metadata makes sense only for 'instruction' prompts
		if (this.languageId !== INSTRUCTIONS_LANGUAGE_ID) {
			this.issues.push(
				new PromptMetadataError(
					this.range,
					localize(
						'prompt.header.metadata.string.diagnostics.invalid-language',
						"The '{0}' metadata record is only valid in instruction files.",
						this.recordName,
					),
				),
			);

			delete this.valueToken;
			return this.issues;
		}

		const { cleanText } = this.valueToken;

		// warn user if specified glob pattern is not valid
		if (this.isValidGlob(cleanText) === false) {
			this.issues.push(
				new PromptMetadataWarning(
					this.valueToken.range,
					localize(
						'prompt.header.metadata.applyTo.diagnostics.non-valid-glob',
						"Invalid glob pattern '{0}'.",
						cleanText,
					),
				),
			);

			delete this.valueToken;
			return this.issues;
		}

		return this.issues;
	}

	/**
	 * Check if a provided string contains a valid glob pattern.
	 */
	private isValidGlob(
		pattern: string,
	): boolean {
		try {
			const patterns = splitGlobAware(pattern, ',');
			if (patterns.length === 0) {
				return false;
			}
			for (const pattern of patterns) {

				const globPattern = parse(pattern);
				if (isEmptyPattern(globPattern)) {
					return false;
				}
			}
			return true;
		} catch (_error) {
			return false;
		}
	}

	/**
	 * Check if a provided front matter token is a metadata record
	 * with name equal to `applyTo`.
	 */
	public static isApplyToRecord(
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
