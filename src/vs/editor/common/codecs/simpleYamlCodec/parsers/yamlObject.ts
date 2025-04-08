/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { PartialYamlString } from './yamlString.js';
import { YamlString } from '../tokens/yamlString.js';
import { YamlObject, YamlRecord } from '../tokens/yamlObject.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { Colon, Space } from '../../simpleCodec/tokens/index.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../simpleCodec/parserBase.js';

// /**
//  * TODO: @legomushroom
//  */
// const VALID_NAME_TOKENS = [
// 	Word, Dash, Space, Quote, DoubleQuote,
// ];

/**
 * TODO: @legomushroom
 */
export class PartialYamlRecord extends ParserBase<TSimpleDecoderToken, PartialYamlRecord | YamlRecord> {
	/**
	 * TODO: @legomushroom
	 */
	private valueParser: PartialYamlString | PartialYamlObject;

	constructor(
		private readonly indentation: readonly Space[],
		private readonly recordName: YamlString,
		private readonly delimiter: readonly [Colon, Space],
	) {
		super([]);

		this.valueParser = new PartialYamlString(this.indentation, null);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialYamlRecord | YamlRecord> {
		const acceptResult = this.valueParser.accept(token);
		const { result, wasTokenConsumed } = acceptResult;

		if (result === 'success') {
			if ((acceptResult.nextParser instanceof YamlString) || (acceptResult.nextParser instanceof YamlObject)) {
				const yamlRecord = new YamlRecord(
					BaseToken.fullRange([this.recordName, acceptResult.nextParser]),
					this.recordName,
					this.delimiter,
					acceptResult.nextParser,
				);

				return {
					result: 'success',
					nextParser: yamlRecord,
					wasTokenConsumed,
				};
			}

			this.valueParser = acceptResult.nextParser;
			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed,
			};
		}

		return {
			result: 'failure',
			wasTokenConsumed,
		};
	}

	public asYamlRecord(): YamlRecord {
		this.isConsumed = true;

		if (this.valueParser instanceof PartialYamlString) {
			const recordValue = this.valueParser.asYamlString();

			return new YamlRecord(
				BaseToken.fullRange([this.recordName, recordValue]),
				this.recordName,
				this.delimiter,
				recordValue,
			);
		}

		if (this.valueParser instanceof PartialYamlObject) {
			const recordValue = this.valueParser.asYamlObject();

			return new YamlRecord(
				BaseToken.fullRange([this.recordName, recordValue]),
				this.recordName,
				this.delimiter,
				recordValue,
			);
		}

		assertNever(
			this.valueParser,
			`Unexpected value parser '${this.valueParser}'.`,
		);
	}
}


/**
 * TODO: @legomushroom
 */
export class PartialYamlObject extends ParserBase<YamlRecord, PartialYamlObject | YamlObject> {
	constructor(
		_indentation: readonly Space[],
		private currentRecord: PartialYamlRecord,
	) {
		super([]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialYamlObject | YamlObject> {
		const acceptResult = this.currentRecord.accept(token);
		const { result, wasTokenConsumed } = acceptResult;

		if (result === 'success') {
			if (acceptResult.nextParser instanceof YamlRecord) {
				this.currentTokens.push(acceptResult.nextParser);

				// TODO: @legomushroom - continue to parse the next record?

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed,
				};
			}

			this.currentRecord = acceptResult.nextParser;
			return {
				result: 'success',
				nextParser: this,
				wasTokenConsumed,
			};
		}

		return {
			result: 'failure',
			wasTokenConsumed,
		};
	}

	/**
	 * TODO: @legomushroom
	 */
	public asYamlObject(): YamlObject {
		this.isConsumed = true;

		if (this.currentRecord instanceof PartialYamlRecord) {
			this.currentTokens.push(
				this.currentRecord.asYamlRecord(),
			);

			// TODO: @legomushroom - delete the `this.currentRecord` reference?
		}

		return new YamlObject(this.currentTokens);
	}
}
