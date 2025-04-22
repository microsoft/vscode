/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptStringMetadata } from './record.js';
import { PromptMetadataDiagnostic } from '../diagnostics.js';
import { FrontMatterRecord, FrontMatterToken } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * TODO: @legomushroom - list
 * - find all instruction files
 * - when a file (non-prompt?) referenced by `user`, find all instructions that match
 * - when a file (non-prompt?) referenced by `chatbot`, find all instructions that match
 */

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

	/**
	 * Validate the metadata record and collect all issues
	 * related to its content.
	 */
	protected override validate(): readonly PromptMetadataDiagnostic[] {
		const result: PromptMetadataDiagnostic[] = [
			...super.validate(),
		];

		// TODO: @legomushroom - validate that is a valid glob pattern
		// TODO: @legomushroom - validate that used only in instruction files

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
