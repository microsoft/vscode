/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../../../../base/common/buffer.js';
import { SimpleToken } from '../../simpleCodec/tokens/simpleToken.js';

/**
 * Token that represent a `carriage return` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class CarriageReturn extends SimpleToken<'\r'> {
	/**
	 * The underlying symbol of the token.
	 */
	public static override readonly symbol: '\r' = '\r';

	/**
	 * The byte representation of the {@link symbol}.
	 */
	public static readonly byte = VSBuffer.fromString(CarriageReturn.symbol);

	/**
	 * The byte representation of the token.
	 */
	public get byte(): VSBuffer {
		return CarriageReturn.byte;
	}

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '\r' {
		return CarriageReturn.symbol;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `CR${this.range}`;
	}
}
