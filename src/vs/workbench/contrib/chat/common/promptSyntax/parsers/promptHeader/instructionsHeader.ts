/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptApplyToMetadata } from './metadata/applyTo.js';
import { HeaderBase, IHeaderMetadata, type TDehydrated } from './headerBase.js';
import { PromptsType } from '../../promptTypes.js';
import { FrontMatterRecord } from '../../codecs/base/frontMatterCodec/tokens/index.js';

/**
 * Metadata utility object for instruction files.
 */
interface IInstructionsMetadata extends IHeaderMetadata {
	/**
	 * Chat 'applyTo' metadata in the prompt header.
	 */
	applyTo: PromptApplyToMetadata;
}

/**
 * Metadata for instruction files.
 */
export type TInstructionsMetadata = Partial<TDehydrated<IInstructionsMetadata>> & { promptType: PromptsType.instructions };

/**
 * Header object for instruction files.
 */
export class InstructionsHeader extends HeaderBase<IInstructionsMetadata> {
	protected override handleToken(token: FrontMatterRecord): boolean {
		// if the record might be a "applyTo" metadata
		// add it to the list of parsed metadata records
		if (PromptApplyToMetadata.isApplyToRecord(token)) {
			const metadata = new PromptApplyToMetadata(token, this.languageId);

			this.issues.push(...metadata.validate());
			this.meta.applyTo = metadata;

			return true;
		}

		return false;
	}
}
