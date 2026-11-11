/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileChangesEvent, FileChangeType, IFileService, IWatchOptionsWithoutCorrelation } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { McpDevModeServerAttache } from '../../common/mcpDevMode.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { IMcpServer, McpCollectionDefinition, McpServerDefinition } from '../../common/mcpTypes.js';

suite('MCP Dev Mode', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses a broad workspace watcher and filters restart events in the listener', async () => {
		const root = URI.file('/workspace');
		const fileChanges = store.add(new Emitter<FileChangesEvent>());
		let watchedResource: URI | undefined;
		let watchOptions: IWatchOptionsWithoutCorrelation | undefined;
		let startCalls = 0;
		let stopCalls = 0;

		const collection = upcastPartial<McpCollectionDefinition>({
			presentation: { origin: URI.joinPath(root, '.vscode', 'mcp.json') },
		});
		const definition = upcastPartial<McpServerDefinition>({
			devMode: { watch: ['mcp/*.mjs', '!mcp/excluded/**'] },
		});
		const definitions = constObservable({ collection, server: definition });
		const server = upcastPartial<IMcpServer>({
			readDefinitions: () => definitions,
			start: async () => {
				startCalls++;
				return upcastPartial({});
			},
			stop: async () => {
				stopCalls++;
			},
		});
		const fileService = upcastPartial<IFileService>({
			watch: (resource, options) => {
				watchedResource = resource;
				watchOptions = options;
				return Disposable.None;
			},
			hasCapability: () => false,
			onDidFilesChange: fileChanges.event,
		});
		const workspaceContextService = upcastPartial<IWorkspaceContextService>({
			getWorkspaceFolder: () => toWorkspaceFolder(root),
		});
		const registry = upcastPartial<IMcpRegistry>({
			delegates: constObservable([]),
		});

		store.add(new McpDevModeServerAttache(server, { lastModeDebugged: false }, registry, fileService, workspaceContextService));
		fileChanges.fire(new FileChangesEvent([
			{ resource: URI.joinPath(root, '.custom', 'agent.agent.md'), type: FileChangeType.UPDATED },
			{ resource: URI.joinPath(root, 'mcp', 'excluded', 'server.mjs'), type: FileChangeType.UPDATED },
		], false));
		await timeout(0);
		fileChanges.fire(new FileChangesEvent([
			{ resource: URI.joinPath(root, 'mcp', 'server.mjs'), type: FileChangeType.UPDATED },
		], false));
		await timeout(0);

		assert.deepStrictEqual({
			watchedResource: watchedResource?.toString(),
			watchOptions,
			startCalls,
			stopCalls,
		}, {
			watchedResource: root.toString(),
			watchOptions: { excludes: [], recursive: true },
			startCalls: 1,
			stopCalls: 1,
		});
	});
});
