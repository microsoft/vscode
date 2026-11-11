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

		function createService(options: { current: URI; primaryTrusted: boolean; currentTrusted?: boolean; builtIn?: boolean }) {
			const trusted: URI[] = [];
			const resolved: URI[] = [];
			const switched: (URI | undefined)[] = [];
			const folder = { uri: options.current, primaryUri: URI.file('/work/project') };
			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				{
					getWorkbenchState: () => WorkbenchState.FOLDER,
					getWorkspace: () => ({ folders: [options.current.path === '/work/project' ? { uri: options.current } : folder] }),
					setFolderLocation: async (_primary: URI, location: URI | undefined) => { switched.push(location); }
				},
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				{
					isWorkspaceTrusted: () => options.currentTrusted ?? options.primaryTrusted,
					getUriTrustInfo: async () => ({ trusted: options.primaryTrusted }),
					setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); }
				},
				undefined, undefined, undefined,
				{
					resolveLocation: async (_primary: URI, location: URI) => { resolved.push(location); return { uri: location, label: 'L', providerId: 'test', builtIn: options.builtIn ?? true }; },
					setCurrentLocation: () => { }
				}
			));
			return { service, trusted: () => trusted.map(u => u.toString()), resolved: () => resolved.length, switched: () => switched.map(u => u?.toString()) };
		}

		test('a wrong primary is rejected without resolving, trusting or switching', async () => {
			const fixture = createService({ current: URI.file('/work/project'), primaryTrusted: true });
			await assert.rejects(() => fixture.service.setFolderLocation(URI.file('/work/other'), URI.file('/work/alt')));
			assert.deepStrictEqual({ resolved: fixture.resolved(), trusted: fixture.trusted(), switched: fixture.switched() }, { resolved: 0, trusted: [], switched: [] });
		});

		test('trust is inherited from the primary, not from the current location', async () => {
			const alt = URI.file('/work/alt');

			// Trusted current alternate, untrusted primary: no inheritance
			const untrustedPrimary = createService({ current: URI.file('/work/b'), primaryTrusted: false, currentTrusted: true });
			await untrustedPrimary.service.setFolderLocation(URI.file('/work/project'), alt);

			// Untrusted current alternate, trusted primary: inheritance
			const trustedPrimary = createService({ current: URI.file('/work/b'), primaryTrusted: true, currentTrusted: false });
			await trustedPrimary.service.setFolderLocation(URI.file('/work/project'), alt);

			assert.deepStrictEqual({ untrustedPrimary: untrustedPrimary.trusted(), trustedPrimary: trustedPrimary.trusted() }, { untrustedPrimary: [], trustedPrimary: [alt.toString()] });
		});

		test('the last invocation wins regardless of resolution order', async () => {
			const primary = URI.file('/work/project');
			const first = URI.file('/work/first');
			const second = URI.file('/work/second');
			const resolutions = new Map<string, DeferredPromise<IResolvedFolderLocation>>([[first.toString(), new DeferredPromise()], [second.toString(), new DeferredPromise()]]);
			const switched: (URI | undefined)[] = [];
			const trusted: URI[] = [];

			const service = ds.add(new (BrowserWorkspaceEditingService as unknown as new (...args: unknown[]) => BrowserWorkspaceEditingService)(
				undefined,
				{ getWorkbenchState: () => WorkbenchState.FOLDER, getWorkspace: () => ({ folders: [{ uri: primary }] }), setFolderLocation: async (_primary: URI, location: URI | undefined) => { switched.push(location); } },
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
				{ extUri },
				{ isWorkspaceTrusted: () => true, getUriTrustInfo: async () => ({ trusted: true }), setUrisTrust: async (uris: URI[]) => { trusted.push(...uris); } },
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
