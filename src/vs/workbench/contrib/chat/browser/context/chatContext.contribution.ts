/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IChatContextService } from './chatContextService.js';
import { isProposedApiEnabled } from '../../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../../services/extensions/common/extensionsRegistry.js';

interface IChatContextExtensionPoint {
	id: string;
	icon: string;
	displayName: string;
}

const extensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatContextExtensionPoint[]>({
	extensionPoint: 'chatContext',
	jsonSchema: {
		description: localize('chatContextExtPoint', 'Contributes chat context integrations to the chat widget.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					description: localize('chatContextExtPoint.id', 'A unique identifier for this item.'),
					type: 'string',
				},
				icon: {
					description: localize('chatContextExtPoint.icon', 'The icon associated with this chat context item.'),
					type: 'string'
				},
				displayName: {
					description: localize('chatContextExtPoint.title', 'A user-friendly name for this item which is used for display in menus.'),
					type: 'string'
				}
			},
			required: ['id', 'icon', 'displayName'],
		}
	}
});

export class ChatContextContribution extends Disposable implements IWorkbenchContribution {
	public static readonly ID = 'workbench.contrib.chatContextContribution';

	constructor(
		@IChatContextService private readonly _chatContextService: IChatContextService
	) {
		super();
		extensionPoint.setHandler(extensions => {
			for (const ext of extensions) {
				if (!isProposedApiEnabled(ext.description, 'chatContextProvider')) {
					continue;
				}
				if (!Array.isArray(ext.value)) {
					continue;
				}
				for (const contribution of ext.value) {
					const icon = contribution.icon ? ThemeIcon.fromString(contribution.icon) : undefined;
					if (!icon) {
						continue;
					}

					this._chatContextService.setChatContextProvider(`${ext.description.id}-${contribution.id}`, { title: contribution.displayName, icon });
				}
			}
		});
	}
}

registerWorkbenchContribution2(ChatContextContribution.ID, ChatContextContribution, WorkbenchPhase.AfterRestored);
