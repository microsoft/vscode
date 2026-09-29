/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { SpyChatResponseStream } from '../../../../util/common/test/mockChatResponseStream';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
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
});
