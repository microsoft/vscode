/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';

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
	codicon: string,
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
		codicon: 'github',
		// when: 'remoteConnectionState == connected',
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
						command: 'workbench.action.debug.start'
					},
					doneOn: { commandExecuted: 'workbench.action.debug.start' },
					media: { type: 'image', altText: 'TBD', path: 'runProject.png' },
				},
				{
					id: 'forwardPortsTask',
					title: localize('gettingStarted.forwardPorts.title', "Forward Ports to the Web"),
					description: localize('gettingStarted.forwardPorts.description', "Test and debug your application in your browser by forwarding TCP ports running within your codespace."),
					button: {
						title: localize('gettingStarted.forwardPorts.button', "Open Ports"),
						command: '~remote.forwardedPorts.focus'
					},
					doneOn: { commandExecuted: '~remote.forwardedPorts.focus' },
					media: { type: 'image', altText: 'TBD', path: 'forwardPorts.png' },
				},
				{
					id: 'pullRequests',
					title: localize('gettingStarted.pullRequests.title', "Pull Requests at Your Fingertips"),
					description: localize('gettingStarted.pullRequests.description', "View Pull Requests. Check out branches. Add comments. Merge and delete branches from the Codespace."),
					button: {
						title: localize('gettingStarted.pullRequests.button', "Open GitHub Pull Request"),
						command: 'workbench.view.extension.github-pull-requests'
					},
					doneOn: { commandExecuted: 'workbench.view.extension.github-pull-requests' },
					media: { type: 'image', altText: 'TBD', path: 'pullRequests.png' },
				},
				{
					id: 'remoteTerminal',
					title: localize('gettingStarted.remoteTerminal.title', "Run Tasks in the Integrated Terminal"),
					description: localize('gettingStarted.remoteTerminal.description', "Access your full development environment in the cloud and perform quick command-line tasks."),
					button: {
						title: localize('gettingStarted.remoteTerminal.button', "Open Integrated Terminal"),
						command: 'terminal.focus'
					},
					doneOn: { commandExecuted: 'terminal.focus' },
					media: { type: 'image', altText: 'TBD', path: 'remoteTerminal.png' },
				},
				{
					id: 'openVSC',
					title: localize('gettingStarted.openVSC.title', "Open in Visual Studio Code"),
					description: localize('gettingStarted.openVSC.description', "You can develop in your codespace directly in VS Code Code by connecting the GitHub Codespaces extension with your account on GitHub."),
					button: {
						title: localize('gettingStarted.openVSC.button', "Open in VS Code"),
						command: 'github.codespaces.openInStable'
					},
					doneOn: { commandExecuted: 'github.codespaces.openInStable' },
					media: { type: 'image', altText: 'TBD', path: 'openVSC.png' },
				}
			]
		}
	},

	{
		id: 'Setup',
		title: localize('gettingStarted.setup.title', "Quick Setup"),
		description: localize('gettingStarted.setup.description', "Extend and customize VS Code to fit your needs."),
		codicon: 'milestone',
		when: '!emptyWorkspaceSupport',
		content: {
			type: 'items',
			items: [
				{
					id: 'pickColorTheme',
					title: localize('gettingStarted.pickColor.title', "Customize the Look With Themes"),
					description: localize('gettingStarted.pickColor.description', "Adapt VS Code to your taste with themes, customizing interface and language syntax colors."),
					button: { title: localize('gettingStarted.pickColor.button', "Browse Color Themes"), command: 'workbench.action.selectTheme' },
					doneOn: { eventFired: 'themeSelected' },
					media: { type: 'image', altText: 'ColorTheme', path: 'colorTheme.png', }
				},
				{
					id: 'findLanguageExtensions',
					title: localize('gettingStarted.findLanguageExts.title', "Add More Language & Tools Support"),
					description: localize('gettingStarted.findLanguageExts.description', "Install extensions with one click to support additional languages like Python, Java, Azure, Docker, and more."),
					button: {
						title: localize('gettingStarted.findLanguageExts.button', "Browse Language Extensions"),
						command: 'workbench.extensions.action.showLanguageExtensions',
					},
					doneOn: { commandExecuted: 'workbench.extensions.action.showLanguageExtensions' },
					media: { type: 'image', altText: 'Language extensions', path: 'languageExtensions.png', }
				},
				{
					id: 'githubLogin',
					title: localize('gettingStarted.githubLogin.title', "Use GitHub in VS Code"),
					description: localize('gettingStarted.githubLogin.description', "Integrated GitHub makes it easier for you to manage projects from inside your code editor, including authentication, publishing repos, and viewing your repo timeline."),
					when: '!githubBrowser:hasProviders',
					button: {
						title: localize('gettingStarted.githubLogin.button', "Sign in to GitHub"),
						command: 'githubsignIn',
					},
					doneOn: { commandExecuted: 'workbench.extensions.action.showLanguageExtensions' },
					media: { type: 'image', altText: 'Commiting a change via Git in VS Code.', path: 'github.png', }
				},
				{
					id: 'pickAFolderTask-Mac',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open Your Project"),
					description: localize('gettingStarted.setup.OpenFolder.description', "Open a project folder to get started!"),
					when: '!emptyWorkspaceSupport && isMac',
					button: {
						title: localize('gettingStarted.setup.OpenFolder.button', "Pick a Folder"),
						command: 'workbench.action.files.openFileFolder'
					},
					doneOn: { commandExecuted: 'workbench.action.files.openFileFolder' },
					media: { type: 'image', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.png' }
				},
				{
					id: 'pickAFolderTask-Other',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open Your Project"),
					description: localize('gettingStarted.setup.OpenFolder.description', "Open a project folder to get started!"),
					when: '!emptyWorkspaceSupport && !isMac',
					button: {
						title: localize('gettingStarted.setup.OpenFolder.button', "Pick a Folder"),
						command: 'workbench.action.files.openFolder'
					},
					doneOn: { commandExecuted: 'workbench.action.files.openFolder' },
					media: { type: 'image', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.png' }
				}
			]
		}
	},

	{
		id: 'Beginner',
		title: localize('gettingStarted.beginner.title', "Fundamentals of VS Code"),
		codicon: 'milestone',
		description: localize('gettingStarted.beginner.description', "Get up and running with must-have shortcuts & features."),
		content: {
			type: 'items',
			items: [
				{
					id: 'commandPaletteTask',
					title: localize('gettingStarted.commandPalette.title', "Find and Run Commands"),
					description: localize('gettingStarted.commandPalette.description', "The easiest way to find everything VS Code can do. If you\'re ever looking for a feature or a shortcut, check here first!"),
					button: {
						title: localize('gettingStarted.commandPalette.button', "Open Command Palette"),
						command: 'workbench.action.showCommands'
					},
					doneOn: { commandExecuted: 'workbench.action.showCommands' },
					media: { type: 'image', altText: 'Command Palette overlay for searching and executing commands.', path: 'commandPalette.png' },
				},
				{
					id: 'terminal',
					title: localize('gettingStarted.terminal.title', "Run Command-Line Tasks"),
					description: localize('gettingStarted.terminal.description', "Quickly run shell commands and monitor build output, right next to your code."),
					button: {
						title: localize('gettingStarted.terminal.button', "Open Integrated Terminal"),
						command: 'workbench.action.terminal.toggleTerminal'
					},
					doneOn: { commandExecuted: 'workbench.action.terminal.toggleTerminal' },
					media: { type: 'image', altText: 'Integrated terminal running a few npm commands', path: 'terminal.png' },
				},
				{
					id: 'extensions',
					title: localize('gettingStarted.extensions.title', "Supercharge VS Code With Extensions"),
					description: localize('gettingStarted.extensions.description', "Extensions let you add languages, debuggers, and new features to support your development workflow."),
					button: {
						title: localize('gettingStarted.extensions.button', "Browse Recommended Extensions"),
						command: 'workbench.extensions.action.showRecommendedExtensions'
					},
					doneOn: { commandExecuted: 'workbench.extensions.action.showRecommendedExtensions' },
					media: { type: 'image', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions.png' },
				},
				{
					id: 'settings',
					title: localize('gettingStarted.settings.title', "Everything is a Setting"),
					description: localize('gettingStarted.settings.description', "Tweak VS Code's core features and interface elements to perfection. Settings Sync will make sure you'll keep the best changes."),
					button: {
						title: localize('gettingStarted.settings.button', "Tweak Commonly Used Settings"),
						command: 'workbench.action.settings'
					},
					doneOn: { commandExecuted: 'workbench.action.settings' },
					media: { type: 'image', altText: 'gif of a custom tree hover', path: 'settings.png' },
				}
			]
		}
	}

];
