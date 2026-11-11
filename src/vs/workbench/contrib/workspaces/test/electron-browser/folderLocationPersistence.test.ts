/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWindowFolderLocation } from '../../../../../platform/window/common/window.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, Workspace, WorkspaceFolder, WorkbenchState } from '../../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { IWorkspaceEditingService } from '../../../../services/workspaces/common/workspaceEditing.js';
import { FolderLocationPersistenceContribution } from '../../electron-browser/folderLocationPersistence.js';

suite('FolderLocationPersistenceContribution', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/project');
	const alternate = URI.file('/work/project-alt');
	const resolvedLocation: IResolvedFolderLocation = { uri: alternate, label: 'Alternate', providerId: 'test', builtIn: true };
	const persisted: IWindowFolderLocation = { uri: alternate.toString(), label: 'Alternate', providerId: 'test' };

	function createFixture(options: { persisted?: IWindowFolderLocation; folderUri?: URI; providerAvailable?: boolean }) {
		const persistedCalls: (IWindowFolderLocation | undefined)[] = [];
		const notifications: string[] = [];
		const returns: [URI, URI | undefined][] = [];
		const onDidChangeProviders = ds.add(new Emitter<void>());
		const onDidChangeCurrentLocation = ds.add(new Emitter<void>());
		let currentLocation: IResolvedFolderLocation | undefined;
		let providerAvailable = !!options.providerAvailable;

		const folderUri = options.folderUri ?? alternate;
		const workspace = new Workspace('id', [new WorkspaceFolder({ uri: folderUri, primaryUri: extUri.isEqual(folderUri, primary) ? undefined : primary, name: 'project', index: 0 })], false, null, () => false);

		const locationService = {
			onDidChangeProviders: onDidChangeProviders.event,
			onDidChangeCurrentLocation: onDidChangeCurrentLocation.event,
			get currentLocation() { return currentLocation; },
			setCurrentLocation(location: IResolvedFolderLocation | undefined) { currentLocation = location; onDidChangeCurrentLocation.fire(); },
			resolveLocation: async () => providerAvailable ? resolvedLocation : undefined
		} as unknown as IWorkspaceFolderLocationService;

		ds.add(new FolderLocationPersistenceContribution(
			{ getWorkbenchState: () => WorkbenchState.FOLDER, getWorkspace: () => workspace } as unknown as IWorkspaceContextService,
			locationService,
			{ setFolderLocation: async (p: URI, l: URI | undefined) => { returns.push([p, l]); } } as unknown as IWorkspaceEditingService,
			{ setWindowFolderLocation: (value: IWindowFolderLocation | undefined) => { persistedCalls.push(value); } } as unknown as INativeHostService,
			{ configuration: { folderLocation: options.persisted } } as unknown as INativeWorkbenchEnvironmentService,
			{ notify: (n: { message: string }) => { notifications.push(n.message); } } as unknown as INotificationService,
			{ extUri } as unknown as IUriIdentityService
		));

		return {
			persistedCalls, notifications, returns, locationService,
			registerProvider() { providerAvailable = true; onDidChangeProviders.fire(); }
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
		assert.strictEqual(fixture.locationService.currentLocation, undefined);

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
});
