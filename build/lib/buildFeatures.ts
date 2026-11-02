/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

export type BuildFeatureProfile = 'default' | 'minimal';

export interface IBuildFeatures {
	readonly coordinationUI: boolean;
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
	readonly backgroundNetwork: boolean;
	readonly terminal: true;
	readonly bundledExtensions: '*' | readonly string[];
	readonly agents: { readonly codex: boolean; readonly claude: boolean };
}

interface IBuildFeatureConfiguration {
	profiles: Record<BuildFeatureProfile, IBuildFeatures>;
}

const buildFeatureConfiguration = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../features.json'), 'utf8')) as IBuildFeatureConfiguration;
let loggedProfile: BuildFeatureProfile | undefined;

const booleanFeatureKeys: readonly (keyof Omit<IBuildFeatures, 'terminal' | 'agents'>)[] = [
	'coordinationUI', 'copilotChat', 'chatPanel', 'git', 'sourceControlUI', 'scmService', 'debugUI', 'debugService', 'tasks', 'notebooks', 'testing',
	'remote', 'extensionsUI', 'welcome', 'review', 'sync', 'productServices', 'backgroundNetwork'
];

function validateBuildFeatureConfiguration(): void {
	const expectedProfiles = ['default', 'minimal'];
	const actualProfiles = Object.keys(buildFeatureConfiguration.profiles).sort();
	if (JSON.stringify(actualProfiles) !== JSON.stringify(expectedProfiles)) {
		throw new Error(`Invalid build/features.json profiles: expected ${expectedProfiles.join(', ')}, got ${actualProfiles.join(', ')}.`);
	}

	for (const profileName of expectedProfiles as BuildFeatureProfile[]) {
		const profile = buildFeatureConfiguration.profiles[profileName] as IBuildFeatures & Record<string, unknown>;
		for (const key of [...booleanFeatureKeys, 'terminal'] as const) {
			if (typeof profile[key] !== 'boolean') {
				throw new Error(`Invalid build/features.json: '${profileName}.${key}' must be boolean.`);
			}
		}
		if (profile.terminal !== true) {
			throw new Error(`Invalid build/features.json: '${profileName}' must keep the terminal enabled.`);
		}
		if (profile.sourceControlUI && !profile.scmService) {
			throw new Error(`Invalid build/features.json: '${profileName}.sourceControlUI' requires 'scmService'.`);
		}
		if (profile.debugUI && !profile.debugService) {
			throw new Error(`Invalid build/features.json: '${profileName}.debugUI' requires 'debugService'.`);
		}
		if (typeof profile.agents !== 'object' || profile.agents === null || Object.keys(profile.agents).sort().join(',') !== 'claude,codex' || typeof profile.agents.codex !== 'boolean' || typeof profile.agents.claude !== 'boolean') {
			throw new Error(`Invalid build/features.json: '${profileName}.agents' must declare boolean codex and claude values.`);
		}
		if (profile.bundledExtensions !== '*') {
			if (!Array.isArray(profile.bundledExtensions) || profile.bundledExtensions.some(id => typeof id !== 'string' || !/^[a-z0-9-]+\.[a-z0-9-]+$/.test(id)) || new Set(profile.bundledExtensions).size !== profile.bundledExtensions.length) {
				throw new Error(`Invalid build/features.json: '${profileName}.bundledExtensions' must be '*' or a unique list of extension identifiers.`);
			}
		}
		const expectedKeys = [...booleanFeatureKeys, 'agents', 'terminal', 'bundledExtensions'].sort();
		if (JSON.stringify(Object.keys(profile).sort()) !== JSON.stringify(expectedKeys)) {
			throw new Error(`Invalid build/features.json keys for '${profileName}'.`);
		}
	}
}

validateBuildFeatureConfiguration();

export function getBuildFeatureProfile(): BuildFeatureProfile {
	const profile = process.env['VSCODE_BUILD_PROFILE'] ?? 'default';
	if (profile !== 'default' && profile !== 'minimal') {
		throw new Error(`Unknown VSCODE_BUILD_PROFILE '${profile}'. Expected 'default' or 'minimal'.`);
	}
	return profile;
}

