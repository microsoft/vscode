/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptMetadataDiagnostic } from '../diagnostics.js';
import { FrontMatterToken } from '../../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * Abstract class for all metadata records in the prompt header.
 */
// TODO: @legomushroom - can drop the extension of `FrontMatterToken`?
export abstract class PromptMetadataToken extends FrontMatterToken {
	/**
	 * List of diagnostic objects related to this metadata record.
	 */
	abstract readonly diagnostics: readonly PromptMetadataDiagnostic[];
}
