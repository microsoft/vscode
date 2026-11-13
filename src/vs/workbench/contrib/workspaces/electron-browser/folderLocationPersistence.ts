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
import { IWorkspaceContextService, isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
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
 * The main process only starts a window at an alternate location that exists (otherwise the window
 * opens at the primary location and `folderLocationMissing` tells the user). The window starts there
 * without any trust being granted. Once a provider confirms the location, it becomes the current
 * location. If no provider does, the user is offered to return to the primary location: the window
 * never switches back by itself.
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

		this._register(this.folderLocationService.onDidChangeLocation(e => this.persist(this.folderLocationService.getLocation(e.folder))));

		const missing = environmentService.folderLocationMissing;
		if (missing) {
			this.notificationService.notify({
				id: 'workbench.folderLocationMissing',
				severity: Severity.Warning,
				message: localize('folderLocationMissing', "The folder location '{0}' no longer exists. The folder was opened at its primary location.", missing.label)
			});
		}

		const persisted = environmentService.folderLocation;
		if (persisted) {
			const cts = new CancellationTokenSource();
			this._register(toDisposable(() => cts.dispose(true)));
			this.restore(persisted, cts.token);
		} else {

			// A switch may have been confirmed before this contribution was instantiated
			const current = this.contextService.getWorkspace();
			const folder = current.folders[0];
			const confirmed = folder && isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(current)) ? this.folderLocationService.getLocation(folder) : undefined;
			if (confirmed) {
				this.persist(confirmed);
			}
		}
	}

	private persist(location: IResolvedFolderLocation | undefined): void {
		const value: IWindowFolderLocation | undefined = location ? { uri: location.uri.toString(), label: location.label, providerId: location.providerId } : undefined;
		this.nativeHostService.setWindowFolderLocation(value);
	}

	private isAtAlternate(location: URI): boolean {
		const folder = this.contextService.getWorkspace().folders[0];
		return !!folder && this.folderLocationService.isAtAlternateLocation(folder) && this.uriIdentityService.extUri.isEqual(folder.uri, location);
	}

	private async restore(persisted: IWindowFolderLocation, token: CancellationToken): Promise<void> {
		const location = URI.parse(persisted.uri);

		// The state is reconciled against the current workspace: it may have changed since startup
		const current = this.contextService.getWorkspace();
		const folder = current.folders[0];
		if (!folder || !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(current))) {
			this.nativeHostService.setWindowFolderLocation(undefined); // stale: no longer a single-folder window
			return;
		}

		const confirmed = this.folderLocationService.getLocation(folder);
		if (confirmed) {
			this.persist(confirmed); // already switched and confirmed, that state is authoritative
			return;
		}

		if (!this.isAtAlternate(location)) {
			if (this.folderLocationService.isAtAlternateLocation(folder)) {
				this.nativeHostService.setWindowFolderLocation(undefined); // moved to another location in the meantime
			} else {

				// The window could not start at the persisted location, for example because it is gone
				this.discard(persisted);
			}
			return;
		}

		const workspace = this.contextService.getWorkspace();
		const primary = workspace.uri ?? workspace.folders[0].uri;

		const resolved = await this.resolve(primary, location, token);
		if (token.isCancellationRequested || this.folderLocationService.getLocation(this.contextService.getWorkspace().folders[0]) || !this.isAtAlternate(location)) {
			return; // disposed, or switched by someone else in the meantime
		}

		if (resolved) {
			this.folderLocationService.setLocation(this.contextService.getWorkspace().folders[0], resolved);
		} else {
			this.offerReturnToPrimary(persisted, primary);
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

	private offerReturnToPrimary(persisted: IWindowFolderLocation, primary: URI): void {
		const location = URI.parse(persisted.uri);
		const handle = this.notificationService.prompt(
			Severity.Warning,
			localize('folderLocationUnconfirmed', "The folder location '{0}' could not be confirmed. The folder is still open there.", persisted.label),
			[{
				label: localize('returnToPrimaryFolderLocation', "Return to Primary Location"),
				run: () => {
					if (this.isStillAt(primary, location)) {
						return this.workspaceEditingService.setFolderLocation(primary).catch(error => this.logService.error('Failed to return the folder to its primary location', error));
					}
					return undefined;
				}
			}],
			{ sticky: true }
		);

		// The question is moot once the location is confirmed or changed, the workspace changes or this is disposed
		const store = this._register(new DisposableStore());
		store.add(toDisposable(() => handle.close()));
		const stop = () => store.dispose();
		store.add(this.folderLocationService.onDidChangeLocation(stop));
		store.add(this.contextService.onDidChangeWorkbenchState(stop));
		store.add(this.contextService.onDidChangeWorkspaceFolders(stop));
		store.add(handle.onDidClose(stop));
	}

	private isStillAt(primary: URI, location: URI): boolean {
		const workspace = this.contextService.getWorkspace();
		const folder = workspace.folders[0];
		return !!folder && isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(workspace))
			&& this.uriIdentityService.extUri.isEqual(workspace.uri ?? folder.uri, primary)
			&& !this.folderLocationService.getLocation(folder)
			&& this.isAtAlternate(location);
	}

	private discard(persisted: IWindowFolderLocation): void {
		this.nativeHostService.setWindowFolderLocation(undefined);
		this.notificationService.notify({
			id: 'workbench.folderLocationRestoreFailed',
			severity: Severity.Warning,
			message: localize('folderLocationRestoreFailed', "Could not restore the folder location '{0}'. The folder is open at its primary location.", persisted.label)
		});
	}
}
