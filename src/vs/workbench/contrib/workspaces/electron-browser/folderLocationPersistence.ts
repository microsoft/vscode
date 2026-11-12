/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
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
 * The window starts at the persisted alternate location (see `WorkspaceService`),
 * without any trust being granted or the location being validated. A missing location
 * is detected asynchronously and the window returns to the primary location. Once a provider confirms the location, it
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
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this._register(this.folderLocationService.onDidChangeLocation(e => this.persist(this.folderLocationService.getLocation(e.folder))));

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
		const folder = this.contextService.getWorkspace().folders[0];
		return !!folder && this.folderLocationService.isAtAlternateLocation(folder) && this.uriIdentityService.extUri.isEqual(folder.uri, location);
	}

	private async restore(persisted: IWindowFolderLocation, token: CancellationToken): Promise<void> {
		const location = URI.parse(persisted.uri);

		if (!this.isAtAlternate(location)) {

			// The window could not start at the persisted location, for example because it is gone
			this.discard(persisted);
			return;
		}

		const workspace = this.contextService.getWorkspace();
		const identity = toWorkspaceIdentifier(workspace);
		const primary = isSingleFolderWorkspaceIdentifier(identity) ? identity.uri : workspace.folders[0].uri;

		// The location is applied at startup without validation, so a missing one is detected here
		const exists = await this.isDirectory(location);
		if (token.isCancellationRequested || this.folderLocationService.getLocation(this.contextService.getWorkspace().folders[0]) || !this.isAtAlternate(location)) {
			return; // disposed, or switched by someone else in the meantime
		}

		if (!exists) {
			await this.returnToPrimary(persisted, primary, location, token);
			return;
		}

		const resolved = await this.resolve(primary, location, token);
		if (token.isCancellationRequested || this.folderLocationService.getLocation(this.contextService.getWorkspace().folders[0]) || !this.isAtAlternate(location)) {
			return; // disposed, or switched by someone else in the meantime
		}

		if (resolved) {
			this.folderLocationService.setLocation(this.contextService.getWorkspace().folders[0], resolved);
		} else {
			await this.returnToPrimary(persisted, primary, location, token);
		}
	}

	private async isDirectory(location: URI): Promise<boolean> {
		try {
			return (await this.fileService.stat(location)).isDirectory;
		} catch (error) {
			return false;
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

	private async returnToPrimary(persisted: IWindowFolderLocation, primary: URI, location: URI, token: CancellationToken): Promise<void> {
		try {

			// Does nothing while a newer switch is in flight: that one is authoritative
			await this.workspaceEditingService.setFolderLocation(primary, { ifIdle: true });
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}
			if (this.isAtAlternate(location)) {
				this.logService.error('Failed to return the folder to its primary location', error);
			}
			return; // otherwise the workspace changed, nothing to return from
		}

		if (token.isCancellationRequested) {
			return;
		}

		// Only announce when this is still the original single-folder workspace, at its primary location
		const workspace = this.contextService.getWorkspace();
		const identity = toWorkspaceIdentifier(workspace);
		const folder = workspace.folders[0];
		if (isSingleFolderWorkspaceIdentifier(identity) && this.uriIdentityService.extUri.isEqual(identity.uri, primary) && folder && this.uriIdentityService.extUri.isEqual(folder.uri, primary)) {
			this.discard(persisted);
		}
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
