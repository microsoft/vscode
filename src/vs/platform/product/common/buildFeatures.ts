/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IBuildFeatures {
	readonly copilotChat: boolean;
	readonly chatPanel: boolean;
	readonly git: boolean;
	readonly sourceControlUI: boolean;
	readonly scmService: boolean;
	readonly debugUI: boolean;
	readonly debugService: boolean;
	readonly tasks: boolean;
	readonly notebooks: boolean;
	readonly testing: boolean;
	readonly remote: boolean;
	readonly extensionsUI: boolean;
	readonly welcome: boolean;
	readonly review: boolean;
	readonly sync: boolean;
	readonly productServices: boolean;
	readonly terminal: true;
	readonly agents: { readonly codex: boolean; readonly claude: boolean };
}

declare global {
	const __VSCODE_BUILD_FEATURE_COPILOT_CHAT__: boolean;
	const __VSCODE_BUILD_FEATURE_CHAT_PANEL__: boolean;
	const __VSCODE_BUILD_FEATURE_GIT__: boolean;
	const __VSCODE_BUILD_FEATURE_SOURCE_CONTROL_UI__: boolean;
	const __VSCODE_BUILD_FEATURE_SCM_SERVICE__: boolean;
	const __VSCODE_BUILD_FEATURE_DEBUG_UI__: boolean;
	const __VSCODE_BUILD_FEATURE_DEBUG_SERVICE__: boolean;
	const __VSCODE_BUILD_FEATURE_TASKS__: boolean;
	const __VSCODE_BUILD_FEATURE_NOTEBOOKS__: boolean;
	const __VSCODE_BUILD_FEATURE_TESTING__: boolean;
	const __VSCODE_BUILD_FEATURE_REMOTE__: boolean;
	const __VSCODE_BUILD_FEATURE_EXTENSIONS_UI__: boolean;
	const __VSCODE_BUILD_FEATURE_WELCOME__: boolean;
	const __VSCODE_BUILD_FEATURE_REVIEW__: boolean;
	const __VSCODE_BUILD_FEATURE_SYNC__: boolean;
	const __VSCODE_BUILD_FEATURE_PRODUCT_SERVICES__: boolean;
	const __VSCODE_BUILD_FEATURE_TERMINAL__: boolean;
	const __VSCODE_BUILD_FEATURE_CODEX__: boolean;
	const __VSCODE_BUILD_FEATURE_CLAUDE__: boolean;
}

const developmentBuildFeatures: Record<'default' | 'minimal', IBuildFeatures> = {
	default: {
		copilotChat: true,
		chatPanel: true,
		git: true,
		sourceControlUI: true,
		scmService: true,
		debugUI: true,
		debugService: true,
		tasks: true,
		notebooks: true,
		testing: true,
		remote: true,
		extensionsUI: true,
		welcome: true,
		review: true,
		sync: true,
		productServices: true,
		terminal: true,
		agents: { codex: true, claude: true },
	},
	minimal: {
		copilotChat: false,
		chatPanel: false,
		git: false,
		sourceControlUI: false,
		scmService: true,
		debugUI: false,
		debugService: true,
		tasks: false,
		notebooks: false,
		testing: false,
		remote: false,
		extensionsUI: true,
		welcome: false,
		review: false,
		sync: false,
		productServices: false,
		terminal: true,
		agents: { codex: true, claude: true },
	},
};

function getDevelopmentBuildFeatures(): IBuildFeatures {
	// The TypeScript watch pipeline does not run the Vite/build feature injection.
	// Use the minimal profile by default, with an explicit environment override for local development.
	const profile = typeof process === 'undefined' ? undefined : process.env?.['VSCODE_BUILD_PROFILE'];
	if (profile && profile !== 'default' && profile !== 'minimal') {
		throw new Error(`Unknown VSCODE_BUILD_PROFILE '${profile}'. Expected 'default' or 'minimal'.`);
	}
	return developmentBuildFeatures[profile === 'default' ? 'default' : 'minimal'];
}

const developmentFeatures = typeof __VSCODE_BUILD_FEATURE_COPILOT_CHAT__ === 'undefined' ? getDevelopmentBuildFeatures() : undefined;

