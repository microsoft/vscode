/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import themePickerContent from './media/theme_picker.js';
import themePickerSmallContent from './media/theme_picker_small.js';
import notebookProfileContent from './media/notebookProfile.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { NotebookSetting } from '../../notebook/common/notebookCommon.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { URI } from '../../../../base/common/uri.js';
import product from '../../../../platform/product/common/product.js';

interface IGettingStartedContentProvider {
	(): string;
}

class GettingStartedContentProviderRegistry {

	private readonly providers = new Map<string, IGettingStartedContentProvider>();

	registerProvider(moduleId: string, provider: IGettingStartedContentProvider): void {
		this.providers.set(moduleId, provider);
	}

	getProvider(moduleId: string): IGettingStartedContentProvider | undefined {
		return this.providers.get(moduleId);
	}
}
export const gettingStartedContentRegistry = new GettingStartedContentProviderRegistry();

export async function moduleToContent(resource: URI): Promise<string> {
	if (!resource.query) {
		throw new Error('Getting Started: invalid resource');
	}

	const query = JSON.parse(resource.query);
	if (!query.moduleId) {
		throw new Error('Getting Started: invalid resource');
	}

	const provider = gettingStartedContentRegistry.getProvider(query.moduleId);
	if (!provider) {
		throw new Error(`Getting Started: no provider registered for ${query.moduleId}`);
	}

	return provider();
}

gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker', themePickerContent);
gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker_small', themePickerSmallContent);
gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/notebookProfile', notebookProfileContent);
// Register empty media for accessibility walkthrough
gettingStartedContentRegistry.registerProvider('vs/workbench/contrib/welcomeGettingStarted/common/media/empty', () => '');

const setupIcon = registerIcon('getting-started-setup', Codicon.zap, localize('getting-started-setup-icon', "Icon used for the setup category of welcome page"));
const beginnerIcon = registerIcon('getting-started-beginner', Codicon.lightbulb, localize('getting-started-beginner-icon', "Icon used for the beginner category of welcome page"));

export type BuiltinGettingStartedStep = {
	id: string;
	title: string;
	description: string;
	completionEvents?: string[];
	when?: string;
	media:
	| { type: 'image'; path: string | { hc: string; hcLight?: string; light: string; dark: string }; altText: string }
	| { type: 'svg'; path: string; altText: string }
	| { type: 'markdown'; path: string }
	| { type: 'video'; path: string | { hc: string; hcLight?: string; light: string; dark: string }; poster?: string | { hc: string; hcLight?: string; light: string; dark: string }; altText: string };
};

export type BuiltinGettingStartedCategory = {
	id: string;
	title: string;
	description: string;
	isFeatured: boolean;
	next?: string;
	icon: ThemeIcon;
	when?: string;
	content:
	| { type: 'steps'; steps: BuiltinGettingStartedStep[] };
	walkthroughPageTitle: string;
};

export type BuiltinGettingStartedStartEntry = {
	id: string;
	title: string;
	description: string;
	icon: ThemeIcon;
	when?: string;
	content:
	| { type: 'startEntry'; command: string };
};

type GettingStartedWalkthroughContent = BuiltinGettingStartedCategory[];
type GettingStartedStartEntryContent = BuiltinGettingStartedStartEntry[];

