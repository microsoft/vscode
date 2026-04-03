/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { isMacintosh } from '../../../../base/common/platform.js';

/**
 * Step identifiers for the onboarding walkthrough.
 */
export const enum OnboardingStepId {
	SignIn = 'onboarding.signIn',
	Personalize = 'onboarding.personalize',
	Extensions = 'onboarding.extensions',
	AiPreference = 'onboarding.aiPreference',
	AgentSessions = 'onboarding.agentSessions',
}

/**
 * Returns a localized title for each step.
 */
export function getOnboardingStepTitle(stepId: OnboardingStepId): string {
	switch (stepId) {
		case OnboardingStepId.SignIn:
			return localize('onboarding.step.signIn', "Sign In");
		case OnboardingStepId.Personalize:
			return localize('onboarding.step.personalize', "Make It Yours");
		case OnboardingStepId.Extensions:
			return localize('onboarding.step.extensions', "Supercharge Your Editor");
		case OnboardingStepId.AiPreference:
			return localize('onboarding.step.aiPreference', "Your AI Style");
		case OnboardingStepId.AgentSessions:
			return localize('onboarding.step.agentSessions', "Meet Your Agentic Coding Partner");
	}
}

/**
 * Returns a localized subtitle for each step.
 */
export function getOnboardingStepSubtitle(stepId: OnboardingStepId): string {
	switch (stepId) {
		case OnboardingStepId.SignIn:
			return localize('onboarding.step.signIn.subtitle', "Sync settings, unlock AI features, and connect to GitHub");
		case OnboardingStepId.Personalize:
			return localize('onboarding.step.personalize.subtitle', "Choose your theme and keyboard mapping");
		case OnboardingStepId.Extensions:
			return localize('onboarding.step.extensions.subtitle', "Install extensions to enhance your workflow");
		case OnboardingStepId.AiPreference:
			return localize('onboarding.step.aiPreference.subtitle', "Choose how much AI collaboration fits your workflow");
		case OnboardingStepId.AgentSessions:
			return localize('onboarding.step.agentSessions.subtitle', "Tip: Press {0} to open Chat", isMacintosh ? '\u2318\u2325I' : 'Ctrl+Alt+I');
	}
}

/**
 * Ordered step IDs for the onboarding flow.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
	OnboardingStepId.SignIn,
	OnboardingStepId.Personalize,
	OnboardingStepId.Extensions,
	OnboardingStepId.AgentSessions,
];

/**
 * Theme option for the onboarding personalization step.
 */
export interface IOnboardingThemeOption {
	readonly id: string;
	readonly label: string;
	readonly themeId: string;
	readonly type: 'dark' | 'light' | 'hcDark' | 'hcLight';
	readonly preview: {
		readonly background: string;
		readonly foreground: string;
		readonly keyword: string;
		readonly string: string;
		readonly comment: string;
		readonly function: string;
		readonly lineNumber: string;
		readonly selection: string;
		readonly sidebarBackground: string;
		readonly tabBarBackground: string;
		readonly tabActiveBorder: string;
	};
}

/**
 * Keymap option for the onboarding personalization step.
 */
export interface IOnboardingKeymapOption {
	readonly id: string;
	readonly label: string;
	readonly extensionId: string | undefined;
	readonly description: string;
}

/**
 * AI collaboration preference for the AI style step.
 */
export const enum AiCollaborationMode {
	CodeFirst = 'code-first',
	Balanced = 'balanced',
	AgentForward = 'agent-forward',
}

/**
 * AI collaboration preference option.
 */
export interface IAiPreferenceOption {
	readonly id: AiCollaborationMode;
	readonly label: string;
	readonly description: string;
	readonly icon: string;
}

/**
 * AI collaboration preference options shown in the AI style step.
 */
export const ONBOARDING_AI_PREFERENCE_OPTIONS: readonly IAiPreferenceOption[] = [
	{
		id: AiCollaborationMode.CodeFirst,
		label: localize('onboarding.aiPref.codeFirst', "I Write the Code"),
		description: localize('onboarding.aiPref.codeFirst.desc', "AI assists with suggestions and answers questions when you ask. You stay in control of every edit."),
		icon: 'edit',
	},
	{
		id: AiCollaborationMode.Balanced,
		label: localize('onboarding.aiPref.balanced', "Side by Side"),
		description: localize('onboarding.aiPref.balanced.desc', "Inline suggestions plus a chat panel for deeper collaboration. A balance of writing and delegating."),
		icon: 'layoutSidebarRight',
	},
	{
		id: AiCollaborationMode.AgentForward,
		label: localize('onboarding.aiPref.agentForward', "AI Takes the Lead"),
		description: localize('onboarding.aiPref.agentForward.desc', "Let the agent drive — describe what you want and review the result. Great for scaffolding and exploration."),
		icon: 'copilot',
	},
];

/**
 * Built-in theme options.
 */
