/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker';
import 'vs/workbench/contrib/welcomeGettingStarted/common/media/notebookProfile';
import { localize } from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';

// Todo: Replace this with PearAI logo (https://github.com/trypear/pearai-app/issues/235)
const setupIcon = registerIcon('getting-started-setup', Codicon.zap, localize('getting-started-setup-icon', "Icon used for the setup category of welcome page"));

export type BuiltinGettingStartedStep = {
	id: string;
	title: string;
	description: string;
	completionEvents?: string[];
	when?: string;
	media:
	| { type: 'image'; path: string | { hc: string; hcLight?: string; light: string; dark: string }; altText: string }
	| { type: 'svg'; path: string; altText: string }
	| { type: 'markdown'; path: string };
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
		id: 'topLevelShowWalkthroughs',
		title: localize('gettingStarted.topLevelShowWalkthroughs.title', "Open a Walkthrough..."),
		description: localize('gettingStarted.topLevelShowWalkthroughs.description', "View a walkthrough on the editor or an extension"),
		icon: Codicon.checklist,
		when: 'allWalkthroughsHidden',
		content: {
			type: 'startEntry',
			command: 'command:welcome.showAllWalkthroughs',
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
];

const Button = (title: string, href: string) => `[${title}](${href})`;

export const walkthroughs: GettingStartedWalkthroughContent = [
	{
		id: 'Setup',
		title: localize('gettingStarted.setup.title', "Get Started With PearAI"),
		description: localize('gettingStarted.setup.description', "Welcome to PearAI, your AI code editor! Let's personalize your editor and get you familiar with the AI tools."),
		isFeatured: true,
		icon: setupIcon,
		when: '!isWeb',
		next: 'Beginner',
		content: {
			type: 'steps',
			steps: [
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
					id: 'talk',
					title: "Talk To Your Codebase Directly",
					description: "Type in the chat box (CMD+L, CTRL+L on Windows) to ask questions about your code. PearAI uses Retrival Augmented Generation to add context to your prompts, but you can also directly reference code by including other files in the chat by adding  @filename. This also works for folders, docs, terminal content, codebase, and more!",
					media: {
						type: "image",
						path: "media/light.png", // Todo: Fill in with gif
						altText: "Empty image"
					},
					completionEvents: []
				},
				{
					id: 'change',
					title: "Make Changes Inline With AI",
					description: "Directly make changes inline by pressing CMD+I (ALT+L on Windows), and choose what you want to keep.",
					media: {
						type: "image",
						path: "media/light.png", // Todo: Fill in with gif
						altText: "Empty image"
					},
					completionEvents: []
				},
				{
					id: 'copy',
					title: "No More Copy Pasting",
					description: "Directly bring your code to the chat by selecting it and pressing CMD+L (ALT+L on Windows). Prompt it right away",
					media: {
						type: "image",
						path: "media/light.png", // Todo: Fill in with gif
						altText: "Empty image"
					},
					completionEvents: []
				}
			]
		}
	},
];
