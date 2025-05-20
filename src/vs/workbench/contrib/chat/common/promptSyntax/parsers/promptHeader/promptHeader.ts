/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMode } from '../../../constants.js';
import { localize } from '../../../../../../../nls.js';
import { PromptMetadataWarning } from './diagnostics.js';
import { HeaderBase, IHeaderMetadata } from './headerBase.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { PromptToolsMetadata, PromptModeMetadata } from './metadata/index.js';
import { FrontMatterRecord } from '../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
export interface IPromptMetadata extends IHeaderMetadata {
	/**
	 * Tools metadata in the prompt header.
	 */
	tools?: PromptToolsMetadata;

	/**
	 * Chat mode metadata in the prompt header.
	 */
	mode?: PromptModeMetadata;
}

/**
 * TODO: @legomushroom
 */
export class PromptHeader extends HeaderBase<IPromptMetadata> {
	// TODO: @legomushroom - return a record name instead?
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

		return false;
	}

	/**
	 * Check if value of `tools` and `mode` metadata
	 * are compatible with each other.
	 */
	private get toolsAndModeCompatible(): boolean {
		const { tools, mode } = this.meta;

		// if 'tools' is not set, then the mode metadata
		// can have any value so skip the validation
		if (tools === undefined) {
			return true;
		}

		// if 'mode' is not set or invalid it will be ignored,
		// therefore treat it as if it was not set
		if (mode?.chatMode === undefined) {
			return true;
		}

		// when mode is set, valid, and tools are present,
		// the only valid value for the mode is 'agent'
		return (mode.chatMode === ChatMode.Agent);
	}

	/**
	 * Validate that the `tools` and `mode` metadata are compatible
	 * with each other. If not, add a warning diagnostic.
	 */
	private validateToolsAndModeCompatibility(): void {
		if (this.toolsAndModeCompatible === true) {
			return;
		}

		const { tools, mode } = this.meta;

		// sanity checks on the behavior of the `toolsAndModeCompatible` getter
		assertDefined(
			tools,
			'Tools metadata must have been present.',
		);
		assertDefined(
			mode,
			'Mode metadata must have been present.',
		);
		assert(
			mode.chatMode !== ChatMode.Agent,
			'Mode metadata must not be agent mode.',
		);

		this.issues.push(
			new PromptMetadataWarning(
				mode.range,
				localize(
					'prompt.header.metadata.mode.diagnostics.incompatible-with-tools',
					"Record '{0}' is implied to have the '{1}' value if '{2}' record is present so the specified value will be ignored.",
					mode.recordName,
					ChatMode.Agent,
					tools.recordName,
				),
			),
		);
	}
}
