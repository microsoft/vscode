/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { ISettingsDictionary, IUserDataProfile } from '../../../../platform/userDataProfile/common/userDataProfile.js';

/**
 * Built-in work modes — developer "moods" that map onto profiles with
 * opinionated settings, layout hints, and recommended extensions.
 *
 * Work modes are the user-facing layer; profiles remain the storage mechanism.
 */
export const enum WorkModeId {
	Frontend = 'frontend',
	Backend = 'backend',
	Debugging = 'debugging',
	Documentation = 'documentation',
	Teaching = 'teaching',
	Demo = 'demo',
	Troubleshooting = 'troubleshooting',
	Fullstack = 'fullstack',
	DataScience = 'datascience',
	Mobile = 'mobile',
}

/** Declarative layout applied when switching into a work mode. */
export interface IWorkModeLayoutPreset {
	/** Show/hide the side bar (explorer etc.). */
	readonly sideBarVisible?: boolean;
	/** Show/hide the panel (terminal, problems, output). */
	readonly panelVisible?: boolean;
	/** Show/hide the auxiliary/secondary side bar. */
	readonly auxiliaryBarVisible?: boolean;
	/** Panel position preference. */
	readonly panelPosition?: 'bottom' | 'right' | 'left';
	/** Enter zen mode for distraction-free modes (demo/docs). */
	readonly zenMode?: boolean;
	/** Open the Run and Debug view in the activity bar. */
	readonly focusDebugView?: boolean;
}

export interface IWorkModePreset {
	readonly id: WorkModeId;
	/**
	 * Locale-stable profile name used when creating/matching the backing user data profile.
	 * Must not be localized — persisted profile names must survive language changes.
	 */
	readonly profileName: string;
	/** Localized display name shown in UI (picker, notifications, tips). */
	readonly name: string;
	readonly description: string;
	readonly icon: ThemeIcon;
	/** Profile settings applied when the mode profile is first created. */
	readonly settings: ISettingsDictionary;
	/** Workspace-tag keys (from IWorkspaceTagsService) that boost this mode's score. */
	readonly workspaceTagSignals: readonly string[];
	/** Well-known filenames/dirs that boost this mode's score when present. */
	readonly fileSignals: readonly string[];
	/** Recommended extension IDs (marketplace identifiers) shown in the mode card. */
	readonly recommendedExtensions: readonly string[];
	/** Layout applied after switching to this mode. */
	readonly layout?: IWorkModeLayoutPreset;
	/** Short summary shown in suggestions and the mode picker. */
	readonly summary: string;
	/** Layout/view tips shown in the mode detail. */
	readonly tips: readonly string[];
}

export interface IWorkModeEnvironmentContext {
	readonly isRemote: boolean;
	readonly remoteName?: string;
	readonly isWsl: boolean;
	readonly isContainer: boolean;
	readonly isSsh: boolean;
	readonly isTrusted: boolean;
	readonly isWeb: boolean;
}

export interface IWorkModeSuggestion {
	readonly mode: IWorkModePreset;
	readonly score: number;
	readonly reasons: readonly string[];
	/** Existing profile that corresponds to this mode, if any. */
	readonly existingProfile?: IUserDataProfile;
}

export interface IWorkModeDetectionResult {
	readonly suggestions: readonly IWorkModeSuggestion[];
	/** Highest-scoring suggestion, if any above the confidence threshold. */
	readonly primary?: IWorkModeSuggestion;
	readonly detectedProjectKinds: readonly string[];
	readonly environment: IWorkModeEnvironmentContext;
}

export interface IWorkModeExtensionInstallResult {
	readonly installed: readonly string[];
	readonly skipped: readonly string[];
	readonly failed: readonly string[];
}

export interface IWorkModeSwitchOptions {
	readonly associateWorkspace?: boolean;
	/** Apply the mode's layout preset after switch (default true). */
	readonly applyLayout?: boolean;
	/** Offer/install recommended extensions after switch (default true when configured). */
	readonly installExtensions?: boolean;
	/** Source of the switch for telemetry (picker, suggestion, activity, command). */
	readonly source?: string;
}

