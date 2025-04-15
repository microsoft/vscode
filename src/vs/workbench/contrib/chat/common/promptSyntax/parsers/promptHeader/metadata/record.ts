/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptMetadataDiagnostic } from '../diagnostics.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';

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
}
