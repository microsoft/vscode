/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AgentHostUrlAutoApprovePatternsConfigKey } from '../../../../platform/agentHost/common/agentHostSchema.js';
import { IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';

export const chatUrlFetchingConfiguration: IConfigurationPropertySchema = {
	tags: ['chatPermissions'],
	agentHost: { key: AgentHostUrlAutoApprovePatternsConfigKey },
	default: {
		'https://code.visualstudio.com': true,
		'https://github.com/microsoft/vscode/wiki/*': true,
	},
	markdownDescription: localize('chat.tools.fetchPage.approvedUrls', "Controls which URLs are automatically approved when requested by chat tools. Keys are URL patterns and values can be `true` to approve both requests and responses, `false` to deny, or an object with `approveRequest` and `approveResponse` properties for granular control.\n\nExamples:\n- `\"https://example.com\": true` - Approve all requests to example.com\n- `\"https://*.example.com\": true` - Approve all requests to any subdomain of example.com\n- `\"https://example.com/api/*\": { \"approveRequest\": true, \"approveResponse\": false }` - Approve requests but not responses for example.com/api paths"),
	type: 'object',
	additionalProperties: {
		oneOf: [
			{ type: 'boolean' },
			{
				type: 'object',
				properties: {
					approveRequest: { type: 'boolean' },
					approveResponse: { type: 'boolean' }
				}
			}
		]
	}
};