// Export primitive flags as well as the object below. Bundlers can fold direct
// boolean imports and remove disabled feature branches from packaged bundles.
export const buildFeatureCopilotChat = typeof __VSCODE_BUILD_FEATURE_COPILOT_CHAT__ === 'undefined' ? developmentFeatures!.copilotChat : __VSCODE_BUILD_FEATURE_COPILOT_CHAT__;
export const buildFeatureChatPanel = typeof __VSCODE_BUILD_FEATURE_CHAT_PANEL__ === 'undefined' ? developmentFeatures!.chatPanel : __VSCODE_BUILD_FEATURE_CHAT_PANEL__;
export const buildFeatureGit = typeof __VSCODE_BUILD_FEATURE_GIT__ === 'undefined' ? developmentFeatures!.git : __VSCODE_BUILD_FEATURE_GIT__;
export const buildFeatureSourceControlUI = typeof __VSCODE_BUILD_FEATURE_SOURCE_CONTROL_UI__ === 'undefined' ? developmentFeatures!.sourceControlUI : __VSCODE_BUILD_FEATURE_SOURCE_CONTROL_UI__;
export const buildFeatureScmService = typeof __VSCODE_BUILD_FEATURE_SCM_SERVICE__ === 'undefined' ? developmentFeatures!.scmService : __VSCODE_BUILD_FEATURE_SCM_SERVICE__;
export const buildFeatureDebugUI = typeof __VSCODE_BUILD_FEATURE_DEBUG_UI__ === 'undefined' ? developmentFeatures!.debugUI : __VSCODE_BUILD_FEATURE_DEBUG_UI__;
export const buildFeatureDebugService = typeof __VSCODE_BUILD_FEATURE_DEBUG_SERVICE__ === 'undefined' ? developmentFeatures!.debugService : __VSCODE_BUILD_FEATURE_DEBUG_SERVICE__;
export const buildFeatureTasks = typeof __VSCODE_BUILD_FEATURE_TASKS__ === 'undefined' ? developmentFeatures!.tasks : __VSCODE_BUILD_FEATURE_TASKS__;
export const buildFeatureNotebooks = typeof __VSCODE_BUILD_FEATURE_NOTEBOOKS__ === 'undefined' ? developmentFeatures!.notebooks : __VSCODE_BUILD_FEATURE_NOTEBOOKS__;
export const buildFeatureTesting = typeof __VSCODE_BUILD_FEATURE_TESTING__ === 'undefined' ? developmentFeatures!.testing : __VSCODE_BUILD_FEATURE_TESTING__;
export const buildFeatureRemote = typeof __VSCODE_BUILD_FEATURE_REMOTE__ === 'undefined' ? developmentFeatures!.remote : __VSCODE_BUILD_FEATURE_REMOTE__;
export const buildFeatureExtensionsUI = typeof __VSCODE_BUILD_FEATURE_EXTENSIONS_UI__ === 'undefined' ? developmentFeatures!.extensionsUI : __VSCODE_BUILD_FEATURE_EXTENSIONS_UI__;
export const buildFeatureWelcome = typeof __VSCODE_BUILD_FEATURE_WELCOME__ === 'undefined' ? developmentFeatures!.welcome : __VSCODE_BUILD_FEATURE_WELCOME__;
export const buildFeatureReview = typeof __VSCODE_BUILD_FEATURE_REVIEW__ === 'undefined' ? developmentFeatures!.review : __VSCODE_BUILD_FEATURE_REVIEW__;
export const buildFeatureSync = typeof __VSCODE_BUILD_FEATURE_SYNC__ === 'undefined' ? developmentFeatures!.sync : __VSCODE_BUILD_FEATURE_SYNC__;
export const buildFeatureProductServices = typeof __VSCODE_BUILD_FEATURE_PRODUCT_SERVICES__ === 'undefined' ? developmentFeatures!.productServices : __VSCODE_BUILD_FEATURE_PRODUCT_SERVICES__;
export const buildFeatureCodex = typeof __VSCODE_BUILD_FEATURE_CODEX__ === 'undefined' ? developmentFeatures!.agents.codex : __VSCODE_BUILD_FEATURE_CODEX__;
export const buildFeatureClaude = typeof __VSCODE_BUILD_FEATURE_CLAUDE__ === 'undefined' ? developmentFeatures!.agents.claude : __VSCODE_BUILD_FEATURE_CLAUDE__;

export const buildFeatures: IBuildFeatures = {
	copilotChat: buildFeatureCopilotChat,
	chatPanel: buildFeatureChatPanel,
	git: buildFeatureGit,
	sourceControlUI: buildFeatureSourceControlUI,
	scmService: buildFeatureScmService,
	debugUI: buildFeatureDebugUI,
	debugService: buildFeatureDebugService,
	tasks: buildFeatureTasks,
	notebooks: buildFeatureNotebooks,
	testing: buildFeatureTesting,
	remote: buildFeatureRemote,
	extensionsUI: buildFeatureExtensionsUI,
	welcome: buildFeatureWelcome,
	review: buildFeatureReview,
	sync: buildFeatureSync,
	productServices: buildFeatureProductServices,
	terminal: true,
	agents: { codex: buildFeatureCodex, claude: buildFeatureClaude },
};
