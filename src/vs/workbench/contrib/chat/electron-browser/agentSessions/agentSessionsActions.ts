/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ProductQualityContext } from '../../../../../platform/contextkey/common/contextkeys.js';

export class OpenAgentsWindowAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openAgentsWindow',
			title: localize2('openAgentsWindow', "Open Agents Application"),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), ChatEntitlementContextKeys.Setup.hidden.negate(), ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(), IsSessionsWindowContext.negate()),
			f1: true,
			menu: [{
				id: MenuId.ChatTitleBarMenu,
				group: 'c_sessions',
				order: 1,
				when: ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), ChatEntitlementContextKeys.Setup.hidden.negate(), ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(), IsSessionsWindowContext.negate())
			}]
		});
	}

	async run(accessor: ServicesAccessor, options?: { forceNewWindow?: boolean }) {
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		const nativeHostService = accessor.get(INativeHostService);

		if (environmentService.isBuilt && (isMacintosh || isWindows)) {
			await nativeHostService.launchSiblingApp();
		} else {
			await nativeHostService.openAgentsWindow({ forceNewWindow: options?.forceNewWindow ?? true });
		}
	}
}
