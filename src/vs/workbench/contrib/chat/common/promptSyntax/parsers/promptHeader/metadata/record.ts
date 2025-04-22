/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../../../../../editor/common/core/range.js';
import { PromptMetadataDiagnostic, PromptMetadataError, PromptMetadataWarning } from '../diagnostics.js';

/**
 * Abstract class for all metadata records in the prompt header.
 */
export abstract class PromptMetadataRecord {
	/**
	 * List of diagnostic objects related to this metadata record.
	 */
	abstract readonly diagnostics: readonly PromptMetadataDiagnostic[];

	constructor(
		/**
		 * Full range of the metadata's record text in the prompt header.
		 */
		public readonly range: Range,
	) { }

	/**
	 * Name of the metadata record.
	 */
	public abstract get recordName(): string;

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
