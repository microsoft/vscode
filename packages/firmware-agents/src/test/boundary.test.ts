/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as path from 'path';

async function sourceFiles(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...await sourceFiles(full));
		} else if (entry.name.endsWith('.ts')) {
			out.push(full);
		}
	}
	return out;
}

// `vscode`, VS Code internals (`vs/...`) or anything outside this package.
const FORBIDDEN = /(?:from\s+|require\(\s*|import\(\s*)['"](vscode|vs\/[^'"]*|(?:\.\.\/){3,}[^'"]*)['"]/g;

suite('Package boundary', () => {

	test('the core never imports vscode, VS Code internals or code outside the package', async () => {
		const src = path.resolve(__dirname, '..', '..', 'src');
		const offenders: string[] = [];
		for (const file of await sourceFiles(src)) {
			const text = await fs.readFile(file, 'utf8');
			for (const match of text.matchAll(FORBIDDEN)) {
				offenders.push(`${path.relative(src, file)}: ${match[1]}`);
			}
		}
		assert.deepStrictEqual(offenders, []);
	});

	test('only the Node adapters touch Node built-ins with side effects', async () => {
		const src = path.resolve(__dirname, '..', '..', 'src');
		const offenders: string[] = [];
		for (const file of await sourceFiles(src)) {
			const rel = path.relative(src, file).split(path.sep).join('/');
			if (rel.startsWith('adapters/') || rel.startsWith('test/')) {
				continue;
			}
			const text = await fs.readFile(file, 'utf8');
			if (/['"](fs|child_process|net|os|fs\/promises)['"]/.test(text) || /\bprocess\.(env|stdout|stderr|exit)/.test(text)) {
				offenders.push(rel);
			}
		}
		assert.deepStrictEqual(offenders, []);
	});
});
