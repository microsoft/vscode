/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { observableSessionWorkspacesEnabled } from '../../common/sessionConfig.js';
import { ISessionWorkspacesService } from '../../common/sessionWorkspaces.js';
import { ISessionGroupsService } from '../sessionGroupsService.js';

/**
 * Keeps a workspace's place in a custom group as its file is renamed: the group placement of the workspace's row moves from
 * the row's former id to its id, in the same place among the group's rows. It runs as the workspaces change, while workspaces
 * are enabled, apart from the Sessions lists.
 */
export class SessionWorkspaceRenamePlacementContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.sessionWorkspaceRenamePlacement';

	constructor(
		@ISessionWorkspacesService workspacesService: ISessionWorkspacesService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IConfigurationService configurationService: IConfigurationService,
		@IProductService productService: IProductService,
	) {
		super();
		const enabled = observableSessionWorkspacesEnabled(configurationService, productService);
		this._register(autorun(reader => {
			if (!enabled.read(reader)) {
				return;
			}
			const workspaces = workspacesService.workspaces.read(reader);
			// Compared as the rows' ids compare the files, such as without case where the file system ignores it
			const rowIds = new Set(workspaces.map(workspace => this.getRowId(workspace.uri)));
			// A former file that several workspaces were renamed from is not known to be any one's
			const claims = new Map<string, number>();
			for (const workspace of workspaces) {
				for (const formerRowId of new Set((workspace.previousUris ?? []).map(previous => this.getRowId(previous)))) {
					claims.set(formerRowId, (claims.get(formerRowId) ?? 0) + 1);
				}
			}
			for (const workspace of workspaces) {
				for (const previous of workspace.previousUris ?? []) {
					const formerRowId = this.getRowId(previous);
					// The former file can be another workspace's now, whose placement it is
					if (!rowIds.has(formerRowId) && claims.get(formerRowId) === 1) {
						this.groupsService.renameSection(formerRowId, this.getRowId(workspace.uri));
					}
				}
			}
		}));
	}

	/** The id of a workspace's row in the Sessions list, as Group by Workspace gives it. */
	private getRowId(uri: URI): string {
		return `workspace:${this.uriIdentityService.extUri.getComparisonKey(uri)}`;
	}
}
