/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ModelSelection } from './state/sessionState.js';
import { JsonPrimitive } from './state/protocol/state.js';

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value)
		&& (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isPrimitive(value: unknown): value is JsonPrimitive {
	return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

export function parseAgentHostModelSelection(value: unknown, messages = {
	selection: localize('agentHost.invalidModelSelection', "Invalid model selection."),
	configuration: localize('agentHost.invalidModelConfiguration', "Invalid model configuration."),
}): ModelSelection {
	if (!isPlainRecord(value) || Object.keys(value).some(key => key !== 'id' && key !== 'config')
		|| typeof value.id !== 'string' || !value.id.trim() || value.id.includes('\0')) {
		throw new Error(messages.selection);
	}
	if (value.config === undefined) {
		return { id: value.id };
	}
	if (!isPlainRecord(value.config)) {
		throw new Error(messages.configuration);
	}
	const config: NonNullable<ModelSelection['config']> = {};
	for (const [key, setting] of Object.entries(value.config)) {
		if (!key || ['__proto__', 'prototype', 'constructor'].includes(key) || !isPrimitive(setting)) {
			throw new Error(messages.configuration);
		}
		config[key] = setting;
	}
	return { id: value.id, config };
}
