/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationNode } from 'vs/platform/configuration/common/configurationRegistry';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';
import * as nls from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

export const externalUriOpenersSettingId = 'workbench.externalUriOpeners';

export interface ExternalUriOpenerConfiguration {
	readonly hostname: string;
	readonly id: string;
}

export const externalUriOpenerIdSchemaAddition: IJSONSchema = {
	type: 'string',
	enum: []
};

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
						'hostname': '$1',
						'id': '$2'
					}
				}],
				required: ['hostname', 'id'],
				properties: {
					'hostname': {
						type: 'string',
						description: nls.localize('externalUriOpeners.hostname', "The hostname of sites the opener applies to."),
					},
					'id': {
						anyOf: [
							{
								type: 'string',
								description: nls.localize('externalUriOpeners.id', "The id of the opener."),
							},
							externalUriOpenerIdSchemaAddition
						]
					}
				}
			}
		}
	}
};
