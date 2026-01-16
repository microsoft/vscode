/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface NetworkInformation {
	saveData?: boolean;
	metered?: boolean;
	effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
}

interface NavigatorWithConnection {
	connection?: NetworkInformation;
}

/**
 * Checks if the current network connection is metered.
 * Uses the Network Information API when available.
 * @returns true if the connection is metered, false otherwise
 */
export function isMeteredConnection(): boolean {
	if (typeof navigator !== 'undefined') {
		const nav = navigator as unknown as NavigatorWithConnection;
		const connection = nav.connection;
		if (connection) {
			// Check if saveData is enabled (user explicitly requested data saving)
			if (connection.saveData === true) {
				return true;
			}
			// Check if the connection is explicitly marked as metered
			if (connection.metered === true) {
				return true;
			}
			// Check effectiveType for cellular connections (2g, 3g, slow-2g)
			// 4g is generally not considered metered as it's often similar to broadband speeds
			const effectiveType = connection.effectiveType;
			if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
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
			const effectiveType = connection.effectiveType;
			if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
				return true;
			}
		}
	}
	return false;
})()
`;
