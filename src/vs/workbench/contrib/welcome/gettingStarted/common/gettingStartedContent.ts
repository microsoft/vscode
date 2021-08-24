/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/contrib/welcome/gettingStarted/common/media/example_markdown_media';
import 'vs/workbench/contrib/welcome/gettingStarted/common/media/notebookProfile';
import { localize } from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { OpenGettingStarted } from 'vs/workbench/contrib/notebook/common/notebookCommon';


const setupIcon = registerIcon('getting-started-setup', Codicon.zap, localize('getting-started-setup-icon', "Icon used for the setup category of welcome page"));
const beginnerIcon = registerIcon('getting-started-beginner', Codicon.lightbulb, localize('getting-started-beginner-icon', "Icon used for the beginner category of welcome page"));
const intermediateIcon = registerIcon('getting-started-intermediate', Codicon.mortarBoard, localize('getting-started-intermediate-icon', "Icon used for the intermediate category of welcome page"));


export type BuiltinGettingStartedStep = {
	id: string
	title: string,
	description: string,
	completionEvents?: string[]
	when?: string,
	media:
	| { type: 'image', path: string | { hc: string, light: string, dark: string }, altText: string }
	| { type: 'svg', path: string, altText: string }
	| { type: 'markdown', path: string },
};

export type BuiltinGettingStartedCategory = {
	id: string
	title: string,
	description: string,
	isFeatured: boolean,
	next?: string,
	icon: ThemeIcon,
	when?: string,
	content:
	| { type: 'steps', steps: BuiltinGettingStartedStep[] }
};

export type BuiltinGettingStartedStartEntry = {
	id: string
	title: string,
	description: string,
	icon: ThemeIcon,
	when?: string,
	content:
	| { type: 'startEntry', command: string }
};

type GettingStartedWalkthroughContent = BuiltinGettingStartedCategory[];
type GettingStartedStartEntryContent = BuiltinGettingStartedStartEntry[];

export const startEntries: GettingStartedStartEntryContent = [
	{
		id: 'welcome.showNewFileEntries',
		title: localize('gettingStarted.newFile.title', "New File..."),
		description: localize('gettingStarted.newFile.description', "Open a new untitled file, notebook, or custom editor."),
		icon: Codicon.newFile,
		content: {
			type: 'startEntry',
			command: 'welcome.showNewFileEntries',
		}
	},
	// {
	// 	id: 'welcome.showNewFolderEntries',
	// 	title: localize('gettingStarted.newFolder.title', "New Folder..."),
	// 	description: localize('gettingStarted.newFolder.description', "Create a folder from a Git repo or an extension contributed template folder"),
	// 	icon: Codicon.newFolder,
	// 	content: {
	// 		type: 'startEntry',
	// 		command: 'welcome.showNewFolderEntries',
	// 	}
	// },
	{
		id: 'topLevelOpenMac',
		title: localize('gettingStarted.openMac.title', "Open..."),
		description: localize('gettingStarted.openMac.description', "Open a file or folder to start working"),
		icon: Codicon.folderOpened,
		when: '!isWeb && isMac',
		content: {
			type: 'startEntry',
			command: 'workbench.action.files.openFileFolder',
		}
	},
	{
		id: 'topLevelOpenFile',
		title: localize('gettingStarted.openFile.title', "Open File..."),
		description: localize('gettingStarted.openFile.description', "Open a file to start working"),
		icon: Codicon.goToFile,
		when: '!isWeb && !isMac',
		content: {
			type: 'startEntry',
			command: 'workbench.action.files.openFile',
		}
	},
	{
		id: 'topLevelOpenFolder',
		title: localize('gettingStarted.openFolder.title', "Open Folder..."),
		description: localize('gettingStarted.openFolder.description', "Open a folder to start working"),
		icon: Codicon.folderOpened,
		when: '!isWeb && !isMac',
		content: {
			type: 'startEntry',
			command: 'workbench.action.files.openFolder',
		}
	},
	{
		id: 'topLevelCommandPalette',
		title: localize('gettingStarted.topLevelCommandPalette.title', "Run a Command..."),
		description: localize('gettingStarted.topLevelCommandPalette.description', "Use the command palette to view and run all of vscode's commands"),
		icon: Codicon.symbolColor,
		content: {
			type: 'startEntry',
			command: 'workbench.action.showCommands',
		}
	},
	{
		id: 'topLevelShowWalkthroughs',
		title: localize('gettingStarted.topLevelShowWalkthroughs.title', "Open a Walkthrough..."),
		description: localize('gettingStarted.topLevelShowWalkthroughs.description', ""),
		icon: Codicon.checklist,
		when: 'allWalkthroughsHidden',
		content: {
			type: 'startEntry',
			command: 'welcome.showAllWalkthroughs',
		}
	},
];

