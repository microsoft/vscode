/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { isProposedApiEnabled } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IChatSessionsExtensionPoint, IChatSessionsService } from '../common/chatSessionsService.js';

const extensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatSessionsExtensionPoint[]>({
	extensionPoint: 'chatSessions',
	jsonSchema: {
		description: localize('chatSessionsExtPoint', 'Contributes chat session integrations to the chat widget.'),
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: {
					description: localize('chatSessionsExtPoint.id', 'A unique identifier for this item.'),
					type: 'string',
				},
				name: {
					description: localize('chatSessionsExtPoint.name', 'Name shown in the chat widget. (eg: @agent)'),
					type: 'string',
				},
				displayName: {
					description: localize('chatSessionsExtPoint.displayName', 'A longer name for this item which is used for display in menus.'),
					type: 'string',
				},
				description: {
					description: localize('chatSessionsExtPoint.description', 'Description of the chat session for use in menus and tooltips.'),
					type: 'string'
				},
				when: {
					description: localize('chatSessionsExtPoint.when', 'Condition which must be true to show this item.'),
					type: 'string'
				}
			},
			required: ['id', 'name', 'displayName', 'description'],
		}
	},
	activationEventsGenerator: (contribs, results) => {
		for (const contrib of contribs) {
			results.push(`onChatSession:${contrib.id}`);
		}
	}
});

export class ChatSessionsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILogService private readonly logService: ILogService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		extensionPoint.setHandler(extensions => {
			for (const ext of extensions) {
				if (!isProposedApiEnabled(ext.description, 'chatSessionsProvider')) {
					continue;
				}
				if (!Array.isArray(ext.value)) {
					continue;
				}
				for (const contribution of ext.value) {
					const c: IChatSessionsExtensionPoint = {
						id: contribution.id,
						name: contribution.name,
						displayName: contribution.displayName,
						description: contribution.description,
						when: contribution.when,
					};
					this.logService.info(`Registering chat session from extension contribution: ${c.displayName} (id='${c.id}' name='${c.name}')`);
					this._register(this.chatSessionsService.registerContribution(c)); // TODO: Is it for contribution to own this? I think not
				}
			}
		});
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(ChatSessionsContribution, LifecyclePhase.Restored);
