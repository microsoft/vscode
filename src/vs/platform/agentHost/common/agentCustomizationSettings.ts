/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigPropertySchema, RootState } from './state/protocol/state.js';

export const AGENT_CUSTOMIZATION_SETTINGS_META_KEY = 'vscode.agentCustomizationSettings';

export interface IAgentCustomizationSettingDescriptor {
	readonly key: string;
	readonly group: string;
	readonly kind?: 'multiline';
	readonly saveLabel?: string;
}

export interface IAgentCustomizationSettingsDescriptor {
	readonly provider: string;
	readonly title: string;
	readonly description: string;
	readonly settings: readonly IAgentCustomizationSettingDescriptor[];
	readonly configurationFile?: {
		readonly resource: string;
		readonly title: string;
		readonly description: string;
		readonly openLabel: string;
		readonly documentationUrl?: string;
		readonly documentationLabel?: string;
	};
}

export interface IAgentCustomizationSettingsRegistration extends IAgentCustomizationSettingsDescriptor {
	readonly properties: Readonly<Record<string, ConfigPropertySchema>>;
}

function isAgentCustomizationSettingDescriptor(value: unknown): value is IAgentCustomizationSettingDescriptor {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const setting = value as Partial<IAgentCustomizationSettingDescriptor>;
	return typeof setting.key === 'string'
		&& typeof setting.group === 'string'
		&& (setting.kind === undefined || setting.kind === 'multiline')
		&& (setting.saveLabel === undefined || typeof setting.saveLabel === 'string');
}

function isAgentCustomizationSettingsDescriptor(value: unknown): value is IAgentCustomizationSettingsDescriptor {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const entry = value as Partial<IAgentCustomizationSettingsDescriptor>;
	if (typeof entry.provider !== 'string' || typeof entry.title !== 'string' || typeof entry.description !== 'string' || !Array.isArray(entry.settings) || !entry.settings.every(isAgentCustomizationSettingDescriptor)) {
		return false;
	}
	const file = entry.configurationFile;
	return file === undefined || (!!file
		&& typeof file.resource === 'string'
		&& typeof file.title === 'string'
		&& typeof file.description === 'string'
		&& typeof file.openLabel === 'string'
		&& (file.documentationUrl === undefined || typeof file.documentationUrl === 'string')
		&& (file.documentationLabel === undefined || typeof file.documentationLabel === 'string'));
}

export function getAgentCustomizationSettingsEntries(state: RootState | undefined): readonly IAgentCustomizationSettingsDescriptor[] {
	const meta = state?._meta;
	const value = meta?.[AGENT_CUSTOMIZATION_SETTINGS_META_KEY];
	return Array.isArray(value) ? value.filter(isAgentCustomizationSettingsDescriptor) : [];
}

export function withAgentCustomizationSettings(state: RootState | undefined, entries: readonly IAgentCustomizationSettingsDescriptor[]): Record<string, unknown> {
	return { ...state?._meta, [AGENT_CUSTOMIZATION_SETTINGS_META_KEY]: entries };
}

export function readAgentCustomizationSettings(state: RootState | undefined, provider: string): IAgentCustomizationSettingsDescriptor | undefined {
	return getAgentCustomizationSettingsEntries(state).find(entry => entry.provider === provider);
}

export function getProviderBackedRootConfigKeys(state: RootState | undefined): ReadonlySet<string> {
	return new Set(getAgentCustomizationSettingsEntries(state).flatMap(entry => entry.settings.map(setting => setting.key)));
}

export function preserveProviderBackedRootConfigValues(state: RootState | undefined, replacement: Readonly<Record<string, unknown>>): Record<string, unknown> {
	const values = { ...replacement };
	const current = state?.config?.values;
	if (!current) {
		return values;
	}

	for (const key of getProviderBackedRootConfigKeys(state)) {
		if (!Object.hasOwn(values, key) && Object.hasOwn(current, key)) {
			values[key] = current[key];
		}
	}
	return values;
}
