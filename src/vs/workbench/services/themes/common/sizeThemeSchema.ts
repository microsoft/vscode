/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';

import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../platform/jsonschemas/common/jsonContributionRegistry.js';

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { workbenchSizesSchemaId } from '../../../../platform/theme/common/sizeRegistry.js';


export const sizeThemeSchemaId = 'vscode://schemas/size-theme';

const sizeThemeSchema: IJSONSchema = {
	type: 'object',
	allowComments: true,
	allowTrailingCommas: true,
	properties: {
		sizes: {
			description: nls.localize('schema.workbenchSizes', 'Sizes in the workbench'),
			$ref: workbenchSizesSchemaId,
			additionalProperties: false
		},
	}
};

export function registerSizeThemeSchemas() {
	const schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);
	schemaRegistry.registerSchema(sizeThemeSchemaId, sizeThemeSchema);
}
