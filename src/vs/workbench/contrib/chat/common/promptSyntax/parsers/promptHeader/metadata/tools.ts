/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptMetadataRecord } from './record.js';
import { localize } from '../../../../../../../../nls.js';
import { assert } from '../../../../../../../../base/common/assert.js';
import { PromptMetadataDiagnostic, PromptMetadataError, PromptMetadataWarning } from '../diagnostics.js';
import { FrontMatterArray, FrontMatterRecord, FrontMatterString, FrontMatterToken, FrontMatterValueToken } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Name of the metadata record in the prompt header.
 */
const RECORD_NAME = 'tools';

/**
 * Prompt `tools` metadata record inside the prompt header.
 */
export class PromptToolsMetadata extends PromptMetadataRecord {
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
	 * List of all valid tool names that were found in
	 * this metadata record.
	 */
	private validToolNames: Set<string>;

	/**
	 * List of all valid tool names that were found in
	 * this metadata record.
	 */
	public get toolNames(): readonly string[] {
		return [...this.validToolNames.values()];
	}

	constructor(
		private readonly recordToken: FrontMatterRecord,
	) {
		// sanity check on the name of the tools record
		assert(
			PromptToolsMetadata.isToolsRecord(recordToken),
			`Record token must be a tools token, got '${recordToken.nameToken.text}'.`,
		);

		super(recordToken.range);

		this.issues = [];
		this.validToolNames = new Set<string>();
		this.collectDiagnostics();
	}

	/**
	 * Validate the metadata record and collect all issues
	 * related to its content.
	 */
	private collectDiagnostics(): void {
		const { valueToken } = this.recordToken;

		// validate that the record value is an array
		if ((valueToken instanceof FrontMatterArray) === false) {
			this.issues.push(
				new PromptMetadataError(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.invalid-value-type',
						"Value of the '{0}' metadata must be '{1}', got '{2}'.",
						RECORD_NAME,
						'array',
						valueToken.valueTypeName,
					),
				),
			);

			return;
		}

		const arrayValue: FrontMatterArray = valueToken;

		// validate that all array items
		for (const item of arrayValue.items) {
			this.validateToolName(item);
		}
	}

	/**
	 * Validate an individual provided value token that
	 * is used for a tool name.
	 */
	private validateToolName(
		valueToken: FrontMatterValueToken,
	): void {
		// tool name must be a string
		if ((valueToken instanceof FrontMatterString) === false) {
			this.issues.push(
				new PromptMetadataWarning(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.invalid-tool-name-type',
						"Expected a tool name ({0}), got '{1}'.",
						'string',
						valueToken.text,
					),
				),
			);

			return;
		}

		const cleanToolName = valueToken.cleanText.trim();
		// the tool name should not be empty
		if (cleanToolName.length === 0) {
			this.issues.push(
				new PromptMetadataWarning(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.empty-tool-name',
						"Tool name cannot be empty.",
					),
				),
			);

			return;
		}

		// the tool name should not be duplicated
		if (this.validToolNames.has(cleanToolName)) {
			this.issues.push(
				new PromptMetadataWarning(
					valueToken.range,
					localize(
						'prompt.header.metadata.tools.diagnostics.duplicate-tool-name',
						"Duplicate tool name '{0}'.",
						cleanToolName,
					),
				),
			);

			return;
		}

		// collect all valid tool names
		this.validToolNames.add(cleanToolName);
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
