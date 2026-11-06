/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { DisposableStore } from '../../vs/base/common/lifecycle';
import { throwIfDisposablesAreLeaked, throwIfDisposablesAreLeakedAsync } from './testUtils';

describe('testUtils', () => {
	describe('throwIfDisposablesAreLeaked', () => {
		it('should not throw when no disposables are leaked', () => {
			expect(() => {
				throwIfDisposablesAreLeaked(() => {
					// Create and properly dispose a disposable
					const store = new DisposableStore();
					store.add({ dispose: () => { } });
					store.dispose();
				});
			}).not.toThrow();
		});

		it('should throw when disposables are leaked', () => {
			// suppress the console.error when it expectedly fails
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
			try {
				expect(() => {
					throwIfDisposablesAreLeaked(() => {
						// Create a disposable but don't dispose it
						const store = new DisposableStore();
						store.add({ dispose: () => { } });
						// Don't call store.dispose()
					});
				}).toThrow(/There are \d+ undisposed disposables!/);
			} finally {
				consoleSpy.mockRestore();
			}
		});
	});

	describe('throwIfDisposablesAreLeakedAsync', () => {
		it('should not throw when no disposables are leaked in async context', async () => {
			await expect(
				throwIfDisposablesAreLeakedAsync(async () => {
					const store = new DisposableStore();
					store.add({ dispose: () => { } });
					store.dispose();
				})
			).resolves.not.toThrow();
		});

		it('should throw when disposables are leaked in async context', async () => {
			// suppress the console.error when it expectedly fails
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
			try {
				await expect(
					throwIfDisposablesAreLeakedAsync(async () => {
						const store = new DisposableStore();
						store.add({ dispose: () => { } });
						// Don't dispose
					})
				).rejects.toThrow(/There are \d+ undisposed disposables!/);
			} finally {
				consoleSpy.mockRestore();
			}
		});

		it('should work with async operations', async () => {
			await expect(
				throwIfDisposablesAreLeakedAsync(async () => {
					const store = new DisposableStore();
					store.add({ dispose: () => { } });

					// Simulate async work
					await new Promise(resolve => setTimeout(resolve, 1));

					store.dispose();
				})
			).resolves.not.toThrow();
		});
	});
});