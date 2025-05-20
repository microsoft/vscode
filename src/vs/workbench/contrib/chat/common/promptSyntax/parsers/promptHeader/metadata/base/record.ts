/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../../../../base/common/assert.js';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { PromptMetadataDiagnostic, PromptMetadataError, PromptMetadataWarning } from '../../diagnostics.js';
import { FrontMatterRecord } from '../../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Abstract class for all metadata records in the prompt header.
 */
export abstract class PromptMetadataRecord {

	/**
	 * Private field for tracking all diagnostic issues
	 * related to this metadata record.
	 */
	protected readonly issues: PromptMetadataDiagnostic[];

	/**
	 * Full range of the metadata's record text in the prompt header.
	 */
	public get range(): Range {
		return this.recordToken.range;
	}

	constructor(
		protected readonly expectedRecordName: string,
		protected readonly recordToken: FrontMatterRecord,
		protected readonly languageId: string,
	) {
		// validate that the record name has the expected name
		const recordName = recordToken.nameToken.text;
		assert(
			recordName === expectedRecordName,
			`Record name must be '${expectedRecordName}', got '${recordName}'.`,
		);

		this.issues = [];
	}

	/**
	 * Name of the metadata record.
	 */
	public get recordName(): string {
		return this.recordToken.nameToken.text;
	}

	/**
	 * Validate the metadata record and collect all issues
	 * related to its content.
	 */
	public abstract validate(): readonly PromptMetadataDiagnostic[];

	/**
	 * List of all diagnostic issues related to this metadata record.
	 */
	public get diagnostics(): readonly PromptMetadataDiagnostic[] {
		return this.issues;
	}

	/**
	 * List of all `error` issue diagnostics.
	 */
	public get errorDiagnostics(): readonly PromptMetadataError[] {
		return this.diagnostics
			.filter((diagnostic) => {
				return (diagnostic instanceof PromptMetadataError);
			});
	}

	/**
	 * List of all `warning` issue diagnostics.
	 */
	public get warningDiagnostics(): readonly PromptMetadataWarning[] {
		return this.diagnostics
			.filter((diagnostic) => {
				return (diagnostic instanceof PromptMetadataWarning);
			});
	}
}
