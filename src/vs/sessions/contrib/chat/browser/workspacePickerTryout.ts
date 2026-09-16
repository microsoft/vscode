/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID } from '../../../../workbench/contrib/chat/common/onboarding/workspacePickerTryout.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../common/constants.js';

registerAction2(class PrepareUnifiedWorkspacePickerTryoutAction extends Action2 {
	constructor() {
		super({
			id: PREPARE_UNIFIED_WORKSPACE_PICKER_TRYOUT_COMMAND_ID,
			title: localize2('prepareUnifiedWorkspacePickerTryout', "Prepare Unified Workspace Picker Feature Example"),
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.equals(`config.${UNIFIED_WORKSPACE_PICKER_SETTING}`, true),
			),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<{ readonly targetScope: string } | undefined> {
		const sessionsService = accessor.get(ISessionsService);
		await sessionsService.openNewSession();
		const sessionId = sessionsService.activeSession.get()?.sessionId;
		return sessionId ? { targetScope: sessionId } : undefined;
	}
});
