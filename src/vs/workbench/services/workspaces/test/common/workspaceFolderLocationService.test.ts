/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILabelService, IWorkspaceLabelDecorator } from '../../../../../platform/label/common/label.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, WorkbenchState, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
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

	function createService(workspace = new Workspace('id', [new WorkspaceFolder({ uri: primary, name: '', index: 0 })], false, null, () => false), decorators: IWorkspaceLabelDecorator[] = []): WorkspaceFolderLocationService {
		const labelService = new class extends mock<ILabelService>() {
			override registerWorkspaceLabelDecorator(decorator: IWorkspaceLabelDecorator) { decorators.push(decorator); return toDisposable(() => { }); }
		}();
		return new WorkspaceFolderLocationService(disposables.add(new UriIdentityService(disposables.add(new FileService(new NullLogService())))), new TestContextService(workspace), labelService);
	}

	const folder = (uri: URI) => new WorkspaceFolder({ uri, name: '', index: 0 });
	const atAlternate = () => new Workspace('id', [folder(a)], false, null, () => false, undefined, primary);

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

	test('setLocation fires a per-folder event and getLocation follows it', () => {
		const workspace = atAlternate();
		const service = disposables.add(createService(workspace));
		const events: string[] = [];
		disposables.add(service.onDidChangeLocation(e => events.push(`${e.folder.uri.path}:${e.reason}`)));
		const location = { uri: a, label: 'A', providerId: 'x', builtIn: false };

		service.setLocation(workspace.folders[0], location, 'user');
		const set = service.getLocation(workspace.folders[0]);
		service.setLocation(workspace.folders[0], undefined);

		assert.deepStrictEqual({ events, set, cleared: service.getLocation(workspace.folders[0]) }, { events: ['/a:user', '/a:programmatic'], set: location, cleared: undefined });
	});

	test('folder identity and alternate location checks', () => {
		const check = (workspace: Workspace) => disposables.add(createService(workspace)).isAtAlternateLocation(workspace.folders[0]);

		assert.deepStrictEqual(
			{
				alternate: check(atAlternate()),
				atIdentity: check(new Workspace('id', [folder(primary)], false, null, () => false, undefined, primary)),
				withoutIdentity: check(new Workspace('id', [folder(a)], false, null, () => false)),
				multiRootSingleFolder: check(new Workspace('id', [folder(a)], false, URI.file('/ws.code-workspace'), () => false))
			},
			{ alternate: true, atIdentity: false, withoutIdentity: false, multiRootSingleFolder: false });
	});

	test('label decorator describes the folder at an alternate location by its current location and identity', () => {
		const decorators: IWorkspaceLabelDecorator[] = [];
		const workspace = atAlternate();
		const service = disposables.add(createService(workspace, decorators));
		const decorator = decorators[0];
		const before = decorator.getFolderLocationLabel(a);

		service.setLocation(workspace.folders[0], { uri: a, label: 'A', description: 'x', providerId: 'x', builtIn: false });
		const changed: string[] = [];
		disposables.add(decorator.onDidChange(uri => changed.push(uri.path)));
		service.setLocation(workspace.folders[0], { uri: a, label: 'A', providerId: 'x', builtIn: false });

		assert.deepStrictEqual(
			{ before, current: decorator.getFolderLocationLabel(a), byIdentity: decorator.getFolderLocationLabel(primary), other: decorator.getFolderLocationLabel(b), changed },
			{ before: undefined, current: 'A', byIdentity: 'A', other: undefined, changed: ['/a'] });
	});

	test('canSetLocation is true only for the folder of a local single-folder workspace', () => {
		const service = (workspace: Workspace) => disposables.add(createService(workspace));
		const remote = URI.from({ scheme: 'vscode-remote', authority: 'host', path: '/r' });
		const multiRoot = new Workspace('id', [folder(a), folder(b)], false, URI.file('/w.code-workspace'), () => false);

		assert.deepStrictEqual({
			singleFolder: service(new Workspace('id', [folder(primary)], false, null, () => false)).canSetLocation(folder(primary)),
			atAlternate: service(atAlternate()).canSetLocation(folder(a)),
			otherFolder: service(atAlternate()).canSetLocation(folder(b)),
			multiRoot: service(multiRoot).canSetLocation(folder(a)),
			empty: service(new Workspace('id', [], false, null, () => false)).canSetLocation(folder(a)),
			remote: service(new Workspace('id', [folder(remote)], false, null, () => false)).canSetLocation(folder(remote))
		}, { singleFolder: true, atAlternate: true, otherFolder: false, multiRoot: false, empty: false, remote: false });
	});

	test('onDidChangeCanSetLocation fires when the workspace folders or state change', () => {
		const folders = disposables.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const state = disposables.add(new Emitter<WorkbenchState>());
		const contextService = new class extends mock<IWorkspaceContextService>() {
			override onDidChangeWorkspaceFolders = folders.event;
			override onDidChangeWorkbenchState = state.event;
		}();
		const labelService = new class extends mock<ILabelService>() {
			override registerWorkspaceLabelDecorator() { return toDisposable(() => { }); }
		}();
		const service = disposables.add(new WorkspaceFolderLocationService(disposables.add(new UriIdentityService(disposables.add(new FileService(new NullLogService())))), contextService, labelService));
		let fired = 0;
		disposables.add(service.onDidChangeCanSetLocation(() => fired++));

		folders.fire({ added: [], removed: [], changed: [] });
		state.fire(WorkbenchState.WORKSPACE);

		assert.strictEqual(fired, 2);
	});
});
