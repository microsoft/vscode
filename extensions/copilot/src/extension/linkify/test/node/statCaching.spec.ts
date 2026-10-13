/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { NullEnvService } from '../../../../platform/env/common/nullEnvService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { LinkifyLocationAnchor } from '../../common/linkifiedText';
import { LinkifyService } from '../../common/linkifyService';
import { assertPartsEqual, createMockFsService, createMockWorkspaceService, workspaceFile } from './util';

function createCountingFsService(listOfFiles: readonly string[]): { fs: IFileSystemService; statCallCount: () => number } {
	const inner = createMockFsService(listOfFiles);
	let callCount = 0;
	const fs: IFileSystemService = {
		...inner,
		stat(uri) {
			callCount++;
			return inner.stat(uri);
		},
	};
	return { fs, statCallCount: () => callCount };
}

suite('Stat Caching - FilePathLinkifier', () => {

	test('Should cache stat calls for repeated file paths', async () => {
		const { fs, statCallCount } = createCountingFsService(['file.ts']);
		const workspaceService = createMockWorkspaceService();
		const service = new LinkifyService(fs, workspaceService, NullEnvService.Instance);

		const linkifier = service.createLinkifier({ requestId: undefined, references: [] }, []);

		// First append: linkify `file.ts`
		const r1 = await linkifier.append('`file.ts` ', CancellationToken.None);
		const countAfterFirst = statCallCount();

		// Second append: linkify `file.ts` again — should reuse cached stat
		const r2 = await linkifier.append('`file.ts` ', CancellationToken.None);
		const countAfterSecond = statCallCount();

		// Both should produce file links
		assertPartsEqual(r1.parts, [new LinkifyLocationAnchor(workspaceFile('file.ts')), ' ']);
		assertPartsEqual(r2.parts, [new LinkifyLocationAnchor(workspaceFile('file.ts')), ' ']);

		// The second call should not have increased the stat count
		expect(countAfterSecond).toBe(countAfterFirst);
	});

	test('Should cache stat calls across different matches in same text', async () => {
		const { fs, statCallCount } = createCountingFsService(['file.ts']);
		const workspaceService = createMockWorkspaceService();
		const service = new LinkifyService(fs, workspaceService, NullEnvService.Instance);

		const linkifier = service.createLinkifier({ requestId: undefined, references: [] }, []);

		// Two references to the same file in one chunk
		await linkifier.append('`file.ts` and file.ts ', CancellationToken.None);
		await linkifier.flush(CancellationToken.None);

		// The stat should be cached, so only 1 stat call for the same URI
		expect(statCallCount()).toBe(1);
	});

	test('Should not cache across different URIs', async () => {
		const { fs, statCallCount } = createCountingFsService(['file.ts', 'other.ts']);
		const workspaceService = createMockWorkspaceService();
		const service = new LinkifyService(fs, workspaceService, NullEnvService.Instance);

		const linkifier = service.createLinkifier({ requestId: undefined, references: [] }, []);

		await linkifier.append('`file.ts` ', CancellationToken.None);
		const countAfterFirst = statCallCount();

		await linkifier.append('`other.ts` ', CancellationToken.None);
		const countAfterSecond = statCallCount();

		// Different files should each get their own stat call
		expect(countAfterSecond).toBeGreaterThan(countAfterFirst);
	});
});

suite('Stat Caching - ModelFilePathLinkifier', () => {

	test('Should cache stat calls for repeated model file links', async () => {
		const { fs, statCallCount } = createCountingFsService(['src/file.ts']);
		const workspaceService = createMockWorkspaceService();
		const service = new LinkifyService(fs, workspaceService, NullEnvService.Instance);

		const linkifier = service.createLinkifier({ requestId: undefined, references: [] }, []);

		// First link
		await linkifier.append('[src/file.ts](src/file.ts) ', CancellationToken.None);
		const countAfterFirst = statCallCount();

		// Same link again — should reuse cache
		await linkifier.append('[src/file.ts](src/file.ts) ', CancellationToken.None);
		const countAfterSecond = statCallCount();

		// Second should not add more stat calls
		expect(countAfterSecond).toBe(countAfterFirst);
	});
});

suite('Stat Caching - Shared across linkifiers', () => {

	test('Should share stat cache between ModelFilePathLinkifier and FilePathLinkifier', async () => {
		const { fs, statCallCount } = createCountingFsService(['src/file.ts']);
		const workspaceService = createMockWorkspaceService();
		const service = new LinkifyService(fs, workspaceService, NullEnvService.Instance);

		const linkifier = service.createLinkifier({ requestId: undefined, references: [] }, []);

		// ModelFilePathLinkifier processes this markdown link first
		await linkifier.append('[src/file.ts](src/file.ts) ', CancellationToken.None);
		const countAfterModel = statCallCount();

		// FilePathLinkifier processes same path as inline code — should reuse shared cache
		await linkifier.append('`src/file.ts` ', CancellationToken.None);
		const countAfterFile = statCallCount();

		// The shared cache should prevent additional stat calls
		expect(countAfterFile).toBe(countAfterModel);
	});
});
