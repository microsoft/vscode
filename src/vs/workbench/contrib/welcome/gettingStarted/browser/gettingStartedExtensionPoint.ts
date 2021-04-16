/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IStartEntry, IWalkthrough } from 'vs/platform/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const walkthroughsExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IWalkthrough[]>({
	extensionPoint: 'walkthroughs',
	jsonSchema: {
		doNotSuggest: true,
		description: localize('walkthroughs', "Contribute collections of tasks to help users with your extension. Experimental, available in VS Code Insiders only."),
		type: 'array',
		items: {
			type: 'object',
			required: ['id', 'title', 'description', 'tasks'],
			defaultSnippets: [{ body: { 'id': '$1', 'title': '$2', 'description': '$3', 'tasks': [] } }],
			properties: {
				id: {
					type: 'string',
					description: localize('walkthroughs.id', "Unique identifier for this walkthrough."),
				},
				title: {
					type: 'string',
					description: localize('walkthroughs.title', "Title of walkthrough.")
				},
				description: {
					type: 'string',
					description: localize('walkthroughs.description', "Description of walkthrough.")
				},
				primary: {
					type: 'boolean',
					description: localize('walkthroughs.primary', "if this is a `primary` walkthrough, hinting if it should be opened on install of the extension. The first `primary` walkthough with a `when` condition matching the current context may be opened by core on install of the extension.")
				},
				when: {
					type: 'string',
					description: localize('walkthroughs.when', "Context key expression to control the visibility of this walkthrough.")
				},
				tasks: {
					type: 'array',
					description: localize('walkthroughs.tasks', "Tasks to complete as part of this walkthrough."),
					items: {
						type: 'object',
						required: ['id', 'title', 'description', 'media'],
						defaultSnippets: [{
							body: {
								'id': '$1', 'title': '$2', 'description': '$3',
								'doneOn': { 'command': '$5' },
								'media': { 'path': '$6', 'altText': '$7' }
							}
						}],
						properties: {
							id: {
								type: 'string',
								description: localize('walkthroughs.tasks.id', "Unique identifier for this task. This is used to keep track of which tasks have been completed."),
							},
							title: {
								type: 'string',
								description: localize('walkthroughs.tasks.title', "Title of task.")
							},
							description: {
								type: 'string',
								description: localize('walkthroughs.tasks.description', "Description of task. Supports ``preformatted``, __italic__, and **bold** text. Use markdown-style links for commands or external links: [Title](command:myext.command), [Title](command:toSide:myext.command), or [Title](https://aka.ms). Links on their own line will be rendered as buttons.")
							},
							button: {
								deprecationMessage: localize('walkthroughs.tasks.button.deprecated', "Deprecated. Use markdown links in the description instead, i.e. [Title](command:myext.command), [Title](command:toSide:myext.command), or [Title](https://aka.ms), "),
							},
							media: {
								type: 'object',
								required: ['path', 'altText'],
								description: localize('walkthroughs.tasks.media', "Image to show alongside this task."),
								defaultSnippets: [{ 'body': { 'altText': '$1', 'path': '$2' } }],
								properties: {
									path: {
										description: localize('walkthroughs.tasks.media.path', "Path to an image, relative to extension directory."),
										type: 'string',
									},
									altText: {
										type: 'string',
										description: localize('walkthroughs.tasks.media.altText', "Alternate text to display when the image cannot be loaded or in screen readers.")
									}
								}
							},
							doneOn: {
								description: localize('walkthroughs.tasks.doneOn', "Signal to mark task as complete."),
								type: 'object',
								required: ['command'],
								defaultSnippets: [{ 'body': { command: '$1' } }],
								properties: {
									'command': {
										description: localize('walkthroughs.tasks.oneOn.command', "Mark task done when the specified command is executed."),
										type: 'string'
									}
								},
							},
							when: {
								type: 'string',
								description: localize('walkthroughs.tasks.when', "Context key expression to control the visibility of this task.")
							}
						}
					}
				}
			}
		}
	}
});

export const startEntriesExtensionPoint = ExtensionsRegistry.registerExtensionPoint<IStartEntry[]>({
	extensionPoint: 'startEntries',
	jsonSchema: {
		doNotSuggest: true,
		description: localize('startEntries', "Contribute commands to help users start using your extension. Experimental, available in VS Code Insiders only."),
		type: 'array',
		items: {
			type: 'object',
			required: ['id', 'title', 'description'],
			defaultSnippets: [{ body: { 'id': '$1', 'title': '$2', 'description': '$3' } }],
			properties: {
				title: {
					type: 'string',
					description: localize('startEntries.title', "Title of start item.")
				},
				command: {
					type: 'string',
					description: localize('startEntries.command', "Command to run.")
				},
				description: {
					type: 'string',
					description: localize('startEntries.description', "Description of start item.")
				},
				when: {
					type: 'string',
					description: localize('startEntries.when', "Context key expression to control the visibility of this start item.")
				},
				type: {
					type: 'string',
					enum: ['sample-notebook', 'template-folder'],
					description: localize('startEntries.type', "The type of start item this is, used for grouping. Supported values are `sample-notebook` or `template-folder`.")
				}
			}
		}
	}
});
