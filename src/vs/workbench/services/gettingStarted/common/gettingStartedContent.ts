/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';


const setupIcon = registerIcon('getting-started-setup', Codicon.heart, localize('getting-started-setup-icon', "Icon used for the setup category of getting started"));
const beginnerIcon = registerIcon('getting-started-beginner', Codicon.lightbulb, localize('getting-started-beginner-icon', "Icon used for the beginner category of getting started"));
const codespacesIcon = registerIcon('getting-started-codespaces', Codicon.github, localize('getting-started-codespaces-icon', "Icon used for the codespaces category of getting started"));


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
		id: 'Codespaces',
		title: localize('gettingStarted.codespaces.title', "Primer on GitHub Codespaces"),
		icon: codespacesIcon,
		when: 'remoteName == codespaces',
		description: localize('gettingStarted.codespaces.description', "Get up and running with your instant code environment."),
		content: {
			type: 'items',
			items: [
				{
					id: 'runProjectTask',
					title: localize('gettingStarted.runProject.title', "Build & run your project"),
					description: localize('gettingStarted.runProject.description', "Build, run & debug your application in your codespace instead of locally."),
					button: {
						title: localize('gettingStarted.runProject.button', "Run Project"),
						command: 'workbench.action.debug.selectandstart'
					},
					doneOn: { commandExecuted: 'workbench.action.debug.selectandstart' },
					media: { type: 'image', altText: 'Node.js project running debug mode and paused.', path: 'runProject.jpg' },
				},
				{
					id: 'forwardPortsTask',
					title: localize('gettingStarted.forwardPorts.title', "Access your running application"),
					description: localize('gettingStarted.forwardPorts.description', "Ports running within your codespace are automatically forwarded to the web, so you can open them in your browser."),
					button: {
						title: localize('gettingStarted.forwardPorts.button', "Show Ports panel"),
						command: '~remote.forwardedPorts.focus'
					},
					doneOn: { commandExecuted: '~remote.forwardedPorts.focus' },
					media: { type: 'image', altText: 'Ports panel.', path: 'forwardPorts.jpg' },
				},
				{
					id: 'pullRequests',
					title: localize('gettingStarted.pullRequests.title', "Pull pequests at your fingertips"),
					description: localize('gettingStarted.pullRequests.description', "Codespaces brings your GitHub workflow closer to your code, where you can view pull requests, add comments, merge branches, and more."),
					button: {
						title: localize('gettingStarted.pullRequests.button', "Open GitHub view"),
						command: 'workbench.view.extension.github-pull-requests'
					},
					doneOn: { commandExecuted: 'workbench.view.extension.github-pull-requests' },
					media: { type: 'image', altText: 'Preview for reviewing a pull request.', path: 'pullRequests.jpg' },
				},
				{
					id: 'remoteTerminal',
					title: localize('gettingStarted.remoteTerminal.title', "Run tasks in the integrated terminal"),
					description: localize('gettingStarted.remoteTerminal.description', "Access your full development environment in the cloud and perform quick command-line tasks."),
					button: {
						title: localize('gettingStarted.remoteTerminal.button', "Focus Terminal"),
						command: 'terminal.focus'
					},
					doneOn: { commandExecuted: 'terminal.focus' },
					media: { type: 'image', altText: 'Remote terminal showing npm commands.', path: 'remoteTerminal.jpg' },
				},
				{
					id: 'openVSC',
					title: localize('gettingStarted.openVSC.title', "Develop remotely in VS Code"),
					description: localize('gettingStarted.openVSC.description', "Access the power of your cloud development environment from your local VS Code. Set up your local VS Code by installing the GitHub Codespaces extension and connecting your GitHub account."),
					button: {
						title: localize('gettingStarted.openVSC.button', "Open in VS Code"),
						command: 'github.codespaces.openInStable'
					},
					when: 'isWeb',
					doneOn: { commandExecuted: 'github.codespaces.openInStable' },
					media: { type: 'image', altText: 'Preview of the Open in VS Code command.', path: 'openVSC.jpg' },
				}
			]
		}
	},

	{
		id: 'Setup',
		title: localize('gettingStarted.setup.title', "Quick Setup"),
		description: localize('gettingStarted.setup.description', "Extend and customize VS Code to make it yours."),
		icon: setupIcon,
		content: {
			type: 'items',
			items: [
				{
					id: 'pickColorTheme',
					title: localize('gettingStarted.pickColor.title', "Customize the look with themes"),
					description: localize('gettingStarted.pickColor.description', "Pick a theme to match your taste and mood. Browse even more from the vibrant themes community."),
					button: { title: localize('gettingStarted.pickColor.button', "Pick your Theme"), command: 'workbench.action.selectTheme' },
					doneOn: { eventFired: 'themeSelected' },
					media: { type: 'image', altText: 'Color theme preview for dark and light theme.', path: 'colorTheme.jpg', }
				},
				{
					id: 'findLanguageExtensions',
					title: localize('gettingStarted.findLanguageExts.title', "Add more language & tools support"),
					description: localize('gettingStarted.findLanguageExts.description', "VS Code supports almost every major programming language. While many are built-in, others can be installed as extensions with one click."),
					button: {
						title: localize('gettingStarted.findLanguageExts.button', "Browse Language Extensions"),
						command: 'workbench.extensions.action.showLanguageExtensions',
					},
					doneOn: { commandExecuted: 'workbench.extensions.action.showLanguageExtensions' },
					media: { type: 'image', altText: 'Language extensions', path: 'languageExtensions.jpg', }
				},
				{
					id: 'settingsSync',
					title: localize('gettingStarted.settingsSync.title', "Sync your favorite setup"),
					description: localize('gettingStarted.settingsSync.description', "Never lose the perfect VS Code setup! Settings Sync will back up and share settings, keybindings and installed extensions across several VS Code installations."),
					when: 'syncStatus != uninitialized',
					button: {
						title: localize('gettingStarted.settingsSync.button', "Enable Settings Sync"),
						command: 'workbench.userDataSync.actions.turnOn',
					},
					doneOn: { eventFired: 'sync-enabled' },
					media: { type: 'image', altText: 'The "Turn on Sync" entry in the settings gear menu.', path: 'settingsSync.jpg', }
				},
				{
					id: 'pickAFolderTask-Mac',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open your project"),
					description: localize('gettingStarted.setup.OpenFolder.description', "Open a project folder to get started!"),
					when: 'isMac',
					button: {
						title: localize('gettingStarted.setup.OpenFolder.button', "Pick a Folder"),
						command: 'workbench.action.files.openFileFolder'
					},
					doneOn: { commandExecuted: 'workbench.action.files.openFileFolder' },
					media: { type: 'image', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.jpg' }
				},
				{
					id: 'pickAFolderTask-Other',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open your project"),
					description: localize('gettingStarted.setup.OpenFolder.description', "Open a project folder to get started!"),
					when: '!isMac',
					button: {
						title: localize('gettingStarted.setup.OpenFolder.button', "Pick a Folder"),
						command: 'workbench.action.files.openFolder'
					},
					doneOn: { commandExecuted: 'workbench.action.files.openFolder' },
					media: { type: 'image', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.jpg' }
				}
			]
		}
	},

	{
		id: 'Beginner',
		title: localize('gettingStarted.beginner.title', "Learn the Fundamentals"),
		icon: beginnerIcon,
		description: localize('gettingStarted.beginner.description', "Save time with these must-have shortcuts & features."),
		content: {
			type: 'items',
			items: [
				{
					id: 'commandPaletteTask',
					title: localize('gettingStarted.commandPalette.title', "Find and run commands"),
					description: localize('gettingStarted.commandPalette.description', "The easiest way to find everything VS Code can do. If you\'re ever looking for a feature or a shortcut, check here first!"),
					button: {
						title: localize('gettingStarted.commandPalette.button', "Open Command Palette"),
						command: 'workbench.action.showCommands'
					},
					doneOn: { commandExecuted: 'workbench.action.showCommands' },
					media: { type: 'image', altText: 'Command Palette overlay for searching and executing commands.', path: 'commandPalette.jpg' },
				},
				{
					id: 'terminal',
					title: localize('gettingStarted.terminal.title', "Run tasks in the integrated terminal"),
					description: localize('gettingStarted.terminal.description', "Quickly run shell commands and monitor build output, right next to your code."),
					button: {
						title: localize('gettingStarted.terminal.button', "Open the Terminal"),
						command: 'workbench.action.terminal.toggleTerminal'
					},
					doneOn: { commandExecuted: 'workbench.action.terminal.toggleTerminal' },
					media: { type: 'image', altText: 'Integrated terminal running a few npm commands', path: 'terminal.jpg' },
				},
				{
					id: 'extensions',
					title: localize('gettingStarted.extensions.title', "Limitless extensibility"),
					description: localize('gettingStarted.extensions.description', "Extensions are VS Code's power ups. They range from handy productivity hacks, expanding out-of-the-box features, to adding completely new capabilities."),
					button: {
						title: localize('gettingStarted.extensions.button', "Browse Recommended Extensions"),
						command: 'workbench.extensions.action.showRecommendedExtensions'
					},
					doneOn: { commandExecuted: 'workbench.extensions.action.showRecommendedExtensions' },
					media: { type: 'image', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions.jpg' },
				},
				{
					id: 'settings',
					title: localize('gettingStarted.settings.title', "Everything is a setting"),
					description: localize('gettingStarted.settings.description', "Optimize every part of VS Code's look & feel to your liking. Enable Settings Sync lets you share your personal tweaks across machines."),
					button: {
						title: localize('gettingStarted.settings.button', "Tweak Some Settings"),
						command: 'workbench.action.openSettings'
					},
					doneOn: { commandExecuted: 'workbench.action.openSettings' },
					media: { type: 'image', altText: 'VS Code Settings', path: 'settings.jpg' },
				}
			]
		}
	}

];
