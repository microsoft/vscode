/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../baseToken.js';

/**
 * Common interface for a result of accepting a next token
 * in a sequence.
 */
export interface IAcceptTokenResult {
	/**
	 * The result type of accepting a next token in a sequence.
	 */
	result: 'success' | 'failure';

	/**
	 * Whether the token to accept was consumed by the parser
	 * during the accept operation.
	 */
	wasTokenConsumed: boolean;
}

/**
 * Successful result of accepting a next token in a sequence.
 */
export interface IAcceptTokenSuccess<T> extends IAcceptTokenResult {
	result: 'success';
	nextParser: T;
}

/**
 * Failure result of accepting a next token in a sequence.
 */
export interface IAcceptTokenFailure extends IAcceptTokenResult {
	result: 'failure';
}

/**
 * The result of operation of accepting a next token in a sequence.
 */
export type TAcceptTokenResult<T> = IAcceptTokenSuccess<T> | IAcceptTokenFailure;

/**
 * An abstract parser class that is able to parse a sequence of
 * tokens into a new single entity.
 */
export abstract class ParserBase<TToken extends BaseToken, TNextObject> {
	constructor(
		/**
		 * Set of tokens that were accumulated so far.
		 */
		protected readonly currentTokens: TToken[] = [],
	) { }

	/**
	 * Get the tokens that were accumulated so far.
	 */
	public get tokens(): readonly TToken[] {
		return this.currentTokens;
	}

	/**
	 * Accept a new token returning parsing result:
	 *  - successful result must include the next parser object or a fully parsed out token
	 *  - failure result must indicate that the token was not consumed
	 *
	 * @param token The token to accept.
	 * @returns The parsing result.
	 */
	public abstract accept(token: TToken): TAcceptTokenResult<TNextObject>;
}