export const ONBOARDING_THEME_OPTIONS: readonly IOnboardingThemeOption[] = [
	{
		id: 'dark-2026',
		label: localize('onboarding.theme.dark2026', "Dark 2026"),
		themeId: 'Dark 2026',
		type: 'dark',
		preview: {
			background: '#121314',
			foreground: '#BBBEBF',
			keyword: '#ff7b72',
			string: '#a5d6ff',
			comment: '#8b949e',
			function: '#d2a8ff',
			lineNumber: '#858889',
			selection: '#276782',
			sidebarBackground: '#191A1B',
			tabBarBackground: '#191A1B',
			tabActiveBorder: '#3994BC',
		},
	},
	{
		id: 'light-2026',
		label: localize('onboarding.theme.light2026', "Light 2026"),
		themeId: 'Light 2026',
		type: 'light',
		preview: {
			background: '#FFFFFF',
			foreground: '#202020',
			keyword: '#cf222e',
			string: '#0a3069',
			comment: '#6e7781',
			function: '#8250df',
			lineNumber: '#606060',
			selection: '#0069CC40',
			sidebarBackground: '#FAFAFD',
			tabBarBackground: '#FAFAFD',
			tabActiveBorder: '#000000',
		},
	},
	{
		id: 'hc-dark',
		label: localize('onboarding.theme.hcDark', "Dark High Contrast"),
		themeId: 'Default High Contrast',
		type: 'hcDark',
		preview: {
			background: '#000000',
			foreground: '#ffffff',
			keyword: '#569cd6',
			string: '#ce9178',
			comment: '#7ca668',
			function: '#dcdcaa',
			lineNumber: '#858585',
			selection: '#264f78',
			sidebarBackground: '#000000',
			tabBarBackground: '#000000',
			tabActiveBorder: '#569cd6',
		},
	},
	{
		id: 'hc-light',
		label: localize('onboarding.theme.hcLight', "Light High Contrast"),
		themeId: 'Default High Contrast Light',
		type: 'hcLight',
		preview: {
			background: '#ffffff',
			foreground: '#292929',
			keyword: '#0f4a85',
			string: '#a31515',
			comment: '#008000',
			function: '#5e2cbc',
			lineNumber: '#292929',
			selection: '#add6ff',
			sidebarBackground: '#ffffff',
			tabBarBackground: '#ffffff',
			tabActiveBorder: '#0f4a85',
		},
	},
];

/**
 * Keymap options — keyboard shortcut presets from popular IDEs.
 */
export const ONBOARDING_KEYMAP_OPTIONS: readonly IOnboardingKeymapOption[] = [
	{
		id: 'vscode',
		label: localize('onboarding.keymap.vscode', "VS Code"),
		extensionId: undefined,
		description: localize('onboarding.keymap.vscode.desc', "Default keyboard mapping"),
	},
	{
		id: 'cursor',
		label: localize('onboarding.keymap.cursor', "Cursor"),
		extensionId: 'AntFu.cursor-keymaps',
		description: localize('onboarding.keymap.cursor.desc', "Keyboard mapping from Cursor"),
	},
	{
		id: 'windsurf',
		label: localize('onboarding.keymap.windsurf', "Windsurf"),
		extensionId: 'codeium.windsurf-keybindings',
		description: localize('onboarding.keymap.windsurf.desc', "Keyboard mapping from Windsurf"),
	},
	{
		id: 'sublime',
		label: localize('onboarding.keymap.sublime', "Sublime Text"),
		extensionId: 'ms-vscode.sublime-keybindings',
		description: localize('onboarding.keymap.sublime.desc', "Keyboard mapping from Sublime Text"),
	},
	{
		id: 'intellij',
		label: localize('onboarding.keymap.intellij', "IntelliJ / JetBrains"),
		extensionId: 'k--kato.intellij-idea-keybindings',
		description: localize('onboarding.keymap.intellij.desc', "Keyboard mapping from IntelliJ IDEA"),
	},
	{
		id: 'vim',
		label: localize('onboarding.keymap.vim', "Vim"),
		extensionId: 'vscodevim.vim',
		description: localize('onboarding.keymap.vim.desc', "Vim modal editing"),
	},
];

/**
 * Project starter card for Variation C.
 */
export interface IProjectStarterCard {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly prompt: string;
	readonly icon: string;
	readonly tags: readonly string[];
}

/**
 * Starter project cards shown in Variation C.
 */