export const startEntries: GettingStartedStartEntryContent = [
	{
		id: 'welcome.showNewFileEntries',
		title: localize('gettingStarted.newFile.title', "New File..."),
		description: localize('gettingStarted.newFile.description', "Open a new untitled text file, notebook, or custom editor."),
		icon: Codicon.newFile,
		content: {
			type: 'startEntry',
			command: 'command:welcome.showNewFileEntries',
		}
	},
	{
		id: 'topLevelOpenMac',
		title: localize('gettingStarted.openMac.title', "Open..."),
		description: localize('gettingStarted.openMac.description', "Open a file or folder to start working"),
		icon: Codicon.folderOpened,
		when: '!isWeb && isMac',
		content: {
			type: 'startEntry',
			command: 'command:workbench.action.files.openFileFolder',
		}
	},
	{
		id: 'topLevelOpenFile',
		title: localize('gettingStarted.openFile.title', "Open File..."),
		description: localize('gettingStarted.openFile.description', "Open a file to start working"),
		icon: Codicon.goToFile,
		when: 'isWeb || !isMac',
		content: {
			type: 'startEntry',
			command: 'command:workbench.action.files.openFile',
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
			command: 'command:workbench.action.files.openFolder',
		}
	},
	{
		id: 'topLevelOpenFolderWeb',
		title: localize('gettingStarted.openFolder.title', "Open Folder..."),
		description: localize('gettingStarted.openFolder.description', "Open a folder to start working"),
		icon: Codicon.folderOpened,
		when: '!openFolderWorkspaceSupport && workbenchState == \'workspace\'',
		content: {
			type: 'startEntry',
			command: 'command:workbench.action.files.openFolderViaWorkspace',
		}
	},
	{
		id: 'topLevelGitClone',
		title: localize('gettingStarted.topLevelGitClone.title', "Clone Git Repository..."),
		description: localize('gettingStarted.topLevelGitClone.description', "Clone a remote repository to a local folder"),
		when: 'config.git.enabled && !git.missing',
		icon: Codicon.sourceControl,
		content: {
			type: 'startEntry',
			command: 'command:git.clone',
		}
	},
	{
		id: 'topLevelGitOpen',
		title: localize('gettingStarted.topLevelGitOpen.title', "Open Repository..."),
		description: localize('gettingStarted.topLevelGitOpen.description', "Connect to a remote repository or pull request to browse, search, edit, and commit"),
		when: 'workspacePlatform == \'webworker\'',
		icon: Codicon.sourceControl,
		content: {
			type: 'startEntry',
			command: 'command:remoteHub.openRepository',
		}
	},
	{
		id: 'topLevelRemoteOpen',
		title: localize('gettingStarted.topLevelRemoteOpen.title', "Connect to..."),
		description: localize('gettingStarted.topLevelRemoteOpen.description', "Connect to remote development workspaces."),
		when: '!isWeb',
		icon: Codicon.remote,
		content: {
			type: 'startEntry',
			command: 'command:workbench.action.remote.showMenu',
		}
	},
	{
		id: 'topLevelOpenTunnel',
		title: localize('gettingStarted.topLevelOpenTunnel.title', "Open Tunnel..."),
		description: localize('gettingStarted.topLevelOpenTunnel.description', "Connect to a remote machine through a Tunnel"),
		when: 'isWeb && showRemoteStartEntryInWeb',
		icon: Codicon.remote,
		content: {
			type: 'startEntry',
			command: 'command:workbench.action.remote.showWebStartEntryActions',
		}
	},
	{
		id: 'topLevelNewWorkspaceChat',
		title: localize('gettingStarted.newWorkspaceChat.title', "New Workspace with Copilot..."),
		description: localize('gettingStarted.newWorkspaceChat.description', "Create a new workspace with Copilot"),
		icon: Codicon.copilot,
		when: '!isWeb && !chatSetupHidden',
		content: {
			type: 'startEntry',
			command: 'command:welcome.newWorkspaceChat',
		}
	},
];

const Button = (title: string, href: string) => `[${title}](${href})`;

