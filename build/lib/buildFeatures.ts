/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

export type BuildFeatureProfile = 'default' | 'minimal';

export interface IBuildFeatures {
	readonly copilotChat: boolean;
	readonly agentSessionsUI: true;
	readonly git: boolean;
	readonly scm: boolean;
	readonly debug: boolean;
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

interface IBuildFeatureConfiguration {
	profiles: Record<BuildFeatureProfile, IBuildFeatures>;
}

const buildFeatureConfiguration = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../features.json'), 'utf8')) as IBuildFeatureConfiguration;
let loggedProfile: BuildFeatureProfile | undefined;

const booleanFeatureKeys: readonly (keyof Omit<IBuildFeatures, 'terminal' | 'agentSessionsUI' | 'agents'>)[] = [
	'copilotChat', 'git', 'scm', 'debug', 'tasks', 'notebooks', 'testing',
	'remote', 'extensionsUI', 'welcome', 'review', 'sync', 'productServices'
];

function validateBuildFeatureConfiguration(): void {
	const expectedProfiles = ['default', 'minimal'];
	const actualProfiles = Object.keys(buildFeatureConfiguration.profiles).sort();
	if (JSON.stringify(actualProfiles) !== JSON.stringify(expectedProfiles)) {
		throw new Error(`Invalid build/features.json profiles: expected ${expectedProfiles.join(', ')}, got ${actualProfiles.join(', ')}.`);
	}

	for (const profileName of expectedProfiles as BuildFeatureProfile[]) {
		const profile = buildFeatureConfiguration.profiles[profileName] as IBuildFeatures & Record<string, unknown>;
		for (const key of [...booleanFeatureKeys, 'terminal', 'agentSessionsUI'] as const) {
			if (typeof profile[key] !== 'boolean') {
				throw new Error(`Invalid build/features.json: '${profileName}.${key}' must be boolean.`);
			}
		}
		if (profile.terminal !== true || profile.agentSessionsUI !== true) {
			throw new Error(`Invalid build/features.json: '${profileName}' must keep terminal and generic agent sessions enabled.`);
		}
		if (typeof profile.agents !== 'object' || profile.agents === null || Object.keys(profile.agents).sort().join(',') !== 'claude,codex' || typeof profile.agents.codex !== 'boolean' || typeof profile.agents.claude !== 'boolean') {
			throw new Error(`Invalid build/features.json: '${profileName}.agents' must declare boolean codex and claude values.`);
		}
		const expectedKeys = [...booleanFeatureKeys, 'agents', 'terminal', 'agentSessionsUI'].sort();
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

export function configureProductForBuild<T extends Record<string, unknown>>(product: T): T {
	const features = getBuildFeatures();
	const configured = { ...product };
	if (!features.copilotChat) {
		delete configured['defaultChatAgent'];
		delete configured['trustedExtensionAuthAccess'];
		delete configured['builtInExtensionsEnabledWithAutoUpdates'];
		delete configured['voiceWsUrl'];
	}
	for (const key of ['builtInExtensions', 'webBuiltInExtensions']) {
		const extensions = configured[key];
		if (Array.isArray(extensions)) {
			configured[key] = extensions.filter(extension => typeof extension === 'object' && extension !== null && 'name' in extension && isBuildFeatureEnabledForExtension(String(extension.name), features));
		}
	}
	return configured;
}

export function filterBuiltInExtensions<T extends { name: string }>(extensions: T[]): T[] {
	const features = getBuildFeatures();
	return extensions.filter(extension => isBuildFeatureEnabledForExtension(extension.name, features));
}

function isBuildFeatureEnabledForExtension(name: string, features: IBuildFeatures): boolean {
	switch (name.toLowerCase()) {
		case 'github.copilot-chat': return features.copilotChat;
		case 'ms-vscode.js-debug':
		case 'ms-vscode.js-debug-companion': return features.debug;
		default: return true;
	}
}
