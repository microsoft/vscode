/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { MAX_CANVAS_ICON_BYTES } from '../../common/meta/agentCanvasIconMeta.js';
import { CopilotCanvasIconLoader } from '../../node/copilot/copilotCanvasIcons.js';

suite('CopilotCanvasIconLoader', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
	const png = Buffer.from(pngBase64, 'base64');
	let root: string;

	setup(async () => {
		root = await mkdtemp(join(tmpdir(), 'canvas-icons-'));
	});

	teardown(async () => {
		await rm(root, { recursive: true, force: true });
	});

	/** Writes an extension whose directory holds `files`, and returns the directory. */
	async function writeExtension(name: string, files: Record<string, Uint8Array | string>): Promise<string> {
		const directory = join(root, name);
		await mkdir(join(directory, 'assets'), { recursive: true });
		await writeFile(join(directory, 'extension.mjs'), '');
		for (const [file, content] of Object.entries(files)) {
			await writeFile(join(directory, file), content);
		}
		return directory;
	}

	function withSize(width: number, height: number): Buffer {
		const resized = Buffer.from(png);
		resized.writeUInt32BE(width, 16);
		resized.writeUInt32BE(height, 20);
		return resized;
	}

	test('reads a bounded PNG inside its extension and nothing else', async () => {
		const extension = await writeExtension('demo', {
			'assets/icon.png': png,
			'renamed.png': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
			'huge.png': withSize(4096, 4096),
			'large.png': Buffer.concat([png, Buffer.alloc(MAX_CANVAS_ICON_BYTES)]),
			'icon.txt': png,
		});
		await writeFile(join(root, 'outside.png'), png);
		await mkdir(join(root, 'no-entry'));
		await writeFile(join(root, 'no-entry', 'icon.png'), png);
		const loader = new CopilotCanvasIconLoader(new NullLogService());
		const results: Record<string, boolean> = {};
		for (const [name, path] of Object.entries({
			nested: join(extension, 'assets', 'icon.png'),
			notPng: join(extension, 'renamed.png'),
			tooManyPixels: join(extension, 'huge.png'),
			tooLarge: join(extension, 'large.png'),
			wrongExtension: join(extension, 'icon.txt'),
			relative: 'assets/icon.png',
			missing: join(extension, 'missing.png'),
			directoryWithoutExtension: join(root, 'no-entry', 'icon.png'),
		})) {
			results[name] = await loader.load(path, 'user:demo') !== undefined;
		}
		assert.deepStrictEqual({ results, icon: await loader.load(join(extension, 'assets', 'icon.png'), 'user:demo'), otherExtension: await loader.load(join(extension, 'assets', 'icon.png'), 'user:other') }, {
			results: { nested: true, notPng: false, tooManyPixels: false, tooLarge: false, wrongExtension: false, relative: false, missing: false, directoryWithoutExtension: false },
			icon: `data:image/png;base64,${pngBase64}`,
			otherExtension: undefined,
		});
	});

	(isWindows ? test.skip : test)('does not follow a symbolic link out of its extension', async () => {
		const extension = await writeExtension('demo', { 'own.png': png });
		await writeFile(join(root, 'secret.png'), png);
		// A linked directory that looks like an extension of its own, by its entry module and even by its name.
		const elsewhere = await writeExtension('elsewhere', { 'secret.png': png });
		await symlink(join(root, 'secret.png'), join(extension, 'linked-file.png'));
		await symlink(root, join(extension, 'linked-directory'));
		await symlink(elsewhere, join(extension, 'linked-extension'));
		await symlink(elsewhere, join(extension, 'demo'));
		await symlink(join(extension, 'own.png'), join(extension, 'alias.png'));
		// An extension directory that is itself a link, as one under development often is.
		await mkdir(join(root, 'home', 'extensions'), { recursive: true });
		await symlink(extension, join(root, 'home', 'extensions', 'demo'));
		const loader = new CopilotCanvasIconLoader(new NullLogService());
		const load = async (...segments: string[]) => await loader.load(join(...segments), 'user:demo') !== undefined;
		assert.deepStrictEqual({
			file: await load(extension, 'linked-file.png'),
			directory: await load(extension, 'linked-directory', 'secret.png'),
			linkedExtension: await load(extension, 'linked-extension', 'secret.png'),
			linkedExtensionWithItsName: await load(extension, 'demo', 'secret.png'),
			aliasInside: await load(extension, 'alias.png'),
			linkedExtensionDirectory: await load(root, 'home', 'extensions', 'demo', 'own.png'),
		}, { file: false, directory: false, linkedExtension: false, linkedExtensionWithItsName: false, aliasInside: true, linkedExtensionDirectory: true });
	});

	(isWindows ? test.skip : test)('shows no icon when a folder above the extension looks like it too', async () => {
		// A project folder named like its extension, with an entry module, which a link inside the extension points into.
		const project = await writeExtension('demo', { 'secret.png': png });
		const extension = join(project, '.github', 'extensions', 'demo');
		await mkdir(extension, { recursive: true });
		await writeFile(join(extension, 'extension.mjs'), '');
		await writeFile(join(extension, 'own.png'), png);
		await symlink(join(project, 'secret.png'), join(extension, 'linked.png'));
		const loader = new CopilotCanvasIconLoader(new NullLogService());
		assert.deepStrictEqual({
			linked: await loader.load(join(extension, 'linked.png'), 'project:demo'),
			own: await loader.load(join(extension, 'own.png'), 'project:demo'),
		}, { linked: undefined, own: undefined });
	});

	test('keeps an icon inside its extension when a sibling folder differs only in case', async function () {
		const extension = await writeExtension('demo', {});
		const sibling = join(root, 'DEMO');
		try {
			await mkdir(sibling);
		} catch {
			// This file system ignores case, so no such sibling can exist.
			this.skip();
		}
		await writeFile(join(sibling, 'secret.png'), png);
		await symlink(join(sibling, 'secret.png'), join(extension, 'linked.png'));
		const loader = new CopilotCanvasIconLoader(new NullLogService());
		assert.strictEqual(await loader.load(join(extension, 'linked.png'), 'user:demo'), undefined);
	});

	(isWindows ? test.skip : test)('never waits on a FIFO named as an icon', async () => {
		const extension = await writeExtension('demo', {});
		execFileSync('mkfifo', [join(extension, 'icon.png')]);
		const loader = new CopilotCanvasIconLoader(new NullLogService());
		assert.strictEqual(await loader.load(join(extension, 'icon.png'), 'user:demo'), undefined);
	});

	test('reads an icon again once it changes', async () => {
		const extension = await writeExtension('demo', { 'icon.png': png });
		const loader = new CopilotCanvasIconLoader(new NullLogService());
		const before = await loader.load(join(extension, 'icon.png'), 'user:demo');
		await writeFile(join(extension, 'icon.png'), Buffer.from('not a png anymore'));
		assert.deepStrictEqual({ before: before !== undefined, after: await loader.load(join(extension, 'icon.png'), 'user:demo') }, { before: true, after: undefined });
	});
});
