/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
const idDescription = nls.localize('JsonSchema.input.id', "The input's id is used to associate an input with a variable of the form ${input:id}.");
const typeDescription = nls.localize('JsonSchema.input.type', "The type of user input prompt to use.");
const descriptionDescription = nls.localize('JsonSchema.input.description', "The description is shown when the user is prompted for input.");
const defaultDescription = nls.localize('JsonSchema.input.default', "The default value for the input.");
export const inputsSchema = {
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
                                enum: ['promptString'],
                                enumDescriptions: [
                                    nls.localize('JsonSchema.input.type.promptString', "The 'promptString' type opens an input box to ask the user for input."),
                                ]
                            },
                            description: {
                                type: 'string',
                                description: descriptionDescription
                            },
                            default: {
                                type: 'string',
                                description: defaultDescription
                            },
                            password: {
                                type: 'boolean',
                                description: nls.localize('JsonSchema.input.password', "Controls if a password input is shown. Password input hides the typed text."),
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
                                enum: ['pickString'],
                                enumDescriptions: [
                                    nls.localize('JsonSchema.input.type.pickString', "The 'pickString' type shows a selection list."),
                                ]
                            },
                            description: {
                                type: 'string',
                                description: descriptionDescription
                            },
                            default: {
                                type: 'string',
                                description: defaultDescription
                            },
                            options: {
                                type: 'array',
                                description: nls.localize('JsonSchema.input.options', "An array of strings that defines the options for a quick pick."),
                                items: {
                                    oneOf: [
                                        {
                                            type: 'string'
                                        },
                                        {
                                            type: 'object',
                                            required: ['value'],
                                            additionalProperties: false,
                                            properties: {
                                                label: {
                                                    type: 'string',
                                                    description: nls.localize('JsonSchema.input.pickString.optionLabel', "Label for the option.")
                                                },
                                                value: {
                                                    type: 'string',
                                                    description: nls.localize('JsonSchema.input.pickString.optionValue', "Value for the option.")
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    },
                    {
                        type: 'object',
                        required: ['id', 'type', 'command'],
                        additionalProperties: false,
                        properties: {
                            id: {
                                type: 'string',
                                description: idDescription
                            },
                            type: {
                                type: 'string',
                                description: typeDescription,
                                enum: ['command'],
                                enumDescriptions: [
                                    nls.localize('JsonSchema.input.type.command', "The 'command' type executes a command."),
                                ]
                            },
                            command: {
                                type: 'string',
                                description: nls.localize('JsonSchema.input.command.command', "The command to execute for this input variable.")
                            },
                            args: {
                                oneOf: [
                                    {
                                        type: 'object',
                                        description: nls.localize('JsonSchema.input.command.args', "Optional arguments passed to the command.")
                                    },
                                    {
                                        type: 'array',
                                        description: nls.localize('JsonSchema.input.command.args', "Optional arguments passed to the command.")
                                    },
                                    {
                                        type: 'string',
                                        description: nls.localize('JsonSchema.input.command.args', "Optional arguments passed to the command.")
                                    }
                                ]
                            }
                        }
                    }
                ]
            }
        }
    }
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblJlc29sdmVyU2NoZW1hLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyU2NoZW1hLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFHMUMsTUFBTSxhQUFhLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSx1RkFBdUYsQ0FBQyxDQUFDO0FBQ25KLE1BQU0sZUFBZSxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsdUJBQXVCLEVBQUUsdUNBQXVDLENBQUMsQ0FBQztBQUN2RyxNQUFNLHNCQUFzQixHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsOEJBQThCLEVBQUUsK0RBQStELENBQUMsQ0FBQztBQUM3SSxNQUFNLGtCQUFrQixHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsa0NBQWtDLENBQUMsQ0FBQztBQUd4RyxNQUFNLENBQUMsTUFBTSxZQUFZLEdBQWdCO0lBQ3hDLFdBQVcsRUFBRTtRQUNaLE1BQU0sRUFBRTtZQUNQLElBQUksRUFBRSxPQUFPO1lBQ2IsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsZ0hBQWdILENBQUM7WUFDaEssS0FBSyxFQUFFO2dCQUNOLEtBQUssRUFBRTtvQkFDTjt3QkFDQyxJQUFJLEVBQUUsUUFBUTt3QkFDZCxRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQzt3QkFDdkMsb0JBQW9CLEVBQUUsS0FBSzt3QkFDM0IsVUFBVSxFQUFFOzRCQUNYLEVBQUUsRUFBRTtnQ0FDSCxJQUFJLEVBQUUsUUFBUTtnQ0FDZCxX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