export interface IWorkModeUsageStats {
	switchesByMode: Record<string, number>;
	suggestionsShown: number;
	suggestionsAccepted: number;
	suggestionsDismissed: number;
	activityTriggers: number;
	extensionsInstalled: number;
	lastModeId?: string;
	lastSwitchSource?: string;
	lastSwitchAt?: number;
}

export const WORK_MODE_SUGGESTION_STORAGE_KEY = 'workbench.workModes.suggestionDismissed';
export const WORK_MODE_LAST_SUGGESTED_KEY = 'workbench.workModes.lastSuggestedMode';
export const WORK_MODE_ACTIVITY_DEBUG_DISMISSED_KEY = 'workbench.workModes.activityDebugDismissed';
export const WORK_MODE_ACTIVITY_DOCS_DISMISSED_KEY = 'workbench.workModes.activityDocsDismissed';
export const WORK_MODE_USAGE_STATS_KEY = 'workbench.workModes.usageStats';
export const WORK_MODE_ENABLED_CONFIG_KEY = 'workbench.profiles.workModes.enabled';
export const WORK_MODE_SUGGESTIONS_CONFIG_KEY = 'workbench.profiles.workModes.suggestions';
export const WORK_MODE_ACTIVITY_SUGGESTIONS_CONFIG_KEY = 'workbench.profiles.workModes.activitySuggestions';
export const WORK_MODE_EXTENSIONS_CONFIG_KEY = 'workbench.profiles.workModes.recommendExtensions';
export const WORK_MODE_LAYOUT_CONFIG_KEY = 'workbench.profiles.workModes.applyLayout';

export const IWorkModeService = createDecorator<IWorkModeService>('workModeService');

export interface IWorkModeService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeWorkModes: Event<void>;

	/** All built-in work mode presets. */
	getPresets(): readonly IWorkModePreset[];

	/** Detect which work modes best fit the current workspace. */
	detectWorkModes(): Promise<IWorkModeDetectionResult>;

	/** Current remote/trust/web environment signals. */
	getEnvironmentContext(): IWorkModeEnvironmentContext;

	/** Get or create the profile backing a work mode, then switch to it. */
	switchToMode(modeId: WorkModeId, options?: IWorkModeSwitchOptions): Promise<IUserDataProfile>;

	/** Create a profile for a work mode without switching. */
	ensureModeProfile(modeId: WorkModeId): Promise<IUserDataProfile>;

	/** Apply the mode's layout preset to the current window. */
	applyModeLayout(modeId: WorkModeId): void;

	/** Install missing recommended extensions for a mode. */
	installRecommendedExtensions(modeId: WorkModeId): Promise<IWorkModeExtensionInstallResult>;

	/** Return recommended extensions not yet installed for a mode. */
	getMissingRecommendedExtensions(modeId: WorkModeId): Promise<readonly string[]>;

	/** Resolve the work mode for an existing profile name, if any. */
	getModeForProfile(profile: IUserDataProfile): IWorkModePreset | undefined;

	/** Whether the current workspace should receive a mode suggestion. */
	shouldSuggestWorkMode(): Promise<boolean>;

	/** Mark the suggestion as dismissed for this workspace. */
	dismissSuggestion(): void;

	/** Get a human-readable label for the currently active mode, if any. */
	getCurrentMode(): IWorkModePreset | undefined;

	/** Record a telemetry/usage event for the in-product stats view. */
	recordUsage(event: 'suggested' | 'accepted' | 'dismissed' | 'activity' | 'switch' | 'extensions', modeId?: WorkModeId, source?: string): void;

	/** Snapshot of local usage stats for the telemetry/stats command. */
	getUsageStats(): IWorkModeUsageStats;
}

export function getWorkModePresets(): readonly IWorkModePreset[] {
	return WORK_MODE_PRESETS;
}

export function getWorkModePreset(id: WorkModeId): IWorkModePreset | undefined {
	return WORK_MODE_PRESETS.find(p => p.id === id);
}

export function getWorkModeProfileName(preset: IWorkModePreset): string {
	return preset.profileName;
}

export function isWorkModeProfileName(name: string): boolean {
	return WORK_MODE_PRESETS.some(p => p.profileName === name);
}

export function createEmptyUsageStats(): IWorkModeUsageStats {
	return {
		switchesByMode: {},
		suggestionsShown: 0,
		suggestionsAccepted: 0,
		suggestionsDismissed: 0,
		activityTriggers: 0,
		extensionsInstalled: 0,
	};
}

