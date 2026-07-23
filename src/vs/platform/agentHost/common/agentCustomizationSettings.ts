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

export function getAgentCustomizationSettingsEntries(state: RootState | undefined): readonly IAgentCustomizationSettingsDescriptor[] {
	const meta = state?._meta;
	const value = meta?.[AGENT_CUSTOMIZATION_SETTINGS_META_KEY];
	return Array.isArray(value) ? value.filter((entry): entry is IAgentCustomizationSettingsDescriptor => !!entry && typeof entry === 'object' && typeof (entry as Partial<IAgentCustomizationSettingsDescriptor>).provider === 'string') : [];
}

export function withAgentCustomizationSettings(state: RootState | undefined, entries: readonly IAgentCustomizationSettingsDescriptor[]): Record<string, unknown> {
	return { ...state?._meta, [AGENT_CUSTOMIZATION_SETTINGS_META_KEY]: entries };
}

export function readAgentCustomizationSettings(state: RootState | undefined, provider: string): IAgentCustomizationSettingsDescriptor | undefined {
	return getAgentCustomizationSettingsEntries(state).find(entry => entry.provider === provider && typeof entry.title === 'string' && typeof entry.description === 'string' && Array.isArray(entry.settings));
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
