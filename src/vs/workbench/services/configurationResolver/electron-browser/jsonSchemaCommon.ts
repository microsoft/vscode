/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
export const inputsSchema: IJSONSchema = {
	definitions: {
		inputDescription: {
			type: 'object',
			required: ['label', 'type', 'description'],
			additionalProperties: false,
			properties: {
				label: {
					type: 'string',
					description: nls.localize('JsonSchema.input.label', "The input\'s label")
				},
				type: {
					type: 'string',
					description: nls.localize('JsonSchema.input.type', 'The input\'s type. Use prompt for free string input and selection for choosing from values'),
					enum: ['prompt', 'pick']
				},
				description: {
					type: 'string',
					description: nls.localize('JsonSchema.input.description', 'Description to show for for using input.'),
				},
				default: {
					type: 'string',
					description: nls.localize('JsonSchema.input.default', 'Default value for the input.'),
				},
				options: {
					type: 'array',
					description: nls.localize('JsonSchema.input.options', 'Options to select from.'),
					items: {
						type: 'string'
					}
				}
			}
		},
		inputs: {
			type: 'array',
			description: nls.localize('JsonSchema.inputs', 'User inputs. Used for prompting for user input.'),
			items: {
				type: 'object',
				$ref: '#/definitions/inputDescription'
			}
		}
	}
};
