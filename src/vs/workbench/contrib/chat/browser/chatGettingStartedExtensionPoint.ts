/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';

export interface IChatGettingStartedItem {
	id: string;
	label: string;
	commandId: string;
	icon?: string;
	args?: any[];
	when?: string;
}

export const chatGettingStartedExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IChatGettingStartedItem[]>({
	extensionPoint: 'chatGettingStarted',
	jsonSchema: {
		description: localize('chatGettingStarted', "Contribute getting started items to the chat panel."),
		type: 'array',
		items: {
			type: 'object',
			required: ['id', 'label', 'commandId'],
			defaultSnippets: [{ body: { 'id': '$1', 'label': '$2', 'commandId': '$3' } }],
			properties: {
				id: {
					type: 'string',
					description: localize('chatGettingStarted.id', "Unique identifier for this getting started item."),
				},
				label: {
					type: 'string',
					description: localize('chatGettingStarted.label', "Label to display for this getting started item.")
				},
				commandId: {
					type: 'string',
					description: localize('chatGettingStarted.commandId', "Command to execute when this item is clicked.")
				},
				icon: {
					type: 'string',
					description: localize('chatGettingStarted.icon', "Icon to display for this getting started item. Should be a Codicon identifier.")
				},
				args: {
					type: 'array',
					description: localize('chatGettingStarted.args', "Arguments to pass to the command when executed."),
					items: {
						description: localize('chatGettingStarted.args.item', "Command argument")
					}
				},
				when: {
					type: 'string',
					description: localize('chatGettingStarted.when', "Context key expression to control the visibility of this getting started item.")
				}
			}
		}
	}
});