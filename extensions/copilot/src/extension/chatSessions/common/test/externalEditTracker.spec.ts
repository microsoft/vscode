/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { SpyChatResponseStream } from '../../../../util/common/test/mockChatResponseStream';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../util/vs/base/common/uri';
import { ExternalEditTracker } from '../externalEditTracker';

describe('ExternalEditTracker', () => {
	describe('ignore directories', () => {
		it('should filter out files in ignored directories', async () => {
			const userHome = URI.file('/home/user');
			const planDir = URI.joinPath(userHome, '.claude', 'plans');
			const tracker = new ExternalEditTracker([planDir]);

			const planFile = URI.joinPath(userHome, '.claude', 'plans', 'test-plan.md');
			const regularFile = URI.file('/workspace/src/test.ts');
			const stream = new SpyChatResponseStream();

			await tracker.trackEdit('edit-1', [planFile, regularFile], stream, CancellationToken.None);

			// Only the regular file should be tracked
			expect(stream.externalEditUris.length).toBe(1);
			expect(stream.externalEditUris[0].toString()).toBe(regularFile.toString());
		});

		it('should not filter files from other .claude subdirectories', async () => {
			const userHome = URI.file('/home/user');
			const planDir = URI.joinPath(userHome, '.claude', 'plans');
			const tracker = new ExternalEditTracker([planDir]);

			const agentFile = URI.joinPath(userHome, '.claude', 'agents', 'my-agent.md');
			const memoryFile = URI.joinPath(userHome, '.claude', 'CLAUDE.md');
			const stream = new SpyChatResponseStream();

			await tracker.trackEdit('edit-2', [agentFile, memoryFile], stream, CancellationToken.None);

			// Both files should be tracked
			expect(stream.externalEditUris.length).toBe(2);
		});

		it('should handle multiple ignored directories', async () => {
			const userHome = URI.file('/home/user');
			const planDir = URI.joinPath(userHome, '.claude', 'plans');
			const tempDir = URI.file('/tmp/claude-temp');
			const tracker = new ExternalEditTracker([planDir, tempDir]);

			const planFile = URI.joinPath(userHome, '.claude', 'plans', 'plan.md');
			const tempFile = URI.joinPath(tempDir, 'temp.txt');
			const regularFile = URI.file('/workspace/src/test.ts');
			const stream = new SpyChatResponseStream();

			await tracker.trackEdit('edit-3', [planFile, tempFile, regularFile], stream, CancellationToken.None);

			// Only the regular file should be tracked
			expect(stream.externalEditUris.length).toBe(1);
			expect(stream.externalEditUris[0].toString()).toBe(regularFile.toString());
		});

		it('should handle nested files in ignored directories', async () => {
			const userHome = URI.file('/home/user');
			const planDir = URI.joinPath(userHome, '.claude', 'plans');
			const tracker = new ExternalEditTracker([planDir]);

			const nestedPlanFile = URI.joinPath(userHome, '.claude', 'plans', 'subfolder', 'nested-plan.md');
			const regularFile = URI.file('/workspace/src/test.ts');
			const stream = new SpyChatResponseStream();

			await tracker.trackEdit('edit-4', [nestedPlanFile, regularFile], stream, CancellationToken.None);

			// Only the regular file should be tracked
			expect(stream.externalEditUris.length).toBe(1);
			expect(stream.externalEditUris[0].toString()).toBe(regularFile.toString());
		});

		it('should not filter files with similar prefix outside ignored directory', async () => {
			const userHome = URI.file('/home/user');
			const planDir = URI.joinPath(userHome, '.claude', 'plans');
			const tracker = new ExternalEditTracker([planDir]);

			const similarFile = URI.joinPath(userHome, '.claude', 'plans-backup', 'file.md');
			const regularFile = URI.file('/workspace/src/test.ts');
			const stream = new SpyChatResponseStream();

			await tracker.trackEdit('edit-5', [similarFile, regularFile], stream, CancellationToken.None);

			// Both should be tracked because plans-backup is not the plans directory
			expect(stream.externalEditUris.length).toBe(2);
		});

		it('should work when no ignore directories are provided', async () => {
			const tracker = new ExternalEditTracker();
			const file1 = URI.file('/workspace/src/file1.ts');
			const file2 = URI.file('/workspace/src/file2.ts');
			const stream = new SpyChatResponseStream();

			await tracker.trackEdit('edit-6', [file1, file2], stream, CancellationToken.None);

			// All files should be tracked
			expect(stream.externalEditUris.length).toBe(2);
		});

		it('should not call externalEdit when all files are filtered', async () => {
			const userHome = URI.file('/home/user');
			const planDir = URI.joinPath(userHome, '.claude', 'plans');
			const tracker = new ExternalEditTracker([planDir]);

			const planFile1 = URI.joinPath(userHome, '.claude', 'plans', 'plan1.md');
			const planFile2 = URI.joinPath(userHome, '.claude', 'plans', 'plan2.md');
			const stream = new SpyChatResponseStream();

			await tracker.trackEdit('edit-7', [planFile1, planFile2], stream, CancellationToken.None);

			// No files should be tracked
			expect(stream.externalEditUris.length).toBe(0);
		});
	});

	describe('acknowledgment handling', () => {
		// Stream whose externalEdit records the edit but never invokes the proceed callback and
		// never resolves — reproducing core dropping the externalEdit acknowledgment (#320292).
		class SilentExternalEditStream extends SpyChatResponseStream {
			override externalEdit(): Promise<string> {
				return new Promise<string>(() => { /* never resolves, callback never invoked */ });
			}
		}

		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('proceeds after the timeout when core never acknowledges the edit', async () => {
			const tracker = new ExternalEditTracker([], 1000);
			const stream = new SilentExternalEditStream();
			const file = URI.file('/workspace/src/test.ts');

			let resolved = false;
			const tracking = tracker.trackEdit('edit-timeout', [file], stream, CancellationToken.None).then(() => { resolved = true; });

			// Before the timeout elapses the edit is still pending.
			await vi.advanceTimersByTimeAsync(999);
			expect(resolved).toBe(false);

			// Once the timeout elapses the permission is allowed to proceed anyway.
			await vi.advanceTimersByTimeAsync(1);
			await tracking;
			expect(resolved).toBe(true);
		});

		it('proceeds immediately when the request is cancelled while awaiting acknowledgment', async () => {
			const tracker = new ExternalEditTracker([], 1000);
			const stream = new SilentExternalEditStream();
			const file = URI.file('/workspace/src/test.ts');
			const tokenSource = new CancellationTokenSource();

			let resolved = false;
			const tracking = tracker.trackEdit('edit-cancel', [file], stream, tokenSource.token).then(() => { resolved = true; });

			tokenSource.cancel();
			await tracking;
			expect(resolved).toBe(true);
			tokenSource.dispose();
		});

		it('completeEdit resolves even when core never acknowledges the edit', async () => {
			const tracker = new ExternalEditTracker([], 1000);
			const stream = new SilentExternalEditStream();
			const file = URI.file('/workspace/src/test.ts');

			// Start tracking and let the timeout release the permission response.
			const tracking = tracker.trackEdit('edit-complete', [file], stream, CancellationToken.None);
			await vi.advanceTimersByTimeAsync(1000);
			await tracking;

			// Finalizing the request must not hang on the missing acknowledgment.
			const completion = tracker.completeEdit('edit-complete');
			await vi.advanceTimersByTimeAsync(1000);
			await expect(completion).resolves.toBeUndefined();
		});

		it('cancellation after acknowledgment still finishes the tracked edit', async () => {
			// Stream that acknowledges the edit immediately (invokes the proceed callback) and then
			// keeps the edit open until the tracked deferred resolves — mirroring core keeping the
			// edit in progress until completeEdit. `callbackResolved` flips only once the deferred is
			// completed, so it proves cancellation released the edit rather than leaking it.
			class AckThenWaitStream extends SpyChatResponseStream {
				callbackResolved = false;
				override async externalEdit(_target: vscode.Uri | vscode.Uri[], callback: () => Thenable<unknown>): Promise<string> {
					await callback();
					this.callbackResolved = true;
					return 'done';
				}
			}

			const tracker = new ExternalEditTracker([], 1000);
			const stream = new AckThenWaitStream();
			const file = URI.file('/workspace/src/test.ts');
			const tokenSource = new CancellationTokenSource();

			// Core acknowledges immediately, so the permission gate resolves without the timeout.
			await tracker.trackEdit('edit-cancel-after-ack', [file], stream, tokenSource.token);
			expect(stream.callbackResolved).toBe(false); // edit still open, awaiting completion

			// Cancelling after acknowledgment but before completeEdit must finish the edit, not leak
			// the map entry and the pending proceed callback (regression for the disposed-listener bug).
			tokenSource.cancel();
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}
			expect(stream.callbackResolved).toBe(true);

			tokenSource.dispose();
		});
	});
});
