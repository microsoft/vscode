/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Time to postpone update checks when on a metered connection (30 minutes in milliseconds)
 */
export const METERED_CONNECTION_POSTPONE_TIME = 30 * 60 * 1000;

/**
 * Checks if the current network connection is metered.
 * Uses the Network Information API when available.
 * @returns true if the connection is metered, false otherwise
 */
export function isMeteredConnection(): boolean {
	if (typeof navigator !== 'undefined' && 'connection' in navigator) {
		const connection = (navigator as any).connection;
		if (connection) {
			if (connection.saveData === true) {
				return true;
			}
			if (connection.metered === true) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Code to detect metered connection that can be executed in a renderer context.
 * Used for IPC communication from main to renderer process.
 */
export const isMeteredConnectionCode = `
(function() {
	if (typeof navigator !== 'undefined' && 'connection' in navigator) {
		const connection = navigator.connection;
		if (connection) {
			if (connection.saveData === true) {
				return true;
			}
			if (connection.metered === true) {
				return true;
			}
		}
	}
	return false;
})()
`;
