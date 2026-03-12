/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';

/**
 * The four onboarding walkthrough variations.
 *
 * - **A**: Classic wizard modal — centered, one step at a time, progress dots
 * - **B**: Side-nav modal — persistent step list on left, content on right
 * - **C**: Chat-integrated welcome — walkthrough around chat input with project cards
 * - **D**: Agentic — full-screen chat where Copilot guides the setup
 */
export const enum OnboardingVariation {
	A = 'a',
	B = 'b',
	C = 'c',
	D = 'd',
}

/**
 * Step identifiers for the onboarding walkthrough.
 */
export const enum OnboardingStepId {
	SignIn = 'onboarding.signIn',
	Personalize = 'onboarding.personalize',
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
		case OnboardingStepId.AgentSessions:
			return localize('onboarding.step.agentSessions', "Meet Your AI Coding Partner");
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
			return localize('onboarding.step.personalize.subtitle', "Choose your theme and keyboard shortcuts");
		case OnboardingStepId.AgentSessions:
			return localize('onboarding.step.agentSessions.subtitle', "Code with an AI agent that runs in the background — locally, in the cloud, or both");
	}
}

/**
 * Ordered step IDs for the onboarding flow.
 * All variations share the same steps; the presentation differs.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepId[] = [
	OnboardingStepId.SignIn,
	OnboardingStepId.Personalize,
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
 * Built-in theme options.
 */
export const ONBOARDING_THEME_OPTIONS: readonly IOnboardingThemeOption[] = [
	{
		id: 'dark-modern',
		label: localize('onboarding.theme.darkModern', "Dark Modern"),
		themeId: 'Default Dark Modern',
		type: 'dark',
		preview: {
			background: '#1f1f1f',
			foreground: '#cccccc',
			keyword: '#569cd6',
			string: '#ce9178',
			comment: '#6a9955',
			function: '#dcdcaa',
			lineNumber: '#6e7681',
			selection: '#264f78',
		},
	},
	{
		id: 'light-modern',
		label: localize('onboarding.theme.lightModern', "Light Modern"),
		themeId: 'Default Light Modern',
		type: 'light',
		preview: {
			background: '#ffffff',
			foreground: '#3b3b3b',
			keyword: '#0000ff',
			string: '#a31515',
			comment: '#008000',
			function: '#795e26',
			lineNumber: '#6e7681',
			selection: '#add6ff',
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
		description: localize('onboarding.keymap.vscode.desc', "Default keyboard shortcuts"),
	},
	{
		id: 'cursor',
		label: localize('onboarding.keymap.cursor', "Cursor"),
		extensionId: 'AntFu.cursor-keymaps',
		description: localize('onboarding.keymap.cursor.desc', "Keyboard shortcuts from Cursor"),
	},
	{
		id: 'windsurf',
		label: localize('onboarding.keymap.windsurf', "Windsurf"),
		extensionId: 'codeium.windsurf-keybindings',
		description: localize('onboarding.keymap.windsurf.desc', "Keyboard shortcuts from Windsurf"),
	},
	{
		id: 'sublime',
		label: localize('onboarding.keymap.sublime', "Sublime Text"),
		extensionId: 'ms-vscode.sublime-keybindings',
		description: localize('onboarding.keymap.sublime.desc', "Keyboard shortcuts from Sublime Text"),
	},
	{
		id: 'intellij',
		label: localize('onboarding.keymap.intellij', "IntelliJ / JetBrains"),
		extensionId: 'k--kato.intellij-idea-keybindings',
		description: localize('onboarding.keymap.intellij.desc', "Keyboard shortcuts from IntelliJ IDEA"),
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
