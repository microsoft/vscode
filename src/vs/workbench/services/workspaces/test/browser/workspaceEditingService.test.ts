/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DidEnterWorkspaceEvent } from '../../browser/abstractWorkspaceEditingService.js';
import { BrowserWorkspaceEditingService } from '../../browser/workspaceEditingService.js';
import { UNKNOWN_EMPTY_WINDOW_WORKSPACE, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { IResolvedFolderLocation } from '../../../../../platform/workspace/common/folderLocations.js';
import { extUri } from '../../../../../base/common/resources.js';
import { DeferredPromise } from '../../../../../base/common/async.js';

suite('WorkspaceEditingService', () => {

	suite('DidEnterWorkspaceEvent', () => {

		test('event captures old workspace and new workspace URI', () => {
			const oldWorkspace = { id: 'old-folder', uri: URI.file('/old/folder') };
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(oldWorkspace, newWorkspace);

			assert.strictEqual(event.oldWorkspace, oldWorkspace);
			assert.strictEqual(event.newWorkspace, newWorkspace);
		});

		test('join collects promises', async () => {
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);

			let executed1 = false;
			let executed2 = false;

			event.join(
				(async () => { executed1 = true; })(),
			);

			event.join(
				(async () => { executed2 = true; })(),
			);

			await event.wait();

			assert.strictEqual(executed1, true, 'First promise should have executed');
			assert.strictEqual(executed2, true, 'Second promise should have executed');
		});

		test('wait resolves when all promises complete', async () => {
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);

			let resolve1: () => void;
			let resolve2: () => void;
			const promise1 = new Promise<void>(r => { resolve1 = r; });
			const promise2 = new Promise<void>(r => { resolve2 = r; });

			event.join(promise1);
			event.join(promise2);

			let waitCompleted = false;
			const waitPromise = event.wait().then(() => { waitCompleted = true; });

			// Should not be completed yet
			await Promise.resolve();
			assert.strictEqual(waitCompleted, false);

			// Resolve first promise
			resolve1!();
			await Promise.resolve();
			assert.strictEqual(waitCompleted, false);

			// Resolve second promise
			resolve2!();
			await waitPromise;
			assert.strictEqual(waitCompleted, true);
		});

		test('wait resolves immediately when no promises are joined', async () => {
			const newWorkspace = { id: 'new-workspace', configPath: URI.file('/test/workspace.code-workspace') };
			const event = new DidEnterWorkspaceEvent(UNKNOWN_EMPTY_WINDOW_WORKSPACE, newWorkspace);

			await event.wait();
			// Should complete without error
		});
	});

	suite('setFolderLocation', () => {

		test('the last invocation wins regardless of resolution order', async () => {
			const primary = URI.file('/work/project');
			const first = URI.file('/work/first');
			const second = URI.file('/work/second');
			const resolutions = new Map<string, DeferredPromise<IResolvedFolderLocation>>([[first.toString(), new DeferredPromise()], [second.toString(), new DeferredPromise()]]);
			const switched: (URI | undefined)[] = [];
			const trusted: URI[] = [];

			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				{ getWorkbenchState: () => WorkbenchState.FOLDER, setFolderLocation: async (_primary: URI, location: URI | undefined) => { switched.push(location); } },
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				{ isWorkspaceTrusted: () => true, setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); } },
				undefined, undefined, undefined,
				{ resolveLocation: (_primary: URI, location: URI) => resolutions.get(location.toString())!.p, setCurrentLocation: () => { } }
			));

			const p1 = service.setFolderLocation(primary, first);
			const p2 = service.setFolderLocation(primary, second);
			resolutions.get(second.toString())!.complete({ uri: second, label: 'Second', providerId: 'test', builtIn: true });
			await p2;
			resolutions.get(first.toString())!.complete({ uri: first, label: 'First', providerId: 'test', builtIn: true });
			await p1;

			assert.deepStrictEqual({ switched: switched.map(u => u?.toString()), trusted: trusted.map(u => u.toString()) }, { switched: [second.toString()], trusted: [second.toString()] });
		});
	});

	const ds = ensureNoDisposablesAreLeakedInTestSuite();
});
