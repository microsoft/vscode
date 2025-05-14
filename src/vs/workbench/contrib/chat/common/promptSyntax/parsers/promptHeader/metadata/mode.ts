/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptStringMetadata } from './record.js';
import { ChatMode } from '../../../../constants.js';
import { localize } from '../../../../../../../../nls.js';
import { PromptMetadataDiagnostic, PromptMetadataError } from '../diagnostics.js';
import { FrontMatterRecord, FrontMatterToken } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'mode';

/**
 * Valid chat mode values.
 */
const VALID_MODES = Object.freeze([
	ChatMode.Ask,
	ChatMode.Edit,
	ChatMode.Agent,
]);

/**
 * Prompt `mode` metadata record inside the prompt header.
 */
export class PromptModeMetadata extends PromptStringMetadata {
	constructor(
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(RECORD_NAME, recordToken, languageId);
	}

	public override get recordName(): string {
		return RECORD_NAME;
	}

	/**
	 * Private field for tracking the chat mode value.
	 */
	private value: ChatMode | undefined;
	/**
	 * Chat mode value of the metadata record.
	 */
	public get chatMode(): ChatMode | undefined {
		return this.value;
	}

	protected override validate(): readonly PromptMetadataDiagnostic[] {
		const result: PromptMetadataDiagnostic[] = [
			...super.validate(),
		];

		if (this.text === undefined) {
			return result;
		}

		// validate that the text value is one of the valid modes
		const validModes: string[] = [...VALID_MODES];
		const index = validModes.indexOf(this.text);
		if (index !== -1) {
			this.value = VALID_MODES[index];
			return result;
		}

		// if not valid mode value, add an appropriate diagnostic
		result.push(
			new PromptMetadataError(
				this.range,
				localize(
					'prompt.header.metadata.mode.diagnostics.invalid-value',
					"Value of the '{0}' metadata must be one of ({1}), got '{2}'.",
					RECORD_NAME,
					VALID_MODES
						.map((modeName) => {
							return `'${modeName}'`;
						}).join(', '),
					this.text,
				),
			),
		);

		return result;
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
