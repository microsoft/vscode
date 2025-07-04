/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HeaderBase, IHeaderMetadata, type TDehydrated } from './headerBase.js';
import { PromptsType } from '../../promptTypes.js';
import { FrontMatterRecord } from '../../codecs/base/frontMatterCodec/tokens/index.js';
import { PromptModelMetadata } from './metadata/model.js';
import { PromptToolsMetadata } from './metadata/tools.js';

/**
 * Metadata utility object for mode files.
 */
interface IModeMetadata extends IHeaderMetadata {
	/**
	 * Tools metadata in the mode header.
	 */
	tools: PromptToolsMetadata;

	/**
	 * Chat model metadata in the mode header.
	 */
	model: PromptModelMetadata;
}

/**
 * Metadata for mode files.
 */
export type TModeMetadata = Partial<TDehydrated<IModeMetadata>> & { promptType: PromptsType.mode };

/**
 * Header object for mode files.
 */
export class ModeHeader extends HeaderBase<IModeMetadata> {
	protected override handleToken(token: FrontMatterRecord): boolean {
		// if the record might be a "tools" metadata
		// add it to the list of parsed metadata records
		if (PromptToolsMetadata.isToolsRecord(token)) {
			const metadata = new PromptToolsMetadata(token, this.languageId);

			this.issues.push(...metadata.validate());
			this.meta.tools = metadata;
			return true;
		}
		if (PromptModelMetadata.isModelRecord(token)) {
			const metadata = new PromptModelMetadata(token, this.languageId);

			this.issues.push(...metadata.validate());
			this.meta.model = metadata;

			return true;
		}
		return false;
	}
}
