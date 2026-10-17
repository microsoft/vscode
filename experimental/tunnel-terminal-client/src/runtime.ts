/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function ensureSupportedRuntime(version = process.versions.node): void {
	const major = version.split('.')[0];
	if (major !== '22' && major !== '24') {
		throw new Error(
			`This prototype supports Node.js 22.x and 24.x; you are running ${version}. `
			+ 'Use the latest maintenance release of either supported version.',
		);
	}
}
