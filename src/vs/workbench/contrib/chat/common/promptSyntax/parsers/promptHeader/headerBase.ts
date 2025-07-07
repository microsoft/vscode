/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type TModeMetadata } from './modeHeader.js';
import { localize } from '../../../../../../../nls.js';
import { type TPromptMetadata } from './promptHeader.js';
import { type IMetadataRecord } from './metadata/base/record.js';
import { type TInstructionsMetadata } from './instructionsHeader.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { ObjectStream } from '../../codecs/base/utils/objectStream.js';
import { PromptMetadataError, PromptMetadataWarning, type TDiagnostic } from './diagnostics.js';
import { SimpleToken } from '../../codecs/base/simpleCodec/tokens/tokens.js';
import { FrontMatterRecord } from '../../codecs/base/frontMatterCodec/tokens/index.js';
import { FrontMatterHeader } from '../../codecs/base/markdownExtensionsCodec/tokens/frontMatterHeader.js';
import { FrontMatterDecoder, type TFrontMatterToken } from '../../codecs/base/frontMatterCodec/frontMatterDecoder.js';
import { PromptDescriptionMetadata } from './metadata/description.js';

/**
 * A metadata utility class "dehydrated" into a plain data object with
 * semi-primitive record values (string, boolean, string[], boolean[], etc.).
 */
export type TDehydrated<T extends IHeaderMetadata> = {
	[K in keyof T]: T[K] extends IMetadataRecord<infer U> ? (U extends undefined ? undefined : NonNullable<U>) : undefined;
};

/**
 * Metadata defined in the prompt header.
 */
export interface IHeaderMetadata {
	/**
	 * Description metadata in the prompt header.
	 */
	description: PromptDescriptionMetadata;
}

/**
 * Metadata for prompt/instruction/mode files.
 */
export type THeaderMetadata = Partial<TDehydrated<IHeaderMetadata>>;

/**
 * Metadata defined in the header of prompt/instruction/mode files.
 */
export type TMetadata = TPromptMetadata | TModeMetadata | TInstructionsMetadata;

/**
 * Base class for prompt/instruction/mode headers.
 */
export abstract class HeaderBase<
	TMetadata extends IHeaderMetadata,
> extends Disposable {
	/**
	 * Underlying decoder for a Front Matter header.
	 */
	private readonly stream: FrontMatterDecoder;

	/**
	 * Metadata records.
	 */
	protected readonly meta: Partial<TMetadata>;

	/**
	 * Data object with all header's metadata records.
	 */
	public get metadata(): Partial<TDehydrated<TMetadata>> {
		const result: Partial<TDehydrated<TMetadata>> = {};

		for (const [entryName, entryValue] of Object.entries(this.meta)) {
			if (entryValue?.value === undefined) {
				continue;
			}

			// note! we have to resort to `Object.assign()` here because
			//       the `Object.entries()` call looses type information
			Object.assign(result, {
				[entryName]: entryValue.value,
			});
		}

		return result;
	}

	/**
	 * A copy of metadata object with utility classes as values
	 * for each of prompt header's record.
	 *
	 * Please use {@link metadata} instead if all you need to read is
	 * the plain "data" object representation of valid metadata records.
	 */
	public get metadataUtility(): Partial<TMetadata> {
		return { ...this.meta };
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

	/**
	 * Full range of the header in the original document.
	 */
	public get range(): Range {
		return this.token.range;
	}

	constructor(
		public readonly token: FrontMatterHeader,
		public readonly languageId: string,
	) {
		super();

		this.issues = [];
		this.meta = {};
		this.recordNames = new Set<string>();

		this.stream = this._register(
			new FrontMatterDecoder(
				ObjectStream.fromArray([...token.contentToken.children]),
			),
		);
		this.stream.onData(this.onData.bind(this));
		this.stream.onError(this.onError.bind(this));
	}

	/**
	 * Process a front matter record token, which includes:
	 *  - validation of the record and whether it is compatible with other header records
	 *  - adding validation-related diagnostic messages to the {@link issues} list
	 *  - setting associated utility class for the record on the {@link meta} object
	 *
	 * @returns a boolean flag that indicates whether the token was handled and therefore
	 *          should not be processed any further.
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
						"Duplicate property '{0}' will be ignored.",
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

		// pipe the token to the actual implementation class
		// that might to handle it based on the token type
		if (this.handleToken(token)) {
			return;
		}

		// all other records are "unknown" ones
		this.issues.push(
			new PromptMetadataWarning(
				token.range,
				localize(
					'prompt.header.metadata.diagnostics.unknown-record',
					"Unknown property '{0}' will be ignored.",
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
				this.token.range,
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
	public get settled(): Promise<boolean> {
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
