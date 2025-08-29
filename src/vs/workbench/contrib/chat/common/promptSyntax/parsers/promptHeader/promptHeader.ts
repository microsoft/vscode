/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatModeKind } from '../../../constants.js';
import { localize } from '../../../../../../../nls.js';
import { PromptMetadataWarning } from './diagnostics.js';
import { HeaderBase, IHeaderMetadata, type TDehydrated } from './headerBase.js';
import { PromptsType } from '../../promptTypes.js';
import { FrontMatterRecord } from '../../codecs/base/frontMatterCodec/tokens/index.js';
import { PromptModelMetadata } from './metadata/model.js';
import { PromptToolsMetadata } from './metadata/tools.js';
import { PromptModeMetadata } from './metadata/mode.js';

/**
 * Metadata utility object for prompt files.
 */
export interface IPromptMetadata extends IHeaderMetadata {
	/**
	 * Tools metadata in the prompt header.
	 */
	tools: PromptToolsMetadata;

	/**
	 * Chat mode metadata in the prompt header.
	 */
	mode: PromptModeMetadata;

	/**
	 * Chat model metadata in the prompt header.
	 */
	model: PromptModelMetadata;
}

/**
 * Metadata for prompt files.
 */
export type TPromptMetadata = Partial<TDehydrated<IPromptMetadata>> & { promptType: PromptsType.prompt };

/**
 * Header object for prompt files.
 */
export class PromptHeader extends HeaderBase<IPromptMetadata> {
	protected override handleToken(token: FrontMatterRecord): boolean {
		// if the record might be a "tools" metadata
		// add it to the list of parsed metadata records
		if (PromptToolsMetadata.isToolsRecord(token)) {
			const metadata = new PromptToolsMetadata(token, this.languageId);

			this.issues.push(...metadata.validate());
			this.meta.tools = metadata;

			this.validateToolsAndModeCompatibility();
			return true;
		}

		// if the record might be a "mode" metadata
		// add it to the list of parsed metadata records
		if (PromptModeMetadata.isModeRecord(token)) {
			const metadata = new PromptModeMetadata(token, this.languageId);

			this.issues.push(...metadata.validate());
			this.meta.mode = metadata;

			this.validateToolsAndModeCompatibility();
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

	/**
	 * Validate that the `tools` and `mode` metadata are compatible
	 * with each other. If not, add a warning diagnostic.
	 */
	private validateToolsAndModeCompatibility(): void {
		const { tools, mode } = this.meta;
		const modeValue = mode?.value;

		if (tools !== undefined && (modeValue === ChatModeKind.Edit || modeValue === ChatModeKind.Ask)) {
			this.issues.push(
				new PromptMetadataWarning(
					tools.range,
					localize(
						'prompt.header.metadata.mode.diagnostics.incompatible-with-tools',
						"Tools can not be used in '{0}' mode and will be ignored.",
						modeValue
					),
				),
			);
		}
	}
}
