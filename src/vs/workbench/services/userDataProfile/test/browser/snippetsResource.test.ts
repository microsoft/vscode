/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { SnippetsResource } from '../../browser/snippetsResource.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

suite('SnippetsResource', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let fileService: IFileService;
	let snippetsHome: URI;
	let profile: IUserDataProfile;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		fileService = disposables.add(new FileService(new NullLogService()));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));

		snippetsHome = joinPath(ROOT, 'User', 'profiles', 'test', 'snippets');
		profile = { snippetsHome } as IUserDataProfile;
	});

	test('apply writes in-bounds snippet keys', async () => {
		const testObject = instantiationService.createInstance(SnippetsResource);

		await testObject.apply(JSON.stringify({ snippets: { 'javascript.json': '{}' } }), profile);

		assert.strictEqual((await fileService.readFile(joinPath(snippetsHome, 'javascript.json'))).value.toString(), '{}');
	});

	test('apply ignores path traversal keys (posix)', async () => {
		const testObject = instantiationService.createInstance(SnippetsResource);
		const escaped = joinPath(snippetsHome, '..', '..', '..', '..', 'tmp', 'PROBE_snippets');

		await testObject.apply(JSON.stringify({ snippets: { '../../../../tmp/PROBE_snippets': 'ok' } }), profile);

		assert.strictEqual(await fileService.exists(escaped), false);
	});

	test('apply ignores windows style path traversal keys', async () => {
		const testObject = instantiationService.createInstance(SnippetsResource);
		const escaped = joinPath(snippetsHome, '..', '..', '..', '..', 'tmp', 'PROBE_snippets');

		await testObject.apply(JSON.stringify({ snippets: { '..\\..\\..\\..\\tmp\\PROBE_snippets': 'ok' } }), profile);

		assert.strictEqual(await fileService.exists(escaped), false);
	});

	test('apply writes in-bounds key even alongside a traversal key', async () => {
		const testObject = instantiationService.createInstance(SnippetsResource);
		const escaped = joinPath(snippetsHome, '..', '..', 'tmp', 'PROBE_snippets');

		await testObject.apply(JSON.stringify({ snippets: { 'javascript.json': '{}', '../../tmp/PROBE_snippets': 'ok' } }), profile);

		assert.strictEqual((await fileService.readFile(joinPath(snippetsHome, 'javascript.json'))).value.toString(), '{}');
		assert.strictEqual(await fileService.exists(escaped), false);
	});
});