const CopilotStepTitle = localize('gettingStarted.copilotSetup.title', "Use AI features with Copilot for free");
const CopilotDescription = localize({ key: 'gettingStarted.copilotSetup.description', comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "You can use [Copilot]({0}) to generate code across multiple files, fix errors, ask questions about your code and much more using natural language.", product.defaultChatAgent?.documentationUrl ?? '');
const CopilotSignedOutButton = Button(localize('setupCopilotButton.signIn', "Set up Copilot"), `command:workbench.action.chat.triggerSetup`);
const CopilotSignedInButton = Button(localize('setupCopilotButton.setup', "Set up Copilot"), `command:workbench.action.chat.triggerSetup`);
const CopilotCompleteButton = Button(localize('setupCopilotButton.chatWithCopilot', "Chat with Copilot"), 'command:workbench.action.chat.open');

function createCopilotSetupStep(id: string, button: string, when: string, includeTerms: boolean): BuiltinGettingStartedStep {
	const description = includeTerms ?
		`${CopilotDescription}\n\n${button}` :
		`${CopilotDescription}\n${button}`;

	return {
		id,
		title: CopilotStepTitle,
		description,
		when: `${when} && !chatSetupHidden`,
		media: {
			type: 'svg', altText: 'VS Code Copilot multi file edits', path: 'multi-file-edits.svg'
		},
	};
}

export const walkthroughs: GettingStartedWalkthroughContent = [
	{
		id: 'Setup',
		title: localize('gettingStarted.setup.title', "Get started with VS Code"),
		description: localize('gettingStarted.setup.description', "Customize your editor, learn the basics, and start coding"),
		isFeatured: true,
		icon: setupIcon,
		when: '!isWeb',
		walkthroughPageTitle: localize('gettingStarted.setup.walkthroughPageTitle', 'Setup VS Code'),
		next: 'Beginner',
		content: {
			type: 'steps',
			steps: [
				createCopilotSetupStep('CopilotSetupSignedOut', CopilotSignedOutButton, 'chatSetupSignedOut', true),
				createCopilotSetupStep('CopilotSetupComplete', CopilotCompleteButton, 'chatSetupInstalled && (chatPlanPro || chatPlanLimited)', false),
				createCopilotSetupStep('CopilotSetupSignedIn', CopilotSignedInButton, '!chatSetupSignedOut && (!chatSetupInstalled || chatPlanCanSignUp)', true),
				{
					id: 'pickColorTheme',
					title: localize('gettingStarted.pickColor.title', "Choose your theme"),
					description: localize('gettingStarted.pickColor.description.interpolated', "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize('titleID', "Browse Color Themes"), 'command:workbench.action.selectTheme')),
					completionEvents: [
						'onSettingChanged:workbench.colorTheme',
						'onCommand:workbench.action.selectTheme'
					],
					media: { type: 'markdown', path: 'theme_picker', }
				},
				{
					id: 'extensionsWeb',
					title: localize('gettingStarted.extensions.title', "Code with extensions"),
					description: localize('gettingStarted.extensionsWeb.description.interpolated', "Extensions are VS Code's power-ups. A growing number are becoming available in the web.\n{0}", Button(localize('browsePopularWeb', "Browse Popular Web Extensions"), 'command:workbench.extensions.action.showPopularExtensions')),
					when: 'workspacePlatform == \'webworker\'',
					media: {
						type: 'svg', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions-web.svg'
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
				// Hidden in favor of copilot entry (to be revisited when copilot entry moves, if at all)
				// {
				// 	id: 'settings',
				// 	title: localize('gettingStarted.settings.title', "Tune your settings"),
				// 	description: localize('gettingStarted.settings.description.interpolated', "Customize every aspect of VS Code and your extensions to your liking. Commonly used settings are listed first to get you started.\n{0}", Button(localize('tweakSettings', "Open Settings"), 'command:toSide:workbench.action.openSettings')),
				// 	media: {
				// 		type: 'svg', altText: 'VS Code Settings', path: 'settings.svg'
				// 	},
				// },
				// {
				// 	id: 'settingsSync',
				// 	title: localize('gettingStarted.settingsSync.title', "Sync settings across devices"),
				// 	description: localize('gettingStarted.settingsSync.description.interpolated', "Keep your essential customizations backed up and updated across all your devices.\n{0}", Button(localize('enableSync', "Backup and Sync Settings"), 'command:workbench.userDataSync.actions.turnOn')),
				// 	when: 'syncStatus != uninitialized',
				// 	completionEvents: ['onEvent:sync-enabled'],
				// 	media: {
				// 		type: 'svg', altText: 'The "Turn on Sync" entry in the settings gear menu.', path: 'settingsSync.svg'
				// 	},
				// },
				{
					id: 'settingsAndSync',
					title: localize('gettingStarted.settings.title', "Tune your settings"),
					description: localize('gettingStarted.settingsAndSync.description.interpolated', "Customize every aspect of VS Code and your extensions to your liking. [Back up and sync](command:workbench.userDataSync.actions.turnOn) your essential customizations across all your devices.\n{0}", Button(localize('tweakSettings', "Open Settings"), 'command:toSide:workbench.action.openSettings')),
					when: 'syncStatus != uninitialized',
					completionEvents: ['onEvent:sync-enabled'],
					media: {
						type: 'svg', altText: 'VS Code Settings', path: 'settings.svg'
					},
				},
				{
					id: 'commandPaletteTask',
					title: localize('gettingStarted.commandPalette.title', "Unlock productivity with the Command Palette "),
					description: localize('gettingStarted.commandPalette.description.interpolated', "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize('commandPalette', "Open Command Palette"), 'command:workbench.action.showCommands')),
					media: { type: 'svg', altText: 'Command Palette overlay for searching and executing commands.', path: 'commandPalette.svg' },
				},
				// Hidden in favor of copilot entry (to be revisited when copilot entry moves, if at all)
				// {
				// 	id: 'pickAFolderTask-Mac',
				// 	title: localize('gettingStarted.setup.OpenFolder.title', "Open up your code"),
				// 	description: localize('gettingStarted.setup.OpenFolder.description.interpolated', "You're all set to start coding. Open a project folder to get your files into VS Code.\n{0}", Button(localize('pickFolder', "Pick a Folder"), 'command:workbench.action.files.openFileFolder')),
				// 	when: 'isMac && workspaceFolderCount == 0',
				// 	media: {
				// 		type: 'svg', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.svg'
				// 	}
				// },
				// {
				// 	id: 'pickAFolderTask-Other',
				// 	title: localize('gettingStarted.setup.OpenFolder.title', "Open up your code"),
				// 	description: localize('gettingStarted.setup.OpenFolder.description.interpolated', "You're all set to start coding. Open a project folder to get your files into VS Code.\n{0}", Button(localize('pickFolder', "Pick a Folder"), 'command:workbench.action.files.openFolder')),
				// 	when: '!isMac && workspaceFolderCount == 0',
				// 	media: {
				// 		type: 'svg', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.svg'
				// 	}
				// },
				{
					id: 'quickOpen',
					title: localize('gettingStarted.quickOpen.title', "Quickly navigate between your files"),
					description: localize('gettingStarted.quickOpen.description.interpolated', "Navigate between files in an instant with one keystroke. Tip: Open multiple files by pressing the right arrow key.\n{0}", Button(localize('quickOpen', "Quick Open a File"), 'command:toSide:workbench.action.quickOpen')),
					when: 'workspaceFolderCount != 0',
					media: {
						type: 'svg', altText: 'Go to file in quick search.', path: 'search.svg'
					}
				},
				{
					id: 'videoTutorial',
					title: localize('gettingStarted.videoTutorial.title', "Watch video tutorials"),
					description: localize('gettingStarted.videoTutorial.description.interpolated', "Watch the first in a series of short & practical video tutorials for VS Code's key features.\n{0}", Button(localize('watch', "Watch Tutorial"), 'https://aka.ms/vscode-getting-started-video')),
					media: { type: 'svg', altText: 'VS Code Settings', path: 'learn.svg' },
				}
			]
		}
	},

	{
		id: 'SetupWeb',
		title: localize('gettingStarted.setupWeb.title', "Get Started with VS Code for the Web"),
		description: localize('gettingStarted.setupWeb.description', "Customize your editor, learn the basics, and start coding"),
		isFeatured: true,
		icon: setupIcon,
		when: 'isWeb',
		next: 'Beginner',
		walkthroughPageTitle: localize('gettingStarted.setupWeb.walkthroughPageTitle', 'Setup VS Code Web'),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'pickColorThemeWeb',
					title: localize('gettingStarted.pickColor.title', "Choose your theme"),
					description: localize('gettingStarted.pickColor.description.interpolated', "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize('titleID', "Browse Color Themes"), 'command:workbench.action.selectTheme')),
					completionEvents: [
						'onSettingChanged:workbench.colorTheme',
						'onCommand:workbench.action.selectTheme'
					],
					media: { type: 'markdown', path: 'theme_picker', }
				},
				{
					id: 'menuBarWeb',
					title: localize('gettingStarted.menuBar.title', "Just the right amount of UI"),
					description: localize('gettingStarted.menuBar.description.interpolated', "The full menu bar is available in the dropdown menu to make room for your code. Toggle its appearance for faster access. \n{0}", Button(localize('toggleMenuBar', "Toggle Menu Bar"), 'command:workbench.action.toggleMenuBar')),
					when: 'isWeb',
					media: {
						type: 'svg', altText: 'Comparing menu dropdown with the visible menu bar.', path: 'menuBar.svg'
					},
				},
				{
					id: 'extensionsWebWeb',
					title: localize('gettingStarted.extensions.title', "Code with extensions"),
					description: localize('gettingStarted.extensionsWeb.description.interpolated', "Extensions are VS Code's power-ups. A growing number are becoming available in the web.\n{0}", Button(localize('browsePopularWeb', "Browse Popular Web Extensions"), 'command:workbench.extensions.action.showPopularExtensions')),
					when: 'workspacePlatform == \'webworker\'',
					media: {
						type: 'svg', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions-web.svg'
					},
				},
				{
					id: 'findLanguageExtensionsWeb',
					title: localize('gettingStarted.findLanguageExts.title', "Rich support for all your languages"),
					description: localize('gettingStarted.findLanguageExts.description.interpolated', "Code smarter with syntax highlighting, code completion, linting and debugging. While many languages are built-in, many more can be added as extensions.\n{0}", Button(localize('browseLangExts', "Browse Language Extensions"), 'command:workbench.extensions.action.showLanguageExtensions')),
					when: 'workspacePlatform != \'webworker\'',
					media: {
						type: 'svg', altText: 'Language extensions', path: 'languages.svg'
					},
				},
				{
					id: 'settingsSyncWeb',
					title: localize('gettingStarted.settingsSync.title', "Sync settings across devices"),
					description: localize('gettingStarted.settingsSync.description.interpolated', "Keep your essential customizations backed up and updated across all your devices.\n{0}", Button(localize('enableSync', "Backup and Sync Settings"), 'command:workbench.userDataSync.actions.turnOn')),
					when: 'syncStatus != uninitialized',
					completionEvents: ['onEvent:sync-enabled'],
					media: {
						type: 'svg', altText: 'The "Turn on Sync" entry in the settings gear menu.', path: 'settingsSync.svg'
					},
				},
				{
					id: 'commandPaletteTaskWeb',
					title: localize('gettingStarted.commandPalette.title', "Unlock productivity with the Command Palette "),
					description: localize('gettingStarted.commandPalette.description.interpolated', "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize('commandPalette', "Open Command Palette"), 'command:workbench.action.showCommands')),
					media: { type: 'svg', altText: 'Command Palette overlay for searching and executing commands.', path: 'commandPalette.svg' },
				},
				{
					id: 'pickAFolderTask-WebWeb',
					title: localize('gettingStarted.setup.OpenFolder.title', "Open up your code"),
					description: localize('gettingStarted.setup.OpenFolderWeb.description.interpolated', "You're all set to start coding. You can open a local project or a remote repository to get your files into VS Code.\n{0}\n{1}", Button(localize('openFolder', "Open Folder"), 'command:workbench.action.addRootFolder'), Button(localize('openRepository', "Open Repository"), 'command:remoteHub.openRepository')),
					when: 'workspaceFolderCount == 0',
					media: {
						type: 'svg', altText: 'Explorer view showing buttons for opening folder and cloning repository.', path: 'openFolder.svg'
					}
				},
				{
					id: 'quickOpenWeb',
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
		id: 'SetupAccessibility',
		title: localize('gettingStarted.setupAccessibility.title', "Get Started with Accessibility Features"),
		description: localize('gettingStarted.setupAccessibility.description', "Learn the tools and shortcuts that make VS Code accessible. Note that some actions are not actionable from within the context of the walkthrough."),
		isFeatured: true,
		icon: setupIcon,
		when: CONTEXT_ACCESSIBILITY_MODE_ENABLED.key,
		next: 'Setup',
		walkthroughPageTitle: localize('gettingStarted.setupAccessibility.walkthroughPageTitle', 'Setup VS Code Accessibility'),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'accessibilityHelp',
					title: localize('gettingStarted.accessibilityHelp.title', "Use the accessibility help dialog to learn about features"),
					description: localize('gettingStarted.accessibilityHelp.description.interpolated', "The accessibility help dialog provides information about what to expect from a feature and the commands/keybindings to operate them.\n With focus in an editor, terminal, notebook, chat response, comment, or debug console, the relevant dialog can be opened with the Open Accessibility Help command.\n{0}", Button(localize('openAccessibilityHelp', "Open Accessibility Help"), 'command:editor.action.accessibilityHelp')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'accessibleView',
					title: localize('gettingStarted.accessibleView.title', "Screen reader users can inspect content line by line, character by character in the accessible view."),
					description: localize('gettingStarted.accessibleView.description.interpolated', "The accessible view is available for the terminal, hovers, notifications, comments, notebook output, chat responses, inline completions, and debug console output.\n With focus in any of those features, it can be opened with the Open Accessible View command.\n{0}", Button(localize('openAccessibleView', "Open Accessible View"), 'command:editor.action.accessibleView')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'verbositySettings',
					title: localize('gettingStarted.verbositySettings.title', "Control the verbosity of aria labels"),
					description: localize('gettingStarted.verbositySettings.description.interpolated', "Screen reader verbosity settings exist for features around the workbench so that once a user is familiar with a feature, they can avoid hearing hints about how to operate it. For example, features for which an accessibility help dialog exists will indicate how to open the dialog until the verbosity setting for that feature has been disabled.\n These and other accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize('openVerbositySettings', "Open Accessibility Settings"), 'command:workbench.action.openAccessibilitySettings')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'commandPaletteTaskAccessibility',
					title: localize('gettingStarted.commandPaletteAccessibility.title', "Unlock productivity with the Command Palette "),
					description: localize('gettingStarted.commandPaletteAccessibility.description.interpolated', "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize('commandPalette', "Open Command Palette"), 'command:workbench.action.showCommands')),
					media: { type: 'markdown', path: 'empty' },
				},
				{
					id: 'keybindingsAccessibility',
					title: localize('gettingStarted.keyboardShortcuts.title', "Customize your keyboard shortcuts"),
					description: localize('gettingStarted.keyboardShortcuts.description.interpolated', "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize('keyboardShortcuts', "Keyboard Shortcuts"), 'command:toSide:workbench.action.openGlobalKeybindings')),
					media: {
						type: 'markdown', path: 'empty',
					}
				},
				{
					id: 'accessibilitySignals',
					title: localize('gettingStarted.accessibilitySignals.title', "Fine tune which accessibility signals you want to receive via audio or a braille device"),
					description: localize('gettingStarted.accessibilitySignals.description.interpolated', "Accessibility sounds and announcements are played around the workbench for different events.\n These can be discovered and configured using the List Signal Sounds and List Signal Announcements commands.\n{0}\n{1}", Button(localize('listSignalSounds', "List Signal Sounds"), 'command:signals.sounds.help'), Button(localize('listSignalAnnouncements', "List Signal Announcements"), 'command:accessibility.announcement.help')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'hover',
					title: localize('gettingStarted.hover.title', "Access the hover in the editor to get more information on a variable or symbol"),
					description: localize('gettingStarted.hover.description.interpolated', "While focus is in the editor on a variable or symbol, a hover can be can be focused with the Show or Open Hover command.\n{0}", Button(localize('showOrFocusHover', "Show or Focus Hover"), 'command:editor.action.showHover')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'goToSymbol',
					title: localize('gettingStarted.goToSymbol.title', "Navigate to symbols in a file"),
					description: localize('gettingStarted.goToSymbol.description.interpolated', "The Go to Symbol command is useful for navigating between important landmarks in a document.\n{0}", Button(localize('openGoToSymbol', "Go to Symbol"), 'command:editor.action.goToSymbol')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'codeFolding',
					title: localize('gettingStarted.codeFolding.title', "Use code folding to collapse blocks of code and focus on the code you're interested in."),
					description: localize('gettingStarted.codeFolding.description.interpolated', "Fold or unfold a code section with the Toggle Fold command.\n{0}\n Fold or unfold recursively with the Toggle Fold Recursively Command\n{1}\n", Button(localize('toggleFold', "Toggle Fold"), 'command:editor.toggleFold'), Button(localize('toggleFoldRecursively', "Toggle Fold Recursively"), 'command:editor.toggleFoldRecursively')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'intellisense',
					title: localize('gettingStarted.intellisense.title', "Use Intellisense to improve coding efficiency"),
					description: localize('gettingStarted.intellisense.description.interpolated', "Intellisense suggestions can be opened with the Trigger Intellisense command.\n{0}\n Inline intellisense suggestions can be triggered with Trigger Inline Suggestion\n{1}\n Useful settings include editor.inlineCompletionsAccessibilityVerbose and editor.screenReaderAnnounceInlineSuggestion.", Button(localize('triggerIntellisense', "Trigger Intellisense"), 'command:editor.action.triggerSuggest'), Button(localize('triggerInlineSuggestion', 'Trigger Inline Suggestion'), 'command:editor.action.inlineSuggest.trigger')),
					media: {
						type: 'markdown', path: 'empty'
					}
				},
				{
					id: 'accessibilitySettings',
					title: localize('gettingStarted.accessibilitySettings.title', "Configure accessibility settings"),
					description: localize('gettingStarted.accessibilitySettings.description.interpolated', "Accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize('openAccessibilitySettings', "Open Accessibility Settings"), 'command:workbench.action.openAccessibilitySettings')),
					media: { type: 'markdown', path: 'empty' }
				}
			]
		}
	},
	{
		id: 'Beginner',
		isFeatured: false,
		title: localize('gettingStarted.beginner.title', "Learn the Fundamentals"),
		icon: beginnerIcon,
		description: localize('gettingStarted.beginner.description', "Get an overview of the most essential features"),
		walkthroughPageTitle: localize('gettingStarted.beginner.walkthroughPageTitle', 'Essential Features'),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'extensions',
					title: localize('gettingStarted.extensions.title', "Code with extensions"),
					description: localize('gettingStarted.extensions.description.interpolated', "Extensions are VS Code's power-ups. They range from handy productivity hacks, expanding out-of-the-box features, to adding completely new capabilities.\n{0}", Button(localize('browsePopular', "Browse Popular Extensions"), 'command:workbench.extensions.action.showPopularExtensions')),
					when: 'workspacePlatform != \'webworker\'',
					media: {
						type: 'svg', altText: 'VS Code extension marketplace with featured language extensions', path: 'extensions.svg'
					},
				},
				{
					id: 'terminal',
					title: localize('gettingStarted.terminal.title', "Built-in terminal"),
					description: localize('gettingStarted.terminal.description.interpolated', "Quickly run shell commands and monitor build output, right next to your code.\n{0}", Button(localize('showTerminal', "Open Terminal"), 'command:workbench.action.terminal.toggleTerminal')),
					when: 'workspacePlatform != \'webworker\' && remoteName != codespaces && !terminalIsOpen',
					media: {
						type: 'svg', altText: 'Integrated terminal running a few npm commands', path: 'terminal.svg'
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
					description: localize({ key: 'gettingStarted.installGit.description.interpolated', comment: ['The placeholders are command link items should not be translated'] }, "Install Git to track changes in your projects.\n{0}\n{1}Reload window{2} after installation to complete Git setup.", Button(localize('installGit', "Install Git"), 'https://aka.ms/vscode-install-git'), '[', '](command:workbench.action.reloadWindow)'),
					when: 'git.missing',
					media: {
						type: 'svg', altText: 'Install Git.', path: 'git.svg',
					},
					completionEvents: [
						'onContext:git.state == initialized'
					]
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
				},
				{
					id: 'workspaceTrust',
					title: localize('gettingStarted.workspaceTrust.title', "Safely browse and edit code"),
					description: localize('gettingStarted.workspaceTrust.description.interpolated', "{0} lets you decide whether your project folders should **allow or restrict** automatic code execution __(required for extensions, debugging, etc)__.\nOpening a file/folder will prompt to grant trust. You can always {1} later.", Button(localize('workspaceTrust', "Workspace Trust"), 'https://code.visualstudio.com/docs/editor/workspace-trust'), Button(localize('enableTrust', "enable trust"), 'command:toSide:workbench.trust.manage')),
					when: 'workspacePlatform != \'webworker\' && !isWorkspaceTrusted && workspaceFolderCount == 0',
					media: {
						type: 'svg', altText: 'Workspace Trust editor in Restricted mode and a primary button for switching to Trusted mode.', path: 'workspaceTrust.svg'
					},
				},
			]
		}
	},
	{
		id: 'notebooks',
		title: localize('gettingStarted.notebook.title', "Customize Notebooks"),
		description: '',
		icon: setupIcon,
		isFeatured: false,
		when: `config.${NotebookSetting.openGettingStarted} && userHasOpenedNotebook`,
		walkthroughPageTitle: localize('gettingStarted.notebook.walkthroughPageTitle', 'Notebooks'),
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
	},
	{
		id: 'NewWelcomeExperience',
		title: localize('gettingStarted.new.title', "Get started with VS Code"),
		description: localize('gettingStarted.new.description', "Supercharge coding with AI"),
		isFeatured: false,
		icon: setupIcon,
		when: '!isWeb',
		walkthroughPageTitle: localize('gettingStarted.new.walkthroughPageTitle', 'Set up VS Code'),
		content: {
			type: 'steps',
			steps: [
				{
					id: 'copilotSetup.chat',
					title: localize('gettingStarted.agentMode.title', "Agent mode"),
					description: localize('gettingStarted.agentMode.description', "Analyzes the problem, plans next steps, and makes changes for you."),
					media: {
						type: 'svg', altText: 'VS Code Copilot multi file edits', path: 'multi-file-edits.svg'
					},
				},
				{
					id: 'copilotSetup.inline',
					title: localize('gettingStarted.nes.title', "Next Edit Suggestions"),
					description: localize('gettingStarted.nes.description', "Get code suggestions that predict your next edit."),
					media: {
						type: 'svg', altText: 'Next Edit Suggestions', path: 'ai-powered-suggestions.svg'
					},
				},
				{
					id: 'copilotSetup.customize',
					title: localize('gettingStarted.customize.title', "Personalized to how you work"),
					description: localize('gettingStarted.customize.description', "Swap models, add agent mode tools, and create personalized instructions.\n{0}", Button(localize('signUp', "Set up AI"), 'command:workbench.action.chat.triggerSetup')),
					media: {
						type: 'svg', altText: 'Personalize', path: 'multi-file-edits.svg'
					},
				},
				{
					id: 'newCommandPaletteTask',
					title: localize('newgettingStarted.commandPalette.title', "All commands within reach"),
					description: localize('gettingStarted.commandPalette.description.interpolated', "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize('commandPalette', "Open Command Palette"), 'command:workbench.action.showCommands')),
					media: { type: 'svg', altText: 'Command Palette overlay for searching and executing commands.', path: 'commandPalette.svg' },
				},
				{
					id: 'newPickColorTheme',
					title: localize('gettingStarted.pickColor.title', "Choose your theme"),
					description: localize('gettingStarted.pickColor.description.interpolated', "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize('titleID', "Browse Color Themes"), 'command:workbench.action.selectTheme')),
					completionEvents: [
						'onSettingChanged:workbench.colorTheme',
						'onCommand:workbench.action.selectTheme'
					],
					media: { type: 'markdown', path: 'theme_picker_small', }
				},
				{
					id: 'newFindLanguageExtensions',
					title: localize('newgettingStarted.findLanguageExts.title', "Support for all languages"),
					description: localize('newgettingStarted.findLanguageExts.description.interpolated', "Install the language extensions you need in your toolkit.\n{0}", Button(localize('browseLangExts', "Browse Language Extensions"), 'command:workbench.extensions.action.showLanguageExtensions')),
					when: 'workspacePlatform != \'webworker\'',
					media: {
						type: 'svg', altText: 'Language extensions', path: 'languages.svg'
					},
				},
				{
					id: 'newSettingsAndSync',
					title: localize('newgettingStarted.settings.title', "Customize every aspect of VS Code"),
					description: localize('newgettingStarted.settingsAndSync.description.interpolated', "[Back up and sync](command:workbench.userDataSync.actions.turnOn) settings across all your devices.\n{0}", Button(localize('tweakSettings', "Open Settings"), 'command:toSide:workbench.action.openSettings')),
					when: 'syncStatus != uninitialized',
					completionEvents: ['onEvent:sync-enabled'],
					media: {
						type: 'svg', altText: 'VS Code Settings', path: 'settings.svg'
					},
				},
			]
		}
	}
];
