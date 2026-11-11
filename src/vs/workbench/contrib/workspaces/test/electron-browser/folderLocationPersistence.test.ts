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
import { IWorkspaceContextService, Workspace, WorkspaceFolder, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
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
		readonly resolveLocation?: () => Promise<IResolvedFolderLocation | undefined>;
		readonly setFolderLocation?: (primary: URI, location: URI | undefined, options?: { readonly ifIdle?: boolean }) => Promise<void>;
	}

	function createFixture(options: IFixtureOptions) {
		const persistedCalls: (IWindowFolderLocation | undefined)[] = [];
		const notifications: string[] = [];
		const errors: string[] = [];
		const returns: [URI, URI | undefined][] = [];
		const onDidChangeProviders = ds.add(new Emitter<void>());
		const onDidChangeCurrentLocation = ds.add(new Emitter<void>());
		let currentLocation: IResolvedFolderLocation | undefined;
		let providerAvailable = !!options.providerAvailable;
		let folderUri = options.folderUri ?? alternate;

		const getWorkspace = () => new Workspace('id', [new WorkspaceFolder({ uri: folderUri, primaryUri: extUri.isEqual(folderUri, primary) ? undefined : primary, name: 'project', index: 0 })], false, null, () => false);

		const locationService = {
			onDidChangeProviders: onDidChangeProviders.event,
			onDidChangeCurrentLocation: onDidChangeCurrentLocation.event,
			get currentLocation() { return currentLocation; },
			setCurrentLocation(location: IResolvedFolderLocation | undefined) { currentLocation = location; onDidChangeCurrentLocation.fire({ reason: 'programmatic' }); },
			resolveLocation: options.resolveLocation ?? (async () => providerAvailable ? resolvedLocation : undefined)
		} as unknown as IWorkspaceFolderLocationService;

		const contribution = ds.add(new FolderLocationPersistenceContribution(
			{ getWorkbenchState: () => WorkbenchState.FOLDER, getWorkspace } as unknown as IWorkspaceContextService,
			locationService,
			{
				setFolderLocation: options.setFolderLocation ?? (async (p: URI, l: URI | undefined) => { returns.push([p, l]); folderUri = l ?? p; })
			} as unknown as IWorkspaceEditingService,
			{ setWindowFolderLocation: (value: IWindowFolderLocation | undefined) => { persistedCalls.push(value); } } as unknown as INativeHostService,
			{ folderLocation: options.persisted } as unknown as INativeWorkbenchEnvironmentService,
			{ notify: (n: { message: string }) => { notifications.push(n.message); } } as unknown as INotificationService,
			{ extUri } as unknown as IUriIdentityService,
			{ error: (message: string) => { errors.push(message); } } as unknown as ILogService
		));

		return {
			persistedCalls, notifications, errors, returns, locationService, contribution,
			registerProvider() { providerAvailable = true; onDidChangeProviders.fire(); },
			fireProvidersChanged() { onDidChangeProviders.fire(); },
			hasProvidersListener: () => onDidChangeProviders.hasListeners(),
			moveFolderTo(uri: URI) { folderUri = uri; }
		};
	}

	const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

	test('a confirmed location becomes the current location and is persisted', async () => {
		const fixture = createFixture({ persisted, providerAvailable: true });
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation?.label, persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns },
			{ current: 'Alternate', persisted: [persisted], notifications: [], returns: [] });
	});

	test('a missing location is discarded and the user is notified', async () => {
		const fixture = createFixture({ persisted, folderUri: primary });
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation, persisted: fixture.persistedCalls, notifications: fixture.notifications.length, returns: fixture.returns },
			{ current: undefined, persisted: [undefined], notifications: 1, returns: [] });
	});

	test('a provider registering late confirms the location', async () => {
		const fixture = createFixture({ persisted });
		await settle();
		const before: IResolvedFolderLocation | undefined = fixture.locationService.currentLocation;
		assert.strictEqual(before, undefined);

		fixture.registerProvider();
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation?.label, notifications: fixture.notifications, returns: fixture.returns },
			{ current: 'Alternate', notifications: [], returns: [] });
	});

	test('a fresh open at the primary persists nothing and does not notify', async () => {
		const fixture = createFixture({ folderUri: primary });
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation, persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns },
			{ current: undefined, persisted: [], notifications: [], returns: [] });
	});

	test('a provider that never resolves does not block the return to the primary', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, resolveLocation: () => new Promise(() => { }) });

		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation, persisted: fixture.persistedCalls, notifications: fixture.notifications.length, returns: fixture.returns.map(([p, l]) => [p.toString(), l?.toString()]), listeners: fixture.hasProvidersListener() },
			{ current: undefined, persisted: [undefined], notifications: 1, returns: [[primary.toString(), undefined]], listeners: false });
	}));

	test('a positive result after the deadline is ignored', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const resolution = new DeferredPromise<IResolvedFolderLocation | undefined>();
		const fixture = createFixture({ persisted, resolveLocation: () => resolution.p });

		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);
		resolution.complete(resolvedLocation);
		await timeout(1);

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation, returns: fixture.returns.length, notifications: fixture.notifications.length },
			{ current: undefined, returns: 1, notifications: 1 });
	}));

	test('a provider registering while the resolution is pending is not missed', async () => {
		const first = new DeferredPromise<IResolvedFolderLocation | undefined>();
		let calls = 0;
		const fixture = createFixture({ persisted, resolveLocation: () => ++calls === 1 ? first.p : Promise.resolve(resolvedLocation) });
		await settle();

		fixture.fireProvidersChanged();
		first.complete(undefined);
		await settle();

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation?.label, calls, notifications: fixture.notifications, returns: fixture.returns },
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
			{ current: fixture.locationService.currentLocation, persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns, listeners: fixture.hasProvidersListener() },
			{ current: undefined, persisted: [], notifications: [], returns: [], listeners: false });
	});

	test('disposing while waiting for providers has no side effects', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted });
		await timeout(1);

		fixture.contribution.dispose();
		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		assert.deepStrictEqual(
			{ current: fixture.locationService.currentLocation, persisted: fixture.persistedCalls, notifications: fixture.notifications, returns: fixture.returns, listeners: fixture.hasProvidersListener() },
			{ current: undefined, persisted: [], notifications: [], returns: [], listeners: false });
	}));

	test('the return is not announced while a newer switch is in flight', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const other = URI.file('/work/project-other');
		const fixture = createFixture({
			persisted,
			// the newer switch moved the folder, so the idle-only return does nothing
			setFolderLocation: async (_p, _l, options) => { assert.strictEqual(options?.ifIdle, true); fixture.moveFolderTo(other); }
		});

		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		assert.deepStrictEqual({ persisted: fixture.persistedCalls, notifications: fixture.notifications }, { persisted: [], notifications: [] });
	}));

	test('a rejected return is logged and not announced', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({ persisted, setFolderLocation: async () => { throw new Error('failed'); } });

		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		assert.deepStrictEqual({ persisted: fixture.persistedCalls, notifications: fixture.notifications, errors: fixture.errors.length }, { persisted: [], notifications: [], errors: 1 });
	}));

	test('a return rejected because the workspace changed is neither logged nor announced', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = createFixture({
			persisted,
			setFolderLocation: async () => { fixture.moveFolderTo(URI.file('/work/elsewhere')); throw new Error('workspace changed'); }
		});

		await timeout(FOLDER_LOCATION_RESTORE_TIMEOUT + 1);

		assert.deepStrictEqual({ persisted: fixture.persistedCalls, notifications: fixture.notifications, errors: fixture.errors }, { persisted: [], notifications: [], errors: [] });
	}));
});
