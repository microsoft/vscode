/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { ToolResultObject } from '@github/copilot-sdk';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileSystemProviderCapabilities } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_CLIENT_SCHEME, toAgentClientUri } from '../../common/agentClientUri.js';
import { createCopilotVirtualSearchTools } from '../../node/copilot/copilotVirtualSearchTools.js';
import { CopilotVirtualSessionFs, createCopilotVirtualSessionFsConfig } from '../../node/copilot/copilotVirtualSessionFs.js';
import { CopilotWorkspace, copilotSdkPathToUri, createCopilotSessionPathMapper, createCopilotSdkPathMapper, resolveCopilotSdkPath, toCopilotWorkspace } from '../../node/copilot/copilotWorkspace.js';

class RecordingFileSystemProvider extends InMemoryFileSystemProvider {
	readonly reads: string[] = [];

	override get capabilities(): FileSystemProviderCapabilities {
		return super.capabilities & ~FileSystemProviderCapabilities.FileAppend;
	}

	override async readFile(resource: URI): Promise<Uint8Array> {
		this.reads.push(resource.toString());
		return super.readFile(resource);
	}
}

suite('Copilot virtual workspace', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace: Extract<CopilotWorkspace, { kind: 'virtual' }> = { kind: 'virtual', root: URI.parse('vscode-vfs://github/microsoft/vscode') };
	const stateDirectory = URI.file('/session-state-real');
	const statePath = '/session-state';
	let files: FileService;
	let clientFiles: RecordingFileSystemProvider;
	let clientId: string | undefined;
	let fs: CopilotVirtualSessionFs;

	setup(() => {
		files = store.add(new FileService(store.add(new NullLogService())));
		clientFiles = store.add(new RecordingFileSystemProvider());
		store.add(files.registerProvider(AGENT_CLIENT_SCHEME, clientFiles));
		store.add(files.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		clientId = 'client-1';
		fs = new CopilotVirtualSessionFs(workspace, statePath, stateDirectory, () => clientId, files);
	});

	test('maps local and virtual SDK paths without changing bridge encoding', () => {
		const local = URI.file('/workspace/a.ts');
		const localMapper = createCopilotSdkPathMapper(toCopilotWorkspace(local));
		const roots = [workspace.root, URI.parse('inmemory:/repo'), URI.parse('vscode-vfs://github/repo?ref=main'), URI.parse('inmemory:/')];
		assert.deepStrictEqual({
			localKind: toCopilotWorkspace(local).kind,
			local: localMapper.toUri(localMapper.toSdkPath(local)).toString(),
			localPath: localMapper.toSdkPath(local),
			virtual: roots.map(root => {
				const mapper = createCopilotSdkPathMapper(toCopilotWorkspace(root));
				const file = URI.joinPath(root, 'src/a #%.ts');
				return [mapper.rootSdkPath, mapper.toSdkPath(file), mapper.toUri(mapper.toSdkPath(file)).toString(), toAgentClientUri(file, 'client-1').path];
			}),
		}, {
			localKind: 'local',
			local: local.toString(),
			localPath: local.fsPath,
			virtual: [
				['/vscode-vfs/github/microsoft/vscode', '/vscode-vfs/github/microsoft/vscode/src/a #%.ts', URI.joinPath(roots[0], 'src/a #%.ts').toString(), '/vscode-vfs/github/microsoft/vscode/src/a #%.ts'],
				['/inmemory/-/repo', '/inmemory/-/repo/src/a #%.ts', URI.joinPath(roots[1], 'src/a #%.ts').toString(), '/inmemory/-/repo/src/a #%.ts'],
				['/vscode-vfs/github/repo', '/vscode-vfs/github/repo/src/a #%.ts', URI.joinPath(roots[2], 'src/a #%.ts').toString(), '/vscode-vfs/github/repo/src/a #%.ts'],
				['/inmemory/-', '/inmemory/-/src/a #%.ts', URI.joinPath(roots[3], 'src/a #%.ts').toString(), '/inmemory/-/src/a #%.ts'],
			],
		});
	});

	test('maps virtual session-state paths to durable host files without weakening the workspace boundary', () => {
		const mapper = createCopilotSessionPathMapper(workspace, stateDirectory);
		const plan = URI.joinPath(stateDirectory, 'plan.md');
		assert.deepStrictEqual({
			workspace: mapper.toUri(resolveCopilotSdkPath(mapper, 'src/a.ts')).toString(),
			state: mapper.toUri('/session-state/plan.md').toString(),
			statePath: mapper.toSdkPath(plan),
			spill: copilotSdkPathToUri(mapper, '/host/spill.txt').toString(),
		}, {
			workspace: 'vscode-vfs://github/microsoft/vscode/src/a.ts',
			state: plan.toString(),
			statePath: '/session-state/plan.md',
			spill: URI.file('/host/spill.txt').toString(),
		});
		assert.throws(() => mapper.toUri('/outside/a.ts'));
	});

	test('rejects paths outside the virtual root and overlapping state paths', () => {
		for (const path of ['src/a.ts', '/etc/passwd', `${fs.pathMapper.rootSdkPath}-other/a.ts`, `${fs.pathMapper.rootSdkPath}/../private/a.ts`]) {
			assert.throws(() => fs.pathMapper.toUri(path));
		}
		assert.throws(() => fs.pathMapper.toSdkPath(URI.parse('vscode-vfs://other/microsoft/vscode/a.ts')));
		assert.throws(() => createCopilotVirtualSessionFsConfig(workspace, fs.pathMapper.rootSdkPath));
	});

	test('routes workspace and session state IO separately, including bytes and concurrent appends', async () => {
		const root = fs.pathMapper.rootSdkPath;
		await fs.writeFile(`${root}/src/a.ts`, 'virtual');
		await fs.appendFile(`${root}/src/a.ts`, ' text');
		await Promise.all(['one', 'two', 'three'].map(value => fs.appendFile(`${statePath}/events.jsonl`, value)));
		await fs.writeFileBytes(`${root}/src/image.bin`, new Uint8Array([0, 255, 1]));
		await fs.rename(`${root}/src/a.ts`, `${root}/src/b.ts`);
		await fs.mkdir(`${root}/empty`, true);
		await fs.rm(`${root}/empty`, false, false);
		await fs.rm(`${root}/missing`, false, true);
		const stat = await fs.stat(`${root}/src/b.ts`);
		assert.deepStrictEqual({
			workspace: (await files.readFile(toAgentClientUri(URI.joinPath(workspace.root, 'src/b.ts'), 'client-1'))).value.toString(),
			state: (await files.readFile(URI.joinPath(stateDirectory, 'events.jsonl'))).value.toString(),
			bytes: [...await fs.readFileBytes(`${root}/src/image.bin`)],
			entries: (await fs.readdirWithTypes(`${root}/src`)).sort((a, b) => a.name.localeCompare(b.name)),
			exists: await fs.exists(`${root}/src/a.ts`),
			stat: { isFile: stat.isFile, isDirectory: stat.isDirectory, size: stat.size },
		}, {
			workspace: 'virtual text',
			state: 'onetwothree',
			bytes: [0, 255, 1],
			entries: [{ name: 'b.ts', type: 'file' }, { name: 'image.bin', type: 'file' }],
			exists: false,
			stat: { isFile: true, isDirectory: false, size: 12 },
		});
	});

	test('uses the active client per call and keeps state available while disconnected', async () => {
		const path = `${fs.pathMapper.rootSdkPath}/a.ts`;
		await fs.writeFile(path, 'content');
		await fs.readFile(path);
		clientId = 'client-2';
		await fs.readFile(path);
		clientId = undefined;
		await fs.writeFile(`${statePath}/plan.md`, 'plan');
		assert.deepStrictEqual({ reads: clientFiles.reads, state: await fs.readFile(`${statePath}/plan.md`) }, {
			reads: ['vscode-agent-client://client-1/vscode-vfs/github/microsoft/vscode/a.ts', 'vscode-agent-client://client-2/vscode-vfs/github/microsoft/vscode/a.ts'],
			state: 'plan',
		});
		await assert.rejects(fs.readFile(path), /window that owns the virtual workspace is not connected/);
		await assert.rejects(fs.exists(path), /window that owns the virtual workspace is not connected/);
	});

	test('maps missing files to ENOENT without treating invalid routes as missing', async () => {
		await assert.rejects(fs.readFile(`${fs.pathMapper.rootSdkPath}/missing`), { code: 'ENOENT' });
		await assert.rejects(fs.stat(`${statePath}/missing`), { code: 'ENOENT' });
		await assert.rejects(fs.readFile('/elsewhere'), /outside the virtual workspace/);
		await assert.rejects(fs.readdir(`${fs.pathMapper.rootSdkPath}/missing`), { code: 'ENOENT' });
	});

	test('searches virtual files with SDK paths, filters, excludes and bounded results', async () => {
		const root = fs.pathMapper.rootSdkPath;
		for (const [path, content] of [
			['src/a.ts', 'Hello world\nhello again'],
			['src/b.js', 'hello JavaScript'],
			['README.md', 'documentation'],
			['.git/config', 'hello'],
			['node_modules/ignored.ts', 'hello'],
			['src/binary.ts', 'hello\u0000binary'],
			['src/large.ts', 'hello'.repeat(220000)],
		]) {
			await fs.writeFile(`${root}/${path}`, content);
		}
		const [grep, glob] = createCopilotVirtualSearchTools(fs);
		const invoke = { sessionId: 'session', toolCallId: 'tool', toolName: 'search', arguments: {} };
		assert.deepStrictEqual(await Promise.all([
			glob.handler!({ pattern: '**/*.js' }, invoke),
			grep.handler!({ pattern: 'HELLO', '-i': true, glob: '*.ts' }, invoke),
			grep.handler!({ pattern: 'hello', '-i': true, output_mode: 'count', paths: 'src', type: 'ts' }, invoke),
			grep.handler!({ pattern: 'hello', '-i': true, output_mode: 'content', '-n': true, head_limit: 1 }, invoke),
		]), [
			{ resultType: 'success', textResultForLlm: `${root}/src/b.js` },
			{ resultType: 'success', textResultForLlm: `${root}/src/a.ts` },
			{ resultType: 'success', textResultForLlm: `${root}/src/a.ts:2` },
			{ resultType: 'success', textResultForLlm: `${root}/src/a.ts:1:Hello world\nResults truncated.` },
		]);
	});

	test('search honors cancellation and confines explicit paths to the workspace', async () => {
		const [, glob] = createCopilotVirtualSearchTools(fs);
		const controller = new AbortController();
		controller.abort(new Error('Search cancelled'));
		const invoke = { sessionId: 'session', toolCallId: 'tool', toolName: 'glob', arguments: {} };
		assert.deepStrictEqual(await glob.handler!({ pattern: '**/*' }, { ...invoke, signal: controller.signal }), {
			resultType: 'failure', textResultForLlm: 'Search cancelled', error: 'Search cancelled',
		});
		const result = await glob.handler!({ pattern: '**/*', paths: statePath }, invoke);
		assert.strictEqual((result as ToolResultObject).resultType, 'failure');
	});
});
