/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkspaceFolderLocationService, IResolvedFolderLocation } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWindowFolderLocation } from '../../../../platform/window/common/window.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IWorkspaceEditingService } from '../../../services/workspaces/common/workspaceEditing.js';

/**
 * The time to wait for a provider to confirm the persisted location. Providers
 * may register after the window has been restored.
 */
export const FOLDER_LOCATION_RESTORE_TIMEOUT = 10000;

/**
 * Keeps the main process informed about the alternate location the window is at
 * so that it survives a reload or restart, and confirms the location the window
 * has been started at.
 *
 * The window starts at the persisted alternate location (see `WorkspaceService`),
 * without any trust being granted. Once a provider confirms the location, it
 * becomes the current location. If no provider does, the window returns to the
 * primary location.
 */
export class FolderLocationPersistenceContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationPersistence';

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceEditingService private readonly workspaceEditingService: IWorkspaceEditingService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@INotificationService private readonly notificationService: INotificationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		this._register(this.folderLocationService.onDidChangeCurrentLocation(() => this.persist(this.folderLocationService.currentLocation)));

		const persisted = environmentService.configuration.folderLocation;
		if (persisted) {
			const cts = this._register(new CancellationTokenSource());
			this.restore(persisted, cts.token);
		}
	}

	private persist(location: IResolvedFolderLocation | undefined): void {
		const value: IWindowFolderLocation | undefined = location ? { uri: location.uri.toString(), label: location.label, providerId: location.providerId } : undefined;
		this.nativeHostService.setWindowFolderLocation(value);
	}

	private async restore(persisted: IWindowFolderLocation, token: CancellationToken): Promise<void> {
		const location = URI.parse(persisted.uri);

		const folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? this.contextService.getWorkspace().folders[0] : undefined;
		if (!folder?.primaryUri || !this.uriIdentityService.extUri.isEqual(folder.uri, location)) {

			// The window could not start at the persisted location, for example because it is gone
			this.discard(persisted);
			return;
		}

		const primary = folder.primaryUri;
		const resolved = await this.resolve(primary, location, token);
		if (token.isCancellationRequested || this.folderLocationService.currentLocation) {
			return; // disposed, or switched by someone else in the meantime
		}

		const current = this.contextService.getWorkspace().folders[0];
		if (current?.primaryUri && this.uriIdentityService.extUri.isEqual(current.uri, location)) {
			if (resolved) {
				this.folderLocationService.setCurrentLocation(resolved);
			} else {
				await this.discardAndReturn(persisted, primary);
			}
		}
	}

	private async resolve(primary: URI, location: URI, token: CancellationToken): Promise<IResolvedFolderLocation | undefined> {
		const deadline = Date.now() + FOLDER_LOCATION_RESTORE_TIMEOUT;

		while (!token.isCancellationRequested) {
			const resolved = await this.folderLocationService.resolveLocation(primary, location, token);
			if (resolved) {
				return resolved;
			}

			const remaining = deadline - Date.now();
			if (remaining <= 0 || !await this.waitForProviders(remaining, token)) {
				return undefined;
			}
		}

		return undefined;
	}

	/**
	 * Resolves to `true` once the providers changed, or to `false` after `timeout` or if cancelled.
	 */
	private waitForProviders(timeout: number, token: CancellationToken): Promise<boolean> {
		return new Promise<boolean>(resolve => {
			const store = new DisposableStore();
			const done = (changed: boolean) => {
				store.dispose();
				resolve(changed);
			};

			store.add(this.folderLocationService.onDidChangeProviders(() => done(true)));
			store.add(token.onCancellationRequested(() => done(false)));
			const handle = setTimeout(() => done(false), timeout);
			store.add({ dispose: () => clearTimeout(handle) });
		});
	}

	private async discardAndReturn(persisted: IWindowFolderLocation, primary: URI): Promise<void> {
		this.discard(persisted);
		try {
			await this.workspaceEditingService.setFolderLocation(primary, undefined);
		} catch (error) {
			// the workspace changed, nothing to return from
		}
	}

	private discard(persisted: IWindowFolderLocation): void {
		this.nativeHostService.setWindowFolderLocation(undefined);
		this.notificationService.notify({
			severity: Severity.Warning,
			message: localize('folderLocationRestoreFailed', "Could not restore the folder location '{0}'. The folder is open at its primary location.", persisted.label)
		});
	}
}
