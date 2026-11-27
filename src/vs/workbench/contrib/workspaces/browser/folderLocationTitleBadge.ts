/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../platform/workspace/common/folderLocations.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IActivityService, IViewTitleBadge } from '../../../services/activity/common/activity.js';
import { IAgenticModeService } from '../../../services/agenticMode/common/agenticMode.js';
import { IEditableWorkspaceContextService } from '../../../services/configuration/common/configuration.js';
import { SESSIONS_FILES_VIEW_ID, VIEW_ID } from '../../files/common/files.js';

/** The views that show the files of the workspace folder, in the editor window and in the Agents window. */
const FOLDER_VIEW_IDS = [VIEW_ID, SESSIONS_FILES_VIEW_ID];

/**
 * Shows the location of the workspace folder after the title of the views of its files, while the folder of a
 * single-folder workspace is at an alternate location, such as a worktree. In Agentic Mode, also while the one
 * mounted folder was moved to an alternate location of the folder it was mounted from.
 */
export class FolderLocationTitleBadgeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.folderLocationTitleBadge';

	private readonly badges = this._register(new MutableDisposable<DisposableStore>());
	private readonly resolving = this._register(new MutableDisposable<IDisposable>());

	constructor(
		@IWorkspaceFolderLocationService private readonly folderLocationService: IWorkspaceFolderLocationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService & Partial<Pick<IEditableWorkspaceContextService, 'getFolderPrimaryLocation'>>,
		@ILabelService private readonly labelService: ILabelService,
		@IActivityService private readonly activityService: IActivityService,
		@IAgenticModeService private readonly agenticModeService: IAgenticModeService
	) {
		super();

		this._register(this.folderLocationService.onDidChangeLocation(() => this.update()));
		this._register(this.folderLocationService.onDidChangeCanSetLocation(() => this.update()));
		this._register(this.folderLocationService.onDidChangeLocations(() => this.update()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.update()));
		this._register(this.agenticModeService.onDidChange(() => this.update()));
		this._register(this.labelService.onDidChangeFormatters(() => this.update()));
		this.update();
	}

	private update(): void {
		this.resolving.clear();
		const moved = this.getMovedFolder();
		if (moved) {
			// Keeps the badge shown until the location resolves, so that it does not flicker
			const cts = new CancellationTokenSource();
			this.resolving.value = toDisposable(() => cts.dispose(true));
			this.resolveAndShow(moved, cts.token).catch(onUnexpectedError);
			return;
		}
		this.show(this.getBadge());
	}

	private async resolveAndShow(moved: { readonly folder: IWorkspaceFolder; readonly primary: URI }, token: CancellationToken): Promise<void> {
		let location: IResolvedFolderLocation | undefined;
		try {
			location = await this.folderLocationService.resolveLocation(moved.primary, moved.folder.uri, token);
		} catch {
			location = undefined;
		}
		if (token.isCancellationRequested) {
			return;
		}
		this.show(location ? this.toBadge(moved.folder, location, basename(moved.primary)) : undefined);
		this.resolving.clear();
	}

	private show(badge: IViewTitleBadge | undefined): void {
		if (!badge) {
			this.badges.clear();
			return;
		}
		const store = new DisposableStore();
		for (const viewId of FOLDER_VIEW_IDS) {
			store.add(this.activityService.showViewTitleBadge(viewId, badge));
		}
		this.badges.value = store;
	}

	private getBadge(): IViewTitleBadge | undefined {
		const workspace = this.contextService.getWorkspace();
		const folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? workspace.folders[0] : undefined;
		const location = folder ? this.folderLocationService.getLocation(folder) : undefined;
		if (!folder || !location) {
			return undefined;
		}
		return this.toBadge(folder, location, workspace.uri ? basename(workspace.uri) : folder.name);
	}

	/**
	 * In Agentic Mode the workspace moves its one mounted folder in place, such as into a worktree, and remembers the
	 * location it was mounted from (its primary location).
	 */
	private getMovedFolder(): { readonly folder: IWorkspaceFolder; readonly primary: URI } | undefined {
		if (!this.agenticModeService.isActive) {
			return undefined;
		}
		const folders = this.contextService.getWorkspace().folders;
		const folder = folders.length === 1 ? folders[0] : undefined;
		const primary = folder && this.contextService.getFolderPrimaryLocation?.(folder.uri);
		return folder && primary && this.folderLocationService.isAtAlternateLocation(folder) ? { folder, primary } : undefined;
	}

	private toBadge(folder: IWorkspaceFolder, location: IResolvedFolderLocation, primaryName: string): IViewTitleBadge {
		const locationLabel = this.labelService.getFolderLocationLabel(folder.uri) ?? location.label;
		return {
			icon: location.icon,
			label: location.label,
			tooltip: localize('folderLocationTitleBadgeTooltip', "{0} (alternate location of '{1}')", locationLabel, primaryName),
			ariaLabel: localize('folderLocationTitleBadgeAria', "Folder Location, {0}", locationLabel)
		};
	}
}
