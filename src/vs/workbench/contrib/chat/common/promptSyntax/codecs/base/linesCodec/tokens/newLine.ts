/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../../../../base/common/buffer.js';
import { SimpleToken } from '../../simpleCodec/tokens/simpleToken.js';

/**
 * A token that represent a `new line` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class NewLine extends SimpleToken<'\n'> {
	/**
	 * The underlying symbol of the `NewLine` token.
	 */
	public static override readonly symbol: '\n' = '\n';

	/**
	 * The byte representation of the {@link symbol}.
	 */
	public static readonly byte = VSBuffer.fromString(NewLine.symbol);

	/**
	 * Return text representation of the token.
	 */
	public override get text(): '\n' {
		return NewLine.symbol;
	}

	/**
	 * The byte representation of the token.
	 */
	public get byte(): VSBuffer {
		return NewLine.byte;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `newline${this.range}`;
	}
}
