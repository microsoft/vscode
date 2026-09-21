/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { INativeCliLifecycleEvent } from '../../../../../../platform/agentHost/common/nativeCliLifecycle.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { NativeCopilotLifecycleObserver } from '../../browser/nativeCopilotLifecycleObserver.js';

suite('Native Copilot foreground observer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const first = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
	const second = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

	test('follows idle new and resume records from only the owned CLI log', async () => {
		const log = new NullLogService();
		const files = store.add(new FileService(log));
		store.add(files.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IFileService, files);
		instantiation.stub(ILogService, log);
		const directory = URI.file('/private-cli/logs');
		const home = URI.file('/copilot');
		await files.createFolder(directory);
		for (const [id, cwd, title] of [[first, '/first', 'First task'], [second, '/second', 'Second task']]) {
			const folder = joinPath(home, 'session-state', id);
			await files.createFolder(folder);
			await files.writeFile(joinPath(folder, 'workspace.yaml'), VSBuffer.fromString(`id: ${id}\ncwd: ${cwd}\nname: ${title}\n`));
		}
		const record = (id: string, second: number) => `2026-09-14T17:06:${second}.000Z [INFO] Registering foreground session: ${id}\n`;
		await files.writeFile(joinPath(directory, 'process-1-1.log'), VSBuffer.fromString(record(second, 10)));
		const resource = joinPath(directory, 'process-2-2.log');
		const initial = `${'x'.repeat(70000)}\n${record(first, 11)}`;
		await files.writeFile(resource, VSBuffer.fromString(initial));
		const events: INativeCliLifecycleEvent[] = [];
		const errors: unknown[] = [];
		const observer = store.add(instantiation.createInstance(NativeCopilotLifecycleObserver, directory, home, first, async event => {
			events.push(event);
		}, error => errors.push(error)));
		await observer.read();
		await files.writeFile(resource, VSBuffer.fromString(`${initial}${record(second, 12)}${record(first, 13)}`));
		await observer.read();
		await observer.read();

		assert.deepStrictEqual({
			events: events.map(({ sessionId, cwd, title, event, source }) => ({ sessionId, cwd, title, event, source })),
			errors, available: observer.hasEvents,
		}, {
			events: [
				{ sessionId: first, cwd: '/first', title: 'First task', event: 'start', source: 'switch' },
				{ sessionId: second, cwd: '/second', title: 'Second task', event: 'start', source: 'switch' },
				{ sessionId: first, cwd: '/first', title: 'First task', event: 'start', source: 'switch' },
			],
			errors: [], available: true,
		});
	});
});
