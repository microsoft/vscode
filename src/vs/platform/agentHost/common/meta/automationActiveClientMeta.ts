/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationType, type ClientPluginCustomization, type SessionActiveClient } from '../state/protocol/state.js';

const AUTOMATION_ACTIVE_CLIENT_META_KEY = 'vscode.automationActiveClient';

interface IAutomationActiveClientMeta {
	readonly version: 1;
	readonly activeClient: SessionActiveClient;
}

export function readAutomationActiveClient(meta: Record<string, unknown> | undefined): SessionActiveClient | undefined {
	const value = meta?.[AUTOMATION_ACTIVE_CLIENT_META_KEY];
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.activeClient)) {
		throw new Error('Invalid Automation active client metadata.');
	}
	const activeClient = value.activeClient;
	if (typeof activeClient.clientId !== 'string'
		|| (activeClient.displayName !== undefined && typeof activeClient.displayName !== 'string')
		|| !Array.isArray(activeClient.tools)
		|| activeClient.tools.length !== 0
		|| (activeClient.customizations !== undefined && !Array.isArray(activeClient.customizations))) {
		throw new Error('Invalid Automation active client metadata.');
	}
	const customizations = activeClient.customizations?.map(readClientPluginCustomization);
	return {
		clientId: activeClient.clientId,
		...(activeClient.displayName !== undefined ? { displayName: activeClient.displayName } : {}),
		tools: [],
		customizations,
	};
}

export function withAutomationActiveClient(meta: Record<string, unknown> | undefined, activeClient: SessionActiveClient | undefined): Record<string, unknown> | undefined {
	const result = { ...meta };
	if (activeClient) {
		result[AUTOMATION_ACTIVE_CLIENT_META_KEY] = {
			version: 1,
			activeClient,
		} satisfies IAutomationActiveClientMeta;
	} else {
		delete result[AUTOMATION_ACTIVE_CLIENT_META_KEY];
	}
	return Object.keys(result).length > 0 ? removeUndefinedProperties(result) : undefined;
}

function readClientPluginCustomization(value: unknown): ClientPluginCustomization {
	if (!isRecord(value)
		|| value.type !== CustomizationType.Plugin
		|| typeof value.id !== 'string'
		|| typeof value.uri !== 'string'
		|| typeof value.name !== 'string'
		|| (value.nonce !== undefined && typeof value.nonce !== 'string')) {
		throw new Error('Invalid Automation client customization metadata.');
	}
	return {
		...value,
		type: CustomizationType.Plugin,
		id: value.id,
		uri: value.uri,
		name: value.name,
		...(value.nonce !== undefined ? { nonce: value.nonce } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function removeUndefinedProperties(value: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (child !== undefined) {
			result[key] = removeUndefinedValue(child);
		}
	}
	return result;
}

function removeUndefinedValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(item => item === undefined ? null : removeUndefinedValue(item));
	}
	return isRecord(value) ? removeUndefinedProperties(value) : value;
}
