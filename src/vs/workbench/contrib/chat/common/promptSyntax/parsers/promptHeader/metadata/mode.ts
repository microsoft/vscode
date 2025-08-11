/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatModeKind } from '../../../../constants.js';
import { PromptEnumMetadata } from './base/enum.js';
import { FrontMatterRecord, FrontMatterToken } from '../../../codecs/base/frontMatterCodec/tokens/index.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'mode';

/**
 * Prompt `mode` metadata record inside the prompt header.
 */
export class PromptModeMetadata extends PromptEnumMetadata<ChatModeKind> {
	constructor(
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(
			[ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent],
			RECORD_NAME,
			recordToken,
			languageId,
		);
	}

	/**
	 * Check if a provided front matter token is a metadata record
	 * with name equal to `mode`.
	 */
	public static isModeRecord(
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
