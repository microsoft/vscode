/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptApplyToMetadata } from './metadata/applyTo.js';
import { HeaderBase, IHeaderMetadata, type TCleanMetadata } from './headerBase.js';
import { FrontMatterRecord } from '../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
interface IInstructionsMetadata extends IHeaderMetadata {
	/**
	 * Chat 'applyTo' metadata in the prompt header.
	 */
	applyTo: PromptApplyToMetadata;
}

/**
 * TODO: @legomushroom
 */
export type TInstructionsMetadata = TCleanMetadata<IInstructionsMetadata>;

/**
 * TODO: @legomushroom
 */
export class InstructionsHeader extends HeaderBase<IInstructionsMetadata> {
	// TODO: @legomushroom - return a record name instead?
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
