/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { URI } from '../../../../util/vs/base/common/uri';
import { NodeFileSystemService } from '../fileSystemServiceImpl';

describe('NodeFileSystemService rename', () => {
	const service = new NodeFileSystemService();
	let directory: string;
	let source: URI;
	let target: URI;

	beforeEach(async () => {
		const root = join(process.cwd(), '.build');
		await mkdir(root, { recursive: true });
		directory = await mkdtemp(join(root, 'filesystem-rename-'));
		source = URI.file(join(directory, 'source'));
		target = URI.file(join(directory, 'target'));
		await writeFile(source.fsPath, 'source');
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it('keeps an existing target without overwrite', async () => {
		await writeFile(target.fsPath, 'target');
		await service.rename(source, target);
		expect(await Promise.all([readFile(source.fsPath, 'utf8'), readFile(target.fsPath, 'utf8')])).toEqual(['source', 'target']);
	});

	it('replaces an existing target when overwrite is enabled', async () => {
		await writeFile(target.fsPath, 'target');
		await service.rename(source, target, { overwrite: true });
		expect(await readFile(target.fsPath, 'utf8')).toBe('source');
	});

	it('renames to a missing target', async () => {
		await service.rename(source, target);
		expect(await readFile(target.fsPath, 'utf8')).toBe('source');
	});
});
