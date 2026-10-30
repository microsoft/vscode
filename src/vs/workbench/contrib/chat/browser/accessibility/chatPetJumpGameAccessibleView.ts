/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { ChatPetJumpGameFocusedContext } from '../widget/chatPetJumpGame.js';
import { IChatPetWidgetService } from '../widget/chatPetWidgetService.js';

export class ChatPetJumpGameAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 120;
	readonly name = 'chatPetJumpGame';
	readonly when = ContextKeyExpr.and(ChatContextKeys.enabled, ChatPetJumpGameFocusedContext);

	constructor(readonly type: AccessibleViewType) { }

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider | undefined {
		const game = accessor.get(IChatPetWidgetService).getFocusedJumpGame();
		if (!game) {
			return undefined;
		}
		const content = this.type === AccessibleViewType.Help ? game.getHelp() : game.getAccessibleContent();
		game.pause();
		const provider = new AccessibleContentProvider(
			AccessibleViewProviderId.ChatPetJumpGame,
			{ type: this.type },
			() => content,
			() => game.resume(),
			AccessibilityVerbositySettingId.ChatPetJumpGame,
		);
		provider.onDispose = () => game.resume(false);
		return provider;
	}
}
