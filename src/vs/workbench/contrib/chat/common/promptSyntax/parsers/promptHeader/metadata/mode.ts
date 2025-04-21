/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptMetadataRecord } from './record.js';
import { ChatMode } from '../../../../constants.js';
import { localize } from '../../../../../../../../nls.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { PromptMetadataDiagnostic, PromptMetadataError } from '../diagnostics.js';
import { FrontMatterRecord, FrontMatterString, FrontMatterToken } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

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
export class PromptModeMetadata extends PromptMetadataRecord {
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
	 * Private field for tracking the chat mode value.
	 */
	private value: ChatMode | undefined;
	/**
	 * Chat mode value of the metadata record.
	 */
	public get chatMode(): ChatMode | undefined {
		return this.value;
	}

	constructor(
		private readonly recordToken: FrontMatterRecord,
	) {
		// sanity check on the name of the record
		assert(
			PromptModeMetadata.isModeRecord(recordToken),
			`Record token must be 'mode', got '${recordToken.nameToken.text}'.`,
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
						'prompt.header.metadata.mode.diagnostics.invalid-value-type',
						"Value of the '{0}' metadata must be '{1}', got '{2}'.",
						RECORD_NAME,
						'string',
						valueToken.valueTypeName,
					),
				),
			);

			return;
		}

		const { cleanText } = valueToken;

		// validate that text value is one of the valid modes
		const validModes: string[] = [...VALID_MODES];
		const index = validModes.indexOf(cleanText);
		if (index !== -1) {
			this.value = VALID_MODES[index];
			return;
		}

		// if not valid mode value, add an appropriate diagnostic
		this.issues.push(
			new PromptMetadataError(
				valueToken.range,
				localize(
					'prompt.header.metadata.mode.diagnostics.invalid-value',
					"Value of the '{0}' metadata must be one of ({1}), got '{2}'.",
					RECORD_NAME,
					VALID_MODES
						.map((modeName) => {
							return `'${modeName}'`;
						}).join(', '),
					cleanText,
				),
			),
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
