/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationNode, IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import * as nls from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Registry } from 'vs/platform/registry/common/platform';
import { defaultExternalUriOpenerId } from 'vs/workbench/contrib/externalUriOpener/common/contributedOpeners';

export const externalUriOpenersSettingId = 'workbench.externalUriOpeners';

export interface ExternalUriOpenerConfiguration {
	readonly uri: string;
	readonly id: string;
}

const externalUriOpenerIdSchemaAddition: IJSONSchema = {
	type: 'string',
	enum: []
};

const exampleUriPatterns = `
- \`https://microsoft.com\`: Matches this specific domain using https
- \`https://microsoft.com:8080\`: Matches this specific domain on this port using https
- \`https://microsoft.com:*\`: Matches this specific domain on any port using https
- \`https://microsoft.com/foo\`: Matches \`https://microsoft.com/foo\` and \`https://microsoft.com/foo/bar\`, but not \`https://microsoft.com/foobar\` or \`https://microsoft.com/bar\`
- \`https://*.microsoft.com\`: Match all domains ending in \`microsoft.com\` using https
- \`microsoft.com\`: Match this specific domain using either http or https
- \`*.microsoft.com\`: Match all domains ending in \`microsoft.com\` using either http or https
- \`http://192.168.0.1\`: Matches this specific IP using http
- \`http://192.168.0.*\`: Matches all IP's with this prefix using http
- \`*\`: Match all domains using either http or https`;

export const externalUriOpenersConfigurationNode: IConfigurationNode = {
	...workbenchConfigurationNodeBase,
	properties: {
		[externalUriOpenersSettingId]: {
			type: 'array',
			markdownDescription: nls.localize('externalUriOpeners', "Configure the opener to use for external uris (i.e. http, https)."),
			items: {
				type: 'object',
				defaultSnippets: [{
					body: {
						'uri': '$1',
						'id': '$2'
					}
				}],
				required: ['uri', 'id'],
				properties: {
					'uri': {
						type: 'string',
						markdownDescription: nls.localize('externalUriOpeners.uri', "Uri pattern that the opener applies to. Example patterns: \n{0}", exampleUriPatterns),
					},
					'id': {
						anyOf: [
							{
								type: 'string',
								description: nls.localize('externalUriOpeners.id', "The id of the opener."),
							},
							{
								type: 'string',
								description: nls.localize('externalUriOpeners.id', "The id of the opener."),
								enum: [defaultExternalUriOpenerId],
								enumDescriptions: [nls.localize('externalUriOpeners.defaultId', "Open using VS Code's standard opener.")],
							},
							externalUriOpenerIdSchemaAddition
						]
					}
				}
			}
		}
	}
};

export function updateContributedOpeners(enumValues: string[], enumDescriptions: string[]): void {
	externalUriOpenerIdSchemaAddition.enum = enumValues;
	externalUriOpenerIdSchemaAddition.enumDescriptions = enumDescriptions;

	Registry.as<IConfigurationRegistry>(Extensions.Configuration)
		.notifyConfigurationSchemaUpdated(externalUriOpenersConfigurationNode);
}
