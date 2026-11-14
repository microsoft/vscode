/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { CopilotModelRouterCatalog, findModelRouter, UserModelRouterSource, type IModelRouterFile, type IModelRouterSource } from '../../node/copilot/copilotModelRouterCatalog.js';

const router = (description: string) => `version: 1\ndescription: ${description}\nroutes:\n  - model: a\n    when: A.\n  - model: b\n    when: B.\n`;

suite('CopilotModelRouterCatalog', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let store: DisposableStore;
	let fileService: FileService;
	const home = URI.file('/home');
	const agentsFolder = joinPath(home, '.agents', 'model-routers');
	const copilotFolder = joinPath(home, '.copilot', 'model-routers');

	setup(() => {
		store = disposables.add(new DisposableStore());
		fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
	});

	const write = (folder: URI, name: string, content: string) => fileService.writeFile(joinPath(folder, name), VSBuffer.fromString(content));

	test('reads ~/.agents before ~/.copilot, one file per name, and keeps invalid files with their errors', async () => {
		await write(agentsFolder, 'daily.model-router.yaml', router('From agents.'));
		await write(copilotFolder, 'daily.model-router.yml', router('From copilot.'));
		await write(copilotFolder, 'broken.model-router.yaml', 'version: 2\n');
		await write(copilotFolder, 'notes.yaml', router('Not a router file.'));
		const source = store.add(new UserModelRouterSource([agentsFolder, copilotFolder], home, fileService, new NullLogService()));
		const files = await source.read(CancellationToken.None);
		assert.deepStrictEqual(files.map(file => [file.name, file.router?.description, file.diagnostics.length > 0]), [
			['daily', 'From agents.', false],
			['broken', undefined, true],
		]);
	});

	test('publishes only the newest scan, and finds routers by model id', async () => {
		const onDidChange = store.add(new Emitter<void>());
		let reads = 0;
		const releases: (() => void)[] = [];
		const file = (name: string): IModelRouterFile => ({ uri: URI.file(`/${name}`), scope: 'user', name, router: undefined, diagnostics: [] });
		const source: IModelRouterSource = {
			scope: 'user',
			onDidChange: onDidChange.event,
			read: () => {
				const name = `scan-${++reads}`;
				return new Promise(resolve => releases.push(() => resolve([file(name)])));
			},
			dispose: () => { },
		};
		const catalog = store.add(new CopilotModelRouterCatalog([source], new NullLogService()));
		const settled = catalog.whenSettled();
		// Start a second scan while the first is still running, then finish them out of order.
		onDidChange.fire();
		await new Promise(resolve => setTimeout(resolve, 250));
		releases[1]();
		releases[0]();
		const snapshot = await settled;
		assert.deepStrictEqual({ settled: snapshot?.files.map(f => f.name), published: catalog.snapshot?.files.map(f => f.name) }, { settled: ['scan-2'], published: ['scan-2'] });
		assert.strictEqual(findModelRouter(snapshot, URI.file('/chat'), 'model-router:scan-2')?.name, 'scan-2');
		assert.strictEqual(findModelRouter(snapshot, URI.file('/chat'), 'claude-opus-5'), undefined);
	});

	test('notices a router folder created after it started', async () => {
		await fileService.createFolder(home);
		const catalog = store.add(new CopilotModelRouterCatalog([store.add(new UserModelRouterSource([agentsFolder], home, fileService, new NullLogService()))], new NullLogService()));
		assert.deepStrictEqual((await catalog.whenSettled())?.files, []);
		const changed = Event.toPromise(catalog.onDidChange);
		await write(agentsFolder, 'daily.model-router.yaml', router('New.'));
		await changed;
		assert.deepStrictEqual(catalog.snapshot?.files.map(f => f.name), ['daily']);
	});
});
