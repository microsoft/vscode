/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWindowFolderLocation } from '../../../../../platform/window/common/window.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { FOLDER_LOCATION_RESTORE_TIMEOUT, FolderLocationPersistenceContribution } from '../../electron-browser/folderLocationPersistence.js';

suite('FolderLocationPersistenceContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const alternate = URI.file('/work/project-alt');
	const resolvedLocation: IResolvedFolderLocation = { uri: alternate, label: 'Alternate', providerId: 'test', builtIn: true };
	const persisted: IWindowFolderLocation = { uri: alternate.toString(), label: 'Alternate', providerId: 'test' };

	interface IFixtureOptions {
		readonly persisted?: IWindowFolderLocation;
		readonly folderUri?: URI;
		readonly providerAvailable?: boolean;
		readonly folderLocationMissing?: { readonly label: string };
		readonly resolveLocation?: () => Promise<IResolvedFolderLocation | undefined>;
		readonly multiRoot?: boolean;
		readonly confirmed?: IResolvedFolderLocation;
		readonly setFolderLocation?: (location: URI, options?: { readonly ifIdle?: boolean }) => Promise<void>;
	}

	function createFixture(options: IFixtureOptions) {
		const persistedCalls: (IWindowFolderLocation | undefined)[] = [];
		const notifications: string[] = [];
		const notificationIds: (string | undefined)[] = [];
		const errors: string[] = [];
		const returns: URI[] = [];
		const prompts: { readonly choices: string[]; run(): Promise<void>; closed(): boolean }[] = [];
		const onDidChangeProviders = ds.add(new Emitter<void>());
		const onDidChangeWorkbenchState = ds.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = ds.add(new Emitter<void>());
		const onDidChangeCurrentLocation = ds.add(new Emitter<{ readonly folder: unknown; readonly reason: 'user' | 'programmatic' }>());
		let currentLocation: IResolvedFolderLocation | undefined = options.confirmed;
		let providerAvailable = !!options.providerAvailable;
		let folderUri = options.folderUri ?? alternate;

		let multiRoot = !!options.multiRoot;
		const getWorkspace = () => multiRoot
			? new Workspace('multi', [new WorkspaceFolder({ uri: folderUri, name: 'project', index: 0 })], false, URI.file('/work/a.code-workspace'), () => false)
			: new Workspace('id', [new WorkspaceFolder({ uri: folderUri, name: 'project', index: 0 })], false, null, () => false, undefined, primary);

		const locationService = {
			onDidChangeProviders: onDidChangeProviders.event,
			onDidChangeLocation: onDidChangeCurrentLocation.event,
			isAtAlternateLocation: () => !multiRoot && !extUri.isEqual(folderUri, primary),
			getLocation: () => currentLocation,
			setLocation(folder: unknown, location: IResolvedFolderLocation | undefined) { currentLocation = location; onDidChangeCurrentLocation.fire({ folder, reason: 'programmatic' }); },
			resolveLocation: options.resolveLocation ?? (async () => providerAvailable ? resolvedLocation : undefined)
		} as unknown as IWorkspaceFolderLocationService;

		const contribution = ds.add(new FolderLocationPersistenceContribution(
			{ getWorkspace, onDidChangeWorkbenchState: onDidChangeWorkbenchState.event, onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event } as unknown as IWorkspaceContextService,
			locationService,
			{
				setFolderLocation: options.setFolderLocation ?? (async (l: URI) => { returns.push(l); folderUri = l; })
			} as unknown as IWorkspaceEditingService,
			{ setWindowFolderLocation: (value: IWindowFolderLocation | undefined) => { persistedCalls.push(value); } } as unknown as INativeHostService,
			{ folderLocation: options.persisted, folderLocationMissing: options.folderLocationMissing } as unknown as INativeWorkbenchEnvironmentService,
			{
				notify: (n: { message: string; id?: string }) => { notifications.push(n.message); notificationIds.push(n.id); },
				prompt: (_severity: unknown, _message: string, choices: { label: string; run: () => unknown }[]) => {
					const onDidClose = ds.add(new Emitter<void>());
					let closed = false;
					prompts.push({ choices: choices.map(c => c.label), run: async () => { await choices[0].run(); }, closed: () => closed });
					return { onDidClose: onDidClose.event, close: () => { closed = true; onDidClose.fire(); } };
				}
			} as unknown as INotificationService,
			{ extUri } as unknown as IUriIdentityService,
			{ error: (message: string) => { errors.push(message); } } as unknown as ILogService
		));

		return {
			persistedCalls, notifications, notificationIds, errors, returns, prompts, locationService, contribution,
			registerProvider() { providerAvailable = true; onDidChangeProviders.fire(); },
			fireProvidersChanged() { onDidChangeProviders.fire(); },
			current: () => currentLocation,
			setCurrent(location: IResolvedFolderLocation | undefined) { currentLocation = location; onDidChangeCurrentLocation.fire({ folder: getWorkspace().folders[0], reason: 'programmatic' }); },
			hasProvidersListener: () => onDidChangeProviders.hasListeners(),
			moveFolderTo(uri: URI) { folderUri = uri; },
			enterMultiRoot() { multiRoot = true; onDidChangeWorkbenchState.fire(); onDidChangeWorkspaceFolders.fire(); },
			dispose: () => contribution.dispose()
		};
	}

	const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

	test('a confirmed location becomes the current location and is persisted', async () => {
		const fixture = createFixture({ persisted, providerAvailable: true });
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.current()?.label, persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns },
			{ current: 'Alternate', persisted: [persisted], notifications: [], returns: [] });
	});

	test('the restore failure notification carries an id so that it is never duplicated', async () => {
		const fixture = createFixture({ persisted, folderUri: primary });
		await settle();

		assert.deepStrictEqual(fixture.notificationIds, ['workbench.folderLocationRestoreFailed']);
	});

	test('a missing location is discarded and the user is notified', async () => {
		const fixture = createFixture({ persisted, folderUri: primary });
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.current(), persisted: fixture.persistedCalls, notifications: fixture.notifications.length, returns: fixture.returns },
			{ current: undefined, persisted: [undefined], notifications: 1, returns: [] });
	});

	test('a provider registering late confirms the location', async () => {
		const fixture = createFixture({ persisted });
		await settle();
		const before: IResolvedFolderLocation | undefined = fixture.current();
		assert.strictEqual(before, undefined);

		fixture.registerProvider();
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.current()?.label, notifications: fixture.notifications, returns: fixture.returns },
			{ current: 'Alternate', notifications: [], returns: [] });
	});

	test('a fresh open at the primary persists nothing and does not notify', async () => {
		const fixture = createFixture({ folderUri: primary });
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.current(), persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns },
			{ current: undefined, persisted: [], notifications: [], returns: [] });
	});

	test('a provider that never resolves leaves the window at the location and offers to return, without switching', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }) });

		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		assert.deepStrictEqual(
			{ current: fixture.current(), persisted: fixture.persistedCalls, prompts: fixture.prompts.map(p => p.choices), returns: fixture.returns, listeners: fixture.hasProvidersListener() },
			{ current: undefined, persisted: [], prompts: [['Return to Primary Location']], returns: [], listeners: false });
	}));

	test('the return offered for an unconfirmed location switches to the primary when chosen', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }) });
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		await fixture.prompts[0].run();

		assert.deepStrictEqual(fixture.returns.map(r => r.toString()), [primary.toString()]);
	}));

	test('a failing return chosen by the user is logged', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }), setFolderLocation: async () => { throw new Error('failed'); } });
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		await fixture.prompts[0].run();

		assert.strictEqual(fixture.errors.length, 1);
	}));

	test('the offer to return is withdrawn once the location is switched by someone else', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }) });
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		fixture.setCurrent(resolvedLocation);

		assert.strictEqual(fixture.prompts[0].closed(), true);
	}));

	test('the offer to return is withdrawn when the contribution is disposed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }) });
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		fixture.dispose();

		assert.strictEqual(fixture.prompts[0].closed(), true);
	}));

	test('the offer to return is withdrawn when the workspace becomes multi-root', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }) });
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		fixture.enterMultiRoot();
		await fixture.prompts[0].run();

		assert.deepStrictEqual({ closed: fixture.prompts[0].closed(), returns: fixture.returns }, { closed: true, returns: [] });
	}));

	test('the offer to return does nothing when the folder is no longer at the location', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }) });
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		fixture.moveFolderTo(primary);
		await fixture.prompts[0].run();

		assert.deepStrictEqual(fixture.returns, []);
	}));

	test('a positive result after the deadline is ignored', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const resolution = new DeferredPromise<IResolvedFolderLocation | undefined>();
		const fixture = createFixture({ persisted, resolveLocation: () => resolution.p });

		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);
		resolution.complete(resolvedLocation);
		await timeout(1);

		assert.deepStrictEqual({ current: fixture.current(), returns: fixture.returns, prompts: fixture.prompts.length }, { current: undefined, returns: [], prompts: 1 });
	}));

	test('a location that no longer exists is reported once and nothing is persisted', async () => {
		const fixture = createFixture({ folderUri: primary, folderLocationMissing: { label: 'Gone' } });
		await settle();

		assert.deepStrictEqual(
			{ notifications: fixture.notifications, ids: fixture.notificationIds, persisted: fixture.persistedCalls, returns: fixture.returns },
			{ notifications: ['The folder location \'Gone\' no longer exists. The folder was opened at its primary location.'], ids: ['workbench.folderLocationMissing'], persisted: [], returns: [] });
	});

	test('a provider registering while the resolution is pending is not missed', async () => {
		const first = new DeferredPromise<IResolvedFolderLocation | undefined>();
		let calls = 0;
		const fixture = createFixture({ persisted, resolveLocation: () => ++calls === 1 ? first.p : Promise.resolve(resolvedLocation) });
		await settle();

		fixture.fireProvidersChanged();
		first.complete(undefined);
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.current()?.label, calls, notifications: fixture.notifications, returns: fixture.returns },
			{ current: 'Alternate', calls: 2, notifications: [], returns: [] });
	});

	test('disposing while the resolution is pending has no side effects', async () => {
		const resolution = new DeferredPromise<IResolvedFolderLocation | undefined>();
		const fixture = createFixture({ persisted, resolveLocation: () => resolution.p });
		await settle();

		fixture.contribution.dispose();
		resolution.complete(resolvedLocation);
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.current(), persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns, listeners: fixture.hasProvidersListener() },
			{ current: undefined, persisted: [], notifications: [], returns: [], listeners: false });
	});

	test('disposing while waiting for providers has no side effects', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted });
		await timeout(1);

		fixture.contribution.dispose();
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		assert.deepStrictEqual(
			{ current: fixture.current(), persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns, listeners: fixture.hasProvidersListener() },
			{ current: undefined, persisted: [], notifications: [], returns: [], listeners: false });
	}));

	test('a location already confirmed at construction is respected and persisted', async () => {
		const other: IResolvedFolderLocation = { uri: URI.file('/work/project-other'), label: 'Other', providerId: 'test', builtIn: true };
		const fixture = createFixture({ persisted, folderUri: other.uri, confirmed: other });
		await settle();

		assert.deepStrictEqual(
			{ persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns },
			{ persisted: [{ uri: other.uri.toString(), label: 'Other', providerId: 'test' }], notifications: [], returns: [] });
	});

	test('a location confirmed before instantiation without a startup location is persisted', async () => {
		const other: IResolvedFolderLocation = { uri: URI.file('/work/project-other'), label: 'Other', providerId: 'test', builtIn: true };
		const fixture = createFixture({ folderUri: other.uri, confirmed: other });
		await settle();

		assert.deepStrictEqual(fixture.persistedCalls, [{ uri: other.uri.toString(), label: 'Other', providerId: 'test' }]);
	});

	test('a stale location in a multi-root window is cleaned up without a warning', async () => {
		const fixture = createFixture({ persisted, multiRoot: true });
		await settle();

		assert.deepStrictEqual(
			{ persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns },
			{ persisted: [undefined], notifications: [], returns: [] });
	});
});
