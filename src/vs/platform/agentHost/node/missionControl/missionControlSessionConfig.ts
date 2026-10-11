/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getSessionApprovalProperty } from '../../common/sessionConfigProperties.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { SessionConfigState } from '../../common/state/sessionState.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';

const approvalModeKey = 'approvalMode';
const approvalValues = ['manual', 'assisted', 'allow-all'];

function toApprovalMode<T>(value: T): T | 'manual' | 'allow-all' {
	return value === 'default' ? 'manual' : value === 'autoApprove' ? 'allow-all' : value;
}

/** Translates the native approval preference without changing the independent agent mode. */
export function toMissionControlConfigValues(values: Record<string, unknown>): Record<string, unknown> {
	if (!Object.hasOwn(values, SessionConfigKey.AutoApprove)) {
		return values;
	}
	const { [SessionConfigKey.AutoApprove]: autoApprove, ...rest } = values;
	return { ...rest, [approvalModeKey]: toApprovalMode(autoApprove) };
}

export function fromMissionControlConfigValues(values: Record<string, unknown>): Record<string, unknown>;
export function fromMissionControlConfigValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
export function fromMissionControlConfigValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
	if (!values || !Object.hasOwn(values, approvalModeKey)) {
		return values;
	}
	const value = values[approvalModeKey];
	if (typeof value !== 'string' || !approvalValues.includes(value)) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'approvalMode must be one of manual, assisted, allow-all');
	}
	const autoApprove = value === 'manual' ? 'default' : value === 'allow-all' ? 'autoApprove' : value;
	if (Object.hasOwn(values, SessionConfigKey.AutoApprove) && values[SessionConfigKey.AutoApprove] !== autoApprove) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'approvalMode and autoApprove must select the same approval behavior');
	}
	const { [approvalModeKey]: _approvalMode, ...rest } = values;
	return { ...rest, [SessionConfigKey.AutoApprove]: autoApprove };
}

/** Publishes the Copilot Host approvals vocabulary for native VS Code approval schemas. */
export function toMissionControlSessionConfig(config: SessionConfigState): SessionConfigState {
	const approval = getSessionApprovalProperty(config.schema);
	if (approval?.key !== SessionConfigKey.AutoApprove) {
		return config;
	}
	const { [SessionConfigKey.AutoApprove]: _autoApprove, ...properties } = config.schema.properties;
	const options = (approval.schema.enum ?? []).map((value, index) => ({ value: toApprovalMode(value), index }))
		.filter(option => typeof option.value === 'string' && approvalValues.includes(option.value));
	const labels = approval.schema.enumLabels;
	const descriptions = approval.schema.enumDescriptions;
	return {
		schema: {
			...config.schema,
			properties: {
				...properties,
				[approvalModeKey]: {
					...approval.schema,
					enum: options.map(option => option.value),
					...(approval.schema.default !== undefined ? { default: toApprovalMode(approval.schema.default) } : {}),
					...(labels ? { enumLabels: options.map(option => labels[option.index]) } : {}),
					...(descriptions ? { enumDescriptions: options.map(option => descriptions[option.index]) } : {}),
				},
			},
			...(config.schema.required ? { required: config.schema.required.map(key => key === SessionConfigKey.AutoApprove ? approvalModeKey : key) } : {}),
		},
		values: toMissionControlConfigValues(config.values),
	};
}
