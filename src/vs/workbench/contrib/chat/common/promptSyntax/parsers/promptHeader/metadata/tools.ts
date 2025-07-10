/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptMetadataRecord } from './base/record.js';
import { localize } from '../../../../../../../../nls.js';
import { PromptMetadataDiagnostic, PromptMetadataError, PromptMetadataWarning } from '../diagnostics.js';
import { FrontMatterSequence } from '../../../codecs/base/frontMatterCodec/tokens/frontMatterSequence.js';
import { FrontMatterArray, FrontMatterRecord, FrontMatterString, FrontMatterToken, FrontMatterValueToken } from '../../../codecs/base/frontMatterCodec/tokens/index.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'tools';

/**
 * Prompt `tools` metadata record inside the prompt header.
 */
export class PromptToolsMetadata extends PromptMetadataRecord<string[]> {

	/**
	 * List of all valid tool names that were found in
	 * this metadata record.
	 */
	public override get value(): string[] | undefined {
		if (this.validToolNames === undefined) {
			return [];
		}

		return [...this.validToolNames.keys()];
	}

	public override get recordName(): string {
		return RECORD_NAME;
	}

	/**
	 * Value token reference of the record.
	 */
	protected valueToken: FrontMatterArray | undefined;

	/**
	 * List of all valid tool names that were found in
	 * this metadata record.
	 */
	private validToolNames: Map<string, Range> | undefined;



	constructor(
		recordToken: FrontMatterRecord,
		languageId: string,
	) {
		super(RECORD_NAME, recordToken, languageId);
	}

	/**
	 * Validate the metadata record and collect all issues
	 * related to its content.
	 */
	public override validate(): readonly PromptMetadataDiagnostic[] {
		const { valueToken } = this.recordToken;

		// validate that the record value is an array
		if ((valueToken instanceof FrontMatterArray) === false) {
			this.issues.push(
				new PromptMetadataError(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.invalid-value-type',
						"Must be an array of tool names, got '{0}'.",
						valueToken.valueTypeName.toString(),
					),
				),
			);

			delete this.valueToken;
			return this.issues;
		}

		this.valueToken = valueToken;

		// validate that all array items
		this.validToolNames = new Map<string, Range>();
		for (const item of this.valueToken.items) {
			this.issues.push(
				...this.validateToolName(item, this.validToolNames),
			);
		}

		return this.issues;
	}

	public getToolRange(toolName: string): Range | undefined {
		return this.validToolNames?.get(toolName);
	}

	/**
	 * Validate an individual provided value token that is used
	 * for a tool name.
	 */
	private validateToolName(
		valueToken: FrontMatterValueToken,
		validToolNames: Map<string, Range>,
	): readonly PromptMetadataDiagnostic[] {
		const issues: PromptMetadataDiagnostic[] = [];

		// tool name must be a quoted or an unquoted 'string'
		if (
			(valueToken instanceof FrontMatterString) === false &&
			(valueToken instanceof FrontMatterSequence) === false
		) {
			issues.push(
				new PromptMetadataWarning(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.invalid-tool-name-type',
						"Unexpected tool name '{0}', expected a string literal.",
						valueToken.text
					),
				),
			);

			return issues;
		}

		const cleanToolName = valueToken.cleanText.trim();
		// the tool name should not be empty
		if (cleanToolName.length === 0) {
			issues.push(
				new PromptMetadataWarning(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.empty-tool-name',
						"Tool name cannot be empty.",
					),
				),
			);

			return issues;
		}

		// the tool name should not be duplicated
		if (validToolNames.has(cleanToolName)) {
			issues.push(
				new PromptMetadataWarning(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.duplicate-tool-name',
						"Duplicate tool name '{0}'.",
						cleanToolName,
					),
				),
			);

			return issues;
		}

		validToolNames.set(cleanToolName, valueToken.range);
		return issues;
	}

	/**
	 * Check if a provided front matter token is a metadata record
	 * with name equal to `tools`.
	 */
	public static isToolsRecord(
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