const Button = (title: string, href: string) => `[${title}](${href})`;

export const walkthroughs: GettingStartedWalkthroughContent = [
	{
		id: 'Setup',
		title: localize('gettingStarted.setup.title', "Get Started with VS Code"),
		description: localize('gettingStarted.setup.description', "Discover the best customizations to make VS Code yours."),
		isFeatured: true,
		icon: setupIcon,
		next: 'Beginner',
		content: {
			type: 'steps',
			steps: [
				{
					id: 'pickColorTheme',
					title: localize('gettingStarted.pickColor.title', "Choose the look you want"),
					description: localize('gettingStarted.pickColor.description.interpolated', "The right color palette helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize('titleID', "Browse Color Themes"), 'command:workbench.action.selectTheme')),
					completionEvents: [
						'onSettingChanged:workbench.colorTheme',
						'onCommand:workbench.action.selectTheme'
					],
					media: { type: 'markdown', path: 'example_markdown_media', }
				},
				{
					id: 'settingsSyncWeb',
					title: localize('gettingStarted.settingsSync.title', "Sync your stuff across devices"),
					description: localize('gettingStarted.settingsSync.description.interpolated', "Never lose the perfect VS Code setup! Settings Sync will back up and share settings, keybindings & extensions across several installations.\n{0}", Button(localize('enableSync', "Enable Settings Sync"), 'command:workbench.userDataSync.actions.turnOn')),
					when: 'workspacePlatform == \'webworker\' && syncStatus != uninitialized',
					completionEvents: ['onEvent:sync-enabled'],
					media: {
						type: 'svg', altText: 'The "Turn on Sync" entry in the settings gear menu.', path: 'settingsSync.svg'
					},
				},
				{
					id: 'findLanguageExtensions',
					title: localize('gettingStarted.findLanguageExts.title', "Rich support for all your languages"),
					description: localize('gettingStarted.findLanguageExts.description.interpolated', "Code smarter with syntax highlighting, code completion, linting and debugging. While many languages are built-in, many more can be added as extensions.\n{0}", Button(localize('browseLangExts', "Browse Language Extensions"), 'command:workbench.extensions.action.showLanguageExtensions')),
					when: 'workspacePlatform != \'webworker\'',
					media: {
						type: 'svg', altText: 'Language extensions', path: 'languages.svg'
					},
				},
				{
					id: 'commandPaletteTask',
					title: localize('gettingStarted.commandPalette.title', "One shortcut to access everything"),
					description: localize('gettingStarted.commandPalette.description.interpolated', "Commands Palette is the keyboard way to accomplish any task in VS Code. **Practice** by looking up your frequently used commands to save time and keep in the flow.\n{0}\n__Try searching for 'view toggle'.__", Button(localize('commandPalette', "Open Command Palette"), 'command:workbench.action.showCommands')),
					media: { type: 'svg', altText: 'Command Palette overlay for searching and executing commands.', path: 'commandPalette.svg' },
				},
				{
					id: 'extensionsWeb',
					title: localize('gettingStarted.extensions.title', "Limitless extensibility"),
					description: localize('gettingStarted.extensions.description.interpolated', "Extensions are VS Code's power-ups. They range from handy productivity hacks, expanding out-of-the-box features, to adding completely new capabilities.\n{0}", Button(localize('browseRecommended', "Browse Recommended Extensions"), 'command:workbench.extensions.action.showPopularExtensions')),
					when: 'workspacePlatform == \'webworker\'',
					media: {
						type: 'svg', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions.svg'
					},
				},
				{
					id: 'workspaceTrust',
					title: localize('gettingStarted.workspaceTrust.title', "Safely browse and edit code"),
					description: localize('gettingStarted.workspaceTrust.description.interpolated', "{0} lets you decide whether your project folders should **allow or restrict** automatic code execution __(required for extensions, debugging, etc)__.\nOpening a file/folder will prompt to grant trust. You can always {1} later.", Button(localize('workspaceTrust', "Workspace Trust"), 'https://github.com/microsoft/vscode-docs/blob/workspaceTrust/docs/editor/workspace-trust.md'), Button(localize('enableTrust', "enable trust"), 'command:toSide:workbench.action.manageTrustedDomain')),
					when: 'workspacePlatform != \'webworker\' && !isWorkspaceTrusted && workspaceFolderCount == 0',
					media: {
						type: 'svg', altText: 'Workspace Trust editor in Restricted mode and a primary button for switching to Trusted mode.', path: 'workspaceTrust.svg'
					},
				},
				{
					id: 'pickAFolderTask-Web',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open up your code"),
					description: localize('gettingStarted.setup.OpenFolderWeb.description.interpolated', "You're all set to start coding. Open a project folder to get your files into VS Code.\n{0}\n{1}", Button(localize('openLocalFolder', "Open Local Folder"), 'command:workbench.action.addRootFolder'), Button(localize('openRepository', "Open Repository"), 'command:remoteHub.openRepository')),
					when: 'isWeb && workspaceFolderCount == 0',
					media: {
						type: 'svg', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.svg'
					}
				},
				{
					id: 'pickAFolderTask-Mac',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open up your code"),
					description: localize('gettingStarted.setup.OpenFolder.description.interpolated', "You're all set to start coding. Open a project folder to get your files into VS Code.\n{0}", Button(localize('pickFolder', "Pick a Folder"), 'command:workbench.action.files.openFileFolder')),
					when: '!isWeb && isMac && workspaceFolderCount == 0',
					media: {
						type: 'svg', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.svg'
					}
				},
				{
					id: 'pickAFolderTask-Other',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open up your code"),
					description: localize('gettingStarted.setup.OpenFolder.description.interpolated', "You're all set to start coding. Open a project folder to get your files into VS Code.\n{0}", Button(localize('pickFolder', "Pick a Folder"), 'command:workbench.action.files.openFolder')),
					when: '!isWeb && !isMac && workspaceFolderCount == 0',
					media: {
						type: 'svg', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.svg'
					}
				},
				{
					id: 'quickOpen',
					title: localize('gettingStarted.quickOpen.title', "Quickly navigate between your files"),
					description: localize('gettingStarted.quickOpen.description.interpolated', "Navigate between files in an instant with one keystroke. Tip: Open multiple files by pressing the right arrow key.\n{0}", Button(localize('quickOpen', "Quick Open a File"), 'command:toSide:workbench.action.quickOpen')),
					when: 'workspaceFolderCount != 0',
					media: {
						type: 'svg', altText: 'Go to file in quick search.', path: 'search.svg'
					}
				}
			]
		}
	},

	{
		id: 'Beginner',
		title: localize('gettingStarted.beginner.title', "Learn the Fundamentals"),
		icon: beginnerIcon,
		isFeatured: true,
		next: 'Intermediate',
		description: localize('gettingStarted.beginner.description', "Jump right into VS Code and get an overview of the must-have features."),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'playground',
					title: localize('gettingStarted.playground.title', "Redefine your editing skills"),
					description: localize('gettingStarted.playground.description.interpolated', "Want to code faster and smarter? Practice powerful code editing features in the interactive playground.\n{0}", Button(localize('openInteractivePlayground', "Open Interactive Playground"), 'command:toSide:workbench.action.showInteractivePlayground')),
					media: {
						type: 'svg', altText: 'Interactive Playground.', path: 'interactivePlayground.svg'
					},
				},
				{
					id: 'terminal',
					title: localize('gettingStarted.terminal.title', "Convenient built-in terminal"),
					description: localize('gettingStarted.terminal.description.interpolated', "Quickly run shell commands and monitor build output, right next to your code.\n{0}", Button(localize('showTerminal', "Show Terminal Panel"), 'command:workbench.action.terminal.toggleTerminal')),
					when: 'workspacePlatform != \'webworker\' && remoteName != codespaces && !terminalIsOpen',
					media: {
						type: 'svg', altText: 'Integrated terminal running a few npm commands', path: 'terminal.svg'
					},
				},
				{
					id: 'extensions',
					title: localize('gettingStarted.extensions.title', "Limitless extensibility"),
					description: localize('gettingStarted.extensions.description.interpolated', "Extensions are VS Code's power-ups. They range from handy productivity hacks, expanding out-of-the-box features, to adding completely new capabilities.\n{0}", Button(localize('browseRecommended', "Browse Recommended Extensions"), 'command:workbench.extensions.action.showRecommendedExtensions')),
					when: 'workspacePlatform != \'webworker\'',
					media: {
						type: 'svg', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions.svg'
					},
				},
				{
					id: 'settings',
					title: localize('gettingStarted.settings.title', "Tune your settings"),
					description: localize('gettingStarted.settings.description.interpolated', "Tweak every aspect of VS Code and your extensions to your liking. Commonly used settings are listed first to get you started.\n{0}", Button(localize('tweakSettings', "Tweak my Settings"), 'command:toSide:workbench.action.openSettings')),
					media: {
						type: 'svg', altText: 'VS Code Settings', path: 'settings.svg'
					},
				},
				{
					id: 'settingsSync',
					title: localize('gettingStarted.settingsSync.title', "Sync your stuff across devices"),
					description: localize('gettingStarted.settingsSync.description.interpolated', "Never lose the perfect VS Code setup! Settings Sync will back up and share settings, keybindings & extensions across several installations.\n{0}", Button(localize('enableSync', "Enable Settings Sync"), 'command:workbench.userDataSync.actions.turnOn')),
					when: 'workspacePlatform != \'webworker\' && syncStatus != uninitialized',
					completionEvents: ['onEvent:sync-enabled'],
					media: {
						type: 'svg', altText: 'The "Turn on Sync" entry in the settings gear menu.', path: 'settingsSync.svg'
					},
				},
				{
					id: 'videoTutorial',
					title: localize('gettingStarted.videoTutorial.title', "Lean back and learn"),
					description: localize('gettingStarted.videoTutorial.description.interpolated', "Watch the first in a series of short & practical video tutorials for VS Code's key features.\n{0}", Button(localize('watch', "Watch Tutorial"), 'https://aka.ms/vscode-getting-started-video')),
					media: { type: 'svg', altText: 'VS Code Settings', path: 'learn.svg' },
				}
			]
		}
	},

	{
		id: 'Intermediate',
		isFeatured: false,
		title: localize('gettingStarted.intermediate.title', "Boost your Productivity"),
		icon: intermediateIcon,
		description: localize('gettingStarted.intermediate.description', "Optimize your development workflow with these tips & tricks."),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'splitview',
					title: localize('gettingStarted.splitview.title', "Side by side editing"),
					description: localize('gettingStarted.splitview.description.interpolated', "Make the most of your screen estate by opening files side by side, vertically and horizontally.\n{0}", Button(localize('splitEditor', "Split Editor"), 'command:workbench.action.splitEditor')),
					media: {
						type: 'svg', altText: 'Multiple editors in split view.', path: 'sideBySide.svg',
					},
				},
				{
					id: 'debugging',
					title: localize('gettingStarted.debug.title', "Watch your code in action"),
					description: localize('gettingStarted.debug.description.interpolated', "Accelerate your edit, build, test, and debug loop by setting up a launch configuration.\n{0}", Button(localize('runProject', "Run your Project"), 'command:workbench.action.debug.selectandstart')),
					when: 'workspacePlatform != \'webworker\' && workspaceFolderCount != 0',
					media: {
						type: 'svg', altText: 'Run and debug view.', path: 'debug.svg',
					},
				},
				{
					id: 'scmClone',
					title: localize('gettingStarted.scm.title', "Track your code with Git"),
					description: localize('gettingStarted.scmClone.description.interpolated', "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize('cloneRepo', "Clone Repository"), 'command:git.clone')),
					when: 'config.git.enabled && !git.missing && workspaceFolderCount == 0',
					media: {
						type: 'svg', altText: 'Source Control view.', path: 'git.svg',
					},
				},
				{
					id: 'scmSetup',
					title: localize('gettingStarted.scm.title', "Track your code with Git"),
					description: localize('gettingStarted.scmSetup.description.interpolated', "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize('initRepo', "Initialize Git Repository"), 'command:git.init')),
					when: 'config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount == 0',
					media: {
						type: 'svg', altText: 'Source Control view.', path: 'git.svg',
					},
				},
				{
					id: 'scm',
					title: localize('gettingStarted.scm.title', "Track your code with Git"),
					description: localize('gettingStarted.scm.description.interpolated', "No more looking up Git commands! Git and GitHub workflows are seamlessly integrated.\n{0}", Button(localize('openSCM', "Open Source Control"), 'command:workbench.view.scm')),
					when: 'config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount != 0 && activeViewlet != \'workbench.view.scm\'',
					media: {
						type: 'svg', altText: 'Source Control view.', path: 'git.svg',
					},
				},
				{
					id: 'installGit',
					title: localize('gettingStarted.installGit.title', "Install Git"),
					description: localize('gettingStarted.installGit.description.interpolated', "Install Git to track changes in your projects.\n{0}", Button(localize('installGit', "Install Git"), 'https://aka.ms/vscode-install-git')),
					when: 'git.missing',
					media: {
						type: 'svg', altText: 'Install Git.', path: 'git.svg',
					},
				},
				{
					id: 'tasks',
					title: localize('gettingStarted.tasks.title', "Automate your project tasks"),
					when: 'workspaceFolderCount != 0 && workspacePlatform != \'webworker\'',
					description: localize('gettingStarted.tasks.description.interpolated', "Create tasks for your common workflows and enjoy the integrated experience of running scripts and automatically checking results.\n{0}", Button(localize('runTasks', "Run Auto-detected Tasks"), 'command:workbench.action.tasks.runTask')),
					media: {
						type: 'svg', altText: 'Task runner.', path: 'runTask.svg',
					},
				},
				{
					id: 'shortcuts',
					title: localize('gettingStarted.shortcuts.title', "Customize your shortcuts"),
					description: localize('gettingStarted.shortcuts.description.interpolated', "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize('keyboardShortcuts', "Keyboard Shortcuts"), 'command:toSide:workbench.action.openGlobalKeybindings')),
					media: {
						type: 'svg', altText: 'Interactive shortcuts.', path: 'shortcuts.svg',
					}
				}
			]
		}
	},
	{
		id: 'notebooks',
		title: localize('gettingStarted.notebook.title', "Customize Notebooks"),
		description: '',
		icon: setupIcon,
		isFeatured: false,
		when: `config.${OpenGettingStarted} && userHasOpenedNotebook`,
		content: {
			type: 'steps',
			steps: [
				{
					completionEvents: ['onCommand:notebook.setProfile'],
					id: 'notebookProfile',
					title: localize('gettingStarted.notebookProfile.title', "Select the layout for your notebooks"),
					description: localize('gettingStarted.notebookProfile.description', "Get notebooks to feel just the way you prefer"),
					when: 'userHasOpenedNotebook',
					media: {
						type: 'markdown', path: 'notebookProfile'
					}
				},
			]
		}
	}
];
