/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';


const beginnerIcon = registerIcon('getting-started-beginner', Codicon.lightbulb, localize('getting-started-beginner-icon', "Icon used for the beginner category of getting started"));
const intermediateIcon = registerIcon('getting-started-intermediate', Codicon.heart, localize('getting-started-intermediate-icon', "Icon used for the intermediate category of getting started"));
const advancedIcon = registerIcon('getting-started-advanced', Codicon.tools, localize('getting-started-advanced-icon', "Icon used for the advanced category of getting started"));

const openFolderIcon = registerIcon('getting-started-open-folder', Codicon.folderOpened, localize('getting-started-open-folder-icon', "Icon used for the open folder entry in getting started"));
const interactivePlaygroundIcon = registerIcon('getting-started-interactive-playground', Codicon.library, localize('getting-started-interactive-playground-icon', "Icon used for the interactive playground entry of getting started"));


type GettingStartedItem = {
	id: string
	title: string,
	description: string,
	button: { title: string, command: string },
	doneOn: { commandExecuted: string, eventFired?: never } | { eventFired: string, commandExecuted?: never, }
	when?: string,
	media: { type: 'image', path: string, altText: string },
};

type GettingStartedCategory = {
	id: string
	title: string,
	description: string,
	icon: ThemeIcon,
	when?: string,
	content:
	| { type: 'items', items: GettingStartedItem[] }
	| { type: 'command', command: string }
};

type GettingStartedContent = GettingStartedCategory[];

export const content: GettingStartedContent = [
	{
		id: 'Beginner',
		title: localize('gettingStarted.beginner.title', "Get Started"),
		icon: beginnerIcon,
		description: localize('gettingStarted.beginner.description', "Get to know your new editor"),
		content: {
			type: 'items',
			items: [
				{
					id: 'pickColorTheme',
					description: localize('pickColorTask.description', "Modify the colors in the user interface to suit your preferences and work environment."),
					title: localize('pickColorTask.title', "Color Theme"),
					button: { title: localize('pickColorTask.button', "Find a Theme"), command: 'workbench.action.selectTheme' },
					doneOn: { eventFired: 'themeSelected' },
					media: { type: 'image', altText: 'ColorTheme', path: 'ColorTheme.jpg', }
				},

				{
					id: 'findKeybindingsExtensions',
					description: localize('findKeybindingsTask.description', "Find keyboard shortcuts for Vim, Sublime, Atom and others."),
					title: localize('findKeybindingsTask.title', "Configure Keybindings"),
					button: {
						title: localize('findKeybindingsTask.button', "Search for Keymaps"),
						command: 'workbench.extensions.action.showRecommendedKeymapExtensions'
					},
					doneOn: { commandExecuted: 'workbench.extensions.action.showRecommendedKeymapExtensions' },
					media: { type: 'image', altText: 'Extensions', path: 'Extensions.jpg', }
				},

				{
					id: 'findLanguageExtensions',
					description: localize('findLanguageExtsTask.description', "Get support for your languages like JavaScript, Python, Java, Azure, Docker, and more."),
					title: localize('findLanguageExtsTask.title', "Languages & Tools"),
					button: {
						title: localize('findLanguageExtsTask.button', "Install Language Support"),
						command: 'workbench.extensions.action.showLanguageExtensions',
					},
					doneOn: { commandExecuted: 'workbench.extensions.action.showLanguageExtensions' },
					media: { type: 'image', altText: 'Languages', path: 'Languages.jpg', }
				},

				{
					id: 'pickAFolderTask-Mac',
					description: localize('gettingStartedOpenFolder.description', "Open a project folder to get started!"),
					title: localize('gettingStartedOpenFolder.title', "Open Folder"),
					when: 'isMac',
					button: {
						title: localize('gettingStartedOpenFolder.button', "Pick a Folder"),
						command: 'workbench.action.files.openFileFolder'
					},
					doneOn: { commandExecuted: 'workbench.action.files.openFileFolder' },
					media: { type: 'image', altText: 'OpenFolder', path: 'OpenFolder.jpg' }
				},

				{
					id: 'pickAFolderTask-Other',
					description: localize('gettingStartedOpenFolder.description', "Open a project folder to get started!"),
					title: localize('gettingStartedOpenFolder.title', "Open Folder"),
					when: '!isMac',
					button: {
						title: localize('gettingStartedOpenFolder.button', "Pick a Folder"),
						command: 'workbench.action.files.openFolder'
					},
					doneOn: { commandExecuted: 'workbench.action.files.openFolder' },
					media: { type: 'image', altText: 'OpenFolder', path: 'OpenFolder.jpg' }
				}
			]
		}
	},

	{
		id: 'Intermediate',
		title: localize('gettingStarted.intermediate.title', "Essentials"),
		icon: intermediateIcon,
		description: localize('gettingStarted.intermediate.description', "Must know features you'll love"),
		content: {
			type: 'items',
			items: [
				{
					id: 'commandPaletteTask',
					description: localize('commandPaletteTask.description', "The easiest way to find everything VS Code can do. If you\'re ever looking for a feature, check here first!"),
					title: localize('commandPaletteTask.title', "Command Palette"),
					button: {
						title: localize('commandPaletteTask.button', "View All Commands"),
						command: 'workbench.action.showCommands'
					},
					doneOn: { commandExecuted: 'workbench.action.showCommands' },
					media: { type: 'image', altText: 'gif of a custom tree hover', path: 'CommandPalette.jpg' },
				}
			]
		}
	},

	{
		id: 'Advanced',
		title: localize('gettingStarted.advanced.title', "Tips & Tricks"),
		icon: advancedIcon,
		description: localize('gettingStarted.advanced.description', "Favorites from VS Code experts"),
		content: {
			type: 'items',
			items: []
		}
	},

	{
		id: 'OpenFolder-Mac',
		title: localize('gettingStarted.openFolder.title', "Open Folder"),
		icon: openFolderIcon,
		when: 'isMac',
		description: localize('gettingStarted.openFolder.description', "Open a project and start working"),
		content: {
			type: 'command',
			command: 'workbench.action.files.openFileFolder'
		}
	},

	{
		id: 'OpenFolder-Other',
		title: localize('gettingStarted.openFolder.title', "Open Folder"),
		icon: openFolderIcon,
		description: localize('gettingStarted.openFolder.description', "Open a project and start working"),
		when: '!isMac',
		content: {
			type: 'command',
			command: 'workbench.action.files.openFolder'
		}
	},

	{
		id: 'InteractivePlayground',
		title: localize('gettingStarted.playground.title', "Interactive Playground"),
		icon: interactivePlaygroundIcon,
		description: localize('gettingStarted.interactivePlayground.description', "Learn essential editor features"),
		content: {
			type: 'command',
			command: 'workbench.action.showInteractivePlayground'
		}
	}
];
