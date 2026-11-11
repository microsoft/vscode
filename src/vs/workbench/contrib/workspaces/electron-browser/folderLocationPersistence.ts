/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
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
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(this.folderLocationService.onDidChangeCurrentLocation(() => this.persist(this.folderLocationService.currentLocation)));

		const persisted = environmentService.folderLocation;
		if (persisted) {
			const cts = new CancellationTokenSource();
			this._register(toDisposable(() => cts.dispose(true)));
			this.restore(persisted, cts.token);
		}
	}

	private persist(location: IResolvedFolderLocation | undefined): void {
		const value: IWindowFolderLocation | undefined = location ? { uri: location.uri.toString(), label: location.label, providerId: location.providerId } : undefined;
		this.nativeHostService.setWindowFolderLocation(value);
	}

	private isAtAlternate(location: URI): boolean {
		const folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? this.contextService.getWorkspace().folders[0] : undefined;
		return !!folder?.primaryUri && this.uriIdentityService.extUri.isEqual(folder.uri, location);
	}

	private async restore(persisted: IWindowFolderLocation, token: CancellationToken): Promise<void> {
		const location = URI.parse(persisted.uri);

		if (!this.isAtAlternate(location)) {

			// The window could not start at the persisted location, for example because it is gone
			this.discard(persisted);
			return;
		}

		const primary = this.contextService.getWorkspace().folders[0].primaryUri!;
		const resolved = await this.resolve(primary, location, token);
		if (token.isCancellationRequested || this.folderLocationService.currentLocation || !this.isAtAlternate(location)) {
			return; // disposed, or switched by someone else in the meantime
		}

		if (resolved) {
			this.folderLocationService.setCurrentLocation(resolved);
		} else {
			await this.returnToPrimary(persisted, primary, location);
		}
	}

	/**
	 * Resolves the location through the providers, waiting for providers to register until the
	 * deadline. The deadline covers the resolution itself, and results arriving after it are dropped.
	 */
	private async resolve(primary: URI, location: URI, token: CancellationToken): Promise<IResolvedFolderLocation | undefined> {
		const store = new DisposableStore();
		try {
			const source = store.add(new CancellationTokenSource(token));
			const handle = setTimeout(() => source.cancel(), FOLDER_LOCATION_RESTORE_TIMEOUT);
			store.add(toDisposable(() => clearTimeout(handle)));

			const stopped = new Promise<undefined>(resolve => store.add(source.token.onCancellationRequested(() => resolve(undefined))));

			// Observed before resolving, so that a provider registering meanwhile is never missed
			let generation = 0;
			let wake: (() => void) | undefined;
			store.add(this.folderLocationService.onDidChangeProviders(() => {
				generation++;
				wake?.();
			}));

			while (!source.token.isCancellationRequested) {
				const seen = generation;
				const resolved = await Promise.race([this.folderLocationService.resolveLocation(primary, location, source.token).catch(() => undefined), stopped]);
				if (source.token.isCancellationRequested) {
					return undefined;
				}
				if (resolved) {
					return resolved;
				}

				if (generation === seen) {
					await Promise.race([new Promise<void>(resolve => { wake = resolve; }), stopped]);
					wake = undefined;
				}
			}

			return undefined;
		} finally {
			store.dispose();
		}
	}

	private async returnToPrimary(persisted: IWindowFolderLocation, primary: URI, location: URI): Promise<void> {
		try {

			// Does nothing while a newer switch is in flight: that one is authoritative
			await this.workspaceEditingService.setFolderLocation(primary, undefined, { ifIdle: true });
		} catch (error) {
			if (this.isAtAlternate(location)) {
				this.logService.error('Failed to return the folder to its primary location', error);
			}
			return; // otherwise the workspace changed, nothing to return from
		}

		const folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? this.contextService.getWorkspace().folders[0] : undefined;
		if (folder && !folder.primaryUri) {
			this.discard(persisted);
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
