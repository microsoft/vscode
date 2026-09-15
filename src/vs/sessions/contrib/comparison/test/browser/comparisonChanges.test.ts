/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileOperationError, FileOperationResult, IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { ISession, ISessionFileChange, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { getComparisonChanges } from '../../browser/comparisonChanges.js';

suite('Comparison final file changes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const leftRoot = URI.file('/worktrees/left');
	const rightRoot = URI.file('/worktrees/right');
	const base = URI.from({ scheme: 'git', path: '/base/file.ts', query: 'base' });
	const left = URI.file('/worktrees/left/file.ts');
	const right = URI.file('/worktrees/right/file.ts');

	class TestFileService extends mock<IFileService>() {
		constructor(private readonly existing: URI[] = []) { super(); }
		override async resolve(resource: URI): Promise<IFileStatWithMetadata> {
			if (!this.existing.some(file => file.toString() === resource.toString())) {
				throw new FileOperationError('File not found', FileOperationResult.FILE_NOT_FOUND);
			}
			return upcastPartial<IFileStatWithMetadata>({ resource });
		}
	}

	function session(root: URI, changes: ISessionFileChange[]): ISession {
		return upcastPartial<ISession>({
			workspace: constObservable(upcastPartial<ISessionWorkspace>({
				folders: [{ root, workingDirectory: root, name: '', description: undefined }],
			})),
			changes: constObservable(changes),
		});
	}

	test('matches the same relative file across independent worktrees', async () => {
		const result = await getComparisonChanges(
			session(leftRoot, [{ uri: left, modifiedUri: left, originalUri: base, insertions: 2, deletions: 1 }]),
			session(rightRoot, [{ uri: right, modifiedUri: right, originalUri: base, insertions: 3, deletions: 1 }]), new TestFileService());
		assert.deepStrictEqual(result, [{ original: { resource: left }, modified: { resource: right } }]);
	});

	test('resolves the other final file when only one attempt edited it', async () => {
		assert.deepStrictEqual(await getComparisonChanges(
			session(leftRoot, []),
			session(rightRoot, [{ uri: right, modifiedUri: right, originalUri: base, insertions: 3, deletions: 1 }]), new TestFileService([left])),
		[{ original: { resource: left }, modified: { resource: right } }]);
	});

	test('represents a new file absent in the other implementation as an empty side', async () => {
		assert.deepStrictEqual(await getComparisonChanges(
			session(leftRoot, [{ uri: left, modifiedUri: left, insertions: 3, deletions: 0 }]),
			session(rightRoot, []), new TestFileService()),
		[{ original: { resource: left }, modified: { resource: undefined } }]);
	});

	test('does not substitute old code for an explicitly deleted final file', async () => {
		assert.deepStrictEqual(await getComparisonChanges(
			session(leftRoot, [{ uri: left, originalUri: base, insertions: 0, deletions: 3 }]),
			session(rightRoot, [{ uri: right, modifiedUri: right, originalUri: base, insertions: 1, deletions: 0 }]), new TestFileService()),
		[{ original: { resource: undefined }, modified: { resource: right } }]);
	});

	test('omits files deleted by both attempts', async () => {
		assert.deepStrictEqual(await getComparisonChanges(
			session(leftRoot, [{ uri: left, originalUri: base, insertions: 0, deletions: 3 }]),
			session(rightRoot, [{ uri: right, originalUri: base, insertions: 0, deletions: 3 }]), new TestFileService()), []);
	});

	test('supports providers exposing the original file-change shape', async () => {
		assert.deepStrictEqual(await getComparisonChanges(
			session(leftRoot, [{ modifiedUri: left, originalUri: base, insertions: 2, deletions: 1 }]),
			session(rightRoot, [{ modifiedUri: right, originalUri: base, insertions: 3, deletions: 1 }]), new TestFileService()),
		[{ original: { resource: left }, modified: { resource: right } }]);
	});

	test('rejects out-of-workspace changes instead of pairing unrelated paths', async () => {
		await assert.rejects(getComparisonChanges(
			session(leftRoot, [{ modifiedUri: URI.file('/outside/file.ts'), insertions: 1, deletions: 0 }]),
			session(rightRoot, []), new TestFileService()), /outside/);
	});

	test('a renamed file is not confused with its old path in the other attempt', async () => {
		const renamed = URI.joinPath(leftRoot, 'renamed.ts');
		assert.deepStrictEqual(await getComparisonChanges(
			session(leftRoot, [{ uri: renamed, modifiedUri: renamed, originalUri: base, insertions: 0, deletions: 0 }]),
			session(rightRoot, []), new TestFileService([right])),
		[{ original: { resource: renamed }, modified: { resource: undefined } }]);
	});

	test('a provider failure is not represented as a deleted file', async () => {
		const fileService = new class extends TestFileService {
			override async resolve(): Promise<IFileStatWithMetadata> {
				throw new FileOperationError('Permission denied', FileOperationResult.FILE_PERMISSION_DENIED);
			}
		};
		await assert.rejects(getComparisonChanges(
			session(leftRoot, [{ uri: left, modifiedUri: left, insertions: 3, deletions: 0 }]),
			session(rightRoot, []), fileService), /Permission denied/);
	});
});
