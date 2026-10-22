/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { updateLaunchSettings } from './settings.ts';

test('prepares JSONC settings without changing the source profile', async () => {
	const root = await fs.mkdtemp(path.join(import.meta.dirname, '.settings-test-'));
	try {
		const source = path.join(root, 'source.json');
		const destination = path.join(root, 'settings.json');
		const original = '{\n// retain this comment\n"files.simpleDialog.enable": false,\n"window.title": "old",\n"nested": { "window.title": "unchanged" },\n}\n';
		await fs.writeFile(source, original);
		await fs.copyFile(source, destination);
		updateLaunchSettings(destination, '  Test $ session\n title ', source);
		assert.equal(await fs.readFile(source, 'utf8'), original);
		assert.equal(await fs.readFile(destination, 'utf8'), '{\n// retain this comment\n"files.simpleDialog.enable": true,\n"window.title": "Test ＄ session title${separator}${rootName}${separator}${appName}",\n"nested": { "window.title": "unchanged" },\n}\n');
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});

test('brackets and escaped quotes in string values do not affect root property matching', async () => {
	const root = await fs.mkdtemp(path.join(import.meta.dirname, '.settings-test-'));
	try {
		const destination = path.join(root, 'settings.json');
		const original = {
			text: '{ [ \\" nested-looking text',
			nested: { 'window.title': 'unchanged } ]' },
			'window.title': 'old',
		};
		await fs.writeFile(destination, JSON.stringify(original));
		updateLaunchSettings(destination, 'New', destination);
		assert.deepEqual(JSON.parse(await fs.readFile(destination, 'utf8')), {
			...original,
			'files.simpleDialog.enable': true,
			'window.title': 'New${separator}${rootName}${separator}${appName}',
		});
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