export function getBuildFeatures(): IBuildFeatures {
	const profile = getBuildFeatureProfile();
	const features = buildFeatureConfiguration.profiles[profile];
	if (!features) {
		throw new Error(`Missing '${profile}' build feature profile.`);
	}
	if (loggedProfile !== profile) {
		console.log(`[build] feature profile: ${profile}`);
		loggedProfile = profile;
	}
	return features;
}

export function getBuildFeatureDefines(): Record<string, string> {
	const features = getBuildFeatures();
	const names: Record<string, string> = {
		coordinationUI: 'TRINORIS_COORDINATION_UI',
		copilotChat: 'COPILOT_CHAT',
		chatPanel: 'CHAT_PANEL',
		git: 'GIT',
		sourceControlUI: 'SOURCE_CONTROL_UI',
		scmService: 'SCM_SERVICE',
		debugUI: 'DEBUG_UI',
		debugService: 'DEBUG_SERVICE',
		tasks: 'TASKS',
		notebooks: 'NOTEBOOKS',
		testing: 'TESTING',
		remote: 'REMOTE',
		extensionsUI: 'EXTENSIONS_UI',
		welcome: 'WELCOME',
		review: 'REVIEW',
		sync: 'SYNC',
		productServices: 'PRODUCT_SERVICES',
		backgroundNetwork: 'BACKGROUND_NETWORK',
		terminal: 'TERMINAL',
	};
	const defines = Object.fromEntries(Object.entries(names).map(([key, name]) => [`__VSCODE_BUILD_FEATURE_${name}__`, JSON.stringify(features[key as keyof IBuildFeatures])]));
	defines['__VSCODE_BUILD_FEATURE_CODEX__'] = JSON.stringify(features.agents.codex);
	defines['__VSCODE_BUILD_FEATURE_CLAUDE__'] = JSON.stringify(features.agents.claude);
	defines['__VSCODE_BUILD_BUNDLED_EXTENSIONS__'] = JSON.stringify(features.bundledExtensions);
	return defines;
}

export function configureProductForBuild<T extends Record<string, unknown>>(product: T): T {
	const features = getBuildFeatures();
	const configured: Record<string, unknown> = { ...product };
	configured['buildProfile'] = getBuildFeatureProfile();
	configured['buildFeatures'] = features;
	if (!features.copilotChat) {
		delete configured['defaultChatAgent'];
		delete configured['trustedExtensionAuthAccess'];
		delete configured['voiceWsUrl'];
	}
	const autoUpdateExtensions = configured['builtInExtensionsEnabledWithAutoUpdates'];
	configured['builtInExtensionsEnabledWithAutoUpdates'] = Array.isArray(autoUpdateExtensions)
		? autoUpdateExtensions.filter(extensionId => typeof extensionId === 'string' && isExtensionBundledForFeatures(extensionId, features))
		: [];
	for (const key of ['builtInExtensions', 'webBuiltInExtensions']) {
		const extensions = configured[key];
		if (Array.isArray(extensions)) {
			configured[key] = extensions.filter(extension => typeof extension === 'object' && extension !== null && 'name' in extension && isBuildFeatureEnabledForExtension(String(extension.name), features) && isExtensionBundledForFeatures(String(extension.name), features));
		}
	}
	return configured as T;
}

export function filterBuiltInExtensions<T extends { name: string }>(extensions: T[]): T[] {
	const features = getBuildFeatures();
	return extensions.filter(extension => isBuildFeatureEnabledForExtension(extension.name, features) && isExtensionBundled(extension.name));
}

export function isExtensionBundled(extensionId: string): boolean {
	return isExtensionBundledForFeatures(extensionId, getBuildFeatures());
}

