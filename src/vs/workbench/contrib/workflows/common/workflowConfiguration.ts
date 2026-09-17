/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ConfigurationScope, IConfigurationNode } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';

export const enum WorkflowSettingId {
	Enabled = 'chat.workflows.enabled',
}

export const WorkflowContextKeys = {
	enabled: ContextKeyExpr.equals(`config.${WorkflowSettingId.Enabled}`, true),
};

export const workflowConfiguration: IConfigurationNode = {
	id: 'chat',
	title: localize('workflow.configurationTitle', "Chat"),
	type: 'object',
	properties: {
		[WorkflowSettingId.Enabled]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			description: localize('workflow.enabledDescription', "Enable experimental workflow discovery and authoring. Starting or continuing work also requires an enabled, workflow-capable agent host. Existing tool permissions and managed policies remain in effect."),
		},
	},
};
