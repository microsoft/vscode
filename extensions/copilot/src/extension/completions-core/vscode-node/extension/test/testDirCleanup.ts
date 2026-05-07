/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { rm } from 'fs/promises';

export async function cleanupTestDirectory(dir: string): Promise<void> {
	try {
		await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	} catch (error) {
		console.warn(`Failed to clean up temporary test directory ${dir}`, error);
	}
}