const WORK_MODE_PRESETS: readonly IWorkModePreset[] = [
	{
		id: WorkModeId.Frontend,
		profileName: 'Frontend',
		name: localize('workMode.frontend.name', "Frontend"),
		description: localize('workMode.frontend.desc', "UI-focused development with browser tools, CSS/HTML helpers, and a lean sidebar."),
		icon: Codicon.browser,
		summary: localize('workMode.frontend.summary', "Optimized for building user interfaces and client-side apps"),
		tips: [
			localize('workMode.frontend.tip1', "Open the Simple Browser or Edge/Chrome DevTools alongside the editor"),
			localize('workMode.frontend.tip2', "Use Live Preview or the built-in browser for rapid iteration"),
			localize('workMode.frontend.tip3', "Keep Explorer and Search pinned; hide rarely used views"),
		],
		workspaceTagSignals: [
			'workspace.npm.react', 'workspace.npm.vue', 'workspace.npm.@angular/core',
			'workspace.npm.next', 'workspace.npm.nuxt', 'workspace.npm.gatsby',
			'workspace.npm.svelte', 'workspace.bower',
		],
		fileSignals: [
			'package.json', 'vite.config.ts', 'vite.config.js', 'webpack.config.js',
			'angular.json', 'next.config.js', 'next.config.ts', 'nuxt.config.ts',
			'svelte.config.js', 'tailwind.config.js', 'index.html',
		],
		recommendedExtensions: [
			'dbaeumer.vscode-eslint',
			'esbenp.prettier-vscode',
			'bradlc.vscode-tailwindcss',
			'ms-edgedevtools.vscode-edge-devtools',
		],
		layout: {
			sideBarVisible: true,
			panelVisible: false,
			auxiliaryBarVisible: false,
			panelPosition: 'bottom',
		},
		settings: {
			'editor.minimap.enabled': false,
			'editor.bracketPairColorization.enabled': true,
			'editor.guides.bracketPairs': true,
			'editor.formatOnSave': true,
			'editor.linkedEditing': true,
			'emmet.triggerExpansionOnTab': true,
			'workbench.sideBar.location': 'left',
			'explorer.compactFolders': false,
			'files.exclude': { '**/.git': true, '**/node_modules': true, '**/dist': true },
			'search.exclude': { '**/node_modules': true, '**/dist': true, '**/build': true },
		},
	},
	{
		id: WorkModeId.Backend,
		profileName: 'Backend',
		name: localize('workMode.backend.name', "Backend"),
		description: localize('workMode.backend.desc', "API and service work with terminal, tests, and language tooling front-and-center."),
		icon: Codicon.serverProcess,
		summary: localize('workMode.backend.summary', "Optimized for APIs, services, databases, and server-side code"),
		tips: [
			localize('workMode.backend.tip1', "Keep the Terminal panel open for servers and test runners"),
			localize('workMode.backend.tip2', "Use Testing view for unit/integration tests"),
			localize('workMode.backend.tip3', "Pin REST/HTTP client or database extensions for fast iteration"),
		],
		workspaceTagSignals: [
			'workspace.npm.express', 'workspace.npm.koa', 'workspace.npm.hapi',
			'workspace.npm.restify', 'workspace.npm.@nestjs/core', 'workspace.npm.strapi',
			'workspace.npm.sails', 'workspace.py.requirements', 'workspace.py.Pipfile',
			'workspace.py.conda', 'workspace.go.mod', 'workspace.java.pom',
			'workspace.dotnet', 'workspace.rubygems',
		],
		fileSignals: [
			'package.json', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
			'requirements.txt', 'Pipfile', 'pyproject.toml', 'Gemfile',
			'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
			'server.js', 'server.ts', 'main.go', 'app.py',
		],
		recommendedExtensions: [
			'ms-azuretools.vscode-docker',
			'humao.rest-client',
		],
		layout: {
			sideBarVisible: true,
			panelVisible: true,
			auxiliaryBarVisible: false,
			panelPosition: 'bottom',
		},
		settings: {
			'editor.minimap.enabled': true,
			'editor.formatOnSave': true,
			'terminal.integrated.defaultLocation': 'view',
			'workbench.panel.defaultLocation': 'bottom',
			'debug.toolBarLocation': 'docked',
			'files.exclude': { '**/.git': true, '**/node_modules': true, '**/__pycache__': true, '**/target': true },
			'search.exclude': { '**/node_modules': true, '**/vendor': true, '**/target': true },
		},
	},
	{
		id: WorkModeId.Debugging,
		profileName: 'Debugging',
		name: localize('workMode.debugging.name', "Debugging"),
		description: localize('workMode.debugging.desc', "Deep debugging with breakpoints, watch, call stack, and the debug console prioritized."),
		icon: Codicon.debugAlt,
		summary: localize('workMode.debugging.summary', "Optimized for stepping through code and inspecting runtime state"),
		tips: [
			localize('workMode.debugging.tip1', "Open Run and Debug view; configure launch.json for your stack"),
			localize('workMode.debugging.tip2', "Use conditional breakpoints and logpoints to avoid noisy output"),
			localize('workMode.debugging.tip3', "Keep Debug Console and Watch open side-by-side"),
		],
		workspaceTagSignals: [],
		fileSignals: [
			'.vscode/launch.json', 'launch.json',
		],
		recommendedExtensions: [],
		layout: {
			sideBarVisible: true,
			panelVisible: true,
			auxiliaryBarVisible: false,
			panelPosition: 'bottom',
			focusDebugView: true,
		},
		settings: {
			'debug.toolBarLocation': 'docked',
			'debug.openDebug': 'openOnDebugBreak',
			'debug.internalConsoleOptions': 'openOnSessionStart',
			'debug.showBreakpointsInOverviewRuler': true,
			'debug.console.closeOnEnd': false,
			'editor.minimap.enabled': true,
			'editor.renderWhitespace': 'selection',
			'workbench.activityBar.location': 'default',
		},
	},
	{
		id: WorkModeId.Documentation,
		profileName: 'Documentation',
		name: localize('workMode.documentation.name', "Documentation"),
		description: localize('workMode.documentation.desc', "Writing docs and READMEs with Markdown preview, spell check, and distraction-free focus."),
		icon: Codicon.book,
		summary: localize('workMode.documentation.summary', "Optimized for writing docs, READMEs, and technical content"),
		tips: [
			localize('workMode.documentation.tip1', "Open Markdown preview to the side for live rendering"),
			localize('workMode.documentation.tip2', "Enable zen mode or focus mode for long writing sessions"),
			localize('workMode.documentation.tip3', "Use outline view to navigate large documents"),
		],
		workspaceTagSignals: [],
		fileSignals: [
			'README.md', 'README.rst', 'CONTRIBUTING.md', 'docs', 'mkdocs.yml',
			'docusaurus.config.js', 'docusaurus.config.ts', 'book.toml',
		],
		recommendedExtensions: [
			'yzhang.markdown-all-in-one',
			'davidanson.vscode-markdownlint',
			'streetsidesoftware.code-spell-checker',
		],
		layout: {
			sideBarVisible: true,
			panelVisible: false,
			auxiliaryBarVisible: true,
			panelPosition: 'bottom',
		},
		settings: {
			'editor.wordWrap': 'on',
			'editor.lineHeight': 1.6,
			'editor.minimap.enabled': false,
			'editor.quickSuggestions': { other: false, comments: false, strings: false },
			'editor.parameterHints.enabled': false,
			'editor.suggestOnTriggerCharacters': false,
			'breadcrumbs.enabled': true,
			'workbench.editor.enablePreview': false,
			'[markdown]': {
				'editor.wordWrap': 'on',
				'editor.quickSuggestions': { other: false, comments: false, strings: false },
			},
		},
	},
	{
		id: WorkModeId.Teaching,
		profileName: 'Teaching',
		name: localize('workMode.teaching.name', "Teaching"),
		description: localize('workMode.teaching.desc', "Larger fonts, zoom, and simple UI — ideal for live instruction and screen sharing."),
		icon: Codicon.mortarBoard,
		summary: localize('workMode.teaching.summary', "Optimized for live teaching, screen shares, and classrooms"),
		tips: [
			localize('workMode.teaching.tip1', "Increase font size and zoom so students can read from afar"),
			localize('workMode.teaching.tip2', "Hide minimap and extra chrome to reduce visual noise"),
			localize('workMode.teaching.tip3', "Use sticky scroll and breadcrumbs so context stays visible"),
		],
		workspaceTagSignals: [],
		fileSignals: [],
		recommendedExtensions: [],
		layout: {
			sideBarVisible: true,
			panelVisible: true,
			auxiliaryBarVisible: false,
			panelPosition: 'bottom',
		},
		settings: {
			'editor.fontSize': 18,
			'editor.lineHeight': 1.7,
			'editor.minimap.enabled': false,
			'window.zoomLevel': 1,
			'workbench.activityBar.location': 'top',
			'editor.stickyScroll.enabled': true,
			'breadcrumbs.enabled': true,
			'editor.cursorBlinking': 'solid',
			'editor.cursorWidth': 3,
			'terminal.integrated.fontSize': 16,
			'debug.toolBarLocation': 'docked',
		},
	},
	{
		id: WorkModeId.Demo,
		profileName: 'Demo',
		name: localize('workMode.demo.name', "Demo"),
		description: localize('workMode.demo.desc', "Presentation-ready layout: large text, clean UI, and zen-mode-friendly settings."),
		icon: Codicon.deviceCameraVideo,
		summary: localize('workMode.demo.summary', "Optimized for live demos, recordings, and conference talks"),
		tips: [
			localize('workMode.demo.tip1', "Use zen mode (Ctrl+K Z) for a distraction-free stage"),
			localize('workMode.demo.tip2', "Pre-open files and terminals so you are not hunting during the talk"),
			localize('workMode.demo.tip3', "Disable notifications and auto-save prompts beforehand"),
		],
		workspaceTagSignals: [],
		fileSignals: [],
		recommendedExtensions: [],
		layout: {
			sideBarVisible: false,
			panelVisible: false,
			auxiliaryBarVisible: false,
			zenMode: true,
		},
		settings: {
			'editor.fontSize': 20,
			'editor.lineHeight': 1.8,
			'editor.minimap.enabled': false,
			'window.zoomLevel': 2,
			'workbench.statusBar.visible': true,
			'editor.renderLineHighlight': 'none',
			'editor.stickyScroll.enabled': false,
			'breadcrumbs.enabled': false,
			'editor.glyphMargin': true,
			'problems.visibility': false,
			'terminal.integrated.fontSize': 18,
			'workbench.editor.showTabs': 'single',
		},
	},
	{
		id: WorkModeId.Troubleshooting,
		profileName: 'Troubleshooting',
		name: localize('workMode.troubleshooting.name', "Troubleshooting"),
		description: localize('workMode.troubleshooting.desc', "Diagnostics-first: output, problems, extensions, and developer tools within easy reach."),
		icon: Codicon.tools,
		summary: localize('workMode.troubleshooting.summary', "Optimized for diagnosing issues, slowdowns, and extension problems"),
		tips: [
			localize('workMode.troubleshooting.tip1', "Open Problems, Output, and Developer Tools for full signal"),
			localize('workMode.troubleshooting.tip2', "Use Extension Bisect when an extension may be at fault"),
			localize('workMode.troubleshooting.tip3', "Check Process Explorer and Startup Performance for bottlenecks"),
		],
		workspaceTagSignals: [],
		fileSignals: [],
		recommendedExtensions: [],
		layout: {
			sideBarVisible: true,
			panelVisible: true,
			auxiliaryBarVisible: true,
			panelPosition: 'bottom',
		},
		settings: {
			'editor.minimap.enabled': true,
			'problems.showCurrentInStatus': true,
			'debug.console.fontSize': 13,
			'trace.level': 'verbose',
			'extensions.autoCheckUpdates': false,
			'extensions.autoUpdate': false,
			'telemetry.telemetryLevel': 'off',
		},
	},
	{
		id: WorkModeId.Fullstack,
		profileName: 'Full Stack',
		name: localize('workMode.fullstack.name', "Full Stack"),
		description: localize('workMode.fullstack.desc', "Balanced setup for projects spanning frontend and backend in one workspace."),
		icon: Codicon.layers,
		summary: localize('workMode.fullstack.summary', "Balanced for full-stack and monorepo development"),
		tips: [
			localize('workMode.fullstack.tip1', "Use multi-root workspaces or folders for client/server separation"),
			localize('workMode.fullstack.tip2', "Keep both Terminal and Simple Browser reachable"),
			localize('workMode.fullstack.tip3', "Leverage tasks.json for concurrent client and server runs"),
		],
		workspaceTagSignals: [
			'workspace.npm.react', 'workspace.npm.vue', 'workspace.npm.express',
			'workspace.npm.next', 'workspace.npm.@nestjs/core',
		],
		fileSignals: [
			'package.json', 'docker-compose.yml', 'turbo.json', 'nx.json',
			'lerna.json', 'pnpm-workspace.yaml',
		],
		recommendedExtensions: [
			'dbaeumer.vscode-eslint',
			'esbenp.prettier-vscode',
			'ms-azuretools.vscode-docker',
		],
		layout: {
			sideBarVisible: true,
			panelVisible: true,
			auxiliaryBarVisible: false,
			panelPosition: 'bottom',
		},
		settings: {
			'editor.formatOnSave': true,
			'editor.bracketPairColorization.enabled': true,
			'terminal.integrated.defaultLocation': 'view',
			'files.exclude': { '**/.git': true, '**/node_modules': true, '**/dist': true },
			'search.exclude': { '**/node_modules': true, '**/dist': true },
		},
	},
	{
		id: WorkModeId.DataScience,
		profileName: 'Data Science',
		name: localize('workMode.datascience.name', "Data Science"),
		description: localize('workMode.datascience.desc', "Notebooks, interactive Python, and plot-friendly editor settings."),
		icon: Codicon.graph,
		summary: localize('workMode.datascience.summary', "Optimized for notebooks, analysis, and ML workflows"),
		tips: [
			localize('workMode.datascience.tip1', "Open notebooks with the built-in Jupyter experience"),
			localize('workMode.datascience.tip2', "Use Interactive Window for exploratory runs"),
			localize('workMode.datascience.tip3', "Keep variables and plots visible in secondary side bar"),
		],
		workspaceTagSignals: [
			'workspace.py.requirements', 'workspace.py.Pipfile', 'workspace.py.conda',
			'workspace.npm.@tensorflow/tfjs', 'workspace.npm.@tensorflow/tfjs-node',
		],
		fileSignals: [
			'requirements.txt', 'environment.yml', 'pyproject.toml',
			'setup.py', 'setup.cfg',
		],
		recommendedExtensions: [
			'ms-python.python',
			'ms-toolsai.jupyter',
		],
		layout: {
			sideBarVisible: true,
			panelVisible: false,
			auxiliaryBarVisible: true,
			panelPosition: 'bottom',
		},
		settings: {
			'notebook.lineNumbers': 'on',
			'notebook.output.textLineLimit': 50,
			'editor.minimap.enabled': false,
			'python.analysis.typeCheckingMode': 'basic',
			'jupyter.interactiveWindow.textEditor.executeSelection': true,
		},
	},
	{
		id: WorkModeId.Mobile,
		profileName: 'Mobile',
		name: localize('workMode.mobile.name', "Mobile"),
		description: localize('workMode.mobile.desc', "Mobile and cross-platform app development with emulators and device tooling in mind."),
		icon: Codicon.deviceMobile,
		summary: localize('workMode.mobile.summary', "Optimized for iOS, Android, React Native, and Flutter apps"),
		tips: [
			localize('workMode.mobile.tip1', "Keep emulators/simulators running; attach debugger early"),
			localize('workMode.mobile.tip2', "Use Expo or Flutter tools for hot reload workflows"),
			localize('workMode.mobile.tip3', "Pin terminal for build/run logs"),
		],
		workspaceTagSignals: [
			'workspace.npm.rnpm-plugin-windows', 'workspace.npm.react',
		],
		fileSignals: [
			'android', 'ios', 'pubspec.yaml', 'app.json', 'app.config.js',
			'metro.config.js', 'flutter', 'Info.plist', 'AndroidManifest.xml',
		],
		recommendedExtensions: [],
		layout: {
			sideBarVisible: true,
			panelVisible: true,
			auxiliaryBarVisible: false,
			panelPosition: 'bottom',
		},
		settings: {
			'editor.formatOnSave': true,
			'terminal.integrated.defaultLocation': 'view',
			'files.exclude': { '**/.git': true, '**/node_modules': true, '**/build': true, '**/.dart_tool': true },
		},
	},
];
