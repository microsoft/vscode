/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { extUriIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { FileService } from '../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../platform/storage/common/storage.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentityService.js';
import { getResourceToLoad } from '../../../contrib/webview/browser/resourceLoading.js';
import { IOverlayWebview, WebviewContentOptions, WebviewExtensionDescription } from '../../../contrib/webview/browser/webview.js';
import { WebviewInput } from '../../../contrib/webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { TestEditorGroupsService, TestEditorService } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadWebviewPanels } from '../../browser/mainThreadWebviewPanels.js';
import { MainThreadWebviews } from '../../browser/mainThreadWebviews.js';
import { ExtHostWebviewPanelsShape, IWebviewContentOptions } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadWebviewPanels', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const extensionId = new ExtensionIdentifier('publisher.extension');
	const oldLocation = URI.file('/extensions/publisher.extension-1.0.0');
	const newLocation = URI.file('/extensions/publisher.extension-2.0.0');

	async function restore(
		localResourceRoots: readonly URI[] | undefined,
		oldExtension: WebviewExtensionDescription | null = { id: extensionId, location: oldLocation },
		currentLocation: URI | null = newLocation,
		uriIdentityService: IUriIdentityService = store.add(new UriIdentityService(store.add(new FileService(new NullLogService())))),
	) {
		const webview = new class extends mock<IOverlayWebview>() {
			override extension = oldExtension ?? undefined;
			override contentOptions: WebviewContentOptions = { allowScripts: true, localResourceRoots };
			override options = {};
			override onDidDispose = Event.None;
			override dispose() { }
		};
		const input = store.add(new WebviewInput({
			viewType: 'mainThreadWebview-test',
			providedId: 'test',
			name: 'Test',
			iconPath: undefined,
		}, webview, new TestThemeService()));
		const resolvers: Parameters<IWebviewWorkbenchService['registerResolver']>[0][] = [];
		let deserializedOptions: IWebviewContentOptions | undefined;
		const panels = store.add(new MainThreadWebviewPanels(
			SingleProxyRPCProtocol(new class extends mock<ExtHostWebviewPanelsShape>() {
				override async $deserializeWebviewPanel(...args: Parameters<ExtHostWebviewPanelsShape['$deserializeWebviewPanel']>) {
					deserializedOptions = args[2].webviewOptions;
				}
			}),
			new class extends mock<MainThreadWebviews>() {
				override addWebview() { }
			},
			new TestConfigurationService(),
			new TestEditorGroupsService(),
			store.add(new TestEditorService()),
			new class extends mock<IExtensionService>() {
				override async activateByEvent() { }
				override async getExtension(id: string) {
					assert.strictEqual(id, extensionId.value);
					return currentLocation ? { identifier: extensionId, extensionLocation: currentLocation } as IExtensionDescription : undefined;
				}
			},
			store.add(new InMemoryStorageService()),
			new class extends mock<IWebviewWorkbenchService>() {
				override onDidChangeActiveWebviewEditor = Event.None;
				override registerResolver(resolver: Parameters<IWebviewWorkbenchService['registerResolver']>[0]) {
					resolvers.push(resolver);
					return Disposable.None;
				}
			},
			uriIdentityService,
		));
		panels.$registerSerializer('test', { serializeBuffersForPostMessage: false });
		await resolvers.find(resolver => resolver.canResolve(input))!.resolveWebview(input, CancellationToken.None);
		assert.deepStrictEqual(deserializedOptions, webview.contentOptions);
		return { webview, uriIdentityService };
	}

	test('restores extension-relative roots before deserializing without widening access', async () => {
		const { webview, uriIdentityService } = await restore([URI.joinPath(oldLocation, 'dist')]);
		const script = URI.joinPath(newLocation, 'dist', 'webview.js');
		assert.deepStrictEqual({
			extension: webview.extension,
			options: { ...webview.contentOptions, localResourceRoots: webview.contentOptions.localResourceRoots?.map(root => root.toString()) },
			allowedScript: getResourceToLoad(script, webview.contentOptions.localResourceRoots!, uriIdentityService)?.toString(),
			deniedScript: getResourceToLoad(URI.joinPath(newLocation, 'private', 'secret.txt'), webview.contentOptions.localResourceRoots!, uriIdentityService)?.toString(),
			oldScript: getResourceToLoad(URI.joinPath(oldLocation, 'dist', 'webview.js'), webview.contentOptions.localResourceRoots!, uriIdentityService)?.toString(),
		}, {
			extension: { id: extensionId, location: newLocation },
			options: { allowScripts: true, localResourceRoots: [URI.joinPath(newLocation, 'dist').toString()] },
			allowedScript: script.toString(),
			deniedScript: undefined,
			oldScript: undefined,
		});
	});

	test('preserves unrelated roots and relocates the extension root itself', async () => {
		const unrelated = [
			URI.file('/workspace'),
			URI.file(`${oldLocation.path}-other/dist`),
			oldLocation.with({ scheme: 'other' }),
			URI.parse('vscode-remote://other/extensions/publisher.extension-1.0.0/dist'),
			oldLocation.with({ path: `${oldLocation.path}/../outside` }),
		];
		const { webview } = await restore([oldLocation, ...unrelated]);
		assert.deepStrictEqual(webview.contentOptions, { allowScripts: true, localResourceRoots: [newLocation, ...unrelated] });
	});

	test('relocates remote extension roots', async () => {
		const oldRemote = URI.parse('vscode-remote://ssh-remote+host/extensions/publisher.extension-1.0.0');
		const newRemote = oldRemote.with({ path: '/extensions/publisher.extension-2.0.0' });
		const otherHostRoot = URI.joinPath(oldRemote.with({ authority: 'ssh-remote+other' }), 'dist');
		const { webview } = await restore([URI.joinPath(oldRemote, 'dist'), otherHostRoot], { id: extensionId, location: oldRemote }, newRemote);
		assert.deepStrictEqual(webview.contentOptions.localResourceRoots, [URI.joinPath(newRemote, 'dist'), otherHostRoot]);
	});

	test('relocates Windows extension roots with spaces and trailing separators', async () => {
		const oldWindows = URI.parse('file:///c:/Users/Code%20User/.vscode/extensions/publisher.extension-1.0.0/');
		const newWindows = URI.parse('file:///c:/Users/Code%20User/.vscode/extensions/publisher.extension-2.0.0');
		const { webview } = await restore([URI.joinPath(oldWindows, 'dist')], { id: extensionId, location: oldWindows }, newWindows);
		assert.deepStrictEqual(webview.contentOptions.localResourceRoots?.map(root => root.toString()), [URI.joinPath(newWindows, 'dist').toString()]);
	});

	test('preserves subdirectories on case-insensitive file systems', async () => {
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override extUri = extUriIgnorePathCase;
		};
		const { webview } = await restore(
			[oldLocation.with({ path: `${oldLocation.path.toUpperCase()}/dist` })],
			{ id: extensionId, location: oldLocation },
			newLocation,
			uriIdentityService,
		);
		assert.deepStrictEqual(webview.contentOptions.localResourceRoots?.map(root => root.toString()), [URI.joinPath(newLocation, 'dist').toString()]);
	});

	for (const roots of [undefined, []]) {
		test(`preserves ${roots ? 'empty' : 'unspecified'} roots`, async () => {
			const { webview } = await restore(roots);
			assert.deepStrictEqual(webview.contentOptions, { allowScripts: true, localResourceRoots: roots });
		});
	}

	test('leaves roots unchanged when the extension location has not changed', async () => {
		const roots = [URI.joinPath(oldLocation, 'dist')];
		const { webview } = await restore(roots, { id: extensionId, location: oldLocation }, oldLocation);
		assert.strictEqual(webview.contentOptions.localResourceRoots, roots);
	});

	test('leaves roots unchanged when the extension is unavailable', async () => {
		const roots = [URI.joinPath(oldLocation, 'dist')];
		const { webview } = await restore(roots, { id: extensionId, location: oldLocation }, null);
		assert.deepStrictEqual(webview.extension, { id: extensionId, location: oldLocation });
		assert.strictEqual(webview.contentOptions.localResourceRoots, roots);
	});

	test('leaves roots unchanged when the saved extension is unknown', async () => {
		const roots = [URI.joinPath(oldLocation, 'dist')];
		const { webview } = await restore(roots, null);
		assert.strictEqual(webview.contentOptions.localResourceRoots, roots);
	});

	test('leaves roots unchanged when the saved extension location is unknown', async () => {
		const roots = [URI.joinPath(oldLocation, 'dist')];
		const { webview } = await restore(roots, { id: extensionId });
		assert.strictEqual(webview.contentOptions.localResourceRoots, roots);
	});
});
