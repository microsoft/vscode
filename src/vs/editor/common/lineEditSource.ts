/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Represents the source of the last edit for a line
 */
export const enum LineEditSource {
	/**
	 * The line edit source is unknown or has not been determined
	 */
	Undetermined = 0,
	/**
	 * The line was last edited by a human user
	 */
	Human = 1,
	/**
	 * The line was last edited by AI/automated tools
	 */
	AI = 2
}

/**
 * Event fired when line edit sources change
 */
export interface ILineEditSourcesChangedEvent {
	/**
	 * Map of line numbers to their new edit sources
	 */
	readonly changes: Map<number, LineEditSource>;
}
