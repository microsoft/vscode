/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ChatAIDisabledSettingId = 'chat.disableAIFeatures';

/**
 * Configuration key for the "Continue with Microsoft" sign-in choice. Choosing it exchanges a
 * Microsoft Entra sign-in for a GitHub token that is published as a process-lifetime GitHub
 * authentication session. See {@link ChatMicrosoftAuthenticationMode} for its values.
 */
export const ChatMicrosoftAuthenticationEnabledSettingId = 'chat.microsoftAuthentication.enabled';

/** When sign-in dialogs offer "Continue with Microsoft". */
export const enum ChatMicrosoftAuthenticationMode {
	/** Only when a Microsoft work or school account on this device is linked to a GitHub account. */
	Auto = 'auto',
	Always = 'always',
	/** The default, until experimentation rolls out {@link Auto}. */
	Never = 'never',
}

/**
 * Reads {@link ChatMicrosoftAuthenticationEnabledSettingId}. The setting was a boolean before it
 * gained {@link ChatMicrosoftAuthenticationMode.Auto}, so `true` and `false` keep their meaning, and
 * anything unrecognized is treated as {@link ChatMicrosoftAuthenticationMode.Never}.
 */
export function toChatMicrosoftAuthenticationMode(value: unknown): ChatMicrosoftAuthenticationMode {
	if (value === true || value === ChatMicrosoftAuthenticationMode.Always) {
		return ChatMicrosoftAuthenticationMode.Always;
	}
	if (value === ChatMicrosoftAuthenticationMode.Auto) {
		return ChatMicrosoftAuthenticationMode.Auto;
	}
	return ChatMicrosoftAuthenticationMode.Never;
}

export const ChatEditAutoApproveSettingId = 'chat.tools.edits.autoApprove';
export const ChatAgentFilesLocationsSettingId = 'chat.agentFilesLocations';
export const ChatHookFilesLocationsSettingId = 'chat.hookFilesLocations';

export type ChatEditAutoApprovePatterns = Readonly<Record<string, boolean>>;

export interface IChatSensitiveEditLocation {
	readonly path: string;
	readonly isDirectory: boolean;
}

export const CHAT_CUSTOMIZATION_LOCATION_PATTERN = '^(?![A-Za-z]:[\\\\/])(?!/)(?!~(?!/))(?!.*\\\\)(?!.*[*?\\[\\]{}]).*\\S.*$';
const CHAT_CUSTOMIZATION_LOCATION_REGEX = new RegExp(CHAT_CUSTOMIZATION_LOCATION_PATTERN);

export function isValidChatCustomizationLocation(path: string): boolean {
	return CHAT_CUSTOMIZATION_LOCATION_REGEX.test(path);
}

function isEnabledChatCustomizationLocation(value: unknown): boolean {
	return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

function addSensitiveEditLocations(locations: Map<string, IChatSensitiveEditLocation>, configuredLocations: unknown, forceDirectory: boolean): void {
	if (typeof configuredLocations !== 'object' || configuredLocations === null || Array.isArray(configuredLocations)) {
		return;
	}

	for (const [rawPath, enabled] of Object.entries(configuredLocations)) {
		const trimmedPath = rawPath.trim();
		if (!isEnabledChatCustomizationLocation(enabled) || trimmedPath.startsWith('~/') || !isValidChatCustomizationLocation(trimmedPath)) {
			continue;
		}

		const withoutCurrentDirectory = trimmedPath.replace(/^(?:\.\/)+/, '');
		const normalizedPath = withoutCurrentDirectory.replace(/\/+$/, '') || '.';
		const isDirectory = forceDirectory || !normalizedPath.toLowerCase().endsWith('.json');
		const existing = locations.get(normalizedPath);
		locations.set(normalizedPath, {
			path: normalizedPath,
			isDirectory: isDirectory || existing?.isDirectory === true,
		});
	}
}

export function getChatSensitiveEditLocations(hookLocations: unknown, agentLocations: unknown): readonly IChatSensitiveEditLocation[] {
	const locations = new Map<string, IChatSensitiveEditLocation>();
	addSensitiveEditLocations(locations, hookLocations, false);
	addSensitiveEditLocations(locations, agentLocations, true);
	return [...locations.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : Number(b.isDirectory) - Number(a.isDirectory));
}

export function mergeChatSensitiveEditLocations(...locationSets: readonly (readonly IChatSensitiveEditLocation[])[]): readonly IChatSensitiveEditLocation[] {
	const locations = new Map<string, IChatSensitiveEditLocation>();
	for (const locationSet of locationSets) {
		for (const location of locationSet) {
			const existing = locations.get(location.path);
			locations.set(location.path, {
				path: location.path,
				isDirectory: location.isDirectory || existing?.isDirectory === true,
			});
		}
	}
	return [...locations.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : Number(b.isDirectory) - Number(a.isDirectory));
}

export const enum ChatExternalSessionsMode {
	Recent = 'recent',
	None = 'none',
	Last24Hours = 'last24Hours',
	Last7Days = 'last7Days',
	Last30Days = 'last30Days',
}

/** Edit paths whose executable side effects require confirmation regardless of user configuration. */
export const ALWAYS_CHECKED_EDIT_PATTERNS: ChatEditAutoApprovePatterns = {
	'**/.mcp.json': false,
	'**/.npmrc': false,
	'**/.vscode/*.json': false,
	'**/.github/agents/**': false,
	'**/.github/hooks/**': false,
	'**/.claude/agents/**': false,
	'**/.claude/settings.json': false,
	'**/.claude/settings.local.json': false,
	'**/.codex/agents/**': false,
	'**/.codex/config.toml': false,
	'**/.codex/hooks.json': false,
};

export const DEFAULT_EDIT_AUTO_APPROVE_PATTERNS: ChatEditAutoApprovePatterns = {
	'**/*': true,
	'**/.git/**': false,
	'**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env,Cargo.toml}': false,
	'**/{.npmrc,.yarnrc,.yarnrc.yml,.pnpmfile.js,.pnpmfile.cjs,.pnpmfile.mjs,pnpm-workspace.yaml}': false,
	'**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props,gradle,gradle.kts}': false,
	'**/gradle.properties': false,
	'**/ruby_lsp/*/addon': false,
	'**/*.lock': false,
	'**/*-lock.{yaml,json}': false,
	...ALWAYS_CHECKED_EDIT_PATTERNS,
};

export function mergeChatEditAutoApprovePatterns(value: unknown): ChatEditAutoApprovePatterns {
	const patterns: Record<string, boolean> = { ...DEFAULT_EDIT_AUTO_APPROVE_PATTERNS };
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return patterns;
	}
	for (const [pattern, isApproved] of Object.entries(value)) {
		// Re-inserting moves an overridden default to the end so the configured
		// order keeps deciding which pattern matches last.
		delete patterns[pattern];
		patterns[pattern] = isApproved === true;
	}
	return patterns;
}
