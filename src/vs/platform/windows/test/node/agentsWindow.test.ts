/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { NativeParsedArgs } from '../../../environment/common/argv.js';
import { FileType } from '../../../files/common/files.js';
import type { IPath } from '../../../window/common/window.js';
import type { IEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../../workspace/common/workspace.js';
import { resolveAgentsWindowFolder } from '../../node/agentsWindow.js';

suite('Agents window CLI folder handoff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const firstFolder: ISingleFolderWorkspaceIdentifier = { id: 'first-folder', uri: URI.file('/projects/first') };
	const secondFolder: ISingleFolderWorkspaceIdentifier = { id: 'second-folder', uri: URI.file('/projects/second') };
	const workspace: IWorkspaceIdentifier = { id: 'workspace', configPath: URI.file('/projects/example.code-workspace') };
	const emptyWorkspace: IEmptyWorkspaceIdentifier = { id: 'empty' };
	const file: IPath = { fileUri: URI.file('/projects/file.txt'), exists: true, type: FileType.File };
	const sessionResource = URI.parse('test-session://copilot/existing');

	for (const { name, cli } of [
		{ name: 'positional folder', cli: { _: [firstFolder.uri.fsPath], agents: true } },
		{ name: '--folder-uri', cli: { _: [], agents: true, 'folder-uri': [firstFolder.uri.toString()] } }
	]) {
		test(`passes ${name} arguments unchanged to the CLI resolver`, async () => {
			const resolvedArguments: NativeParsedArgs[] = [];

			const folderUri = await resolveAgentsWindowFolder(cli, undefined, undefined, async args => {
				resolvedArguments.push(args);
				return [{ workspace: firstFolder }];
			});

			assert.deepStrictEqual({ folderUri, resolvedArguments }, {
				folderUri: firstFolder.uri,
				resolvedArguments: [cli]
			});
		});
	}

	for (const agents of [undefined, false]) {
		test(`does not inspect CLI paths or resolve folders when agents is ${agents}`, async () => {
			const cli: NativeParsedArgs = {
				agents,
				get _(): string[] {
					return assert.fail('Positional paths must not be read without --agents');
				},
				get 'folder-uri'(): string[] {
					return assert.fail('Folder URIs must not be read without --agents');
				}
			};

			const folderUri = await resolveAgentsWindowFolder(cli, undefined, undefined, async () => {
				assert.fail('CLI resolution must stay lazy without --agents');
			});

			assert.strictEqual(folderUri, undefined);
		});
	}

	for (const { name, folder, session } of [
		{ name: 'an explicit folder', folder: secondFolder.uri, session: undefined },
		{ name: 'an existing session', folder: undefined, session: sessionResource },
		{ name: 'an explicit folder and existing session', folder: secondFolder.uri, session: sessionResource }
	]) {
		test(`gives ${name} precedence without invoking the CLI resolver`, async () => {
			const cli: NativeParsedArgs = { _: [firstFolder.uri.fsPath], agents: true, 'folder-uri': [firstFolder.uri.toString()] };

			const folderUri = await resolveAgentsWindowFolder(cli, folder, session, async () => {
				assert.fail('Explicit folder and session arguments must bypass CLI resolution');
			});

			assert.deepStrictEqual(folderUri, folder);
		});
	}

	test('leaves an empty --agents CLI empty instead of restoring a folder', async () => {
		const cli: NativeParsedArgs = { _: [], agents: true };
		let resolveCalls = 0;

		const folderUri = await resolveAgentsWindowFolder(cli, undefined, undefined, async () => {
			resolveCalls++;
			return [];
		});

		assert.deepStrictEqual({ folderUri, resolveCalls }, { folderUri: undefined, resolveCalls: 1 });
	});

	for (const { name, paths } of [
		{ name: 'a file', paths: [file] },
		{ name: 'a multi-root workspace', paths: [{ workspace }] },
		{ name: 'an empty workspace', paths: [{ workspace: emptyWorkspace }] },
		{ name: 'an empty path', paths: [{}] }
	]) {
		test(`does not mistake ${name} for a folder`, async () => {
			const folderUri = await resolveAgentsWindowFolder({ _: [], agents: true }, undefined, undefined, async () => paths);

			assert.strictEqual(folderUri, undefined);
		});
	}

	test('selects the first actual folder after files and non-folder workspaces', async () => {
		const cli: NativeParsedArgs = { _: [firstFolder.uri.fsPath, secondFolder.uri.fsPath], agents: true };
		let resolveCalls = 0;

		const folderUri = await resolveAgentsWindowFolder(cli, undefined, undefined, async () => {
			resolveCalls++;
			return [
				file,
				{ workspace },
				{ workspace: emptyWorkspace },
				{ workspace: firstFolder },
				{ workspace: secondFolder }
			];
		});

		assert.deepStrictEqual({ folderUri, resolveCalls }, { folderUri: firstFolder.uri, resolveCalls: 1 });
	});

	test('waits for asynchronous CLI resolution', async () => {
		const resolvedWorkspace = new DeferredPromise<ISingleFolderWorkspaceIdentifier>();
		const folderUri = resolveAgentsWindowFolder({ _: [], agents: true }, undefined, undefined, async () => [
			{ workspace: await resolvedWorkspace.p }
		]);

		await resolvedWorkspace.complete(firstFolder);

		assert.deepStrictEqual(await folderUri, firstFolder.uri);
	});

	test('propagates CLI resolution errors without falling back to another folder', async () => {
		const error = new Error('CLI resolution failed');

		await assert.rejects(resolveAgentsWindowFolder({ _: [], agents: true }, undefined, undefined, async () => {
			throw error;
		}), error);
	});
});
