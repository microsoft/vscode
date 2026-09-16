/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID } from '../../../../workbench/contrib/chat/common/onboarding/chatBackgroundTryout.js';
import { SessionsChatBackgroundAvailableContext } from '../../../common/contextkeys.js';
import { AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET, ISessionsChatBackgroundService } from '../../../services/chatBackground/browser/chatBackgroundService.js';

registerAction2(class ApplyCodiconsChatBackgroundTryoutAction extends Action2 {
	constructor() {
		super({
			id: APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID,
			title: localize2('applyCodiconsChatBackgroundTryout', "Apply Codicons Chat Background Feature Example"),
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, SessionsChatBackgroundAvailableContext),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		if (isHighContrast(accessor.get(IThemeService).getColorTheme().type)) {
			throw new Error(localize('chat.tryout.codiconsBackground.highContrast', "Chat backgrounds are unavailable while a high contrast theme is active."));
		}

		await accessor.get(ISessionsChatBackgroundService).setBackground(AGENT_SESSIONS_CHAT_BACKGROUND_CODICONS_PRESET);
		status(localize('chat.tryout.codiconsBackground.applied', "Chat background set to Codicons."));
	}
});
