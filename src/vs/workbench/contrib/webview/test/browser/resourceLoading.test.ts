/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { getResourceToLoad } from '../../browser/resourceLoading.js';

suite('Webview Resource Loading - getResourceToLoad', () => {
	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let uriIdentityService: IUriIdentityService;

	setup(() => {
		const instantiationService = disposableStore.add(new TestInstantiationService());
		instantiationService.stub(ILogService, NullLogService);
		const fileService = disposableStore.add(new FileService(instantiationService.get(ILogService)));
		uriIdentityService = instantiationService.stub(IUriIdentityService, disposableStore.add(new UriIdentityService(fileService)));
	});

	test('Returns resource when file is under root', () => {
		const root = URI.file('/home/user/project');
		const resource = URI.file('/home/user/project/file.txt');
		const result = getResourceToLoad(resource, [root], uriIdentityService);
		assert.strictEqual(result?.toString(), resource.toString());
	});

	test('Returns resource when file is in nested directory', () => {
		const root = URI.file('/home/user/project');
		const resource = URI.file('/home/user/project/subdir/nested/file.txt');
		const result = getResourceToLoad(resource, [root], uriIdentityService);
		assert.strictEqual(result?.toString(), resource.toString());
	});

	test('Fails when file is outside root', () => {
		const root = URI.file('/home/user/project');
		const resource = URI.file('/home/user/other/file.txt');
		const result = getResourceToLoad(resource, [root], uriIdentityService);
		assert.strictEqual(result, undefined);
	});

	test('Fails when file is root', () => {
		const root = URI.file('/home/user/project');
		const result = getResourceToLoad(root, [root], uriIdentityService);
		assert.strictEqual(result, undefined);
	});

	test('Fails when file is sibling of root directory', () => {
		const root = URI.file('/home/user/project');
		{
			const resource = URI.file('/home/user/projectOther/file.txt');
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		}
		{
			const resource = URI.file('/home/user/project.txt');
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		}
	});

	test('Returns resource when root ends with /', () => {
		const root = URI.file('/home/user/project/');
		const resource = URI.file('/home/user/project/file.txt');
		const result = getResourceToLoad(resource, [root], uriIdentityService);
		assert.strictEqual(result?.toString(), resource.toString());
	});

	test('Fails for sibling when root ends with / ', () => {
		const root = URI.file('/home/user/project/');
		const resource = URI.file('/home/user/projectOther/file.txt');
		const result = getResourceToLoad(resource, [root], uriIdentityService);
		assert.strictEqual(result, undefined);
	});

	(!isWindows /* UNC is windows only */ ? suite.skip : suite)('UNC paths', () => {
		test('Returns resource when file is under UNC root', () => {
			const root = URI.file('\\\\server\\share\\folder');
			const resource = URI.file('\\\\server\\share\\folder\\file.txt');
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('Returns resource with case-insensitive comparison for UNC paths', () => {
			const root = URI.file('\\\\SERVER\\SHARE\\folder');
			const resource = URI.file('\\\\server\\share\\folder\\file.txt');
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('Fails when file is outside UNC root', () => {
			const root = URI.file('\\\\server\\share\\folder');
			const resource = URI.file('\\\\server\\share\\other\\file.txt');
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('Fails when UNC server differs', () => {
			const root = URI.file('\\\\server1\\share\\folder');
			const resource = URI.file('\\\\server2\\share\\folder\\file.txt');
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		});
	});

	suite('Different authorities', () => {
		test('Returns resource when authorities match', () => {
			const root = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+myserver', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+myserver', path: '/home/user/project/file.txt' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.ok(result);
		});

		test('Fails when authorities differ', () => {
			const root = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+server1', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+server2', path: '/home/user/project/file.txt' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('handles empty authority', () => {
			const root = URI.from({ scheme: 'test-scheme', authority: '', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'test-scheme', authority: '', path: '/home/user/project/file.txt' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result?.toString(), resource.toString());
		});
	});

	suite('Different schemes', () => {
		test('Fails when schemes differ', () => {
			const root = URI.from({ scheme: 'file', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'http', path: '/home/user/project/file.txt' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('Returns resource when schemes match', () => {
			const root = URI.from({ scheme: 'custom-scheme', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'custom-scheme', path: '/home/user/project/file.txt' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('normalizes vscode-remote scheme', () => {
			const root = URI.from({ scheme: 'vscode-remote', authority: 'test', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'vscode-remote', authority: 'test', path: '/home/user/project/file.txt' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);

			assert.ok(result);
			assert.strictEqual(result.scheme, 'vscode-remote');
			assert.strictEqual(result.authority, 'test');
			assert.strictEqual(result.path, '/vscode-resource');
			const query = JSON.parse(result.query);
			assert.strictEqual(query.requestResourcePath, '/home/user/project/file.txt');
		});
	});

	suite('Fragment and query strings', () => {
		test('preserves fragment in returned URI', () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/project/file.txt').with({ fragment: 'section1' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result?.fragment, 'section1');
		});

		test('preserves query in returned URI', () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/project/file.txt').with({ query: 'version=2' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result?.query, 'version=2');
		});

		test('preserves both fragment and query', () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/project/file.txt').with({ fragment: 'section1', query: 'version=2' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result?.fragment, 'section1');
			assert.strictEqual(result?.query, 'version=2');
		});

		test('still validates path containment with query params', () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/other/file.txt').with({ query: 'version=2' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('still validates path containment with fragment', () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/other/file.txt').with({ fragment: 'section1' });
			const result = getResourceToLoad(resource, [root], uriIdentityService);
			assert.strictEqual(result, undefined);
		});
	});

	suite('Multiple roots', () => {
		test('Returns resource when file is under one of multiple roots', () => {
			const roots = [
				URI.file('/home/user/project1'),
				URI.file('/home/user/project2'),
				URI.file('/home/user/project3')
			];
			const resource = URI.file('/home/user/project2/file.txt');
			const result = getResourceToLoad(resource, roots, uriIdentityService);
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('Fails when file is not under any root', () => {
			const roots = [
				URI.file('/home/user/project1'),
				URI.file('/home/user/project2')
			];
			const resource = URI.file('/home/user/other/file.txt');
			const result = getResourceToLoad(resource, roots, uriIdentityService);
			assert.strictEqual(result, undefined);
		});

		test('Returns resource matching first valid root', () => {
			const roots = [
				URI.file('/home/user/project'),
				URI.file('/home/user/project/subdir')
			];
			const resource = URI.file('/home/user/project/subdir/file.txt');
			const result = getResourceToLoad(resource, roots, uriIdentityService);
			// Should match first root in the list
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('handles empty roots array', () => {
			const resource = URI.file('/home/user/project/file.txt');
			const result = getResourceToLoad(resource, [], uriIdentityService);
			assert.strictEqual(result, undefined);
		});
	});
});
