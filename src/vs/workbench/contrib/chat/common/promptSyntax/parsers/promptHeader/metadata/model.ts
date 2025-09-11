/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FrontMatterRecord, FrontMatterToken } from '../../../codecs/base/frontMatterCodec/tokens/index.js';
import { PromptStringMetadata } from './base/string.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'model';

export class PromptModelMetadata extends PromptStringMetadata {
	public override get recordName(): string {
		return RECORD_NAME;
	}

	constructor(
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(RECORD_NAME, recordToken, languageId);
	}

	/**
	 * Check if a provided front matter token is a metadata record
	 * with name equal to `description`.
	 */
	public static isModelRecord(token: FrontMatterToken): boolean {
		if ((token instanceof FrontMatterRecord) === false) {
			return false;
		}

		if (token.nameToken.text === RECORD_NAME) {
			return true;
		}

		return false;
	}
}