export const PROJECT_STARTER_CARDS: readonly IProjectStarterCard[] = [
	{
		id: 'snake-game',
		title: localize('project.snakeGame.title', "Snake Game"),
		description: localize('project.snakeGame.desc', "Classic arcade game with HTML Canvas"),
		prompt: 'Create a Snake game using HTML, CSS, and JavaScript with Canvas. Include score tracking, increasing difficulty, and smooth animations. Set up the project structure and make it playable immediately.',
		icon: 'game',
		tags: ['HTML', 'JavaScript', 'Canvas'],
	},
	{
		id: 'portfolio',
		title: localize('project.portfolio.title', "Personal Portfolio"),
		description: localize('project.portfolio.desc', "Modern responsive portfolio site"),
		prompt: 'Create a modern personal portfolio website with a hero section, about me, projects gallery with cards, skills section, and contact form. Use HTML, CSS (with CSS Grid and custom properties), and vanilla JavaScript. Make it responsive and add smooth scroll animations.',
		icon: 'globe',
		tags: ['HTML', 'CSS', 'Responsive'],
	},
	{
		id: 'rest-api',
		title: localize('project.restApi.title', "REST API"),
		description: localize('project.restApi.desc', "Node.js API with Express and TypeScript"),
		prompt: 'Set up a REST API project with Node.js, Express, and TypeScript. Include a router, controllers, middleware (error handling, logging), and example CRUD endpoints for a "tasks" resource with in-memory storage. Add npm scripts for dev and build.',
		icon: 'server',
		tags: ['Node.js', 'TypeScript', 'Express'],
	},
	{
		id: 'data-analysis',
		title: localize('project.dataAnalysis.title', "Data Explorer"),
		description: localize('project.dataAnalysis.desc', "Python notebook with visualizations"),
		prompt: 'Create a Python data analysis project with a Jupyter notebook that loads a sample dataset (generate mock data for sales analytics), performs exploratory data analysis with pandas, and creates visualizations with matplotlib and seaborn. Include a requirements.txt.',
		icon: 'graph',
		tags: ['Python', 'Pandas', 'Jupyter'],
	},
	{
		id: 'cli-tool',
		title: localize('project.cliTool.title', "CLI Tool"),
		description: localize('project.cliTool.desc', "Command-line utility with Node.js"),
		prompt: 'Create a Node.js CLI tool that converts markdown files to HTML. Include argument parsing, file watching mode, and colorized terminal output. Set up the project with proper bin entry and make it installable globally via npm link.',
		icon: 'terminal',
		tags: ['Node.js', 'CLI', 'npm'],
	},
	{
		id: 'todo-app',
		title: localize('project.todoApp.title', "Todo App"),
		description: localize('project.todoApp.desc', "Full-stack app with React and SQLite"),
		prompt: 'Create a full-stack Todo application with a React frontend (using Vite) and a Node.js backend with SQLite. Include CRUD operations, drag-to-reorder, due dates, and categories. Set up both frontend and backend in a monorepo structure.',
		icon: 'checklist',
		tags: ['React', 'Node.js', 'SQLite'],
	},
];

/**
 * Storage key for persisting onboarding completion state.
 */
export const ONBOARDING_STORAGE_KEY = 'welcomeOnboarding.state';

/**
 * Recommended extension for the Extensions step.
 */
export interface IOnboardingExtension {
	readonly id: string;
	readonly name: string;
	readonly publisher: string;
	readonly description: string;
	readonly icon: string;
}

/**
 * Top recommended extensions shown in the Extensions step.
 */
export const ONBOARDING_RECOMMENDED_EXTENSIONS: readonly IOnboardingExtension[] = [
	{
		id: 'ms-vscode.cpptools',
		name: localize('ext.cpp', "C/C++"),
		publisher: 'Microsoft',
		description: localize('ext.cpp.desc', "IntelliSense, debugging, and code browsing for C and C++"),
		icon: 'symbol-misc',
	},
	{
		id: 'ms-vscode-remote.remote-containers',
		name: localize('ext.devContainers', "Dev Containers"),
		publisher: 'Microsoft',
		description: localize('ext.devContainers.desc', "Develop inside a container with a full-featured editor"),
		icon: 'remote-explorer',
	},
	{
		id: 'ms-azuretools.vscode-docker',
		name: localize('ext.docker', "Docker"),
		publisher: 'Microsoft',
		description: localize('ext.docker.desc', "Build, manage, and deploy containerized applications"),
		icon: 'package',
	},
	{
		id: 'dbaeumer.vscode-eslint',
		name: localize('ext.eslint', "ESLint"),
		publisher: 'Microsoft',
		description: localize('ext.eslint.desc', "Find and fix problems in your JavaScript code"),
		icon: 'lightbulb',
	},
	{
		id: 'GitHub.vscode-pull-request-github',
		name: localize('ext.ghPr', "GitHub Pull Requests"),
		publisher: 'GitHub',
		description: localize('ext.ghPr.desc', "Review and manage GitHub pull requests and issues"),
		icon: 'git-pull-request',
	},
	{
		id: 'esbenp.prettier-vscode',
		name: localize('ext.prettier', "Prettier"),
		publisher: 'Prettier',
		description: localize('ext.prettier.desc', "Code formatter for JavaScript, TypeScript, CSS, and more"),
		icon: 'wand',
	},
	{
		id: 'ms-python.python',
		name: localize('ext.python', "Python"),
		publisher: 'Microsoft',
		description: localize('ext.python.desc', "Rich Python language support with IntelliSense and debugging"),
		icon: 'symbol-misc',
	},
	{
		id: 'ms-vscode-remote.remote-ssh',
		name: localize('ext.remoteSsh', "Remote - SSH"),
		publisher: 'Microsoft',
		description: localize('ext.remoteSsh.desc', "Open folders and files on a remote machine via SSH"),
		icon: 'remote',
	},
];
