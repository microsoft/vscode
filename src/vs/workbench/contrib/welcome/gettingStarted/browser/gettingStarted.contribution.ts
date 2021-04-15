/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { GettingStartedInputSerializer, GettingStartedPage, inGettingStartedContext } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStarted';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as EditorInputExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { MenuId, registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyEqualsExpr } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorDescriptor, IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IGettingStartedService } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedService';
import { GettingStartedInput } from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedInput';

export * as icons from 'vs/workbench/contrib/welcome/gettingStarted/browser/gettingStartedIcons';

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.showGettingStarted',
			title: localize('Getting Started', "Getting Started"),
			category: localize('help', "Help"),
			f1: true,
			menu: {
				id: MenuId.MenubarHelpMenu,
				group: '1_welcome',
				order: 2,
			}
		});
	}

	public run(accessor: ServicesAccessor) {
		accessor.get(IEditorService).openEditor(new GettingStartedInput({}), {});
	}
});

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputSerializer(GettingStartedInput.ID, GettingStartedInputSerializer);
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
		GettingStartedPage,
		GettingStartedPage.ID,
		localize('gettingStarted', "Getting Started")
	),
	[
		new SyncDescriptor(GettingStartedInput)
	]
);

const category = localize('gettingStarted', "Getting Started");

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.goBack',
			title: localize('gettingStarted.goBack', "Go Back"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.Escape,
				when: inGettingStartedContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.escape();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.next',
			title: localize('gettingStarted.goNext', "Next"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.DownArrow,
				secondary: [KeyCode.RightArrow],
				when: inGettingStartedContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.focusNext();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.prev',
			title: localize('gettingStarted.goPrev', "Previous"),
			category,
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyCode.UpArrow,
				secondary: [KeyCode.LeftArrow],
				when: inGettingStartedContext
			},
			precondition: ContextKeyEqualsExpr.create('activeEditor', 'gettingStartedPage'),
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const editorPane = editorService.activeEditorPane;
		if (editorPane instanceof GettingStartedPage) {
			editorPane.focusPrevious();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.markTaskComplete',
			title: localize('gettingStarted.markTaskComplete', "Mark Task Complete"),
			category,
		});
	}

	run(accessor: ServicesAccessor, arg: string) {
		if (!arg) { return; }
		const gettingStartedService = accessor.get(IGettingStartedService);
		gettingStartedService.progressTask(arg);
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'gettingStarted.markTaskIncomplete',
			title: localize('gettingStarted.markTaskInomplete', "Mark Task Incomplete"),
			category,
		});
	}

	run(accessor: ServicesAccessor, arg: string) {
		if (!arg) { return; }
		const gettingStartedService = accessor.get(IGettingStartedService);
		gettingStartedService.deprogressTask(arg);
	}
});

ExtensionsRegistry.registerExtensionPoint({
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
