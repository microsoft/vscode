/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IRos2WorkspaceService } from '../common/ros2WorkspaceService.js';
import { Ros2PackageExplorerView } from './ros2PackageExplorerView.js';

const ROBOAGENT_CATEGORY = localize2('roboagent.category', "RoboAgent");

export class IndexRos2WorkspaceAction extends Action2 {
	static readonly ID = 'roboagent.indexRos2Workspace';

	constructor() {
		super({
			id: IndexRos2WorkspaceAction.ID,
			title: localize2('roboagent.indexRos2Workspace', "Index ROS2 Workspace"),
			category: ROBOAGENT_CATEGORY,
			f1: true,
			icon: Codicon.refresh,
			menu: [{
				id: MenuId.ViewTitle,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', Ros2PackageExplorerView.ID)
			}]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		await accessor.get(IRos2WorkspaceService).indexWorkspace();
	}
}

export function registerRoboAgentActions(): void {
	registerAction2(IndexRos2WorkspaceAction);
}

// Localized string referenced by the empty-state welcome view content.
export const INDEX_WELCOME_BUTTON = localize('roboagent.indexWelcomeButton', "Index ROS2 Workspace");
