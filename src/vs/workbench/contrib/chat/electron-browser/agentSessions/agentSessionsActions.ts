/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Action2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { ChatEntitlementContextKeys } from '../../../../services/chat/common/chatEntitlementService.js';
import { CHAT_CATEGORY } from '../../browser/actions/chatActions.js';
import { ProductQualityContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';

export class OpenSessionsWindowAction extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openSessionsWindow',
			title: localize2('openSessionsWindow', "Open Sessions Window"),
			category: CHAT_CATEGORY,
			precondition: ContextKeyExpr.and(ProductQualityContext.notEqualsTo('stable'), ChatEntitlementContextKeys.Setup.hidden.negate(), IsSessionsWindowContext.negate()),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor) {
		const nativeHostService = accessor.get(INativeHostService);
		await nativeHostService.openSessionsWindow();
	}
}
