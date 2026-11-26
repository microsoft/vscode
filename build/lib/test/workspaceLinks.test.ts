/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { findWorkspaceLinks, restoreWorkspaceLinks, saveWorkspaceLinks } from '../../azure-pipelines/common/workspaceLinks.ts';

const linkType = process.platform === 'win32' ? 'junction' : 'dir';

function write(file: string, content: string): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

/** A workspace laid out like pnpm's isolated `node_modules`, plus links that must be left alone. */
function createWorkspace(): { root: string; outside: string } {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-links-'));
	const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-links-outside-'));
	write(path.join(root, 'node_modules/.pnpm/a@1.0.0/node_modules/a/index.js'), 'a');
	write(path.join(root, 'node_modules/.pnpm/b@1.0.0/node_modules/b/index.js'), 'b');
	write(path.join(root, '.git/HEAD'), 'ref');
	write(path.join(outside, 'c/index.js'), 'c');
	// `a` at the top level, and `b` beside `a` in the virtual store, so that `a` resolves it
	fs.symlinkSync(path.join(root, 'node_modules/.pnpm/a@1.0.0/node_modules/a'), path.join(root, 'node_modules/a'), linkType);
	fs.symlinkSync(path.join(root, 'node_modules/.pnpm/b@1.0.0/node_modules/b'), path.join(root, 'node_modules/.pnpm/a@1.0.0/node_modules/b'), linkType);
	fs.symlinkSync(path.join(outside, 'c'), path.join(root, 'node_modules/c'), linkType);
	fs.symlinkSync(path.join(root, 'missing'), path.join(root, 'node_modules/dangling'), linkType);
	return { root, outside };
}

function isLink(file: string): boolean {
	return fs.lstatSync(file).isSymbolicLink();
}

suite('workspaceLinks', () => {

	test('finds the folder links inside the workspace without following them', () => {
		const { root, outside } = createWorkspace();
		try {
			assert.deepStrictEqual(findWorkspaceLinks(root), [
				{ path: 'node_modules/.pnpm/a@1.0.0/node_modules/b', target: 'node_modules/.pnpm/b@1.0.0/node_modules/b' },
				{ path: 'node_modules/a', target: 'node_modules/.pnpm/a@1.0.0/node_modules/a' },
			]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	test('removes the links without their targets, and creates them again', () => {
		const { root, outside } = createWorkspace();
		const manifest = path.join(root, '.build/workspace-links.json');
		try {
			assert.strictEqual(saveWorkspaceLinks(root, manifest).length, 2);
			assert.ok(!fs.existsSync(path.join(root, 'node_modules/a')));
			assert.ok(!fs.existsSync(path.join(root, 'node_modules/.pnpm/a@1.0.0/node_modules/b')));
			assert.strictEqual(fs.readFileSync(path.join(root, 'node_modules/.pnpm/a@1.0.0/node_modules/a/index.js'), 'utf8'), 'a');
			assert.strictEqual(fs.readFileSync(path.join(root, 'node_modules/.pnpm/b@1.0.0/node_modules/b/index.js'), 'utf8'), 'b');
			// Left for the archive to copy
			assert.ok(isLink(path.join(root, 'node_modules/c')));
			assert.ok(isLink(path.join(root, 'node_modules/dangling')));

			assert.strictEqual(restoreWorkspaceLinks(root, manifest).length, 2);
			assert.ok(isLink(path.join(root, 'node_modules/a')));
			assert.strictEqual(fs.realpathSync(path.join(root, 'node_modules/a')), fs.realpathSync(path.join(root, 'node_modules/.pnpm/a@1.0.0/node_modules/a')));
			assert.strictEqual(fs.readFileSync(path.join(root, 'node_modules/a/index.js'), 'utf8'), 'a');
			assert.strictEqual(fs.readFileSync(path.join(fs.realpathSync(path.join(root, 'node_modules/a')), '../b/index.js'), 'utf8'), 'b');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
		}
	});

	test('restores the links in a copy of the workspace at another path', () => {
		const { root, outside } = createWorkspace();
		const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-links-copy-'));
		const manifest = path.join(root, '.build/workspace-links.json');
		try {
			saveWorkspaceLinks(root, manifest);
			fs.cpSync(path.join(root, 'node_modules/.pnpm'), path.join(copy, 'node_modules/.pnpm'), { recursive: true });
			restoreWorkspaceLinks(copy, manifest);
			assert.strictEqual(fs.realpathSync(path.join(copy, 'node_modules/a')), fs.realpathSync(path.join(copy, 'node_modules/.pnpm/a@1.0.0/node_modules/a')));
			assert.strictEqual(fs.readFileSync(path.join(copy, 'node_modules/.pnpm/a@1.0.0/node_modules/b/index.js'), 'utf8'), 'b');
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(outside, { recursive: true, force: true });
			fs.rmSync(copy, { recursive: true, force: true });
		}
	});
});
