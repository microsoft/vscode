/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';

const idDescription = nls.localize('JsonSchema.input.id', "The input\'s id is used to specify inputs as ${input:id}.");
const typeDescription = nls.localize('JsonSchema.input.type', 'The promptString type opens an input box to ask the user for input. The pickString type shows a selection list.');
const descriptionDescription = nls.localize('JsonSchema.input.description', 'The description is shown when the user is prompted for input.');
const defaultDescription = nls.localize('JsonSchema.input.default', 'The default value for the input.');

export const inputsSchema: IJSONSchema = {
	definitions: {
		inputs: {
			type: 'array',
			description: nls.localize('JsonSchema.inputs', 'User inputs. Used for defining user input prompts, such as free string input or a choice from several options.'),
			items: {
				oneOf: [
					{
						type: 'object',
						required: ['id', 'type', 'description'],
						additionalProperties: false,
						properties: {
							id: {
								type: 'string',
								description: idDescription
							},
							type: {
								type: 'string',
								description: typeDescription,
								enum: ['promptString']
							},
							description: {
								type: 'string',
								description: descriptionDescription,
							},
							default: {
								type: 'string',
								description: defaultDescription,
							},
						}
					},
					{
						type: 'object',
						required: ['id', 'type', 'description', 'options'],
						additionalProperties: false,
						properties: {
							id: {
								type: 'string',
								description: idDescription
							},
							type: {
								type: 'string',
								description: typeDescription,
								enum: ['pickString']
							},
							description: {
								type: 'string',
								description: descriptionDescription,
							},
							default: {
								type: 'string',
								description: defaultDescription,
							},
							options: {
								type: 'array',
								description: nls.localize('JsonSchema.input.options', 'An array of strings that defines the options for a quick pick.'),
								items: {
									type: 'string'
								}
							}
						}
					}
				]
			}
		}
	}
};
