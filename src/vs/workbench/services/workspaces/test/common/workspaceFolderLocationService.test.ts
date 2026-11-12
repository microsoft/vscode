/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IFolderLocation, IWorkspaceFolderLocationProvider } from '../../../../../platform/workspace/common/folderLocations.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspaceFolderLocationService } from '../../common/workspaceFolderLocationService.js';

suite('WorkspaceFolderLocationService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/primary');
	const a = URI.file('/a');
	const b = URI.file('/b');

	function provider(id: string, locations: IFolderLocation[], fail = false): IWorkspaceFolderLocationProvider {
		return {
			id,
			provideLocations: async () => { if (fail) { throw new Error('fail'); } return locations; },
			resolveLocation: async (_primary, location) => { if (fail) { throw new Error('fail'); } return locations.find(l => l.uri.toString() === location.toString()); }
		};
	}

	function createService(workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: '', index: 0 })], false, null, () => false)): WorkspaceFolderLocationService {
		return new WorkspaceFolderLocationService(disposables.add(new UriIdentityService(disposables.add(new FileService(new NullLogService())))), new TestContextService(workspace));
	}

	test('getLocations merges providers, dedupes and reports failures', async () => {
		const reported: string[] = [];
		const previous = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error.message));
		disposables.add(toDisposable(() => setUnexpectedErrorHandler(previous)));
		const service = disposables.add(createService());
		disposables.add(service.registerProvider(provider('x', [{ uri: a, label: 'A' }], true)));
		disposables.add(service.registerProvider(provider('y', [{ uri: a, label: 'A' }, { uri: b, label: 'B' }])));
		disposables.add(service.registerProvider(provider('z', [{ uri: a, label: 'A2' }])));

		const actual = await service.getLocations(primary, CancellationToken.None);

		assert.deepStrictEqual({ labels: actual.map(l => l.label), reported }, { labels: ['A', 'B'], reported: ['fail'] });
	});

	test('resolveLocation reports provider and built-in flag', async () => {
		const service = disposables.add(createService());
		const registration = disposables.add(service.registerProvider(provider('x', [{ uri: a, label: 'A' }]), { builtIn: true }));
		disposables.add(service.registerProvider(provider('y', [{ uri: b, label: 'B' }])));

		const resolvedA = await service.resolveLocation(primary, a, CancellationToken.None);
		const resolvedB = await service.resolveLocation(primary, b, CancellationToken.None);
		const unknown = await service.resolveLocation(primary, URI.file('/c'), CancellationToken.None);
		registration.dispose();
		const afterDispose = await service.resolveLocation(primary, a, CancellationToken.None);

		assert.deepStrictEqual(
			{ a: [resolvedA?.providerId, resolvedA?.builtIn], b: [resolvedB?.providerId, resolvedB?.builtIn], unknown, afterDispose },
			{ a: ['x', true], b: ['y', false], unknown: undefined, afterDispose: undefined });
	});

	test('setCurrentLocation fires an event', () => {
		const service = disposables.add(createService());
		const reasons: string[] = [];
		disposables.add(service.onDidChangeCurrentLocation(e => reasons.push(e.reason)));

		service.setCurrentLocation({ uri: a, label: 'A', providerId: 'x', builtIn: false }, 'user');
		service.setCurrentLocation(undefined);

		assert.deepStrictEqual({ reasons, current: service.currentLocation }, { reasons: ['user', 'programmatic'], current: undefined });
	});

	test('folder identity and alternate location checks', () => {
		const folder = (uri: URI) => new WorkspaceFolder({ uri, name: '', index: 0 });
		const check = (workspace: Workspace) => disposables.add(createService(workspace)).isAtAlternateLocation();

		assert.deepStrictEqual(
			{
				alternate: check(new Workspace('id', [folder(a)], false, null, () => false, undefined, { id: 'id', uri: primary })),
				atIdentity: check(new Workspace('id', [folder(primary)], false, null, () => false, undefined, { id: 'id', uri: primary })),
				withoutIdentity: check(new Workspace('id', [folder(a)], false, null, () => false)),
				multiRootSingleFolder: check(new Workspace('id', [folder(a)], false, URI.file('/ws.code-workspace'), () => false, undefined, { id: 'id', configPath: URI.file('/ws.code-workspace') }))
			},
			{ alternate: true, atIdentity: false, withoutIdentity: false, multiRootSingleFolder: false });
	});

	test('getLocationText joins label and description', () => {
		const service = disposables.add(createService());

		assert.deepStrictEqual(
			[service.getLocationText({ label: 'A' }), service.getLocationText({ label: 'A', description: 'x' })],
			['A', 'A · x']);
	});
});
