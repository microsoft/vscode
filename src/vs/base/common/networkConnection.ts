/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
