/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const SESSION_CARD_MAX_HEIGHT = 10000;

export interface ISessionCardBoardSize {
	readonly id: string;
	readonly columnSpan: number;
	/** Omit the height to use the card's compact layout. */
	readonly height?: number;
}

export interface ISessionCardBoardState {
	readonly order: readonly string[];
	readonly sizes: readonly ISessionCardBoardSize[];
}
