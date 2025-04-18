/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { PromptToolsMetadata } from './metadata/tools.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { Text } from '../../../../../../../editor/common/codecs/baseToken.js';
import { PromptMetadataError, PromptMetadataWarning, TDiagnostic } from './diagnostics.js';
import { TokenStream } from '../../../../../../../editor/common/codecs/utils/tokenStream.js';
import { SimpleToken } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/index.js';
import { FrontMatterRecord } from '../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';
import { FrontMatterDecoder, TFrontMatterToken } from '../../../../../../../editor/common/codecs/frontMatterCodec/frontMatterDecoder.js';

/**
 * Type of all known metadata records inside the prompt header.
 */
type TMetadataRecord = PromptToolsMetadata;

/**
 * Prompt header holds all metadata records for a prompt.
 */
export class PromptHeader extends Disposable {
	/**
	 * Underlying decoder for a Front Matter header.
	 */
	private readonly stream: FrontMatterDecoder;

	/**
	 * List of all unique well-known metadata records
	 * inside the prompt header.
	 */
	private readonly records: TMetadataRecord[];

	/**
	 * List of all unique well-known metadata records
	 * inside the prompt header.
	 */
	public get metadata(): readonly TMetadataRecord[] {
		return this.records;
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
		this.records = [];
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

		// if the record might be a "tools" metadata
		// add it to the list of parsed metadata records
		if (PromptToolsMetadata.isToolsRecord(token)) {
			const toolsMetadata = new PromptToolsMetadata(token);
			const { diagnostics } = toolsMetadata;

			this.issues.push(...diagnostics);
			this.records.push(toolsMetadata);
			this.recordNames.add(recordName);

			return;
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
