/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

/** Requires a specific known failure; unexpected passes and other failures remain test failures. */
export async function assertExpectedFailure(issue: string, expectedError: RegExp, run: () => void | Promise<void>): Promise<void> {
	try {
		await run();
	} catch (error) {
		if (!(error instanceof Error) || error.message.search(expectedError) === -1) {
			throw error;
		}
		process.stdout.write(`[expected failure] ${issue}: ${error.message}\n`);
		return;
	}
	assert.fail(`Unexpected pass for ${issue}. Remove the expected-failure marker and keep the desired-behavior assertions.`);
}
