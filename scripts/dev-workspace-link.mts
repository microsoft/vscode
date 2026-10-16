/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const inputs: { readonly markdownEditorPath?: { readonly value?: unknown } } = JSON.parse(process.env.DEV_WORKSPACE_INPUTS ?? '{}');
const requested = inputs.markdownEditorPath?.value;
if (requested !== null && typeof requested !== 'string') {throw new Error('Expected markdownEditorPath project input');}
const extension = resolve('extensions/markdown-language-features');
const destination = join(extension, 'node_modules', '@vscode', 'markdown-editor');
const existing = await lstat(destination).catch(error => {
	if (error.code === 'ENOENT') {return undefined;}
	throw error;
});

if (requested === null) {
	if (existing?.isSymbolicLink()) {await rm(destination);}
	if (!existing || existing.isSymbolicLink()) {
		const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], {
			cwd: extension, stdio: 'inherit', shell: process.platform === 'win32',
		});
		await new Promise<void>((resolveExit, reject) => {
			child.once('error', reject);
			child.once('exit', code => code === 0 ? resolveExit() : reject(new Error(`Restoring published Markdown dependency failed (${code})`)));
		});
	}
	console.log('Using published @vscode/markdown-editor');
} else {
	const target = await realpath(resolve(requested));
	const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
	if (manifest.name !== '@vscode/markdown-editor') {throw new Error(`Not a Markdown editor package: ${target}`);}
	await access(join(target, 'dist', 'commands.js'));
	if (existing?.isSymbolicLink() && await realpath(destination) === target) {
		console.log(`Markdown editor already linked to ${target}`);
	} else {
		if (existing) {
			const installed = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'));
			if (installed.name !== '@vscode/markdown-editor') {throw new Error(`Refusing to replace unexpected package at ${destination}`);}
			await rm(destination, { recursive: !existing.isSymbolicLink() });
		}
		await mkdir(dirname(destination), { recursive: true });
		await symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir');
		console.log(`Linked Markdown editor to ${await realpath(destination)}`);
	}
}
