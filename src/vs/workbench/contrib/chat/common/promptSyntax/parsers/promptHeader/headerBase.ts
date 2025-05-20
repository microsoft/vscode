/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../nls.js';
import { PromptDescriptionMetadata } from './metadata/index.js';
import { PromptMetadataRecord } from './metadata/base/record.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { Text } from '../../../../../../../editor/common/codecs/textToken.js';
import { ObjectStream } from '../../../../../../../editor/common/codecs/utils/objectStream.js';
import { PromptMetadataError, PromptMetadataWarning, type TDiagnostic } from './diagnostics.js';
import { SimpleToken } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/index.js';
import { FrontMatterRecord } from '../../../../../../../editor/common/codecs/frontMatterCodec/tokens/index.js';
import { FrontMatterDecoder, type TFrontMatterToken } from '../../../../../../../editor/common/codecs/frontMatterCodec/frontMatterDecoder.js';

/**
 * Metadata defined in the prompt header.
 */
export interface IHeaderMetadata {
	/**
	 * Description metadata in the prompt header.
	 */
	description?: PromptDescriptionMetadata;
}

/**
 * TODO: @legomushroom
 */
type TMetadataObject<T extends IHeaderMetadata> = T & Partial<{ [P in keyof T]: PromptMetadataRecord; }>; //Record<keyof T, PromptMetadataRecord | undefined>;

/**
 * TODO: @legomushroom
 */
export abstract class HeaderBase<TMetadata extends TMetadataObject<IHeaderMetadata>> extends Disposable {
	/**
	 * Underlying decoder for a Front Matter header.
	 */
	private readonly stream: FrontMatterDecoder;

	/**
	 * Metadata records.
	 */
	protected readonly meta: Partial<TMetadata>;
	/**
	 * Metadata records.
	 */
	public get metadata(): Readonly<Partial<TMetadata>> {
		return Object.freeze({ ...this.meta });
	}

	/**
	 * List of all unique metadata record names.
	 */
	private readonly recordNames: Set<string>;

	/**
	 * List of all issues found while parsing the prompt header.
	 */
	protected readonly issues: TDiagnostic[];

	/**
	 * List of all diagnostic issues found while parsing
	 * the prompt header.
	 */
	public get diagnostics(): readonly TDiagnostic[] {
		return this.issues;
	}

	constructor(
		public readonly contentsToken: Text,
		public readonly languageId: string,
	) {
		super();

		this.issues = [];
		this.meta = {};
		this.recordNames = new Set<string>();

		this.stream = this._register(
			new FrontMatterDecoder(
				ObjectStream.fromArray([...contentsToken.children]),
			),
		);
		this.stream.onData(this.onData.bind(this));
		this.stream.onError(this.onError.bind(this));
	}

	/**
	 * TODO: @legomushroom
	 */
	protected abstract handleToken(
		token: FrontMatterRecord,
	): boolean;

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
						"Duplicate metadata '{0}' will be ignored.",
						recordName,
					),
				),
			);

			return;
		}
		this.recordNames.add(recordName);

		// if the record might be a "description" metadata
		// add it to the list of parsed metadata records
		if (PromptDescriptionMetadata.isDescriptionRecord(token)) {
			const metadata = new PromptDescriptionMetadata(token, this.languageId);

			this.issues.push(...metadata.validate());
			this.meta.description = metadata;
			this.recordNames.add(recordName);
			return;
		}

		// TODO: @legomushroom
		if (this.handleToken(token)) {
			return;
		}

		// all other records are currently not supported
		this.issues.push(
			new PromptMetadataWarning(
				token.range,
				localize(
					'prompt.header.metadata.diagnostics.unknown-record',
					"Unknown metadata '{0}' will be ignored.",
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
