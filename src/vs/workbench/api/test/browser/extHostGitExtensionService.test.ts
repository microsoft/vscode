/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostGitExtensionService } from '../../common/extHostGitExtensionService.js';
import { IExtHostExtensionService } from '../../common/extHostExtensionService.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import type { MainThreadGitExtensionShape } from '../../common/extHost.protocol.js';

suite('ExtHostGitExtensionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const rootUri = URI.file('/repo');
	const customizationFile = URI.file('/repo/.github/instructions/a.instructions.md');
	const skillFolder = URI.file('/repo/.github/skills/my-skill');

	interface IFakeRepositoryOptions {
		readonly stagedPaths?: readonly string[];
		readonly addError?: unknown;
		readonly commitError?: unknown;
	}

	async function commitFiles(files: readonly URI[], options: IFakeRepositoryOptions = {}): Promise<{ calls: string[]; error: string | undefined }> {
		const calls: string[] = [];
		const repository = {
			rootUri,
			state: {
				HEAD: undefined,
				remotes: [],
				mergeChanges: [],
				indexChanges: (options.stagedPaths ?? []).map(path => ({ uri: URI.file(path), originalUri: URI.file(path), renameUri: undefined, status: 0 })),
				workingTreeChanges: [],
				untrackedChanges: [],
				onDidChange: Event.None,
			},
			async status() { calls.push('status'); },
			async add(paths: string[]) {
				calls.push(`add ${paths.join(',')}`);
				if (options.addError) {
					throw options.addError;
				}
			},
			async commit(message: string, opts?: { noVerify?: boolean; signCommit?: boolean }) {
				calls.push(`commit ${message} ${JSON.stringify(opts)}`);
				if (options.commitError) {
					throw options.commitError;
				}
			},
		};

		const service = disposables.add(new ExtHostGitExtensionService(
			new class extends mock<IExtHostRpcService>() {
				override getProxy<T>(): T {
					return new class extends mock<MainThreadGitExtensionShape>() { } as T;
				}
			},
			upcastPartial<IExtHostExtensionService>({
				activateByIdWithErrors: async () => { },
				getExtensionExports: () => ({ getAPI: () => ({ openRepository: async () => repository }) }) as unknown as ReturnType<IExtHostExtensionService['getExtensionExports']>,
			}),
		));

		const opened = await service.$openRepository(rootUri);
		let error: string | undefined;
		try {
			await service.$commitFiles(opened!.handle, [...files], 'Update customization', { noVerify: true, signCommit: false });
		} catch (e) {
			error = (e as Error).message;
		}
		return { calls, error };
	}

	test('stages the requested files and commits them', async () => {
		const result = await commitFiles([customizationFile]);

		assert.deepStrictEqual(result, {
			calls: [
				'status',
				`add ${customizationFile.fsPath}`,
				'commit Update customization {"noVerify":true,"signCommit":false}',
			],
			error: undefined,
		});
	});

	test('does nothing when no files are provided', async () => {
		assert.deepStrictEqual(await commitFiles([]), { calls: [], error: undefined });
	});

	test('refuses to commit when other files are already staged', async () => {
		const result = await commitFiles([customizationFile], { stagedPaths: ['/repo/src/unrelated.ts'] });

		assert.deepStrictEqual(result, {
			calls: ['status'],
			error: 'Cannot commit: 1 staged change(s) in the index are not part of the requested files.',
		});
	});

	test('allows staged changes that are part of the requested files', async () => {
		const result = await commitFiles([customizationFile, skillFolder], {
			stagedPaths: [customizationFile.path, '/repo/.github/skills/my-skill/SKILL.md'],
		});

		assert.deepStrictEqual(result.calls.map(call => call.split(' ')[0]), ['status', 'add', 'commit']);
		assert.strictEqual(result.error, undefined);
	});

	test('treats nothing to commit and untracked missing paths as no-ops', async () => {
		const nothingToCommit = await commitFiles([customizationFile], { commitError: Object.assign(new Error('failed'), { gitErrorCode: 'NoLocalChanges' }) });
		const missingPath = await commitFiles([customizationFile], { addError: Object.assign(new Error('failed'), { stderr: `fatal: pathspec '${customizationFile.fsPath}' did not match any files` }) });

		assert.deepStrictEqual({
			nothingToCommit: nothingToCommit.error,
			missingPathError: missingPath.error,
			missingPathCommitted: missingPath.calls.some(call => call.startsWith('commit')),
		}, {
			nothingToCommit: undefined,
			missingPathError: undefined,
			missingPathCommitted: false,
		});
	});

	test('rethrows other git failures', async () => {
		const result = await commitFiles([customizationFile], { commitError: new Error('index.lock exists') });

		assert.strictEqual(result.error, 'index.lock exists');
	});
});
