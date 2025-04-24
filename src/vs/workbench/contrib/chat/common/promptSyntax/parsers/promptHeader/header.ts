/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMode } from '../../../constants.js';
import { localize } from '../../../../../../../nls.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { assertDefined } from '../../../../../../../base/common/types.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { Text } from '../../../../../../../editor/common/codecs/baseToken.js';
import { PromptMetadataError, PromptMetadataWarning, TDiagnostic } from './diagnostics.js';
import { TokenStream } from '../../../../../../../editor/common/codecs/utils/tokenStream.js';
import { SimpleToken } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/index.js';
import { PromptToolsMetadata, PromptModeMetadata, PromptDescriptionMetadata } from './metadata/index.js';
import { FrontMatterRecord } from '../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';
import { FrontMatterDecoder, TFrontMatterToken } from '../../../../../../../editor/common/codecs/frontMatterCodec/frontMatterDecoder.js';

/**
 * Metadata defined in the prompt header.
 */
export interface IHeaderMetadata {
	/**
	 * Tools metadata in the prompt header.
	 */
	tools?: PromptToolsMetadata;

	/**
	 * Description metadata in the prompt header.
	 */
	description?: PromptDescriptionMetadata;

	/**
	 * Chat mode metadata in the prompt header.
	 */
	mode?: PromptModeMetadata;
}

/**
 * Prompt header holds all metadata records for a prompt.
 */
export class PromptHeader extends Disposable {
	/**
	 * Underlying decoder for a Front Matter header.
	 */
	private readonly stream: FrontMatterDecoder;

	/**
	 * Metadata records.
	 */
	private readonly meta: IHeaderMetadata;
	/**
	 * Metadata records.
	 */
	public get metadata(): Readonly<IHeaderMetadata> {
		return Object.freeze({
			...this.meta,
		});
	}

	/**
	 * List of all unique metadata record names.
	 */
	private readonly recordNames: Set<string>;

	/**
	 * List of all issues found while parsing the prompt header.
	 */
	private readonly issues: TDiagnostic[];

	/**
	 * List of all diagnostic issues found while parsing
	 * the prompt header.
	 */
	public get diagnostics(): readonly TDiagnostic[] {
		return this.issues;
	}

	constructor(
		public readonly contentsToken: Text,
	) {
		super();

		this.issues = [];
		this.meta = {};
		this.recordNames = new Set<string>();

		this.stream = this._register(
			new FrontMatterDecoder(
				new TokenStream(contentsToken.tokens),
			),
		);
		this.stream.onData(this.onData.bind(this));
		this.stream.onError(this.onError.bind(this));
	}

	/**
	 * Process front matter tokens, converting them into
	 * well-known prompt metadata records.
	 */
	private onData(token: TFrontMatterToken): void {
		// we currently expect only front matter 'records' for
		// the prompt metadata, hence add diagnostics for all
		// other tokens and ignore them
		if ((token instanceof FrontMatterRecord) === false) {
			// unless its a simple token, in which case we just ignore it
			if (token instanceof SimpleToken) {
				return;
			}

			this.issues.push(
				new PromptMetadataError(
					token.range,
					localize(
						'prompt.header.diagnostics.unexpected-token',
						"Unexpected token '{0}'.",
						token.text,
					),
				),
			);

			return;
		}

		const recordName = token.nameToken.text;

		// if we already have a record with this name,
		// add a warning diagnostic and ignore it
		if (this.recordNames.has(recordName)) {
			this.issues.push(
				new PromptMetadataWarning(
					token.range,
					localize(
						'prompt.header.metadata.diagnostics.duplicate-record',
						"Duplicate metadata record '{0}' will be ignored.",
						recordName,
					),
				),
			);

			return;
		}

		// if the record might be a "description" metadata
		// add it to the list of parsed metadata records
		if (PromptDescriptionMetadata.isDescriptionRecord(token)) {
			const descriptionMetadata = new PromptDescriptionMetadata(token);
			const { diagnostics } = descriptionMetadata;

			this.issues.push(...diagnostics);
			this.meta.description = descriptionMetadata;
			this.recordNames.add(recordName);
			return;
		}

		// if the record might be a "tools" metadata
		// add it to the list of parsed metadata records
		if (PromptToolsMetadata.isToolsRecord(token)) {
			const toolsMetadata = new PromptToolsMetadata(token);
			const { diagnostics } = toolsMetadata;

			this.issues.push(...diagnostics);
			this.meta.tools = toolsMetadata;
			this.recordNames.add(recordName);

			return this.validateToolsAndModeCompatibility();
		}

		// if the record might be a "mode" metadata
		// add it to the list of parsed metadata records
		if (PromptModeMetadata.isModeRecord(token)) {
			const modeMetadata = new PromptModeMetadata(token);
			const { diagnostics } = modeMetadata;

			this.issues.push(...diagnostics);
			this.meta.mode = modeMetadata;
			this.recordNames.add(recordName);

			return this.validateToolsAndModeCompatibility();
		}

		// all other records are currently not supported
		this.issues.push(
			new PromptMetadataWarning(
				token.range,
				localize(
					'prompt.header.metadata.diagnostics.unknown-record',
					"Unknown metadata record '{0}' will be ignored.",
					recordName,
				),
			),
		);
	}

	/**
	 * Check if value of `tools` and `mode` metadata
	 * are compatible with each other.
	 */
	private get toolsAndModeCompatible(): boolean {
		const { tools, mode } = this.meta;

		// if `mode` is not set or equal to `agent` mode,
		// then the tools metadata can have any value so noop
		if ((mode === undefined) || (mode.chatMode === ChatMode.Agent)) {
			return true;
		}

		// if `tools` is not set, then the mode metadata
		// can have any value so skip the validation
		if (tools === undefined) {
			return true;
		}

		// in the other cases when `tools` are defined and `mode` is not
		// equal to `agent`, then the `tools` and `mode` are incompatible
		return false;
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

	/**
	 * Process errors from the underlying front matter decoder.
	 */
	private onError(error: Error): void {
		this.issues.push(
			new PromptMetadataError(
				this.contentsToken.range,
				localize(
					'prompt.header.diagnostics.parsing-error',
					"Failed to parse prompt header: {0}",
					error.message,
				),
			),
		);
	}

	/**
	 * Promise that resolves when parsing process of
	 * the prompt header completes.
	 */
	public get settled(): Promise<void> {
		return this.stream.settled;
	}

	/**
	 * Starts the parsing process of the prompt header.
	 */
	public start(): this {
		this.stream.start();

		return this;
	}
}
