/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileSystemProviderCapabilities, type IFileAtomicOptions, type IFileService, type IWriteFileOptions } from '../../../files/common/files.js';
import type { VSBuffer } from '../../../../base/common/buffer.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import type { INativeEnvironmentService } from '../../../environment/common/environment.js';
import type { IShellInitSnippet } from '../../common/shellInitSnippets.js';
import { ShellInitScriptMaterializer, shellInitScriptDirectory } from '../../node/copilot/shellInitScriptMaterializer.js';

suite('ShellInitScriptMaterializer', () => {

	const disposables = new DisposableStore();
	const userDataPath = '/userData';
	let fileService: FileService;
	let materializer: ShellInitScriptMaterializer;

	setup(() => {
		fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		materializer = new ShellInitScriptMaterializer(
			{ userDataPath } as INativeEnvironmentService,
			fileService,
			new NullLogService(),
		);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function snippet(source: string, script: string, shell: IShellInitSnippet['shell'] = 'bash'): IShellInitSnippet {
		return { shell, script, source };
	}

	async function read(resource: URI): Promise<string> {
		return (await fileService.readFile(resource)).value.toString();
	}

	async function names(sessionId: string): Promise<string[]> {
		const stat = await fileService.resolve(materializer.directoryFor(sessionId));
		return (stat.children ?? []).map(child => child.name).sort();
	}

	test('writes snippets in order with shell-appropriate extensions', async () => {
		const refs = await materializer.materialize('s1', [
			snippet('user-profile', 'profile'),
			snippet('python-env', 'activate'),
			snippet('python-env', 'activate-ps', 'powershell'),
		]);
		const directory = materializer.directoryFor('s1');
		assert.deepStrictEqual(refs, [
			{ shell: 'bash', path: URI.joinPath(directory, '00-user-profile.sh').fsPath },
			{ shell: 'bash', path: URI.joinPath(directory, '01-python-env.sh').fsPath },
			{ shell: 'powershell', path: URI.joinPath(directory, '02-python-env.ps1').fsPath },
		]);
		assert.strictEqual(await read(URI.joinPath(directory, '00-user-profile.sh')), 'profile');
	});

	test('reuses the same path when only content changes', async () => {
		const first = await materializer.materialize('s1', [snippet('python-env', 'v1')]);
		const second = await materializer.materialize('s1', [snippet('python-env', 'v2')]);
		// A stable path is what lets a changed interpreter take effect without
		// pushing a new list to the SDK: the runtime re-reads before each command.
		assert.deepStrictEqual(first, second);
		assert.strictEqual(await read(URI.parse(`file://${second[0].path}`)), 'v2');
	});

	test('removes scripts a later materialization no longer produces', async () => {
		await materializer.materialize('s1', [snippet('user-profile', 'a'), snippet('python-env', 'b')]);
		assert.deepStrictEqual(await names('s1'), ['00-user-profile.sh', '01-python-env.sh']);
		await materializer.materialize('s1', [snippet('python-env', 'b')]);
		assert.deepStrictEqual(await names('s1'), ['00-python-env.sh']);
	});

	test('clears the directory when given no snippets', async () => {
		await materializer.materialize('s1', [snippet('python-env', 'a')]);
		assert.deepStrictEqual(await materializer.materialize('s1', []), []);
		assert.strictEqual(await fileService.exists(materializer.directoryFor('s1')), false);
	});

	test('keeps sessions isolated from one another', async () => {
		await materializer.materialize('s1', [snippet('python-env', 'one')]);
		await materializer.materialize('s2', [snippet('python-env', 'two')]);
		await materializer.clear('s1');
		assert.strictEqual(await fileService.exists(materializer.directoryFor('s1')), false);
		assert.strictEqual(await read(URI.joinPath(materializer.directoryFor('s2'), '00-python-env.sh')), 'two');
	});

	test('clearing an unmaterialized session is a no-op', async () => {
		await materializer.clear('never-written');
	});

	test('sanitizes session ids and sources into path-safe names', async () => {
		const refs = await materializer.materialize('../../evil', [snippet('../../etc/passwd', 'x')]);
		assert.strictEqual(refs.length, 1);
		assert.ok(refs[0].path.endsWith('00-etc-passwd.sh'), refs[0].path);
		assert.ok(!refs[0].path.includes('..'), refs[0].path);
	});

	test('agrees with the shared directory helper used by sandbox producers', () => {
		// A mismatch here would leave the SDK unable to read the scripts, and it
		// fails silently in that case.
		assert.strictEqual(materializer.directoryFor('s1').fsPath, shellInitScriptDirectory(userDataPath, 's1').fsPath);
	});

	test('requests an atomic write when the provider supports it, and degrades when it does not', async () => {
		// The runtime re-reads each script before every command, so a non-atomic
		// rewrite risks sourcing a half-written file. Requesting an atomic write
		// from a provider that lacks the capability throws, which would silently
		// drop every script, so the request must depend on the capability.
		const requested: Array<IFileAtomicOptions | false | undefined> = [];
		const fileService = {
			hasCapability: (_resource: URI, capability: FileSystemProviderCapabilities) => capability === FileSystemProviderCapabilities.FileAtomicWrite && atomicSupported,
			writeFile: async (_resource: URI, _buffer: VSBuffer, options?: IWriteFileOptions) => {
				requested.push(options?.atomic);
			},
			resolve: async () => ({ children: [] }),
			del: async () => { },
		} as unknown as IFileService;
		let atomicSupported = true;
		const stub = new ShellInitScriptMaterializer({ userDataPath } as INativeEnvironmentService, fileService, new NullLogService());
		await stub.materialize('s1', [snippet('python-env', 'a')]);
		atomicSupported = false;
		await stub.materialize('s1', [snippet('python-env', 'a')]);
		assert.deepStrictEqual(requested, [{ postfix: '.vsctmp' }, false]);
	});

	test('skips a snippet that cannot be written and keeps the rest', async () => {
		const failing = new (class extends FileService {
			override async writeFile(resource: URI, ...rest: Parameters<FileService['writeFile']> extends [URI, ...infer R] ? R : never): ReturnType<FileService['writeFile']> {
				if (resource.path.endsWith('00-user-profile.sh')) {
					throw new Error('disk full');
				}
				return super.writeFile(resource, ...rest);
			}
		})(new NullLogService());
		disposables.add(failing);
		disposables.add(failing.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const partial = new ShellInitScriptMaterializer({ userDataPath } as INativeEnvironmentService, failing, new NullLogService());
		const refs = await partial.materialize('s1', [snippet('user-profile', 'a'), snippet('python-env', 'b')]);
		assert.deepStrictEqual(refs.map(ref => ref.path.split('/').pop()), ['01-python-env.sh']);
	});
});
