/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWindows, OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileRealpathOptions, IFileService, IStat } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { getResourceToLoad, loadLocalResource, WebviewResourceResponse } from '../../browser/resourceLoading.js';

suite('Webview Resource Loading - getResourceToLoad', () => {
	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let fileService: TestFileService;
	let uriIdentityService: IUriIdentityService;

	setup(() => {
		instantiationService = disposableStore.add(new TestInstantiationService());
		instantiationService.stub(ILogService, NullLogService);
		fileService = new TestFileService();
		instantiationService.stub(IFileService, fileService);
		uriIdentityService = instantiationService.stub(IUriIdentityService, disposableStore.add(new UriIdentityService(fileService)));
	});

	teardown(() => {
		sinon.restore();
	});

	test('Returns resource when file is under root', async () => {
		const root = URI.file('/home/user/project');
		const resource = URI.file('/home/user/project/file.txt');
		const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
		assert.strictEqual(result?.toString(), resource.toString());
	});

	test('Returns resource when file is in nested directory', async () => {
		const root = URI.file('/home/user/project');
		const resource = URI.file('/home/user/project/subdir/nested/file.txt');
		const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
		assert.strictEqual(result?.toString(), resource.toString());
	});

	test('Fails when file is outside root', async () => {
		const root = URI.file('/home/user/project');
		const resource = URI.file('/home/user/other/file.txt');
		const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
		assert.strictEqual(result, undefined);
	});

	test('Fails when file is root', async () => {
		const root = URI.file('/home/user/project');
		const result = (await getResourceToLoad(root, [root], uriIdentityService, fileService));
		assert.strictEqual(result, undefined);
	});

	test('Fails when file is sibling of root directory', async () => {
		const root = URI.file('/home/user/project');
		{
			const resource = URI.file('/home/user/projectOther/file.txt');
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		}
		{
			const resource = URI.file('/home/user/project.txt');
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		}
	});

	test('Returns resource when root ends with /', async () => {
		const root = URI.file('/home/user/project/');
		const resource = URI.file('/home/user/project/file.txt');
		const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
		assert.strictEqual(result?.toString(), resource.toString());
	});

	test('Fails for sibling when root ends with / ', async () => {
		const root = URI.file('/home/user/project/');
		const resource = URI.file('/home/user/projectOther/file.txt');
		const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
		assert.strictEqual(result, undefined);
	});

	(!isWindows /* UNC is windows only */ ? suite.skip : suite)('UNC paths', () => {
		test('Returns resource when file is under UNC root', async () => {
			const root = URI.file('\\\\server\\share\\folder');
			const resource = URI.file('\\\\server\\share\\folder\\file.txt');
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('Returns resource with case-insensitive comparison for UNC paths', async () => {
			const root = URI.file('\\\\SERVER\\SHARE\\folder');
			const resource = URI.file('\\\\server\\share\\folder\\file.txt');
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('Fails when file is outside UNC root', async () => {
			const root = URI.file('\\\\server\\share\\folder');
			const resource = URI.file('\\\\server\\share\\other\\file.txt');
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});

		test('Fails when UNC server differs', async () => {
			const root = URI.file('\\\\server1\\share\\folder');
			const resource = URI.file('\\\\server2\\share\\folder\\file.txt');
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});
	});

	(!isWindows ? suite.skip : suite)('Windows path handling', () => {
		const root = URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project' });

		test('Denies parent segments ending in spaces from every reported input', async () => {
			const cases = [
				{
					source: 'encoded webview URL',
					raw: 'https://file+.vscode-resource.vscode-cdn.net/c:/Users/alice/project/..%20/.ssh/id_rsa',
					path: decodeURIComponent(new URL('https://file+.vscode-resource.vscode-cdn.net/c:/Users/alice/project/..%20/.ssh/id_rsa').pathname)
				},
				{
					source: 'literal-space webview URL',
					raw: 'https://file+.vscode-resource.vscode-cdn.net/c:/Users/alice/project/.. /.ssh/id_rsa',
					path: decodeURIComponent(new URL('https://file+.vscode-resource.vscode-cdn.net/c:/Users/alice/project/.. /.ssh/id_rsa').pathname)
				},
				{
					source: 'load-resource message',
					raw: '/c:/Users/alice/project/.. /.ssh/id_rsa',
					path: '/c:/Users/alice/project/.. /.ssh/id_rsa'
				}
			];

			assert.deepStrictEqual(await Promise.all(cases.map(async testCase => {
				const resource = URI.from({ scheme: Schemas.file, path: testCase.path });
				return {
					source: testCase.source,
					raw: testCase.raw,
					path: testCase.path,
					resourceToLoad: (await getResourceToLoad(resource, [root], uriIdentityService, fileService))?.toString()
				};
			})), cases.map(testCase => ({
				source: testCase.source,
				raw: testCase.raw,
				path: '/c:/Users/alice/project/.. /.ssh/id_rsa',
				resourceToLoad: undefined
			})));
		});

		test('Does not read a resource through a parent segment ending in a space', async () => {
			const requestResource = URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project/.. /outside.txt' });
			const readFileStream = sinon.spy(fileService, 'readFileStream');

			const result = await instantiationService.invokeFunction(accessor => loadLocalResource(
				accessor,
				requestResource,
				{ ifNoneMatch: undefined, roots: [root] },
				CancellationToken.None
			));

			assert.deepStrictEqual({
				responseType: result.type,
				readResources: readFileStream.getCalls().map(call => call.args[0].toString())
			}, {
				responseType: WebviewResourceResponse.Type.AccessDenied,
				readResources: []
			});
		});

		test('Does not alias distinct roots ending in spaces or dots', async () => {
			const resource = URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project/inside.txt' });
			const roots = [
				URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project ' }),
				URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project.' }),
				URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project..' }),
			];

			assert.deepStrictEqual(
				await Promise.all(roots.map(async root => (await getResourceToLoad(resource, [root], uriIdentityService, fileService)))),
				[undefined, undefined, undefined]
			);
		});

		test('Reads distinct in-root resources ending in spaces or dots without rewriting them', async () => {
			const requestResources = [
				URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project/nested /inside.txt' }),
				URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project/nested./inside.txt' }),
				URI.from({ scheme: Schemas.file, path: '/c:/Users/alice/project/nested../inside.txt' }),
			];
			const readFileStream = sinon.spy(fileService, 'readFileStream');

			const results = await Promise.all(requestResources.map(requestResource =>
				instantiationService.invokeFunction(accessor => loadLocalResource(
					accessor,
					requestResource,
					{ ifNoneMatch: undefined, roots: [root] },
					CancellationToken.None
				))
			));

			assert.deepStrictEqual({
				responseTypes: results.map(result => result.type),
				readResources: readFileStream.getCalls().map(call => call.args[0].toString())
			}, {
				responseTypes: [
					WebviewResourceResponse.Type.Success,
					WebviewResourceResponse.Type.Success,
					WebviewResourceResponse.Type.Success,
				],
				readResources: requestResources.map(resource => resource.toString())
			});
		});
	});

	suite('Different authorities', () => {
		test('Returns resource when authorities match', async () => {
			const root = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+myserver', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+myserver', path: '/home/user/project/file.txt' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.ok(result);
		});

		test('Fails when authorities differ', async () => {
			const root = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+server1', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'test-scheme', authority: 'ssh-remote+server2', path: '/home/user/project/file.txt' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});

		test('handles empty authority', async () => {
			const root = URI.from({ scheme: 'test-scheme', authority: '', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'test-scheme', authority: '', path: '/home/user/project/file.txt' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result?.toString(), resource.toString());
		});
	});

	suite('Different schemes', () => {
		test('Fails when schemes differ', async () => {
			const root = URI.from({ scheme: 'file', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'http', path: '/home/user/project/file.txt' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});

		test('Returns resource when schemes match', async () => {
			const root = URI.from({ scheme: 'custom-scheme', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'custom-scheme', path: '/home/user/project/file.txt' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('normalizes vscode-remote scheme', async () => {
			const root = URI.from({ scheme: 'vscode-remote', authority: 'test', path: '/home/user/project' });
			const resource = URI.from({ scheme: 'vscode-remote', authority: 'test', path: '/home/user/project/file.txt' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService, OperatingSystem.Linux));

			assert.ok(result);
			assert.strictEqual(result.scheme, 'vscode-remote');
			assert.strictEqual(result.authority, 'test');
			assert.strictEqual(result.path, '/vscode-resource');
			const query = JSON.parse(result.query);
			assert.strictEqual(query.requestResourcePath, '/home/user/project/file.txt');
		});

		test('Fails for vscode-remote path traversal with backslashes', async () => {
			const root = URI.from({ scheme: 'vscode-remote', authority: 'test', path: '/C:/workspace/project' });
			const resource = URI.from({ scheme: 'vscode-remote', authority: 'test', path: '/C:/workspace/project/..\\..\\outside.txt' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService, OperatingSystem.Windows));

			assert.strictEqual(result, undefined);
		});
	});

	suite('Remote filesystem semantics', () => {
		const remote = (path: string, authority = 'test') => URI.from({ scheme: Schemas.vscodeRemote, authority, path });

		test('Rejects encoded Windows traversal and Linux check/read mismatch', async () => {
			const cases = [
				{ os: OperatingSystem.Windows, root: '/c:/allowed', path: '/c:/allowed/x%5C..%5C..%5Coutside%5Coutside.txt' },
				{ os: OperatingSystem.Linux, root: '/home/user/allowed', path: '/home/user/allowed/a%5Cb/../../outside/outside.txt' },
				{ os: OperatingSystem.Macintosh, root: '/home/user/allowed', path: '/home/user/allowed/a%5Cb/../../outside/outside.txt' },
				{ os: OperatingSystem.Windows, root: '/c:/allowed', path: '/c:/allowed/sub/..%5C../outside.txt' },
				{ os: OperatingSystem.Linux, root: '/home/user/allowed', path: '/home/user/allowed/../outside.txt' },
			];
			assert.deepStrictEqual(await Promise.all(cases.map(async ({ os, root, path }) =>
				(await getResourceToLoad(remote(decodeURIComponent(path)), [remote(root)], uriIdentityService, fileService, os))
			)), cases.map(() => undefined));
		});

		test('Forwards the canonical checked Windows path and preserves POSIX backslashes', async () => {
			const cases = [
				{ os: OperatingSystem.Windows, root: '/c:/allowed', path: '/c:/allowed/sub\\..\\file.txt', expected: '/c:/allowed/file.txt' },
				{ os: OperatingSystem.Windows, root: '/c:/allowed\\sub/..', path: '/c:/allowed/file.txt', expected: '/c:/allowed/file.txt' },
				{ os: OperatingSystem.Windows, root: '/c:/', path: '/c:/../file.txt', expected: '/c:/file.txt' },
				{ os: OperatingSystem.Linux, root: '/home/user/allowed', path: '/home/user/allowed/x\\..\\..\\file.txt', expected: '/home/user/allowed/x\\..\\..\\file.txt' },
				{ os: OperatingSystem.Linux, root: '/home/user/parent\\..\\allowed', path: '/home/user/parent\\..\\allowed/..\\file.txt', expected: '/home/user/parent\\..\\allowed/..\\file.txt' },
				{ os: OperatingSystem.Macintosh, root: '/home/user/allowed', path: '/home/user/allowed/x\\..\\..\\file.txt', expected: '/home/user/allowed/x\\..\\..\\file.txt' },
				{ os: OperatingSystem.Macintosh, root: '/home/user/parent\\..\\allowed', path: '/home/user/parent\\..\\allowed/..\\file.txt', expected: '/home/user/parent\\..\\allowed/..\\file.txt' },
				{ os: OperatingSystem.Macintosh, root: '/home/user/allowed', path: '/home/user/allowed/a\\b/../file.txt', expected: '/home/user/allowed/file.txt' },
			];
			assert.deepStrictEqual(await Promise.all(cases.map(async ({ os, root, path }) => {
				const result = (await getResourceToLoad(remote(path), [remote(root)], uriIdentityService, fileService, os));
				assert.ok(result, `OS: ${os}, root: ${root}, path: ${path}`);
				return JSON.parse(result.query).requestResourcePath;
			})), cases.map(({ expected }) => expected));
		});

		test('Rejects unknown target OS, normalized root equality, sibling paths and different authorities', async () => {
			const root = remote('/c:/allowed');
			assert.deepStrictEqual([
				(await getResourceToLoad(remote('/c:/allowed/file.txt'), [root], uriIdentityService, fileService)),
				(await getResourceToLoad(remote('/c:/allowed/sub/..'), [root], uriIdentityService, fileService, OperatingSystem.Windows)),
				(await getResourceToLoad(remote('/c:/allowedOther/file.txt'), [root], uriIdentityService, fileService, OperatingSystem.Windows)),
				(await getResourceToLoad(remote('/c:/allowed/file.txt', 'other'), [root], uriIdentityService, fileService, OperatingSystem.Windows)),
			], [undefined, undefined, undefined, undefined]);
		});

		for (const os of [OperatingSystem.Linux, OperatingSystem.Macintosh]) {
			test(`Preserves containment boundaries for POSIX remotes (OS: ${os})`, async () => {
				const root = remote('/home/user/allowed');
				assert.deepStrictEqual([
					(await getResourceToLoad(remote('/home/user/allowed/..\\file.txt'), [root], uriIdentityService, fileService)),
					(await getResourceToLoad(remote('/home/user/allowed/child/..'), [root], uriIdentityService, fileService, os)),
					(await getResourceToLoad(remote('/home/user/allowedOther/..\\file.txt'), [root], uriIdentityService, fileService, os)),
					(await getResourceToLoad(remote('/home/user/allowed/..\\file.txt', 'other'), [root], uriIdentityService, fileService, os)),
					(await getResourceToLoad(remote('/home/user/allowed/file.txt'), [root.with({ path: '/home/user/allowed/child\\..' })], uriIdentityService, fileService, os)),
					(await getResourceToLoad(remote('/home/user/allowed/..\\file.txt'), [root.with({ scheme: Schemas.vscodeUserData })], uriIdentityService, fileService, os)),
					(await getResourceToLoad(remote('/home/user/allowed/..\\file.txt'), [root.with({ query: 'version=1' })], uriIdentityService, fileService, os)),
				], [undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
			});
		}

		test('Keeps conservative containment for non-remote schemes on POSIX remote connections', async () => {
			const root = URI.from({ scheme: 'custom', path: '/allowed' });
			const resource = root.with({ path: '/allowed/..\\outside.txt' });
			assert.deepStrictEqual(
				await Promise.all([OperatingSystem.Linux, OperatingSystem.Macintosh].map(async os => (await getResourceToLoad(resource, [root], uriIdentityService, fileService, os)))),
				[undefined, undefined]
			);
		});

		test('Preserves literal backslashes for custom filesystem schemes', async () => {
			const root = URI.from({ scheme: 'custom', path: '/allowed' });
			const resource = root.with({ path: '/allowed/a\\b/../../outside.txt' });
			assert.strictEqual((await getResourceToLoad(resource, [root], uriIdentityService, fileService)), undefined);
		});
	});

	suite('Fragment and query strings', () => {
		test('preserves fragment in returned URI', async () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/project/file.txt').with({ fragment: 'section1' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result?.fragment, 'section1');
		});

		test('preserves query in returned URI', async () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/project/file.txt').with({ query: 'version=2' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result?.query, 'version=2');
		});

		test('preserves both fragment and query', async () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/project/file.txt').with({ fragment: 'section1', query: 'version=2' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result?.fragment, 'section1');
			assert.strictEqual(result?.query, 'version=2');
		});

		test('still validates path containment with query params', async () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/other/file.txt').with({ query: 'version=2' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});

		test('still validates path containment with fragment', async () => {
			const root = URI.file('/home/user/project');
			const resource = URI.file('/home/user/other/file.txt').with({ fragment: 'section1' });
			const result = (await getResourceToLoad(resource, [root], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});
	});

	suite('Multiple roots', () => {
		test('Returns resource when file is under one of multiple roots', async () => {
			const roots = [
				URI.file('/home/user/project1'),
				URI.file('/home/user/project2'),
				URI.file('/home/user/project3')
			];
			const resource = URI.file('/home/user/project2/file.txt');
			const result = (await getResourceToLoad(resource, roots, uriIdentityService, fileService));
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('Fails when file is not under any root', async () => {
			const roots = [
				URI.file('/home/user/project1'),
				URI.file('/home/user/project2')
			];
			const resource = URI.file('/home/user/other/file.txt');
			const result = (await getResourceToLoad(resource, roots, uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});

		test('Returns resource matching first valid root', async () => {
			const roots = [
				URI.file('/home/user/project'),
				URI.file('/home/user/project/subdir')
			];
			const resource = URI.file('/home/user/project/subdir/file.txt');
			const result = (await getResourceToLoad(resource, roots, uriIdentityService, fileService));
			// Should match first root in the list
			assert.strictEqual(result?.toString(), resource.toString());
		});

		test('handles empty roots array', async () => {
			const resource = URI.file('/home/user/project/file.txt');
			const result = (await getResourceToLoad(resource, [], uriIdentityService, fileService));
			assert.strictEqual(result, undefined);
		});
	});
});

suite('Webview Resource Loading - resolved links', () => {
	const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * A link that the file system cannot resolve although the path is readable: `realpath` returns the
	 * unresolved path, or with `strict` fails with `code`, like the disk provider.
	 */
	interface IUnresolvable { readonly unresolvable: FileSystemProviderErrorCode; readonly isLink: boolean }
	type LinkTarget = string | undefined | IUnresolvable;

	/**
	 * Simulates a file system with links: `realpath` maps a lexical link prefix to its target,
	 * while reads at the lexical path succeed as if they followed the link.
	 */
	class LinkResolvingFileSystemProvider extends InMemoryFileSystemProvider {
		constructor(private readonly links: ReadonlyMap<string, LinkTarget>, private readonly canResolve = true) {
			super();
		}

		override get capabilities(): FileSystemProviderCapabilities {
			return this.canResolve ? super.capabilities | FileSystemProviderCapabilities.FileRealpath : super.capabilities;
		}

		override async stat(resource: URI): Promise<IStat> {
			const stat = await super.stat(resource);
			const target = this.links.get(resource.path);
			const isLink = this.links.has(resource.path) && (typeof target !== 'object' || target.isLink);
			return isLink ? { ...stat, type: stat.type | FileType.SymbolicLink } : stat;
		}

		async realpath(resource: URI, options?: IFileRealpathOptions): Promise<string> {
			for (const [link, target] of this.links) {
				if (resource.path === link || resource.path.startsWith(link + '/')) {
					if (target === undefined) {
						throw createFileSystemProviderError('dangling link', FileSystemProviderErrorCode.FileNotFound);
					}
					if (typeof target === 'object') {
						if (options?.strict) {
							throw createFileSystemProviderError('cannot resolve', target.unresolvable);
						}
						return toProviderPath(resource.path);
					}
					return toProviderPath(target + resource.path.substring(link.length));
				}
			}
			await super.stat(resource); // missing resources cannot be resolved
			return toProviderPath(resource.path);
		}
	}

	let providerPathStyle: 'posix' | 'windows' = 'posix';
	const toProviderPath = (path: string) => providerPathStyle === 'windows' ? path.replace(/^\//, '').replace(/\//g, '\\') : path;

	async function loadAll(scheme: string, links: ReadonlyMap<string, LinkTarget>, roots: readonly URI[], resources: readonly URI[], options?: { canResolve?: boolean; remoteOS?: OperatingSystem; missing?: readonly URI[] }) {
		const instantiationService = disposableStore.add(new TestInstantiationService());
		instantiationService.stub(ILogService, NullLogService);
		const fileService = disposableStore.add(new FileService(new NullLogService()));
		disposableStore.add(fileService.registerProvider(scheme, disposableStore.add(new LinkResolvingFileSystemProvider(links, options?.canResolve))));
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(IUriIdentityService, disposableStore.add(new UriIdentityService(fileService)));
		for (const resource of resources) {
			if (!options?.missing?.some(missing => missing.toString() === resource.toString())) {
				await fileService.writeFile(resource.with({ query: '' }), VSBuffer.fromString('content'));
			}
		}

		const results = [];
		for (const resource of resources) {
			const result = await instantiationService.invokeFunction(accessor => loadLocalResource(
				accessor,
				resource,
				{ ifNoneMatch: undefined, roots, remoteOS: options?.remoteOS },
				CancellationToken.None
			));
			if (result.type === WebviewResourceResponse.Type.Success) {
				result.stream.resume();
			}
			results.push({ resource: resource.path, type: WebviewResourceResponse.Type[result.type] });
		}
		return results;
	}

	setup(() => {
		providerPathStyle = 'posix';
	});

	test('getResourceToLoad validates real paths and preserves allowed request URIs', async () => {
		const links = new Map<string, LinkTarget>([
			['/ws/outside-link', '/outside'],
			['/ws/inner-link', '/ws/sub'],
			['/linked-ws', '/real-ws'],
			['/ws/dangling', undefined],
			['/ws/unresolvable', { unresolvable: FileSystemProviderErrorCode.Unavailable, isLink: true }],
		]);
		const fileService = disposableStore.add(new FileService(new NullLogService()));
		const provider = disposableStore.add(new LinkResolvingFileSystemProvider(links));
		disposableStore.add(fileService.registerProvider(Schemas.file, provider));
		const uriIdentityService = disposableStore.add(new UriIdentityService(fileService));
		const resources = [
			URI.file('/ws/inside.svg').with({ query: 'version=2', fragment: 'icon' }),
			URI.file('/ws/inner-link/inner.svg'),
			URI.file('/linked-ws/file.svg'),
			URI.file('/ws/outside-link/canary.svg'),
			URI.file('/ws/dangling/file.svg'),
			URI.file('/ws/unresolvable/file.svg'),
		];
		for (const resource of resources) {
			await fileService.writeFile(resource.with({ query: '', fragment: '' }), VSBuffer.fromString('content'));
		}
		const roots = [URI.file('/ws'), URI.file('/linked-ws')];
		const results = await Promise.all([...resources, URI.file('/ws/missing.svg')].map(resource =>
			getResourceToLoad(resource, roots, uriIdentityService, fileService)
		));
		assert.deepStrictEqual(results.map(result => result?.toString()), [
			...resources.slice(0, 3).map(resource => resource.toString()),
			undefined,
			undefined,
			undefined,
			undefined,
		]);
	});

	test('Denies links that resolve outside of all roots and allows links that stay inside', async () => {
		const links = new Map([
			['/ws/outside-link', '/outside'],
			['/ws/outside-file.svg', '/outside/canary.svg'],
			['/ws/inner-link', '/ws/sub'],
			['/ws/dangling', undefined],
		]);
		const file = (path: string) => URI.from({ scheme: 'test-links', path });

		assert.deepStrictEqual(await loadAll('test-links', links, [file('/ws')], [
			file('/ws/inside.svg'),
			file('/ws/inner-link/inner.svg'),
			file('/ws/outside-link/canary.svg'),
			file('/ws/outside-file.svg'),
			file('/ws/dangling/file.svg'),
		]), [
			{ resource: '/ws/inside.svg', type: 'Success' },
			{ resource: '/ws/inner-link/inner.svg', type: 'Success' },
			{ resource: '/ws/outside-link/canary.svg', type: 'AccessDenied' },
			{ resource: '/ws/outside-file.svg', type: 'AccessDenied' },
			{ resource: '/ws/dangling/file.svg', type: 'AccessDenied' },
		]);
	});

	test('Denies links that cannot be resolved, and allows readable paths without links that cannot be resolved', async () => {
		const links = new Map<string, LinkTarget>([
			['/ws/unresolvable-file.svg', { unresolvable: FileSystemProviderErrorCode.Unavailable, isLink: true }],
			// e.g. a link to the descriptor of an open, deleted file on Linux
			['/ws/unresolvable-folder', { unresolvable: FileSystemProviderErrorCode.FileNotFound, isLink: true }],
			// e.g. file systems on which resolving fails for every path
			['/ws/unusual-file-system', { unresolvable: FileSystemProviderErrorCode.Unavailable, isLink: false }],
		]);
		const file = (path: string) => URI.from({ scheme: 'test-links', path });

		assert.deepStrictEqual(await loadAll('test-links', links, [file('/ws')], [
			file('/ws/nested/inside.svg'),
			file('/ws/unresolvable-file.svg'),
			file('/ws/unresolvable-folder/canary.svg'),
			file('/ws/unusual-file-system/inside.svg'),
		]), [
			{ resource: '/ws/nested/inside.svg', type: 'Success' },
			{ resource: '/ws/unresolvable-file.svg', type: 'AccessDenied' },
			{ resource: '/ws/unresolvable-folder/canary.svg', type: 'AccessDenied' },
			{ resource: '/ws/unusual-file-system/inside.svg', type: 'Success' },
		]);
	});

	test('Reports missing resources inside a root as not found without reading them', async () => {
		const links = new Map<string, LinkTarget>([['/ws/outside-link', '/outside'], ['/ws/inner-link', '/ws/sub']]);
		const file = (path: string) => URI.from({ scheme: 'test-links', path });
		const missing = [file('/ws/missing.svg'), file('/ws/missing-folder/missing.svg'), file('/ws/inner-link/missing.svg'), file('/ws/outside-link/missing.svg')];

		assert.deepStrictEqual(await loadAll('test-links', links, [file('/ws')], [
			file('/ws/inside.svg'),
			...missing,
		], { missing }), [
			{ resource: '/ws/inside.svg', type: 'Success' },
			{ resource: '/ws/missing.svg', type: 'Failed' },
			{ resource: '/ws/missing-folder/missing.svg', type: 'Failed' },
			{ resource: '/ws/inner-link/missing.svg', type: 'Failed' },
			{ resource: '/ws/outside-link/missing.svg', type: 'AccessDenied' },
		]);
	});

	test('Allows resources when a root itself is a link, or the link resolves into another root', async () => {
		const links = new Map([
			['/linked-ws', '/real-ws'],
			['/ws/media-link', '/extension/media'],
		]);
		const file = (path: string) => URI.from({ scheme: 'test-links', path });

		assert.deepStrictEqual(await loadAll('test-links', links, [file('/linked-ws'), file('/ws'), file('/extension/media')], [
			file('/linked-ws/file.svg'),
			file('/ws/media-link/icon.svg'),
		]), [
			{ resource: '/linked-ws/file.svg', type: 'Success' },
			{ resource: '/ws/media-link/icon.svg', type: 'Success' },
		]);
	});

	test('Keeps the lexical check on file systems that cannot resolve links', async () => {
		const links = new Map([['/ws/outside-link', '/outside']]);
		const file = (path: string) => URI.from({ scheme: 'test-links', path });

		assert.deepStrictEqual(await loadAll('test-links', links, [file('/ws')], [
			file('/ws/outside-link/canary.svg'),
			file('/outside/canary.svg'),
		], { canResolve: false }), [
			{ resource: '/ws/outside-link/canary.svg', type: 'Success' },
			{ resource: '/outside/canary.svg', type: 'AccessDenied' },
		]);
	});

	test('Compares Windows paths resolved by a remote file system', async () => {
		providerPathStyle = 'windows';
		const links = new Map([
			['/c:/ws/outside-link', '/c:/outside'],
			['/c:/ws/inner-link', '/c:/ws/sub'],
		]);
		const remote = (path: string) => URI.from({ scheme: Schemas.vscodeRemote, authority: 'test', path });

		// The in-memory provider cannot serve the `/vscode-resource` request that is sent to a remote,
		// so an allowed resource fails to read (`Failed`) instead of being denied (`AccessDenied`).
		assert.deepStrictEqual(await loadAll(Schemas.vscodeRemote, links, [remote('/c:/ws')], [
			remote('/c:/ws/inner-link/inner.svg'),
			remote('/c:/ws/outside-link/canary.svg'),
		], { remoteOS: OperatingSystem.Windows }), [
			{ resource: '/c:/ws/inner-link/inner.svg', type: 'Failed' },
			{ resource: '/c:/ws/outside-link/canary.svg', type: 'AccessDenied' },
		]);
	});
});
