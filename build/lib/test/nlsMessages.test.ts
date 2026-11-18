/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { suite, test } from 'node:test';
import * as path from 'path';
import * as vm from 'vm';
import { createNLSCollector, finalizeNLS } from '../../next/nls-plugin.ts';
import { serializeNlsData } from '../nlsMessages.ts';

suite('NLS JavaScript messages', () => {
	test('serialization preserves every UTF-16 code unit and missing translations', () => {
		const allCodeUnits = Array.from({ length: 0x10000 }, (_, codeUnit) => String.fromCharCode(codeUnit)).join('');
		const messages = Object.freeze([allCodeUnits, '\ud83d\ude80', '\\u2026', undefined]);
		const serialized = serializeNlsData(messages);

		assert.deepStrictEqual({
			ascii: !/[^\x00-\x7f]/.test(serialized),
			messages: JSON.parse(serialized),
		}, {
			ascii: true,
			messages: [allCodeUnits, '\ud83d\ude80', '\\u2026', null],
		});
	});

	test('serialization preserves language identifiers', () => {
		const languages = ['', 'zh-tw', '\u00e9\u2026\ud83d\ude80'];
		assert.deepStrictEqual(languages.map(language => {
			const serialized = serializeNlsData(language);
			return { ascii: !/[^\x00-\x7f]/.test(serialized), language: JSON.parse(serialized) };
		}), languages.map(language => ({ ascii: true, language })));
	});

	test('finalizeNLS writes ASCII JavaScript without changing JSON catalogs or message values', async t => {
		const buildDir = path.resolve(import.meta.dirname, '..', '..', '..', '.build');
		await fs.promises.mkdir(buildDir, { recursive: true });
		const directory = await fs.promises.mkdtemp(path.join(buildDir, 'nls-messages-test-'));
		t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

		const messages = ['ASCII "quotes" \\ \n', '\u00e9 \u2026 \u65e5\u672c\u8a9e', '\ud83d\ude80 \u2028\u2029', '\ud800'];
		const keys = messages.map((_, index) => ({ key: String(index), comment: ['Translator \u2026'] }));
		const collector = createNLSCollector();
		for (let index = messages.length - 1; index >= 0; index--) {
			collector.add({ moduleId: 'module', key: keys[index], message: messages[index], placeholder: `message${index}` });
		}

		const directories = [path.join(directory, 'primary'), path.join(directory, 'mirror')];
		await finalizeNLS(collector, directories[0], [directories[1]]);

		const generated = await Promise.all(directories.map(async outDir => {
			const javascript = await fs.promises.readFile(path.join(outDir, 'nls.messages.js'), 'utf8');
			const context = { _VSCODE_NLS_MESSAGES: [] as string[] };
			vm.runInNewContext(javascript, context);
			return {
				ascii: !/[^\x00-\x7f]/.test(javascript),
				messages: Array.from(context._VSCODE_NLS_MESSAGES),
				json: await fs.promises.readFile(path.join(outDir, 'nls.messages.json'), 'utf8'),
				keysJson: await fs.promises.readFile(path.join(outDir, 'nls.keys.json'), 'utf8'),
				metadataJson: await fs.promises.readFile(path.join(outDir, 'nls.metadata.json'), 'utf8'),
			};
		}));

		assert.deepStrictEqual(generated, directories.map(() => ({
			ascii: true,
			messages,
			json: JSON.stringify(messages),
			keysJson: JSON.stringify([['module', keys.map(key => key.key)]]),
			metadataJson: JSON.stringify({ keys: { module: keys }, messages: { module: messages } }, null, '\t'),
		})));
	});
});
