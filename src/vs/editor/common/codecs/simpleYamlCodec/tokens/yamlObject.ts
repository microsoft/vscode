/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { YamlString } from './index.js';
import { YamlToken } from './yamlToken.js';
import { Range } from '../../../core/range.js';
import { BaseToken } from '../../baseToken.js';
import { Colon, Space } from '../../simpleCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
export class YamlObject extends YamlToken {
	constructor(
		public readonly records: readonly YamlRecord[],
	) {
		const firstRecord = records[0];
		const lastRecord = records[records.length - 1];

		super(BaseToken.fullRange([firstRecord, lastRecord]));
	}

	public override get text(): string {
		return BaseToken.render(this.records);
	}

	public override toString(): string {
		return `yaml-obj(${this.shortText()}){${this.range}}`;
	}
}

/**
 * TODO: @legomushroom
 */
export class YamlRecord extends YamlToken {
	constructor(
		range: Range,
		public readonly name: YamlString,
		private readonly delimiter: readonly [Colon, Space],
		public readonly value: YamlString | YamlObject,
	) {
		super(range);
	}

	public static fromTokens(
		name: YamlString,
		delimiter: readonly [Colon, Space],
		value: YamlString | YamlObject,
	): YamlRecord {
		return new YamlRecord(
			BaseToken.fullRange([name, value]),
			name,
			delimiter,
			value,
		);
	}

	public override get text(): string {
		return BaseToken.render([this.name, ...this.delimiter, this.value]);
	}

	public override toString(): string {
		return `yaml-record(${this.shortText()}){${this.range}}`;
	}
}
