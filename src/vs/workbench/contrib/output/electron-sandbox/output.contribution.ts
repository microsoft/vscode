/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../nls.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IsMacNativeContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { OUTPUT_VIEW_ID, CONTEXT_ACTIVE_FILE_OUTPUT, IOutputService } from '../../../services/output/common/output.js';


registerAction2(class OpenInConsoleAction extends Action2 {
	constructor() {
		super({
			id: `workbench.action.openActiveLogOutputFileNative`,
			title: localize2('openActiveOutputFileNative', "Open Output in Console"),
			menu: [{
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', OUTPUT_VIEW_ID), IsMacNativeContext),
				group: 'navigation',
				order: 6,
				isHiddenByDefault: true
			}],
			icon: Codicon.goToFile,
			precondition: ContextKeyExpr.and(CONTEXT_ACTIVE_FILE_OUTPUT, IsMacNativeContext)
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const outputService = accessor.get(IOutputService);
		const hostService = accessor.get(INativeHostService);
		const channel = outputService.getActiveChannel();
		if (!channel) {
			return;
		}
		const descriptor = outputService.getChannelDescriptors().find(c => c.id === channel.id);
		if (descriptor?.file && descriptor.file.scheme === Schemas.file) {
			hostService.openExternal(descriptor.file.toString(true), 'open');
		}
	}
});
