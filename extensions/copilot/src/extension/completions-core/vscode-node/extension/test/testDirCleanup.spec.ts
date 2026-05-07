/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs/promises', () => ({
	rm: vi.fn(),
}));

import * as fsPromises from 'fs/promises';
import { cleanupTestDirectory } from './testDirCleanup';

describe('cleanupTestDirectory', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('calls fs.rm with retry options', async () => {
		vi.mocked(fsPromises.rm).mockResolvedValue(undefined);

		await cleanupTestDirectory('/tmp/copilot-extension-test');

		expect(fsPromises.rm).toHaveBeenCalledWith('/tmp/copilot-extension-test', {
			recursive: true,
			force: true,
			maxRetries: 10,
			retryDelay: 200,
		});
	});

	it('logs and suppresses cleanup errors', async () => {
		const error = new Error('EBUSY');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(fsPromises.rm).mockRejectedValue(error);

		await cleanupTestDirectory('/tmp/copilot-extension-test');

		expect(warn).toHaveBeenCalledWith(
			'Failed to clean up temporary test directory /tmp/copilot-extension-test',
			error,
		);
	});
});
