/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Detects if the current network connection is metered.
 * Uses the Network Information API when available.
 * This function should be called from the renderer process.
 * @returns true if the connection is metered, false otherwise
 */
export function isMeteredConnection(): boolean {
	// Check if the Network Information API is available
	if (typeof navigator !== 'undefined' && 'connection' in navigator) {
		const connection = (navigator as any).connection;
		if (connection) {
			// Check if saveData is enabled (user explicitly requested data saving)
			if (connection.saveData === true) {
				return true;
			}
			// Check if the connection is explicitly marked as metered
			// Note: This property may not be available on all platforms
			if (connection.metered === true) {
				return true;
			}
		}
	}
	// Default to false if the API is not available or connection is not metered
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
			if (connection.saveData === true || connection.metered === true) {
				return true;
			}
		}
	}
	return false;
})()
`;
