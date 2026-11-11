/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { parse } from '../../../../base/common/json.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileOperationError, FileOperationResult } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { readCopilotRepositoryPluginEnablement, setCopilotRepositoryPluginEnabled } from '../../node/copilot/copilotRepositoryPluginSettings.js';

suite('CopilotRepositoryPluginSettings', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const repository = URI.file('/repository');
	const settings = joinPath(repository, '.github', 'copilot', 'settings.json');
	let fileService: FileService;

	setup(() => {
		fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
	});

	teardown(() => sinon.restore());

	for (const content of ['{ invalid', '{"enabledPlugins":{"plugin@marketplace":"invalid"}}']) {
		test(`reports invalid repository inventory as a read failure: ${content}`, async () => {
			await fileService.writeFile(settings, VSBuffer.fromString(content));
			await assert.rejects(() => readCopilotRepositoryPluginEnablement(fileService, repository), /Cannot read repository plugin enablement/);
		});
	}

	test('restores inheritance without creating settings or removing other choices', async () => {
		await setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', null);
		const absent = await fileService.exists(settings);
		await fileService.writeFile(settings, VSBuffer.fromString('{\n  // Keep this setting.\n  "model": "existing",\n  "enabledPlugins": { "plugin@marketplace": false, "other@marketplace": true }\n}'));
		const before = [...await readCopilotRepositoryPluginEnablement(fileService, repository)];
		await setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', null);
		const content = (await fileService.readFile(settings)).value.toString();
		assert.deepStrictEqual({
			absent, before, after: [...await readCopilotRepositoryPluginEnablement(fileService, repository)],
			settings: parse(content), commentPreserved: content.includes('// Keep this setting.'),
		}, {
			absent: false, before: [['plugin@marketplace', false], ['other@marketplace', true]],
			after: [['other@marketplace', true]], settings: { model: 'existing', enabledPlugins: { 'other@marketplace': true } },
			commentPreserved: true,
		});
	});

	test('creates shared repository settings and preserves other plugin decisions across concurrent writes', async () => {
		await Promise.all([
			setCopilotRepositoryPluginEnabled(fileService, repository, 'first@marketplace', true),
			setCopilotRepositoryPluginEnabled(fileService, repository, 'second@marketplace', false),
		]);
		await setCopilotRepositoryPluginEnabled(fileService, repository, 'first@marketplace', false);

		assert.deepStrictEqual(parse((await fileService.readFile(settings)).value.toString()), {
			enabledPlugins: { 'first@marketplace': false, 'second@marketplace': false },
		});
	});

	test('preserves comments, line endings and unrelated settings when changing an entry', async () => {
		const original = [
			'{',
			'  // Shared configuration.',
			'  "model": "existing-model",',
			'  "enabledPlugins": {',
			'    "plugin@marketplace": false,',
			'    "other@marketplace": true',
			'  }',
			'}',
			'',
		].join('\r\n');
		await fileService.writeFile(settings, VSBuffer.fromString(original));

		await setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', true);

		assert.strictEqual((await fileService.readFile(settings)).value.toString(), original.replace('"plugin@marketplace": false', '"plugin@marketplace": true'));
	});

	test('does not rewrite an unchanged decision', async () => {
		const content = '{"enabledPlugins":{"plugin@marketplace":false}}\n';
		await fileService.writeFile(settings, VSBuffer.fromString(content));
		const writes = sinon.spy(fileService, 'writeFile');

		await setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', false);

		assert.deepStrictEqual({ content: (await fileService.readFile(settings)).value.toString(), writes: writes.callCount }, { content, writes: 0 });
	});

	test('refuses malformed settings without discarding existing contents', async () => {
		for (const content of [
			'{', '[]', 'null', '{"enabledPlugins":[]}', '{"enabledPlugins":false}',
			'{"enabledPlugins":{},"enabledPlugins":{}}',
			'{"enabledPlugins":{"plugin@marketplace":true,"plugin@marketplace":false}}',
		]) {
			await fileService.writeFile(settings, VSBuffer.fromString(content));

			await assert.rejects(setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', true), /not a valid settings object/);

			assert.strictEqual((await fileService.readFile(settings)).value.toString(), content);
		}
	});

	test('propagates read failures rather than treating unreadable settings as missing', async () => {
		const reads = sinon.stub(fileService, 'readFile').rejects(new FileOperationError('denied', FileOperationResult.FILE_PERMISSION_DENIED));
		const creates = sinon.spy(fileService, 'createFile');

		await assert.rejects(setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', true), /denied/);

		assert.strictEqual(creates.callCount, 0);
		reads.restore();
		await setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', true);
		assert.deepStrictEqual(parse((await fileService.readFile(settings)).value.toString()), { enabledPlugins: { 'plugin@marketplace': true } });
	});

	test('rejects same-size concurrent edits without overwriting unrelated settings and allows retry', async () => {
		const original = '{"model":"alpha","enabledPlugins":{"plugin@marketplace":false}}';
		const concurrent = original.replace('alpha', 'bravo');
		await fileService.writeFile(settings, VSBuffer.fromString(original));
		const snapshot = await fileService.readFile(settings);
		const reads = sinon.stub(fileService, 'readFile').callThrough();
		reads.onFirstCall().callsFake(async () => {
			await fileService.writeFile(settings, VSBuffer.fromString(concurrent));
			return snapshot;
		});

		await assert.rejects(setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', true), {
			fileOperationResult: FileOperationResult.FILE_MODIFIED_SINCE,
		});
		const afterConflict = (await fileService.readFile(settings)).value.toString();
		await setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', true);

		assert.deepStrictEqual({
			afterConflict,
			afterRetry: parse((await fileService.readFile(settings)).value.toString()),
		}, {
			afterConflict: concurrent,
			afterRetry: { model: 'bravo', enabledPlugins: { 'plugin@marketplace': true } },
		});
	});

	test('does not overwrite a file created after the missing-file read', async () => {
		const creates = sinon.stub(fileService, 'createFile').callsFake(async (resource, content, options) => {
			await fileService.writeFile(resource, VSBuffer.fromString('{"model":"concurrent"}'));
			creates.restore();
			return fileService.createFile(resource, content, options);
		});

		await assert.rejects(setCopilotRepositoryPluginEnabled(fileService, repository, 'plugin@marketplace', true), /exist/i);

		assert.strictEqual((await fileService.readFile(settings)).value.toString(), '{"model":"concurrent"}');
	});
});
