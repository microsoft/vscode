/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { extUriBiasedIgnorePathCase } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { localize } from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';

/**
 * A workbench contribution that will spot when the first workspace folder lies within the app installation root
 * and add a banner to warn that update will delete contents.
 */
export class WorkspaceUnderAppRootDetectorContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IBannerService private readonly bannerService: IBannerService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
	) {
		super();
		const folder = this.contextService.getWorkspace().folders[0];
		if (folder && folder.uri.scheme === Schemas.file) {
			const appRootUri = URI.file(this.nativeEnvironmentService.appRoot);
			if (extUriBiasedIgnorePathCase.isEqualOrParent(folder.uri, appRootUri)) {
				this.bannerService.show({
					id: 'appRootWarning.banner',
					message: localize('appRootWarning.banner', "Files you store within the installation folder ({0}) may be OVERWRITTEN or DELETED IRREVERSIBLY without warning at update time.", this.nativeEnvironmentService.appRoot),
					icon: Codicon.warning
				});

			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceUnderAppRootDetectorContribution, 'WorkspaceUnderAppRootDetectorContribution', LifecyclePhase.Eventually);