export function isBuildFeatureStylesheetIncluded(filePath: string, features = getBuildFeatures()): boolean {
	const normalizedPath = filePath.replaceAll('\\', '/');
	const excludedRoots: [boolean, string[]][] = [
		[!features.debugUI, ['/src/vs/workbench/contrib/debug/']],
		[!features.notebooks, ['/src/vs/workbench/contrib/notebook/', '/src/vs/workbench/contrib/interactive/', '/src/vs/workbench/contrib/replNotebook/']],
		[!features.testing, ['/src/vs/workbench/contrib/testing/']],
		[!features.tasks, ['/src/vs/workbench/contrib/tasks/']],
		[!features.remote, ['/src/vs/workbench/contrib/remote/', '/src/vs/workbench/contrib/remoteExplorer/']],
		[!features.welcome, ['/src/vs/workbench/contrib/welcome/', '/src/vs/workbench/contrib/welcomeAgentSessions/', '/src/vs/workbench/contrib/welcomeWalkthrough/', '/src/vs/workbench/contrib/walkthrough/']],
		[!features.review, ['/src/vs/workbench/contrib/comments/']],
		[!features.sourceControlUI, ['/src/vs/workbench/contrib/scm/']],
		[!features.sync, ['/src/vs/workbench/contrib/userDataSync/', '/src/vs/workbench/contrib/editSessions/']],
		[!features.copilotChat, ['/src/vs/workbench/contrib/agentsVoice/']],
	];
	return !excludedRoots.some(([excluded, roots]) => excluded && roots.some(root => normalizedPath.includes(root)));
}

/**
 * Returns false for source trees loaded only by disabled contributions, while
 * retaining small shared contracts imported by core Chat and accessibility code.
 */
export function isBuildFeatureSourceIncluded(filePath: string, features = getBuildFeatures()): boolean {
	const normalizedPath = filePath.replaceAll('\\', '/');
	const isSharedSupportFile = (paths: readonly string[]) => paths.some(path => normalizedPath.endsWith(path));
	const sharedCopilotSupportFiles = [
		'/src/vs/workbench/contrib/agentsVoice/common/agentsVoice.ts',
		'/src/vs/workbench/contrib/agentsVoice/common/agentsVoiceColors.ts',
		'/src/vs/workbench/contrib/agentsVoice/common/voiceTranscriptStore.ts',
		'/src/vs/workbench/contrib/agentsVoice/browser/voiceModeOnboardingService.ts',
	];
	const sharedReviewSupportFiles = [
		'/src/vs/workbench/contrib/comments/browser/commentsAccessibilityNLS.ts',
		'/src/vs/workbench/contrib/comments/common/commentCommandIds.ts',
		'/src/vs/workbench/contrib/comments/common/commentContextKeys.ts',
	];
	const isRequiredSharedSupport = (!features.copilotChat && isSharedSupportFile(sharedCopilotSupportFiles))
		|| (!features.review && isSharedSupportFile(sharedReviewSupportFiles));
	const excludedRoots: [boolean, string[]][] = [
		[!features.copilotChat, ['/src/vs/workbench/contrib/agentsVoice/']],
		[!features.welcome, [
			'/src/vs/workbench/contrib/welcomeGettingStarted/',
			'/src/vs/workbench/contrib/welcomeAgentSessions/',
			'/src/vs/workbench/contrib/welcomeWalkthrough/',
			'/src/vs/workbench/contrib/walkthrough/',
		]],
		[!features.review, ['/src/vs/workbench/contrib/comments/']],
	];
	return isRequiredSharedSupport || !excludedRoots.some(([excluded, roots]) => excluded && roots.some(root => normalizedPath.includes(root)));
}

function isExtensionBundledForFeatures(extensionId: string, features: IBuildFeatures): boolean {
	const extensions = features.bundledExtensions;
	return isBuildFeatureEnabledForExtension(extensionId, features) && (extensions === '*' || extensions.includes(extensionId.toLowerCase()));
}

function isBuildFeatureEnabledForExtension(name: string, features: IBuildFeatures): boolean {
	switch (name.toLowerCase()) {
		case 'trinoris.coordination': return features.coordinationUI;
		case 'vscode.git': return features.git;
		case 'github.copilot-chat': return features.copilotChat;
		case 'ms-vscode.js-debug':
		case 'ms-vscode.js-debug-companion': return features.debugUI;
		default: return true;
	}
}
